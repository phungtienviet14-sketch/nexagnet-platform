import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { DEFAULT_TRANSPORT_TIME_ZONE } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PrismaWorkforceRepository } from '../workforce/prisma-workforce.repository.js';
import { WorkforceCoreFacts, WorkforceCoreFactsAdapter } from '../workforce/workforce.ports.js';
import { WorkforceService } from '../workforce/workforce.service.js';
import type { PayrollPolicySnapshot } from '../workforce/workforce.types.js';
import { DriverSettlementReadService } from './driver-settlement-read.service.js';
import {
  DriverSettlementCoreFactsAdapter,
  DriverSettlementFundPortAdapter,
  DriverSettlementPayrollFactsAdapter,
} from './driver-settlement.ports.js';
import { DriverSettlementService } from './driver-settlement.service.js';
import { PrismaDriverSettlementRepository } from './prisma-driver-settlement.repository.js';

/**
 * `TX-07b` — BANG CHUNG TREN POSTGRES THAT (Issue #237).
 *
 * NAM thu duoi day KHONG mot kho in-memory nao chung minh duoc:
 *
 *   · trigger `transport_driver_cashout_immutable` — mot `CHECK` khong nhin duoc hang CU;
 *   · trigger `transport_driver_cashout_allocation_frozen` — chan ca `UPDATE` lan `DELETE`;
 *   · `CHECK ..._source_shape` — mot dong hoan ung mang phieu luong KHONG GHI DUOC, ke ca khi ai
 *     do ghi thang vao DB;
 *   · `CHECK ..._sign_by_kind` moi — mot but toan hoan ung AM bi tu choi o tang luu tru;
 *   · va quan trong nhat: mot lan chi hoan ung di qua `CostingService` THAT lam so du quy doi DUNG
 *     MOT LAN. Bai in-memory dung mot so quy gia; bai nay dung so cai that.
 *
 * TIEN TO `IT-T7B` — khong long nhau voi `IT-T6A`, `IT-T6W`, `IT-T3-*`, `IT-T4*`, `IT-T21-*`.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Quyet toan lai xe tren Postgres THAT — TX-07b',
  () => {
    const prisma = new PrismaService();
    const settlementRepo = new PrismaDriverSettlementRepository(prisma);
    const workforceRepo = new PrismaWorkforceRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);

    const PREFIX = 'IT-T7B';
    const POLICY: PayrollPolicySnapshot = {
      baseSalaryVnd: 6_000_000,
      perTripVnd: 250_000,
      perKmVnd: 1_200,
      fuelSavingBonusVndPerLiter: 8_000,
    };
    const corePolicy = { timeZone: DEFAULT_TRANSPORT_TIME_ZONE };
    const clock = () => new Date('2027-05-10T03:00:00.000Z');

    const realWorkforceCore = new WorkforceCoreFactsAdapter(fleet, trips);
    /** Xem chu thich cung ten o `transport-workforce.int.spec.ts`: pham vi bi thu hep CO CHU DICH. */
    const scopedWorkforceCore = new (class extends WorkforceCoreFacts {
      async listActiveDriverIds(): Promise<string[]> {
        return [driverId];
      }
      workByDriver = realWorkforceCore.workByDriver.bind(realWorkforceCore);
      findDriverByAuthUserId = realWorkforceCore.findDriverByAuthUserId.bind(realWorkforceCore);
    })();

    const coreFacts = new TransportCoreFactsAdapter(trips, fleet);
    const payroll = new WorkforceService(workforceRepo, scopedWorkforceCore, POLICY);
    const costing = new CostingService(
      costingRepo,
      coreFacts,
      { append: async () => undefined } as never,
      corePolicy,
      { expenseCategories: [], advanceApprovalRequired: false },
      undefined,
      clock,
    );
    const costingRead = new CostingReadService(costingRepo, coreFacts);
    const fundPort = new DriverSettlementFundPortAdapter(costing, costingRead);
    const settlementCore = new DriverSettlementCoreFactsAdapter(fleet);
    const settlementPayroll = new DriverSettlementPayrollFactsAdapter(workforceRepo);

    const read = new DriverSettlementReadService(
      settlementRepo,
      settlementPayroll,
      settlementCore,
      corePolicy,
      fundPort,
      undefined,
      clock,
    );
    const service = new DriverSettlementService(
      settlementRepo,
      read,
      settlementCore,
      corePolicy,
      fundPort,
      undefined,
      clock,
    );

    let driverId = '';
    const payslipIds: string[] = [];

    beforeAll(async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;

      // THU TU XOA: dong phan bo -> lan chi dao -> lan chi goc -> phieu luong -> lan chay -> ky.
      //
      // Cac dong phan bo bi trigger `..._allocation_frozen` chan khi xoa TRUC TIEP, va khoa ngoai
      // cua chung la `Restrict` nen khong co duong `CASCADE` nao. Nen lan don dep phai TAT trigger
      // mot cach tuong minh — mot thao tac chi xay ra o day, trong mot bai IT, va duoc bat lai ngay.
      const cashouts = await db.transportDriverCashout.findMany({
        where: { recordedBy: { startsWith: PREFIX } },
        select: { id: true },
      });
      const cashoutIds = cashouts.map((row: { id: string }) => row.id);
      if (cashoutIds.length > 0) {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "TransportDriverCashoutAllocation" DISABLE TRIGGER "transport_driver_cashout_allocation_frozen"',
        );
        try {
          await db.transportDriverCashoutAllocation.deleteMany({
            where: { cashoutId: { in: cashoutIds } },
          });
        } finally {
          await prisma.$executeRawUnsafe(
            'ALTER TABLE "TransportDriverCashoutAllocation" ENABLE TRIGGER "transport_driver_cashout_allocation_frozen"',
          );
        }
        await db.transportDriverCashout.deleteMany({
          where: { id: { in: cashoutIds }, kind: 'REVERSAL' },
        });
        await db.transportDriverCashout.deleteMany({ where: { id: { in: cashoutIds } } });
      }

      const runs = await db.transportPayrollRun.findMany({
        where: { runBy: { startsWith: PREFIX } },
        select: { id: true },
      });
      const runIds = runs.map((run: { id: string }) => run.id);
      await db.transportPayslip.deleteMany({
        where: { runId: { in: runIds }, kind: { not: 'ORIGINAL' } },
      });
      await db.transportPayslip.deleteMany({ where: { runId: { in: runIds } } });
      await db.transportPayrollRun.deleteMany({ where: { id: { in: runIds } } });
      await db.transportPayrollPeriod.deleteMany({ where: { label: { startsWith: PREFIX } } });

      const staleDrivers = await db.transportDriver.findMany({
        where: { fullName: { startsWith: PREFIX } },
        select: { id: true },
      });
      const staleIds = staleDrivers.map((row: { id: string }) => row.id);
      if (staleIds.length > 0) {
        const accounts = await db.transportDriverFundAccount.findMany({
          where: { driverId: { in: staleIds } },
          select: { id: true },
        });
        const accountIds = accounts.map((row: { id: string }) => row.id);
        await db.transportDriverFundEntry.deleteMany({
          where: { accountId: { in: accountIds }, reversalOfId: { not: null } },
        });
        await db.transportDriverFundEntry.deleteMany({ where: { accountId: { in: accountIds } } });
        await db.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });
        await db.transportDriver.deleteMany({ where: { id: { in: staleIds } } });
      }

      const driver = await fleet.createDriver({
        fullName: `${PREFIX} Lai xe`,
        phone: '0900000012',
        licenceClass: 'FC',
        licenceExpiry: '2028-01-01',
        authUserId: `${PREFIX}-user`,
      });
      driverId = driver.id;

      // BA THANG LUONG that — moi thang mot ky, mot lan chay, mot phieu duoc duyet.
      const ranges: readonly (readonly [string, string])[] = [
        ['2027-01-01', '2027-01-31'],
        ['2027-02-01', '2027-02-28'],
        ['2027-03-01', '2027-03-31'],
      ];
      for (const [index, range] of ranges.entries()) {
        const period = await payroll.openPeriod({
          label: `${PREFIX} Thang ${index + 1}/2027`,
          startDate: range[0],
          endDate: range[1],
          createdBy: `${PREFIX}-kt`,
        });
        const outcome = await payroll.runPayroll({ periodId: period.id, runBy: `${PREFIX}-kt` });
        if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');
        const payslip = outcome.payslips.find((row) => row.driverId === driverId);
        if (!payslip) throw new Error('khong tim thay phieu luong cua lai xe fixture');
        await payroll.approvePayslip(payslip.id, `${PREFIX}-kt`);
        payslipIds.push(payslip.id);
      }
    });

    it('P1: ba thang luong doc ra thanh ba dong nguon goc, xep ky cu truoc', async () => {
      const snapshot = await read.snapshotOf(driverId);
      expect(snapshot.months).toHaveLength(3);
      expect(snapshot.months.map((month) => month.startDate)).toEqual([
        '2027-01-01',
        '2027-02-01',
        '2027-03-01',
      ]);
      expect(snapshot.balance.wageCredited).toBe(POLICY.baseSalaryVnd * 3);
      expect(snapshot.balance.wageRemaining).toBe(POLICY.baseSalaryVnd * 3);
    });

    it('P2: MOT lan chi phu HAI thang, ghi trong mot giao dich, doc lai tu Postgres', async () => {
      const detail = await service.recordCashout(
        {
          driverId,
          method: 'BANK_TRANSFER',
          reference: `${PREFIX}-FT-01`,
          lines: [
            { source: 'WAGE', amount: POLICY.baseSalaryVnd, payslipId: payslipIds[0]! },
            { source: 'WAGE', amount: 2_000_000, payslipId: payslipIds[1]! },
          ],
        },
        `${PREFIX}-kt`,
      );

      const reread = await settlementRepo.find(detail.cashout.id);
      expect(reread?.allocations).toHaveLength(2);
      expect(reread?.allocations.map((row) => row.payslipId)).toEqual([
        payslipIds[0],
        payslipIds[1],
      ]);

      const snapshot = await read.snapshotOf(driverId);
      expect(snapshot.balance.wageCashedOut).toBe(POLICY.baseSalaryVnd + 2_000_000);
      expect(snapshot.balance.wageRemaining).toBe(POLICY.baseSalaryVnd * 2 - 2_000_000);
    });

    /**
     * DUONG HOAN UNG QUA SO CAI THAT — bai trung tam cua tep nay.
     *
     * So quy bi dua ve AM bang mot duong ghi THAT cua `TX-03` (`postAdjustment`, hai chieu). Sau
     * lan chi, so du phai di len DUNG mot lan.
     */
    it('P3: tra hoan ung lam so du quy doi DUNG MOT LAN, va lich su khong tru them', async () => {
      await costing.postAdjustment(
        {
          driverId,
          signedAmount: -1_500_000,
          businessDate: '2027-04-01',
          note: `${PREFIX} lai xe bo tien tui`,
          correlationKey: `${PREFIX}-adj-1`,
        },
        `${PREFIX}-kt`,
      );

      const before = await read.snapshotOf(driverId);
      expect(before.balance.fundBalance).toBe(-1_500_000);
      expect(before.balance.reimbursementOutstanding).toBe(1_500_000);
      expect(before.balance.fundStance).toBe('COMPANY_OWES_DRIVER');

      const detail = await service.recordCashout(
        {
          driverId,
          method: 'CASH',
          correlationKey: `${PREFIX}-cashout-reimb`,
          lines: [{ source: 'REIMBURSEMENT', amount: 1_500_000, payslipId: null }],
        },
        `${PREFIX}-kt`,
      );

      const allocation = detail.allocations[0];
      expect(allocation?.source).toBe('REIMBURSEMENT');
      expect(allocation?.payslipId).toBeNull();
      expect(allocation?.driverFundEntryId).toBeTruthy();

      const entry = await costingRepo.findEntry(allocation!.driverFundEntryId!);
      expect(entry?.kind).toBe('REIMBURSEMENT');
      expect(entry?.signedAmount).toBe(1_500_000);

      const after = await read.snapshotOf(driverId);
      expect(after.balance.fundBalance).toBe(0);
      expect(after.balance.reimbursementOutstanding).toBe(0);
      expect(after.balance.reimbursementCashedOut).toBe(1_500_000);
      expect(after.balance.fundStance).toBe('SETTLED');
    });

    it('P4: gui lai cung khoa KHONG sinh them mot but toan quy nao', async () => {
      const before = await read.snapshotOf(driverId);
      const again = await service.recordCashout(
        {
          driverId,
          method: 'CASH',
          correlationKey: `${PREFIX}-cashout-reimb`,
          lines: [{ source: 'REIMBURSEMENT', amount: 1_500_000, payslipId: null }],
        },
        `${PREFIX}-kt`,
      );
      const after = await read.snapshotOf(driverId);

      expect(again.cashout.correlationKey).toBe(`${PREFIX}-cashout-reimb`);
      expect(after.balance.fundBalance).toBe(before.balance.fundBalance);
      expect(after.balance.reimbursementCashedOut).toBe(before.balance.reimbursementCashedOut);
    });

    /**
     * `INV-20` o TANG LUU TRU — mot lan chi da ghi khong sua duoc.
     *
     * Bai nay CO Y di vong qua service va ghi thang vao bang. Hai lop tren (kho khong co ham sua,
     * service khong co duong sua) da co bai rieng; lop nay la lop duy nhat con dung khi mot script
     * di tru hay mot tay ghi truc tiep vao DB.
     */
    it('P5: sua mot lan chi da ghi bi trigger tu choi', async () => {
      const detail = await service.recordCashout(
        {
          driverId,
          method: 'CASH',
          lines: [{ source: 'WAGE', amount: 1_000_000, payslipId: payslipIds[2]! }],
        },
        `${PREFIX}-kt`,
      );

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportDriverCashout.update({
          where: { id: detail.cashout.id },
          data: { method: 'BANK_TRANSFER' },
        }),
      ).rejects.toThrow(/transport_driver_cashout_immutable/);

      await expect(
        db.transportDriverCashoutAllocation.update({
          where: { id: detail.allocations[0]!.id },
          data: { amount: 9_000_000n },
        }),
      ).rejects.toThrow(/transport_driver_cashout_allocation_frozen/);
    });

    it('P6: mot dong hoan ung mang phieu luong bi CHECK tu choi', async () => {
      const detail = await service.recordCashout(
        {
          driverId,
          method: 'CASH',
          lines: [{ source: 'WAGE', amount: 500_000, payslipId: payslipIds[2]! }],
        },
        `${PREFIX}-kt`,
      );

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportDriverCashoutAllocation.create({
          data: {
            cashoutId: detail.cashout.id,
            source: 'REIMBURSEMENT',
            amount: 1_000n,
            payslipId: payslipIds[2]!,
          },
        }),
      ).rejects.toThrow(/TransportDriverCashoutAllocation_source_shape/);
    });

    it('P7: mot but toan hoan ung AM bi CHECK cua so quy tu choi', async () => {
      const account = await costingRepo.findAccountByDriver(driverId);
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportDriverFundEntry.create({
          data: {
            accountId: account!.id,
            kind: 'REIMBURSEMENT',
            signedAmount: -1_000n,
            businessDate: '2027-04-02',
            correlationKey: `${PREFIX}-bad-reimb`,
            recordedBy: `${PREFIX}-kt`,
          },
        }),
      ).rejects.toThrow(/TransportDriverFundEntry_sign_by_kind/);
    });

    /**
     * DAO — ban goc doi trang thai, ban dao mang cac dong AM, va so con lai quay ve.
     *
     * `wageRemaining` sau khi dao phai TRO LAI dung so truoc do: do la phep thu rang phep cong "da
     * rut bao nhieu" khong phai loc gi ca, chi cong cac dong CO DAU.
     */
    it('P8: dao mot lan chi la GHI THEM, va so con lai quay ve dung so cu', async () => {
      const beforeSnapshot = await read.snapshotOf(driverId);
      const original = await service.recordCashout(
        {
          driverId,
          method: 'CASH',
          lines: [{ source: 'WAGE', amount: 700_000, payslipId: payslipIds[2]! }],
        },
        `${PREFIX}-kt`,
      );

      const reversal = await service.reverseCashout(
        original.cashout.id,
        `${PREFIX} chuyen khoan bi tra ve`,
        `${PREFIX}-gd`,
      );
      expect(reversal.cashout.kind).toBe('REVERSAL');
      expect(reversal.allocations.map((row) => row.amount)).toEqual([-700_000]);

      const stored = await settlementRepo.find(original.cashout.id);
      expect(stored?.cashout.status).toBe('REVERSED');
      expect(stored?.allocations.map((row) => row.amount)).toEqual([700_000]);

      const afterSnapshot = await read.snapshotOf(driverId);
      expect(afterSnapshot.balance.wageRemaining).toBe(beforeSnapshot.balance.wageRemaining);

      await expect(
        service.reverseCashout(original.cashout.id, 'lan hai', `${PREFIX}-gd`),
      ).rejects.toMatchObject({ reason: 'CASHOUT_ALREADY_REVERSED' });
    });

    /**
     * DOI SOAT TAT DINH — tong cac dong phan bo doc THANG tu bang phai bang con so ma khung nhin
     * cong bo. Neu mot ngay nao do khung nhin them mot bo loc, bai nay do ngay.
     */
    it('P9: tong cac dong phan bo doc thang tu Postgres khop voi khung nhin', async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      const rows = await db.transportDriverCashoutAllocation.findMany({
        where: { cashout: { driverId } },
        select: { source: true, amount: true },
      });

      const sumOf = (source: string): number =>
        rows
          .filter((row: { source: string }) => row.source === source)
          .reduce((total: number, row: { amount: bigint }) => total + Number(row.amount), 0);

      const snapshot = await read.snapshotOf(driverId);
      expect(snapshot.balance.wageCashedOut).toBe(sumOf('WAGE'));
      expect(snapshot.balance.reimbursementCashedOut).toBe(sumOf('REIMBURSEMENT'));
      expect(snapshot.balance.wageRemaining).toBe(
        snapshot.balance.wageCredited - snapshot.balance.wageCashedOut,
      );
    });

    /**
     * KHOI DONG LAI — mot `PrismaService` MOI, khong dung mot byte trang thai nao cua tien trinh cu.
     */
    it('P10: doc lai bang mot ket noi moi cho ra cung nhung con so', async () => {
      const before = await read.snapshotOf(driverId);

      const freshPrisma = new PrismaService();
      const freshFleet = new PrismaFleetRepository(freshPrisma);
      const freshTrips = new PrismaTripRepository(freshPrisma);
      const freshCostingRepo = new PrismaCostingRepository(freshPrisma);
      const freshRead = new DriverSettlementReadService(
        new PrismaDriverSettlementRepository(freshPrisma),
        new DriverSettlementPayrollFactsAdapter(new PrismaWorkforceRepository(freshPrisma)),
        new DriverSettlementCoreFactsAdapter(freshFleet),
        corePolicy,
        new DriverSettlementFundPortAdapter(
          costing,
          new CostingReadService(
            freshCostingRepo,
            new TransportCoreFactsAdapter(freshTrips, freshFleet),
          ),
        ),
        undefined,
        clock,
      );

      const after = await freshRead.snapshotOf(driverId);
      expect(after.balance).toEqual(before.balance);
      expect(after.months).toEqual(before.months);
      await freshPrisma.$disconnect();
    });
  },
);
