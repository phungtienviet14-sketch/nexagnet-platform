import { beforeEach, describe, expect, it } from 'vitest';
import { assertBusinessDate } from '../business-date.js';
import { LocationHealthService } from './location-health.service.js';
import {
  UnconfiguredVehicleTelematicsAdapter,
  VehicleTelematicsPort,
  type TelematicsAvailability,
  type TelematicsFix,
  type TelematicsQuery,
} from './telematics/vehicle-telematics.port.js';
import {
  DEFAULT_HEALTHY_SILENCE_SECONDS,
  DEFAULT_LOST_SILENCE_SECONDS,
  DEFAULT_TRANSPORT_PROOF_POLICY,
} from './tracking-policy.js';
import { InMemoryTrackingRepository } from './tracking.repository.js';
import type { LocationSource } from './tracking.types.js';

/**
 * `#297 T10.5-T10.10` o TANG DICH VU — lap dau vao tu su that DA GHI.
 *
 * Bo bai o `location-health.spec.ts` da khoa PHEP CHAM. Bo nay khoa ba dieu khac, va chung chi
 * hong duoc o tang nay:
 *
 *   1. ky vong den tu PHIEN DANG MO cua chiec xe — khong tu than yeu cau, khong tu mot co;
 *   2. ban dinh vi den tu ban moi nhat cua TUNG NGUON — mot dien thoai bam lien tuc khong duoc
 *      che khuat mot hop GSHT da im;
 *   3. mot cong telematics NEM khong duoc lam ca phep cham chet.
 */
const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const HAIPHONG = { latitude: 20.8449, longitude: 106.6881 };
const NOW = new Date('2026-09-07T03:00:00Z');
const BUSINESS_DATE = assertBusinessDate('2026-09-07');
const HEALTHY = DEFAULT_HEALTHY_SILENCE_SECONDS;
const LOST = DEFAULT_LOST_SILENCE_SECONDS;

const agedBy = (seconds: number): Date => new Date(NOW.getTime() - seconds * 1000);

/** Cong gia — khai la CO nha cung cap, nhung khong bao gio tra ve mot ban dinh vi nao. */
class ConfiguredTelematicsStub extends VehicleTelematicsPort {
  describe(): TelematicsAvailability {
    return { available: true, providerName: 'NHA-CUNG-CAP-KIEM-THU' };
  }

  async fetch(_query: TelematicsQuery): Promise<readonly TelematicsFix[]> {
    return [];
  }
}

/** Cong HONG — `describe()` nem. Mot adapter that phai goi ra mang de tra loi cau nay. */
class ThrowingTelematicsStub extends VehicleTelematicsPort {
  describe(): TelematicsAvailability {
    throw new Error('nha cung cap khong tra loi');
  }

  async fetch(_query: TelematicsQuery): Promise<readonly TelematicsFix[]> {
    throw new Error('nha cung cap khong tra loi');
  }
}

let repository: InMemoryTrackingRepository;
let eventSeq = 0;

const serviceWith = (telematics: VehicleTelematicsPort): LocationHealthService =>
  new LocationHealthService(
    repository,
    telematics,
    DEFAULT_TRANSPORT_PROOF_POLICY,
    undefined,
    () => NOW,
  );

const service = (): LocationHealthService =>
  serviceWith(new UnconfiguredVehicleTelematicsAdapter());

const openSession = async (
  vehicleId: string | null,
  startedSecondsAgo = 3_600,
  driverId = 'driver-1',
) =>
  repository.createSession({
    driverId,
    tripId: 'trip-1',
    vehicleId,
    deviceInstallationId: null,
    businessDate: BUSINESS_DATE,
    startedAt: agedBy(startedSecondsAgo),
    openedBy: 'driver-1',
  });

const observe = async (
  sessionId: string,
  source: LocationSource,
  ageSeconds: number,
  point = HANOI,
) => {
  eventSeq += 1;
  return repository.appendObservation({
    sessionId,
    clientEventId: `event-${eventSeq}`,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyMetres: 8,
    speedMetresPerSecond: null,
    bearingDegrees: null,
    source,
    capturedAt: agedBy(ageSeconds),
    receivedAt: agedBy(ageSeconds),
    clockSkewSeconds: 0,
    mockLocationReported: null,
    businessDate: BUSINESS_DATE,
  });
};

beforeEach(() => {
  repository = new InMemoryTrackingRepository();
  eventSeq = 0;
});

describe('ky vong den tu PHIEN, khong tu than yeu cau', () => {
  it('chiec xe khong co phien nao dang mo -> NOT_TRACKED', async () => {
    const health = await service().forVehicle('vehicle-1');

    expect(health.status).toBe('NOT_TRACKED');
    expect(health.reason).toBe('TRACKING_NOT_EXPECTED');
  });

  it('phien DA DONG khong con la mot ky vong -> NOT_TRACKED, khong phai LOST', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);
    await repository.closeSession(session.id, agedBy(60), 'DRIVER_STOPPED');

    const health = await service().forVehicle('vehicle-1');

    // Lai xe da bam "ket thuc". Khong con ai doi vi tri chiec xe do, nen bao "mat GPS" la sai.
    expect(health.status).toBe('NOT_TRACKED');
    expect(health.lastKnown).toBeNull();
  });

  it('phien cua mot CHIEC XE KHAC khong mo ky vong cho xe nay', async () => {
    const session = await openSession('vehicle-2');
    await observe(session.id, 'DEVICE_GNSS', 60);

    expect((await service().forVehicle('vehicle-1')).status).toBe('NOT_TRACKED');
    expect((await service().forVehicle('vehicle-2')).status).toBe('LIVE');
  });

  it('phien chua gan xe (`vehicleId: null`) khong mo ky vong cho bat ky xe nao', async () => {
    const session = await openSession(null);
    await observe(session.id, 'DEVICE_GNSS', 60);

    expect((await service().forVehicle('vehicle-1')).status).toBe('NOT_TRACKED');
  });

  it('moc do cuoc cho la `startedAt` cua phien', async () => {
    // Phien vua mo 30 giay truoc, chua ban nao -> dang cho, KHONG phai mat.
    await openSession('vehicle-1', 30);
    expect((await service().forVehicle('vehicle-1')).reason).toBe('AWAITING_FIRST_OBSERVATION');

    repository = new InMemoryTrackingRepository();
    // Phien mo tu lau ma chua he co ban nao -> mat, kem ma RIENG.
    await openSession('vehicle-1', LOST + 1);
    expect((await service().forVehicle('vehicle-1')).reason).toBe('NO_OBSERVATION_RECEIVED');
  });
});

describe('ban dinh vi den tu ban moi nhat cua TUNG NGUON', () => {
  it('dien thoai bam lien tuc KHONG che khuat mot hop GSHT da im', async () => {
    const session = await openSession('vehicle-1');
    // Muoi ban dien thoai moi hon ban telematics duy nhat. Neu tang duoi lay "N ban moi nhat" thi
    // ban telematics bi day ra khoi danh sach va mot nguon con song bi bao mat.
    await observe(session.id, 'TELEMATICS', 120, HAIPHONG);
    for (let index = 0; index < 10; index += 1) {
      await observe(session.id, 'DEVICE_GNSS', 30 + index);
    }

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');
    const telematics = health.sources.find((source) => source.family === 'TELEMATICS');

    expect(telematics?.status).toBe('LIVE');
    expect(telematics?.ageSeconds).toBe(120);
  });

  it('T10.6 — dien thoai mat, hop GSHT con bao -> SOURCE_FALLBACK', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);
    await observe(session.id, 'TELEMATICS', 120, HAIPHONG);

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');

    expect(health.status).toBe('SOURCE_FALLBACK');
    expect(health.currentSource).toBe('TELEMATICS');
    expect(health.lastKnown?.point).toEqual(HAIPHONG);
    expect(health.lastKnown?.usableAsCurrent).toBe(true);
  });

  it('T10.7 — dien thoai moi, hop GSHT cu -> dien thoai van la nguon hien tai', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);
    await observe(session.id, 'TELEMATICS', LOST + 1, HAIPHONG);

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');

    expect(health.status).toBe('LIVE');
    expect(health.currentSource).toBe('PHONE');
    expect(health.lastKnown?.point).toEqual(HANOI);
  });

  it('T10.8 — ca hai nguon mat -> ALL_SOURCES_LOST kem bang chung cuoi', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 600);
    await observe(session.id, 'TELEMATICS', LOST + 1, HAIPHONG);

    const health = await serviceWith(new ConfiguredTelematicsStub()).forVehicle('vehicle-1');

    expect(health.status).toBe('ALL_SOURCES_LOST');
    expect(health.lastKnown?.usableAsCurrent).toBe(false);
    expect(health.lastKnown?.ageSeconds).toBe(LOST + 1);
  });

  it('`receivedAt` la su that, KHONG phai `capturedAt`', async () => {
    const session = await openSession('vehicle-1');
    // Mot may bi chinh dong ho: `capturedAt` bao vua xong, nhung may chu nhan tu rat lau roi.
    await repository.appendObservation({
      sessionId: session.id,
      clientEventId: 'lech-dong-ho',
      latitude: HANOI.latitude,
      longitude: HANOI.longitude,
      accuracyMetres: 8,
      speedMetresPerSecond: null,
      bearingDegrees: null,
      source: 'DEVICE_GNSS',
      capturedAt: NOW,
      receivedAt: agedBy(LOST + 1),
      clockSkewSeconds: LOST + 1,
      mockLocationReported: null,
      businessDate: BUSINESS_DATE,
    });

    const health = await service().forVehicle('vehicle-1');

    // Neu tang nay doc `capturedAt`, mot may chinh gio se tu bao minh con song.
    expect(health.status).toBe('LOST');
    expect(health.ageSeconds).toBe(LOST + 1);
  });

  it('ban NHAP TAY khong lam chiec xe song lai', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);
    await observe(session.id, 'MANUAL', 1, HAIPHONG);

    const health = await service().forVehicle('vehicle-1');

    expect(health.status).toBe('LOST');
    expect(health.lastKnown?.source).toBe('DEVICE_GNSS');
  });
});

describe('cong telematics khong san sang', () => {
  it('T10.9 — adapter MAC DINH (chua khai nha cung cap) -> nguon do la NOT_CONFIGURED', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);

    const health = await service().forVehicle('vehicle-1');
    const telematics = health.sources.find((source) => source.family === 'TELEMATICS');

    expect(health.status).toBe('LIVE');
    expect(telematics?.status).toBe('NOT_CONFIGURED');
  });

  it('chua khai nha cung cap thi KHONG BAO GIO bao "mat ca hai nguon"', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', LOST + 1);

    const health = await service().forVehicle('vehicle-1');

    expect(health.status).toBe('LOST');
    expect(health.status).not.toBe('ALL_SOURCES_LOST');
  });

  it('T10.10 — `describe()` NEM -> khong sap, va coi nhu chua khai', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);

    const health = await serviceWith(new ThrowingTelematicsStub()).forVehicle('vehicle-1');

    // Cau tra loi an toan la "chua khai": no dan toi mot canh bao that (`LOST`) chu khong dan toi
    // `ALL_SOURCES_LOST` (bao qua) hay mot trang thai binh thuong gia (bao thieu).
    expect(health.status).toBe('LIVE');
    expect(health.sources.find((source) => source.family === 'TELEMATICS')?.status).toBe(
      'NOT_CONFIGURED',
    );
  });
});

describe('doc nhieu lan KHONG ghi mot dong nao', () => {
  it('ba lan hoi lien tiep khong tao them phien hay ban dinh vi nao', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', 60);

    const before = (await repository.listObservations(session.id)).length;
    const sessionsBefore = (await repository.listSessionsForTrip('trip-1')).length;

    await service().forVehicle('vehicle-1');
    await service().forVehicle('vehicle-1');
    await service().forVehicle('vehicle-1');

    expect((await repository.listObservations(session.id)).length).toBe(before);
    expect((await repository.listSessionsForTrip('trip-1')).length).toBe(sessionsBefore);
  });

  it('cung su that + cung dong ho -> cung ket qua (T11.6: suy lai duoc sau khoi dong lai)', async () => {
    const session = await openSession('vehicle-1');
    await observe(session.id, 'DEVICE_GNSS', HEALTHY + 1);

    const first = await service().forVehicle('vehicle-1');
    // Mot the hien MOI cua dich vu — khong mang theo trang thai nao trong bo nho.
    const second = await service().forVehicle('vehicle-1');

    expect(second).toEqual(first);
  });
});
