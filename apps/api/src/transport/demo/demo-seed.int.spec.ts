import { loadTenantConfig, resetTenantCache } from '@netviet/tenant';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { calculatePayslip } from '../workforce/payroll-calculator.js';
import { WorkforceCoreFactsAdapter } from '../workforce/workforce.ports.js';
import { loadDemoMonthDataset } from './demo-dataset.js';
import { DEMO_RESET_ENV, DEMO_RESET_TOKEN } from './demo-guard.js';
import { buildDemoPlan } from './demo-plan.js';
import {
  backfillDemoDriverLogins,
  resetTransportDemoData,
  seedTransportDemoMonth,
} from './demo-seed.js';

/**
 * THANG VAN HANH MAU tren Postgres THAT.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI NAY CO CONG RIENG (`RUN_TRANSPORT_DEMO_IT`) THAY VI DI CHUNG `RUN_PRISMA_IT`.
 *
 * No PHA HUY: `resetTransportDemoData()` xoa sach moi bang van tai. Cac bai IT van tai khac dung
 * fixture co tien to (`IT-TRANSPORT-*`) va don dep phan cua chinh chung, va job `integration` chay
 * cac tep SONG SONG — nen mot bai xoa sach chay cung luc se cuop mat fixture cua ba tep ben canh
 * va gay ra mot chuoi loi khong lien quan gi den nguyen nhan.
 *
 * Nen no chay o mot BUOC RIENG, sau cung, tuan tu. Cong rieng khong phai de no de xanh hon — no
 * VAN chay trong CI; cong rieng la de no duoc chay MOT MINH.
 *
 * ---------------------------------------------------------------------------
 * BAI NAY DOI CHIEU CON SO DAU BANG, khong chi dem hang.
 *
 * `#196` §5 doi hoi "khang dinh tu dong doi chieu cac con so dau bang". Dem so hang chi chung minh
 * lenh `INSERT` da chay; doi chieu chung minh cac con so NHAT QUAN VOI NHAU — va do moi la thu mot
 * ke toan nhin vao.
 */

const RUN = process.env.RUN_TRANSPORT_DEMO_IT === '1';
const ANCHOR = '2026-09-05';
const HASH_MARKER = 'bam-gia-cho-bai-test:';

describe.runIf(RUN)('Gieo thang van hanh mau (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const resetEnv = { [DEMO_RESET_ENV]: DEMO_RESET_TOKEN };

  const seed = () =>
    seedTransportDemoMonth(prisma, {
      anchor: ANCHOR,
      driverPassword: 'mat-khau-chi-dung-trong-bai-test',
      hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
    });

  beforeAll(async () => {
    process.env.TENANT = 'transport-preview';
    delete process.env.TENANT_DIR;
    resetTenantCache();

    await resetTransportDemoData(prisma, resetEnv);
    await seed();
  }, 300_000);

  afterAll(async () => {
    await resetTransportDemoData(prisma, resetEnv);
    await prisma.$disconnect();
    delete process.env.TENANT;
    resetTenantCache();
  }, 300_000);

  it('gieo du khoi luong ma #90 doi hoi', async () => {
    const [vehicles, drivers, customers, suppliers, partners, trips] = await Promise.all([
      prisma.transportVehicle.count(),
      prisma.transportDriver.count(),
      prisma.transportCustomer.count(),
      prisma.transportFuelSupplier.count(),
      prisma.transportPartner.count(),
      prisma.transportTrip.count(),
    ]);

    expect(vehicles).toBe(10);
    expect(drivers).toBeGreaterThanOrEqual(10);
    expect(customers).toBeGreaterThanOrEqual(4);
    expect(suppliers).toBe(3);
    expect(partners).toBeGreaterThanOrEqual(2);
    expect(trips).toBeGreaterThanOrEqual(30);
    expect(trips).toBeLessThanOrEqual(60);
  });

  /**
   * DOANH THU GHI NHAN = TONG GIA CUOC CUA CAC CHUYEN DA GHI NHAN.
   *
   * Hai con so nay den tu hai bang khac nhau (`TransportTrip.freightAmount` va
   * `TransportSettlementDocument.signedAmount`) va duoc ghi o hai buoc khac nhau. Chung lech nhau
   * la dau hieu mot chuyen bi bo sot hoac mot chung tu bi ghi hai lan — dung cai ma bang dieu
   * khien cua ban demo se hien sai.
   */
  it('cong no phai thu khop tong gia cuoc cua cac chuyen sinh ra no', async () => {
    const documents = await prisma.transportSettlementDocument.findMany({
      where: { direction: 'RECEIVABLE', flow: 'CUSTOMER_FREIGHT' },
      select: { signedAmount: true, tripId: true },
    });
    const tripIds = documents.map((document) => document.tripId as string);
    const trips = await prisma.transportTrip.findMany({
      where: { id: { in: tripIds } },
      select: { freightAmount: true },
    });

    const receivable = documents.reduce((total, row) => total + row.signedAmount, 0n);
    const freight = trips.reduce((total, row) => total + (row.freightAmount ?? 0n), 0n);

    expect(receivable).toBe(freight);
    expect(receivable).toBeGreaterThan(0n);
    /** Mot chung tu MOT chuyen: khong chuyen nao duoc ghi nhan doanh thu hai lan. */
    expect(new Set(tripIds).size).toBe(documents.length);
  });

  it('so du quy cua tung lai xe bang tong so du co dau cua chinh so quy do', async () => {
    const drivers = await prisma.transportDriver.findMany({ select: { id: true, fullName: true } });
    for (const driver of drivers) {
      const [aggregate, payslip] = await Promise.all([
        prisma.transportDriverFundEntry.aggregate({
          where: { account: { driverId: driver.id } },
          _sum: { signedAmount: true },
        }),
        prisma.transportPayslip.findFirst({
          where: { driverId: driver.id },
          select: { driverFundBalanceSnapshot: true },
        }),
      ]);
      const balance = aggregate._sum.signedAmount ?? 0n;
      expect(payslip?.driverFundBalanceSnapshot ?? 0n, driver.fullName).toBe(balance);
    }
  });

  /**
   * MOI DONG BANG KE PHAI CO MOT KET CUC — khop, hoac mot chenh lech co ten.
   *
   * Mot dong nam lai o `UNMATCHED` sau khi da chay doi soat la mot dong KHONG AI NHIN THAY: no
   * khong len bao cao khop, cung khong len hang cho xu ly. Do la kieu that thoat lang le nhat ma
   * mot ky doi soat co the co.
   */
  it('khong dong bang ke nao bi bo lai o trang thai chua doi soat', async () => {
    const lines = await prisma.transportFuelStatementLine.count();
    const pending = await prisma.transportFuelStatementLine.count({
      where: { reconciliationStatus: 'UNMATCHED' },
    });
    expect(lines).toBeGreaterThan(0);
    expect(pending).toBe(0);
  });

  it('sinh du ca ba loai chenh lech ma ke toan phai xu ly', async () => {
    const rows = await prisma.transportFuelDiscrepancy.groupBy({
      by: ['kind'],
      _count: { _all: true },
    });
    const kinds = new Set(rows.map((row) => row.kind));
    expect(kinds).toContain('OUT_OF_TOLERANCE');
    expect(kinds).toContain('AMBIGUOUS_CANDIDATES');
    expect(kinds).toContain('STATEMENT_LINE_ONLY');
  });

  /**
   * PHIEU LUONG DA GIEO PHAI BANG PHIEU MA SAN PHAM TU TINH RA.
   *
   * Day la khang dinh dat gia nhat cua tep nay. No khong doc lai con so da gieo — no chay LAI phep
   * tong hop THAT (`WorkforceCoreFactsAdapter.workByDriver`, dung ham ma `runPayroll` goi) tren
   * chinh du lieu vua gieo, roi dua qua `calculatePayslip`. Neu bo gieo va san pham bat dong y —
   * vd bo gieo dem ca chuyen `IN_TRANSIT`, hay bo qua mot ban phan cong — bai nay do.
   *
   * Khong co no, "so lieu mau" chi la mot bo so trong NHU that.
   */
  it('phieu luong da gieo khop voi phep tong hop cua chinh san pham', async () => {
    const facts = new WorkforceCoreFactsAdapter(
      new PrismaFleetRepository(prisma),
      new PrismaTripRepository(prisma),
    );
    const period = await prisma.transportPayrollPeriod.findFirstOrThrow();
    const work = await facts.workByDriver(period.startDate, period.endDate);
    const workByDriver = new Map(work.map((row) => [row.driverId, row]));

    const policy = loadTenantConfig().policies.transportPayroll;
    const snapshot = {
      baseSalaryVnd: policy?.baseSalaryVnd ?? 0,
      perTripVnd: policy?.perTripVnd ?? 0,
      perKmVnd: policy?.perKmVnd ?? 0,
      fuelSavingBonusVndPerLiter: policy?.fuelSavingBonusVndPerLiter ?? 0,
    };

    const payslips = await prisma.transportPayslip.findMany({
      include: { components: true, driver: { select: { fullName: true } } },
    });
    expect(payslips.length).toBeGreaterThanOrEqual(10);

    for (const payslip of payslips) {
      const row = workByDriver.get(payslip.driverId) ?? { tripCount: 0, distanceKm: 0 };
      const manual = payslip.components
        .filter(
          (component) =>
            component.source === 'MANUAL_BONUS' || component.source === 'MANUAL_DEDUCTION',
        )
        .map((component) => ({
          kind: component.kind,
          label: component.label,
          amount: Number(component.amount),
          recordedBy: component.recordedBy ?? 'demo-seed',
          note: component.note,
        }));

      const expected = calculatePayslip(snapshot, {
        driverId: payslip.driverId,
        tripCount: row.tripCount,
        distanceKm: row.distanceKm,
        fuelLitersSaved: null,
        driverFundBalance: Number(payslip.driverFundBalanceSnapshot ?? 0n),
        manualComponents: manual,
      });

      const who = payslip.driver.fullName;
      expect(payslip.tripCount, who).toBe(expected.tripCount);
      expect(payslip.distanceKm, who).toBe(expected.distanceKm);
      expect(Number(payslip.grossEarnings), who).toBe(expected.grossEarnings);
      expect(Number(payslip.totalDeductions), who).toBe(expected.totalDeductions);
      expect(Number(payslip.netAmount), who).toBe(expected.netAmount);
    }
  });

  /**
   * `GD-12` — KHONG mot khoan tru nao duoc sinh TU DONG.
   *
   * Bo gieo la mot duong ghi khong di qua `WorkforceService`, nen no la cho ma mot ban gieo co the
   * lang le tao ra mot khoan tru ma chinh san pham tu choi tao. Khoa lai o day.
   */
  it('moi khoan tru tren phieu luong deu la khoan NHAP TAY', async () => {
    const deductions = await prisma.transportPayslipComponent.findMany({
      where: { kind: 'DEDUCTION' },
      select: { source: true, recordedBy: true },
    });
    for (const deduction of deductions) {
      expect(deduction.source).toBe('MANUAL_DEDUCTION');
      expect(deduction.recordedBy).not.toBeNull();
    }
  });

  it('moi lai xe deu co tai khoan dang nhap duoc noi vao ho so', async () => {
    const dataset = loadDemoMonthDataset();
    const drivers = await prisma.transportDriver.findMany({ select: { authUserId: true } });
    expect(drivers.every((driver) => driver.authUserId !== null)).toBe(true);

    const users = await prisma.user.findMany({
      where: { username: { in: dataset.drivers.map((driver) => driver.login) } },
      select: { role: true },
    });
    expect(users.length).toBe(dataset.drivers.length);
    /** `GD-22` — cau noi vai: LAI XE anh xa sang `SALE` o tang xac thuc nen tang. */
    for (const user of users) expect(user.role).toBe('SALE');
  });

  /**
   * "GIEO TRUOC, CAU HINH MAT KHAU SAU" PHAI LA MOT TRINH TU CHAY DUOC.
   *
   * Lenh gieo tu bo qua khi DB da co chuyen. Neu tai khoan lai xe CHI duoc tao trong lan gieo dau,
   * thi mot stack len truoc khi co `TRANSPORT_DEMO_DRIVER_PASSWORD` se khoa be mat lai xe lai VINH
   * VIEN — tru khi xoa sach ca thang du lieu di lam lai. Bai nay dung mot ngo cut im lang.
   */
  it('tao bu duoc tai khoan cho lai xe khi mat khau den sau lan gieo', async () => {
    const dataset = loadDemoMonthDataset();
    const target = await prisma.transportDriver.findFirstOrThrow({
      where: { phone: dataset.drivers[0]?.phone },
    });

    // Dung lai trang thai "da gieo nhung chua co tai khoan".
    await prisma.transportDriver.update({ where: { id: target.id }, data: { authUserId: null } });
    await prisma.user.delete({ where: { id: target.authUserId as string } });
    expect(await prisma.transportDriver.count({ where: { authUserId: null } })).toBe(1);

    const created = await backfillDemoDriverLogins(prisma, {
      driverPassword: 'mat-khau-chi-dung-trong-bai-test',
      hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
    });

    expect(created).toBe(1);
    expect(await prisma.transportDriver.count({ where: { authUserId: null } })).toBe(0);

    /** Chay lai khong tao them gi — lai xe da co tai khoan thi khong bi dung toi. */
    expect(
      await backfillDemoDriverLogins(prisma, {
        driverPassword: 'mat-khau-chi-dung-trong-bai-test',
        hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
      }),
    ).toBe(0);
  });

  /** Khong co mat khau thi khong tao gi, va KHONG nem — buoc deploy phai di tiep duoc. */
  it('thieu mat khau thi khong tao tai khoan nao va cung khong nem', async () => {
    expect(await backfillDemoDriverLogins(prisma, {})).toBe(0);
  });

  it('gieo lan hai KHONG ghi de len du lieu da co', async () => {
    const before = await prisma.transportTrip.count();
    const again = await seed();
    expect(again.skipped).toBe(true);
    expect(await prisma.transportTrip.count()).toBe(before);
  });

  /**
   * XOA ROI GIEO LAI PHAI TRA VE DUNG TRANG THAI DO — do la dinh nghia cua "lenh reset an toan".
   *
   * So sanh bang mot DAU VAN NGHIEP VU (ma chuyen + ngay + tien + so du quy + luong) chu khong
   * bang id: cuid va dau thoi gian doi moi lan gieo theo thiet ke, va so sanh chung se lam bai nay
   * do vi mot ly do khong ai quan tam.
   */
  it('xoa roi gieo lai voi cung moc ngay cho ra dung trang thai cu', async () => {
    const fingerprint = async (): Promise<string> => {
      const [trips, funds, payslips, documents] = await Promise.all([
        prisma.transportTrip.findMany({
          select: { code: true, businessDate: true, status: true, freightAmount: true },
          orderBy: { code: 'asc' },
        }),
        prisma.transportDriverFundEntry.groupBy({
          by: ['correlationKey'],
          _sum: { signedAmount: true },
          orderBy: { correlationKey: 'asc' },
        }),
        prisma.transportPayslip.findMany({
          select: { netAmount: true, tripCount: true, distanceKm: true },
          orderBy: [{ netAmount: 'asc' }, { tripCount: 'asc' }],
        }),
        prisma.transportSettlementDocument.findMany({
          select: { flow: true, direction: true, signedAmount: true, businessDate: true },
          orderBy: [{ businessDate: 'asc' }, { signedAmount: 'asc' }],
        }),
      ]);
      return JSON.stringify({ trips, funds, payslips, documents }, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      );
    };

    const before = await fingerprint();

    const deleted = await resetTransportDemoData(prisma, resetEnv);
    expect(deleted['transportTrip']).toBeGreaterThan(0);
    expect(await prisma.transportTrip.count()).toBe(0);
    expect(await prisma.transportVehicle.count()).toBe(0);

    const reseeded = await seed();
    expect(reseeded.skipped).toBe(false);
    expect(await fingerprint()).toBe(before);
  }, 300_000);

  /**
   * MOC NGAY DOI THI DU LIEU DOI THEO — bang chung rang bo du lieu KHONG bi dong cung vao lich.
   *
   * Do la nua con lai cua "tat dinh": lap lai duoc voi cung moc, nhung khong het han sang thang
   * sau. Kiem tren KE HOACH chu khong gieo lai lan nua — mot lan gieo them chi de doc lai ngay
   * thang la mot phut CI khong mua duoc gi.
   */
  it('bo du lieu khong bi dong cung vao lich', () => {
    const dataset = loadDemoMonthDataset();
    const fuel = loadTenantConfig().policies.transportFuel;
    const context = {
      consumptionNorms: fuel?.consumption?.normsByVehicleClass ?? {},
      consumptionTolerancePercent: fuel?.consumption?.tolerancePercent ?? 0,
    };
    const here = buildDemoPlan(dataset, { anchor: ANCHOR, ...context });
    const later = buildDemoPlan(dataset, { anchor: '2027-03-18', ...context });

    expect(later.trips.map((trip) => trip.code)).toEqual(here.trips.map((trip) => trip.code));
    expect(later.trips[0]?.businessDate).not.toBe(here.trips[0]?.businessDate);
  });
});
