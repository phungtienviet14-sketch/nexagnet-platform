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
import { randomBytes } from 'node:crypto';
import {
  OperationalProofRepository,
  ProofChallengeRepository,
  PROOF_CLIENT_EVENT,
  PROOF_OBSERVATION_ONCE,
} from './operational-proof.repository.js';
import type {
  OperationalProof,
  OperationalProofView,
  ProofChallenge,
  ProofPhotoCaptureMode,
  RecordProofCommand,
  WithdrawProofCommand,
} from './operational-proof.types.js';
import { TRANSPORT_PROOF_POLICY, type TransportProofPolicy } from './tracking-policy.js';
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
/** Ba diem quyet dinh ma dich vu nay so huu. Ghi, rut va thach thuc la ba viec khac nhau. */
type ProofDecisionPoint = 'proof.record' | 'proof.withdraw' | 'proof.challenge';

@Injectable()
export class OperationalProofService {
  constructor(
    private readonly proofs: OperationalProofRepository,
    private readonly tracking: TrackingRepository,
    private readonly core: TransportProofCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    private readonly challenges: ProofChallengeRepository,
    @Inject(TRANSPORT_PROOF_POLICY) private readonly proofPolicy: TransportProofPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /**
   * PHAT mot loi thach thuc cho phien dang mo cua chinh nguoi goi.
   *
   * `sessionId` KHONG den tu than yeu cau: no duoc may chu tra ra tu phien dang mo cua lai xe. Neu
   * nhan tu nguoi goi, mot lai xe xin duoc `nonce` gan vao phien cua dong nghiep.
   */
  async issueChallenge(authUserId: string): Promise<ProofChallenge> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.deny('PROOF_DRIVER_BINDING_MISSING', { authUserId });
      throw TransportDomainError.denied(
        'PROOF_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }
    const session = await this.tracking.findActiveSessionForDriver(driver.id);
    if (!session) {
      this.deny('SESSION_NOT_FOUND', { driverId: driver.id }, 'proof.challenge');
      throw TransportDomainError.notFound(
        'SESSION_NOT_FOUND',
        'Chua co phien bam vi tri nao dang mo — mo phien truoc khi lap chung cu',
      );
    }

    const issuedAt = this.now();
    const challenge = await this.challenges.issue({
      // 32 byte ngau nhien tu nguon CSPRNG. Doan duoc mot `nonce` la vong qua ca co che, nen no
      // khong duoc sinh tu dong ho, tu id, hay tu `Math.random`.
      nonce: randomBytes(32).toString('base64url'),
      driverId: driver.id,
      sessionId: session.id,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + this.proofPolicy.challengeTtlSeconds * 1000),
    });
    this.allow(
      'CHALLENGE_ISSUED',
      {
        driverId: driver.id,
        sessionId: session.id,
        ttlSeconds: this.proofPolicy.challengeTtlSeconds,
      },
      'proof.challenge',
    );
    return challenge;
  }

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

    // LOI THACH THUC duoc kiem TRUOC khi ghi, nhung duoc TIEU sau — xem khoi chu thich duoi cho
    // ly do thu tu do khong doi cho duoc.
    const nonce = command.challengeNonce?.trim() ?? '';
    if (nonce !== '') await this.assertChallengeUsable(nonce, driver.id, session.id);

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
        // Dat `false` luc tao, roi NANG len sau khi tieu duoc `nonce`. Neu dat `true` ngay o day,
        // hai yeu cau chay dua cung mot `nonce` se CA HAI mang dau "da kiem", trong khi chi mot
        // trong hai thuc su tieu duoc no.
        challengeVerified: false,
        photos: active,
      });

      let verified = proof;
      if (nonce === '') {
        // KHONG phai mot cao buoc. Duong ngoai tuyen khong xin duoc `nonce`, va do la duong binh
        // thuong cua mot lai xe trong vung lom. Ghi lai su khac biet, khong tu choi no.
        this.telemetry?.decision({
          vocabulary: TRANSPORT_PROOF_DECISIONS,
          point: 'proof.challenge',
          outcome: 'degraded',
          reason: 'CHALLENGE_ABSENT_OFFLINE_PATH',
          detail: { proofId: proof.id, kind: proof.kind },
        });
      } else {
        verified = await this.consumeChallenge(nonce, proof);
      }

      this.allow('PROOF_RECORDED', {
        proofId: proof.id,
        kind: proof.kind,
        photoCount: proof.photos.length,
        challengeVerified: verified.challengeVerified,
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
      return verified;
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

  /**
   * BIA MO mot chung cu.
   *
   * Ba dieu tep nay CO Y khong lam, va tung dieu deu la mot lua chon:
   *
   *   1. KHONG xoa hang. Mot chung cu sai van la mot su kien da xay ra;
   *   2. KHONG tra lai `observationId`. Cai khoa `@unique` tren cot do la MOT CHIEU. Neu rut ma
   *      giai phong ban dinh vi, thi rut chinh la duong tai che mot vi tri cu — dung ban dinh vi
   *      8h sang lam chung cu cho lan giao 5h chieu. Day la yeu cau "stale location ID" cua #235;
   *   3. KHONG cho rut lan hai. Nguoi rut DAU TIEN la thu duy nhat tra loi duoc "ai quyet dinh bo
   *      lan giao nay?", va mot lan ghi de se xoa mat no.
   */
  async withdraw(command: WithdrawProofCommand): Promise<OperationalProof> {
    const current = await this.proofs.findById(command.proofId);
    if (!current) {
      this.deny('PROOF_WITHDRAW_NOT_FOUND', { proofId: command.proofId }, 'proof.withdraw');
      throw TransportDomainError.notFound('PROOF_WITHDRAW_NOT_FOUND', 'Khong tim thay chung cu');
    }
    if (current.withdrawnAt !== null) {
      this.deny(
        'PROOF_ALREADY_WITHDRAWN',
        { proofId: current.id, withdrawnBy: current.withdrawnBy },
        'proof.withdraw',
      );
      throw TransportDomainError.conflict(
        'PROOF_ALREADY_WITHDRAWN',
        'Chung cu nay da duoc rut tu truoc',
      );
    }

    const withdrawn = await this.proofs.withdraw({
      proofId: current.id,
      withdrawnBy: command.actorId,
      withdrawnAt: this.now(),
    });
    if (!withdrawn) {
      this.deny('PROOF_WITHDRAW_NOT_FOUND', { proofId: command.proofId }, 'proof.withdraw');
      throw TransportDomainError.notFound('PROOF_WITHDRAW_NOT_FOUND', 'Khong tim thay chung cu');
    }

    this.allow(
      'PROOF_WITHDRAWN',
      { proofId: withdrawn.id, kind: withdrawn.kind, reason: command.reason },
      'proof.withdraw',
    );
    return withdrawn;
  }

  /**
   * BA CUA TU CHOI cua mot loi thach thuc, va ca ba deu co MA rieng.
   *
   * Gop chung thanh mot `boolean` se lam nguoi truc khong phan biet duoc "may khach gui mot chuoi
   * bia" voi "lai xe bam cham qua nam phut" voi "mot ban ghi bi phat lai" — ba tinh huong doi ba
   * cach xu ly khac han nhau.
   */
  private async assertChallengeUsable(
    nonce: string,
    driverId: string,
    sessionId: string,
  ): Promise<void> {
    const challenge = await this.challenges.findByNonce(nonce);
    if (!challenge) {
      this.deny('CHALLENGE_NOT_FOUND', { driverId }, 'proof.challenge');
      throw TransportDomainError.denied('CHALLENGE_NOT_FOUND', 'Khong tim thay loi thach thuc do');
    }
    if (challenge.driverId !== driverId || challenge.sessionId !== sessionId) {
      this.deny(
        'CHALLENGE_NOT_OWNED',
        { driverId, challengeDriverId: challenge.driverId },
        'proof.challenge',
      );
      throw TransportDomainError.denied(
        'CHALLENGE_NOT_OWNED',
        'Loi thach thuc do khong phat cho phien nay',
      );
    }
    if (challenge.consumedAt !== null) {
      this.deny(
        'CHALLENGE_ALREADY_USED',
        { consumedByProofId: challenge.consumedByProofId },
        'proof.challenge',
      );
      throw TransportDomainError.conflict(
        'CHALLENGE_ALREADY_USED',
        'Loi thach thuc do da duoc dung cho mot chung cu khac',
      );
    }
    // DAY LA PHAN "BOUNDED" cua #235: mot `nonce` xin tu sang khong dung duoc cho buoi chieu.
    if (challenge.expiresAt.getTime() <= this.now().getTime()) {
      this.deny(
        'CHALLENGE_EXPIRED',
        { expiresAt: challenge.expiresAt.toISOString() },
        'proof.challenge',
      );
      throw TransportDomainError.denied('CHALLENGE_EXPIRED', 'Loi thach thuc do da qua han');
    }
  }

  /**
   * Tieu `nonce` SAU khi chung cu da ton tai, vi `consumedByProofId` can mot id co that.
   *
   * Neu tieu that bai (mot yeu cau khac vua thang cuoc chay dua), chung cu VAN duoc giu — mat bang
   * chung la huong sai khong sua duoc — nhung no khong duoc ghi nhan la da kiem.
   */
  private async consumeChallenge(
    nonce: string,
    proof: OperationalProof,
  ): Promise<OperationalProof> {
    const consumed = await this.challenges.consume(nonce, this.now(), proof.id);
    if (!consumed) {
      this.deny('CHALLENGE_ALREADY_USED', { proofId: proof.id }, 'proof.challenge');
      return proof;
    }
    const verified = await this.proofs.markChallengeVerified(proof.id);
    this.allow('CHALLENGE_VERIFIED', { proofId: proof.id }, 'proof.challenge');
    return verified ?? proof;
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
        challengeVerified: proof.challengeVerified,
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

  private allow(
    reason: string,
    detail: Record<string, unknown>,
    point: ProofDecisionPoint = 'proof.record',
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point,
      outcome: 'allowed',
      reason: reason as never,
      detail,
    });
  }

  private deny(
    reason: string,
    detail: Record<string, unknown>,
    point: ProofDecisionPoint = 'proof.record',
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point,
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
