import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaFleetRepository } from './fleet/prisma-fleet.repository.js';
import { MONEY_MAX_AMOUNT, MoneyError } from './money.js';
import { describeStorageError } from './storage-conflict.js';
import { TransportDomainError } from './transport.errors.js';
import { PrismaTripRepository } from './trips/prisma-trip.repository.js';

/**
 * T2.1 — BA BAT BIEN TANG LUU TRU, chung minh tren Postgres THAT (Issue #79).
 *
 * Vi sao phai la Postgres that chu khong phai kho in-memory: ca ba phat hien cua T2.1 deu la loi
 * cua RANH GIOI giua ung dung va CSDL, va mot kho in-memory theo dinh nghia khong co ranh gioi do.
 * Kho in-memory khong tran `INTEGER`, khong co unique mot phan, khong co `CHECK` — no se xanh ca
 * ba bai du khong bai nao duoc vá.
 *
 * `describe.runIf` theo dung quy uoc cua repo: khong co DB thi BO QUA. Nghia la "xanh o may" khong
 * phu nhung bai nay; chung chay o job `integration` cua CI, tren Postgres 16 that.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Bat bien tang luu tru cua van tai (Postgres THAT) — T2.1',
  () => {
    const prisma = new PrismaService();
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);

    const CODE_PREFIX = 'IT-T21-CH';
    const PLATE_PREFIX = 'IT-T21-XE';
    const PHONE_PREFIX = '0911T21';

    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    async function cleanup(): Promise<void> {
      const owned = await prisma.transportTrip.findMany({
        where: { code: { startsWith: CODE_PREFIX } },
        select: { id: true },
      });
      await prisma.transportTripAssignment.deleteMany({
        where: { tripId: { in: owned.map((row) => row.id) } },
      });
      await prisma.transportTrip.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });

      const vehicles = await prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
        select: { id: true },
      });
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicleId: { in: vehicles.map((row) => row.id) } },
      });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    /** Mot chuyen moi tinh cho moi bai — khong bai nao thua trang thai cua bai truoc. */
    async function freshTrip(suffix: string, freightAmount: number | null = null): Promise<string> {
      const trip = await trips.create({
        code: `${CODE_PREFIX}-${suffix}`,
        kind: 'OWN_DIRECT',
        businessDate: '2026-08-01',
        originLabel: 'Ha Noi',
        destinationLabel: 'Thai Nguyen',
        freightAmount,
      });
      return trip.id;
    }

    async function activeAssignmentCount(tripId: string): Promise<number> {
      return prisma.transportTripAssignment.count({ where: { tripId, effectiveTo: null } });
    }

    beforeAll(cleanup);

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    /* ================================================================== *
     * F1 — KHOANG TIEN
     * ================================================================== */

    describe('F1 — tien: mot khoang duy nhat tu HTTP toi Postgres', () => {
      it('gia tri VND thuong di qua DB va ve nguyen ven la SO NGUYEN dong', async () => {
        const id = await freshTrip('f1-thuong', 4_500_000);
        const stored = await trips.find(id);

        expect(stored?.freightAmount).toBe(4_500_000);
        expect(Number.isSafeInteger(stored?.freightAmount)).toBe(true);
        expect(stored?.currencyCode).toBe('VND');
      });

      it('gia tri VUOT `INTEGER` cu nay luu duoc — chinh la lech ma F1 vá', async () => {
        // 3 ty dong. Truoc T2.1: qua zod, qua `money()`, roi chet o `INSERT` voi loi tran kieu cua
        // Postgres — mot don hop le bi bao thanh loi may chu.
        const id = await freshTrip('f1-3ty', 3_000_000_000);
        expect((await trips.find(id))?.freightAmount).toBe(3_000_000_000);
      });

      it('BIEN chap nhan chinh xac (2^53-1) luu duoc va doc lai KHONG mat chinh xac', async () => {
        const id = await freshTrip('f1-bien', MONEY_MAX_AMOUNT);
        const stored = await trips.find(id);

        expect(stored?.freightAmount).toBe(MONEY_MAX_AMOUNT);
        // Doc lai bang mot duong KHAC (`list`) de chac chan phep doi `bigint -> number` khong phu
        // thuoc vao mot loi goi cu the.
        const listed = (await trips.list()).find((trip) => trip.id === id);
        expect(listed?.freightAmount).toBe(MONEY_MAX_AMOUNT);
      });

      it('gia tri BI TU CHOI DAU TIEN bi chan TRUOC khi cham kho — khong hang nao duoc ghi', async () => {
        const code = `${CODE_PREFIX}-f1-vuot`;
        await expect(
          trips.create({
            code,
            kind: 'OWN_DIRECT',
            businessDate: '2026-08-01',
            originLabel: 'Ha Noi',
            destinationLabel: 'Thai Nguyen',
            freightAmount: MONEY_MAX_AMOUNT + 1,
          }),
        ).rejects.toBeInstanceOf(MoneyError);

        // Day moi la phan quan trong: khong co hang nao ra doi roi bi bo lai. Neu phep kiem nam
        // SAU lenh `INSERT` thi dong nay se thay mot chuyen mo coi.
        expect(await trips.findByCode(code)).toBeNull();
      });

      it('so thuc / NaN / Infinity deu bi chan o cung mot cho, bang cung mot loai loi', async () => {
        for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
          await expect(
            trips.create({
              code: `${CODE_PREFIX}-f1-xau-${String(bad)}`,
              kind: 'OWN_DIRECT',
              businessDate: '2026-08-01',
              originLabel: 'Ha Noi',
              destinationLabel: 'Thai Nguyen',
              freightAmount: bad,
            }),
          ).rejects.toBeInstanceOf(MoneyError);
        }
      });

      it('`CHECK` cua cot la LUOI SAU CUNG — chan ca duong ghi khong di qua ung dung', async () => {
        const id = await freshTrip('f1-check', 1_000);

        // Mot `UPDATE` tay (nguoi truc, script di tru, migration tuong lai) khong di qua `money()`.
        // Neu chi dua vao kiem o tang ung dung thi duong nay ghi duoc mot so khong doc lai duoc.
        await expect(
          prisma.$executeRawUnsafe(
            'UPDATE "TransportTrip" SET "freightAmount" = 9007199254740992 WHERE "id" = $1',
            id,
          ),
        ).rejects.toThrow();

        expect((await trips.find(id))?.freightAmount).toBe(1_000);
      });

      it('tien ra JSON van la SO, khong phai chuoi va khong lam vo `JSON.stringify`', async () => {
        // Cot la `BIGINT` nen Prisma tra ve `bigint`, ma `JSON.stringify(1n)` NEM loi. Neu kieu do
        // ro ri len tang tren thi moi route tra ve chuyen se 500 — nen day la mot bai ve HOP DONG
        // API, khong phai ve kieu du lieu.
        const id = await freshTrip('f1-json', 3_000_000_000);
        const trip = await trips.find(id);

        const payload = JSON.parse(JSON.stringify(trip)) as { freightAmount: unknown };
        expect(typeof payload.freightAmount).toBe('number');
        expect(payload.freightAmount).toBe(3_000_000_000);
      });
    });

    /* ================================================================== *
     * F2 — MOT BAN PHAN CONG DANG HIEU LUC, CUONG CHE BOI DB
     * ================================================================== */

    describe('F2 — phan cong: DB tu giu bat bien, khong nho service', () => {
      it('hai hang dang hieu luc cho CUNG mot chuyen bi index tu choi thang', async () => {
        const tripId = await freshTrip('f2-chan-thang');

        await prisma.$executeRawUnsafe(
          `INSERT INTO "TransportTripAssignment"
             ("id","tripId","effectiveFrom","effectiveTo","assignedBy","createdAt")
           VALUES ($1,$2,NOW(),NULL,'it',NOW())`,
          `${tripId}-a`,
          tripId,
        );

        // Khong giao dich, khong dong thoi, khong service — chi hai lenh `INSERT` noi tiep. Neu bai
        // nay xanh thi bat bien nam o DB, khong o tang nao khac.
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO "TransportTripAssignment"
               ("id","tripId","effectiveFrom","effectiveTo","assignedBy","createdAt")
             VALUES ($1,$2,NOW(),NULL,'it',NOW())`,
            `${tripId}-b`,
            tripId,
          ),
        ).rejects.toThrow();

        expect(await activeAssignmentCount(tripId)).toBe(1);
      });

      it('index chi cam ban DANG HIEU LUC — lich su van chong lop thoai mai', async () => {
        const tripId = await freshTrip('f2-lich-su');

        // Ba ban DA DONG cho cung mot chuyen: neu unique khong co menh de `WHERE`, dong nay se do,
        // va bat bien `GD-06` (phan cong la lich su) se bi chinh phat vá cua F2 pha vo.
        for (const suffix of ['x', 'y', 'z']) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "TransportTripAssignment"
               ("id","tripId","effectiveFrom","effectiveTo","assignedBy","createdAt")
             VALUES ($1,$2,NOW(),NOW(),'it',NOW())`,
            `${tripId}-${suffix}`,
            tripId,
          );
        }

        expect(await prisma.transportTripAssignment.count({ where: { tripId } })).toBe(3);
        expect(await activeAssignmentCount(tripId)).toBe(0);
      });

      it('HAI NGUOI GHI CUNG LUC: nguoi thu hai nhan xung dot co kieu, khong ghi duoc ban thu hai', async () => {
        const tripId = await freshTrip('f2-dong-thoi');

        // Mot giao dich duoc GIU MO co chu y. No mo phong dung tinh huong ma giao dich
        // "dong-roi-mo" cua repository KHONG che duoc: nguoi thu hai khong nhin thay hang cua
        // nguoi thu nhat (chua commit), nen `updateMany` cua ho trung 0 dong va ho di thang toi
        // `INSERT`. Doi lich CO DINH nhu the nay tat dinh hon `Promise.all`, von co the tinh co
        // xep hai lan ghi noi tiep nhau va lam bai test xanh ma khong chung minh gi.
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });

        const holder = prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(
              `INSERT INTO "TransportTripAssignment"
                 ("id","tripId","effectiveFrom","effectiveTo","assignedBy","createdAt")
               VALUES ($1,$2,NOW(),NULL,'it-nguoi-1',NOW())`,
              `${tripId}-holder`,
              tripId,
            );
            await gate;
          },
          { timeout: 30_000, maxWait: 30_000 },
        );

        await sleep(250);

        // Nguoi thu hai di qua DUNG duong that cua ung dung.
        const contender = trips
          .assign(tripId, {
            vehicleId: null,
            driverId: null,
            assignedBy: 'it-nguoi-2',
            at: new Date(),
          })
          .then(
            () => 'GHI DUOC' as const,
            (error: unknown) => error,
          );

        // Luc nay `INSERT` cua nguoi thu hai dang CHO khoa cua index, chua that bai.
        await sleep(500);
        release();
        await holder;

        const outcome = await contender;
        // Thong diep khang dinh mang HINH DANG THAT cua loi: lan hong dau cua bai nay chi noi duoc
        // "expected PrismaClientKnownRequestError to be an instance of TransportDomainError", va
        // phai mat them mot vong CI chi de nhin xem Prisma dat ten rang buoc o dau.
        expect(outcome, `Loi chua duoc dich: ${describeStorageError(outcome)}`).toBeInstanceOf(
          TransportDomainError,
        );
        const error = outcome as TransportDomainError;
        expect(error.kind).toBe('CONFLICT');
        expect(error.reason).toBe('TRIP_ACTIVE_ASSIGNMENT_CONFLICT');

        // That bai de lai mot trang thai HOP LE: dung mot ban hieu luc, cua nguoi thang.
        expect(await activeAssignmentCount(tripId)).toBe(1);
        expect((await trips.activeAssignment(tripId))?.assignedBy).toBe('it-nguoi-1');
      });

      it('doi phan cong BINH THUONG van giu nguyen lich su sau khi da co index', async () => {
        const tripId = await freshTrip('f2-doi-thuong');
        const vehicle = await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-1`,
          vehicleClass: 'Xe tai',
        });
        const driverA = await fleet.createDriver({
          fullName: 'IT T21 Driver A',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        });
        const driverB = await fleet.createDriver({
          fullName: 'IT T21 Driver B',
          phone: `${PHONE_PREFIX}B`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        });

        const first = await trips.assign(tripId, {
          vehicleId: vehicle.id,
          driverId: driverA.id,
          assignedBy: 'it',
          at: new Date('2026-08-01T01:00:00.000Z'),
        });
        expect(first.previous).toBeNull();

        const second = await trips.assign(tripId, {
          vehicleId: vehicle.id,
          driverId: driverB.id,
          assignedBy: 'it',
          at: new Date('2026-08-01T05:00:00.000Z'),
        });
        expect(second.previous?.driverId).toBe(driverA.id);

        expect(await prisma.transportTripAssignment.count({ where: { tripId } })).toBe(2);
        expect(await activeAssignmentCount(tripId)).toBe(1);
        expect((await trips.activeAssignment(tripId))?.driverId).toBe(driverB.id);
      });

      it('lai xe phu trach XE: hai nguoi ghi cung luc cung chi de lai MOT ban hieu luc', async () => {
        const vehicle = await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-2`,
          vehicleClass: 'Xe tai',
        });
        const driverA = await fleet.createDriver({
          fullName: 'IT T21 Driver C',
          phone: `${PHONE_PREFIX}C`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        });
        const driverB = await fleet.createDriver({
          fullName: 'IT T21 Driver D',
          phone: `${PHONE_PREFIX}D`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        });

        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });

        const holder = prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(
              `INSERT INTO "TransportVehicleAssignment"
                 ("id","vehicleId","driverId","effectiveFrom","effectiveTo","createdAt")
               VALUES ($1,$2,$3,NOW(),NULL,NOW())`,
              `${vehicle.id}-holder`,
              vehicle.id,
              driverA.id,
            );
            await gate;
          },
          { timeout: 30_000, maxWait: 30_000 },
        );

        await sleep(250);
        const contender = fleet.assignDriverToVehicle(vehicle.id, driverB.id, new Date()).then(
          () => 'GHI DUOC' as const,
          (error: unknown) => error,
        );

        await sleep(500);
        release();
        await holder;

        const outcome = await contender;
        expect(outcome, `Loi chua duoc dich: ${describeStorageError(outcome)}`).toBeInstanceOf(
          TransportDomainError,
        );
        const error = outcome as TransportDomainError;
        expect(error.kind).toBe('CONFLICT');
        expect(error.reason).toBe('VEHICLE_ACTIVE_ASSIGNMENT_CONFLICT');

        const active = await prisma.transportVehicleAssignment.count({
          where: { vehicleId: vehicle.id, effectiveTo: null },
        });
        expect(active).toBe(1);
      });

      it('KHONG cam mot xe/lai xe nam o hai chuyen — do la luat dieu do, khong phai luat luu tru', async () => {
        // Ranh gioi nay duoc khoa lai co chu y: Issue #79 §3 noi ro khong duoc them unique CHEO
        // CHUYEN theo xe/lai xe khi hop dong mien chua doi. Neu ai do "siet them cho chac" thi bai
        // nay do, va do la loi bao dung.
        const vehicle = await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-3`,
          vehicleClass: 'Xe tai',
        });
        const driver = await fleet.createDriver({
          fullName: 'IT T21 Driver E',
          phone: `${PHONE_PREFIX}E`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        });

        const tripOne = await freshTrip('f2-cheo-1');
        const tripTwo = await freshTrip('f2-cheo-2');
        const at = new Date();

        await trips.assign(tripOne, {
          vehicleId: vehicle.id,
          driverId: driver.id,
          assignedBy: 'it',
          at,
        });
        await trips.assign(tripTwo, {
          vehicleId: vehicle.id,
          driverId: driver.id,
          assignedBy: 'it',
          at,
        });

        expect(await activeAssignmentCount(tripOne)).toBe(1);
        expect(await activeAssignmentCount(tripTwo)).toBe(1);
      });
    });

    /* ================================================================== *
     * F3 — NGAY-CHI-CO-NGAY
     * ================================================================== */

    describe('F3 — ngay nghiep vu: van la chuoi, nhung khong con la chuoi tu do', () => {
      it('ngay hop le di qua DB va ve NGUYEN VAN — khong buoc nao doi sang khoanh khac', async () => {
        const id = await freshTrip('f3-hop-le');
        expect((await trips.find(id))?.businessDate).toBe('2026-08-01');

        // Ngay nam quanh nua dem theo UTC+7 la cho `INV-25` that su hong neu ai do doi cot sang
        // timestamp: `2026-08-01` o Viet Nam la `2026-07-31T17:00Z`. Chuoi thi khong co gi de lech.
        await prisma.$executeRawUnsafe(
          'UPDATE "TransportTrip" SET "businessDate" = $1 WHERE "id" = $2',
          '2026-01-01',
          id,
        );
        expect((await trips.find(id))?.businessDate).toBe('2026-01-01');
      });

      it('DB tu choi ngay SAI DANG, ke ca khi ghi bang duong khong qua ung dung', async () => {
        const id = await freshTrip('f3-sai-dang');

        for (const bad of ['hom qua', '2026-8-1', '01/08/2026', '2026-08-01T00:00:00Z', '']) {
          await expect(
            prisma.$executeRawUnsafe(
              'UPDATE "TransportTrip" SET "businessDate" = $1 WHERE "id" = $2',
              bad,
              id,
            ),
          ).rejects.toThrow();
        }

        expect((await trips.find(id))?.businessDate).toBe('2026-08-01');
      });

      it('DB tu choi ngay DUNG DANG NHUNG KHONG CO THAT', async () => {
        const id = await freshTrip('f3-khong-co-that');

        // `2026-02-30` sap xep dung, gom ky dung, va di qua moi phep kiem "dang chuoi" — no chi sai
        // o cho khong ton tai. Mot moc ky nhu vay khong lich nao xep duoc.
        for (const bad of ['2026-02-30', '2026-13-01', '2025-02-29']) {
          await expect(
            prisma.$executeRawUnsafe(
              'UPDATE "TransportTrip" SET "businessDate" = $1 WHERE "id" = $2',
              bad,
              id,
            ),
          ).rejects.toThrow();
        }

        expect((await trips.find(id))?.businessDate).toBe('2026-08-01');
      });

      it('nam nhuan that van qua duoc — `CHECK` khong siet nham', async () => {
        const id = await freshTrip('f3-nhuan');
        await prisma.$executeRawUnsafe(
          'UPDATE "TransportTrip" SET "businessDate" = $1 WHERE "id" = $2',
          '2028-02-29',
          id,
        );
        expect((await trips.find(id))?.businessDate).toBe('2028-02-29');
      });

      it('han GPLX chiu cung mot rang buoc — hai cot ngay khong duoc doi xu khac nhau', async () => {
        const driver = await fleet.createDriver({
          fullName: 'IT T21 Driver F',
          phone: `${PHONE_PREFIX}F`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        });

        await expect(
          prisma.$executeRawUnsafe(
            'UPDATE "TransportDriver" SET "licenceExpiry" = $1 WHERE "id" = $2',
            '2029-02-30',
            driver.id,
          ),
        ).rejects.toThrow();

        expect((await fleet.findDriver(driver.id))?.licenceExpiry).toBe('2029-01-01');
      });
    });
  },
);
