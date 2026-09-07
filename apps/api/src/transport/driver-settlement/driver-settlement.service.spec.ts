import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TRANSPORT_TIME_ZONE } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { DriverSettlementReadService } from './driver-settlement-read.service.js';
import {
  DriverSettlementCoreFacts,
  DriverSettlementFundPort,
  DriverSettlementPayrollFacts,
  type PostReimbursementInput,
  type ReimbursementEntryFacts,
  type SettlementDriverFacts,
} from './driver-settlement.ports.js';
import { DriverSettlementService } from './driver-settlement.service.js';
import { InMemoryDriverSettlementRepository } from './in-memory-driver-settlement.repository.js';
import type { PostedPayslipFact } from './wage-credit.js';

/**
 * `TX-07b` — NGHIEM THU DUONG GHI.
 *
 * Bo bai nay khoa dung nhung dieu #237 liet ke o muc "Runtime cuoi":
 *
 *   · nhieu khoan luong thang, mot lan rut phu NHIEU thang;
 *   · hoan ung nam cung mot lan rut nhung VET RIENG;
 *   · so con lai dung sau khi rut mot phan;
 *   · dao la GHI THEM, khong sua;
 *   · va — quan trong nhat — KHONG DEM HAI LAN giua so quy va lan chi hoan ung.
 */

const DRIVER: SettlementDriverFacts = { id: 'drv-1', fullName: 'Nguyen Van Binh' };

/** So quy GIA — giu mot so du that de bai "khong dem hai lan" co gi de do. */
class FakeFund extends DriverSettlementFundPort {
  balance: number;
  readonly entries: { id: string; signedAmount: number; correlationKey: string }[] = [];
  private sequence = 0;

  constructor(openingBalance: number) {
    super();
    this.balance = openingBalance;
  }

  async balanceOf(): Promise<number> {
    return this.balance;
  }

  async postReimbursement(
    input: PostReimbursementInput,
  ): Promise<{ entry: ReimbursementEntryFacts; replayed: boolean }> {
    const existing = this.entries.find((entry) => entry.correlationKey === input.correlationKey);
    if (existing) {
      return {
        entry: { id: existing.id, signedAmount: existing.signedAmount, businessDate: '2026-10-05' },
        replayed: true,
      };
    }
    this.sequence += 1;
    const entry = {
      id: `fe-${this.sequence}`,
      signedAmount: input.amount,
      correlationKey: input.correlationKey,
    };
    this.entries.push(entry);
    this.balance += input.amount;
    return {
      entry: { id: entry.id, signedAmount: entry.signedAmount, businessDate: input.businessDate },
      replayed: false,
    };
  }

  async reverseReimbursement(entryId: string): Promise<ReimbursementEntryFacts> {
    const target = this.entries.find((entry) => entry.id === entryId);
    if (!target) throw new Error(`Khong tim thay but toan ${entryId}`);
    this.sequence += 1;
    const reversal = {
      id: `fe-${this.sequence}`,
      signedAmount: -target.signedAmount,
      correlationKey: `${target.correlationKey}:reversal`,
    };
    this.entries.push(reversal);
    this.balance -= target.signedAmount;
    return { id: reversal.id, signedAmount: reversal.signedAmount, businessDate: '2026-10-05' };
  }
}

class FakeCore extends DriverSettlementCoreFacts {
  async findDriver(driverId: string): Promise<SettlementDriverFacts | null> {
    return driverId === DRIVER.id ? DRIVER : null;
  }
  async findDriverByAuthUserId(authUserId: string): Promise<SettlementDriverFacts | null> {
    return authUserId === 'user-binh' ? DRIVER : null;
  }
  async listActiveDriverIds(): Promise<readonly string[]> {
    return [DRIVER.id];
  }
}

class FakePayroll extends DriverSettlementPayrollFacts {
  constructor(private readonly facts: readonly PostedPayslipFact[]) {
    super();
  }
  async postedPayslipsOf(): Promise<readonly PostedPayslipFact[]> {
    return this.facts;
  }
}

const payslip = (over: Partial<PostedPayslipFact>): PostedPayslipFact => ({
  payslipId: 'ps-8',
  periodId: 'per-08',
  periodLabel: 'Thang 8/2026',
  periodStartDate: '2026-08-01',
  periodEndDate: '2026-08-31',
  runId: 'run-08',
  kind: 'ORIGINAL',
  status: 'APPROVED',
  netAmount: 10_000_000,
  currencyCode: 'VND',
  ...over,
});

const THREE_MONTHS: readonly PostedPayslipFact[] = [
  payslip({}),
  payslip({
    payslipId: 'ps-9',
    periodId: 'per-09',
    periodLabel: 'Thang 9/2026',
    periodStartDate: '2026-09-01',
    periodEndDate: '2026-09-30',
    runId: 'run-09',
    netAmount: 11_000_000,
  }),
  payslip({
    payslipId: 'ps-10',
    periodId: 'per-10',
    periodLabel: 'Thang 10/2026',
    periodStartDate: '2026-10-01',
    periodEndDate: '2026-10-31',
    runId: 'run-10',
    netAmount: 12_000_000,
  }),
];

interface Harness {
  readonly service: DriverSettlementService;
  readonly read: DriverSettlementReadService;
  readonly fund: FakeFund;
  readonly repository: InMemoryDriverSettlementRepository;
}

const build = (
  facts: readonly PostedPayslipFact[] = THREE_MONTHS,
  openingFundBalance = 0,
  withFund = true,
): Harness => {
  const repository = new InMemoryDriverSettlementRepository();
  const payroll = new FakePayroll(facts);
  const core = new FakeCore();
  const fund = new FakeFund(openingFundBalance);
  const policy = { timeZone: DEFAULT_TRANSPORT_TIME_ZONE };
  const clock = () => new Date('2026-10-05T03:00:00.000Z');

  const read = new DriverSettlementReadService(
    repository,
    payroll,
    core,
    policy,
    withFund ? fund : undefined,
    undefined,
    clock,
  );
  const service = new DriverSettlementService(
    repository,
    read,
    core,
    policy,
    withFund ? fund : undefined,
    undefined,
    clock,
  );
  return { service, read, fund, repository };
};

describe('recordCashout — luong', () => {
  let harness: Harness;
  beforeEach(() => {
    harness = build();
  });

  it('MOT lan rut phu BA thang, va moi thang giu mot dong phan bo rieng', async () => {
    const detail = await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'BANK_TRANSFER',
        lines: [
          { source: 'WAGE', amount: 10_000_000, payslipId: 'ps-8' },
          { source: 'WAGE', amount: 11_000_000, payslipId: 'ps-9' },
          { source: 'WAGE', amount: 12_000_000, payslipId: 'ps-10' },
        ],
      },
      'ke-toan-a',
    );

    expect(detail.allocations).toHaveLength(3);
    expect(detail.allocations.map((row) => row.payslipId)).toEqual(['ps-8', 'ps-9', 'ps-10']);
    expect(detail.allocations.every((row) => row.source === 'WAGE')).toBe(true);

    const snapshot = await harness.read.snapshotOf(DRIVER.id);
    expect(snapshot.balance.wageCredited).toBe(33_000_000);
    expect(snapshot.balance.wageCashedOut).toBe(33_000_000);
    expect(snapshot.balance.wageRemaining).toBe(0);
  });

  it('rut MOT PHAN mot thang de lai dung so con lai', async () => {
    await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'WAGE', amount: 4_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );

    const snapshot = await harness.read.snapshotOf(DRIVER.id);
    const august = snapshot.months.find((month) => month.periodId === 'per-08');
    expect(august).toMatchObject({
      credited: 10_000_000,
      cashedOut: 4_000_000,
      remaining: 6_000_000,
    });
    expect(snapshot.balance.wageRemaining).toBe(29_000_000);
  });

  it('rut qua so con lai cua mot thang bi tu choi voi ma cua chinh cong do', async () => {
    await expect(
      harness.service.recordCashout(
        {
          driverId: DRIVER.id,
          method: 'CASH',
          lines: [{ source: 'WAGE', amount: 10_000_001, payslipId: 'ps-8' }],
        },
        'ke-toan-a',
      ),
    ).rejects.toMatchObject({ reason: 'CASHOUT_PAYSLIP_OVER_ALLOCATED' });
  });

  it('lai xe khong ton tai thi khong ghi duoc gi', async () => {
    await expect(
      harness.service.recordCashout(
        {
          driverId: 'drv-khong-co',
          method: 'CASH',
          lines: [{ source: 'WAGE', amount: 1_000, payslipId: 'ps-8' }],
        },
        'ke-toan-a',
      ),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });
});

describe('recordCashout — hoan ung', () => {
  it('luong va hoan ung cung mot lan rut, HAI vet rieng', async () => {
    const harness = build(THREE_MONTHS, -1_500_000);
    const detail = await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'BANK_TRANSFER',
        lines: [
          { source: 'WAGE', amount: 10_000_000, payslipId: 'ps-8' },
          { source: 'REIMBURSEMENT', amount: 1_500_000, payslipId: null },
        ],
      },
      'ke-toan-a',
    );

    const wage = detail.allocations.filter((row) => row.source === 'WAGE');
    const reimbursement = detail.allocations.filter((row) => row.source === 'REIMBURSEMENT');
    expect(wage).toHaveLength(1);
    expect(wage[0]?.payslipId).toBe('ps-8');
    expect(wage[0]?.driverFundEntryId).toBeNull();
    expect(reimbursement).toHaveLength(1);
    expect(reimbursement[0]?.payslipId).toBeNull();
    expect(reimbursement[0]?.driverFundEntryId).toBe('fe-1');
  });

  /**
   * BAI QUAN TRONG NHAT CUA CA TRANCHE.
   *
   * Sau khi tra 1.500.000 hoan ung: so quy da di tu -1.500.000 ve 0, nen "cong ty con no" phai la
   * 0. Neu ai do tru THEM `reimbursementCashedOut` mot lan nua thi con so ra -1.500.000 — tuc he
   * thong tu tin rang lai xe dang no lai cong ty dung so vua duoc tra.
   */
  it('tra hoan ung KHONG bi dem hai lan — so quy da di len, va lich su khong tru them lan nua', async () => {
    const harness = build(THREE_MONTHS, -1_500_000);
    const before = await harness.read.snapshotOf(DRIVER.id);
    expect(before.balance.reimbursementOutstanding).toBe(1_500_000);
    expect(before.balance.fundStance).toBe('COMPANY_OWES_DRIVER');

    await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'REIMBURSEMENT', amount: 1_500_000, payslipId: null }],
      },
      'ke-toan-a',
    );

    const after = await harness.read.snapshotOf(DRIVER.id);
    expect(harness.fund.balance).toBe(0);
    expect(after.balance.reimbursementOutstanding).toBe(0);
    expect(after.balance.reimbursementCashedOut).toBe(1_500_000);
    expect(after.balance.fundStance).toBe('SETTLED');
    // Va tien luong khong he bi cham vao.
    expect(after.balance.wageRemaining).toBe(33_000_000);
  });

  it('mot lan chi hoan ung ghi DUNG MOT but toan quy', async () => {
    const harness = build(THREE_MONTHS, -1_500_000);
    await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'REIMBURSEMENT', amount: 1_500_000, payslipId: null }],
      },
      'ke-toan-a',
    );
    expect(harness.fund.entries).toHaveLength(1);
  });

  it('hoan ung vuot so cong ty con no bi tu choi', async () => {
    const harness = build(THREE_MONTHS, -1_500_000);
    await expect(
      harness.service.recordCashout(
        {
          driverId: DRIVER.id,
          method: 'CASH',
          lines: [{ source: 'REIMBURSEMENT', amount: 1_500_001, payslipId: null }],
        },
        'ke-toan-a',
      ),
    ).rejects.toMatchObject({ reason: 'CASHOUT_REIMBURSEMENT_EXCEEDS_OUTSTANDING' });
  });

  it('khong co so quy thi hoan ung bi tu choi CO TEN, nhung rut luong van chay', async () => {
    const harness = build(THREE_MONTHS, 0, false);
    await expect(
      harness.service.recordCashout(
        {
          driverId: DRIVER.id,
          method: 'CASH',
          lines: [{ source: 'REIMBURSEMENT', amount: 1_000, payslipId: null }],
        },
        'ke-toan-a',
      ),
    ).rejects.toMatchObject({ reason: 'CASHOUT_REIMBURSEMENT_EXCEEDS_OUTSTANDING' });

    const detail = await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'WAGE', amount: 1_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );
    expect(detail.allocations).toHaveLength(1);
  });
});

describe('recordCashout — gui lai', () => {
  it('cung khoa, cung noi dung: tra ban cu, KHONG ghi them but toan quy nao', async () => {
    const harness = build(THREE_MONTHS, -1_500_000);
    const command = {
      driverId: DRIVER.id,
      method: 'CASH',
      correlationKey: 'driver-cashout:test-1',
      lines: [{ source: 'REIMBURSEMENT' as const, amount: 1_500_000, payslipId: null }],
    };

    const first = await harness.service.recordCashout(command, 'ke-toan-a');
    const second = await harness.service.recordCashout(command, 'ke-toan-a');

    expect(second.cashout.id).toBe(first.cashout.id);
    expect(harness.fund.entries).toHaveLength(1);
    expect(harness.fund.balance).toBe(0);
  });

  it('cung khoa nhung KHAC so tien la loi ben goi, phai nem', async () => {
    const harness = build();
    await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        correlationKey: 'driver-cashout:test-2',
        lines: [{ source: 'WAGE', amount: 1_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );

    await expect(
      harness.service.recordCashout(
        {
          driverId: DRIVER.id,
          method: 'CASH',
          correlationKey: 'driver-cashout:test-2',
          lines: [{ source: 'WAGE', amount: 2_000_000, payslipId: 'ps-8' }],
        },
        'ke-toan-a',
      ),
    ).rejects.toMatchObject({ reason: 'CASHOUT_REPLAY_CONTENT_MISMATCH' });
  });
});

describe('reverseCashout', () => {
  it('dao la GHI THEM: ban goc doi trang thai, so con lai quay ve, va so quy duoc dao theo', async () => {
    const harness = build(THREE_MONTHS, -1_500_000);
    const original = await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [
          { source: 'WAGE', amount: 10_000_000, payslipId: 'ps-8' },
          { source: 'REIMBURSEMENT', amount: 1_500_000, payslipId: null },
        ],
      },
      'ke-toan-a',
    );
    expect(harness.fund.balance).toBe(0);

    const reversal = await harness.service.reverseCashout(
      original.cashout.id,
      'Chuyen khoan bi tra ve',
      'giam-doc',
    );

    expect(reversal.cashout.kind).toBe('REVERSAL');
    expect(reversal.cashout.reversesId).toBe(original.cashout.id);
    expect(reversal.allocations.map((row) => row.amount)).toEqual([-10_000_000, -1_500_000]);

    const stored = await harness.repository.find(original.cashout.id);
    expect(stored?.cashout.status).toBe('REVERSED');
    // Ban goc GIU NGUYEN moi con so cua no — dao khong sua, dao ghi them.
    expect(stored?.allocations.map((row) => row.amount)).toEqual([10_000_000, 1_500_000]);

    const snapshot = await harness.read.snapshotOf(DRIVER.id);
    expect(snapshot.balance.wageRemaining).toBe(33_000_000);
    expect(harness.fund.balance).toBe(-1_500_000);
    expect(snapshot.balance.reimbursementOutstanding).toBe(1_500_000);
    expect(snapshot.balance.reimbursementCashedOut).toBe(0);
  });

  it('khong dao mot lan chi da bi dao', async () => {
    const harness = build();
    const original = await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'WAGE', amount: 1_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );
    await harness.service.reverseCashout(original.cashout.id, 'nham', 'giam-doc');

    await expect(
      harness.service.reverseCashout(original.cashout.id, 'nham lan hai', 'giam-doc'),
    ).rejects.toMatchObject({ reason: 'CASHOUT_ALREADY_REVERSED' });
  });

  it('khong dao mot phieu dao', async () => {
    const harness = build();
    const original = await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'WAGE', amount: 1_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );
    const reversal = await harness.service.reverseCashout(original.cashout.id, 'nham', 'giam-doc');

    await expect(
      harness.service.reverseCashout(reversal.cashout.id, 'dao cua dao', 'giam-doc'),
    ).rejects.toMatchObject({ reason: 'CASHOUT_IS_A_REVERSAL' });
  });

  it('dao khong ly do bi tu choi', async () => {
    const harness = build();
    const original = await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'WAGE', amount: 1_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );
    await expect(
      harness.service.reverseCashout(original.cashout.id, '   ', 'giam-doc'),
    ).rejects.toMatchObject({ reason: 'CASHOUT_REVERSAL_REASON_BLANK' });
  });
});

describe('be mat lai xe', () => {
  it('lai xe thay bon con so, va KHONG thay so du quy tho', async () => {
    const harness = build(THREE_MONTHS, -1_500_000);
    await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'WAGE', amount: 10_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );

    const statement = await harness.read.selfStatement('user-binh');
    expect(statement).toMatchObject({
      driverId: DRIVER.id,
      driverName: 'Nguyen Van Binh',
      wageCredited: 33_000_000,
      wageCashedOut: 10_000_000,
      wageRemaining: 23_000_000,
      reimbursementOutstanding: 1_500_000,
      reimbursementCashedOut: 0,
    });
    expect(statement).not.toHaveProperty('fundBalance');
    expect(statement.months).toHaveLength(3);
  });

  it('tai khoan chua noi voi ho so lai xe bi tu choi CO TEN', async () => {
    const harness = build();
    await expect(harness.read.selfStatement('user-la')).rejects.toMatchObject({
      reason: 'CASHOUT_SELF_DRIVER_NOT_LINKED',
    });
  });
});

describe('canh bao cua so quyet toan (F-08)', () => {
  it('ky da qua 30 ngay ma con du duoc goi ten, khong chan gi', async () => {
    const harness = build();
    const statement = await harness.read.statement(DRIVER.id);
    expect(statement.settlementWindowDays).toBe(30);
    // Hom nay la 2026-10-05: thang 8 (het 31/8) da qua 35 ngay, thang 9 va 10 thi chua.
    expect(statement.unsettled.map((month) => month.periodId)).toEqual(['per-08']);
  });

  it('rut het thang 8 thi ky do khong con bi goi ten', async () => {
    const harness = build();
    await harness.service.recordCashout(
      {
        driverId: DRIVER.id,
        method: 'CASH',
        lines: [{ source: 'WAGE', amount: 10_000_000, payslipId: 'ps-8' }],
      },
      'ke-toan-a',
    );
    const statement = await harness.read.statement(DRIVER.id);
    expect(statement.unsettled).toEqual([]);
  });
});
