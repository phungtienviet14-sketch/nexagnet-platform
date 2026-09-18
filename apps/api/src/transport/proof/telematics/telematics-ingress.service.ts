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
 * BA CONG, VA CA BA DEU DONG KHI CHUA BIET
 * ============================================================================================
 *
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
    let provider: string;
    try {
      const availability = this.telematics.describe();
      if (!availability.available) {
        return this.deny('TELEMATICS_PROVIDER_NOT_CONFIGURED', command, {
          providerReason: availability.reason,
        });
      }
      provider = availability.providerName;
    } catch {
      return this.deny('TELEMATICS_PROVIDER_NOT_CONFIGURED', command, {
        providerReason: 'PROVIDER_UNREACHABLE',
      });
    }

    // CONG 2 — chiec xe NAY co duoc dang ky voi nha cung cap do khong. Muc XE, khong muc khach.
    try {
      if (!this.telematics.describeVehicle(command.vehicleId).available) {
        return this.deny('TELEMATICS_VEHICLE_NOT_ENROLLED', command, {});
      }
    } catch {
      return this.deny('TELEMATICS_VEHICLE_NOT_ENROLLED', command, {
        providerReason: 'PROVIDER_UNREACHABLE',
      });
    }

    // CONG 3 — ma xe phai tro toi mot chiec xe co that trong doi xe cua khach.
    if ((await this.core.findVehicle(command.vehicleId)) === null) {
      return this.deny('TELEMATICS_VEHICLE_NOT_FOUND', command, {});
    }

    const parsed = parseGeoPoint(command.latitude, command.longitude);
    if (!parsed.ok) {
      return this.deny('COORDINATE_REJECTED', command, { rejection: parsed.rejection });
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
      command.providerId,
      command.externalEventId,
    );
    if (existing) return this.resolveReplay(existing.observationId, command, parsed.point);

    const receivedAt = this.now();
    try {
      const observation = await this.repository.appendTelematicsObservation({
        providerId: command.providerId,
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
      this.allow('TELEMATICS_OBSERVATION_RECORDED', command, {
        provider,
        observationId: observation.id,
      });
      return observation;
    } catch (error) {
      // Hai lan gui song song cua CUNG mot su kien: mot ben thang, ben kia doc lai ban vua ghi.
      if (isUniqueViolationOn(error, TELEMATICS_INGRESS_EVENT)) {
        const raced = await this.repository.findTelematicsIngress(
          command.providerId,
          command.externalEventId,
        );
        if (raced) return this.resolveReplay(raced.observationId, command, parsed.point);
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
  ): Promise<LocationObservation> {
    const existing = await this.repository.findObservationById(observationId);
    /*
     * Hang so bien gioi con, hang bang chung mat. Khong duong nao trong ung dung tao ra duoc hinh
     * dang nay (`onDelete: Restrict` o ca hai chieu), nen neu no xuat hien thi da co ai do go tay
     * vao co so du lieu. Tu choi la cau tra loi dung: ghi de len mot khoang trong nhu the se lam
     * bien mat chinh dau vet cua lan go do.
     */
    if (existing === null) {
      return this.deny('TELEMATICS_EVENT_ID_REUSED', command, { observationId });
    }

    const same =
      existing.point.latitude === point.latitude &&
      existing.point.longitude === point.longitude &&
      existing.capturedAt.getTime() === command.recordedAt.getTime() &&
      existing.accuracyMetres === command.accuracyMetres &&
      existing.vehicleId === command.vehicleId;

    if (!same) {
      return this.deny('TELEMATICS_EVENT_ID_REUSED', command, { observationId: existing.id });
    }
    this.allow('TELEMATICS_OBSERVATION_REPLAYED', command, { observationId: existing.id });
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
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: 'telematics.ingress',
      outcome: 'denied',
      reason,
      detail: { ...detail, ...this.identity(command) },
    });
    throw DENIAL_ERROR[reason](reason);
  }

  private allow(
    reason: TelematicsIngressAcceptance,
    command: TelematicsIngressCommand,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: 'telematics.ingress',
      outcome: 'allowed',
      reason,
      detail: { ...detail, ...this.identity(command) },
    });
  }

  /** Dung ba truong nay, va khong them. Toa do o lai trong hang bang chung. */
  private identity(command: TelematicsIngressCommand): Readonly<Record<string, unknown>> {
    return {
      vehicleId: command.vehicleId,
      providerId: command.providerId,
      externalEventId: command.externalEventId,
    };
  }
}

/**
 * LENH NHAP — hinh dang da duoc chuan hoa, khong phai than yeu cau cua mot hang.
 *
 * Gan trung `TelematicsFix` cua cong, va co MOT khac biet: no mang them `providerId` va
 * `externalEventId`. `TelematicsFix` mo ta MOT BAN DINH VI; lenh nay mo ta MOT LAN NHAP mot ban
 * dinh vi — va danh tinh cua lan nhap la thu duy nhat chan duoc phat lai.
 */
export interface TelematicsIngressCommand {
  readonly providerId: string;
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
