import { describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryWorkforceRepository } from './in-memory-workforce.repository.js';
import {
  WorkforceCoreFacts,
  WorkforceCostingFacts,
  WorkforceFuelFacts,
  type DriverPeriodWork,
  type WorkforceDriverFacts,
} from './workforce.ports.js';
import { WorkforceService } from './workforce.service.js';
import type { PayrollPolicySnapshot } from './workforce.types.js';

const POLICY: PayrollPolicySnapshot = {
  baseSalaryVnd: 6_000_000,
  perTripVnd: 250_000,
  perKmVnd: 1_200,
  fuelSavingBonusVndPerLiter: 8_000,
};

/** Cong gia lap — GHI LAI cai gi duoc hoi, khong phai mot mock tu dong. */
class StubCore extends WorkforceCoreFacts {
  constructor(
    private readonly drivers: string[] = ['drv-1'],
    private readonly work: DriverPeriodWork[] = [
      { driverId: 'drv-1', tripCount: 8, distanceKm: 2_400 },
    ],
  ) {
    super();
  }
  async listActiveDriverIds(): Promise<string[]> {
    return this.drivers;
  }
  async workByDriver(): Promise<readonly DriverPeriodWork[]> {
    return this.work;
  }
  /** Chay luong khong bao gio hoi "ai dang dang nhap" — cong nay chi phuc vu be mat lai xe. */
  async findDriverByAuthUserId(): Promise<WorkforceDriverFacts | null> {
    return null;
  }
}

class StubCosting extends WorkforceCostingFacts {
  constructor(private readonly balance = 0) {
    super();
  }
  async fundBalanceOf(): Promise<number> {
    return this.balance;
  }
}

class StubFuel extends WorkforceFuelFacts {
  constructor(private readonly liters = new Map<string, number>()) {
    super();
  }
  async litersSavedByDriver(): Promise<ReadonlyMap<string, number>> {
    return this.liters;
  }
}

const build = (options: { costing?: WorkforceCostingFacts; fuel?: WorkforceFuelFacts } = {}) => {
  const repository = new InMemoryWorkforceRepository();
  const service = new WorkforceService(
    repository,
    new StubCore(),
    POLICY,
    options.costing,
    options.fuel,
  );
  return { repository, service };
};

const openPeriod = async (service: WorkforceService) =>
  service.openPeriod({
    label: 'Thang 8/2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    createdBy: 'ke-toan',
  });

describe('ky luong', () => {
  it('ky chong lap bi tu choi — hai ky chong nhau tra cong mot chuyen hai lan', async () => {
    const { service } = build();
    await openPeriod(service);

    await expect(
      service.openPeriod({
        label: 'Chong lap',
        startDate: '2026-08-31',
        endDate: '2026-09-30',
        createdBy: 'ke-toan',
      }),
    ).rejects.toMatchObject({ reason: 'PAYROLL_PERIOD_OVERLAPS' });
  });

  it('ky dao nguoc bi tu choi ngay o tang mien', async () => {
    const { service } = build();
    await expect(
      service.openPeriod({
        label: 'Nguoc',
        startDate: '2026-08-31',
        endDate: '2026-08-01',
        createdBy: 'ke-toan',
      }),
    ).rejects.toMatchObject({ reason: 'PAYROLL_PERIOD_RANGE_INVALID' });
  });

  it('ky da dong khong chay luong duoc nua', async () => {
    const { service } = build();
    const period = await openPeriod(service);
    await service.closePeriod(period.id, 'giam-doc');

    await expect(
      service.runPayroll({ periodId: period.id, runBy: 'ke-toan' }),
    ).rejects.toMatchObject({ reason: 'PAYROLL_PERIOD_CLOSED' });
  });
});

describe('chay luong — ACCEPTANCE 10 va 11 qua duong service', () => {
  it('ACCEPTANCE 10: anh chup chinh sach di theo lan chay, khong doc lai luc tinh', async () => {
    const { service } = build({ costing: new StubCosting(0), fuel: new StubFuel() });
    const period = await openPeriod(service);

    const outcome = await service.runPayroll({ periodId: period.id, runBy: 'ke-toan' });
    if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');

    expect(outcome.run.policySnapshot).toEqual(POLICY);
    expect(outcome.run.policyVersion).toHaveLength(64);
    expect(outcome.run.sequence).toBe(1);
    expect(outcome.payslips).toHaveLength(1);
    expect(outcome.payslips[0]?.status).toBe('DRAFT');
    expect(outcome.payslips[0]?.grossEarnings).toBe(6_000_000 + 8 * 250_000 + 2_400 * 1_200);
  });

  /**
   * ACCEPTANCE 11 qua duong THAT: so du am di qua ca cong costing, service va kho, va van khong
   * sinh mot khoan tru nao. Bai o `payroll-calculator.spec.ts` chung minh ham thuan tuy; bai nay
   * chung minh khong co lop nao O TREN no them mot khoan tru vao.
   */
  it('ACCEPTANCE 11: so du quy AM di het duong service ma khong thanh khoan tru', async () => {
    const { service, repository } = build({ costing: new StubCosting(-4_500_000) });
    const period = await openPeriod(service);
    const outcome = await service.runPayroll({ periodId: period.id, runBy: 'ke-toan' });
    if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');

    const detail = await repository.findPayslip(outcome.payslips[0]!.id);
    expect(detail?.payslip.totalDeductions).toBe(0);
    expect(detail?.payslip.driverFundBalanceSnapshot).toBe(-4_500_000);
    expect(detail?.components.filter((component) => component.kind === 'DEDUCTION')).toEqual([]);
  });

  /**
   * DAU VAO VANG MAT phai doc duoc tren lan chay.
   *
   * Khong bat `transport-fuel` thi thuong tiet kiem dau khong tinh duoc — va lan chay noi ro dieu
   * do thay vi de lai mot so khong khong ai giai thich.
   */
  it('thieu nguon nhien lieu -> FUEL_SAVING_UNAVAILABLE trong missingInputs', async () => {
    const { service } = build({ costing: new StubCosting(0) });
    const period = await openPeriod(service);
    const outcome = await service.runPayroll({ periodId: period.id, runBy: 'ke-toan' });
    if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');

    expect(outcome.run.missingInputs).toContain('FUEL_SAVING_UNAVAILABLE');
    expect(outcome.run.missingInputs).not.toContain('DRIVER_FUND_UNAVAILABLE');
  });

  it('thieu costing -> DRIVER_FUND_UNAVAILABLE va so du la null, khong phai 0', async () => {
    const { service } = build({ fuel: new StubFuel() });
    const period = await openPeriod(service);
    const outcome = await service.runPayroll({ periodId: period.id, runBy: 'ke-toan' });
    if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');

    expect(outcome.run.missingInputs).toContain('DRIVER_FUND_UNAVAILABLE');
    expect(outcome.payslips[0]?.driverFundBalanceSnapshot).toBeNull();
  });

  it('khoan tru thu cong khong nguoi ky bi chan truoc khi cham vao kho', async () => {
    const { service } = build({ costing: new StubCosting(0) });
    const period = await openPeriod(service);

    await expect(
      service.runPayroll({
        periodId: period.id,
        runBy: 'ke-toan',
        manualComponents: {
          'drv-1': [{ kind: 'DEDUCTION', label: 'Tru', amount: 100_000, recordedBy: '  ' }],
        },
      }),
    ).rejects.toMatchObject({ reason: 'PAYSLIP_MANUAL_COMPONENT_UNSIGNED' });
  });
});

describe('vong doi phieu va SUA — ACCEPTANCE 12', () => {
  const approvedPayslip = async () => {
    const built = build({ costing: new StubCosting(0), fuel: new StubFuel() });
    const period = await openPeriod(built.service);
    const outcome = await built.service.runPayroll({ periodId: period.id, runBy: 'ke-toan' });
    if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');
    const payslip = outcome.payslips[0]!;
    await built.service.approvePayslip(payslip.id, 'giam-doc');
    return { ...built, payslipId: payslip.id };
  };

  it('phieu DRAFT duyet duoc, va ghi lai nguoi duyet', async () => {
    const { repository, payslipId } = await approvedPayslip();
    const detail = await repository.findPayslip(payslipId);

    expect(detail?.payslip.status).toBe('APPROVED');
    expect(detail?.payslip.approvedBy).toBe('giam-doc');
  });

  it('duyet lan hai bi tu choi — ALREADY_IN_STATE, khong phai mot canh khong ton tai', async () => {
    const { service, payslipId } = await approvedPayslip();
    await expect(service.approvePayslip(payslipId, 'giam-doc')).rejects.toBeInstanceOf(
      TransportDomainError,
    );
  });

  it('khong co duong nao dua mot phieu da duyet ve DRAFT', async () => {
    const { service, payslipId } = await approvedPayslip();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

    expect(methods).not.toContain('reopenPayslip');
    expect(methods).not.toContain('updatePayslip');
    await expect(service.payPayslip(payslipId, 'ke-toan')).resolves.toMatchObject({
      status: 'PAID',
    });
  });

  /**
   * ACCEPTANCE 12 — SUA KHONG GHI DE.
   *
   * Bai nay chup ban goc TRUOC khi phat phieu bu, roi doi chieu tung truong SAU do. Khong mot con
   * so nao duoc phep doi; thu duy nhat co the doi la `status` (khi bi dao), va bai duoi kiem rieng.
   */
  it('ACCEPTANCE 12: phieu bo sung KHONG sua mot truong nao cua ban goc', async () => {
    const { service, repository, payslipId } = await approvedPayslip();
    const before = await repository.findPayslip(payslipId);

    const supplement = await service.issueCorrection({
      payslipId,
      kind: 'SUPPLEMENTAL',
      reason: 'Bu thieu khoan chuyen ngay 31/08',
      actor: 'giam-doc',
      components: [
        { kind: 'EARNING', label: 'Bu chuyen 31/08', amount: 250_000, recordedBy: 'giam-doc' },
      ],
    });

    const after = await repository.findPayslip(payslipId);
    expect(after?.payslip).toEqual(before?.payslip);
    expect(after?.components).toEqual(before?.components);

    expect(supplement.kind).toBe('SUPPLEMENTAL');
    expect(supplement.correctsId).toBe(payslipId);
    expect(supplement.netAmount).toBe(250_000);
    expect(supplement.status).toBe('DRAFT');
  });

  it('ACCEPTANCE 12 (bis): phieu dao giu nguyen MOI con so cua ban goc, chi doi trang thai', async () => {
    const { service, repository, payslipId } = await approvedPayslip();
    const before = await repository.findPayslip(payslipId);

    const reversal = await service.issueCorrection({
      payslipId,
      kind: 'REVERSAL',
      reason: 'Chay nham ky',
      actor: 'giam-doc',
    });

    const after = await repository.findPayslip(payslipId);
    expect(after?.payslip.status).toBe('REVERSED');
    expect(after?.payslip.grossEarnings).toBe(before?.payslip.grossEarnings);
    expect(after?.payslip.netAmount).toBe(before?.payslip.netAmount);
    expect(after?.components).toEqual(before?.components);

    expect(reversal.netAmount).toBe(-(before?.payslip.netAmount ?? 0));
  });

  /**
   * B4 — MOT PHIEU DAO KHONG DUOC LA MOT BAN NHAP.
   *
   * Ban goc chuyen sang `REVERSED` NGAY trong cung giao dich. Neu ban dao ra doi o `DRAFT` thi
   * giua hai thoi diem — va co the mai mai, neu khong ai bam duyet — ton tai mot trang thai doc
   * ra duoc tu ben ngoai la: "phieu nay da bi dao", trong khi CHUNG TU dao no chua duoc ai chot.
   * Ke toan doi chieu luc do khong tra loi duoc "dao bang cai gi".
   *
   * NGU NGHIA DA CHON: phat mot phieu dao CHINH LA hanh dong chot. Ban dao khong co mot con so
   * nao do nguoi nhap — no la phep phu dinh tat dinh cua ban goc — nen khong co gi de duyet o
   * mot buoc thu hai. Nguoi ky va khoanh khac duoc ghi ngay tren no.
   *
   * `SUPPLEMENTAL` di duong NGUOC LAI, va bai ke tiep giu dieu do: so tien cua mot phieu bo sung
   * do NGUOI nhap, nen no phai qua mot lan duyet — va ban goc KHONG doi trang thai.
   */
  it('B4: phieu dao ra doi DA CHOT, mang ten nguoi ky va khoanh khac', async () => {
    const { service, repository, payslipId } = await approvedPayslip();

    const reversal = await service.issueCorrection({
      payslipId,
      kind: 'REVERSAL',
      reason: 'Chay nham ky',
      actor: 'giam-doc',
    });

    expect(reversal.status).toBe('APPROVED');
    expect(reversal.approvedBy).toBe('giam-doc');
    expect(reversal.approvedAt).not.toBeNull();
    expect((await repository.findPayslip(payslipId))?.payslip.status).toBe('REVERSED');
  });

  it('B4: phieu BO SUNG van la ban nhap, va ban goc GIU NGUYEN trang thai', async () => {
    const { service, repository, payslipId } = await approvedPayslip();

    const supplement = await service.issueCorrection({
      payslipId,
      kind: 'SUPPLEMENTAL',
      reason: 'Bu thieu khoan chuyen ngay 31/08',
      actor: 'giam-doc',
      components: [
        { kind: 'EARNING', label: 'Bu chuyen 31/08', amount: 250_000, recordedBy: 'giam-doc' },
      ],
    });

    expect(supplement.status).toBe('DRAFT');
    expect(supplement.approvedAt).toBeNull();
    expect((await repository.findPayslip(payslipId))?.payslip.status).toBe('APPROVED');
  });

  /** Mot phieu DA TRA cung dao duoc — canh `PAID -> REVERSED` cua may trang thai. */
  it('B4: phieu DA TRA dao duoc, va moc da tra tren ban goc khong bi xoa', async () => {
    const { service, repository, payslipId } = await approvedPayslip();
    await service.payPayslip(payslipId, 'ke-toan');
    const before = await repository.findPayslip(payslipId);

    const reversal = await service.issueCorrection({
      payslipId,
      kind: 'REVERSAL',
      reason: 'Tra nham lai xe',
      actor: 'giam-doc',
    });

    const after = await repository.findPayslip(payslipId);
    expect(reversal.status).toBe('APPROVED');
    expect(after?.payslip.status).toBe('REVERSED');
    expect(after?.payslip.paidAt).toBe(before?.payslip.paidAt);
    expect(after?.payslip.paidBy).toBe('ke-toan');
    expect(after?.payslip.approvedBy).toBe(before?.payslip.approvedBy);
  });

  it('mot ban goc chi co MOT phieu dao', async () => {
    const { service, payslipId } = await approvedPayslip();
    await service.issueCorrection({
      payslipId,
      kind: 'REVERSAL',
      reason: 'Lan mot',
      actor: 'giam-doc',
    });

    await expect(
      service.issueCorrection({
        payslipId,
        kind: 'REVERSAL',
        reason: 'Lan hai',
        actor: 'giam-doc',
      }),
    ).rejects.toMatchObject({ reason: 'PAYSLIP_NOT_CORRECTABLE' });
  });

  it('phieu con DRAFT thi khong phat phieu bu — sua thang la duong dung', async () => {
    const built = build({ costing: new StubCosting(0), fuel: new StubFuel() });
    const period = await openPeriod(built.service);
    const outcome = await built.service.runPayroll({ periodId: period.id, runBy: 'ke-toan' });
    if (outcome.kind !== 'RECORDED') throw new Error('mong doi RECORDED');

    await expect(
      built.service.issueCorrection({
        payslipId: outcome.payslips[0]!.id,
        kind: 'SUPPLEMENTAL',
        reason: 'Chua chot',
        actor: 'giam-doc',
        components: [{ kind: 'EARNING', label: 'X', amount: 1_000, recordedBy: 'giam-doc' }],
      }),
    ).rejects.toMatchObject({ reason: 'PAYSLIP_NOT_CORRECTABLE' });
  });
});
