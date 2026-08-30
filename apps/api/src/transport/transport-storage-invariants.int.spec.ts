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

      it('index chi cam ban DANG HIEU LUC — NHIEU ban DA DONG van duoc phep', async () => {
        const tripId = await freshTrip('f2-lich-su');

        // DOC CHO DUNG (T2.1R/R1): bai nay chung minh "nhieu ban DA DONG duoc phep", KHONG phai
        // "khoang thoi gian lich su duoc phep chong lap". Ba ban duoi duoc nhet thang bang SQL tho
        // de do RIENG suc cam cua index. Bat bien khong-chong-lap cua T1 §5 `TX-01` do DUONG GHI
        // DUOC HO TRO giu, va co hai bai rieng ngay duoi khoa lai dieu do.

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

      /**
       * T2.1R/R1 — DUONG GHI DUOC HO TRO KHONG SINH RA CHONG LAP.
       *
       * Unique mot phan chi cuong che "toi da MOT ban dang hieu luc"; no khong noi gi ve lich su.
       * Nen phai chung minh RIENG rang bat bien T1 §5 `TX-01` (*khong chong lap thoi gian cho cung
       * mot xe*) VAN DUNG sau khi F2 vao: duong ghi dong ban cu DUNG TAI moc mo ban moi — khong
       * som hon (se ho mot khoang khong ai chiu trach nhiem) va khong muon hon (se chong lap).
       *
       * Doc lai tu HANG DA LUU chu khong tu gia tri tra ve cua `assign()`: `change.previous` la
       * anh chup TRUOC khi dong, nen `effectiveTo` cua no con `null`. Dung nhu vay cho mot ban ghi
       * kiem toan "truoc/sau", nhung no khong phai thu can khang dinh o day.
       */
      const expectChainWithoutOverlap = (
        history: readonly { effectiveFrom: string; effectiveTo: string | null }[],
      ): void => {
        expect(history.length).toBeGreaterThan(1);
        for (let index = 1; index < history.length; index += 1) {
          const previous = history[index - 1];
          const current = history[index];
          // Bang chung toi thieu ma Issue #83 doi, tren TUNG cap ke nhau.
          expect(previous?.effectiveTo).toBe(current?.effectiveFrom);
          expect(previous?.effectiveTo).not.toBeNull();
        }
        // Va dung MOT ban con mo, o cuoi chuoi.
        expect(history.filter((row) => row.effectiveTo === null)).toHaveLength(1);
        expect(history.at(-1)?.effectiveTo).toBeNull();
      };

      it('doi phan cong CHUYEN: ban cu dong dung tai moc mo ban moi — khong ho, khong chong lap', async () => {
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
        const driverC = await fleet.createDriver({
          fullName: 'IT T21 Driver G',
          phone: `${PHONE_PREFIX}G`,
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
        expect(await prisma.transportTripAssignment.count({ where: { tripId } })).toBe(1);

        const second = await trips.assign(tripId, {
          vehicleId: vehicle.id,
          driverId: driverB.id,
          assignedBy: 'it',
          at: new Date('2026-08-01T05:00:00.000Z'),
        });
        expect(second.previous?.driverId).toBe(driverA.id);
        // LICH SU TANG LEN chu khong bi ghi de — `GD-06`.
        expect(await prisma.transportTripAssignment.count({ where: { tripId } })).toBe(2);

        // Lan doi thu ba co ly do: mot chuoi HAI ban khong lo ra duoc loi "dong muon" o ban giua,
        // vi chi co dung mot cap de doi chieu. Ba ban moi co mot cap BEN TRONG chuoi.
        await trips.assign(tripId, {
          vehicleId: vehicle.id,
          driverId: driverC.id,
          assignedBy: 'it',
          at: new Date('2026-08-01T09:00:00.000Z'),
        });

        const history = await trips.listAssignments(tripId);
        expect(history).toHaveLength(3);
        expect(history.map((row) => row.driverId)).toEqual([driverA.id, driverB.id, driverC.id]);
        expectChainWithoutOverlap(history);

        expect(await activeAssignmentCount(tripId)).toBe(1);
        expect((await trips.activeAssignment(tripId))?.driverId).toBe(driverC.id);
      });

      /**
       * Cung mot bang chung, cho `VehicleDriverAssignment`.
       *
       * Bo qua no thi loi R1 chi duoc va mot nua: bat bien T1 §5 `TX-01` duoc phat bieu CHINH XAC
       * tren thuc the nay — *"khong chong lap thoi gian cho cung mot xe"* — chu khong tren
       * `TripAssignment`.
       */
      it('doi lai xe phu trach XE: chuoi lich su cung noi lien, khong ho, khong chong lap', async () => {
        const vehicle = await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-4`,
          vehicleClass: 'Xe tai',
        });

        const schedule = [
          { tag: 'H', at: new Date('2026-08-01T01:00:00.000Z') },
          { tag: 'I', at: new Date('2026-08-02T01:00:00.000Z') },
          { tag: 'J', at: new Date('2026-08-03T01:00:00.000Z') },
        ];
        const expectedDriverIds: string[] = [];
        for (const entry of schedule) {
          const driver = await fleet.createDriver({
            fullName: `IT T21 Driver ${entry.tag}`,
            phone: `${PHONE_PREFIX}${entry.tag}`,
            licenceClass: 'C',
            licenceExpiry: '2029-01-01',
          });
          expectedDriverIds.push(driver.id);
          await fleet.assignDriverToVehicle(vehicle.id, driver.id, entry.at);
        }

        const history = await fleet.listVehicleDriverAssignments(vehicle.id);
        expect(history).toHaveLength(3);
        expect(history.map((row) => row.driverId)).toEqual(expectedDriverIds);
        expectChainWithoutOverlap(history);

        const active = await prisma.transportVehicleAssignment.count({
          where: { vehicleId: vehicle.id, effectiveTo: null },
        });
        expect(active).toBe(1);
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

      /**
       * BA CO CHE TU CHOI, DO DUOC — khong phai mot co che nhu bao cao dau cua T2.1 noi.
       *
       * Bao cao do viet rang `to_date` "cuon `2026-02-30` thanh `2026-03-02` nen chuoi quay ve
       * khong con bang chuoi ban dau va `CHECK` tra FALSE, mot lan tu choi sach khong nem loi".
       * Runtime bac bo cau do: tu PostgreSQL 10, `to_date` KHONG con cuon ngay tran, no NEM LOI.
       *
       * Do lai ngay 30/08/2026 tren PostgreSQL 16.15, qua dung duong Prisma nay:
       *
       *   `'2026-08-01T00:00:00Z'`            -> SQLSTATE 22001  value too long for varchar(10)
       *   `'hom qua'` `'2026-8-1'` `'01/08/2026'` `''`
       *                                       -> SQLSTATE 23514  violates check constraint
       *   `'2026-02-30'` `'2026-13-01'` `'2025-02-29'`
       *                                       -> SQLSTATE 22008  date/time field value out of range
       *
       * Bai nay khoa CA MA SQLSTATE lai, khong chi khoa "co nem loi". Ly do: mot bai chi doi
       * `.rejects.toThrow()` van xanh khi mo ta co che sai — va do dung la cach ban dau cua T2.1
       * di duoc toi vong review voi mot cau giai thich khong dung. Neu ngay nao do mot ma doi, bai
       * nay do, va viec phai lam la DO LAI ROI SUA TAI LIEU, khong phai noi long khang dinh.
       *
       * (Thu tu danh gia hai ve cua `AND` khong duoc SQL bao dam. Neu Postgres doi y va chay
       * `to_date` truoc regex thi nhom 23514 se thanh 22007 `invalid value ... for "YYYY"`. Van la
       * tu choi; van khong hang xau nao di qua.)
       */
      const DATE_REJECTIONS: readonly { readonly value: string; readonly sqlState: string }[] = [
        { value: '2026-08-01T00:00:00Z', sqlState: '22001' },
        { value: 'hom qua', sqlState: '23514' },
        { value: '2026-8-1', sqlState: '23514' },
        { value: '01/08/2026', sqlState: '23514' },
        { value: '', sqlState: '23514' },
        { value: '2026-02-30', sqlState: '22008' },
        { value: '2026-13-01', sqlState: '22008' },
        { value: '2025-02-29', sqlState: '22008' },
      ];

      it('DB tu choi MOI ngay khong hop le, ke ca khi ghi bang duong khong qua ung dung', async () => {
        const id = await freshTrip('f3-tu-choi');

        for (const { value, sqlState } of DATE_REJECTIONS) {
          await expect(
            prisma.$executeRawUnsafe(
              'UPDATE "TransportTrip" SET "businessDate" = $1 WHERE "id" = $2',
              value,
              id,
            ),
            `Ngay ${JSON.stringify(value)} le ra phai bi tu choi voi SQLSTATE ${sqlState}`,
          ).rejects.toThrow(new RegExp(`Code: \`${sqlState}\``));
        }

        // Va khong lan nao trong so do de lai dau vet: hang van mang ngay ban dau.
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

        // Cung co che 22008 nhu `businessDate` — hai cot ngay khong duoc doi xu khac nhau, ke ca
        // o cho chung HONG.
        await expect(
          prisma.$executeRawUnsafe(
            'UPDATE "TransportDriver" SET "licenceExpiry" = $1 WHERE "id" = $2',
            '2029-02-30',
            driver.id,
          ),
        ).rejects.toThrow(/Code: `22008`/);

        expect((await fleet.findDriver(driver.id))?.licenceExpiry).toBe('2029-01-01');
      });
    });
  },
);
