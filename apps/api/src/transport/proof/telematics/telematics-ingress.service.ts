import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../../observability/telemetry.service.js';
import { toBusinessDate } from '../../business-date.js';
import { parseGeoPoint } from '../../geo/geo-point.js';
import { isUniqueViolationOn } from '../../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../../transport-policy.js';
import { TransportDomainError } from '../../transport.errors.js';
import { TRANSPORT_PROOF_DECISIONS } from '../proof-decisions.js';
import { TELEMATICS_INGRESS_EVENT } from '../proof-storage-conflict.js';
import { clockSkewSeconds } from '../risk-assessment.js';
import { TrackingRepository } from '../tracking.repository.js';
import type { LocationObservation } from '../tracking.types.js';
import { TransportProofCoreFacts } from '../transport-proof-facts.port.js';
import { VehicleTelematicsPort } from './vehicle-telematics.port.js';

/**
 * CUA NHAP cua nguon vi tri THU HAI — `#297` T4.
 *
 * ============================================================================================
 * TEP NAY LA MOT BIEN GIOI, KHONG PHAI MOT DAU NOI
 * ============================================================================================
 *
 * No KHONG goi ra mang, KHONG biet ten mot hang GSHT nao, va KHONG chua mot dong nao cua mot giao
 * thuc cu the. Viec cua no la nhan mot ban dinh vi DA DUOC CHUAN HOA — hinh dang do la
 * `TelematicsFix` cua `vehicle-telematics.port.ts` — roi quyet dinh co ghi no vao so bang chung hay
 * khong. Mot dau noi that (API cua mot hang, mot ban ket xuat CSV, mot lan nhap tay) song o TANG
 * ADAPTER va chi phai lam mot viec: dich du lieu cua ho thanh hinh dang do.
 *
 * Do la ly do `#297` T4 doi *"no vendor SDK imported into domain"*: khi mot hang doi giao thuc, chi
 * adapter phai sua. Khi mot khach doi hang, khong hang bang chung nao doi nghia.
 *
 * ============================================================================================
 * BON CONG, VA CA BON DEU DONG KHI CHUA BIET
 * ============================================================================================
 *
 * 0. **Danh tinh cua lan nhap den tu CAU HINH, khong tu than yeu cau.** Dau noi nao dang gui la
 *    mot cau hoi ma MAY CHU tra loi, khong phai mot truong ma nguoi goi dien. Neu than yeu cau
 *    chon duoc danh tinh do, thi khoa chan phat lai —
 *    `(connectorId, externalEventId)` — khong con la mot bien gioi: cung mot ma su kien gui lai
 *    duoi mot chuoi khac se sinh ra mot danh tinh moi, va lich su nhap lai duoc bao nhieu lan tuy
 *    y. Nguoi goi VAN duoc khai mot `connectorId`, nhung no chi la mot LOI KHANG DINH: lech voi
 *    cau hinh thi bi tu choi TRUOC moi thao tac ghi, chu khong am tham thang cau hinh.
 * 1. **Chua khai nha cung cap nao ⇒ TU CHOI** (`#297` T4: *"fail closed when provider integration
 *    is unconfigured"*). Day la trang thai MAC DINH cua moi khach hom nay, va mo no ra la mo mot
 *    duong cho bat ky ai co quyen van hanh ghi mot toa do bat ky vao lich su cua mot chiec xe duoi
 *    nhan "phan cung tren xe do bao".
 * 2. **Chiec xe nay chua duoc dang ky voi nha cung cap ⇒ TU CHOI.** `describeVehicle()` chu khong
 *    `describe()`: mot doi xe khong bao gio duoc gan thiet bi dong loat. Nham hai muc nay se cho
 *    phep nhap "vi tri phan cung" cua mot chiec xe chua bao gio co mot cai hop nao.
 * 3. **Chiec xe khong co trong doi xe ⇒ TU CHOI.** `#297` T4 doi *"stable vehicle mapping, not
 *    nearest-plate guessing"*. Adapter la thu giai bien so ra `vehicleId`; cong nay kiem lai rang
 *    ma do tro toi mot chiec xe co that truoc khi ghi bat cu thu gi.
 *
 * ============================================================================================
 * VA MOT DIEU KHONG XAY RA O DAY
 * ============================================================================================
 *
 * Khong mot duong nao tu tep nay di toi mot khoan tien. Mot ban dinh vi tu phan cung KHONG tao cong
 * no, KHONG tru luong, KHONG dong vao Quy lai xe va KHONG dan ra mot ket luan gian lan (`#297` T9,
 * `#232` D-02). No tao ra dung mot hang trong `LocationObservation`. Neu no lech voi chuoi cua dien
 * thoai, phep doi chieu cheo ghi lai do lech do de NGUOI xem — `telematics-crosscheck.ts`.
 */
@Injectable()
export class TelematicsIngressService {
  constructor(
    private readonly repository: TrackingRepository,
    /**
     * Cong telematics — dung o day de hoi HAI cau, va khong bao gio de `fetch()`.
     *
     * Chieu goi cua tep nay la NGUOC voi `fetch()`: du lieu duoc DAY vao (mot webhook, mot lan nhap
     * ket xuat), khong duoc keo ra. Ca hai chieu deu hop le va deu di qua cung mot cong, vi cau hoi
     * *"khach nay/chiec xe nay co mot nguon thu hai khong"* la MOT cau hoi — va hai cau tra loi
     * khac nhau cho cung cau hoi do la cach chac chan nhat de mot he thong co hai su that.
     */
    private readonly telematics: VehicleTelematicsPort,
    private readonly core: TransportProofCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  async ingest(command: TelematicsIngressCommand): Promise<LocationObservation> {
    const run = () => this.record(command);
    // Fail-open: thieu telemetry thi nghiep vu van chay nguyen ven.
    return this.telemetry ? this.telemetry.step('telematics.ingress', run) : run();
  }

  private async record(command: TelematicsIngressCommand): Promise<LocationObservation> {
    /*
     * CONG 1 — CHUA KHAI NHA CUNG CAP THI KHONG NHAN GI.
     *
     * `describe()` NEM duoc (mot adapter that co the phai goi ra mang de tra loi), va mot lan nem o
     * day phai dan toi TU CHOI chu khong toi chap nhan. Huong fail-safe nguoc voi
     * `LocationHealthService.telematicsConfiguredFor`, va do la co y: ben kia dang tra loi mot cau
     * hoi DOC ("co nen mong doi mot nguon thu hai khong"), nen im lang la cai sai it hai hon; ben
     * nay dang mo mot duong GHI vao so bang chung, nen nghi ngo phai dong cua lai.
     */
    let connectorId: string;
    let provider: string;
    try {
      const availability = this.telematics.describe();
      if (!availability.available) {
        return this.deny('TELEMATICS_PROVIDER_NOT_CONFIGURED', command, {
          providerReason: availability.reason,
        });
      }
      // DANH TINH lay o day va CHI o day. `providerName` di tiep duoc, nhung chi toi so quyet
      // dinh de nguoi doc — no khong cham vao khoa chan phat lai.
      connectorId = availability.connectorId;
      provider = availability.providerName;
    } catch {
      return this.deny('TELEMATICS_PROVIDER_NOT_CONFIGURED', command, {
        providerReason: 'PROVIDER_UNREACHABLE',
      });
    }

    /*
     * CONG 1B — LOI KHANG DINH CUA NGUOI GOI PHAI KHOP, VA PHEP KIEM NAY DUNG TRUOC MOI THAO TAC
     * GHI.
     *
     * Vi sao khong lang le bo qua truong nguoi goi khai: mot may khach gui `connectorId` la mot
     * may khach DANG TIN rang no chon duoc nguon. Nuot im lang thi no van chay, van bao thanh cong,
     * va khac biet giua dieu no tuong va dieu he thong lam chi lo ra khi co nguoi doi soat hai ben
     * — thuong la rat lau ve sau.
     *
     * Va vi sao khong de no THANG cau hinh: do chinh la lo hong. Mot nguoi co quyen van hanh gui
     * lai dung mot `externalEventId` duoi hai chuoi khac nhau se tao ra HAI hang bang chung cho
     * cung mot su kien thuong nguon, va phep chan phat lai — thu duy nhat giu cho so nay khong bi
     * bom len — se khong thay gi ca.
     */
    if (command.declaredConnectorId !== null && command.declaredConnectorId !== connectorId) {
      return this.deny('TELEMATICS_CONNECTOR_MISMATCH', command, {}, connectorId);
    }

    // CONG 2 — chiec xe NAY co duoc dang ky voi nha cung cap do khong. Muc XE, khong muc khach.
    try {
      if (!this.telematics.describeVehicle(command.vehicleId).available) {
        return this.deny('TELEMATICS_VEHICLE_NOT_ENROLLED', command, {}, connectorId);
      }
    } catch {
      return this.deny(
        'TELEMATICS_VEHICLE_NOT_ENROLLED',
        command,
        { providerReason: 'PROVIDER_UNREACHABLE' },
        connectorId,
      );
    }

    // CONG 3 — ma xe phai tro toi mot chiec xe co that trong doi xe cua khach.
    if ((await this.core.findVehicle(command.vehicleId)) === null) {
      return this.deny('TELEMATICS_VEHICLE_NOT_FOUND', command, {}, connectorId);
    }

    const parsed = parseGeoPoint(command.latitude, command.longitude);
    if (!parsed.ok) {
      return this.deny(
        'COORDINATE_REJECTED',
        command,
        { rejection: parsed.rejection },
        connectorId,
      );
    }

    /*
     * CHAN PHAT LAI — hoi TRUOC, roi van de kho tu choi mot lan nua.
     *
     * Phep hoi truoc la de PHAN BIET hai truong hop ma nguoi goi can biet ro: gui lai dung noi dung
     * cu (khong sao, tra ban cu) va dung lai mot ma su kien cho noi dung khac (mot loi that o phia
     * nha cung cap hoac mot lan gia mao — phai keu len). Phep tu choi cua kho la de dong khe hep
     * giua kiem va ghi: hai lan gui cung mot su kien den cung luc se lot qua ca hai lan kiem.
     */
    const existing = await this.repository.findTelematicsIngress(
      connectorId,
      command.externalEventId,
    );
    if (existing) {
      return this.resolveReplay(existing.observationId, command, parsed.point, connectorId);
    }

    const receivedAt = this.now();
    try {
      const observation = await this.repository.appendTelematicsObservation({
        // Danh tinh GHI XUONG la danh tinh DA SUY RA, khong phai thu nguoi goi khai. Cot nay la
        // mot nua cua khoa duy nhat duoi Postgres, nen mot gia tri den tu than yeu cau se lam
        // chinh phep chan phat lai tro thanh cai ma nguoi goi dieu khien duoc.
        providerId: connectorId,
        externalEventId: command.externalEventId,
        vehicleId: command.vehicleId,
        latitude: parsed.point.latitude,
        longitude: parsed.point.longitude,
        accuracyMetres: command.accuracyMetres,
        speedMetresPerSecond: command.speedMetresPerSecond,
        bearingDegrees: command.bearingDegrees,
        // `recordedAt` la dong ho cua HOP GSHT. No di vao `capturedAt` — cung cho ma dong ho may
        // khach di vao — va KHONG BAO GIO duoc dung lam `receivedAt`. `#297` T4 goi ten dieu nay:
        // *"provider timestamp separate from server receive time"*. Mot hop chinh sai gio van phai
        // ghi duoc, kem do lech, thay vi bi tu choi hay bi lam cho trong nhu vua bao.
        capturedAt: command.recordedAt,
        receivedAt,
        clockSkewSeconds: clockSkewSeconds(command.recordedAt, receivedAt),
        businessDate: toBusinessDate(receivedAt, this.corePolicy.timeZone),
      });
      this.allow(
        'TELEMATICS_OBSERVATION_RECORDED',
        command,
        { provider, observationId: observation.id },
        connectorId,
      );
      return observation;
    } catch (error) {
      // Hai lan gui song song cua CUNG mot su kien: mot ben thang, ben kia doc lai ban vua ghi.
      if (isUniqueViolationOn(error, TELEMATICS_INGRESS_EVENT)) {
        const raced = await this.repository.findTelematicsIngress(
          connectorId,
          command.externalEventId,
        );
        if (raced) {
          return this.resolveReplay(raced.observationId, command, parsed.point, connectorId);
        }
      }
      throw error;
    }
  }

  /**
   * CUNG MA SU KIEN — noi dung y het thi tra ban cu, KHAC thi tu choi on ao.
   *
   * `#297` T10.12 goi ten dieu nay: *"same external identity with changed payload fails closed"*.
   * Cai gia cua huong nguoc lai rat cu the: neu mot ma su kien duoc dung lai cho mot toa do khac
   * va he thong lang le tra ban cu, thi ban dinh vi MOI bien mat khong dau vet — va neu day la mot
   * lan sua lich su co chu y thi no vua thanh cong ma khong ai thay gi.
   *
   * Doi chieu tren chinh ban DA GHI chu khong tren mot van tay luu san: mot van tay la mot cach ghi
   * lai cau tra loi, va no chi dung chung nao cong thuc bam khong doi. Hang bang chung thi luon
   * dung theo dinh nghia.
   */
  private async resolveReplay(
    observationId: string,
    command: TelematicsIngressCommand,
    point: { latitude: number; longitude: number },
    connectorId: string,
  ): Promise<LocationObservation> {
    const existing = await this.repository.findObservationById(observationId);
    /*
     * Hang so bien gioi con, hang bang chung mat. Khong duong nao trong ung dung tao ra duoc hinh
     * dang nay (`onDelete: Restrict` o ca hai chieu), nen neu no xuat hien thi da co ai do go tay
     * vao co so du lieu. Tu choi la cau tra loi dung: ghi de len mot khoang trong nhu the se lam
     * bien mat chinh dau vet cua lan go do.
     */
    if (existing === null) {
      return this.deny('TELEMATICS_EVENT_ID_REUSED', command, { observationId }, connectorId);
    }

    const same =
      existing.point.latitude === point.latitude &&
      existing.point.longitude === point.longitude &&
      existing.capturedAt.getTime() === command.recordedAt.getTime() &&
      existing.accuracyMetres === command.accuracyMetres &&
      existing.vehicleId === command.vehicleId;

    if (!same) {
      return this.deny(
        'TELEMATICS_EVENT_ID_REUSED',
        command,
        { observationId: existing.id },
        connectorId,
      );
    }
    this.allow(
      'TELEMATICS_OBSERVATION_REPLAYED',
      command,
      { observationId: existing.id },
      connectorId,
    );
    return existing;
  }

  /**
   * MOT ham tu choi, khong tam cho go tay — va no KHONG BAO GIO phat lai than yeu cau cua nha cung
   * cap ra ngoai.
   *
   * `#297` T9 doi *"provider failures do not leak credentials/raw upstream payloads"*. Cai di vao
   * so quyet dinh la ma xe, ma dau noi va mot MA LY DO; khong toa do, khong ma xac thuc, khong mot
   * manh than yeu cau goc nao. Mot thong diep loi tien cho viec go roi hom nay la mot dong log mang
   * bi mat cua khach hom sau.
   */
  private deny(
    reason: TelematicsIngressDenial,
    command: TelematicsIngressCommand,
    detail: Readonly<Record<string, unknown>>,
    connectorId: string | null = null,
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: 'telematics.ingress',
      outcome: 'denied',
      reason,
      detail: { ...detail, ...this.identity(command, connectorId) },
    });
    throw DENIAL_ERROR[reason](reason);
  }

  private allow(
    reason: TelematicsIngressAcceptance,
    command: TelematicsIngressCommand,
    detail: Readonly<Record<string, unknown>>,
    connectorId: string,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: 'telematics.ingress',
      outcome: 'allowed',
      reason,
      detail: { ...detail, ...this.identity(command, connectorId) },
    });
  }

  /**
   * Dung bon truong nay, va khong them. Toa do o lai trong hang bang chung.
   *
   * `connectorId` va `declaredConnectorId` di RIENG, khong gop. Mot dong quyet dinh chi ghi
   * danh tinh da suy ra se doc rat gon, va se khong tra loi duoc dung cau hoi ma mot lan tu choi
   * `TELEMATICS_CONNECTOR_MISMATCH` bat nguoi ta phai hoi: may khach kia dang TUONG minh la ai.
   * `null` o `connectorId` co nghia lan tu choi xay ra TRUOC khi may chu kip suy ra danh tinh
   * — tuc cong 1, chu khong phai mot khoang trong.
   */
  private identity(
    command: TelematicsIngressCommand,
    connectorId: string | null,
  ): Readonly<Record<string, unknown>> {
    return {
      vehicleId: command.vehicleId,
      connectorId,
      declaredConnectorId: command.declaredConnectorId,
      externalEventId: command.externalEventId,
    };
  }
}

/**
 * LENH NHAP — hinh dang da duoc chuan hoa, khong phai than yeu cau cua mot hang.
 *
 * Gan trung `TelematicsFix` cua cong, va co MOT khac biet: no mang them `externalEventId`.
 * `TelematicsFix` mo ta MOT BAN DINH VI; lenh nay mo ta MOT LAN NHAP mot ban dinh vi — va danh
 * tinh cua lan nhap la thu duy nhat chan duoc phat lai.
 *
 * Nua CON LAI cua danh tinh do — dau noi nao — KHONG nam trong lenh nay duoi dang mot gia tri co
 * hieu luc. `declaredConnectorId` chi la thu nguoi goi TUONG, va may chu doi chieu no roi bo di.
 */
export interface TelematicsIngressCommand {
  /**
   * LOI KHANG DINH cua nguoi goi ve dau noi dang gui — KHONG phai danh tinh.
   *
   * `null` nghia la khong khai gi, va do la hinh dang binh thuong: may chu tu biet minh dang cam
   * vao dau noi nao. Khi co gia tri, no phai KHOP chinh xac voi danh tinh suy ra tu cau hinh, neu
   * khong lan nhap bi tu choi truoc moi thao tac ghi. Khong duong nao tu truong nay toi khoa chan
   * phat lai.
   */
  readonly declaredConnectorId: string | null;
  readonly externalEventId: string;
  readonly vehicleId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number | null;
  readonly speedMetresPerSecond: number | null;
  readonly bearingDegrees: number | null;
  /** Dong ho cua HOP GSHT. Khong phai dong ho may chu — xem `record()`. */
  readonly recordedAt: Date;
}

export type TelematicsIngressAcceptance =
  'TELEMATICS_OBSERVATION_RECORDED' | 'TELEMATICS_OBSERVATION_REPLAYED';

export type TelematicsIngressDenial =
  | 'TELEMATICS_PROVIDER_NOT_CONFIGURED'
  | 'TELEMATICS_CONNECTOR_MISMATCH'
  | 'TELEMATICS_VEHICLE_NOT_ENROLLED'
  | 'TELEMATICS_VEHICLE_NOT_FOUND'
  | 'TELEMATICS_EVENT_ID_REUSED'
  | 'COORDINATE_REJECTED';

/**
 * MOI LY DO TU CHOI mot HANG HTTP rieng, va bang nay day du theo KIEU.
 *
 * Nam ma nay tra loi nhung cau hoi khac nhau cua nguoi dang cam dau noi, va gop chung thanh mot ma
 * `400` se buoc ho phai doan: chua khai nha cung cap (mot khoang trong trong TRIEN KHAI, `409`), xe
 * chua gan thiet bi hoac khong co trong doi xe (mot khoang trong trong DU LIEU, `409`/`404`), toa
 * do hong (mot loi trong THAN YEU CAU, `400`), va ma su kien bi dung lai (mot MAU THUAN, `409`).
 */
const DENIAL_ERROR: Readonly<
  Record<TelematicsIngressDenial, (reason: TelematicsIngressDenial) => TransportDomainError>
> = {
  TELEMATICS_PROVIDER_NOT_CONFIGURED: (reason) =>
    TransportDomainError.conflict(
      reason,
      'Khach chua khai mot nha cung cap telematics nao — cua nhap dong',
    ),
  // `409` chu khong `400`: than yeu cau khong hong — no dung dan, chi la no noi ve mot dau noi
  // khac voi dau noi ma may chu dang cam vao. Va CO Y khong tra ve danh tinh that trong loi: mot
  // may khach doan sai khong duoc nhan cau tra loi dung tu chinh lan doan do.
  TELEMATICS_CONNECTOR_MISMATCH: (reason) =>
    TransportDomainError.conflict(
      reason,
      'Dau noi khai trong yeu cau khong khop voi dau noi da cau hinh',
    ),
  TELEMATICS_VEHICLE_NOT_ENROLLED: (reason) =>
    TransportDomainError.conflict(
      reason,
      'Chiec xe nay chua duoc dang ky thiet bi voi nha cung cap',
    ),
  TELEMATICS_VEHICLE_NOT_FOUND: (reason) =>
    TransportDomainError.notFound(reason, 'Khong tim thay chiec xe nay trong doi xe'),
  TELEMATICS_EVENT_ID_REUSED: (reason) =>
    TransportDomainError.conflict(
      reason,
      'Ma su kien nay da duoc dung cho mot ban dinh vi co noi dung khac',
    ),
  COORDINATE_REJECTED: (reason) =>
    TransportDomainError.invalid(reason, 'Toa do khong qua duoc kiem bien'),
};
