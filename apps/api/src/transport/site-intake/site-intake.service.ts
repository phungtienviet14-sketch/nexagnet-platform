import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { MovementService } from '../movement/movement.service.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  DEFAULT_SITE_CANDIDATE_POLICY,
  resolveSiteCandidates,
  type SiteCandidate,
  type SiteCandidateOutcome,
  type SiteCandidatePolicy,
} from './site-candidate.js';
import {
  TRANSPORT_SITE_INTAKE_DECISIONS,
  type SiteIntakeConfirmReason,
  type SiteIntakeProposeReason,
} from './site-intake-decisions.js';
import {
  TransportSiteIntakeCoreFacts,
  TransportSiteIntakeGeoFacts,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
  type SiteIntakeSiteFacts,
} from './site-intake-facts.port.js';
import {
  RunSiteIntakeRepository,
  SITE_INTAKE_DRIVER_EVENT,
  SITE_INTAKE_OBSERVATION_ONCE,
} from './site-intake.repository.js';
import {
  PENDING_DESTINATION_LABEL,
  type ConfirmSiteIntakeCommand,
  type ProposeSiteIntakeCommand,
  type SiteCandidateView,
  type RunSiteIntake,
  type SiteIntakeLocationTrust,
  type SiteIntakeProposal,
  type SiteIntakeResult,
} from './site-intake.types.js';

export const TRANSPORT_SITE_INTAKE_POLICY = Symbol('TRANSPORT_SITE_INTAKE_POLICY');

/** Vi tri da giai — hoac tu mot ban dinh vi cua Lane B, hoac tu cap so may khach gui len. */
interface ResolvedLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number | null;
  readonly observedAt: Date;
  readonly trust: SiteIntakeLocationTrust;
  readonly observation: SiteIntakeObservationFacts | null;
}

/**
 * NHAN VIEC TAI DIA DIEM A — `#267` H2/H3/H4.
 *
 * ============================================================================================
 * MOT BAT BIEN, VA MOI THU KHAC LA HE QUA CUA NO
 * ============================================================================================
 *
 * `#267` mo dau bang: *"No trip/run may be silently auto-created solely because a device entered a
 * geofence."* Ca lop nay duoc chia doi theo dung cau do:
 *
 *   · `propose()` DOC. No khong ghi mot hang nao — khong vong chay, khong chang, khong moc, khong
 *     ban dinh vi. Goi no mot nghin lan cung khong lam thay doi mot dong du lieu nao.
 *   · `confirm()` GHI, va no chi chay khi co mot `siteId` do NGUOI chon kem mot khoa chong lap.
 *
 * Khong co duong thu ba, va khong co nhanh nao trong `propose()` re sang `confirm()`.
 *
 * ============================================================================================
 * VI TRI DE NGHI, CON CON NGUOI QUYET DINH — nen mot lan xac nhan KHONG doi chung cu vi tri
 * ============================================================================================
 *
 * Day la cho de hieu nham, nen ghi ro. Lai xe dung o cong nha may, trong nha xuong, mai ton, dinh
 * vi 400 m hoac chua bat. Neu bat mot ban dinh vi hop le lam DIEU KIEN de tao vong chay thi ung
 * dung se tu choi lam viec dung luc no can lam nhat, va lai xe se lam bang giay nhu cu.
 *
 * Nen thu cho phep tao la CHAM CUA CON NGUOI. Vi tri lam dung mot viec: rut danh sach kho tu
 * "toan bo khach hang cua B" xuong con "cai kho ban dang dung truoc" — va khi no khong lam duoc
 * viec do, lai xe van chon tay.
 *
 * Cai KHONG duoc phep — va `#267` H7 viet dung chu do — la mot cap toa do THO di vao cho ma he
 * thong doi mot BANG CHUNG. Lop nay khong sinh ra `TransportLocationObservation`, khong ghi
 * `TransportRunCheckpoint`, khong ghi `TransportOperationalProof`. Ba bang do la cua Lane B/F, va
 * duong vao chung van doi dung nhung gi chung von doi. Cai lop nay ghi la mot hang RIENG mang
 * nhan `locationTrust`, va nhan do noi that ve chinh no.
 *
 * ============================================================================================
 * KHONG MOT TRUONG TIEN NAO — `#267` H4
 * ============================================================================================
 *
 * Vong chay tao ra o day khong co `freightAmount`, khong co `TransportOrder`, khong co dieu khoan
 * thanh toan, khong co hoa hong. `TransportRunLeg.orderId` la `NULL` — mot trang thai ma Lane A
 * viet ro la HOP LE (*"a loaded leg MAY reference an Order"*). Van phong noi tiep phan thuong mai
 * khi ho biet no; cho toi luc do he thong noi "chua biet" thay vi noi "khong dong".
 */
@Injectable()
export class SiteIntakeService {
  constructor(
    private readonly intakes: RunSiteIntakeRepository,
    private readonly core: TransportSiteIntakeCoreFacts,
    private readonly geo: TransportSiteIntakeGeoFacts,
    private readonly location: TransportSiteIntakeLocationFacts,
    private readonly movement: MovementService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional()
    @Inject(TRANSPORT_SITE_INTAKE_POLICY)
    private readonly policy: SiteCandidatePolicy = DEFAULT_SITE_CANDIDATE_POLICY,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* ------------------------------------------------------------------ *
   * DOC — khong ghi mot hang nao
   * ------------------------------------------------------------------ */

  async propose(command: ProposeSiteIntakeCommand): Promise<SiteIntakeProposal> {
    const driver = await this.requireDriver(command.authUserId, 'site_intake.propose');
    const openRuns = await this.core.listOpenRunsForDriver(driver.id);

    const located = await this.resolveLocation(command, driver.id);
    if (located === null) {
      // Khong gui vi tri nao ca. Khong phai loi: man hinh se hoi lai xe chon tay.
      return this.proposalOf('NO_MATCH', null, [], false, 'DRIVER_REPORTED', openRuns);
    }

    const outcome = await this.assess(located);
    const candidates = await this.describe(candidatesOf(outcome));

    if (openRuns.length > 0) {
      this.decide('site_intake.propose', 'denied', 'SITE_PROPOSAL_OPEN_RUN_EXISTS', {
        driverId: driver.id,
        openRunIds: openRuns.map((run) => run.runId),
      });
    } else {
      this.decide('site_intake.propose', 'allowed', proposeReasonOf(outcome), {
        driverId: driver.id,
        candidateCount: candidates.length,
        locationTrust: located.trust,
      });
    }

    return this.proposalOf(
      outcome.kind,
      outcome.kind === 'LOCATION_UNUSABLE' ? outcome.reason : null,
      candidates,
      outcome.kind === 'AMBIGUOUS' ? outcome.truncated : false,
      located.trust,
      openRuns,
    );
  }

  /* ------------------------------------------------------------------ *
   * GHI — chi sau mot cham cua con nguoi
   * ------------------------------------------------------------------ */

  async confirm(command: ConfirmSiteIntakeCommand): Promise<SiteIntakeResult> {
    const driver = await this.requireDriver(command.authUserId, 'site_intake.confirm');

    // GUI LAI TRUOC MOI PHEP KIEM KHAC. Mot lenh da thanh cong roi mat song tren duong ve phai
    // tra ve dung ket qua cu — ke ca khi chinh no da lam moi phep kiem ben duoi thanh "khong con
    // dung nua" (vong chay vua tao BAY GIO la mot vong chay dang mo). Doc sau se tu choi mot lan
    // gui lai hop le bang chinh hau qua cua no.
    const replayed = await this.intakes.findByEvent(driver.id, command.clientEventId);
    if (replayed) {
      this.decide('site_intake.confirm', 'allowed', 'SITE_INTAKE_REPLAYED', {
        intakeId: replayed.id,
        runId: replayed.runId,
      });
      return await this.resultOf(replayed, await this.requireSite(replayed.siteId), true);
    }

    const site = await this.requireSite(command.siteId);

    const openRuns = await this.core.listOpenRunsForDriver(driver.id);
    if (openRuns.length > 0) {
      this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_OPEN_RUN_EXISTS', {
        driverId: driver.id,
        openRunIds: openRuns.map((run) => run.runId),
      });
      throw TransportDomainError.conflict(
        'SITE_INTAKE_OPEN_RUN_EXISTS',
        `Ban dang co chuyen ${openRuns.map((run) => run.code).join(', ')} chua ket thuc — ghi nhan vao chuyen do`,
      );
    }

    const vehicleId = await this.core.activeVehicleForDriver(driver.id);
    if (vehicleId === null) {
      this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_NO_ASSIGNED_VEHICLE', {
        driverId: driver.id,
      });
      throw TransportDomainError.invalid(
        'SITE_INTAKE_NO_ASSIGNED_VEHICLE',
        'Ban chua duoc giao xe nao — bao dieu do de nhan xe truoc',
      );
    }

    const located = await this.resolveLocation(command, driver.id);
    const distanceMetres = await this.checkSiteAgainstLocation(command.siteId, located);

    const confirmedAt = this.now();
    const businessDate = toBusinessDate(confirmedAt, this.corePolicy.timeZone);
    const actor = command.authUserId;

    // BA LAN GHI, QUA DICH VU DA DUOC CHAP NHAN CUA LANE A.
    //
    // `#267` H4 doi *"create or reuse accepted VehicleRun/RunLeg primitives"*, va cach dung la goi
    // `MovementService` — no giu ma trang thai, dau vet kiem toan va quy uoc ngay nghiep vu. Ghi
    // thang vao `MovementRepository` se bo qua ca ba.
    let run;
    try {
      run = await this.movement.createRun(
        {
          code: runCodeFor(businessDate, driver.id, command.clientEventId),
          vehicleId,
          businessDate,
          note: null,
        },
        actor,
      );
    } catch (error) {
      // HAI YEU CAU CUA CUNG MOT CHAM, den cung luc.
      //
      // Ca hai qua duoc phep doc chong lap o dau ham (ban kia chua commit). Nhung ma vong chay la
      // mot BAM TAT DINH tu `(driverId, clientEventId)`, nen unique cua `TransportVehicleRun.code`
      // chan yeu cau thu hai NGAY O LAN GHI DAU — truoc khi no kip tao mot chang hay mot ban phan
      // cong nao. Khong co vong chay mo coi nao duoc de lai.
      if (!(error instanceof TransportDomainError) || error.reason !== 'RUN_CODE_TAKEN')
        throw error;

      const already = await this.intakes.findByEvent(driver.id, command.clientEventId);
      if (already) {
        this.decide('site_intake.confirm', 'allowed', 'SITE_INTAKE_REPLAYED', {
          intakeId: already.id,
          runId: already.runId,
        });
        return await this.resultOf(already, await this.requireSite(already.siteId), true);
      }

      // Ban kia da tao vong chay nhung CHUA ghi xong ban ghi xac nhan. Khong co gi de tra ve, va
      // doan la sai — nen noi that: thu lai voi DUNG khoa cu, va lan sau se thay ket qua cua ban kia.
      this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_CREATE_IN_FLIGHT', {
        driverId: driver.id,
        clientEventId: command.clientEventId,
      });
      throw TransportDomainError.conflict(
        'SITE_INTAKE_CREATE_IN_FLIGHT',
        'Lan bam nay dang duoc xu ly — thu lai sau mot lat',
      );
    }
    await this.movement.assignRun(run.id, { driverId: driver.id }, actor);
    const leg = await this.movement.addLeg(
      run.id,
      {
        sequence: 1,
        // `LOADED` kem `orderId` NULL la trang thai ma Lane A viet ro la hop le: *"dang cho hang
        // nhung don chua nhap xong"*. `EMPTY` se noi sai — lai xe den A de LAY HANG.
        kind: 'LOADED',
        orderId: null,
        originLabel: `${site.counterpartyName} — ${site.siteName}`,
        destinationLabel: command.destinationLabel ?? PENDING_DESTINATION_LABEL,
        businessDate,
        distanceKm: null,
        note: null,
      },
      actor,
    );

    try {
      const intake = await this.intakes.create({
        runId: run.id,
        legId: leg.id,
        siteId: site.siteId,
        driverId: driver.id,
        confirmedBy: actor,
        locationTrust: located?.trust ?? 'DRIVER_REPORTED',
        observationId: located?.observation?.id ?? null,
        distanceMetres,
        clientEventId: command.clientEventId,
        confirmedAt,
        businessDate,
      });
      this.decide('site_intake.confirm', 'allowed', 'SITE_INTAKE_CREATED', {
        intakeId: intake.id,
        runId: run.id,
        legId: leg.id,
        siteId: site.siteId,
        locationTrust: intake.locationTrust,
        destinationPending: command.destinationLabel === undefined,
      });
      return await this.resultOf(intake, site, false);
    } catch (error) {
      // HAI YEU CAU SONG SONG cua cung mot lan cham. Phep doc o dau ham khong thay ban kia vi no
      // chua commit; unique cua kho thi thay. Doc lai va tra ve — khong bao loi cho mot viec da
      // thanh cong. Vong chay thua cua lan nay bi bo lai o trang thai `PLANNED` va se bi don bang
      // duong huy binh thuong; khong lan nao trong hai lan tao ra mot vong chay THU HAI co chu.
      if (isUniqueViolationOn(error, SITE_INTAKE_DRIVER_EVENT)) {
        const already = await this.intakes.findByEvent(driver.id, command.clientEventId);
        if (already) {
          this.decide('site_intake.confirm', 'allowed', 'SITE_INTAKE_REPLAYED', {
            intakeId: already.id,
            runId: already.runId,
          });
          return await this.resultOf(already, await this.requireSite(already.siteId), true);
        }
      }
      if (isUniqueViolationOn(error, SITE_INTAKE_OBSERVATION_ONCE)) {
        this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_OBSERVATION_ALREADY_USED', {
          observationId: located?.observation?.id ?? null,
        });
        throw TransportDomainError.conflict(
          'SITE_INTAKE_OBSERVATION_ALREADY_USED',
          'Ban dinh vi do da duoc dung cho mot lan nhan viec khac',
        );
      }
      throw error;
    }
  }

  /** Lich su nhan viec CUA CHINH MINH — danh tinh tu phien, khong tu than yeu cau. */
  async listOwn(authUserId: string) {
    const driver = await this.requireDriver(authUserId, 'site_intake.propose');
    return this.intakes.listForDriver(driver.id);
  }

  /* ------------------------------------------------------------------ *
   * Noi bo
   * ------------------------------------------------------------------ */

  /**
   * BA NGUON VI TRI, theo dung thu tu uu tien, va `null` khi khong co nguon nao.
   *
   *   1. `observationId` — ban dinh vi cua Lane B. Manh nhat, va la thu duy nhat duoc goi la
   *      `SERVER_BOUND`. Phai thuoc ve CHINH lai xe dang goi.
   *   2. `latitude`/`longitude` — cap so may khach doc len. `DRIVER_REPORTED`.
   *   3. khong gi ca — lai xe se chon kho bang tay.
   *
   * Mot `observationId` KHONG TIM THAY hoac cua NGUOI KHAC la mot loi, khong phai mot lan lang le
   * ha xuong duong 2: gui mot ban dinh vi LA mot loi khai ve chung cu, va mot loi khai sai phai
   * dung lai o day.
   */
  private async resolveLocation(
    command: ProposeSiteIntakeCommand,
    driverId: string,
  ): Promise<ResolvedLocation | null> {
    if (command.observationId !== undefined) {
      const observation = await this.location.findObservation(command.observationId);
      if (!observation) {
        this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_OBSERVATION_NOT_FOUND', {
          observationId: command.observationId,
        });
        throw TransportDomainError.notFound(
          'SITE_INTAKE_OBSERVATION_NOT_FOUND',
          'Khong tim thay ban dinh vi',
        );
      }
      if (observation.driverId !== driverId) {
        // Muon vi tri dong nghiep lam bang chung cho chinh minh. Ghi dung ly do vao so quyet dinh
        // thay vi tra `NOT_FOUND` "cho khoi lo": ban ghi CO that, va mot lan do quyen truy cap
        // phai nhin ra duoc trong log.
        this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_OBSERVATION_NOT_OWNED', {
          observationId: observation.id,
          driverId,
        });
        throw TransportDomainError.denied(
          'SITE_INTAKE_OBSERVATION_NOT_OWNED',
          'Ban dinh vi do khong thuoc ve ban',
        );
      }
      return {
        latitude: observation.latitude,
        longitude: observation.longitude,
        accuracyMetres: observation.accuracyMetres,
        // TUOI LAY THEO DONG HO NOI BAN GHI CU HON.
        //
        // `capturedAt` la dong ho may khach; `receivedAt` la dong ho may chu. Mot hang doi ngoai
        // tuyen day len mot ban ghi bon tieng tuoi thi `capturedAt` noi that con `receivedAt` noi
        // "vua nhan"; mot ban ghi nam trong DB tu hom qua thi `receivedAt` noi that. Lay cai CU
        // HON lam moc tuc lay tuoi LON HON — mot cai chuong khong bi tat boi bat ky mot trong hai
        // dong ho nao.
        observedAt: new Date(
          Math.min(observation.capturedAt.getTime(), observation.receivedAt.getTime()),
        ),
        trust: 'SERVER_BOUND',
        observation,
      };
    }

    if (command.latitude === undefined || command.longitude === undefined) return null;

    return {
      latitude: command.latitude,
      longitude: command.longitude,
      accuracyMetres: command.accuracyMetres ?? null,
      // Cap so tho khong mang dau thoi gian rieng — no VUA duoc doc len. Dat `observedAt = now`
      // lam phep kiem tuoi thanh khong-op cho duong nay, va do la dung: phep kiem tuoi ton tai de
      // chan mot ban ghi CU trong hang doi ngoai tuyen cua Lane B, khong phai de doan gia mot cap
      // so vua gui.
      observedAt: this.now(),
      trust: 'DRIVER_REPORTED',
      observation: null,
    };
  }

  private async assess(located: ResolvedLocation): Promise<SiteCandidateOutcome> {
    return resolveSiteCandidates({
      point: { latitude: located.latitude, longitude: located.longitude },
      accuracyMetres: located.accuracyMetres,
      observedAt: located.observedAt,
      now: this.now(),
      fences: await this.geo.listActiveSiteFences(),
      policy: this.policy,
    });
  }

  /**
   * DIA DIEM DUOC CHON CO NAM QUANH VI TRI DA GUI KHONG.
   *
   * Tra ve khoang cach de ghi vao so, hoac `null` khi khong do duoc (khong gui vi tri nao).
   *
   * BA NHANH, va nhanh giua la cai quan trong:
   *
   *   · khong gui vi tri     -> khong kiem, khong khoang cach. Lai xe chon tay, va so ghi dung the.
   *   · gui vi tri KHONG dung duoc -> TU CHOI. `#267` H7: mot vi tri qua han khong duoc *"silently"*
   *     tao/gan mot lan lay hang. Ha xuong "coi nhu khong gui" chinh la cai "silently" do.
   *   · gui vi tri dung duoc -> dia diem chon PHAI nam trong so ung vien cua chinh vi tri do.
   */
  private async checkSiteAgainstLocation(
    siteId: string,
    located: ResolvedLocation | null,
  ): Promise<number | null> {
    if (located === null) return null;

    const outcome = await this.assess(located);
    if (outcome.kind === 'LOCATION_UNUSABLE') {
      this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_LOCATION_UNUSABLE', {
        reason: outcome.reason,
      });
      throw TransportDomainError.invalid(
        'SITE_INTAKE_LOCATION_UNUSABLE',
        `Vi tri gui len khong dung duoc (${outcome.reason}) — thu lai khi co dinh vi, hoac chon dia diem ma khong kem vi tri`,
      );
    }

    const match = candidatesOf(outcome).find((candidate) => candidate.siteId === siteId);
    if (!match) {
      this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_SITE_NOT_A_CANDIDATE', { siteId });
      throw TransportDomainError.denied(
        'SITE_INTAKE_SITE_NOT_A_CANDIDATE',
        'Dia diem ban chon khong nam quanh vi tri vua gui len',
      );
    }
    return Math.round(match.distanceMetres);
  }

  private async describe(
    candidates: readonly SiteCandidate[],
  ): Promise<readonly SiteCandidateView[]> {
    if (candidates.length === 0) return [];
    const sites = await this.core.findActiveSites(candidates.map((entry) => entry.siteId));
    return candidates.flatMap((candidate): SiteCandidateView[] => {
      const site = sites.get(candidate.siteId);
      // Hang rao tro toi mot dia diem da nghi hoac khong con — BO QUA. Mot the "Ban dang o ???"
      // te hon mot the khong hien ra.
      if (!site) return [];
      return [
        {
          siteId: site.siteId,
          siteName: site.siteName,
          address: site.address,
          counterpartyId: site.counterpartyId,
          counterpartyName: site.counterpartyName,
          distanceMetres: Math.round(candidate.distanceMetres),
          confidence: candidate.confidence,
        },
      ];
    });
  }

  private proposalOf(
    outcome: SiteIntakeProposal['outcome'],
    locationUnusable: SiteIntakeProposal['locationUnusable'],
    candidates: readonly SiteCandidateView[],
    truncated: boolean,
    locationTrust: SiteIntakeLocationTrust,
    openRuns: SiteIntakeProposal['openRuns'],
  ): SiteIntakeProposal {
    return {
      outcome,
      locationUnusable,
      candidates,
      truncated,
      locationTrust,
      openRuns,
      // `#267` H3: co vong chay dang mo thi man hinh hien `Ghi nhan da den`, khong hien `Tao chuyen`.
      canCreate: openRuns.length === 0 && candidates.length > 0,
    };
  }

  /**
   * KHUNG NHIN KET QUA — doc ma vong chay va nhan diem den TU CHINH DU LIEU DA GHI.
   *
   * Khong nhan chung qua tham so tu duong tao, va do la co y: duong GUI LAI khong co hai gia tri
   * do trong tay, nen mot chu ky nhan chung se buoc duong do phai doan. Doc lai la mot lan cham DB
   * them cho mot thao tac xay ra vai lan mot ngay, va doi lai la hai duong tra ve DUNG cung mot
   * hinh dang tu cung mot nguon.
   */
  private async resultOf(
    intake: RunSiteIntake,
    site: SiteIntakeSiteFacts,
    replayed: boolean,
  ): Promise<SiteIntakeResult> {
    const detail = await this.movement.getRun(intake.runId);
    const leg = detail.legs.find((entry) => entry.id === intake.legId);
    return {
      intakeId: intake.id,
      runId: intake.runId,
      runCode: detail.run.code,
      legId: intake.legId,
      siteId: site.siteId,
      siteName: site.siteName,
      counterpartyName: site.counterpartyName,
      locationTrust: intake.locationTrust,
      distanceMetres: intake.distanceMetres,
      // Doc tu CHINH cot, khong tu mot co truyen vao: mot lan sua diem den o van phong phai lam
      // nhan nay tat di, va no se tat di ma khong ai phai nho sua o day.
      destinationPending: leg?.destinationLabel === PENDING_DESTINATION_LABEL,
      businessDate: intake.businessDate,
      replayed,
    };
  }

  private async requireDriver(
    authUserId: string,
    point: 'site_intake.propose' | 'site_intake.confirm',
  ) {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.decide(point, 'denied', 'SITE_INTAKE_DRIVER_BINDING_MISSING', { authUserId });
      throw TransportDomainError.denied(
        'SITE_INTAKE_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }
    return driver;
  }

  private async requireSite(siteId: string): Promise<SiteIntakeSiteFacts> {
    const site = await this.core.findActiveSite(siteId);
    if (!site) {
      // MOT ma cho ca "khong co that" lan "da nghi", va do la co y: hai cau tra loi rieng se cho
      // mot nguoi go bua `siteId` biet cai nao CO TON TAI. `#267` H7 doi *"Unknown versus foreign
      // IDs do not create useful enumeration"*.
      this.decide('site_intake.confirm', 'denied', 'SITE_INTAKE_SITE_NOT_FOUND', { siteId });
      throw TransportDomainError.notFound(
        'SITE_INTAKE_SITE_NOT_FOUND',
        'Khong tim thay dia diem van hanh dang hoat dong nao mang ma do',
      );
    }
    return site;
  }

  private decide(
    point: 'site_intake.propose' | 'site_intake.confirm',
    outcome: 'allowed' | 'denied',
    reason: SiteIntakeProposeReason | SiteIntakeConfirmReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SITE_INTAKE_DECISIONS,
      point,
      outcome,
      reason,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

const candidatesOf = (outcome: SiteCandidateOutcome): readonly SiteCandidate[] => {
  if (outcome.kind === 'UNIQUE') return [outcome.candidate];
  if (outcome.kind === 'AMBIGUOUS') return outcome.candidates;
  return [];
};

const proposeReasonOf = (outcome: SiteCandidateOutcome): SiteIntakeProposeReason => {
  switch (outcome.kind) {
    case 'UNIQUE':
      return 'SITE_PROPOSAL_UNIQUE';
    case 'AMBIGUOUS':
      return 'SITE_PROPOSAL_AMBIGUOUS';
    case 'NO_MATCH':
      return 'SITE_PROPOSAL_NO_MATCH';
    default:
      return 'SITE_PROPOSAL_LOCATION_UNUSABLE';
  }
};

/**
 * MA VONG CHAY do MAY CHU sinh — `#267` H4 *"server-managed identity"*.
 *
 * `A` o dau phan ngay la mot nhan doc duoc: van hanh nhin ma la biet vong chay nay ra doi tu mot
 * lan lai xe xac nhan tai dia diem A, khong tu mot lan dieu xe o van phong.
 *
 * ============================================================================================
 * PHAN DUOI LA MOT BAM TAT DINH, KHONG PHAI SO NGAU NHIEN — VA DO LA MOT CONG CHAN TRUNG
 * ============================================================================================
 *
 * Ban dau day la sau ky tu ngau nhien. Voi mot khoa `clientEventId` da bi cham hai lan, no de lai
 * mot lo hong hep nhung that: hai yeu cau den CUNG LUC deu qua duoc phep doc chong lap o dau ham
 * (ban kia chua commit), roi CA HAI tao mot vong chay, va chi lan ghi `TransportRunSiteIntake` thu
 * hai moi dung o unique. Ket qua: mot vong chay MO COI khong co ban ghi xac nhan nao — dung dieu
 * ma `#267` H3 (*"double tap ... cannot create two Runs"*) cam.
 *
 * Bam tat dinh tu `(driverId, clientEventId)` dua cong chan trung LEN lan ghi DAU TIEN: unique cua
 * `TransportVehicleRun.code` chan ngay yeu cau thu hai, truoc khi no kip tao gi. Mot khoa cham,
 * mot vong chay — o moi thu tu den.
 *
 * `sha256` chu khong phai noi chuoi tho: `clientEventId` do may khach sinh va di vao mot ma ma
 * nguoi khac doc duoc tren bang dieu hanh. Bam cat duong doc nguoc do ma khong doi gi ve tinh tat
 * dinh.
 */
function runCodeFor(businessDate: string, driverId: string, clientEventId: string): string {
  const compact = businessDate.replaceAll('-', '').slice(2);
  const digest = createHash('sha256')
    // DAI TRUOC, ROI NOI DUNG. Noi hai chuoi bang mot dau phan cach bat ky van nhap nhang khi
    // `clientEventId` chua chinh dau do; tien to do dai thi khong co cach nao nhap nhang.
    .update(`${driverId.length}:${driverId}:${clientEventId}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `RUN-A${compact}-${digest}`;
}
