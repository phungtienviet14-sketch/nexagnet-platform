import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import type { GeoPoint } from '../geo/geo-point.js';
import { greatCircleMetres } from '../geo/geodesy.js';
import { evaluateOrderCancel } from '../movement/movement-lifecycle.js';
import type { Order } from '../movement/movement.types.js';
import type { KnownPlace } from '../places/place-search.types.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  ORDER_ORIGIN_TOLERANCE_METRES,
  decideException,
  evaluateCommercialReadiness,
  evaluateOrderBinding,
  hasMovementStarted,
  matchOrderOrigin,
  siteIntakeOrderCode,
  siteIntakePlanKey,
  type CommercialReadiness,
  type SiteIntakeBindingDenyReason,
} from './commercial-readiness.js';
import {
  TRANSPORT_SITE_INTAKE_DECISIONS,
  type SiteIntakeCommercialReason,
  type SiteIntakeExceptionReason,
} from './site-intake-decisions.js';
import {
  TransportSiteIntakeCoreFacts,
  TransportSiteIntakeGeoFacts,
} from './site-intake-facts.port.js';
import { SiteIntakeReadinessReader } from './site-intake-readiness.reader.js';
import {
  SiteIntakeCommercialStore,
  type CommercialScope,
  type WithIntakeOptions,
} from './site-intake-commercial.store.js';
import type {
  ResolvedDestination,
  SiteIntakeActorRole,
  SiteIntakeBindingMode,
  SiteIntakeCommercial,
  SiteIntakeCommercialStatus,
  SiteIntakeExceptionOutcome,
} from './site-intake-commercial.types.js';
import { EXCEPTION_REASON_MIN_LENGTH } from './site-intake-commercial.types.js';
import { RunSiteIntakeRepository } from './site-intake.repository.js';
import type { RunSiteIntake } from './site-intake.types.js';

/**
 * LUA CHON DIEM GIAO tu may khach. HAI hinh dang, va KHONG hinh dang nao la "mot cap so tu do":
 *
 *   · `KNOWN_PLACE` — mot id hang rao; may chu tu doc nhan + toa do tu hang rao DANG hoat dong;
 *   · `VERIFIED_SEARCH` — mot ket qua tim dia diem ma tang ghep (controller) DA doi chieu lai voi
 *     chinh ket qua tim cua may chu (`#379` place search). Dich vu nay khong nhan mot toa do chua
 *     qua doi chieu.
 */
export type DestinationChoice =
  | { readonly kind: 'KNOWN_PLACE'; readonly placeId: string }
  | { readonly kind: 'VERIFIED_SEARCH'; readonly destination: ResolvedDestination };

/**
 * Lua chon diem giao, hoac mot HAM tao ra no. Ham chi duoc goi khi lenh THAT SU phai ghi mot diem
 * giao moi: lan GUI LAI cung khoa (hoac viec da dong) tra ket cuc da ghi ma KHONG tim lai dia diem —
 * mat phan hoi roi gui lai khong duoc thanh "tim dia diem dang ban" chi vi bo nho dem cua lan tim da
 * mat (khoi dong lai, may khac, bi day ra).
 */
export type DestinationChoiceSource = DestinationChoice | (() => Promise<DestinationChoice>);

const choiceFrom = (source: DestinationChoiceSource): Promise<DestinationChoice> =>
  typeof source === 'function' ? source() : Promise.resolve(source);

/** KET CUC cua mot lenh thuong mai — doc tu su that SAU lenh, khong tu y dinh cua nguoi goi. */
export interface CommercialOutcome {
  readonly intakeId: string;
  readonly status: SiteIntakeCommercialStatus;
  readonly readiness: CommercialReadiness;
  readonly orderId: string | null;
  readonly orderCode: string | null;
  readonly bindingMode: SiteIntakeBindingMode | null;
  /** `true` khi CHINH lenh nay gan don (tao moi hoac gan don co san). */
  readonly bound: boolean;
  /** `true` khi lenh nay la mot lan GUI LAI — khong ghi gi them. */
  readonly replayed: boolean;
}

export interface ExceptionOutcome {
  readonly intakeId: string;
  readonly outcome: SiteIntakeExceptionOutcome;
  readonly status: SiteIntakeCommercialStatus;
  readonly orderId: string | null;
  /** Xe da lan banh — vong chay, chang, moc, GPS giu nguyen. */
  readonly operationPreserved: boolean;
  readonly replayed: boolean;
}

export interface DriverDestinationCommand {
  readonly authUserId: string;
  readonly intakeId: string;
  readonly clientEventId: string;
  readonly choice: DestinationChoiceSource;
}

export interface OfficeCompleteCommand {
  readonly actor: string;
  readonly intakeId: string;
  readonly idempotencyKey: string;
  readonly choice?: DestinationChoiceSource;
  readonly attestOrigin?: boolean;
}

export interface BindExistingOrderCommand {
  readonly actor: string;
  readonly intakeId: string;
  readonly orderId: string;
}

export interface ReportExceptionCommand {
  readonly actor: string;
  readonly intakeId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/**
 * BUOC NGHIEP VU cua capability — `<mien>.<viec>`, doc len nghe ra viec (quy uoc observability).
 * Bon lenh la bon buoc ngoai; `settle` (phan xu + tu tao don) va `adopt` (don nhan vong chay +
 * chang cu) la hai buoc trong. Mot lenh nhin ra toi da ba buoc, khong phai mot buoc moi ham.
 */
type SiteIntakeStep =
  | 'site_intake.driver_destination'
  | 'site_intake.office_complete'
  | 'site_intake.bind_existing_order'
  | 'site_intake.report_exception'
  | 'site_intake.settle'
  | 'site_intake.adopt';

/** MOT chuyen trang thai da xay ra trong lenh — ghi ra telemetry SAU khi giao dich commit. */
interface StateTransition {
  readonly entity:
    'TransportSiteIntakeCommercial' | 'TransportOrder' | 'TransportRunLeg' | 'TransportVehicleRun';
  readonly entityId: string;
  readonly from: string | null;
  readonly to: string;
  readonly reason?: string;
}

/** Ghi nhan mot chuyen trang thai trong pham vi lenh (chua phat ra — xem `runCommand`). */
type RecordTransition = (transition: StateTransition) => void;

interface AdoptContext {
  readonly actor: string;
  readonly mode: SiteIntakeBindingMode;
  readonly destinationLabel: string;
  readonly created: boolean;
  readonly at?: Date;
}

/**
 * VIEC TAI XE NHAN TRUC TIEP -> DON TU DONG — `#398`, phia LENH.
 *
 * ============================================================================================
 * BON LENH, MOT DUONG GHI
 * ============================================================================================
 *
 *   · lai xe chon diem giao        -> ghi diem giao, phan xu, DU thi tu tao don (`AUTO_CREATED`);
 *   · van phong hoan thien         -> ghi dieu con thieu, phan xu, DU thi tao don (`OFFICE_COMPLETED`);
 *   · van phong gan don co san     -> NGUOI chon don, don nhan chang (`OFFICE_EXISTING_ORDER`);
 *   · sep bao bat thuong / huy     -> may chu quyet huy den dau theo su that van hanh.
 *
 * Ca bon di qua `SiteIntakeCommercialStore.withIntake` — mot giao dich, ba khoa theo mot thu tu.
 * Khong lenh nao tao VONG CHAY hay CHANG: don NHAN vong chay + chang co hang ma lan xac nhan cua
 * lai xe (`#267`) da tao. Dem sau khi tu tao: vong chay +0, chang +0, don +1, ke hoach +1 (`ADOPTED`).
 *
 * ============================================================================================
 * KHONG MOT TRUONG TIEN NAO
 * ============================================================================================
 *
 * Don tu tao mang `freightAmount = null`, `customerId = null`: CHUA BIET, khong phai 0, khong phai
 * "khach = phap nhan cua kho". Lenh nay KHONG ghi cong no, khong ghi phai tra, khong duyet quyet
 * toan — `#398` §13: van hanh xong != giao xong don != doi soat != cong no != thanh toan.
 */
@Injectable()
export class SiteIntakeCommercialService {
  constructor(
    private readonly store: SiteIntakeCommercialStore,
    private readonly intakes: RunSiteIntakeRepository,
    private readonly core: TransportSiteIntakeCoreFacts,
    private readonly geo: TransportSiteIntakeGeoFacts,
    private readonly reader: SiteIntakeReadinessReader,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* ------------------------------------------------------------------ *
   * LAI XE
   * ------------------------------------------------------------------ */

  /**
   * DIA DIEM GIAO DA BIET — hang rao dang hoat dong (bai xe, dia diem phap nhan, khach hang), cung
   * nguon voi "dia diem da biet" cua man tao don (#379). Chi DOC.
   */
  async knownDestinations(): Promise<{
    readonly available: true;
    readonly places: readonly KnownPlace[];
  }> {
    return { available: true, places: await this.geo.listKnownPlaces() };
  }

  /**
   * LAI XE CHON DIEM GIAO cho CHINH lan nhan viec cua minh.
   *
   * Danh tinh tu phien; lan nhan viec cua nguoi khac tra `SITE_INTAKE_NOT_FOUND` — CUNG ma voi mot
   * id khong co that, de khong ai do duoc id nao ton tai. Gui lai CUNG `clientEventId` tra ve dung
   * ket cuc cu (ke ca don da tao), khong ghi lan hai.
   */
  async chooseDestinationAsDriver(command: DriverDestinationCommand): Promise<CommercialOutcome> {
    const intake = await this.requireOwnIntake(command.authUserId, command.intakeId);
    // GUI LAI TRUOC KHI TIM LAI: cung khoa (hoac viec da dong) thi khong can mot diem giao moi, nen
    // khong goi tim dia diem — lan gui lai phai tra DUNG ket cuc cu, ke ca khi tim dang tat/ban.
    const recorded = await this.store.findByIntake(intake.id);
    const settled =
      recorded !== null &&
      (recorded.destination?.eventId === command.clientEventId || recorded.status !== 'PENDING');
    const destination = settled ? null : await this.resolve(await choiceFrom(command.choice));

    return this.runCommand(
      'site_intake.driver_destination',
      intake.id,
      {},
      async (scope, record) => {
        if (scope.commercial.destination?.eventId === command.clientEventId) {
          this.decide('site_intake.commercial', 'allowed', 'SITE_INTAKE_DESTINATION_REPLAYED', {
            intakeId: intake.id,
          });
          return this.outcomeOf(scope, await this.readinessIn(scope), false, true);
        }
        if (scope.commercial.status !== 'PENDING') {
          return this.outcomeOf(scope, await this.readinessIn(scope), false, false);
        }
        // Doc truoc khoa noi "da xong", duoi khoa thi khong con dung (vd van phong vua ghi mot diem
        // giao khac) — mot cua so hep; gui lai CUNG khoa se doc lai va di tiep.
        if (destination === null) throw stateChanged();

        await this.recordDestination(scope, destination, {
          by: command.authUserId,
          role: 'DRIVER',
          eventId: command.clientEventId,
        });
        return this.settle(scope, command.authUserId, 'AUTO_CREATED', record);
      },
    );
  }

  /* ------------------------------------------------------------------ *
   * VAN PHONG
   * ------------------------------------------------------------------ */

  /**
   * VAN PHONG HOAN THIEN: ghi dieu con thieu (diem giao, xac nhan noi lay), roi CUNG lenh tao don
   * neu da du. Chua du thi tra ve ly do — KHONG tao mot don OPEN chi de luong trong xong.
   */
  async completeAsOffice(command: OfficeCompleteCommand): Promise<CommercialOutcome> {
    const intake = await this.requireIntake(command.intakeId);
    // Cung quy tac voi lai xe: gui lai cung khoa / viec da dong -> khong tim lai dia diem.
    const recorded = command.choice === undefined ? null : await this.store.findByIntake(intake.id);
    const settled =
      recorded !== null &&
      (recorded.status !== 'PENDING' || recorded.destination?.eventId === command.idempotencyKey);
    const destination =
      command.choice === undefined || settled
        ? null
        : await this.resolve(await choiceFrom(command.choice));

    return this.runCommand('site_intake.office_complete', intake.id, {}, async (scope, record) => {
      if (scope.commercial.status !== 'PENDING') {
        return this.outcomeOf(scope, await this.readinessIn(scope), false, true);
      }
      if (
        command.choice !== undefined &&
        destination === null &&
        scope.commercial.destination?.eventId !== command.idempotencyKey
      ) {
        throw stateChanged();
      }
      if (
        destination !== null &&
        scope.commercial.destination?.eventId !== command.idempotencyKey
      ) {
        await this.recordDestination(scope, destination, {
          by: command.actor,
          role: 'OFFICE',
          eventId: command.idempotencyKey,
        });
      }
      if (command.attestOrigin === true && scope.commercial.originAttestation === null) {
        const before = scope.commercial;
        const at = this.now();
        await scope.attestOrigin(command.actor, at);
        await scope.appendAudit({
          actor: command.actor,
          action: 'transport.site_intake.origin_attest',
          entityType: 'TransportSiteIntakeCommercial',
          entityId: scope.commercial.id,
          before,
          after: scope.commercial,
        });
      }
      return this.settle(scope, command.actor, 'OFFICE_COMPLETED', record);
    });
  }

  /**
   * GAN TAY MOT DON CO SAN — nguoi CHON don, may chu KHONG doan theo ten/gio (`#398` §6).
   *
   * Khoa tu van cua DON duoc gianh truoc khoa hang vong chay, cung khoa ma lan lap ke hoach gianh:
   * gan don nay vao chang cua lai xe va lap ke hoach cho don nay xep hang, khong chong len nhau.
   *
   * "Don TUONG THICH" (`#398` §6): ngoai dieu kien san sang (mo, chua ke hoach, chua chang song,
   * chua nhan viec khac), diem lay cua don — khi don CO toa do — phai nam quanh dia diem tai xe
   * nhan viec (`matchOrderOrigin`). Don khong co toa do van gan duoc: nguoi chon tu chiu, va cong
   * nay khong bia toa do de tu choi. Dia diem doc tu CUNG nguon voi danh sach don gan duoc
   * (`SiteIntakeReviewService.bindableOrders`), nen man hinh khong de nghi mot don ma cong chan.
   */
  async bindExistingOrder(command: BindExistingOrderCommand): Promise<CommercialOutcome> {
    const intake = await this.requireIntake(command.intakeId);

    return this.runCommand(
      'site_intake.bind_existing_order',
      intake.id,
      { lockOrderId: command.orderId },
      async (scope) => {
        const target = await scope.findOrder(command.orderId);
        if (!target) {
          throw TransportDomainError.notFound('SITE_INTAKE_ORDER_NOT_FOUND', 'Khong tim thay don');
        }
        const planFacts = await scope.orderPlanFacts(target.id);
        const external = await this.reader.external(scope.intake);
        const leg = this.legOf(scope);
        const decision = evaluateOrderBinding({
          status: scope.commercial.status,
          boundOrderId: scope.commercial.binding?.orderId ?? null,
          run: { status: scope.run.status },
          leg: { kind: leg.kind, status: leg.status, orderId: leg.orderId },
          runCarriesOtherOneOrderPlan: this.reader.facts(scope, external)
            .runCarriesOtherOneOrderPlan,
          siteOriginPoints: external.originPoints,
          target: {
            id: target.id,
            status: target.status,
            hasActivePlan: planFacts.hasActivePlan,
            liveLegCount: planFacts.liveLegCount,
            boundToOtherIntake:
              planFacts.boundIntakeId !== null && planFacts.boundIntakeId !== scope.intake.id,
            originPoint: target.originPoint,
          },
        });

        if (decision.kind === 'ALREADY_BOUND') {
          this.decide('site_intake.commercial', 'allowed', 'SITE_INTAKE_ALREADY_BOUND', {
            intakeId: scope.intake.id,
            orderId: decision.orderId,
          });
          return this.outcomeOf(scope, await this.readinessIn(scope), false, true);
        }
        if (decision.kind === 'DENY') {
          this.decideBindingDenied(scope.intake.id, target, decision.reason, external.originPoints);
          throw bindingDenied(decision.reason);
        }

        await this.adopt(scope, target, {
          actor: command.actor,
          mode: 'OFFICE_EXISTING_ORDER',
          destinationLabel: target.destinationLabel,
          created: false,
        });
        return this.outcomeOf(scope, await this.readinessIn(scope), true, false);
      },
    );
  }

  /**
   * Tu choi gan don co san — lech diem lay co MA RIENG (kem khoang cach, khong kem toa do); moi
   * duong con lai di chung `SITE_INTAKE_BINDING_DENIED` voi ma cu the o `detail.reason`.
   */
  private decideBindingDenied(
    intakeId: string,
    target: Order,
    reason: SiteIntakeBindingDenyReason,
    siteOriginPoints: readonly GeoPoint[],
  ): void {
    if (reason !== 'ORDER_ORIGIN_MISMATCH') {
      this.decide('site_intake.commercial', 'denied', 'SITE_INTAKE_BINDING_DENIED', {
        intakeId,
        orderId: target.id,
        reason,
      });
      return;
    }
    const match = matchOrderOrigin(target.originPoint, siteOriginPoints);
    this.decide('site_intake.commercial', 'denied', 'SITE_INTAKE_ORDER_ORIGIN_MISMATCH', {
      intakeId,
      orderId: target.id,
      reason,
      distanceMetres: match.kind === 'MISMATCH' ? Math.round(match.distanceMetres) : null,
      toleranceMetres: ORDER_ORIGIN_TOLERANCE_METRES,
    });
  }

  /**
   * BAO BAT THUONG / HUY — ly do BAT BUOC, may chu quyet huy den dau (`#398` §9).
   *
   * KHONG xoa mot hang nao. Xe da lan banh thi vong chay, chang, moc, GPS, chung tu o nguyen; chi
   * phan THUONG MAI bi huy. Don da o trang thai cuoi thi chi GHI NHAN bat thuong — khong di vong qua
   * vong doi don bang mot lan sua trang thai truc tiep.
   */
  async reportException(input: ReportExceptionCommand): Promise<ExceptionOutcome> {
    // Ly do BAT BUOC o CHINH tang nghiep vu, khong chi o schema HTTP: moi nguoi goi khong qua HTTP
    // (PERSISTENCE=memory, mot tac vu noi bo) cung khong ghi duoc mot bat thuong voi ly do trang.
    const reason = input.reason.trim();
    if (reason.length < EXCEPTION_REASON_MIN_LENGTH) {
      throw TransportDomainError.invalid(
        'SITE_INTAKE_EXCEPTION_REASON_REQUIRED',
        'Phai ghi ly do khi bao bat thuong / huy',
      );
    }
    const command: ReportExceptionCommand = { ...input, reason };
    const intake = await this.requireIntake(command.intakeId);

    return this.runCommand('site_intake.report_exception', intake.id, {}, async (scope, record) => {
      const leg = this.legOf(scope);
      const boundOrder = scope.commercial.binding
        ? await scope.findOrder(scope.commercial.binding.orderId)
        : null;
      const movementStarted = hasMovementStarted({
        runStatus: scope.run.status,
        legStatus: leg.status,
        checkpointTypes: await scope.checkpointTypes(),
      });
      const decision = decideException({
        status: scope.commercial.status,
        boundOrderStatus: boundOrder?.status ?? null,
        movementStarted,
        recorded: scope.commercial.exception ? { key: scope.commercial.exception.key } : null,
        key: command.idempotencyKey,
      });

      if (decision.kind === 'REPLAY') {
        this.decideException('allowed', 'SITE_INTAKE_EXCEPTION_REPLAYED', scope.intake.id, {});
        return this.exceptionOutcomeOf(scope.commercial, true);
      }
      if (decision.kind === 'DENY') {
        this.decideException(
          'denied',
          'SITE_INTAKE_EXCEPTION_ALREADY_RECORDED',
          scope.intake.id,
          {},
        );
        throw TransportDomainError.conflict(
          'SITE_INTAKE_EXCEPTION_ALREADY_RECORDED',
          'Viec nay da co mot lan bao bat thuong — mo lai de xem ket cuc',
        );
      }

      const at = this.now();
      const before = scope.commercial;

      if (decision.cancelOrder && boundOrder !== null) {
        const verdict = evaluateOrderCancel(boundOrder.status);
        if (!verdict.allowed) {
          throw TransportDomainError.conflict(
            'SITE_INTAKE_ORDER_NOT_OPEN',
            'Don vua doi trang thai — tai lai roi thu lai',
          );
        }
        const cancelled = await scope.cancelOrder(boundOrder.id, command.reason, at);
        await scope.appendAudit({
          actor: command.actor,
          action: 'transport.order.cancel',
          entityType: 'TransportOrder',
          entityId: boundOrder.id,
          before: boundOrder,
          after: {
            ...cancelled,
            source: 'DRIVER_SITE_INTAKE_EXCEPTION',
            intakeId: scope.intake.id,
          },
        });
        record({
          entity: 'TransportOrder',
          entityId: boundOrder.id,
          from: boundOrder.status,
          to: cancelled.status,
          reason: decision.outcome,
        });
      }

      if (decision.cancelWork) {
        await this.cancelUnstartedWork(scope, command, at, decision.outcome, record);
      }

      await scope.recordException({
        reason: command.reason,
        outcome: decision.outcome,
        by: command.actor,
        at,
        key: command.idempotencyKey,
        reject: decision.rejectIntake,
      });
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.site_intake.exception',
        entityType: 'TransportSiteIntakeCommercial',
        entityId: scope.commercial.id,
        before,
        after: { ...scope.commercial, movementStarted },
      });
      this.decideException(
        'allowed',
        `SITE_INTAKE_EXCEPTION_${decision.outcome}` as SiteIntakeExceptionReason,
        scope.intake.id,
        { movementStarted, orderId: boundOrder?.id ?? null },
      );
      return this.exceptionOutcomeOf(scope.commercial, false);
    });
  }

  /* ------------------------------------------------------------------ *
   * Noi bo
   * ------------------------------------------------------------------ */

  /**
   * MOT LENH THUONG MAI = mot buoc nghiep vu bao quanh MOT giao dich `withIntake`.
   *
   * Chuyen trang thai (phan thuong mai, don, chang, vong chay) duoc GOM trong giao dich va chi phat
   * ra `telemetry.stateChange` SAU khi `withIntake` tra ve — tuc sau COMMIT. Mot lenh cuon lai
   * khong de lai mot chuyen trang thai "ma" trong trace. Chuyen cua CHINH phan thuong mai
   * (`PENDING -> ORDER_BOUND | REJECTED`) duoc tinh bang so trang thai truoc/sau, nen khong duong
   * nao quen ghi no.
   *
   * Observability KHONG la dieu kien cua nghiep vu: vang `telemetry` thi lenh chay y het, va
   * `TelemetryService` tu nuot loi cua chinh no (fail-open).
   */
  private runCommand<T>(
    step: SiteIntakeStep,
    intakeId: string,
    options: WithIntakeOptions,
    work: (scope: CommercialScope, record: RecordTransition) => Promise<T>,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      const transitions: StateTransition[] = [];
      const record: RecordTransition = (transition) => {
        transitions.push(transition);
      };
      const result = await this.store.withIntake(intakeId, options, async (scope) => {
        const before = scope.commercial.status;
        const value = await work(scope, record);
        const after = scope.commercial;
        if (after.status !== before) {
          record({
            entity: 'TransportSiteIntakeCommercial',
            entityId: after.id,
            from: before,
            to: after.status,
            reason: after.binding?.mode ?? after.exception?.outcome,
          });
        }
        return value;
      });
      for (const transition of transitions) this.telemetry?.stateChange(transition);
      return result;
    };
    return this.stepped(step, run, { intakeId });
  }

  /** `telemetry.step` khi co, chay thang khi khong — cung khuon `PlaceService`. */
  private stepped<T>(
    step: SiteIntakeStep,
    run: () => Promise<T>,
    attributes: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    return this.telemetry ? this.telemetry.step(step, run, attributes) : run();
  }

  /**
   * PHAN XU roi, neu DU, TU TAO DON. Chay DUOI khoa cua `withIntake` — su that doc o day la ban
   * sau khi co khoa, nen hai lenh song song khong the cung thay "chua co don".
   */
  private settle(
    scope: CommercialScope,
    actor: string,
    mode: 'AUTO_CREATED' | 'OFFICE_COMPLETED',
    record: RecordTransition,
  ): Promise<CommercialOutcome> {
    return this.stepped(
      'site_intake.settle',
      () => this.settleUnderLock(scope, actor, mode, record),
      { intakeId: scope.intake.id, mode },
    );
  }

  private async settleUnderLock(
    scope: CommercialScope,
    actor: string,
    mode: 'AUTO_CREATED' | 'OFFICE_COMPLETED',
    record: RecordTransition,
  ): Promise<CommercialOutcome> {
    const readiness = await this.readinessIn(scope);
    if (readiness.kind === 'READY_TO_AUTO_CREATE') {
      const at = this.now();
      const order = await scope.createOrder({
        code: siteIntakeOrderCode(scope.intake.businessDate, scope.intake.id),
        businessDate: scope.intake.businessDate,
        originLabel: readiness.origin.label,
        destinationLabel: readiness.destination.label,
        originPoint: readiness.origin.point,
        destinationPoint: readiness.destination.point,
        // CHUA BIET — khong doan, khong 0 (`#398` §4, §13).
        customerId: null,
        cargoDescription: null,
        freightAmount: null,
        note: null,
      });
      await scope.appendAudit({
        actor,
        action: 'transport.order.create',
        entityType: 'TransportOrder',
        entityId: order.id,
        before: null,
        after: { ...order, source: 'DRIVER_SITE_INTAKE', intakeId: scope.intake.id, mode },
      });
      record({
        entity: 'TransportOrder',
        entityId: order.id,
        from: null,
        to: order.status,
        reason: mode,
      });
      await this.adopt(scope, order, {
        actor,
        mode,
        destinationLabel: readiness.destination.label,
        created: true,
        at,
      });
      return this.outcomeOf(scope, await this.readinessIn(scope), true, false);
    }

    this.decide(
      'site_intake.commercial',
      readiness.kind === 'REJECTED' ? 'denied' : 'allowed',
      readiness.kind === 'NEEDS_REVIEW'
        ? 'SITE_INTAKE_NEEDS_REVIEW'
        : readiness.kind === 'ALREADY_BOUND'
          ? 'SITE_INTAKE_ALREADY_BOUND'
          : 'SITE_INTAKE_COMMERCIAL_REJECTED',
      {
        intakeId: scope.intake.id,
        ...(readiness.kind === 'NEEDS_REVIEW' ? { reasons: readiness.reasons } : {}),
        ...(readiness.kind === 'REJECTED' ? { reason: readiness.reason } : {}),
      },
    );
    return this.outcomeOf(scope, readiness, false, false);
  }

  /**
   * DON NHAN VONG CHAY + CHANG CU — ba lan ghi, cung giao dich:
   *
   *   1. chang co hang cua lan nhan viec: `orderId` NULL -> don nay (co dieu kien, mot lan);
   *   2. ke hoach `ADOPTED` tro vao DUNG chang do — lan lap ke hoach sau cua don nay thay "da co ke
   *      hoach" (`TransportOrderRunPlan_activeOrder_key`) va KHONG tao vong chay/chang moi;
   *   3. phan thuong mai: `PENDING -> ORDER_BOUND` (chuyen trang thai do `runCommand` ghi, sau
   *      COMMIT).
   */
  private adopt(scope: CommercialScope, order: Order, context: AdoptContext): Promise<void> {
    return this.stepped('site_intake.adopt', () => this.adoptUnderLock(scope, order, context), {
      intakeId: scope.intake.id,
      orderId: order.id,
      mode: context.mode,
    });
  }

  private async adoptUnderLock(
    scope: CommercialScope,
    order: Order,
    context: AdoptContext,
  ): Promise<void> {
    const at = context.at ?? this.now();
    const leg = this.legOf(scope);
    const before = scope.commercial;

    const adopted = await scope.adoptLeg({
      legId: leg.id,
      orderId: order.id,
      destinationLabel: context.destinationLabel,
      at,
    });
    const plan = await scope.createAdoptionPlan({
      orderId: order.id,
      runId: scope.run.id,
      vehicleId: scope.run.vehicleId,
      loadedLegId: leg.id,
      emptyLegId: null,
      grouping: this.reader.grouping,
      outcome: 'ADOPTED',
      idempotencyKey: siteIntakePlanKey(scope.intake.id),
      plannedBy: context.actor,
      businessDate: scope.intake.businessDate,
    });
    await scope.markBound({ orderId: order.id, mode: context.mode, by: context.actor, at });

    await scope.appendAudit({
      actor: context.actor,
      action: 'transport.planning.adopt',
      entityType: 'TransportOrderRunPlan',
      entityId: plan.id,
      before: { leg },
      after: { plan, leg: adopted },
    });
    await scope.appendAudit({
      actor: context.actor,
      action: 'transport.site_intake.order_bound',
      entityType: 'TransportSiteIntakeCommercial',
      entityId: scope.commercial.id,
      before,
      after: {
        ...scope.commercial,
        runId: scope.run.id,
        legId: leg.id,
        driverId: scope.intake.driverId,
        vehicleId: scope.run.vehicleId,
        siteId: scope.intake.siteId,
      },
    });
    this.decide(
      'site_intake.commercial',
      'allowed',
      context.mode === 'AUTO_CREATED'
        ? 'SITE_INTAKE_ORDER_AUTO_CREATED'
        : context.mode === 'OFFICE_COMPLETED'
          ? 'SITE_INTAKE_ORDER_OFFICE_COMPLETED'
          : 'SITE_INTAKE_ORDER_BOUND_EXISTING',
      {
        intakeId: scope.intake.id,
        orderId: order.id,
        runId: scope.run.id,
        legId: leg.id,
        planId: plan.id,
        created: context.created,
      },
    );
  }

  /**
   * VIEC VAN HANH CHUA CHAY: ke hoach nhan lai, chang co hang, va vong chay — CHI khi vong chay
   * khong con viec nao KHAC dang song (che do nhieu don co the da noi chang cua don khac vao day).
   */
  private async cancelUnstartedWork(
    scope: CommercialScope,
    command: ReportExceptionCommand,
    at: Date,
    outcome: SiteIntakeExceptionOutcome,
    record: RecordTransition,
  ): Promise<void> {
    const leg = this.legOf(scope);
    const plan = scope.activeRunPlans.find((entry) => entry.loadedLegId === leg.id);
    if (plan) {
      await scope.cancelActivePlan(plan.id, command.reason, at);
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.planning.cancel',
        entityType: 'TransportOrderRunPlan',
        entityId: plan.id,
        before: plan,
        after: { ...plan, cancelledAt: at.toISOString(), cancellationReason: command.reason },
      });
    }
    if (leg.status === 'PLANNED' && (await scope.cancelPlannedLeg(leg.id, at))) {
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.run.leg.cancel',
        entityType: 'TransportRunLeg',
        entityId: leg.id,
        before: leg,
        after: { ...leg, status: 'CANCELLED', reason: command.reason },
      });
      record({
        entity: 'TransportRunLeg',
        entityId: leg.id,
        from: leg.status,
        to: 'CANCELLED',
        reason: outcome,
      });
    }
    const otherLiveWork = scope.legs.some(
      (entry) => entry.id !== leg.id && entry.status !== 'CANCELLED',
    );
    if (
      scope.run.status === 'PLANNED' &&
      !otherLiveWork &&
      (await scope.cancelPlannedRun(scope.run.id, command.reason, at))
    ) {
      await scope.appendAudit({
        actor: command.actor,
        action: 'transport.run.cancel',
        entityType: 'TransportVehicleRun',
        entityId: scope.run.id,
        before: scope.run,
        after: { ...scope.run, status: 'CANCELLED', cancellationReason: command.reason },
      });
      record({
        entity: 'TransportVehicleRun',
        entityId: scope.run.id,
        from: scope.run.status,
        to: 'CANCELLED',
        reason: outcome,
      });
    }
  }

  private async recordDestination(
    scope: CommercialScope,
    destination: ResolvedDestination,
    by: { readonly by: string; readonly role: SiteIntakeActorRole; readonly eventId: string },
  ): Promise<void> {
    const before = scope.commercial;
    await scope.setDestination({
      ...destination,
      setBy: by.by,
      setByRole: by.role,
      setAt: this.now(),
      eventId: by.eventId,
    });
    await scope.appendAudit({
      actor: by.by,
      action: 'transport.site_intake.destination',
      entityType: 'TransportSiteIntakeCommercial',
      entityId: scope.commercial.id,
      before,
      after: scope.commercial,
    });
    this.decide('site_intake.commercial', 'allowed', 'SITE_INTAKE_DESTINATION_RECORDED', {
      intakeId: scope.intake.id,
      source: destination.source,
      role: by.role,
    });
  }

  private async readinessIn(scope: CommercialScope): Promise<CommercialReadiness> {
    return evaluateCommercialReadiness(
      this.reader.facts(scope, await this.reader.external(scope.intake)),
    );
  }

  private async outcomeOf(
    scope: CommercialScope,
    readiness: CommercialReadiness,
    bound: boolean,
    replayed: boolean,
  ): Promise<CommercialOutcome> {
    const orderId = scope.commercial.binding?.orderId ?? null;
    const order = orderId === null ? null : await scope.findOrder(orderId);
    return {
      intakeId: scope.intake.id,
      status: scope.commercial.status,
      readiness,
      orderId,
      orderCode: order?.code ?? null,
      bindingMode: scope.commercial.binding?.mode ?? null,
      bound,
      replayed,
    };
  }

  private exceptionOutcomeOf(
    commercial: SiteIntakeCommercial,
    replayed: boolean,
  ): ExceptionOutcome {
    const outcome = commercial.exception?.outcome ?? 'ANOMALY_RECORDED_ORDER_TERMINAL';
    return {
      intakeId: commercial.intakeId,
      outcome,
      status: commercial.status,
      orderId: commercial.binding?.orderId ?? null,
      operationPreserved:
        outcome === 'ORDER_CANCELLED_OPERATION_PRESERVED' ||
        outcome === 'INTAKE_REJECTED_OPERATION_PRESERVED',
      replayed,
    };
  }

  /** Giai lua chon diem giao thanh su that vi tri DO MAY CHU doc — ngoai khoa, chi doc. */
  private async resolve(choice: DestinationChoice): Promise<ResolvedDestination> {
    if (choice.kind === 'VERIFIED_SEARCH') return choice.destination;
    const place = (await this.geo.listKnownPlaces()).find((entry) => entry.id === choice.placeId);
    if (!place) {
      throw TransportDomainError.notFound(
        'SITE_INTAKE_DESTINATION_NOT_FOUND',
        'Khong tim thay dia diem giao dang hoat dong nao mang ma do',
      );
    }
    return {
      label: place.detail ? `${place.detail} — ${place.name}` : place.name,
      point: place.point,
      source: 'KNOWN_PLACE',
      ref: place.id,
    };
  }

  private legOf(scope: CommercialScope) {
    const leg = scope.legs.find((entry) => entry.id === scope.intake.legId);
    if (!leg) {
      throw TransportDomainError.conflict(
        'SITE_INTAKE_LEG_NOT_ADOPTABLE',
        'Chang cua lan nhan viec khong con doc duoc',
      );
    }
    return leg;
  }

  private async requireIntake(intakeId: string): Promise<RunSiteIntake> {
    const intake = await this.intakes.findById(intakeId);
    if (!intake) {
      throw TransportDomainError.notFound('SITE_INTAKE_NOT_FOUND', 'Khong tim thay lan nhan viec');
    }
    return intake;
  }

  /** Lan nhan viec CUA CHINH lai xe dang goi — nguoi khac va khong co that tra CUNG mot ma. */
  private async requireOwnIntake(authUserId: string, intakeId: string): Promise<RunSiteIntake> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    const intake = await this.intakes.findById(intakeId);
    if (!driver || !intake || intake.driverId !== driver.id) {
      throw TransportDomainError.notFound('SITE_INTAKE_NOT_FOUND', 'Khong tim thay lan nhan viec');
    }
    return intake;
  }

  private decide(
    point: 'site_intake.commercial',
    outcome: 'allowed' | 'denied',
    reason: SiteIntakeCommercialReason,
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

  private decideException(
    outcome: 'allowed' | 'denied',
    reason: SiteIntakeExceptionReason,
    intakeId: string,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SITE_INTAKE_DECISIONS,
      point: 'site_intake.exception',
      outcome,
      reason,
      detail: { intakeId, ...detail },
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

/** Ma gan don co san -> ma HTTP co ten, 409 — mot va cham trang thai, khong phai thieu quyen. */
function bindingDenied(reason: SiteIntakeBindingDenyReason): TransportDomainError {
  switch (reason) {
    case 'INTAKE_BOUND_TO_OTHER_ORDER':
      return TransportDomainError.conflict(
        'SITE_INTAKE_BOUND_TO_OTHER_ORDER',
        'Viec nay da gan mot don khac — khong gan lai duoc',
      );
    case 'ORDER_BOUND_TO_OTHER_INTAKE':
      return TransportDomainError.conflict(
        'SITE_INTAKE_ORDER_BOUND_TO_OTHER_INTAKE',
        'Don nay da nhan mot viec tai xe khac',
      );
    case 'ORDER_NOT_OPEN':
      return TransportDomainError.conflict('SITE_INTAKE_ORDER_NOT_OPEN', 'Don khong con mo');
    case 'ORDER_ORIGIN_MISMATCH':
      return TransportDomainError.conflict(
        'SITE_INTAKE_ORDER_ORIGIN_MISMATCH',
        'Don nay lay hang o noi khac voi noi tai xe nhan viec — chon don khac',
      );
    default:
      return TransportDomainError.conflict(
        'SITE_INTAKE_BINDING_DENIED',
        `Khong gan duoc don nay vao viec nay (${reason})`,
      );
  }
}

/** Hai diem trung nhau (duoi mot met) — dung o tang doi chieu ket qua tim dia diem. */
/** Trang thai doi giua lan doc truoc khoa va lan ghi duoi khoa — gui lai CUNG khoa la di tiep. */
const stateChanged = (): TransportDomainError =>
  TransportDomainError.conflict(
    'SITE_INTAKE_STATE_CHANGED',
    'Viec vua duoc cap nhat — tai lai roi gui lai',
  );

export const samePoint = (
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): boolean => greatCircleMetres(left, right) < 1;
