import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { assessGeofences, type CircleGeofence } from '../geo/geofence.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  OperationalProofRepository,
  PROOF_CLIENT_EVENT,
  PROOF_OBSERVATION_ONCE,
} from './operational-proof.repository.js';
import type {
  OperationalProof,
  OperationalProofView,
  ProofPhotoCaptureMode,
  RecordProofCommand,
} from './operational-proof.types.js';
import { TRANSPORT_PROOF_DECISIONS } from './proof-decisions.js';
import { TrackingRepository } from './tracking.repository.js';
import type { ProofRiskCode, ProofRiskSeverity } from './tracking.types.js';
import { TransportProofCoreFacts } from './transport-proof-facts.port.js';

/**
 * CHUNG CU VAN HANH — bat dau va giao hang.
 *
 * ============================================================================================
 * VI SAO DICH VU NAY KHONG NHAN MOT TOA DO NAO
 * ============================================================================================
 *
 * `RecordProofCommand` nhan `observationId`, khong nhan `latitude`/`longitude`. Do la mot lua chon
 * co hau qua: mot ban dinh vi di qua duong ingest cua `transport-proof` DA duoc kiem bien, DA co
 * `receivedAt` cua may chu, DA duoc cham rui ro, va DA nam trong mot phien thuoc ve dung lai xe
 * do. Neu chung cu nhan toa do THO, tat ca nhung dieu do bi vong qua — va mot lai xe se lap duoc
 * mot chung cu "tai kho" ma khong he co mot ban dinh vi nao trong chuoi bam vi tri cua ho.
 *
 * Noi cach khac: chung cu KHONG PHAI mot cach ghi vi tri. No la mot cach TRO TOI mot vi tri da
 * duoc ghi.
 *
 * HAI QUY TAC CUA HO SO B (`#232 D-08`), cuong che o day chu khong o giao dien:
 *   · bat dau  -> BAT BUOC co vi tri hien tai;
 *   · giao hang -> BAT BUOC co vi tri hien tai VA it nhat mot tam anh.
 */
@Injectable()
export class OperationalProofService {
  constructor(
    private readonly proofs: OperationalProofRepository,
    private readonly tracking: TrackingRepository,
    private readonly core: TransportProofCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async record(command: RecordProofCommand): Promise<OperationalProof> {
    const driver = await this.core.findDriverByAuthUserId(command.authUserId);
    if (!driver) {
      this.deny('PROOF_DRIVER_BINDING_MISSING', { authUserId: command.authUserId });
      throw TransportDomainError.denied(
        'PROOF_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }

    const trip = await this.core.findTrip(command.tripId);
    if (!trip) {
      this.deny('PROOF_TRIP_NOT_FOUND', { tripId: command.tripId });
      throw TransportDomainError.notFound('PROOF_TRIP_NOT_FOUND', 'Khong tim thay chuyen');
    }
    if (!(await this.core.wasDriverEverAssignedToTrip(trip.id, driver.id))) {
      this.deny('PROOF_DRIVER_NOT_ASSIGNED', { tripId: trip.id, driverId: driver.id });
      throw TransportDomainError.denied(
        'PROOF_DRIVER_NOT_ASSIGNED',
        `Lai xe ${driver.fullName} chua tung duoc phan cong vao chuyen ${trip.code}`,
      );
    }

    // GIAO HANG BAT BUOC CO ANH. Kiem TRUOC khi doc ban dinh vi de mot yeu cau thieu anh khong
    // chiem mat mot ban dinh vi (`observationId` la `@unique`, dung mot lan la khoa vinh vien).
    const active = command.photos.filter((photo) => photo.locator.trim() !== '');
    if (command.kind === 'DELIVERY' && active.length === 0) {
      this.deny('PROOF_PHOTO_REQUIRED', { tripId: trip.id });
      throw TransportDomainError.invalid(
        'PROOF_PHOTO_REQUIRED',
        'Giao hang bat buoc co it nhat mot tam anh',
      );
    }

    const existing = await this.proofs.findByEvent(trip.id, command.kind, command.clientEventId);
    if (existing) {
      this.allow('PROOF_REPLAYED', { proofId: existing.id });
      return existing;
    }

    const observation = await this.tracking.findObservationById(command.observationId);
    if (!observation) {
      this.deny('PROOF_OBSERVATION_NOT_FOUND', { observationId: command.observationId });
      throw TransportDomainError.notFound(
        'PROOF_OBSERVATION_NOT_FOUND',
        'Khong tim thay ban dinh vi cho chung cu nay',
      );
    }

    // Ban dinh vi phai thuoc ve CHINH lai xe dang lap chung cu. Khong co cong nay thi mot lai xe
    // tro duoc chung cu cua minh vao mot ban dinh vi cua dong nghiep — tuc muon vi tri cua nguoi
    // khac lam bang chung cho chinh minh.
    const session = await this.tracking.findSession(observation.sessionId);
    if (!session || session.driverId !== driver.id) {
      this.deny('PROOF_OBSERVATION_NOT_OWNED', {
        observationId: observation.id,
        driverId: driver.id,
      });
      throw TransportDomainError.denied(
        'PROOF_OBSERVATION_NOT_OWNED',
        'Ban dinh vi do khong thuoc ve ban',
      );
    }

    const receivedAt = this.now();
    try {
      const proof = await this.proofs.create({
        kind: command.kind,
        tripId: trip.id,
        driverId: driver.id,
        observationId: observation.id,
        sessionId: session.id,
        clientEventId: command.clientEventId,
        capturedAt: observation.capturedAt,
        receivedAt,
        businessDate: toBusinessDate(receivedAt, this.corePolicy.timeZone),
        note: command.note,
        recordedBy: command.authUserId,
        photos: active,
      });

      this.allow('PROOF_RECORDED', {
        proofId: proof.id,
        kind: proof.kind,
        photoCount: proof.photos.length,
      });

      // Anh lay tu thu vien VAN duoc nhan — no chi khong duoc huong cung muc tin cay im lang.
      for (const photo of proof.photos) {
        if (photo.captureMode !== 'LIVE_CAMERA') {
          this.telemetry?.decision({
            vocabulary: TRANSPORT_PROOF_DECISIONS,
            point: 'proof.record',
            outcome: 'degraded',
            reason: 'PROOF_PHOTO_NOT_LIVE_CAMERA',
            detail: { proofId: proof.id, captureMode: photo.captureMode },
          });
        }
      }
      return proof;
    } catch (error) {
      if (isUniqueViolationOn(error, PROOF_CLIENT_EVENT)) {
        const already = await this.proofs.findByEvent(trip.id, command.kind, command.clientEventId);
        if (already) {
          this.allow('PROOF_REPLAYED', { proofId: already.id });
          return already;
        }
      }
      if (isUniqueViolationOn(error, PROOF_OBSERVATION_ONCE)) {
        this.deny('PROOF_OBSERVATION_ALREADY_USED', { observationId: observation.id });
        throw TransportDomainError.conflict(
          'PROOF_OBSERVATION_ALREADY_USED',
          'Ban dinh vi do da duoc dung cho mot chung cu khac',
        );
      }
      throw error;
    }
  }

  /** Chung cu CUA CHINH MINH — danh tinh tu phien, khong tu than yeu cau. */
  async listOwn(authUserId: string): Promise<readonly OperationalProof[]> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.deny('PROOF_DRIVER_BINDING_MISSING', { authUserId });
      throw TransportDomainError.denied(
        'PROOF_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }
    return this.proofs.listForDriver(driver.id);
  }

  /**
   * KHUNG NHIN cho van hanh — khong mot toa do nao di ra khoi ham nay.
   *
   * Hang rao duoc cham TAI DAY chu khong luu san: mot khach doi ban kinh kho hang hom nay phai
   * thay phan quyet doi theo cho moi chung cu cu, khong phai chi cho nhung chung cu lap sau do.
   */
  async viewsForTrip(
    tripId: string,
    geofences: readonly CircleGeofence[],
  ): Promise<readonly OperationalProofView[]> {
    const proofs = await this.proofs.listForTrip(tripId);
    const views: OperationalProofView[] = [];

    for (const proof of proofs) {
      const observation = await this.tracking.findObservationById(proof.observationId);
      const assessment = observation
        ? assessGeofences(observation.point, observation.accuracyMetres, geofences)
        : null;

      const riskCodes: ProofRiskCode[] = [];
      if (geofences.length === 0) riskCodes.push('NO_GEOFENCE_CONFIGURED');
      if (assessment?.verdict === 'OUTSIDE') riskCodes.push('OUTSIDE_EXPECTED_GEOFENCE');
      if (assessment?.verdict === 'INDETERMINATE') riskCodes.push('GEOFENCE_INDETERMINATE');

      const live = proof.photos.filter((photo) => photo.withdrawnAt === null);
      if (proof.kind === 'DELIVERY' && live.length === 0) riskCodes.push('PHOTO_MISSING');
      if (live.some((photo) => photo.captureMode !== 'LIVE_CAMERA')) {
        riskCodes.push('PHOTO_FROM_GALLERY');
      }

      const byMode: Partial<Record<ProofPhotoCaptureMode, number>> = {};
      for (const photo of live) byMode[photo.captureMode] = (byMode[photo.captureMode] ?? 0) + 1;

      const nearest = assessment?.nearest ?? null;
      views.push({
        id: proof.id,
        kind: proof.kind,
        tripId: proof.tripId,
        driverId: proof.driverId,
        businessDate: proof.businessDate,
        capturedAt: proof.capturedAt,
        receivedAt: proof.receivedAt,
        withdrawn: proof.withdrawnAt !== null,
        photoCount: live.length,
        photosByCaptureMode: byMode,
        geofenceVerdict: assessment?.verdict ?? 'NO_FENCE',
        nearestGeofenceId: nearest?.fenceId ?? null,
        nearestGeofenceDistanceMetres: nearest === null ? null : Math.round(nearest.distanceMetres),
        riskCodes,
        highestSeverity: severityOf(riskCodes),
      });
    }
    return views;
  }

  private allow(reason: string, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: 'proof.record',
      outcome: 'allowed',
      reason: reason as never,
      detail,
    });
  }

  private deny(reason: string, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: 'proof.record',
      outcome: 'denied',
      reason: reason as never,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

/**
 * `PHOTO_MISSING` va `OUTSIDE_EXPECTED_GEOFENCE` la `REVIEW` — hai dieu hiem va co nghia. Anh lay
 * tu thu vien va hang rao khong ket luan duoc la `INFO`: chung thuong xuyen, va chi co nghia khi
 * cong don. Cung mot quy uoc voi `risk-assessment.ts`; xem khoi chu thich dau tep do.
 */
function severityOf(codes: readonly ProofRiskCode[]): ProofRiskSeverity | null {
  if (codes.length === 0) return null;
  const review: readonly ProofRiskCode[] = ['PHOTO_MISSING', 'OUTSIDE_EXPECTED_GEOFENCE'];
  return codes.some((code) => review.includes(code)) ? 'REVIEW' : 'INFO';
}
