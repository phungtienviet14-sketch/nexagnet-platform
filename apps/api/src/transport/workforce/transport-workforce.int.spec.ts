import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PrismaWorkforceRepository } from './prisma-workforce.repository.js';
import { WorkforceCoreFacts, WorkforceCoreFactsAdapter } from './workforce.ports.js';
import { WorkforceService } from './workforce.service.js';
import type { PayrollPolicySnapshot, Payslip } from './workforce.types.js';

/**
 * T6/`TX-07` — BANG CHUNG TREN POSTGRES THAT (Issue #88).
 *
 * BA thu duoi day KHONG mot kho in-memory nao chung minh duoc, va ca ba deu la dieu kien dong cua
 * Issue #88:
 *
 *   · EXCLUDE chong lap ky luong  — mot unique khong bieu dien duoc "hai khoang ngay cham nhau";
 *   · trigger bat bien phieu da chot (acceptance 12) — mot `CHECK` khong nhin duoc hang CU;
 *   · `CHECK` `..._deduction_manual_only` (`GD-12`, acceptance 11) — bat bien nay phai dung ke ca
 *     khi ai do ghi THANG vao DB, khong qua service.
 *
 * TIEN TO `IT-T6W` — khong long nhau voi `IT-T6A` cua tep ben canh.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Ky luong + phieu luong tren Postgres THAT — T6',
  () => {
    const prisma = new PrismaService();
    const repo = new PrismaWorkforceRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);

    const POLICY: PayrollPolicySnapshot = {
      baseSalaryVnd: 6_000_000,
      perTripVnd: 250_000,
      perKmVnd: 1_200,
      fuelSavingBonusVndPerLiter: 8_000,
    };
    const realCore = new WorkforceCoreFactsAdapter(fleet, trips);

    /**
     * PHAM VI LAI XE bi thu hep ve DUNG lai xe cua tep nay — va do la mot sua loi that, khong
     * phai mot lan lam cho de.
     *
     * `runPayroll` chay cho MOI lai xe dang hoat dong. Do la hanh vi DUNG cua nghiep vu (luong co
     * ban tra cho ca doi xe, khong chi nguoi co chuyen), nhung trong mot DB dung chung no co
     * nghia la mot lan chay o day sinh phieu luong bam vao lai xe cua CAC TEP IT KHAC — va lan
     * don dep cua ho sau do do vi khoa ngoai `TransportPayslip_driverId_fkey`. Do dung la dieu
     * da xay ra voi `transport-fuel.int.spec.ts`.
     *
     * `workByDriver` VAN goi thang cong that tren Postgres — cai bai nay phai chung minh la tang
     * luu tru, va no khong duoc mat mot phan chi vi pham vi bi thu hep.
     */
    const scopedCore = new (class extends WorkforceCoreFacts {
      async listActiveDriverIds(): Promise<string[]> {
        return [driverId];
      }
      workByDriver = realCore.workByDriver.bind(realCore);
    })();

    const service = new WorkforceService(repo, scopedCore, POLICY);

    const PREFIX = 'IT-T6W';
    let driverId = '';

    beforeAll(async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      const runs = await db.transportPayrollRun.findMany({
        where: { runBy: { startsWith: PREFIX } },
        select: { id: true },
      });
      const runIds = runs.map((run: { id: string }) => run.id);
      // THU TU XOA quan trong, va hai rang buoc cua chinh T6 quy dinh no:
      //   · cac dong bi trigger `TransportPayslip_component_frozen` chan khi phieu da chot, nen
      //     KHONG xoa chung trucc tiep — xoa phieu, va `ON DELETE CASCADE` don chung di (luc do
      //     hang cha da bien mat, va trigger cho qua dung theo nhanh `IF NOT FOUND`);
      //   · phieu bu tro ve ban goc bang mot khoa ngoai `Restrict`, nen ban sua phai di truoc.
      await db.transportPayslip.deleteMany({
        where: { runId: { in: runIds }, kind: { not: 'ORIGINAL' } },
      });
      await db.transportPayslip.deleteMany({ where: { runId: { in: runIds } } });
      await db.transportPayrollRun.deleteMany({ where: { id: { in: runIds } } });
      await db.transportPayrollPeriod.deleteMany({ where: { label: { startsWith: PREFIX } } });
      await db.transportDriver.deleteMany({ where: { fullName: { startsWith: PREFIX } } });

      const driver = await fleet.createDriver({
        fullName: `${PREFIX} Lai xe`,
        phone: '0900000002',
        licenceClass: 'FC',
        licenceExpiry: '2027-01-01',
      });
      driverId = driver.id;
    });

    /**
     * Phieu cua CHINH lai xe cua tep nay.
     *
     * `runPayroll` chay cho MOI lai xe dang hoat dong — do la hanh vi dung cua nghiep vu, nhung
     * no co nghia la mot lan chay trong DB dung chung se cuon theo ca lai xe cua tep IT khac.
     * Bam vao `payslips[0]` se lam bai test phu thuoc thu tu chen cua mot tep khong lien quan.
     */
    const mine = (payslips: readonly Payslip[]): Payslip | undefined =>
      payslips.find((payslip) => payslip.driverId === driverId);

    const openPeriod = (label: string, startDate: string, endDate: string) =>
      service.openPeriod({
        label: `${PREFIX} ${label}`,
        startDate,
        endDate,
        createdBy: `${PREFIX}-kt`,
      });

    it('P1: mo ky luong va chay luong ghi xuong Postgres trong MOT giao dich', async () => {
      const period = await openPeriod('Thang 1/2027', '2027-01-01', '2027-01-31');
      const outcome = await service.runPayroll({ periodId: period.id, runBy: `${PREFIX}-kt` });
      if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');

      expect(outcome.run.sequence).toBe(1);
      expect(outcome.run.policySnapshot).toEqual(POLICY);
      const reread = await repo.findRun(outcome.run.id);
      expect(reread?.policyVersion).toBe(outcome.run.policyVersion);
    });
    /**
     * EXCLUDE constraint la thu duy nhat dung voi HAI NGUOI MO KY CUNG LUC.
     *
     * Hai ky chong nhau lam cung mot chuyen duoc tra cong hai lan — mot loi tien that, va no chi lo
     * ra khi ai do cong tay lai bang luong.
     */
    it('P2: ky luong chong lap bi Postgres tu choi', async () => {
      await openPeriod('Thang 2/2027', '2027-02-01', '2027-02-28');
      await expect(openPeriod('Chong lap', '2027-02-28', '2027-03-31')).rejects.toMatchObject({
        reason: 'PAYROLL_PERIOD_OVERLAPS',
      });
    });

    /**
     * ACCEPTANCE 11 o TANG LUU TRU — mot khoan tru tu dong KHONG GHI DUOC.
     *
     * Bai nay CO Y di vong qua service va ghi thang vao bang. Ba lop giu `GD-12`; hai lop tren
     * (tu vung va calculator) da co bai rieng. Lop nay la lop cuoi, va no la lop duy nhat con dung
     * khi mot script di tru hay mot tay ghi truc tiep vao DB.
     */
    it('ACCEPTANCE 11 (P3): DEDUCTION voi nguon KHONG PHAI thu cong bi CHECK tu choi', async () => {
      const period = await openPeriod('Thang 3/2027', '2027-03-01', '2027-03-31');
      const outcome = await service.runPayroll({ periodId: period.id, runBy: `${PREFIX}-kt` });
      if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');
      const payslipId = mine(outcome.payslips)!.id;

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportPayslipComponent.create({
          data: {
            payslipId,
            kind: 'DEDUCTION',
            source: 'PER_TRIP',
            label: 'Tru tu dong',
            amount: 500_000n,
          },
        }),
      ).rejects.toBeTruthy();

      await expect(
        db.transportPayslipComponent.create({
          data: {
            payslipId,
            kind: 'DEDUCTION',
            source: 'MANUAL_DEDUCTION',
            label: 'Tru khong nguoi ky',
            amount: 500_000n,
          },
        }),
      ).rejects.toBeTruthy();
    });

    /**
     * ACCEPTANCE 12 o TANG LUU TRU — phieu da chot khong sua noi dung duoc.
     *
     * `UPDATE` truc tiep, khong qua service: day la duong ma mot bug tuong lai se di, va trigger la
     * thu duy nhat chan duoc no.
     */
    it('ACCEPTANCE 12 (P4): UPDATE tien tren phieu DA DUYET bi trigger chan', async () => {
      const period = await openPeriod('Thang 4/2027', '2027-04-01', '2027-04-30');
      const outcome = await service.runPayroll({ periodId: period.id, runBy: `${PREFIX}-kt` });
      if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');
      const payslipId = mine(outcome.payslips)!.id;
      await service.approvePayslip(payslipId, `${PREFIX}-gd`);

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
      await expect(
        db.transportPayslip.update({
          where: { id: payslipId },
          data: { grossEarnings: 1n, netAmount: 1n },
        }),
      ).rejects.toThrow(/TransportPayslip_posted_immutable/);

      await expect(
        db.transportPayslipComponent.create({
          data: {
            payslipId,
            kind: 'EARNING',
            source: 'MANUAL_BONUS',
            label: 'Them sau khi duyet',
            amount: 1_000n,
            recordedBy: `${PREFIX}-gd`,
          },
        }),
      ).rejects.toThrow(/TransportPayslip_component_frozen/);
    });

    it('ACCEPTANCE 12 (P5): phieu dao GHI THEM, ban goc giu nguyen moi con so', async () => {
      const period = await openPeriod('Thang 5/2027', '2027-05-01', '2027-05-31');
      const outcome = await service.runPayroll({ periodId: period.id, runBy: `${PREFIX}-kt` });
      if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');
      const payslipId = mine(outcome.payslips)!.id;
      await service.approvePayslip(payslipId, `${PREFIX}-gd`);

      const before = await repo.findPayslip(payslipId);
      const reversal = await service.issueCorrection({
        payslipId,
        kind: 'REVERSAL',
        reason: 'Chay nham ky',
        actor: `${PREFIX}-gd`,
      });

      const after = await repo.findPayslip(payslipId);
      expect(after?.payslip.status).toBe('REVERSED');
      expect(after?.payslip.grossEarnings).toBe(before?.payslip.grossEarnings);
      expect(after?.payslip.netAmount).toBe(before?.payslip.netAmount);
      expect(after?.components).toEqual(before?.components);
      expect(reversal.correctsId).toBe(payslipId);

      await expect(
        service.issueCorrection({
          payslipId,
          kind: 'REVERSAL',
          reason: 'Lan hai',
          actor: `${PREFIX}-gd`,
        }),
      ).rejects.toBeTruthy();
    });

    /** ACCEPTANCE 13 — ca chuoi phieu doc lai duoc bang mot client HOAN TOAN MOI. */
    it('ACCEPTANCE 13 (P6): phieu va cac dong song sot qua mot client moi', async () => {
      const period = await openPeriod('Thang 6/2027', '2027-06-01', '2027-06-30');
      const outcome = await service.runPayroll({ periodId: period.id, runBy: `${PREFIX}-kt` });
      if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');
      const payslipId = mine(outcome.payslips)!.id;

      const freshPrisma = new PrismaService();
      const freshRepo = new PrismaWorkforceRepository(freshPrisma);
      try {
        const detail = await freshRepo.findPayslip(payslipId);
        expect(detail?.payslip.netAmount).toBe(mine(outcome.payslips)!.netAmount);
        expect(detail?.components.length).toBeGreaterThan(0);

        const runs = await freshRepo.listRuns(period.id);
        expect(runs).toHaveLength(1);
        expect(runs[0]?.policySnapshot).toEqual(POLICY);
        expect(runs[0]?.missingInputs).toContain('FUEL_SAVING_UNAVAILABLE');
      } finally {
        await freshPrisma.$disconnect();
      }
    });
    /**
     * DON DEP SAU KHI CHAY, khong chi truoc.
     *
     * Cac tep IT dung chung mot DB va chay song song. Mot tep chi don dep o `beforeAll` se de lai
     * du lieu cua chinh no cho den lan chay sau — va trong khoang do, lan don dep cua mot tep khac
     * co the do vi mot khoa ngoai tro toi no.
     */
    afterAll(async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const db = prisma as unknown as Record<string, any>;
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
      await db.transportDriver.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
      await prisma.$disconnect();
    });
  },
);
