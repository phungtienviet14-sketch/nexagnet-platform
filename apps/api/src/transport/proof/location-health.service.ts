import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import {
  classifyLocationHealth,
  type LocationHealthSample,
  type TrackingExpectation,
  type VehicleLocationHealth,
} from './location-health.js';
import { TRANSPORT_PROOF_DECISIONS } from './proof-decisions.js';
import { VehicleTelematicsPort } from './telematics/vehicle-telematics.port.js';
import { TRANSPORT_PROOF_POLICY, type TransportProofPolicy } from './tracking-policy.js';
import { TrackingRepository } from './tracking.repository.js';

/**
 * SUC KHOE VI TRI cua mot chiec xe, lap tu su that DA GHI — `#297 T5`.
 *
 * ============================================================================================
 * TANG NAY CHI LAP DAU VAO. PHEP CHAM NAM O `location-health.ts`
 * ============================================================================================
 *
 * Tach lam hai la co y: phep cham co bay nguon vao mot ket qua va nam nghia phai phan biet duoc,
 * nen no phai kiem duoc o moi bien ma khong can mot co so du lieu nao. Neu tron hai tang, moi bai
 * kiem bien "dung tren nguong mat" se can mot Postgres va mot dong ho gia — va vi the se khong ai
 * viet du chung.
 *
 * Viec cua tep nay dung ba dieu, va khong dieu nao la mot quyet dinh nghiep vu:
 *
 *   1. ky vong bam vi tri den tu PHIEN DANG MO cua chiec xe, khong tu than yeu cau;
 *   2. ban dinh vi den tu ban moi nhat cua TUNG NGUON, khong phai ban moi nhat noi chung;
 *   3. "khach da khai telematics chua" den tu `describe()` cua cong, khong tu mot co cau hinh.
 *
 * ============================================================================================
 * VI SAO KHONG PHAI MOT WORKFLOW, VA KHONG PHAI MOT BO NHO DEM
 * ============================================================================================
 *
 * Suc khoe vi tri duoc SUY RA luc co nguoi hoi, tu nhung hang da ghi. Khong mot tien trinh nen
 * nao cham nhip, khong mot bang trang thai nao phai giu dong bo, va khong mot workflow nao chay
 * cho moi diem GPS (`#297` ghi ro dieu do).
 *
 * Hau qua tot cua cach nay la tinh chat ma `T11.6` doi: khoi dong lai API thi trang thai duoc suy
 * ra y nguyen, vi khong co trang thai nao song trong bo nho ca.
 */
@Injectable()
export class LocationHealthService {
  constructor(
    private readonly repository: TrackingRepository,
    /**
     * Cong telematics — dung o day CHI de hoi `describe()`, khong de `fetch()`.
     *
     * Su khac nhau quan trong: `describe()` tra loi *"khach nay co nguon thu hai khong"*, va do la
     * dieu duy nhat phep cham can biet de KHONG bao mot khach chua mua hop GSHT nao la "mat ca hai
     * nguon". Ban dinh vi telematics that thi di vao he qua duong ghi binh thuong
     * (`LocationObservation` voi `source: 'TELEMATICS'`), nen tep nay khong goi ra ngoai mang.
     */
    private readonly telematics: VehicleTelematicsPort,
    @Inject(TRANSPORT_PROOF_POLICY) private readonly policy: TransportProofPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  /**
   * KHACH DA KHAI MOT NGUON THU HAI CHUA.
   *
   * `describe()` co the nem — mot adapter that goi ra mang de tra loi cau nay. Mot lan nem KHONG
   * duoc lam ca phep cham chet: cau tra loi an toan la "coi nhu chua khai", vi no dan toi `LOST`
   * (mot canh bao) chu khong dan toi `ALL_SOURCES_LOST` hay mot trang thai binh thuong gia.
   */
  private telematicsConfigured(): boolean {
    try {
      return this.telematics.describe().available;
    } catch {
      return false;
    }
  }

  async forVehicle(vehicleId: string): Promise<VehicleLocationHealth> {
    const run = () => this.compute(vehicleId);
    // Fail-open: thieu telemetry thi nghiep vu van chay nguyen ven.
    return this.telemetry ? this.telemetry.step('tracking.location_health', run) : run();
  }

  private async compute(vehicleId: string): Promise<VehicleLocationHealth> {
    const now = this.now();
    const session = await this.repository.findActiveSessionForVehicle(vehicleId);

    /*
     * KHONG CO PHIEN DANG MO = KHONG CO KY VONG, va do la duong ra `NOT_TRACKED`.
     *
     * Van hoi ban dinh vi khi khong co ky vong se lam gi? Phep cham tra ve `NOT_TRACKED` kem
     * `lastKnown: null` du co ban hay khong — nen mot lan hoi them chi ton mot truy van de nem ket
     * qua di. Bo qua o day cho ra dung cung mot cau tra loi, re hon, va khong mo mot nang luc doc
     * vi tri cho nhung chiec xe khong ai theo doi.
     */
    const expectation: TrackingExpectation | null = session
      ? { tripId: session.tripId, sessionId: session.id, since: session.startedAt }
      : null;

    const samples: readonly LocationHealthSample[] = expectation
      ? (await this.repository.latestObservationPerSourceForVehicle(vehicleId)).map(
          (observation) => ({
            source: observation.source,
            point: observation.point,
            accuracyMetres: observation.accuracyMetres,
            // `receivedAt`, KHONG `capturedAt`. Cau dang hoi la "he thong nghe thay chiec xe nay
            // lan cuoi luc nao", nen dong ho MAY CHU moi la su that; `capturedAt` la dong ho may
            // khach va mot may bi chinh gio se tu bao minh con song.
            receivedAt: observation.receivedAt,
            sessionId: observation.sessionId,
          }),
        )
      : [];

    const health = classifyLocationHealth(
      { vehicleId, expectation, samples, telematicsConfigured: this.telematicsConfigured() },
      now,
      this.policy.health,
    );

    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: 'tracking.location_health',
      /*
       * BA ket qua, khong hai. `NOT_TRACKED` la `allowed` chu khong `degraded`: mot chiec xe khong
       * ai yeu cau bam vi tri la mot trien khai HOP LE, va cham no thanh `degraded` se do mot so
       * bao dong bang so xe khong theo doi len mot bang dieu hanh mai mai.
       */
      outcome: health.status === 'LIVE' || health.status === 'NOT_TRACKED' ? 'allowed' : 'degraded',
      reason: health.reason,
      detail: {
        vehicleId,
        status: health.status,
        currentSource: health.currentSource,
        ageSeconds: health.ageSeconds,
        // Toa do KHONG di vao telemetry. Duong di cua mot con nguoi khong thuoc ve so quyet dinh;
        // no o lai trong `LocationObservation`, sau cong quyen doc lich su.
        sources: health.sources.map((source) => `${source.family}:${source.status}`),
      },
    });

    return health;
  }
}
