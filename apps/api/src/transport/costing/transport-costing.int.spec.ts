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
        where: { accountId: statement.account.id },
        _sum: { signedAmount: true },
      });
      expect(Number(raw._sum.signedAmount ?? 0n)).toBe(statement.balance);
    });

    it('B10 — be mat lai xe chi mo ra so quy CUA CHINH MINH, va khong co doanh thu', async () => {
      const mine = await read.selfFundStatement(`${PHONE_PREFIX}-user-A`);
      expect(mine.driverId).toBe(state.driverA);

      const other = await read.driverFundStatement(state.driverB);
      expect(mine.account.id).not.toBe(other.account.id);
      expect(mine.entries.every((entry) => entry.accountId === mine.account.id)).toBe(true);

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
