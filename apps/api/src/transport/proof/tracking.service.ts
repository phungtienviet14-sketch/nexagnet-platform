import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { greatCircleMetres } from '../geo/geodesy.js';
import { parseGeoPoint } from '../geo/geo-point.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_PROOF_DECISIONS } from './proof-decisions.js';
import { ACTIVE_TRACKING_SESSION, DEVICE_INSTALLATION_ID } from './proof-storage-conflict.js';
import { assessObservationRisk, clockSkewSeconds } from './risk-assessment.js';
import { TRANSPORT_PROOF_POLICY, type TransportProofPolicy } from './tracking-policy.js';
import { TrackingRepository, type AppendRiskFlagInput } from './tracking.repository.js';
import type {
  IngestObservationCommand,
  LocationObservation,
  LocationTrackView,
  OpenTrackingSessionCommand,
  ProofRiskCode,
  TrackingSession,
  TrackingSummaryView,
} from './tracking.types.js';
import { TransportProofCoreFacts } from './transport-proof-facts.port.js';

/**
 * BAM VI TRI — dich vu.
 *
 * BA DIEU DUOC BAO DAM BANG CAU TRUC, khong bang ky luat:
 *
 *   1. **Danh tinh chi den tu phien.** Khong mot ham cong khai nao o day nhan `driverId`. Chung
 *      nhan `authUserId`, va tu do di qua `TransportDriver.authUserId` de ra ho so lai xe. Lai xe
 *      A khong co duong nao go ten lai xe B vao mot yeu cau.
 *   2. **Xe do MAY CHU giai.** `vehicleId` khong ton tai trong bat ky lenh nao; no duoc doc tu ban
 *      phan cong dang hieu luc cua chuyen. Neu de may khach gui, mot lai xe gan duoc mot chuoi toa
 *      do bat ky vao mot chiec xe bat ky.
 *   3. **Chuyen phai la chuyen CUA CHINH HO.** `wasDriverEverAssignedToTrip` la cong; vai `SALE`
 *      khong the la cong, vi hai lai xe khac nhau cung mang dung vai do.
 *
 * VA MOT DIEU KHONG BAO GIO XAY RA O DAY: khong mot co rui ro nao sinh ra cong no, tru luong hay
 * ket luan gian lan (#232 D-02). Chung duoc GHI canh ban ghi, va dung o do.
 */
@Injectable()
export class TrackingService {
  constructor(
    private readonly repository: TrackingRepository,
    private readonly core: TransportProofCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Inject(TRANSPORT_PROOF_POLICY) private readonly policy: TransportProofPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* ------------------------------------------------------------------ *
   * Mo phien
   * ------------------------------------------------------------------ */

  async openSession(command: OpenTrackingSessionCommand): Promise<TrackingSession> {
    const driver = await this.requireDriver(command.authUserId, 'tracking.session_open');

    const trip = await this.core.findTrip(command.tripId);
    if (!trip) {
      this.deny('tracking.session_open', 'TRIP_NOT_FOUND', { tripId: command.tripId });
      throw TransportDomainError.notFound(
        'TRIP_NOT_FOUND',
        `Khong tim thay chuyen ${command.tripId}`,
      );
    }
    if (
      trip.status === 'DELIVERED' ||
      trip.status === 'RECONCILED' ||
      trip.status === 'CANCELLED'
    ) {
      this.deny('tracking.session_open', 'TRIP_NOT_ACTIVE', {
        tripId: trip.id,
        status: trip.status,
      });
      throw TransportDomainError.conflict(
        'TRIP_NOT_ACTIVE',
        `Chuyen ${trip.code} da o trang thai ${trip.status} — khong con gi de bam`,
      );
    }
    if (!(await this.core.wasDriverEverAssignedToTrip(trip.id, driver.id))) {
      this.deny('tracking.session_open', 'DRIVER_NOT_ASSIGNED_TO_TRIP', {
        tripId: trip.id,
        driverId: driver.id,
      });
      throw TransportDomainError.denied(
        'DRIVER_NOT_ASSIGNED_TO_TRIP',
        `Lai xe ${driver.fullName} chua tung duoc phan cong vao chuyen ${trip.code}`,
      );
    }

    // Phien dang mo TREN DUNG chuyen nay -> tra lai ban cu. Day la duong chay binh thuong cua mot
    // ung dung vua khoi dong lai, khong phai mot loi.
    const open = await this.repository.findActiveSessionForDriver(driver.id);
    if (open?.tripId === trip.id) {
      this.allow('tracking.session_open', 'SESSION_ALREADY_OPEN', {
        sessionId: open.id,
        tripId: trip.id,
      });
      return open;
    }
    if (open) {
      this.deny('tracking.session_open', 'DRIVER_HAS_ANOTHER_OPEN_SESSION', {
        openSessionId: open.id,
        openTripId: open.tripId,
        requestedTripId: trip.id,
      });
      throw TransportDomainError.conflict(
        'DRIVER_HAS_ANOTHER_OPEN_SESSION',
        'Lai xe dang co mot phien mo tren chuyen khac — dong phien do truoc',
      );
    }

    const deviceInstallationId = await this.bindDevice(command, driver.id);
    const now = this.now();

    try {
      const session = await this.repository.createSession({
        driverId: driver.id,
        tripId: trip.id,
        // Diem 2 cua khoi chu thich dau tep: xe den tu ban phan cong, khong tu than yeu cau.
        vehicleId: await this.core.activeVehicleForTrip(trip.id),
        deviceInstallationId,
        businessDate: toBusinessDate(now, this.corePolicy.timeZone),
        startedAt: now,
        openedBy: command.authUserId,
      });
      this.allow('tracking.session_open', 'SESSION_OPENED', {
        sessionId: session.id,
        tripId: trip.id,
        driverId: driver.id,
      });
      return session;
    } catch (error) {
      // Cuoc dua: hai thiet bi mo phien cung luc. Ca hai lot qua phep kiem o tren; chi muc mot
      // phan duoi Postgres chan mot trong hai. Dich ra dung cau ma nguoi dung hieu.
      if (isUniqueViolationOn(error, ACTIVE_TRACKING_SESSION)) {
        this.deny('tracking.session_open', 'DRIVER_HAS_ANOTHER_OPEN_SESSION', {
          driverId: driver.id,
        });
        throw TransportDomainError.conflict(
          'DRIVER_HAS_ANOTHER_OPEN_SESSION',
          'Lai xe vua mo mot phien khac tu mot thiet bi khac',
        );
      }
      throw error;
    }
  }

  /* ------------------------------------------------------------------ *
   * Dong phien
   * ------------------------------------------------------------------ */

  async closeSession(
    authUserId: string,
    sessionId: string,
    reason: string,
  ): Promise<TrackingSession> {
    const driver = await this.requireDriver(authUserId, 'tracking.session_close');
    const session = await this.repository.findSession(sessionId);
    if (!session) {
      this.deny('tracking.session_close', 'SESSION_NOT_FOUND', { sessionId });
      throw TransportDomainError.notFound('SESSION_NOT_FOUND', `Khong tim thay phien ${sessionId}`);
    }
    if (session.driverId !== driver.id) {
      // KHONG tra ve `NOT_FOUND` de "khoi lo": phien co that, va ghi dung ly do vao so quyet dinh
      // moi lam mot lan do quyen truy cap nhin ra duoc trong log.
      this.deny('tracking.session_close', 'SESSION_NOT_OWNED', { sessionId, driverId: driver.id });
      throw TransportDomainError.denied('SESSION_NOT_OWNED', 'Phien nay khong thuoc ve ban');
    }
    if (session.status !== 'ACTIVE') {
      this.allow('tracking.session_close', 'SESSION_ALREADY_CLOSED', { sessionId });
      return session;
    }
    const closed = await this.repository.closeSession(sessionId, this.now(), reason);
    this.allow('tracking.session_close', 'SESSION_CLOSED', {
      sessionId,
      observationCount: closed.observationCount,
    });
    return closed;
  }

  /* ------------------------------------------------------------------ *
   * Nhan mot ban dinh vi
   * ------------------------------------------------------------------ */

  async ingest(command: IngestObservationCommand): Promise<LocationObservation> {
    const driver = await this.requireDriver(command.authUserId, 'tracking.observation_ingest');
    const session = await this.repository.findSession(command.sessionId);
    if (!session) {
      this.deny('tracking.observation_ingest', 'SESSION_NOT_FOUND', {
        sessionId: command.sessionId,
      });
      throw TransportDomainError.notFound(
        'SESSION_NOT_FOUND',
        `Khong tim thay phien ${command.sessionId}`,
      );
    }
    if (session.driverId !== driver.id) {
      this.deny('tracking.observation_ingest', 'SESSION_NOT_OWNED', {
        sessionId: session.id,
        driverId: driver.id,
      });
      throw TransportDomainError.denied('SESSION_NOT_OWNED', 'Phien nay khong thuoc ve ban');
    }
    if (session.status !== 'ACTIVE') {
      this.deny('tracking.observation_ingest', 'SESSION_NOT_ACTIVE', { sessionId: session.id });
      throw TransportDomainError.conflict(
        'SESSION_NOT_ACTIVE',
        'Phien da dong — khong nhan them ban dinh vi',
      );
    }

    const parsed = parseGeoPoint(command.latitude, command.longitude);
    if (!parsed.ok) {
      this.deny('tracking.observation_ingest', 'COORDINATE_REJECTED', {
        rejection: parsed.rejection,
      });
      throw TransportDomainError.invalid(
        'COORDINATE_REJECTED',
        `Toa do khong hop le: ${parsed.rejection}`,
      );
    }

    const existing = await this.repository.findObservationByEventId(
      session.id,
      command.clientEventId,
    );
    if (existing) return this.resolveReplay(existing, command, parsed.point);

    const receivedAt = this.now();
    const previous = await this.repository.lastObservation(session.id);
    const observation = await this.repository.appendObservation({
      sessionId: session.id,
      clientEventId: command.clientEventId,
      latitude: parsed.point.latitude,
      longitude: parsed.point.longitude,
      accuracyMetres: command.accuracyMetres,
      speedMetresPerSecond: command.speedMetresPerSecond,
      bearingDegrees: command.bearingDegrees,
      source: command.source,
      capturedAt: command.capturedAt,
      receivedAt,
      // `receivedAt` la su that; `capturedAt` la loi khai. Do lech duoc GHI, khong duoc dung de
      // tu choi — mot do lech lon gan nhu luon la "may vua offline", khong phai "ai do chinh gio".
      clockSkewSeconds: clockSkewSeconds(command.capturedAt, receivedAt),
      mockLocationReported: command.mockLocationReported,
      businessDate: toBusinessDate(receivedAt, this.corePolicy.timeZone),
    });

    await this.recordRisk(observation, previous, receivedAt);

    this.allow('tracking.observation_ingest', 'OBSERVATION_RECORDED', {
      sessionId: session.id,
      observationId: observation.id,
    });
    return observation;
  }

  /* ------------------------------------------------------------------ *
   * Doc
   * ------------------------------------------------------------------ */

  async summariesForTrip(tripId: string): Promise<readonly TrackingSummaryView[]> {
    const sessions = await this.repository.listSessionsForTrip(tripId);
    return Promise.all(sessions.map((session) => this.summarise(session)));
  }

  async summariesForDriver(authUserId: string): Promise<readonly TrackingSummaryView[]> {
    const driver = await this.requireDriver(authUserId, 'tracking.session_open');
    const sessions = await this.repository.listSessionsForDriver(driver.id);
    return Promise.all(sessions.map((session) => this.summarise(session)));
  }

  /**
   * DUONG DI THO. Moi lan doc deu de lai mot dong trong so quyet dinh — "ai da xem duong di cua
   * ai" ban than no cung la mot su kien dang ghi.
   */
  async trackForSession(sessionId: string, actor: string): Promise<LocationTrackView> {
    const session = await this.repository.findSession(sessionId);
    if (!session) {
      throw TransportDomainError.notFound('SESSION_NOT_FOUND', `Khong tim thay phien ${sessionId}`);
    }
    const points = await this.repository.listObservations(sessionId);
    this.allow('tracking.history_read', 'HISTORY_READ_GRANTED', {
      sessionId,
      driverId: session.driverId,
      actor,
      pointCount: points.length,
    });
    return { sessionId, points };
  }

  /* ------------------------------------------------------------------ *
   * Ben trong
   * ------------------------------------------------------------------ */

  private async summarise(session: TrackingSession): Promise<TrackingSummaryView> {
    const points = await this.repository.listObservations(session.id);
    const flags = await this.repository.listRiskFlagsForSession(session.id);

    const riskCounts: Partial<Record<ProofRiskCode, number>> = {};
    for (const flag of flags) {
      riskCounts[flag.code] = (riskCounts[flag.code] ?? 0) + 1;
    }

    let travelledMetres = 0;
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (from && to) travelledMetres += greatCircleMetres(from.point, to.point);
    }

    return {
      sessionId: session.id,
      tripId: session.tripId,
      driverId: session.driverId,
      status: session.status,
      businessDate: session.businessDate,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      observationCount: points.length,
      firstObservedAt: points.at(0)?.capturedAt ?? null,
      lastObservedAt: points.at(-1)?.capturedAt ?? null,
      travelledMetres: Math.round(travelledMetres),
      riskCounts,
      highestSeverity: flags.some((flag) => flag.severity === 'REVIEW')
        ? 'REVIEW'
        : flags.length > 0
          ? 'INFO'
          : null,
    };
  }

  private async recordRisk(
    observation: LocationObservation,
    previous: LocationObservation | null,
    receivedAt: Date,
  ): Promise<void> {
    const findings = assessObservationRisk(
      {
        point: observation.point,
        accuracyMetres: observation.accuracyMetres,
        capturedAt: observation.capturedAt,
        receivedAt: observation.receivedAt,
        mockLocationReported: observation.mockLocationReported,
        // Toan ven thiet bi cua tranche nay luon `UNKNOWN`: chua co adapter Play Integrity /
        // App Attest nao. `UNKNOWN` KHONG sinh co — xem `risk-assessment.ts`.
        deviceIntegrity: 'UNKNOWN',
        previous:
          previous === null
            ? null
            : {
                point: previous.point,
                accuracyMetres: previous.accuracyMetres,
                capturedAt: previous.capturedAt,
              },
      },
      this.policy,
    );

    if (findings.length === 0) {
      this.allow('tracking.risk_assessed', 'RISK_NONE', { observationId: observation.id });
      return;
    }

    const inputs: AppendRiskFlagInput[] = findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      observationId: observation.id,
      detail: finding.detail,
      businessDate: observation.businessDate,
      raisedAt: receivedAt,
    }));
    await this.repository.appendRiskFlags(inputs);

    for (const finding of findings) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_PROOF_DECISIONS,
        point: 'tracking.risk_assessed',
        // `degraded`, khong `denied`: ban ghi VAN duoc nhan. Cai giam la do tin cay, khong phai
        // quyen cua nguoi gui.
        outcome: 'degraded',
        reason: `RISK_${finding.code}` as never,
        detail: { observationId: observation.id, ...finding.detail },
      });
    }
  }

  /**
   * Phat lai hay dung lai khoa? Hai chuyen khac han nhau — cung mot le voi `costing-replay.ts`.
   *
   * Cung khoa + cung noi dung = mang chap chon hoac hang doi ngoai tuyen gui lai -> tra ban cu.
   * Cung khoa + KHAC noi dung = mot khoa bi dung lai cho mot su kien moi -> neu tra ban cu thi ban
   * dinh vi moi bien mat khong dau vet, va do la dung cai ma mot nguoi muon che giau se lam.
   */
  private resolveReplay(
    existing: LocationObservation,
    command: IngestObservationCommand,
    point: { latitude: number; longitude: number },
  ): LocationObservation {
    const same =
      existing.point.latitude === point.latitude &&
      existing.point.longitude === point.longitude &&
      existing.capturedAt.getTime() === command.capturedAt.getTime() &&
      existing.accuracyMetres === command.accuracyMetres &&
      existing.source === command.source;

    if (!same) {
      this.deny('tracking.observation_ingest', 'OBSERVATION_EVENT_ID_REUSED', {
        sessionId: existing.sessionId,
        clientEventId: existing.clientEventId,
      });
      throw TransportDomainError.conflict(
        'OBSERVATION_EVENT_ID_REUSED',
        `Ma su kien ${existing.clientEventId} da duoc dung cho mot ban dinh vi khac`,
      );
    }
    this.allow('tracking.observation_ingest', 'OBSERVATION_REPLAYED', {
      sessionId: existing.sessionId,
      observationId: existing.id,
    });
    return existing;
  }

  private async bindDevice(
    command: OpenTrackingSessionCommand,
    driverId: string,
  ): Promise<string | null> {
    if (command.device === null) return null;
    const existing = await this.repository.findDeviceByInstallationId(
      command.device.installationId,
    );
    if (existing?.revokedAt) {
      this.deny('tracking.session_open', 'DEVICE_REVOKED', {
        installationId: command.device.installationId,
      });
      throw TransportDomainError.denied('DEVICE_REVOKED', 'Ma cai dat ung dung da bi thu hoi');
    }
    try {
      const device = await this.repository.upsertDevice({
        driverId,
        installationId: command.device.installationId,
        platform: command.device.platform,
        appVersion: command.device.appVersion,
        integrityVerdict: command.device.integrityVerdict ?? 'UNKNOWN',
        seenAt: this.now(),
      });
      return device.id;
    } catch (error) {
      if (isUniqueViolationOn(error, DEVICE_INSTALLATION_ID)) {
        this.deny('tracking.session_open', 'DEVICE_BOUND_TO_ANOTHER_DRIVER', {
          installationId: command.device.installationId,
        });
        throw TransportDomainError.denied(
          'DEVICE_BOUND_TO_ANOTHER_DRIVER',
          'Ma cai dat ung dung nay da gan voi mot lai xe khac',
        );
      }
      throw error;
    }
  }

  private async requireDriver(
    authUserId: string,
    point: string,
  ): Promise<{ id: string; fullName: string }> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.deny(point, 'DRIVER_BINDING_MISSING', { authUserId });
      throw TransportDomainError.denied(
        'DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }
    return driver;
  }

  private allow(point: string, reason: string, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: point as never,
      outcome: 'allowed',
      reason: reason as never,
      detail,
    });
  }

  private deny(point: string, reason: string, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PROOF_DECISIONS,
      point: point as never,
      outcome: 'denied',
      reason: reason as never,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
