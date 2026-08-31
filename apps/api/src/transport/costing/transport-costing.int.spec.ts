import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { describeStorageError } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { CostingReadService } from './costing-read.service.js';
import type { TransportCostingPolicy } from './costing-policy.js';
import { CostingService } from './costing.service.js';
import { FundPeriodService } from './fund-period.service.js';
import { PrismaCostingRepository } from './prisma-costing.repository.js';
import type { AppendSnapshotInput } from './costing.repository.js';
import type { FundPeriodSnapshot } from './costing.types.js';
import { TransportCoreFactsAdapter } from './transport-core-facts.port.js';

/**
 * T3 — MUOI BANG CHUNG CUA `TX-03` TREN POSTGRES THAT (Issue #85).
 *
 * Vi sao phai la Postgres that chu khong phai kho in-memory: mot nua nhung gi T3 hua song o RANH
 * GIOI voi CSDL — giao dich hai chan, unique khoa chong ghi trung, `CHECK` dau but toan, EXCLUDE
 * chong lap ky. Kho in-memory theo dinh nghia khong co ranh gioi do: no se XANH ca nam du khong cai
 * nao ton tai. Do dung la bai hoc T2.1 da tra gia mot lan.
 *
 * `describe.runIf` theo dung quy uoc cua repo: khong co DB thi BO QUA. Nghia la "xanh o may" khong
 * phu nhung bai nay; chung chay o job `integration` cua CI tren Postgres 16 that.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Costing + Driver Fund tren Postgres THAT — T3',
  () => {
    const prisma = new PrismaService();
    const ledger = new PrismaCostingRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const core = new TransportCoreFactsAdapter(trips, fleet);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());

    const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
    const COSTING_POLICY: TransportCostingPolicy = {
      expenseCategories: [],
      advanceApprovalRequired: false,
    };

    const costing = new CostingService(ledger, core, audit, CORE_POLICY, COSTING_POLICY);
    const read = new CostingReadService(ledger, core);
    const periods = new FundPeriodService(ledger, core, audit, CORE_POLICY);

    const CODE_PREFIX = 'IT-T3-CH';
    const PHONE_PREFIX = '0922T3';
    const PLATE_PREFIX = 'IT-T3-XE';

    const state = {
      driverA: '',
      driverB: '',
      tripOwn: '',
      tripOutsourced: '',
      tripReconciled: '',
      driverUnassigned: '',
    };

    /**
     * THU TU XOA KHONG TUY Y, va do la mot bang chung phu.
     *
     * `reversalOfId` co `ON DELETE SET NULL`, con `CHECK ..._reversal_kind` doi
     * `(kind = 'REVERSAL') = (reversalOfId IS NOT NULL)`. Nen xoa mot ban GOC dang bi dao se lam
     * Postgres dat `NULL` vao mot hang `REVERSAL` va `CHECK` do TU CHOI ca lenh xoa. Tuc DB khong
     * cho xoa mot but toan da bi dao neu chua xoa but toan dao truoc — mot lop bao ve them cho
     * `INV-20` ma khong ai phai nho.
     */
    async function cleanup(): Promise<void> {
      const accounts = await prisma.transportDriverFundAccount.findMany({
        where: { driver: { phone: { startsWith: PHONE_PREFIX } } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);

      const periodRows = await prisma.transportDriverFundPeriod.findMany({
        where: { accountId: { in: accountIds } },
        select: { id: true },
      });
      await prisma.transportDriverFundPeriodSnapshot.deleteMany({
        where: { periodId: { in: periodRows.map((row) => row.id) } },
      });
      await prisma.transportDriverFundPeriod.deleteMany({
        where: { accountId: { in: accountIds } },
      });

      const owned = await prisma.transportTrip.findMany({
        where: { code: { startsWith: CODE_PREFIX } },
        select: { id: true },
      });
      const tripIds = owned.map((row) => row.id);

      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      for (const kind of ['REVERSAL', 'ADVANCE', 'RETURN', 'TRIP_EXPENSE', 'ADJUSTMENT'] as const) {
        await prisma.transportDriverFundEntry.deleteMany({
          where: { accountId: { in: accountIds }, kind },
        });
      }
      await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });

      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    beforeAll(async () => {
      await cleanup();

      const driverA = await fleet.createDriver({
        fullName: 'IT T3 Driver A',
        phone: `${PHONE_PREFIX}A`,
        licenceClass: 'C',
        licenceExpiry: '2029-01-01',
        authUserId: `${PHONE_PREFIX}-user-A`,
      });
      const driverB = await fleet.createDriver({
        fullName: 'IT T3 Driver B',
        phone: `${PHONE_PREFIX}B`,
        licenceClass: 'C',
        licenceExpiry: '2029-01-01',
      });
      state.driverA = driverA.id;
      state.driverB = driverB.id;

      const base = {
        businessDate: '2026-08-01',
        originLabel: 'Ha Noi',
        destinationLabel: 'Thai Nguyen',
      };
      state.tripOwn = (
        await trips.create({ ...base, code: `${CODE_PREFIX}-OWN`, kind: 'OWN_DIRECT' })
      ).id;
      state.tripOutsourced = (
        await trips.create({ ...base, code: `${CODE_PREFIX}-OUT`, kind: 'EXTERNAL_CARRIER' })
      ).id;
      const reconciled = await trips.create({
        ...base,
        code: `${CODE_PREFIX}-DONE`,
        kind: 'OWN_DIRECT',
      });
      await trips.setStatus(reconciled.id, 'RECONCILED', new Date());
      state.tripReconciled = reconciled.id;

      // `DA-T3-04`: mot khoan chi tu quy chi gan duoc cho lai xe DA TUNG chay chuyen do.
      //
      // Lai xe A nhan ca ba chuyen; sau do B THAY CA tren chuyen noi bo. Ca hai deu con trong lich
      // su phan cong (`GD-06`), nen ca hai deu ghi duoc khoan chi cua doan minh da chay — do la
      // dieu B5 dua vao. Lai xe thu ba chua tung nhan chuyen nao, va la doi tuong cua R6.
      for (const tripId of [state.tripOwn, state.tripOutsourced, state.tripReconciled]) {
        await trips.assign(tripId, {
          vehicleId: null,
          driverId: driverA.id,
          assignedBy: 'it-dieu-do',
          at: new Date(),
        });
      }
      await trips.assign(state.tripOwn, {
        vehicleId: null,
        driverId: driverB.id,
        assignedBy: 'it-dieu-do',
        at: new Date(),
      });

      state.driverUnassigned = (
        await fleet.createDriver({
          fullName: 'IT T3 Driver chua nhan chuyen',
          phone: `${PHONE_PREFIX}X`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        })
      ).id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    /** Bat mot loi cua mien va tra ve MA cua no — khang dinh duong tu choi, khong chi "co nem". */
    async function reasonOf(run: () => Promise<unknown>): Promise<string> {
      try {
        await run();
      } catch (error) {
        if (error instanceof TransportDomainError) return error.reason;
        throw new Error(`Loi chua duoc dich: ${describeStorageError(error)}`);
      }
      throw new Error('cho doi mot TransportDomainError nhung khong co gi duoc nem');
    }

    /* ================================================================== *
     * BANG CHUNG 1-3 — hai lop cua mot khoan chi (`INV-01`, `INV-02`, `INV-03`)
     * ================================================================== */

    it('B1 — ung 10.000.000 voi tripId = NULL: so du +10.000.000', async () => {
      const entry = await costing.postAdvance(
        { driverId: state.driverA, amount: 10_000_000, businessDate: '2026-08-05' },
        'it-ke-toan',
      );

      expect(entry.kind).toBe('ADVANCE');
      expect(entry.signedAmount).toBe(10_000_000);
      expect(entry.tripId).toBeNull();
      expect(Number.isSafeInteger(entry.signedAmount)).toBe(true);
      expect((await read.driverFundStatement(state.driverA)).balance).toBe(10_000_000);
    });

    it('B2 — chi BOT 150.000 tu quy: quy -150.000, gia thanh chuyen +150.000, MOT khoa', async () => {
      const posted = await costing.recordTripExpense(
        {
          tripId: state.tripOwn,
          categoryCode: 'BOT',
          amount: 150_000,
          fundedBy: 'DRIVER_FUND',
          driverId: state.driverA,
          businessDate: '2026-08-06',
        },
        'it-ke-toan',
      );

      expect(posted.entry?.signedAmount).toBe(-150_000);
      expect(posted.expense?.signedAmount).toBe(150_000);
      expect(posted.entry?.correlationKey).toBe(posted.expense?.correlationKey);
      expect(posted.expense?.driverFundEntryId).toBe(posted.entry?.id);

      expect((await read.driverFundStatement(state.driverA)).balance).toBe(9_850_000);
      expect((await read.tripCostBreakdown(state.tripOwn)).directCost).toBe(150_000);

      // Hai lan ghi phai nam trong MOT giao dich. Doc lai tu DB bang mot duong KHAC (dem hang tho)
      // de chac chan ca hai da commit, khong phai chi doi tuong trong tay dang noi vay.
      const rows = await prisma.transportTripExpense.count({
        where: { correlationKey: posted.expense!.correlationKey },
      });
      const legs = await prisma.transportDriverFundEntry.count({
        where: { correlationKey: posted.expense!.correlationKey },
      });
      expect([rows, legs]).toEqual([1, 1]);
    });

    it('B3 — khoan cong ty tra thang chi sinh MOT dong gia thanh, khong but toan quy', async () => {
      const before = (await read.driverFundStatement(state.driverA)).balance;
      const posted = await costing.recordTripExpense(
        {
          tripId: state.tripOwn,
          categoryCode: 'CAU_DUONG',
          amount: 90_000,
          fundedBy: 'COMPANY_DIRECT',
          businessDate: '2026-08-06',
        },
        'it-ke-toan',
      );

      expect(posted.entry).toBeNull();
      expect(posted.expense?.driverFundEntryId).toBeNull();
      expect((await read.driverFundStatement(state.driverA)).balance).toBe(before);
      expect((await read.tripCostBreakdown(state.tripOwn)).directCost).toBe(240_000);
    });

    /* ================================================================== *
     * BANG CHUNG 4-5 — dao, va so du am
     * ================================================================== */

    it('B4 — dao khoi phuc hieu qua so cai MA KHONG sua hang goc', async () => {
      const original = await costing.recordTripExpense(
        {
          tripId: state.tripOwn,
          categoryCode: 'BAI_XE',
          amount: 50_000,
          fundedBy: 'DRIVER_FUND',
          driverId: state.driverA,
          businessDate: '2026-08-07',
        },
        'it-ke-toan',
      );
      const balanceAfterExpense = (await read.driverFundStatement(state.driverA)).balance;
      const costAfterExpense = (await read.tripCostBreakdown(state.tripOwn)).directCost;

      const reversal = await costing.reverseExpense(original.expense!.id, 'IT dao', 'it-ke-toan');
      expect(reversal.entry?.signedAmount).toBe(50_000);
      expect(reversal.expense?.signedAmount).toBe(-50_000);

      // HANG GOC doc lai TU DB, khong tu doi tuong trong tay: `INV-20` noi ve cai da luu.
      const storedOriginal = await prisma.transportTripExpense.findUnique({
        where: { id: original.expense!.id },
      });
      expect(storedOriginal?.kind).toBe('EXPENSE');
      expect(storedOriginal?.signedAmount).toBe(50_000n);
      expect(storedOriginal?.reversalOfId).toBeNull();

      expect((await read.driverFundStatement(state.driverA)).balance).toBe(
        balanceAfterExpense + 50_000,
      );
      expect((await read.tripCostBreakdown(state.tripOwn)).directCost).toBe(
        costAfterExpense - 50_000,
      );
    });

    it('B4b — dao lan hai bi DB chan, khong chi bi service chan', async () => {
      const original = await costing.recordTripExpense(
        {
          tripId: state.tripOwn,
          categoryCode: 'BAI_XE',
          amount: 20_000,
          fundedBy: 'DRIVER_FUND',
          driverId: state.driverA,
          businessDate: '2026-08-07',
        },
        'it-ke-toan',
      );
      await costing.reverseExpense(original.expense!.id, 'IT dao', 'it-ke-toan');

      // Duong qua service.
      expect(
        await reasonOf(() => costing.reverseExpense(original.expense!.id, 'lai nua', 'it-ke-toan')),
      ).toBe('ENTRY_ALREADY_REVERSED');

      // Duong VONG QUA service: ghi thang mot but toan dao thu hai. Unique `reversalOfId` phai chan.
      await expect(
        prisma.transportDriverFundEntry.create({
          data: {
            accountId: original.entry!.accountId,
            kind: 'REVERSAL',
            signedAmount: 20_000n,
            businessDate: '2026-08-07',
            correlationKey: `${original.entry!.correlationKey}:dao-lan-hai`,
            reversalOfId: original.entry!.id,
            recordedBy: 'it-tho',
          },
        }),
      ).rejects.toThrow();
    });

    it('B5 — SO DU AM la hop le (FUND-003)', async () => {
      await costing.postAdvance(
        { driverId: state.driverB, amount: 100_000, businessDate: '2026-08-05' },
        'it-ke-toan',
      );
      await costing.recordTripExpense(
        {
          tripId: state.tripOwn,
          categoryCode: 'BOT',
          amount: 250_000,
          fundedBy: 'DRIVER_FUND',
          driverId: state.driverB,
          businessDate: '2026-08-06',
        },
        'it-ke-toan',
      );

      expect((await read.driverFundStatement(state.driverB)).balance).toBe(-150_000);
    });

    /* ================================================================== *
     * BANG CHUNG 6-8 — ba cong tu choi
     * ================================================================== */

    it('B6 — chuyen thue xe ngoai TU CHOI khoan chi tu quy (INV-04 / TRIP-002)', async () => {
      expect(
        await reasonOf(() =>
          costing.recordTripExpense(
            {
              tripId: state.tripOutsourced,
              categoryCode: 'BOT',
              amount: 10_000,
              fundedBy: 'DRIVER_FUND',
              driverId: state.driverA,
              businessDate: '2026-08-08',
            },
            'it-ke-toan',
          ),
        ),
      ).toBe('EXPENSE_TRIP_OUTSOURCED');

      // Va khong hang nao duoc ghi — tu choi phai xay ra TRUOC khi cham kho.
      expect(
        await prisma.transportTripExpense.count({ where: { tripId: state.tripOutsourced } }),
      ).toBe(0);
    });

    it('B7 — chuyen da DOI SOAT tu choi khoan chi moi (GD-01)', async () => {
      expect(
        await reasonOf(() =>
          costing.recordTripExpense(
            {
              tripId: state.tripReconciled,
              categoryCode: 'BOT',
              amount: 10_000,
              fundedBy: 'COMPANY_DIRECT',
              businessDate: '2026-08-08',
            },
            'it-ke-toan',
          ),
        ),
      ).toBe('EXPENSE_TRIP_RECONCILED');

      expect(
        await prisma.transportTripExpense.count({ where: { tripId: state.tripReconciled } }),
      ).toBe(0);
    });

    it('B8 — dong ky DONG BANG noi dung ky, va but toan lui ngay bi tu choi (INV-22)', async () => {
      const period = await periods.openPeriod(
        { driverId: state.driverA, startDate: '2026-08-01', endDate: '2026-08-31' },
        'it-ke-toan',
      );
      const balanceBefore = (await read.driverFundStatement(state.driverA)).balance;
      const entriesBefore = (await read.driverFundStatement(state.driverA)).entries.length;

      const closed = await periods.closePeriod(period.id, 'it-ke-toan');
      expect(closed.period.status).toBe('CLOSED');
      expect(closed.snapshot.closingBalance).toBe(balanceBefore);
      // Dong ky KHONG tao but toan (T1 §7.3).
      expect((await read.driverFundStatement(state.driverA)).entries).toHaveLength(entriesBefore);

      expect(
        await reasonOf(() =>
          costing.postAdvance(
            { driverId: state.driverA, amount: 1_000, businessDate: '2026-08-20' },
            'it-ke-toan',
          ),
        ),
      ).toBe('FUND_ENTRY_PERIOD_FROZEN');

      // NGOAI ky thi van ghi duoc — khoa dung pham vi, khong khoa ca so.
      const outside = await costing.postAdvance(
        { driverId: state.driverA, amount: 1_000, businessDate: '2026-09-02' },
        'it-ke-toan',
      );
      expect(outside.businessDate).toBe('2026-09-02');

      // Mo lai co dau vet, roi dong lai -> anh chup thu hai, ban dau KHONG bi ghi de.
      await periods.reopenPeriod(period.id, 'IT mo lai', 'it-giam-doc');
      await periods.closePeriod(period.id, 'it-ke-toan');
      const snapshots = await periods.listSnapshots(period.id);
      expect(snapshots).toHaveLength(2);
      expect(snapshots.map((row) => row.sequence)).toEqual([1, 2]);
    });

    it('B8b — EXCLUDE cua DB chan hai ky chong lap, ke ca khi vong qua service', async () => {
      const account = await prisma.transportDriverFundAccount.findUnique({
        where: { driverId: state.driverA },
      });
      expect(account).not.toBeNull();

      // Ghi THANG vao bang, khong qua service: chi con EXCLUDE constraint dung ra chan.
      await expect(
        prisma.transportDriverFundPeriod.create({
          data: {
            accountId: account!.id,
            startDate: '2026-08-15',
            endDate: '2026-09-15',
            updatedAt: new Date(),
          },
        }),
      ).rejects.toThrow(/TransportDriverFundPeriod_no_overlap/);
    });

    /* ================================================================== *
     * BANG CHUNG 9-10 — ben qua restart, va pham vi cua lai xe
     * ================================================================== */

    it('B9 — khoi dong lai voi Postgres that: so du va lich su con nguyen', async () => {
      const before = await read.driverFundStatement(state.driverA);

      // MOT KET NOI MOI HOAN TOAN — khong dung lai instance nao cua bo test. Day la thu gan nhat
      // voi mot lan restart tien trinh ma mot bai test lam duoc.
      const restarted = new PrismaService();
      const restartedRead = new CostingReadService(
        new PrismaCostingRepository(restarted),
        new TransportCoreFactsAdapter(
          new PrismaTripRepository(restarted),
          new PrismaFleetRepository(restarted),
        ),
      );
      try {
        const after = await restartedRead.driverFundStatement(state.driverA);
        expect(after.balance).toBe(before.balance);
        expect(after.entries).toHaveLength(before.entries.length);
        expect(after.entries.map((entry) => entry.id)).toEqual(
          before.entries.map((entry) => entry.id),
        );
      } finally {
        await restarted.$disconnect();
      }
    });

    /**
     * `INV-01` do TU HAI PHIA.
     *
     * `sumSignedAmounts` cong o DB (`SUM` cua Postgres tren `BIGINT`), con `listEntries` keo tung
     * hang len roi cong o JavaScript. Hai duong di qua hai phep cong khac nhau tren hai kieu so khac
     * nhau — neu phep doi `bigint -> number` lam mat chinh xac o dau do, chung se lech.
     */
    it('B9b — so du = TONG but toan, do bang ca hai duong doc lap', async () => {
      const statement = await read.driverFundStatement(state.driverA);
      const folded = statement.entries.reduce((sum, entry) => sum + entry.signedAmount, 0);
      expect(statement.balance).toBe(folded);

      const raw = await prisma.transportDriverFundEntry.aggregate({
        where: { accountId: statement.account!.id },
        _sum: { signedAmount: true },
      });
      expect(Number(raw._sum.signedAmount ?? 0n)).toBe(statement.balance);
    });

    it('B10 — be mat lai xe chi mo ra so quy CUA CHINH MINH, va khong co doanh thu', async () => {
      const mine = await read.selfFundStatement(`${PHONE_PREFIX}-user-A`);
      expect(mine.driverId).toBe(state.driverA);

      const other = await read.driverFundStatement(state.driverB);
      expect(mine.account?.id).not.toBe(other.account?.id);
      expect(mine.entries.every((entry) => entry.accountId === mine.account?.id)).toBe(true);

      // `INV-09` bang KIEU DU LIEU: payload that khong mang mot truong doanh thu nao.
      const payload = JSON.stringify(mine);
      for (const forbidden of ['freight', 'Freight', 'revenue']) {
        expect(payload, forbidden).not.toContain(forbidden);
      }

      // Lai xe B chua duoc noi tai khoan nao -> khong co duong nao doc so quy cua no qua be mat do.
      expect(await reasonOf(() => read.selfFundStatement(`${PHONE_PREFIX}-user-B`))).toBe(
        'SELF_FUND_SCOPE_NO_DRIVER_BINDING',
      );
    });

    /* ================================================================== *
     * T3R — BANG CHUNG CANH TRANH THAT (Issue #94 §1, §2)
     *
     * Sau bai duoi day la ly do bo IT nay ton tai o dang hien tai: chung do mot thu ma KHONG bai
     * don vi nao do duoc — hai lenh cham vao cung mot so quy CUNG LUC.
     * ================================================================== */

    describe('T3R — dua ky va lan ghi vao dung mot hang doi (#94 §1, §2)', () => {
      /**
       * MOT KET NOI RIENG, DUNG MOT BACKEND — de bai test hoi duoc "phien NAY co dang cho khoa
       * khong", chu khong phai "co ai do trong CSDL dang cho khoa khong".
       *
       * Cau hoi thu hai la cai bay ma ban dau tien cua bo nay dinh phai: CI chay nhieu tep test
       * SONG SONG tren CUNG mot database, nen `pg_stat_activity` gan nhu luc nao cung co mot phien
       * khac dang cho mot khoa khong lien quan gi. Bo dem "co it nhat N phien dang cho" vi the tra
       * ve NGAY, truoc khi phien cua bai test kip xep hang — va thu tu xep hang, thu duy nhat bai
       * nay can, tro thanh ngau nhien. Do dung la kieu bai test xanh o may nay, do o runner kia, roi
       * bi danh dau flaky va tat di.
       *
       * `connection_limit=1` ep pool ve DUNG mot backend, nen `pg_backend_pid()` doc mot lan la
       * dung mai — va cau hoi tro thanh cau hoi ve DUNG phien do.
       */
      const soloUrl = (() => {
        const base = process.env.DATABASE_URL ?? '';
        return `${base}${base.includes('?') ? '&' : '?'}connection_limit=1`;
      })();
      const soloPrisma = new PrismaService({ datasourceUrl: soloUrl });
      let soloPid = 0;

      beforeAll(async () => {
        const rows = await soloPrisma.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        soloPid = Number(rows[0]?.pid ?? 0);
        expect(soloPid).toBeGreaterThan(0);
      });

      afterAll(async () => {
        await soloPrisma.$disconnect();
      });

      /** Doi den khi DUNG phien `pid` dang cho mot khoa. */
      async function waitUntilBlocked(pid: number): Promise<void> {
        for (let attempt = 0; attempt < 400; attempt += 1) {
          const rows = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM pg_stat_activity
            WHERE pid = ${pid} AND wait_event_type = 'Lock'`;
          if (Number(rows[0]?.n ?? 0) > 0) return;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(`Phien ${pid} khong vao hang doi khoa`);
      }

      let serial = 0;

      async function freshDriverPeriod(): Promise<{
        driverId: string;
        accountId: string;
        periodId: string;
      }> {
        serial += 1;
        const driver = await fleet.createDriver({
          fullName: `IT T3R Driver ${serial}`,
          phone: `${PHONE_PREFIX}R${serial}`,
          licenceClass: 'C',
          licenceExpiry: '2029-01-01',
        });
        await costing.postAdvance(
          { driverId: driver.id, amount: 1_000_000, businessDate: '2026-10-05' },
          'it-ke-toan',
        );
        const period = await periods.openPeriod(
          { driverId: driver.id, startDate: '2026-10-01', endDate: '2026-10-31' },
          'it-ke-toan',
        );
        const account = await prisma.transportDriverFundAccount.findUniqueOrThrow({
          where: { driverId: driver.id },
        });
        return { driverId: driver.id, accountId: account.id, periodId: period.id };
      }

      /** Anh chup phai bang DUNG so cai cua ky, doc lai tu DB bang mot duong doc lap. */
      async function assertSnapshotMatchesLedger(
        periodId: string,
        accountId: string,
      ): Promise<void> {
        const snapshots = await prisma.transportDriverFundPeriodSnapshot.findMany({
          where: { periodId },
          orderBy: { sequence: 'asc' },
        });
        expect(snapshots).toHaveLength(1);
        const period = await prisma.transportDriverFundPeriod.findUniqueOrThrow({
          where: { id: periodId },
        });
        const ledger = await prisma.transportDriverFundEntry.aggregate({
          where: { accountId, businessDate: { gte: period.startDate, lte: period.endDate } },
          _sum: { signedAmount: true },
          _count: { _all: true },
        });
        expect(Number(snapshots[0]!.periodNet)).toBe(Number(ledger._sum.signedAmount ?? 0n));
        expect(snapshots[0]!.entryCount).toBe(ledger._count._all);
      }

      /**
       * BANG CHUNG §1-A — lan ghi giu khoa TRUOC: lan chot phai DOI, va anh chup CHUA no.
       *
       * Ben ghi o day la SQL THO co chu dich, va no mo phong dung buoc ma `post()` that lam:
       * `SELECT ... FOR UPDATE` tren hang so quy roi `INSERT`. Dung SQL tho vi bai test can giu
       * giao dich do MO trong luc lan chot xep hang phia sau — mot loi goi service khong dung yen
       * giua chung duoc.
       *
       * Ben chot la MA THAT (`FundPeriodService.closePeriod`), va do la ben dang duoc kiem: no phai
       * doi khoa, roi doc DUOC hang vua commit.
       */
      it('R1 — lan ghi giu khoa truoc: lan chot DOI, va anh chup CHUA hang do', async () => {
        const { accountId, periodId } = await freshDriverPeriod();

        let releaseWriter = (): void => {};
        const writerGate = new Promise<void>((resolve) => {
          releaseWriter = resolve;
        });
        const writer = prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT "id" FROM "TransportDriverFundAccount" WHERE "id" = ${accountId} FOR UPDATE`;
            await tx.transportDriverFundEntry.create({
              data: {
                accountId,
                kind: 'ADVANCE',
                signedAmount: 250_000n,
                businessDate: '2026-10-20',
                correlationKey: `it-t3r-r1-${accountId}`,
                recordedBy: 'it-nguoi-ghi',
              },
            });
            await writerGate;
          },
          { timeout: 60_000, maxWait: 30_000 },
        );

        // Lan chot chay tren ket noi RIENG de bai test hoi duoc dung phien do co dang cho khong.
        const soloPeriods = new FundPeriodService(
          new PrismaCostingRepository(soloPrisma),
          core,
          audit,
          CORE_POLICY,
        );
        const closing = soloPeriods.closePeriod(periodId, 'it-nguoi-chot');
        await waitUntilBlocked(soloPid);

        releaseWriter();
        await writer;
        const closed = await closing;

        expect(closed.period.status).toBe('CLOSED');
        // 1.000.000 (ung dau ky) + 250.000 (lan ghi vua commit) — anh chup KHONG duoc bo qua no.
        expect(closed.snapshot.periodNet).toBe(1_250_000);
        expect(closed.snapshot.entryCount).toBe(2);
        await assertSnapshotMatchesLedger(periodId, accountId);
      });

      /**
       * BANG CHUNG §1-B — lan chot xong TRUOC: lan ghi bi TU CHOI, khong hang nao lot vao ky.
       *
       * Day la bai bat DUNG lo hong `#94 §1`, va no khong dua vao thoi diem nao ca. Cong tam dung
       * dat NGAY TRUOC `ledger.post()`: tuc lan ghi da qua het moi buoc kiem cua service (ke ca
       * cai tien kiem ky cu, neu no con) tren mot ky luc do VAN `OPEN`.
       *
       *   · ma TRUOC T3R: tien kiem doc `OPEN` -> cho qua -> `INSERT` commit vao ky da CLOSED;
       *   · ma SAU T3R:  `post()` giu khoa roi doc LAI ky trong cung giao dich -> TU CHOI.
       *
       * Ca hai ben deu la ma that; khong SQL tho nao o bai nay.
       */
      it('R2 — lan chot xong truoc: lan ghi bi TU CHOI, khong hang nao lot vao ky da chot', async () => {
        const { driverId, accountId, periodId } = await freshDriverPeriod();

        let releaseWriter = (): void => {};
        const writerGate = new Promise<void>((resolve) => {
          releaseWriter = resolve;
        });
        let writerAtGate = false;

        class GatedCostingRepository extends PrismaCostingRepository {
          override async post(
            input: Parameters<PrismaCostingRepository['post']>[0],
          ): ReturnType<PrismaCostingRepository['post']> {
            writerAtGate = true;
            await writerGate;
            return super.post(input);
          }
        }
        const gatedCosting = new CostingService(
          new GatedCostingRepository(prisma),
          core,
          audit,
          CORE_POLICY,
          COSTING_POLICY,
        );

        // `.then()` gan NGAY luc tao: doi den sau `await closing` thi co mot khoanh khac rejection
        // chua ai bat, va Node bao "unhandled rejection" lam do ca lan chay.
        const writing = gatedCosting
          .postAdvance({ driverId, amount: 250_000, businessDate: '2026-10-20' }, 'it-nguoi-ghi')
          .then(
            () => null,
            (error: unknown) => error,
          );
        while (!writerAtGate) await new Promise((resolve) => setTimeout(resolve, 10));

        // Lan chot chay TRON VEN trong luc lan ghi dang dung o cong.
        const closed = await periods.closePeriod(periodId, 'it-nguoi-chot');
        expect(closed.period.status).toBe('CLOSED');

        releaseWriter();
        const rejection = await writing;

        expect(rejection).toBeInstanceOf(TransportDomainError);
        expect((rejection as TransportDomainError).reason).toBe('FUND_ENTRY_PERIOD_FROZEN');
        expect(closed.snapshot.periodNet).toBe(1_000_000);
        expect(closed.snapshot.entryCount).toBe(1);
        await assertSnapshotMatchesLedger(periodId, accountId);

        // Doc lai THO: khong mot but toan nao mang ngay cua ky bi ghi them sau khi ky da CLOSED.
        const after = await prisma.transportDriverFundEntry.count({
          where: { accountId, businessDate: { gte: '2026-10-01', lte: '2026-10-31' } },
        });
        expect(after).toBe(1);
      });

      /**
       * BANG CHUNG §2 — chet DUNG giua pha hai, sau khi anh chup da duoc tao.
       *
       * Lop con duoi day nem NGAY SAU khi hang anh chup da `INSERT` xong, ben trong giao dich cua
       * `finalizeClose()`. Neu pha hai van la hai lan commit nhu ban T3 dau, hang do da COMMIT va
       * lan goi lai se chup them mot anh thu hai cho CUNG MOT lan dong.
       */
      it('R3 — chet sau khi chup anh: cuon lai sach, ky ve CLOSING, goi lai chup DUNG mot anh', async () => {
        const { accountId, periodId } = await freshDriverPeriod();

        class CrashingRepository extends PrismaCostingRepository {
          protected override async appendSnapshotWithin(
            scoped: Parameters<PrismaCostingRepository['appendSnapshotWithin']>[0],
            input: AppendSnapshotInput,
          ): Promise<FundPeriodSnapshot> {
            const created = await super.appendSnapshotWithin(scoped, input);
            throw new Error(`IT-T3R: chet sau khi tao anh chup ${created.id}`);
          }
        }
        const crashing = new FundPeriodService(
          new CrashingRepository(prisma),
          core,
          audit,
          CORE_POLICY,
        );

        await expect(crashing.closePeriod(periodId, 'it-chet-giua-chung')).rejects.toThrow(
          /chet sau khi tao anh chup/,
        );

        // Pha MOT da commit (ky dong bang); pha HAI cuon lai hoan toan.
        const frozen = await prisma.transportDriverFundPeriod.findUniqueOrThrow({
          where: { id: periodId },
        });
        expect(frozen.status).toBe('CLOSING');
        expect(await prisma.transportDriverFundPeriodSnapshot.count({ where: { periodId } })).toBe(
          0,
        );

        // Goi lai bang duong that: DUNG mot anh chup, va ky sang CLOSED.
        const closed = await periods.closePeriod(periodId, 'it-ke-toan');
        expect(closed.period.status).toBe('CLOSED');
        expect(closed.snapshot.sequence).toBe(1);
        await assertSnapshotMatchesLedger(periodId, accountId);
      });

      it('R4 — hai lenh chot CUNG MOT ky: mot anh chup, ben thua nhan ma va cham', async () => {
        const { periodId } = await freshDriverPeriod();

        const results = await Promise.allSettled([
          periods.closePeriod(periodId, 'it-ke-toan-1'),
          periods.closePeriod(periodId, 'it-ke-toan-2'),
        ]);
        const won = results.filter((row) => row.status === 'fulfilled');
        const lost = results.filter((row) => row.status === 'rejected');

        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        // Ben thua nhan mot ma cua MIEN, khong phai mot 500 tho.
        const failure = (lost[0] as PromiseRejectedResult).reason;
        expect(failure).toBeInstanceOf(TransportDomainError);
        // Hai duong thua deu tat dinh: mat luot o pha MOT (`setPeriodStatus` co rang buoc `from`)
        // hay o pha HAI (`finalizeClose` tra `null`). Ca hai deu la ma cua MIEN, khong phai 500.
        expect(['FUND_PERIOD_STATUS_RACE', 'PERIOD_TRANSITION_NOT_PERMITTED']).toContain(
          (failure as TransportDomainError).reason,
        );
        expect(await prisma.transportDriverFundPeriodSnapshot.count({ where: { periodId } })).toBe(
          1,
        );
      });

      /* ---- §3 va §5 tren DB that, khong chi tren kho trong bo nho ---- */

      it('R5 — cung khoa chong trung nhung KHAC LAI XE: va cham, khong tra ve but toan cua nguoi kia', async () => {
        const key = 'it-t3r-khoa-cheo-0001';
        const first = await costing.postAdvance(
          {
            driverId: state.driverA,
            amount: 100_000,
            businessDate: '2026-11-05',
            correlationKey: key,
          },
          'it-ke-toan',
        );

        expect(
          await reasonOf(() =>
            costing.postAdvance(
              {
                driverId: state.driverB,
                amount: 100_000,
                businessDate: '2026-11-05',
                correlationKey: key,
              },
              'it-ke-toan',
            ),
          ),
        ).toBe('CORRELATION_KEY_REUSED');

        // Lai xe B khong co mot but toan nao mang khoa do — doc THO tu DB.
        const rows = await prisma.transportDriverFundEntry.findMany({
          where: { correlationKey: key },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe(first.id);
      });

      it('R6 — DA-T3-04: lai xe chua tung chay chuyen do khong bi tru quy (do tren DB that)', async () => {
        expect(
          await reasonOf(() =>
            costing.recordTripExpense(
              {
                tripId: state.tripOwn,
                categoryCode: 'BOT',
                amount: 120_000,
                fundedBy: 'DRIVER_FUND',
                driverId: state.driverUnassigned,
                businessDate: '2026-11-06',
              },
              'it-ke-toan',
            ),
          ),
        ).toBe('EXPENSE_DRIVER_NOT_ASSIGNED');

        // Khong dong gia thanh, VA khong ca mot so quy moi tinh cho lai xe do.
        expect(
          await prisma.transportTripExpense.count({
            where: { tripId: state.tripOwn, driverId: state.driverUnassigned },
          }),
        ).toBe(0);
        expect(
          await prisma.transportDriverFundAccount.count({
            where: { driverId: state.driverUnassigned },
          }),
        ).toBe(0);
      });
    });

    /* ================================================================== *
     * BAI PHU DINH TANG LUU TRU — nhung thu kho in-memory KHONG chung minh duoc
     * ================================================================== */

    describe('rang buoc cua DB, do bang cach VONG QUA service', () => {
      async function accountOf(driverId: string): Promise<string> {
        const row = await prisma.transportDriverFundAccount.findUnique({ where: { driverId } });
        expect(row).not.toBeNull();
        return row!.id;
      }

      it('CHECK dau: mot `ADVANCE` mang so AM bi DB tu choi', async () => {
        await expect(
          prisma.transportDriverFundEntry.create({
            data: {
              accountId: await accountOf(state.driverA),
              kind: 'ADVANCE',
              signedAmount: -1_000n,
              businessDate: '2026-09-05',
              correlationKey: 'it-t3-dau-am',
              recordedBy: 'it-tho',
            },
          }),
        ).rejects.toThrow(/TransportDriverFundEntry_sign_by_kind/);
      });

      it('CHECK dau: mot but toan 0 dong bi tu choi', async () => {
        await expect(
          prisma.transportDriverFundEntry.create({
            data: {
              accountId: await accountOf(state.driverA),
              kind: 'ADJUSTMENT',
              signedAmount: 0n,
              businessDate: '2026-09-05',
              correlationKey: 'it-t3-khong-dong',
              recordedBy: 'it-tho',
            },
          }),
        ).rejects.toThrow(/TransportDriverFundEntry_sign_by_kind/);
      });

      /**
       * `INV-03` o tang DB: mot khoan chi `DRIVER_FUND` MO COI se lam so du quy khong tru — tuc lai
       * xe "van con" so tien ho da tieu. Service khong bao gio tao ra hang nay; lenh duoi day tao no
       * bang tay de chung minh DB cung khong cho.
       */
      it('CHECK hai lop: khoan chi tu quy KHONG co dong quy sinh doi bi tu choi', async () => {
        await expect(
          prisma.transportTripExpense.create({
            data: {
              tripId: state.tripOwn,
              kind: 'EXPENSE',
              categoryCode: 'BOT',
              signedAmount: 10_000n,
              businessDate: '2026-09-05',
              fundedBy: 'DRIVER_FUND',
              driverId: state.driverA,
              correlationKey: 'it-t3-mo-coi',
              recordedBy: 'it-tho',
            },
          }),
        ).rejects.toThrow(/TransportTripExpense_fund_leg/);
      });

      it('CHECK ngay: mot ngay nghiep vu KHONG CO THAT bi tu choi', async () => {
        await expect(
          prisma.transportDriverFundEntry.create({
            data: {
              accountId: await accountOf(state.driverA),
              kind: 'ADVANCE',
              signedAmount: 1_000n,
              businessDate: '2026-02-30',
              correlationKey: 'it-t3-ngay-khong-co-that',
              recordedBy: 'it-tho',
            },
          }),
        ).rejects.toThrow();
      });

      it('UNIQUE khoa chong ghi trung chan lan ghi thu hai mang cung khoa', async () => {
        const key = 'it-t3-khoa-trung-0001';
        await costing.recordTripExpense(
          {
            tripId: state.tripOwn,
            categoryCode: 'BOT',
            amount: 11_000,
            fundedBy: 'COMPANY_DIRECT',
            businessDate: '2026-09-05',
            correlationKey: key,
          },
          'it-ke-toan',
        );

        // Ghi THANG mot hang khac mang cung khoa — bo qua duong phat lai cua service.
        await expect(
          prisma.transportTripExpense.create({
            data: {
              tripId: state.tripOwn,
              kind: 'EXPENSE',
              categoryCode: 'BOT',
              signedAmount: 22_000n,
              businessDate: '2026-09-05',
              fundedBy: 'COMPANY_DIRECT',
              correlationKey: key,
              recordedBy: 'it-tho',
            },
          }),
        ).rejects.toThrow();
      });

      it('CHECK anh chup: mot anh "gan dung" khong luu duoc', async () => {
        const period = await prisma.transportDriverFundPeriod.findFirst({
          where: { accountId: await accountOf(state.driverA) },
        });
        expect(period).not.toBeNull();

        await expect(
          prisma.transportDriverFundPeriodSnapshot.create({
            data: {
              periodId: period!.id,
              sequence: 99,
              openingBalance: 100n,
              periodNet: 50n,
              closingBalance: 999n,
              entryCount: 1,
              takenBy: 'it-tho',
            },
          }),
        ).rejects.toThrow(/TransportDriverFundPeriodSnapshot_balance_sum/);
      });
    });
  },
);
