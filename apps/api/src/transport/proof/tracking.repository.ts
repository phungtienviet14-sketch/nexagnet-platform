import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../business-date.js';
import {
  ACTIVE_TRACKING_SESSION,
  DEVICE_INSTALLATION_ID,
  OBSERVATION_CLIENT_EVENT,
  storageUniqueViolation,
} from './proof-storage-conflict.js';
import type {
  DeviceInstallation,
  DeviceIntegrityVerdict,
  DevicePlatform,
  LocationObservation,
  LocationSource,
  ProofRiskCode,
  ProofRiskFlag,
  ProofRiskSeverity,
  TrackingSession,
} from './tracking.types.js';

/**
 * KHO CUA `transport-proof`.
 *
 * Ban trong bo nho o duoi KHONG phai mot ban gia de test cho qua. No la duong chay that cua che do
 * `PERSISTENCE=memory` (demo, CI khong co DB), nen no phai cuong che DUNG nhung bat bien ma Postgres
 * cuong che — neu khong, mot bai kiem se xanh o che do nay va do o che do kia, va khong ai biet ben
 * nao dang noi that:
 *
 *   1. moi lai xe co toi da MOT phien `ACTIVE`;
 *   2. `(sessionId, clientEventId)` la duy nhat — chan phat lai;
 *   3. `installationId` duy nhat toan he — mot ma cai dat thuoc ve dung mot lai xe.
 */

export interface CreateTrackingSessionInput {
  readonly driverId: string;
  readonly tripId: string;
  /** Do may chu giai tu ban phan cong. Nguoi goi KHONG duoc truyen vao. */
  readonly vehicleId: string | null;
  readonly deviceInstallationId: string | null;
  readonly businessDate: BusinessDate;
  readonly startedAt: Date;
  readonly openedBy: string;
}

export interface AppendObservationInput {
  readonly sessionId: string;
  readonly clientEventId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number | null;
  readonly speedMetresPerSecond: number | null;
  readonly bearingDegrees: number | null;
  readonly source: LocationSource;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly clockSkewSeconds: number;
  readonly mockLocationReported: boolean | null;
  readonly businessDate: BusinessDate;
}

export interface AppendRiskFlagInput {
  readonly code: ProofRiskCode;
  readonly severity: ProofRiskSeverity;
  readonly observationId: string | null;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly businessDate: BusinessDate;
  readonly raisedAt: Date;
}

export interface UpsertDeviceInput {
  readonly driverId: string;
  readonly installationId: string;
  readonly platform: DevicePlatform;
  readonly appVersion: string;
  readonly integrityVerdict: DeviceIntegrityVerdict;
  readonly seenAt: Date;
}

export abstract class TrackingRepository {
  abstract createSession(input: CreateTrackingSessionInput): Promise<TrackingSession>;
  abstract findSession(sessionId: string): Promise<TrackingSession | null>;
  /** Phien `ACTIVE` duy nhat cua mot lai xe, neu co. */
  abstract findActiveSessionForDriver(driverId: string): Promise<TrackingSession | null>;
  abstract closeSession(
    sessionId: string,
    endedAt: Date,
    endedReason: string,
  ): Promise<TrackingSession>;
  abstract listSessionsForTrip(tripId: string): Promise<readonly TrackingSession[]>;
  abstract listSessionsForDriver(driverId: string): Promise<readonly TrackingSession[]>;

  abstract findObservationByEventId(
    sessionId: string,
    clientEventId: string,
  ): Promise<LocationObservation | null>;
  /** Ban ghi moi nhat theo `capturedAt` — dau vao cua phep kiem lien tuc. */
  abstract lastObservation(sessionId: string): Promise<LocationObservation | null>;
  abstract appendObservation(input: AppendObservationInput): Promise<LocationObservation>;
  abstract listObservations(sessionId: string): Promise<readonly LocationObservation[]>;

  abstract appendRiskFlags(
    inputs: readonly AppendRiskFlagInput[],
  ): Promise<readonly ProofRiskFlag[]>;
  abstract listRiskFlagsForSession(sessionId: string): Promise<readonly ProofRiskFlag[]>;

  abstract findDeviceByInstallationId(installationId: string): Promise<DeviceInstallation | null>;
  abstract upsertDevice(input: UpsertDeviceInput): Promise<DeviceInstallation>;
}

export class InMemoryTrackingRepository extends TrackingRepository {
  private readonly sessions = new Map<string, TrackingSession>();
  private readonly observations = new Map<string, LocationObservation>();
  private readonly riskFlags = new Map<string, ProofRiskFlag>();
  private readonly devices = new Map<string, DeviceInstallation>();

  async createSession(input: CreateTrackingSessionInput): Promise<TrackingSession> {
    // Bat bien 1, cuong che o day y nhu chi muc mot phan duoi Postgres.
    if (await this.findActiveSessionForDriver(input.driverId)) {
      throw storageUniqueViolation(ACTIVE_TRACKING_SESSION);
    }
    const session: TrackingSession = {
      id: randomUUID(),
      driverId: input.driverId,
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      deviceInstallationId: input.deviceInstallationId,
      status: 'ACTIVE',
      businessDate: input.businessDate,
      startedAt: input.startedAt,
      endedAt: null,
      endedReason: null,
      observationCount: 0,
      openedBy: input.openedBy,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSession(sessionId: string): Promise<TrackingSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findActiveSessionForDriver(driverId: string): Promise<TrackingSession | null> {
    for (const session of this.sessions.values()) {
      if (session.driverId === driverId && session.status === 'ACTIVE') return session;
    }
    return null;
  }

  async closeSession(
    sessionId: string,
    endedAt: Date,
    endedReason: string,
  ): Promise<TrackingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Khong tim thay phien ${sessionId}`);
    const closed: TrackingSession = { ...session, status: 'CLOSED', endedAt, endedReason };
    this.sessions.set(sessionId, closed);
    return closed;
  }

  async listSessionsForTrip(tripId: string): Promise<readonly TrackingSession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.tripId === tripId)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }

  async listSessionsForDriver(driverId: string): Promise<readonly TrackingSession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.driverId === driverId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  async findObservationByEventId(
    sessionId: string,
    clientEventId: string,
  ): Promise<LocationObservation | null> {
    for (const observation of this.observations.values()) {
      if (observation.sessionId === sessionId && observation.clientEventId === clientEventId) {
        return observation;
      }
    }
    return null;
  }

  async lastObservation(sessionId: string): Promise<LocationObservation | null> {
    const forSession = await this.listObservations(sessionId);
    return forSession.at(-1) ?? null;
  }

  async appendObservation(input: AppendObservationInput): Promise<LocationObservation> {
    // Bat bien 2.
    if (await this.findObservationByEventId(input.sessionId, input.clientEventId)) {
      throw storageUniqueViolation(OBSERVATION_CLIENT_EVENT);
    }
    const observation: LocationObservation = {
      id: randomUUID(),
      sessionId: input.sessionId,
      clientEventId: input.clientEventId,
      point: { latitude: input.latitude, longitude: input.longitude },
      accuracyMetres: input.accuracyMetres,
      speedMetresPerSecond: input.speedMetresPerSecond,
      bearingDegrees: input.bearingDegrees,
      source: input.source,
      capturedAt: input.capturedAt,
      receivedAt: input.receivedAt,
      clockSkewSeconds: input.clockSkewSeconds,
      mockLocationReported: input.mockLocationReported,
      businessDate: input.businessDate,
    };
    this.observations.set(observation.id, observation);

    const session = this.sessions.get(input.sessionId);
    if (session) {
      this.sessions.set(session.id, {
        ...session,
        observationCount: session.observationCount + 1,
      });
    }
    return observation;
  }

  async listObservations(sessionId: string): Promise<readonly LocationObservation[]> {
    return [...this.observations.values()]
      .filter((observation) => observation.sessionId === sessionId)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }

  async appendRiskFlags(inputs: readonly AppendRiskFlagInput[]): Promise<readonly ProofRiskFlag[]> {
    return inputs.map((input) => {
      const flag: ProofRiskFlag = { id: randomUUID(), ...input };
      this.riskFlags.set(flag.id, flag);
      return flag;
    });
  }

  async listRiskFlagsForSession(sessionId: string): Promise<readonly ProofRiskFlag[]> {
    const ids = new Set(
      [...this.observations.values()]
        .filter((observation) => observation.sessionId === sessionId)
        .map((observation) => observation.id),
    );
    return [...this.riskFlags.values()].filter(
      (flag) => flag.observationId !== null && ids.has(flag.observationId),
    );
  }

  async findDeviceByInstallationId(installationId: string): Promise<DeviceInstallation | null> {
    for (const device of this.devices.values()) {
      if (device.installationId === installationId) return device;
    }
    return null;
  }

  async upsertDevice(input: UpsertDeviceInput): Promise<DeviceInstallation> {
    const existing = await this.findDeviceByInstallationId(input.installationId);
    if (existing) {
      // Bat bien 3: mot ma cai dat KHONG doi chu. Dung ma cua nguoi khac phai la mot va cham on
      // ao, khong phai mot lan cap nhat im lang gan lai chu so huu.
      if (existing.driverId !== input.driverId) {
        throw storageUniqueViolation(DEVICE_INSTALLATION_ID);
      }
      const updated: DeviceInstallation = {
        ...existing,
        platform: input.platform,
        appVersion: input.appVersion,
        integrityVerdict: input.integrityVerdict,
        integrityCheckedAt:
          input.integrityVerdict === 'UNKNOWN' ? existing.integrityCheckedAt : input.seenAt,
        lastSeenAt: input.seenAt,
      };
      this.devices.set(updated.id, updated);
      return updated;
    }
    const device: DeviceInstallation = {
      id: randomUUID(),
      driverId: input.driverId,
      installationId: input.installationId,
      platform: input.platform,
      appVersion: input.appVersion,
      integrityVerdict: input.integrityVerdict,
      integrityCheckedAt: input.integrityVerdict === 'UNKNOWN' ? null : input.seenAt,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
      revokedAt: null,
    };
    this.devices.set(device.id, device);
    return device;
  }
}
