import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaGeofenceRepository } from '../proof/geofence.repository.js';
import { describeStorageError, isUniqueViolationOn } from '../storage-conflict.js';
import {
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
} from './site-intake-facts.port.js';
import { PrismaRunSiteIntakeRepository } from './prisma-site-intake.repository.js';
import { SITE_INTAKE_DRIVER_EVENT } from './site-intake.repository.js';
import { SiteIntakeService } from './site-intake.service.js';

/**
 * NHAN VIEC TAI DIA DIEM A tren POSTGRES THAT (`#267` H1/H3/H4/H7).
 *
 * Ban trong bo nho khong chung minh duoc cai ma tranche nay thuc su dua vao: khoa chong lap KEP,
 * trigger chi-ghi-them, ba `CHECK`, va gia tri enum `COUNTERPARTY_SITE` vua them. Bo test nay
 * chung minh nhung thu do.
 *
 * VA MOT DIEU NUA, quan trong hon ca: `isUniqueViolationOn` phai NHAN RA duoc va cham thuc te.
 * Prisma khong bao ten index — no doi nguoc ten constraint thanh TEN TRUONG. Bay do da ton mot
 * vong CI o T2.1, va o day no nguy hiem hon: khong nhan ra thi mot lan gui lai se tra ve `500`
 * thay vi tra ve vong chay da tao, va ung dung lai xe se cham lai.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const RUN_PREFIX = 'IT-SI';
const PLATE_PREFIX = 'IT-SI-XE';
const PHONE_PREFIX = '0966SI';
const PARTY_PREFIX = 'IT-SI Phap nhan';
const FENCE_PREFIX = 'IT-SI Hang rao';

const ACTOR = 'it-site-intake';
const AUTH = 'it-si-lai-xe';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };
const HA_NOI = { latitude: 21.0278, longitude: 105.8342 };

class StubLocationFacts extends TransportSiteIntakeLocationFacts {
  readonly rows = new Map<string, SiteIntakeObservationFacts>();
  async findObservation(id: string): Promise<SiteIntakeObservationFacts | null> {
    return this.rows.get(id) ?? null;
  }
}

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'nhan viec tai dia diem A tren Postgres that',
  () => {
    const prisma = new PrismaService();
    const sites = new PrismaCounterpartySiteRepository(prisma);
    const counterparties = new PrismaCounterpartyRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const movementRepo = new PrismaMovementRepository(prisma);
    const geofences = new PrismaGeofenceRepository(prisma);
    const intakes = new PrismaRunSiteIntakeRepository(prisma);
    const locations = new StubLocationFacts();

    const siteService = new CounterpartySiteService(sites, counterparties);
    const movement = new MovementService(
      movementRepo,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      POLICY,
    );
    const service = new SiteIntakeService(
      intakes,
      new TransportSiteIntakeCoreFactsAdapter(fleet, movementRepo, siteService),
      new TransportSiteIntakeGeoFactsAdapter(geofences),
      locations,
      movement,
      POLICY,
    );

    let siteId = '';
    let partyId = '';
    let driverId = '';
    let vehicleId = '';

    /** Don dep theo THU TU AN TOAN VE KHOA NGOAI: nhan viec -> chang -> phan cong -> vong chay -> ... */
    async function cleanup(): Promise<void> {
      const runs = await prisma.transportVehicleRun.findMany({
        where: { code: { startsWith: RUN_PREFIX } },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);

      // Ban ghi xac nhan bi trigger `..._append_only` chan khi bo TRUC TIEP, va khoa ngoai cua no la
      // `Restrict` nen khong co duong `CASCADE` nao. Nen lan don dep phai TAT trigger mot cach tuong
      // minh — mot thao tac chi xay ra o day, trong mot bai IT, va duoc bat lai ngay. Cung khuon
      // `transport-driver-settlement.int.spec.ts`.
      if (runIds.length > 0) {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "TransportRunSiteIntake" DISABLE TRIGGER "transport_run_site_intake_append_only"',
        );
        try {
          await prisma.transportRunSiteIntake.deleteMany({ where: { runId: { in: runIds } } });
        } finally {
          await prisma.$executeRawUnsafe(
            'ALTER TABLE "TransportRunSiteIntake" ENABLE TRIGGER "transport_run_site_intake_append_only"',
          );
        }
      }
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });

      await prisma.transportGeofence.deleteMany({ where: { label: { startsWith: FENCE_PREFIX } } });
      await prisma.transportCounterpartySite.deleteMany({
        where: { counterparty: { name: { startsWith: PARTY_PREFIX } } },
      });
      await prisma.transportCounterparty.deleteMany({
        where: { name: { startsWith: PARTY_PREFIX } },
      });
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicle: { registrationPlate: { startsWith: PLATE_PREFIX } } },
      });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    beforeAll(async () => {
      await prisma.$connect();
      await cleanup();

      const party = await counterparties.create({ name: `${PARTY_PREFIX} ABC` });
      partyId = party.id;
      const site = await sites.create({
        counterpartyId: partyId,
        name: 'Kho Hai Phong',
        address: 'KCN Dinh Vu',
        note: null,
        status: 'ACTIVE',
        recordedBy: ACTOR,
      });
      siteId = site.id;

      await geofences.register({
        label: `${FENCE_PREFIX} Hai Phong`,
        subjectKind: 'COUNTERPARTY_SITE',
        subjectId: siteId,
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        radiusMetres: 300,
        note: null,
        recordedBy: ACTOR,
      });

      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-1`,
        vehicleClass: 'Dau keo',
      });
      vehicleId = vehicle.id;
      const driver = await fleet.createDriver({
        fullName: 'IT-SI Lai xe',
        phone: `${PHONE_PREFIX}01`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: AUTH,
      });
      driverId = driver.id;
      await fleet.assignDriverToVehicle(vehicleId, driverId, new Date());
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    /* ---------------------------------------------------------------- *
     * H1 — rang buoc cua bang dia diem
     * ---------------------------------------------------------------- */

    it('gia tri enum `COUNTERPARTY_SITE` that su ghi duoc vao `TransportGeofence`', async () => {
      const active = await geofences.listActive();
      const mine = active.filter((fence) => fence.subjectId === siteId);
      expect(mine).toHaveLength(1);
      expect(mine[0]?.subjectKind).toBe('COUNTERPARTY_SITE');
    });

    it('hai kho CUNG mot phap nhan khong trung ten duoc — o tang DB', async () => {
      await expect(
        sites.create({
          counterpartyId: partyId,
          name: 'Kho Hai Phong',
          address: null,
          note: null,
          status: 'ACTIVE',
          recordedBy: ACTOR,
        }),
      ).rejects.toBeTruthy();
    });

    it('hai phap nhan KHAC NHAU van dat cung mot ten kho', async () => {
      const other = await counterparties.create({ name: `${PARTY_PREFIX} XYZ` });
      const twin = await sites.create({
        counterpartyId: other.id,
        name: 'Kho Hai Phong',
        address: null,
        note: null,
        status: 'ACTIVE',
        recordedBy: ACTOR,
      });
      expect(twin.name).toBe('Kho Hai Phong');
      expect(twin.counterpartyId).toBe(other.id);
    });

    it('`CHECK` chan ten kho rong', async () => {
      await expect(
        sites.create({
          counterpartyId: partyId,
          name: '   ',
          address: null,
          note: null,
          status: 'ACTIVE',
          recordedBy: ACTOR,
        }),
      ).rejects.toBeTruthy();
    });

    it('`RESTRICT` chan lenh bo mot phap nhan con dia diem', async () => {
      await expect(
        prisma.transportCounterparty.delete({ where: { id: partyId } }),
      ).rejects.toBeTruthy();
    });

    /* ---------------------------------------------------------------- *
     * H3/H4 — duong day du tren Postgres
     * ---------------------------------------------------------------- */

    it('de nghi nhan ra kho A, va KHONG tao mot vong chay nao', async () => {
      const before = await prisma.transportVehicleRun.count({
        where: { code: { startsWith: RUN_PREFIX } },
      });

      const proposal = await service.propose({
        authUserId: AUTH,
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });

      expect(proposal.outcome).toBe('UNIQUE');
      expect(proposal.candidates[0]?.siteName).toBe('Kho Hai Phong');
      expect(proposal.candidates[0]?.counterpartyName).toBe(`${PARTY_PREFIX} ABC`);
      expect(
        await prisma.transportVehicleRun.count({ where: { code: { startsWith: RUN_PREFIX } } }),
      ).toBe(before);
    });

    /**
     * MA VONG CHAY do may chu sinh nen bo test khong dat duoc tien to don dep vao no. Nen o day doi
     * ma sinh ra ve dung tien to bang cach doi ten NGAY SAU khi tao — mot lan ghi cua chinh bo test,
     * khong phai mot duong cua san pham.
     */
    async function renameForCleanup(runId: string): Promise<string> {
      const code = `${RUN_PREFIX}-${runId.slice(0, 8)}`;
      await prisma.transportVehicleRun.update({ where: { id: runId }, data: { code } });
      return code;
    }

    it('mot cham tao DUNG mot vong chay, mot chang va mot ban ghi xac nhan', async () => {
      const result = await service.confirm({
        authUserId: AUTH,
        siteId,
        clientEventId: 'it-si-cham-mot',
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });
      await renameForCleanup(result.runId);

      const run = await prisma.transportVehicleRun.findUniqueOrThrow({
        where: { id: result.runId },
        include: { legs: true, assignments: true, siteIntake: true },
      });

      expect(run.status).toBe('PLANNED');
      expect(run.vehicleId).toBe(vehicleId);
      expect(run.legs).toHaveLength(1);
      expect(run.legs[0]?.orderId).toBeNull();
      expect(run.legs[0]?.kind).toBe('LOADED');
      expect(run.assignments[0]?.driverId).toBe(driverId);
      expect(run.siteIntake?.siteId).toBe(siteId);
      expect(run.siteIntake?.locationTrust).toBe('DRIVER_REPORTED');
      // Khong nghia vu thuong mai nao ra doi cung no.
      expect(
        await prisma.transportOrder.count({ where: { legs: { some: { runId: run.id } } } }),
      ).toBe(0);
    });

    /**
     * BAI QUAN TRONG NHAT CUA TEP NAY.
     *
     * Khoa chong lap KEP `(driverId, clientEventId)` phai chan lan ghi thu hai, VA
     * `isUniqueViolationOn` phai nhan ra duoc va cham do — vi Prisma bao TEN TRUONG chu khong bao ten
     * index. Khong nhan ra thi mot lan gui lai tra ve `500` thay vi tra ve vong chay da tao.
     */
    it('gui lai cung khoa tra ve DUNG vong chay cu, khong tao ban thu hai', async () => {
      const before = await prisma.transportVehicleRun.count({
        where: { code: { startsWith: RUN_PREFIX } },
      });

      const replay = await service.confirm({
        authUserId: AUTH,
        siteId,
        clientEventId: 'it-si-cham-mot',
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });

      expect(replay.replayed).toBe(true);
      expect(
        await prisma.transportVehicleRun.count({ where: { code: { startsWith: RUN_PREFIX } } }),
      ).toBe(before);
    });

    /**
     * BAI QUAN TRONG NHAT CUA TEP NAY — va no do o lan chay dau, dung cai bay ma no sinh ra de bat.
     *
     * Lan viet dau dung LAI `runId`/`legId` cua ban ghi da co, nen Postgres cham
     * `TransportRunSiteIntake_runId_key` TRUOC — mot unique KHAC — va bai "chung minh khoa chong lap
     * duoc nhan ra" that ra dang chung minh mot dieu khac. Duong cua san pham khong bao gio o hinh
     * dang do: hai yeu cau song song tao HAI vong chay rieng roi moi cham nhau o `(driverId,
     * clientEventId)`. Nen bai nay phai dung mot vong chay MOI.
     */
    it('`isUniqueViolationOn` NHAN RA va cham that cua khoa chong lap kep', async () => {
      const existing = await intakes.findByEvent(driverId, 'it-si-cham-mot');
      expect(existing).not.toBeNull();

      // Mot vong chay + chang RIENG, dung nhu duong song song that: hai lan `confirm` cung khoa se
      // tao hai vong chay khac nhau, roi lan thu hai dung o khoa chong lap.
      const rival = await movement.createRun(
        { code: `${RUN_PREFIX}-DUA`, vehicleId, businessDate: '2026-09-09', note: null },
        ACTOR,
      );
      const rivalLeg = await movement.addLeg(
        rival.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: null,
          originLabel: 'IT-SI A',
          destinationLabel: 'IT-SI B',
          businessDate: '2026-09-09',
          distanceKm: null,
          note: null,
        },
        ACTOR,
      );

      let recognised = false;
      let described = '';
      try {
        await intakes.create({
          runId: rival.id,
          legId: rivalLeg.id,
          siteId,
          driverId,
          confirmedBy: ACTOR,
          locationTrust: 'DRIVER_REPORTED',
          observationId: null,
          distanceMetres: null,
          clientEventId: 'it-si-cham-mot',
          confirmedAt: new Date(),
          businessDate: '2026-09-09',
        });
      } catch (error) {
        recognised = isUniqueViolationOn(error, SITE_INTAKE_DRIVER_EVENT);
        described = describeStorageError(error);
      }
      expect(recognised, `va cham khong duoc dich: ${described}`).toBe(true);
    });

    it('lai xe dang co vong chay chua ket thuc thi khong tao them duoc', async () => {
      await expect(
        service.confirm({
          authUserId: AUTH,
          siteId,
          clientEventId: 'it-si-cham-hai',
          latitude: HAI_PHONG.latitude,
          longitude: HAI_PHONG.longitude,
          accuracyMetres: 10,
        }),
      ).rejects.toMatchObject({ reason: 'SITE_INTAKE_OPEN_RUN_EXISTS' });
    });

    it('kho khong quanh vi tri da gui bi tu choi', async () => {
      await expect(
        service.propose({
          authUserId: AUTH,
          latitude: HA_NOI.latitude,
          longitude: HA_NOI.longitude,
          accuracyMetres: 10,
        }),
      ).resolves.toMatchObject({ outcome: 'NO_MATCH' });
    });

    /* ---------------------------------------------------------------- *
     * H7 — rang buoc cua tang luu tru, do TRUC TIEP
     * ---------------------------------------------------------------- */

    /**
     * Hai bai duoi day di qua CHINH client ma san pham dung, khong qua SQL tho. Do la co y: neu mot
     * ngay ai do them mot duong sua vao repository thi no se di dung duong nay, va bai nay se do.
     */
    it('trigger chan moi lan SUA mot ban ghi xac nhan', async () => {
      const row = await intakes.findByEvent(driverId, 'it-si-cham-mot');
      expect(row).not.toBeNull();

      await expect(
        prisma.transportRunSiteIntake.update({
          where: { id: row?.id ?? '' },
          data: { confirmedBy: 'nguoi-khac' },
        }),
      ).rejects.toThrow(/append_only/);
    });

    it('trigger chan moi lan BO mot ban ghi xac nhan', async () => {
      const row = await intakes.findByEvent(driverId, 'it-si-cham-mot');

      await expect(
        prisma.transportRunSiteIntake.delete({ where: { id: row?.id ?? '' } }),
      ).rejects.toThrow(/append_only/);
    });

    /**
     * `SERVER_BOUND` ma khong co ban dinh vi la mot lan noi doi ve suc nang cua bang chung: no doc ra
     * la "vi tri da qua kiem" trong khi khong co hang nao de mo. Duong ghi cua san pham khong tao ra
     * duoc hinh dang do, nen bai nay di thang xuong SQL de kiem chinh `CHECK`.
     */
    it('`CHECK` chan `SERVER_BOUND` khong kem ban dinh vi', async () => {
      const row = await intakes.findByEvent(driverId, 'it-si-cham-mot');
      await expect(
        prisma.$executeRaw`
        INSERT INTO "TransportRunSiteIntake"
          ("id", "runId", "legId", "siteId", "driverId", "confirmedBy", "locationTrust",
           "observationId", "distanceMetres", "clientEventId", "businessDate")
        VALUES ('it-si-noi-doi', ${row?.runId ?? ''}, ${row?.legId ?? ''}, ${siteId}, ${driverId},
                ${ACTOR}, 'SERVER_BOUND', NULL, NULL, 'it-si-noi-doi', '2026-09-09')`,
      ).rejects.toBeTruthy();
    });

    it('`CHECK` chan ngay nghiep vu sai dang', async () => {
      const row = await intakes.findByEvent(driverId, 'it-si-cham-mot');
      await expect(
        prisma.$executeRaw`
        INSERT INTO "TransportRunSiteIntake"
          ("id", "runId", "legId", "siteId", "driverId", "confirmedBy", "locationTrust",
           "observationId", "distanceMetres", "clientEventId", "businessDate")
        VALUES ('it-si-ngay-sai', ${row?.runId ?? ''}, ${row?.legId ?? ''}, ${siteId}, ${driverId},
                ${ACTOR}, 'DRIVER_REPORTED', NULL, NULL, 'it-si-ngay-sai', '09/09/2026')`,
      ).rejects.toBeTruthy();
    });

    it('`CHECK` chan khoa chong lap rong', async () => {
      const row = await intakes.findByEvent(driverId, 'it-si-cham-mot');
      await expect(
        prisma.$executeRaw`
        INSERT INTO "TransportRunSiteIntake"
          ("id", "runId", "legId", "siteId", "driverId", "confirmedBy", "locationTrust",
           "observationId", "distanceMetres", "clientEventId", "businessDate")
        VALUES ('it-si-khoa-rong', ${row?.runId ?? ''}, ${row?.legId ?? ''}, ${siteId}, ${driverId},
                ${ACTOR}, 'DRIVER_REPORTED', NULL, NULL, '   ', '2026-09-09')`,
      ).rejects.toBeTruthy();
    });

    /**
     * Hai truy van Prisma cua tranche nay khong co ban trong bo nho nao chung minh ho: `some` tren
     * quan he phan cong, va `findFirst` tren ban phan cong xe con hieu luc.
     */
    it('`listOpenRunsForDriver` doc dung tren quan he phan cong', async () => {
      const open = await movementRepo.listOpenRunsForDriver(driverId);
      expect(open).toHaveLength(1);
      expect(open[0]?.status).toBe('PLANNED');

      expect(await movementRepo.listOpenRunsForDriver('khong-co-lai-xe-nao')).toEqual([]);
    });

    it('`activeVehicleForDriver` doc dung ban phan cong con hieu luc', async () => {
      expect(await fleet.activeVehicleForDriver(driverId)).toBe(vehicleId);
      expect(await fleet.activeVehicleForDriver('khong-co-lai-xe-nao')).toBeNull();
    });

    it('vong chay da huy khong con chan, va lan nhan viec ke tiep tao duoc', async () => {
      for (const run of await movementRepo.listOpenRunsForDriver(driverId)) {
        await movement.cancelRun(run.id, 'IT don dep', ACTOR);
      }

      const next = await service.confirm({
        authUserId: AUTH,
        siteId,
        clientEventId: 'it-si-cham-ba',
        latitude: HAI_PHONG.latitude,
        longitude: HAI_PHONG.longitude,
        accuracyMetres: 10,
      });
      await renameForCleanup(next.runId);

      expect(next.replayed).toBe(false);
      expect(next.destinationPending).toBe(true);
    });
  },
);
