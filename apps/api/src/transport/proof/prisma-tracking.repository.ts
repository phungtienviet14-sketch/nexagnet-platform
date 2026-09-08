import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  TransportDeviceInstallation as PrismaDevice,
  TransportLocationObservation as PrismaObservation,
  TransportProofRiskFlag as PrismaRiskFlag,
  TransportTrackingSession as PrismaSession,
} from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service.js';
import {
  TrackingRepository,
  type AppendObservationInput,
  type AppendRiskFlagInput,
  type CreateTrackingSessionInput,
  type UpsertDeviceInput,
} from './tracking.repository.js';
import type {
  DeviceInstallation,
  LocationObservation,
  ProofRiskFlag,
  TrackingSession,
} from './tracking.types.js';

/**
 * Hien thuc Postgres cua kho `transport-proof`.
 *
 * KHONG bat `P2002` o day. Ba bat bien cua tang nay (mot phien mo moi lai xe, chan phat lai, mot
 * ma cai dat mot chu) duoc cuong che boi chi muc duoi co so du lieu, va viec DICH mot va cham
 * thanh mot cau nguoi dung hieu la viec cua `TrackingService` — no biet nguoi goi dang lam gi,
 * con kho thi khong. Kho de loi bay len nguyen ven de `isUniqueViolationOn` con doc duoc.
 */
@Injectable()
export class PrismaTrackingRepository extends TrackingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createSession(input: CreateTrackingSessionInput): Promise<TrackingSession> {
    const row = await this.prisma.transportTrackingSession.create({
      data: {
        driverId: input.driverId,
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        deviceInstallationId: input.deviceInstallationId,
        businessDate: input.businessDate,
        startedAt: input.startedAt,
        openedBy: input.openedBy,
      },
    });
    return toSession(row);
  }

  async findSession(sessionId: string): Promise<TrackingSession | null> {
    const row = await this.prisma.transportTrackingSession.findUnique({ where: { id: sessionId } });
    return row ? toSession(row) : null;
  }

  async findActiveSessionForDriver(driverId: string): Promise<TrackingSession | null> {
    const row = await this.prisma.transportTrackingSession.findFirst({
      where: { driverId, status: 'ACTIVE' },
    });
    return row ? toSession(row) : null;
  }

  async closeSession(
    sessionId: string,
    endedAt: Date,
    endedReason: string,
  ): Promise<TrackingSession> {
    const row = await this.prisma.transportTrackingSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', endedAt, endedReason },
    });
    return toSession(row);
  }

  async listSessionsForTrip(tripId: string): Promise<readonly TrackingSession[]> {
    const rows = await this.prisma.transportTrackingSession.findMany({
      where: { tripId },
      orderBy: { startedAt: 'asc' },
    });
    return rows.map(toSession);
  }

  async listSessionsForDriver(driverId: string): Promise<readonly TrackingSession[]> {
    const rows = await this.prisma.transportTrackingSession.findMany({
      where: { driverId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(toSession);
  }

  async findObservationByEventId(
    sessionId: string,
    clientEventId: string,
  ): Promise<LocationObservation | null> {
    const row = await this.prisma.transportLocationObservation.findFirst({
      where: { sessionId, clientEventId },
    });
    return row ? toObservation(row) : null;
  }

  async lastObservation(sessionId: string): Promise<LocationObservation | null> {
    const row = await this.prisma.transportLocationObservation.findFirst({
      where: { sessionId },
      orderBy: { capturedAt: 'desc' },
    });
    return row ? toObservation(row) : null;
  }

  /**
   * Ban dinh vi moi nhat cua mot CHIEC XE — loc qua quan he phien.
   *
   * `@@index([sessionId, capturedAt])` khong phuc vu truy van nay, va do la mot su that duoc chap
   * nhan co y thuc: doi xe hien tai khoang 10 chiec va moi lan mo bang de nghi chi hoi dung mot
   * lan cho moi xe. Ngay con so do doi (mot bang dieu hanh tu lam moi moi 10 giay cho 100 xe), cau
   * tra loi dung la mot chi muc `(sessionId, receivedAt)` hoac mot bang "vi tri gan nhat" duoc cap
   * nhat luc nhan tin — khong phai mot bo nho dem o tang nay.
   */
  async latestObservationForVehicle(vehicleId: string): Promise<LocationObservation | null> {
    const row = await this.prisma.transportLocationObservation.findFirst({
      where: { session: { vehicleId } },
      orderBy: { receivedAt: 'desc' },
    });
    return row ? toObservation(row) : null;
  }

  async findObservationById(observationId: string): Promise<LocationObservation | null> {
    const row = await this.prisma.transportLocationObservation.findUnique({
      where: { id: observationId },
    });
    return row ? toObservation(row) : null;
  }

  async appendObservation(input: AppendObservationInput): Promise<LocationObservation> {
    // Mot giao dich, hai buoc: ghi ban dinh vi va tang bo dem cua phien. Tach ra se de lai nhung
    // phien co `observationCount` khong khop so hang that — mot con so sai trong khung nhin tom
    // tat la thu khong ai kiem lai bang mat.
    const row = await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as unknown as PrismaService;
      const created = await tx.transportLocationObservation.create({
        data: {
          sessionId: input.sessionId,
          clientEventId: input.clientEventId,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMetres: input.accuracyMetres,
          speedMetresPerSecond: input.speedMetresPerSecond,
          bearingDegrees: input.bearingDegrees,
          source: input.source,
          capturedAt: input.capturedAt,
          receivedAt: input.receivedAt,
          clockSkewSeconds: input.clockSkewSeconds,
          mockLocationReported: input.mockLocationReported,
          businessDate: input.businessDate,
        },
      });
      await tx.transportTrackingSession.update({
        where: { id: input.sessionId },
        data: { observationCount: { increment: 1 } },
      });
      return created;
    });
    return toObservation(row);
  }

  async listObservations(sessionId: string): Promise<readonly LocationObservation[]> {
    const rows = await this.prisma.transportLocationObservation.findMany({
      where: { sessionId },
      orderBy: { capturedAt: 'asc' },
    });
    return rows.map(toObservation);
  }

  async appendRiskFlags(inputs: readonly AppendRiskFlagInput[]): Promise<readonly ProofRiskFlag[]> {
    const created: ProofRiskFlag[] = [];
    for (const input of inputs) {
      const row = await this.prisma.transportProofRiskFlag.create({
        data: {
          code: input.code,
          severity: input.severity,
          observationId: input.observationId,
          detail: input.detail as Prisma.InputJsonValue,
          businessDate: input.businessDate,
          raisedAt: input.raisedAt,
        },
      });
      created.push(toRiskFlag(row));
    }
    return created;
  }

  async listRiskFlagsForSession(sessionId: string): Promise<readonly ProofRiskFlag[]> {
    const rows = await this.prisma.transportProofRiskFlag.findMany({
      where: { observation: { sessionId } },
      orderBy: { raisedAt: 'asc' },
    });
    return rows.map(toRiskFlag);
  }

  async findDeviceByInstallationId(installationId: string): Promise<DeviceInstallation | null> {
    const row = await this.prisma.transportDeviceInstallation.findUnique({
      where: { installationId },
    });
    return row ? toDevice(row) : null;
  }

  async upsertDevice(input: UpsertDeviceInput): Promise<DeviceInstallation> {
    const existing = await this.prisma.transportDeviceInstallation.findUnique({
      where: { installationId: input.installationId },
    });
    if (existing) {
      // Mot ma cai dat KHONG doi chu. Neu lai xe khac trinh no, phat ra dung hinh dang va cham ma
      // `isUniqueViolationOn` doc duoc — thay vi lang le cap nhat `driverId` sang nguoi moi.
      if (existing.driverId !== input.driverId) {
        throw uniqueViolation('TransportDeviceInstallation_installationId_key', 'installationId');
      }
      const updated = await this.prisma.transportDeviceInstallation.update({
        where: { id: existing.id },
        data: {
          platform: input.platform,
          appVersion: input.appVersion,
          integrityVerdict: input.integrityVerdict,
          integrityCheckedAt: input.integrityVerdict === 'UNKNOWN' ? undefined : input.seenAt,
          lastSeenAt: input.seenAt,
        },
      });
      return toDevice(updated);
    }
    const row = await this.prisma.transportDeviceInstallation.create({
      data: {
        driverId: input.driverId,
        installationId: input.installationId,
        platform: input.platform,
        appVersion: input.appVersion,
        integrityVerdict: input.integrityVerdict,
        integrityCheckedAt: input.integrityVerdict === 'UNKNOWN' ? null : input.seenAt,
        firstSeenAt: input.seenAt,
        lastSeenAt: input.seenAt,
      },
    });
    return toDevice(row);
  }
}

/**
 * Cung hinh dang loi ma Postgres phat ra khi cham unique.
 *
 * Truong hop "ma cai dat da thuoc lai xe khac" khong cham chi muc duoc — hang da co, ta chi tu
 * choi GHI DE no. Nen phai phat ra dung hinh dang do bang tay, de dich vu chi co MOT duong xu ly
 * thay vi hai.
 */
function uniqueViolation(indexName: string, column: string): Error {
  const error = new Error(`Unique constraint failed on the index: ${indexName}`);
  Object.assign(error, {
    code: 'P2002',
    meta: { modelName: 'TransportDeviceInstallation', target: [column] },
  });
  return error;
}

function toSession(row: PrismaSession): TrackingSession {
  return {
    id: row.id,
    driverId: row.driverId,
    tripId: row.tripId,
    vehicleId: row.vehicleId,
    deviceInstallationId: row.deviceInstallationId,
    status: row.status,
    businessDate: row.businessDate,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    endedReason: row.endedReason,
    observationCount: row.observationCount,
    openedBy: row.openedBy,
  };
}

function toObservation(row: PrismaObservation): LocationObservation {
  return {
    id: row.id,
    sessionId: row.sessionId,
    clientEventId: row.clientEventId,
    point: { latitude: row.latitude, longitude: row.longitude },
    accuracyMetres: row.accuracyMetres,
    speedMetresPerSecond: row.speedMetresPerSecond,
    bearingDegrees: row.bearingDegrees,
    source: row.source,
    capturedAt: row.capturedAt,
    receivedAt: row.receivedAt,
    clockSkewSeconds: row.clockSkewSeconds,
    mockLocationReported: row.mockLocationReported,
    businessDate: row.businessDate,
  };
}

function toRiskFlag(row: PrismaRiskFlag): ProofRiskFlag {
  return {
    id: row.id,
    code: row.code,
    severity: row.severity,
    observationId: row.observationId,
    detail: (row.detail ?? {}) as Readonly<Record<string, unknown>>,
    businessDate: row.businessDate,
    raisedAt: row.raisedAt,
  };
}

function toDevice(row: PrismaDevice): DeviceInstallation {
  return {
    id: row.id,
    driverId: row.driverId,
    installationId: row.installationId,
    platform: row.platform,
    appVersion: row.appVersion,
    integrityVerdict: row.integrityVerdict,
    integrityCheckedAt: row.integrityCheckedAt,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
  };
}
