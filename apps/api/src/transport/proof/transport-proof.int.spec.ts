import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PROOF_OBSERVATION_ONCE } from './operational-proof.repository.js';
import { PrismaOperationalProofRepository } from './prisma-operational-proof.repository.js';
import { PrismaProofChallengeRepository } from './prisma-proof-challenge.repository.js';
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
    // TRUOC ban dinh vi, va thu tu do la BAT BUOC: `TransportOperationalProof.observation` dung
    // `onDelete: Restrict`, nen xoa ban dinh vi khi con mot chung cu tro toi no se that bai — va
    // mot that bai o `afterAll` de lai fixture ban cho moi lan chay sau.
    await prisma.transportProofPhoto.deleteMany({
      where: { proof: { trip: { code: TRIP_CODE } } },
    });
    await prisma.transportOperationalProof.deleteMany({ where: { trip: { code: TRIP_CODE } } });
    await prisma.transportProofRiskFlag.deleteMany({
      where: { observation: { session: { trip: { code: TRIP_CODE } } } },
    });
    await prisma.transportLocationObservation.deleteMany({
      where: { session: { trip: { code: TRIP_CODE } } },
    });
    // TRUOC phien: `TransportProofChallenge.session` dung `onDelete: Restrict`.
    await prisma.transportProofChallenge.deleteMany({
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

/**
 * PROOF-091 — BIA MO tren Postgres THAT.
 *
 * Bo `proof-withdrawal.spec.ts` do LUAT bang kho trong bo nho. Bo nay do dung nhung thu CHI ton
 * tai o Prisma: mot giao dich, mot `updateMany` co dieu kien lam cong chong chay dua, va rang buoc
 * `CHECK` doi `withdrawnAt`/`withdrawnBy` di theo cap. Kho trong bo nho khong the sai o ba diem do
 * vi no khong co ba thu do.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Bia mo chung cu tren Postgres — PROOF-091',
  () => {
    const prisma = new PrismaService();
    const tracking = new PrismaTrackingRepository(prisma);
    const proofs = new PrismaOperationalProofRepository(prisma);
    const challenges = new PrismaProofChallengeRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);

    // Tien to rieng, va KHONG la tien to cua bo tren (`ITPROOF`): `cleanup` dung `startsWith`.
    const PLATE = 'ITWDRAW-0001';
    const TRIP_CODE = 'ITWDRAW-CH-1';
    const DRIVER_PHONE = '0955ITWDRAW';

    let driverId = '';
    let tripId = '';
    let sessionId = '';

    async function cleanup(): Promise<void> {
      await prisma.transportProofPhoto.deleteMany({
        where: { proof: { trip: { code: TRIP_CODE } } },
      });
      await prisma.transportOperationalProof.deleteMany({ where: { trip: { code: TRIP_CODE } } });
      await prisma.transportProofRiskFlag.deleteMany({
        where: { observation: { session: { trip: { code: TRIP_CODE } } } },
      });
      await prisma.transportLocationObservation.deleteMany({
        where: { session: { trip: { code: TRIP_CODE } } },
      });
      // TRUOC phien: `TransportProofChallenge.session` dung `onDelete: Restrict`.
      await prisma.transportProofChallenge.deleteMany({
        where: { session: { trip: { code: TRIP_CODE } } },
      });
      await prisma.transportTrackingSession.deleteMany({ where: { trip: { code: TRIP_CODE } } });
      const trip = await trips.findByCode(TRIP_CODE);
      if (trip) {
        await prisma.transportTripAssignment.deleteMany({ where: { tripId: trip.id } });
        await prisma.transportTrip.deleteMany({ where: { code: TRIP_CODE } });
      }
      await prisma.transportVehicle.deleteMany({ where: { registrationPlate: PLATE } });
      await prisma.transportDriver.deleteMany({ where: { phone: DRIVER_PHONE } });
    }

    beforeAll(async () => {
      await cleanup();
      const driver = await fleet.createDriver({
        fullName: 'ITWDRAW Lai xe',
        phone: DRIVER_PHONE,
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
      driverId = driver.id;
      tripId = trip.id;
      const session = await tracking.createSession({
        driverId,
        tripId,
        vehicleId: null,
        deviceInstallationId: null,
        businessDate: '2026-09-07',
        startedAt: new Date('2026-09-07T03:00:00Z'),
        openedBy: 'itwdraw',
      });
      sessionId = session.id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    let sequence = 0;
    const recordProof = async () => {
      sequence += 1;
      const observation = await tracking.appendObservation({
        sessionId,
        clientEventId: `itwdraw-evt-${sequence}`,
        latitude: 20.8449,
        longitude: 106.6881,
        accuracyMetres: 8,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_GNSS',
        capturedAt: new Date(`2026-09-07T03:0${sequence}:00Z`),
        receivedAt: new Date(`2026-09-07T03:0${sequence}:05Z`),
        clockSkewSeconds: 5,
        mockLocationReported: false,
        businessDate: '2026-09-07',
      });
      const proof = await proofs.create({
        kind: 'DELIVERY',
        tripId,
        driverId,
        observationId: observation.id,
        sessionId,
        clientEventId: `itwdraw-proof-${sequence}`,
        capturedAt: observation.capturedAt,
        receivedAt: new Date(`2026-09-07T03:0${sequence}:06Z`),
        businessDate: '2026-09-07',
        note: null,
        recordedBy: 'itwdraw',
        challengeVerified: false,
        photos: [
          {
            locator: `itwdraw/${sequence}.jpg`,
            captureMode: 'LIVE_CAMERA',
            contentType: 'image/jpeg',
            byteSize: 11,
          },
        ],
      });
      return { proof, observationId: observation.id };
    };

    it('dau di theo CAP tren ca chung cu VA anh, trong mot giao dich', async () => {
      const { proof } = await recordProof();
      const withdrawn = await proofs.withdraw({
        proofId: proof.id,
        withdrawnBy: 'nguoi-duyet',
        withdrawnAt: new Date('2026-09-07T09:00:00Z'),
      });

      expect(withdrawn?.withdrawnAt).not.toBeNull();
      expect(withdrawn?.withdrawnBy).toBe('nguoi-duyet');
      expect(withdrawn?.photos.every((photo) => photo.withdrawnAt !== null)).toBe(true);
      expect(withdrawn?.photos.every((photo) => photo.withdrawnBy === 'nguoi-duyet')).toBe(true);
    });

    it('CONG CHONG CHAY DUA — lan rut thu hai khong ghi de nguoi rut dau tien', async () => {
      const { proof } = await recordProof();
      await proofs.withdraw({
        proofId: proof.id,
        withdrawnBy: 'nguoi-thu-nhat',
        withdrawnAt: new Date('2026-09-07T09:00:00Z'),
      });
      const again = await proofs.withdraw({
        proofId: proof.id,
        withdrawnBy: 'nguoi-thu-hai',
        withdrawnAt: new Date('2026-09-07T10:00:00Z'),
      });

      // `updateMany` sua 0 hang, nen ban doc lai VAN mang dau cua nguoi thu nhat.
      expect(again?.withdrawnBy).toBe('nguoi-thu-nhat');
      expect(again?.withdrawnAt?.toISOString()).toBe('2026-09-07T09:00:00.000Z');
    });

    it('rut mot chung cu khong ton tai tra `null`, khong nem', async () => {
      expect(
        await proofs.withdraw({
          proofId: 'khong-co-that',
          withdrawnBy: 'nguoi-duyet',
          withdrawnAt: new Date('2026-09-07T09:00:00Z'),
        }),
      ).toBeNull();
    });

    it('BAN DINH VI VAN BI KHOA sau khi rut — chi muc mot phan tu choi lan dung lai', async () => {
      const { proof, observationId } = await recordProof();
      await proofs.withdraw({
        proofId: proof.id,
        withdrawnBy: 'nguoi-duyet',
        withdrawnAt: new Date('2026-09-07T09:00:00Z'),
      });

      let caught: unknown = null;
      try {
        await proofs.create({
          kind: 'DELIVERY',
          tripId,
          driverId,
          observationId,
          sessionId,
          clientEventId: 'itwdraw-proof-tai-che',
          capturedAt: new Date('2026-09-07T03:09:00Z'),
          receivedAt: new Date('2026-09-07T03:09:06Z'),
          businessDate: '2026-09-07',
          note: null,
          recordedBy: 'itwdraw',
          challengeVerified: false,
          photos: [
            {
              locator: 'itwdraw/tai-che.jpg',
              captureMode: 'LIVE_CAMERA',
              contentType: 'image/jpeg',
              byteSize: 11,
            },
          ],
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).not.toBeNull();
      expect(isUniqueViolationOn(caught, PROOF_OBSERVATION_ONCE)).toBe(true);
    });

    it('`withdrawnAt` KHONG kem `withdrawnBy` bi CHECK tu choi', async () => {
      const { proof } = await recordProof();
      await expect(
        prisma.$executeRaw`UPDATE "TransportOperationalProof" SET "withdrawnAt" = NOW() WHERE "id" = ${proof.id}`,
      ).rejects.toThrow();
    });

    /* ---------------------------------------------------------------- *
     * PROOF-112 — loi thach thuc tren Postgres THAT
     * ---------------------------------------------------------------- */

    const issueChallenge = async (nonce: string) =>
      challenges.issue({
        nonce,
        driverId,
        sessionId,
        issuedAt: new Date('2026-09-09T03:00:00Z'),
        expiresAt: new Date('2026-09-09T03:05:00Z'),
      });

    it('TIEU MOT LAN — lan thu hai sua 0 hang va tra `null`', async () => {
      await issueChallenge('itwdraw-nonce-race');

      const first = await challenges.consume(
        'itwdraw-nonce-race',
        new Date('2026-09-09T03:01:00Z'),
        'proof-mot',
      );
      const second = await challenges.consume(
        'itwdraw-nonce-race',
        new Date('2026-09-09T03:02:00Z'),
        'proof-hai',
      );

      expect(first?.consumedByProofId).toBe('proof-mot');
      // Neu day tra ve mot ban ghi, mot loi thach thuc phuc vu duoc HAI chung cu. Cong nay nam o
      // `where consumedAt: null` cua `updateMany`, khong o mot lenh `if` trong dich vu.
      expect(second).toBeNull();
    });

    it('`nonce` la DUY NHAT o tang DB, khong chi o tang dich vu', async () => {
      await issueChallenge('itwdraw-nonce-unique');
      await expect(issueChallenge('itwdraw-nonce-unique')).rejects.toThrow();
    });

    it('`consumedAt` KHONG kem `consumedByProofId` bi CHECK tu choi', async () => {
      const challenge = await issueChallenge('itwdraw-nonce-shape');
      await expect(
        prisma.$executeRaw`UPDATE "TransportProofChallenge" SET "consumedAt" = NOW() WHERE "id" = ${challenge.id}`,
      ).rejects.toThrow();
    });

    it('han o TRUOC luc phat bi CHECK tu choi — mot hang vo nghia con te hon mot loi', async () => {
      await expect(
        challenges.issue({
          nonce: 'itwdraw-nonce-nguoc',
          driverId,
          sessionId,
          issuedAt: new Date('2026-09-09T03:05:00Z'),
          expiresAt: new Date('2026-09-09T03:00:00Z'),
        }),
      ).rejects.toThrow();
    });

    it('`nonce` rong bi chan — no lam ca co che vo hieu', async () => {
      await expect(issueChallenge('   ')).rejects.toThrow();
    });
  },
);
