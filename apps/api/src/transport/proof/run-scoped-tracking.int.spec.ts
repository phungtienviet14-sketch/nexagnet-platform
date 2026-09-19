import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFactsAdapter,
} from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PrismaTrackingRepository } from './prisma-tracking.repository.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from './tracking-policy.js';
import { TrackingService } from './tracking.service.js';
import { TransportProofCoreFactsAdapter } from './transport-proof-facts.port.js';

/**
 * PROOF-051 — PHIEN BAM VI TRI THEO VONG CHAY, tren Postgres THAT (`#327`).
 *
 * ==============================================================================================
 * BO BAI NAY DO DIEU GI
 * ==============================================================================================
 *
 * Mot O KIN co that, do duoc tren ban dang chay ngay 19/09/2026: luong Order-first sinh
 * `TransportVehicleRun` chu khong sinh `TransportTrip`; duong tu bao vi tri cua lai xe chi mo duoc
 * phien theo `tripId`; `DELIVERY_ARRIVAL` va `DELIVERY_ACCEPTED` BAT BUOC kem mot ban dinh vi
 * (`#232` D-08); va ban dinh vi do phai thuoc ve CHINH lai xe dang ghi moc. Bon rang buoc dung
 * dan, giao nhau thanh mot o ma khong vai nao di qua duoc.
 *
 * Nen bo nay di HET chuoi, tren DB that, bang duong CUA CHINH LAI XE — khong ADMIN, khong tiem
 * `observationId` tu ben ngoai, khong bia mot `TransportTrip` de lam cho dua:
 *
 *   phien theo `runId` -> ban dinh vi trong phien do -> `DELIVERY_ARRIVAL` -> `DELIVERY_ACCEPTED`.
 *
 * ==============================================================================================
 * VI SAO PHAI LA POSTGRES THAT
 * ==============================================================================================
 *
 * Hai thu o day khong ton tai trong bo nho, va chung la phan dat gia nhat cua ban va:
 * `TransportTrackingSession_one_subject` (`num_nonnulls = 1`) va khoa ngoai `runId ->
 * TransportVehicleRun`. Mot ban trong bo nho khong the phu nhan mot rang buoc cua Postgres.
 */

const PREFIX = 'ITRSTK';
const PLATE = `${PREFIX}-0001`;
const RUN_CODE = `${PREFIX}-VC-1`;
const TRIP_CODE = `${PREFIX}-CH-1`;
const DRIVER_PHONE_A = '0955ITRSTKA';
const DRIVER_PHONE_B = '0955ITRSTKB';
const AUTH_A = 'itrstk-user-a';
const AUTH_B = 'itrstk-user-b';
const BUSINESS_DATE = '2026-09-19';
const HANOI = { latitude: 21.0285, longitude: 105.8542 };

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Phien bam vi tri theo vong chay tren Postgres that — PROOF-051',
  () => {
    const prisma = new PrismaService();
    const tracking = new PrismaTrackingRepository(prisma);
    const movement = new PrismaMovementRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const checkpointRepo = new PrismaCheckpointRepository(prisma);

    const trackingService = new TrackingService(
      tracking,
      new TransportProofCoreFactsAdapter(trips, fleet, movement),
      { timeZone: 'Asia/Ho_Chi_Minh' },
      DEFAULT_TRANSPORT_PROOF_POLICY,
    );
    const checkpoints = new CheckpointService(
      checkpointRepo,
      new TransportCheckpointCoreFactsAdapter(movement, fleet),
      new TransportCheckpointLocationFactsAdapter(tracking),
      new MovementRunWriteGuard(movement),
      { timeZone: 'Asia/Ho_Chi_Minh' },
    );

    let driverA = '';
    let driverB = '';
    let vehicleId = '';
    let runId = '';
    let legId = '';
    let tripId = '';

    /**
     * Don dep theo THU TU AN TOAN VE KHOA NGOAI.
     *
     * Moc TRUOC ban dinh vi (`TransportRunCheckpoint.observationId` la `@unique` + `Restrict`), ban
     * dinh vi truoc phien, phien truoc vong chay/chuyen, va xe/lai xe sau cung. Mot that bai o
     * `afterAll` de lai fixture ban cho MOI lan chay sau, nen thu tu o day khong phai chuyen phong
     * cach.
     */
    async function cleanup(): Promise<void> {
      const runs = await prisma.transportVehicleRun.findMany({
        where: { code: RUN_CODE },
        select: { id: true },
      });
      const runIds = runs.map((row) => row.id);
      const ownSession = {
        OR: [{ runId: { in: runIds } }, { trip: { code: TRIP_CODE } }],
      };

      await prisma.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportProofRiskFlag.deleteMany({
        where: { observation: { session: ownSession } },
      });
      await prisma.transportLocationObservation.deleteMany({
        where: { session: ownSession },
      });
      await prisma.transportProofChallenge.deleteMany({ where: { session: ownSession } });
      await prisma.transportTrackingSession.deleteMany({ where: ownSession });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });

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
        fullName: `${PREFIX} Lai xe A`,
        phone: DRIVER_PHONE_A,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: AUTH_A,
      });
      const b = await fleet.createDriver({
        fullName: `${PREFIX} Lai xe B`,
        phone: DRIVER_PHONE_B,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: AUTH_B,
      });
      const vehicle = await fleet.createVehicle({
        registrationPlate: PLATE,
        vehicleClass: 'Dau keo',
      });
      const run = await movement.createRun({
        code: RUN_CODE,
        vehicleId: vehicle.id,
        businessDate: BUSINESS_DATE,
      });
      const leg = await movement.createLeg({
        runId: run.id,
        sequence: 1,
        kind: 'LOADED',
        orderId: null,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        businessDate: BUSINESS_DATE,
      });
      // Ban phan cong la SU THAT duy nhat noi mot con nguoi voi mot vong chay. Thieu buoc nay thi
      // moi bai duoi day deu do voi `DRIVER_NOT_ASSIGNED_TO_RUN` — va do se la loi cua fixture.
      await movement.assignRun(run.id, {
        driverId: a.id,
        effectiveFrom: new Date('2026-09-19T01:00:00Z'),
        assignedBy: PREFIX,
      });
      const trip = await trips.create({
        code: TRIP_CODE,
        kind: 'OWN_DIRECT',
        businessDate: BUSINESS_DATE,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
      });

      driverA = a.id;
      driverB = b.id;
      vehicleId = vehicle.id;
      runId = run.id;
      legId = leg.id;
      tripId = trip.id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    const closeAnyOpenSession = async (driverId: string): Promise<void> => {
      const open = await tracking.findActiveSessionForDriver(driverId);
      if (open) await tracking.closeSession(open.id, new Date(), `${PREFIX}-reset`);
    };

    /* ---------------------------------------------------------------- *
     * 1. QUYEN va XE, tren duong that
     * ---------------------------------------------------------------- */

    it('lai xe DUOC PHAN CONG mo duoc phien theo `runId`, va XE do may chu doc tu vong chay', async () => {
      await closeAnyOpenSession(driverA);
      const session = await trackingService.openSession({
        authUserId: AUTH_A,
        runId,
        device: null,
      });

      expect(session.driverId).toBe(driverA);
      expect(session.runId).toBe(runId);
      // Khong mot chuyen nao bi bia ra de lam cho dua — day la ca diem cua `#327`.
      expect(session.tripId).toBeNull();
      // Khong lenh nao nhan `vehicleId`; no den tu `TransportVehicleRun.vehicleId`.
      expect(session.vehicleId).toBe(vehicleId);
    });

    it('lai xe KHONG duoc phan cong bi tu choi — vai khong phai la cong', async () => {
      await closeAnyOpenSession(driverB);
      await expect(
        trackingService.openSession({ authUserId: AUTH_B, runId, device: null }),
      ).rejects.toMatchObject({ reason: 'DRIVER_NOT_ASSIGNED_TO_RUN', kind: 'DENIED' });
    });

    it('mo lai tren dung vong chay do tra ve DUNG phien cu, khong mo phien thu hai', async () => {
      await closeAnyOpenSession(driverA);
      const first = await trackingService.openSession({ authUserId: AUTH_A, runId, device: null });
      const again = await trackingService.openSession({ authUserId: AUTH_A, runId, device: null });
      expect(again.id).toBe(first.id);

      const sessions = await tracking.listSessionsForRun(runId);
      expect(sessions.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
    });

    /* ---------------------------------------------------------------- *
     * 2. DUNG MOT CHU THE — rang buoc cua KHO, khong phai cua ung dung
     * ---------------------------------------------------------------- */

    it('`CHECK` cua Postgres tu choi MOT PHIEN HAI CHU THE', async () => {
      await closeAnyOpenSession(driverB);
      await expect(
        tracking.createSession({
          driverId: driverB,
          tripId,
          runId,
          vehicleId: null,
          deviceInstallationId: null,
          businessDate: BUSINESS_DATE,
          startedAt: new Date('2026-09-19T02:00:00Z'),
          openedBy: PREFIX,
        }),
      ).rejects.toThrow(/TransportTrackingSession_one_subject/);
    });

    it('va tu choi mot phien KHONG CHU THE NAO — bang chung mo coi khong ghi duoc', async () => {
      await closeAnyOpenSession(driverB);
      await expect(
        tracking.createSession({
          driverId: driverB,
          tripId: null,
          runId: null,
          vehicleId: null,
          deviceInstallationId: null,
          businessDate: BUSINESS_DATE,
          startedAt: new Date('2026-09-19T02:00:00Z'),
          openedBy: PREFIX,
        }),
      ).rejects.toThrow(/TransportTrackingSession_one_subject/);
    });

    /* ---------------------------------------------------------------- *
     * 3. DUONG CU KHONG DOI
     * ---------------------------------------------------------------- */

    it('phien theo CHUYEN van mo duoc y nhu truoc — khong mot buoc lui nao', async () => {
      await trips.assign(tripId, {
        driverId: driverB,
        vehicleId,
        assignedBy: PREFIX,
        at: new Date('2026-09-19T01:00:00Z'),
      });
      await closeAnyOpenSession(driverB);

      const session = await trackingService.openSession({
        authUserId: AUTH_B,
        tripId,
        device: null,
      });
      expect(session.tripId).toBe(tripId);
      expect(session.runId).toBeNull();
      expect(session.vehicleId).toBe(vehicleId);

      const forTrip = await tracking.listSessionsForTrip(tripId);
      expect(forTrip.map((row) => row.id)).toContain(session.id);
      await closeAnyOpenSession(driverB);
    });

    /* ---------------------------------------------------------------- *
     * 4. CA CHUOI: phien -> ban dinh vi -> hai moc bat buoc kem vi tri
     * ---------------------------------------------------------------- */

    it('LAI XE TU DI HET CHUOI: DELIVERY_ARRIVAL va DELIVERY_ACCEPTED bang ban dinh vi CUA CHINH HO', async () => {
      await closeAnyOpenSession(driverA);
      const session = await trackingService.openSession({
        authUserId: AUTH_A,
        runId,
        device: null,
      });

      // Hai moc dan duong, ca hai KHONG doi vi tri — nen chung di qua truoc khi cong that hien ra.
      for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] as const) {
        await checkpoints.recordAsDriver({
          type,
          runId,
          legId,
          authUserId: AUTH_A,
          clientEventId: `${PREFIX}-${type}`,
        });
      }

      // CONG THAT: thieu ban dinh vi thi bi tu choi — chinh sach `#232` D-08 khong bi noi long.
      await expect(
        checkpoints.recordAsDriver({
          type: 'DELIVERY_ARRIVAL',
          runId,
          legId,
          authUserId: AUTH_A,
          clientEventId: `${PREFIX}-ARRIVAL-NO-LOC`,
        }),
      ).rejects.toMatchObject({ reason: 'CHECKPOINT_LOCATION_REQUIRED' });

      const arrivalObservation = await trackingService.ingest({
        authUserId: AUTH_A,
        sessionId: session.id,
        clientEventId: `${PREFIX}-obs-arrival`,
        latitude: HANOI.latitude,
        longitude: HANOI.longitude,
        accuracyMetres: 12,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: new Date('2026-09-19T03:00:00Z'),
        mockLocationReported: false,
      });

      const arrival = await checkpoints.recordAsDriver({
        type: 'DELIVERY_ARRIVAL',
        runId,
        legId,
        authUserId: AUTH_A,
        observationId: arrivalObservation.id,
        clientEventId: `${PREFIX}-ARRIVAL`,
      });
      expect(arrival.observationId).toBe(arrivalObservation.id);
      expect(arrival.driverId).toBe(driverA);

      const acceptedObservation = await trackingService.ingest({
        authUserId: AUTH_A,
        sessionId: session.id,
        clientEventId: `${PREFIX}-obs-accepted`,
        latitude: HANOI.latitude + 0.0002,
        longitude: HANOI.longitude + 0.0002,
        accuracyMetres: 10,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: new Date('2026-09-19T03:10:00Z'),
        mockLocationReported: false,
      });

      const accepted = await checkpoints.recordAsDriver({
        type: 'DELIVERY_ACCEPTED',
        runId,
        legId,
        authUserId: AUTH_A,
        observationId: acceptedObservation.id,
        clientEventId: `${PREFIX}-ACCEPTED`,
      });
      expect(accepted.observationId).toBe(acceptedObservation.id);

      /*
       * GUI LAI dung khoa cu KHONG sinh moc thu hai.
       *
       * Day la hinh dang cua mot lan mat song tren duong ve: may khach da ghi xong, khong nhan
       * duoc cau tra loi, va bam lai. Mot moc thua tren dong thoi gian la mot con so sai trong ho
       * so ma ke toan doc de duyet phu cap.
       */
      const replay = await checkpoints.recordAsDriver({
        type: 'DELIVERY_ACCEPTED',
        runId,
        legId,
        authUserId: AUTH_A,
        observationId: acceptedObservation.id,
        clientEventId: `${PREFIX}-ACCEPTED`,
      });
      expect(replay.id).toBe(accepted.id);

      const onLeg = await checkpointRepo.listForLeg(legId);
      expect(onLeg.filter((row) => row.type === 'DELIVERY_ACCEPTED')).toHaveLength(1);
    });

    it('ban dinh vi CUA NGUOI KHAC khong lam bang chung duoc', async () => {
      await closeAnyOpenSession(driverB);
      await trips.assign(tripId, {
        driverId: driverB,
        vehicleId,
        assignedBy: PREFIX,
        at: new Date('2026-09-19T04:00:00Z'),
      });
      const foreign = await trackingService.openSession({
        authUserId: AUTH_B,
        tripId,
        device: null,
      });
      const foreignObservation = await trackingService.ingest({
        authUserId: AUTH_B,
        sessionId: foreign.id,
        clientEventId: `${PREFIX}-obs-foreign`,
        latitude: HANOI.latitude,
        longitude: HANOI.longitude,
        accuracyMetres: 9,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: new Date('2026-09-19T04:05:00Z'),
        mockLocationReported: false,
      });

      // Lai xe A muon vi tri cua lai xe B lam bang chung "toi da den noi". Khong duong nao.
      await expect(
        checkpoints.recordAsDriver({
          type: 'DELIVERY_ARRIVAL',
          runId,
          legId,
          authUserId: AUTH_A,
          observationId: foreignObservation.id,
          clientEventId: `${PREFIX}-ARRIVAL-FOREIGN`,
        }),
      ).rejects.toMatchObject({ reason: 'CHECKPOINT_OBSERVATION_NOT_OWNED', kind: 'DENIED' });

      await closeAnyOpenSession(driverB);
    });
  },
);
