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
import { LocationHealthService } from './location-health.service.js';
import { PrismaTrackingRepository } from './prisma-tracking.repository.js';
import { UnconfiguredVehicleTelematicsAdapter } from './telematics/vehicle-telematics.port.js';
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
const PLATE_B = `${PREFIX}-0002`;
const RUN_CODE = `${PREFIX}-VC-1`;
/**
 * VONG CHAY THU HAI CUA CHINH LAI XE A — mot ca lam viec that co nhieu hon mot vong chay.
 *
 * Hai bai o cuoi tep can dung hinh dang nay va khong hinh dang nao khac: mot NGUOI cam hai vong
 * chay. Mot vong chay cua lai xe B se lam moi lan tu choi co the la `DRIVER_NOT_ASSIGNED`, va bai
 * kiem se xanh ma chua cham toi cai no dinh do.
 */
const RUN_CODE_B = `${PREFIX}-VC-2`;
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

    const proofCore = new TransportProofCoreFactsAdapter(trips, fleet, movement);
    const trackingService = new TrackingService(
      tracking,
      proofCore,
      { timeZone: 'Asia/Ho_Chi_Minh' },
      DEFAULT_TRANSPORT_PROOF_POLICY,
    );
    /*
     * PHEP CHAM SUC KHOE tren DUNG bo phan that — cung kho, cung cong su that.
     *
     * Cong telematics de o ban "chua khai": khong bai nao o day noi ve phan cung tren xe, va mot
     * ban gia "da khai" se keo `ALL_SOURCES_LOST` vao mot phep do khong hoi ve no.
     */
    const health = new LocationHealthService(
      tracking,
      new UnconfiguredVehicleTelematicsAdapter(),
      proofCore,
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
    /**
     * CHANG THU HAI, va no ton tai vi mot ly do CU THE.
     *
     * `evaluateCheckpoint()` chan `CHECKPOINT_ALREADY_RECORDED` TRUOC khi cong so huu ban dinh vi
     * duoc hoi toi. Nen neu bai doi chung am chay tren cung chang voi chuoi thanh cong, no se
     * nhan mot lan tu choi HOAN TOAN DUNG nhung SAI CHO — va cai no dinh do (lai xe A khong muon
     * duoc vi tri cua lai xe B) khong he duoc do. Mot chang rieng giu cho cong so huu la cong DUY
     * NHAT con lai tren duong di.
     */
    let otherLegId = '';
    let tripId = '';
    let runBId = '';
    let legBId = '';
    let vehicleBId = '';

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
        where: { code: { in: [RUN_CODE, RUN_CODE_B] } },
        select: { id: true },
      });
      const runIds = runs.map((row) => row.id);
      const ownSession = {
        OR: [{ runId: { in: runIds } }, { trip: { code: TRIP_CODE } }],
      };

      /*
       * MOC la APPEND-ONLY o tang DB (`transport_run_checkpoint_append_only`, `#243` F1): mot
       * dong thoi gian ma xoa duoc thi khong con chung minh dieu gi. Khoa ngoai cua no lai la
       * `Restrict`, nen khong co duong `CASCADE` nao — va lan don dep BUOC PHAI tat trigger mot
       * cach tuong minh. Thao tac nay chi xay ra o day, trong mot bai IT, va duoc bat lai ngay o
       * `finally`. Cung khuon voi `transport-site-intake.int.spec.ts`.
       */
      if (runIds.length > 0) {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "TransportRunCheckpoint" DISABLE TRIGGER "transport_run_checkpoint_append_only"',
        );
        try {
          await prisma.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
        } finally {
          await prisma.$executeRawUnsafe(
            'ALTER TABLE "TransportRunCheckpoint" ENABLE TRIGGER "transport_run_checkpoint_append_only"',
          );
        }
      }
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
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { in: [PLATE, PLATE_B] } },
      });
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
      const otherLeg = await movement.createLeg({
        runId: run.id,
        sequence: 2,
        kind: 'LOADED',
        orderId: null,
        originLabel: 'Hai Phong',
        destinationLabel: 'Nam Dinh',
        businessDate: BUSINESS_DATE,
      });
      // Ban phan cong la SU THAT duy nhat noi mot con nguoi voi mot vong chay. Thieu buoc nay thi
      // moi bai duoi day deu do voi `DRIVER_NOT_ASSIGNED_TO_RUN` — va do se la loi cua fixture.
      await movement.assignRun(run.id, {
        driverId: a.id,
        effectiveFrom: new Date('2026-09-19T01:00:00Z'),
        assignedBy: PREFIX,
      });
      const vehicleB = await fleet.createVehicle({
        registrationPlate: PLATE_B,
        vehicleClass: 'Dau keo',
      });
      const runB = await movement.createRun({
        code: RUN_CODE_B,
        vehicleId: vehicleB.id,
        businessDate: BUSINESS_DATE,
      });
      const legB = await movement.createLeg({
        runId: runB.id,
        sequence: 1,
        kind: 'LOADED',
        orderId: null,
        originLabel: 'Ha Noi',
        destinationLabel: 'Ninh Binh',
        businessDate: BUSINESS_DATE,
      });
      // CUNG mot lai xe cam ca hai vong chay — xem chu thich o `RUN_CODE_B`.
      await movement.assignRun(runB.id, {
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
      otherLegId = otherLeg.id;
      tripId = trip.id;
      runBId = runB.id;
      legBId = legB.id;
      vehicleBId = vehicleB.id;
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

      // Hai moc dan duong TREN CHANG THU HAI, de `DELIVERY_ARRIVAL` o do con di toi duoc cong so
      // huu thay vi dung lai o `CHECKPOINT_ALREADY_RECORDED`.
      for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] as const) {
        await checkpoints.recordAsDriver({
          type,
          runId,
          legId: otherLegId,
          authUserId: AUTH_A,
          clientEventId: `${PREFIX}-OTHER-${type}`,
        });
      }

      // Lai xe A muon vi tri cua lai xe B lam bang chung "toi da den noi". Khong duong nao.
      await expect(
        checkpoints.recordAsDriver({
          type: 'DELIVERY_ARRIVAL',
          runId,
          legId: otherLegId,
          authUserId: AUTH_A,
          observationId: foreignObservation.id,
          clientEventId: `${PREFIX}-ARRIVAL-FOREIGN`,
        }),
      ).rejects.toMatchObject({ reason: 'CHECKPOINT_OBSERVATION_NOT_OWNED', kind: 'DENIED' });

      await closeAnyOpenSession(driverB);
    });

    /* ---------------------------------------------------------------- *
     * 5. BANG CHUNG CUA VONG CHAY NAY, KHONG CUA VONG CHAY KIA
     * ---------------------------------------------------------------- */

    /**
     * CUNG MOT LAI XE, HAI VONG CHAY — hinh dang ma cong so huu lai xe KHONG chan duoc.
     *
     * Bai ngay tren do "vi tri cua NGUOI khac". Bai nay do mot thu khac han: vi tri cua CHINH
     * nguoi do, that tung centimet, nhung chup o mot CHUYEN VIEC khac. Ke tu khi mot phien co chu
     * the la vong chay, mot nguoi cam hai vong chay trong ngay co du hai ban dinh vi hop le — va
     * khong gi ngan ho dua ban cua vong chay kia vao moc `DELIVERY_ARRIVAL` dang bam, tuc chung
     * minh ho dang o mot noi ho khong o.
     */
    it('ban dinh vi cua VONG CHAY A khong chung minh duoc `DELIVERY_ARRIVAL` cua VONG CHAY B', async () => {
      await closeAnyOpenSession(driverA);
      const onRunA = await trackingService.openSession({
        authUserId: AUTH_A,
        runId,
        device: null,
      });
      const observationOnRunA = await trackingService.ingest({
        authUserId: AUTH_A,
        sessionId: onRunA.id,
        clientEventId: `${PREFIX}-obs-cross-run`,
        latitude: HANOI.latitude,
        longitude: HANOI.longitude,
        accuracyMetres: 11,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: new Date('2026-09-19T05:00:00Z'),
        mockLocationReported: false,
      });

      // Hai moc dan duong tren chang cua VONG CHAY B, de `DELIVERY_ARRIVAL` o do di toi duoc cong
      // ban dinh vi thay vi dung lai o `CHECKPOINT_PREDECESSOR_MISSING`.
      for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] as const) {
        await checkpoints.recordAsDriver({
          type,
          runId: runBId,
          legId: legBId,
          authUserId: AUTH_A,
          clientEventId: `${PREFIX}-B-${type}`,
        });
      }

      await expect(
        checkpoints.recordAsDriver({
          type: 'DELIVERY_ARRIVAL',
          runId: runBId,
          legId: legBId,
          authUserId: AUTH_A,
          observationId: observationOnRunA.id,
          clientEventId: `${PREFIX}-B-ARRIVAL-CROSS`,
        }),
      ).rejects.toMatchObject({ reason: 'CHECKPOINT_OBSERVATION_NOT_FOR_RUN', kind: 'DENIED' });

      // Khong mot moc nao duoc ghi tu lan tren. Khong khang dinh THU TU: `listForLeg` sap theo
      // `receivedAt`, va hai lan ghi trong cung mot mili giay se cho mot thu tu khong xac dinh.
      const onLegB = await checkpointRepo.listForLeg(legBId);
      expect(onLegB).toHaveLength(2);
      expect(onLegB.some((row) => row.type.startsWith('DELIVERY_'))).toBe(false);

      /*
       * DOI CHUNG DUONG. Thieu doan nay thi hai lan tu choi o tren co the den tu bat ky thu gi
       * khac tren duong di, va bai kiem se "xanh" trong khi cong that chua bao gio duoc cham toi.
       * Cung lai xe, cung moc, cung chang: chi doi MOT thu la vong chay cua ban dinh vi.
       */
      await closeAnyOpenSession(driverA);
      const onRunB = await trackingService.openSession({
        authUserId: AUTH_A,
        runId: runBId,
        device: null,
      });
      expect(onRunB.vehicleId).toBe(vehicleBId);
      const observationOnRunB = await trackingService.ingest({
        authUserId: AUTH_A,
        sessionId: onRunB.id,
        clientEventId: `${PREFIX}-obs-run-b`,
        latitude: HANOI.latitude + 0.0005,
        longitude: HANOI.longitude + 0.0005,
        accuracyMetres: 10,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: new Date('2026-09-19T05:10:00Z'),
        mockLocationReported: false,
      });
      const arrivalOnB = await checkpoints.recordAsDriver({
        type: 'DELIVERY_ARRIVAL',
        runId: runBId,
        legId: legBId,
        authUserId: AUTH_A,
        observationId: observationOnRunB.id,
        clientEventId: `${PREFIX}-B-ARRIVAL`,
      });
      expect(arrivalOnB.observationId).toBe(observationOnRunB.id);

      /*
       * VA MOC THU HAI — `DELIVERY_ACCEPTED`, cung bat buoc kem vi tri (`#232` D-08).
       *
       * No phai do o DAY chu khong o tren, va do khong phai chuyen sap xep: `evaluateCheckpoint()`
       * hoi `CHECKPOINT_PREDECESSOR_MISSING` TRUOC khi cong ban dinh vi duoc cham toi. Dat lan nay
       * truoc khi `DELIVERY_ARRIVAL` ton tai thi no se do voi mot ly do hoan toan dung nhung SAI
       * CHO — va cai no dinh chung minh khong he duoc kiem. Cung mot bay ma khoi chu thich o
       * `otherLegId` da ghi lai mot lan.
       */
      await expect(
        checkpoints.recordAsDriver({
          type: 'DELIVERY_ACCEPTED',
          runId: runBId,
          legId: legBId,
          authUserId: AUTH_A,
          observationId: observationOnRunA.id,
          clientEventId: `${PREFIX}-B-ACCEPTED-CROSS`,
        }),
      ).rejects.toMatchObject({ reason: 'CHECKPOINT_OBSERVATION_NOT_FOR_RUN', kind: 'DENIED' });
      expect(
        (await checkpointRepo.listForLeg(legBId)).some((row) => row.type === 'DELIVERY_ACCEPTED'),
      ).toBe(false);
    });

    /* ---------------------------------------------------------------- *
     * 6. VONG DOI: phien khong song lau hon vong chay cua no
     * ---------------------------------------------------------------- */

    /**
     * MOT CA LAM VIEC THAT, tren DB that.
     *
     * Man hinh hien truong mo phien mot cach NGAM va khong co nut dung. Neu phien cua vong chay
     * vua xong o lai `ACTIVE`, hai thu hong cung luc, va ca hai deu im lang:
     *
     *   · `TransportTrackingSession_activeDriver_key` chi cho MOT phien ACTIVE moi lai xe — nen
     *     lai xe bam moc cua vong chay ke tiep va nhan `DRIVER_HAS_ANOTHER_OPEN_SESSION`;
     *   · phep cham suc khoe van doi vi tri cua mot chiec xe khong con chay chuyen nao.
     *
     * Bai nay di het ca hai, va KHONG co mot lan dieu hanh nao don tay o giua.
     */
    it('vong chay ve trang thai cuoi: het ky vong suc khoe, va lai xe mo duoc phien ke tiep NGAY', async () => {
      await closeAnyOpenSession(driverA);
      const onRunA = await trackingService.openSession({
        authUserId: AUTH_A,
        runId,
        device: null,
      });
      await trackingService.ingest({
        authUserId: AUTH_A,
        sessionId: onRunA.id,
        clientEventId: `${PREFIX}-obs-lifecycle`,
        latitude: HANOI.latitude,
        longitude: HANOI.longitude,
        accuracyMetres: 9,
        speedMetresPerSecond: null,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: new Date('2026-09-19T06:00:00Z'),
        mockLocationReported: false,
      });

      // TRUOC: vong chay con chay, nen CO mot ky vong that — khong phai `NOT_TRACKED`.
      expect((await health.forVehicle(vehicleId)).status).not.toBe('NOT_TRACKED');

      // Vong chay A ket thuc. Dung buoc chuyen ma san pham that ghi ra, khong mot duong rieng nao.
      await movement.setRunStatus(runId, 'COMPLETED', new Date('2026-09-19T07:00:00Z'));

      // SAU: khong con ky vong nao — va phien van chua bi ai dong. Phep cham la mot phep DOC.
      expect((await health.forVehicle(vehicleId)).status).toBe('NOT_TRACKED');
      expect((await tracking.findSession(onRunA.id))?.status).toBe('ACTIVE');

      // Va lai xe mo duoc phien tren vong chay ke tiep NGAY, khong ai dong tay vao gi.
      const onRunB = await trackingService.openSession({
        authUserId: AUTH_A,
        runId: runBId,
        device: null,
      });
      expect(onRunB.id).not.toBe(onRunA.id);
      expect(onRunB.runId).toBe(runBId);
      expect(onRunB.status).toBe('ACTIVE');

      // Phien cu da duoc dong THAT — mot hang `ACTIVE` con lai van chiem cho khoa mot phan — va no
      // noi ro vi sao no dong.
      const stale = await tracking.findSession(onRunA.id);
      expect(stale?.status).not.toBe('ACTIVE');
      expect(stale?.endedReason).toBe('RUN_TERMINAL');

      await closeAnyOpenSession(driverA);
    });
  },
);
