import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PrismaTrackingRepository } from './prisma-tracking.repository.js';
import {
  ACTIVE_TRACKING_SESSION,
  DEVICE_INSTALLATION_ID,
  OBSERVATION_CLIENT_EVENT,
} from './proof-storage-conflict.js';

/**
 * PROOF-050 — cac BAT BIEN cua tang luu tru, tren Postgres THAT.
 *
 * `transport-proof-storage.spec.ts` chung minh cac rang buoc CO TEN trong tep migration. Bo nay
 * chung minh chung THAT SU TU CHOI du lieu sai. Hai viec khac nhau: mot ten con nguyen trong tep
 * van co the la mot rang buoc chua bao gio duoc ap, va mot `CHECK` viet sai dieu kien van "ton
 * tai" ma khong chan gi.
 *
 * `describe.runIf` theo dung quy uoc: khong co DB thi bo qua thay vi do — nhung do cung co nghia
 * la "xanh o may" KHONG phu nhung bai nay. Chung chay o job `integration` cua CI.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('Bat bien luu tru cua transport-proof', () => {
  const prisma = new PrismaService();
  const tracking = new PrismaTrackingRepository(prisma);
  const fleet = new PrismaFleetRepository(prisma);
  const trips = new PrismaTripRepository(prisma);

  // Tien to KHONG LONG NHAU: `cleanup` dung `startsWith`, nen mot tien to la tien to cua tien to
  // khac se lam bai nay xoa fixture cua bai kia khi ca thu muc cung chay.
  const PLATE = 'ITPROOF-0001';
  const TRIP_CODE = 'ITPROOF-CH-1';
  const DRIVER_PHONE_A = '0955ITPROOFA';
  const DRIVER_PHONE_B = '0955ITPROOFB';
  const INSTALLATION = 'itproof-installation-1';

  let driverA = '';
  let driverB = '';
  let tripId = '';

  async function cleanup(): Promise<void> {
    await prisma.transportProofRiskFlag.deleteMany({
      where: { observation: { session: { trip: { code: TRIP_CODE } } } },
    });
    await prisma.transportLocationObservation.deleteMany({
      where: { session: { trip: { code: TRIP_CODE } } },
    });
    await prisma.transportTrackingSession.deleteMany({ where: { trip: { code: TRIP_CODE } } });
    await prisma.transportDeviceInstallation.deleteMany({
      where: { installationId: { startsWith: 'itproof-installation' } },
    });
    await prisma.transportGeofence.deleteMany({ where: { label: { startsWith: 'ITPROOF ' } } });
    const trip = await trips.findByCode(TRIP_CODE);
    if (trip) {
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: trip.id } });
      await prisma.transportTrip.deleteMany({ where: { code: TRIP_CODE } });
    }
    await prisma.transportVehicle.deleteMany({ where: { registrationPlate: PLATE } });
    await prisma.transportDriver.deleteMany({
      where: { phone: { in: [DRIVER_PHONE_A, DRIVER_PHONE_B] } },
    });
  }

  beforeAll(async () => {
    await cleanup();
    const a = await fleet.createDriver({
      fullName: 'ITPROOF Lai xe A',
      phone: DRIVER_PHONE_A,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });
    const b = await fleet.createDriver({
      fullName: 'ITPROOF Lai xe B',
      phone: DRIVER_PHONE_B,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });
    const trip = await trips.create({
      code: TRIP_CODE,
      kind: 'OWN_DIRECT',
      businessDate: '2026-09-07',
      originLabel: 'Ha Noi',
      destinationLabel: 'Hai Phong',
    });
    driverA = a.id;
    driverB = b.id;
    tripId = trip.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const openSession = (driverId: string) =>
    tracking.createSession({
      driverId,
      tripId,
      vehicleId: null,
      deviceInstallationId: null,
      businessDate: '2026-09-07',
      startedAt: new Date('2026-09-07T03:00:00Z'),
      openedBy: 'itproof',
    });

  const requireActiveSession = async (driverId: string): Promise<string> => {
    const session = await tracking.findActiveSessionForDriver(driverId);
    if (!session) throw new Error('fixture: khong co phien dang mo');
    return session.id;
  };

  it('MOT LAI XE MOT PHIEN MO — chi muc mot phan tu choi phien thu hai', async () => {
    await openSession(driverA);
    let caught: unknown = null;
    try {
      await openSession(driverA);
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(isUniqueViolationOn(caught, ACTIVE_TRACKING_SESSION)).toBe(true);
  });

  it('nhung mot lai xe KHAC van mo duoc phien cua rieng ho', async () => {
    const session = await openSession(driverB);
    expect(session.driverId).toBe(driverB);
    await tracking.closeSession(session.id, new Date('2026-09-07T04:00:00Z'), 'ITPROOF');
  });

  it('phien DA DONG khong con chiem cho — lai xe mo duoc phien moi', async () => {
    const session = await openSession(driverB);
    await tracking.closeSession(session.id, new Date('2026-09-07T05:00:00Z'), 'ITPROOF');
    const again = await openSession(driverB);
    expect(again.id).not.toBe(session.id);
    await tracking.closeSession(again.id, new Date('2026-09-07T06:00:00Z'), 'ITPROOF');
  });

  it('CHAN PHAT LAI — cung ma su kien trong cung phien bi tu choi o tang DB', async () => {
    const sessionId = await requireActiveSession(driverA);
    const base = {
      sessionId,
      clientEventId: 'itproof-evt-1',
      latitude: 21.0285,
      longitude: 105.8542,
      accuracyMetres: 8,
      speedMetresPerSecond: null,
      bearingDegrees: null,
      source: 'DEVICE_GNSS' as const,
      capturedAt: new Date('2026-09-07T03:01:00Z'),
      receivedAt: new Date('2026-09-07T03:01:01Z'),
      clockSkewSeconds: -1,
      mockLocationReported: false,
      businessDate: '2026-09-07',
    };
    await tracking.appendObservation(base);

    let caught: unknown = null;
    try {
      await tracking.appendObservation(base);
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(isUniqueViolationOn(caught, OBSERVATION_CLIENT_EVENT)).toBe(true);
  });

  it('bo dem cua phien tang cung giao dich voi ban ghi', async () => {
    const sessionId = await requireActiveSession(driverA);
    const reloaded = await tracking.findSession(sessionId);
    const points = await tracking.listObservations(sessionId);
    expect(reloaded?.observationCount).toBe(points.length);
  });

  it('(0,0) bi CHAN o tang luu tru, khong chi o tang mien', async () => {
    const sessionId = await requireActiveSession(driverA);
    await expect(
      tracking.appendObservation({
        sessionId,
        clientEventId: 'itproof-evt-null-island',
        latitude: 0,
        longitude: 0,
        accuracyMetres: 8,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_GNSS',
        capturedAt: new Date('2026-09-07T03:02:00Z'),
        receivedAt: new Date('2026-09-07T03:02:01Z'),
        clockSkewSeconds: -1,
        mockLocationReported: false,
        businessDate: '2026-09-07',
      }),
    ).rejects.toThrow();
  });

  it('sai so AM bi chan — no nong ban kinh phan quyet ra thay vi thu hep', async () => {
    const sessionId = await requireActiveSession(driverA);
    await expect(
      tracking.appendObservation({
        sessionId,
        clientEventId: 'itproof-evt-negative-accuracy',
        latitude: 21.03,
        longitude: 105.85,
        accuracyMetres: -5,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_GNSS',
        capturedAt: new Date('2026-09-07T03:03:00Z'),
        receivedAt: new Date('2026-09-07T03:03:01Z'),
        clockSkewSeconds: -1,
        mockLocationReported: false,
        businessDate: '2026-09-07',
      }),
    ).rejects.toThrow();
  });

  it('MOT MA CAI DAT, MOT CHU — lai xe B khong chiem duoc ma cua lai xe A', async () => {
    const seenAt = new Date('2026-09-07T03:10:00Z');
    const device = await tracking.upsertDevice({
      driverId: driverA,
      installationId: INSTALLATION,
      platform: 'ANDROID',
      appVersion: '1.0.0',
      integrityVerdict: 'UNKNOWN',
      seenAt,
    });
    expect(device.driverId).toBe(driverA);

    let caught: unknown = null;
    try {
      await tracking.upsertDevice({
        driverId: driverB,
        installationId: INSTALLATION,
        platform: 'ANDROID',
        appVersion: '1.0.0',
        integrityVerdict: 'UNKNOWN',
        seenAt,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(isUniqueViolationOn(caught, DEVICE_INSTALLATION_ID)).toBe(true);

    // Va hang cu KHONG bi doi chu.
    const reloaded = await tracking.findDeviceByInstallationId(INSTALLATION);
    expect(reloaded?.driverId).toBe(driverA);
  });

  it('hang rao: ban kinh ngoai khoang bi chan o tang luu tru', async () => {
    await expect(
      prisma.transportGeofence.create({
        data: {
          label: 'ITPROOF khung qua rong',
          subjectKind: 'AD_HOC',
          subjectId: null,
          latitude: 20.8449,
          longitude: 106.6881,
          radiusMetres: 10_000_000,
          recordedBy: 'itproof',
        },
      }),
    ).rejects.toThrow();
  });

  it('hang rao: AD_HOC co chu the la sai hinh', async () => {
    await expect(
      prisma.transportGeofence.create({
        data: {
          label: 'ITPROOF sai hinh',
          subjectKind: 'AD_HOC',
          subjectId: 'khong-duoc-co',
          latitude: 20.8449,
          longitude: 106.6881,
          radiusMetres: 200,
          recordedBy: 'itproof',
        },
      }),
    ).rejects.toThrow();
  });

  it('hang rao dung hinh thi ghi duoc', async () => {
    const fence = await prisma.transportGeofence.create({
      data: {
        label: 'ITPROOF kho Hai Phong',
        subjectKind: 'AD_HOC',
        subjectId: null,
        latitude: 20.8449,
        longitude: 106.6881,
        radiusMetres: 200,
        recordedBy: 'itproof',
      },
    });
    expect(fence.radiusMetres).toBe(200);
  });
});
