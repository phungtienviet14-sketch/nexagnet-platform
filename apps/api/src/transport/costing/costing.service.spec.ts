import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { CostingReadService } from './costing-read.service.js';
import type { TransportCostingPolicy } from './costing-policy.js';
import { CostingService } from './costing.service.js';
import { FundPeriodService } from './fund-period.service.js';
import { InMemoryCostingRepository } from './in-memory-costing.repository.js';
import {
  TransportCoreFacts,
  type DriverFacts,
  type TripFacts,
} from './transport-core-facts.port.js';

/**
 * `TX-03` tren kho TRONG BO NHO — bo nay chung minh QUY TAC NGHIEP VU.
 *
 * Nhung gi no KHONG chung minh duoc, va co y khong co gang: giao dich, unique tren khoa chong ghi
 * trung, `CHECK` dau, EXCLUDE chong lap ky. Bon thu do song o ranh gioi voi Postgres, va mot kho
 * trong bo nho theo dinh nghia khong co ranh gioi do — no se xanh ca bon du khong cai nao ton tai.
 * Bang chung cho chung nam o `transport-costing.int.spec.ts`, chay tren Postgres 16 that o CI.
 */

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const COSTING_POLICY: TransportCostingPolicy = {
  expenseCategories: [],
  advanceApprovalRequired: false,
};

class FakeCoreFacts extends TransportCoreFacts {
  readonly trips = new Map<string, TripFacts>();
  readonly drivers = new Map<string, DriverFacts>();
  readonly bindings = new Map<string, string>();

  async findTrip(tripId: string): Promise<TripFacts | null> {
    return this.trips.get(tripId) ?? null;
  }

  async findDriver(driverId: string): Promise<DriverFacts | null> {
    return this.drivers.get(driverId) ?? null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<DriverFacts | null> {
    const driverId = this.bindings.get(authUserId);
    return driverId ? (this.drivers.get(driverId) ?? null) : null;
  }
}

const CLOCK = (): Date => new Date('2026-08-15T03:00:00.000Z');

interface Harness {
  readonly ledger: InMemoryCostingRepository;
  readonly core: FakeCoreFacts;
  readonly costing: CostingService;
  readonly read: CostingReadService;
  readonly periods: FundPeriodService;
}

function harness(): Harness {
  const ledger = new InMemoryCostingRepository();
  const core = new FakeCoreFacts();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());

  core.drivers.set('drv-1', { id: 'drv-1', fullName: 'Lai xe A' });
  core.drivers.set('drv-2', { id: 'drv-2', fullName: 'Lai xe B' });
  core.bindings.set('user-1', 'drv-1');
  core.trips.set('trip-a', { id: 'trip-a', code: 'CH-A', kind: 'OWN_DIRECT', status: 'IN_TRANSIT' });
  core.trips.set('trip-done', {
    id: 'trip-done',
    code: 'CH-DONE',
    kind: 'OWN_DIRECT',
    status: 'RECONCILED',
  });
  core.trips.set('trip-cancelled', {
    id: 'trip-cancelled',
    code: 'CH-CANCEL',
    kind: 'OWN_DIRECT',
    status: 'CANCELLED',
  });
  core.trips.set('trip-outsourced', {
    id: 'trip-outsourced',
    code: 'CH-OUT',
    kind: 'EXTERNAL_CARRIER',
    status: 'IN_TRANSIT',
  });

  return {
    ledger,
    core,
    costing: new CostingService(
      ledger,
      core,
      audit,
      CORE_POLICY,
      COSTING_POLICY,
      undefined,
      CLOCK,
    ),
    read: new CostingReadService(ledger, core),
    periods: new FundPeriodService(ledger, core, audit, CORE_POLICY, undefined, CLOCK),
  };
}

/** Bat mot loi cua mien va tra ve MA cua no — bai test khang dinh duong tu choi, khong chi "co nem". */
async function reasonOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  throw new Error('cho doi mot TransportDomainError nhung khong co gi duoc nem');
}

describe('hai lop cua mot khoan chi (INV-03, T1 §9.2)', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('FUND-002: ung tien KHONG gan chuyen thanh cong, tripId = null', async () => {
    const entry = await h.costing.postAdvance({ driverId: 'drv-1', amount: 10_000_000 }, 'ke-toan');

    expect(entry.kind).toBe('ADVANCE');
    expect(entry.signedAmount).toBe(10_000_000);
    expect(entry.tripId).toBeNull();
    expect((await h.read.driverFundStatement('drv-1')).balance).toBe(10_000_000);
  });

  it('FUND-001: chi BOT tu quy sinh DUNG hai ban ghi, cung khoa, hai con so khong cong vao nhau', async () => {
    await h.costing.postAdvance({ driverId: 'drv-1', amount: 10_000_000 }, 'ke-toan');
    const posted = await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 150_000,
        fundedBy: 'DRIVER_FUND',
        driverId: 'drv-1',
      },
      'ke-toan',
    );

    expect(posted.entry?.kind).toBe('TRIP_EXPENSE');
    expect(posted.entry?.signedAmount).toBe(-150_000);
    expect(posted.expense?.signedAmount).toBe(150_000);
    // MOT soi day noi hai lop — do la thu lam hai con so doi soat duoc voi nhau.
    expect(posted.entry?.correlationKey).toBe(posted.expense?.correlationKey);
    expect(posted.expense?.driverFundEntryId).toBe(posted.entry?.id);

    expect((await h.read.driverFundStatement('drv-1')).balance).toBe(9_850_000);
    expect((await h.read.tripCostBreakdown('trip-a')).directCost).toBe(150_000);
  });

  it('cong ty tra thang sinh DUNG MOT dong gia thanh, khong but toan quy nao', async () => {
    const posted = await h.costing.recordTripExpense(
      { tripId: 'trip-a', categoryCode: 'BOT', amount: 150_000, fundedBy: 'COMPANY_DIRECT' },
      'ke-toan',
    );

    expect(posted.entry).toBeNull();
    expect(posted.expense?.fundedBy).toBe('COMPANY_DIRECT');
    expect(posted.expense?.driverFundEntryId).toBeNull();
    expect((await h.read.tripCostBreakdown('trip-a')).directCost).toBe(150_000);
    expect((await h.read.driverFundStatement('drv-1')).balance).toBe(0);
  });

  it('SO DU AM la hop le (FUND-003) — tieu qua so da ung khong bi chan', async () => {
    await h.costing.postAdvance({ driverId: 'drv-1', amount: 100_000 }, 'ke-toan');
    await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 250_000,
        fundedBy: 'DRIVER_FUND',
        driverId: 'drv-1',
      },
      'ke-toan',
    );

    expect((await h.read.driverFundStatement('drv-1')).balance).toBe(-150_000);
  });

  it('khoan chi tu quy PHAI chi ro lai xe — khong co lai xe thi khong co so quy nao de tru', async () => {
    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          { tripId: 'trip-a', categoryCode: 'BOT', amount: 1_000, fundedBy: 'DRIVER_FUND' },
          'ke-toan',
        ),
      ),
    ).toBe('FUND_ACCOUNT_NOT_FOUND');
  });
});

describe('ba cong tu choi cua mot khoan chi moi, ba ma khac nhau', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('chuyen da DOI SOAT khoa khoi khoan chi moi (GD-01)', async () => {
    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          { tripId: 'trip-done', categoryCode: 'BOT', amount: 1_000, fundedBy: 'COMPANY_DIRECT' },
          'ke-toan',
        ),
      ),
    ).toBe('EXPENSE_TRIP_RECONCILED');
  });

  it('chuyen da HUY mang mot ma KHAC — duong dung la dao, khong phai ghi them', async () => {
    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          {
            tripId: 'trip-cancelled',
            categoryCode: 'BOT',
            amount: 1_000,
            fundedBy: 'COMPANY_DIRECT',
          },
          'ke-toan',
        ),
      ),
    ).toBe('EXPENSE_TRIP_CANCELLED');
  });

  it('TRIP-002/INV-04: chuyen thue xe ngoai khong nhan chi phi tu quy lai xe', async () => {
    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          {
            tripId: 'trip-outsourced',
            categoryCode: 'BOT',
            amount: 1_000,
            fundedBy: 'DRIVER_FUND',
            driverId: 'drv-1',
          },
          'ke-toan',
        ),
      ),
    ).toBe('EXPENSE_TRIP_OUTSOURCED');
  });

  /**
   * DEMO_ASSUMPTION DA-T3-03, khoa lai bang mot bai test de no khong troi thanh mot su that ngam.
   *
   * Bat bien ma Issue #85 khai la "outsourced trip must not receive internal Driver Fund expense" —
   * dung ve DRIVER_FUND. Tien tra nha xe di duong `PayableDocument` cua T5, khong phai duong nay.
   * Neu khach muon dong ca duong `COMPANY_DIRECT` tren chuyen thue ngoai thi day la MOT dieu kien
   * phai them o `guardTripAcceptsExpense`, khong phai mot cau truc phai doi.
   */
  it('chuyen thue ngoai VAN nhan duoc khoan cong ty tra thang (DA-T3-03)', async () => {
    const posted = await h.costing.recordTripExpense(
      { tripId: 'trip-outsourced', categoryCode: 'CAU_DUONG', amount: 1_000, fundedBy: 'COMPANY_DIRECT' },
      'ke-toan',
    );
    expect(posted.expense?.signedAmount).toBe(1_000);
    expect(posted.entry).toBeNull();
  });
});

describe('dao — sua = dao + ghi moi, khong bao gio UPDATE (INV-20)', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  async function fundedExpense() {
    await h.costing.postAdvance({ driverId: 'drv-1', amount: 10_000_000 }, 'ke-toan');
    return h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 150_000,
        fundedBy: 'DRIVER_FUND',
        driverId: 'drv-1',
      },
      'ke-toan',
    );
  }

  it('dao mot khoan chi dao CA HAI chan, va ban goc KHONG bi sua', async () => {
    const original = await fundedExpense();
    const reversal = await h.costing.reverseExpense(original.expense!.id, 'ghi nham', 'ke-toan');

    expect(reversal.entry?.signedAmount).toBe(150_000);
    expect(reversal.expense?.signedAmount).toBe(-150_000);
    expect(reversal.entry?.reversalOfId).toBe(original.entry!.id);
    expect(reversal.expense?.reversalOfId).toBe(original.expense!.id);

    // BAN GOC nguyen ven — doc lai tu kho, khong tin vao doi tuong trong tay.
    const stored = await h.ledger.findExpense(original.expense!.id);
    expect(stored?.signedAmount).toBe(150_000);
    expect(stored?.kind).toBe('EXPENSE');

    // Va hieu qua so cai da duoc khoi phuc o CA HAI lop.
    expect((await h.read.driverFundStatement('drv-1')).balance).toBe(10_000_000);
    expect((await h.read.tripCostBreakdown('trip-a')).directCost).toBe(0);
  });

  it('bon ban ghi sau khi dao, khong phai hai — lich su day du', async () => {
    const original = await fundedExpense();
    await h.costing.reverseExpense(original.expense!.id, 'ghi nham', 'ke-toan');

    const statement = await h.read.driverFundStatement('drv-1');
    expect(statement.entries).toHaveLength(3); // ung + chi + dao
    expect((await h.read.tripCostBreakdown('trip-a')).expenses).toHaveLength(2);
  });

  it('dao tu phia BUT TOAN cho ket qua y het dao tu phia KHOAN CHI', async () => {
    const original = await fundedExpense();
    const reversal = await h.costing.reverseFundEntry(original.entry!.id, 'ghi nham', 'ke-toan');

    expect(reversal.expense?.reversalOfId).toBe(original.expense!.id);
    expect((await h.read.tripCostBreakdown('trip-a')).directCost).toBe(0);
  });

  it('khong dao hai lan', async () => {
    const original = await fundedExpense();
    await h.costing.reverseExpense(original.expense!.id, 'ghi nham', 'ke-toan');

    expect(
      await reasonOf(() => h.costing.reverseExpense(original.expense!.id, 'lai nham', 'ke-toan')),
    ).toBe('ENTRY_ALREADY_REVERSED');
  });

  it('khong dao mot but toan dao — duong dung la mot but toan dieu chinh', async () => {
    const original = await fundedExpense();
    const reversal = await h.costing.reverseExpense(original.expense!.id, 'ghi nham', 'ke-toan');

    expect(
      await reasonOf(() => h.costing.reverseExpense(reversal.expense!.id, 'lai nua', 'ke-toan')),
    ).toBe('REVERSAL_OF_REVERSAL_DENIED');
  });

  it('dao mot lan tam ung KHONG gan chuyen cung chay — chi mot chan', async () => {
    const advance = await h.costing.postAdvance({ driverId: 'drv-1', amount: 5_000_000 }, 'ke-toan');
    const reversal = await h.costing.reverseFundEntry(advance.id, 'ung nham nguoi', 'ke-toan');

    expect(reversal.entry?.signedAmount).toBe(-5_000_000);
    expect(reversal.expense).toBeNull();
    expect((await h.read.driverFundStatement('drv-1')).balance).toBe(0);
  });
});

describe('khoa chong ghi trung', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('gui LAI cung khoa va cung noi dung -> tra lai ban cu, KHONG ghi them', async () => {
    const command = {
      tripId: 'trip-a',
      categoryCode: 'BOT',
      amount: 150_000,
      fundedBy: 'COMPANY_DIRECT' as const,
      correlationKey: 'idem-key-0001',
    };
    const first = await h.costing.recordTripExpense(command, 'ke-toan');
    const second = await h.costing.recordTripExpense(command, 'ke-toan');

    expect(second.expense?.id).toBe(first.expense?.id);
    expect((await h.read.tripCostBreakdown('trip-a')).expenses).toHaveLength(1);
    expect((await h.read.tripCostBreakdown('trip-a')).directCost).toBe(150_000);
  });

  /**
   * Cung khoa nhung KHAC noi dung phai la mot va cham ON AO.
   *
   * Neu tra lai ban cu o day, khoan chi MOI se bien mat khong dau vet va so sach thieu dung so tien
   * do — mot lan tai su dung khoa cua client bien thanh mot khoan chi khong bao gio ton tai.
   */
  it('cung khoa nhung KHAC noi dung -> va cham, khong lang le tra ban cu', async () => {
    await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 150_000,
        fundedBy: 'COMPANY_DIRECT',
        correlationKey: 'idem-key-0001',
      },
      'ke-toan',
    );

    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          {
            tripId: 'trip-a',
            categoryCode: 'BOT',
            amount: 999_000,
            fundedBy: 'COMPANY_DIRECT',
            correlationKey: 'idem-key-0001',
          },
          'ke-toan',
        ),
      ),
    ).toBe('CORRELATION_KEY_REUSED');
  });
});

describe('ky quy: dong bang, anh chup, mo lai (INV-22, GD-11)', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  const AUGUST = { driverId: 'drv-1', startDate: '2026-08-01', endDate: '2026-08-31' };

  it('dong ky chup dung so du va KHONG tao but toan nao', async () => {
    await h.costing.postAdvance(
      { driverId: 'drv-1', amount: 10_000_000, businessDate: '2026-08-05' },
      'ke-toan',
    );
    await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 150_000,
        fundedBy: 'DRIVER_FUND',
        driverId: 'drv-1',
        businessDate: '2026-08-10',
      },
      'ke-toan',
    );

    const period = await h.periods.openPeriod(AUGUST, 'ke-toan');
    const before = (await h.read.driverFundStatement('drv-1')).entries.length;
    const closed = await h.periods.closePeriod(period.id, 'ke-toan');

    expect(closed.period.status).toBe('CLOSED');
    expect(closed.snapshot.openingBalance).toBe(0);
    expect(closed.snapshot.periodNet).toBe(9_850_000);
    expect(closed.snapshot.closingBalance).toBe(9_850_000);
    expect(closed.snapshot.entryCount).toBe(2);
    // Dong ky KHONG tao but toan (T1 §7.3): so cai khong dai them mot dong nao.
    expect((await h.read.driverFundStatement('drv-1')).entries).toHaveLength(before);
  });

  it('SO DU AM khi dong ky la ket qua hop le, khong phai loi (FUND-003)', async () => {
    await h.costing.postAdvance(
      { driverId: 'drv-1', amount: 100_000, businessDate: '2026-08-05' },
      'ke-toan',
    );
    await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 250_000,
        fundedBy: 'DRIVER_FUND',
        driverId: 'drv-1',
        businessDate: '2026-08-06',
      },
      'ke-toan',
    );

    const period = await h.periods.openPeriod(AUGUST, 'ke-toan');
    const closed = await h.periods.closePeriod(period.id, 'ke-toan');
    expect(closed.snapshot.closingBalance).toBe(-150_000);
  });

  it('PERIOD-001: ky da dong KHONG nhan but toan lui ngay, va bao dung ma', async () => {
    const period = await h.periods.openPeriod(AUGUST, 'ke-toan');
    await h.periods.closePeriod(period.id, 'ke-toan');

    expect(
      await reasonOf(() =>
        h.costing.postAdvance(
          { driverId: 'drv-1', amount: 1_000, businessDate: '2026-08-20' },
          'ke-toan',
        ),
      ),
    ).toBe('FUND_ENTRY_PERIOD_FROZEN');

    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          {
            tripId: 'trip-a',
            categoryCode: 'BOT',
            amount: 1_000,
            fundedBy: 'DRIVER_FUND',
            driverId: 'drv-1',
            businessDate: '2026-08-20',
          },
          'ke-toan',
        ),
      ),
    ).toBe('EXPENSE_PERIOD_FROZEN');
  });

  it('ngay NGOAI ky da dong van ghi binh thuong — khoa dung pham vi, khong khoa ca so', async () => {
    const period = await h.periods.openPeriod(AUGUST, 'ke-toan');
    await h.periods.closePeriod(period.id, 'ke-toan');

    const entry = await h.costing.postAdvance(
      { driverId: 'drv-1', amount: 1_000, businessDate: '2026-09-01' },
      'ke-toan',
    );
    expect(entry.businessDate).toBe('2026-09-01');
  });
});

describe('ky quy: dao trong ky da dong, mo lai, chong lap', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  const AUGUST = { driverId: 'drv-1', startDate: '2026-08-01', endDate: '2026-08-31' };

  /**
   * DEMO_ASSUMPTION DA-T3-02: but toan dao mang NGAY CUA BAN GOC.
   *
   * Nen dao mot khoan trong ky da dong bi TU CHOI, chu khong bi day lang le sang ky hien tai.
   * `INV-22` cam dung viec do. Duong hop le la mo lai ky (quyen rieng + dau vet).
   */
  it('dao mot khoan nam trong ky da dong bi tu choi, khong bi day sang ky khac', async () => {
    const advance = await h.costing.postAdvance(
      { driverId: 'drv-1', amount: 5_000_000, businessDate: '2026-08-05' },
      'ke-toan',
    );
    const period = await h.periods.openPeriod(AUGUST, 'ke-toan');
    await h.periods.closePeriod(period.id, 'ke-toan');

    expect(await reasonOf(() => h.costing.reverseFundEntry(advance.id, 'nham', 'ke-toan'))).toBe(
      'REVERSAL_PERIOD_FROZEN',
    );

    await h.periods.reopenPeriod(period.id, 'ke toan yeu cau dao mot phieu', 'giam-doc');
    const reversal = await h.costing.reverseFundEntry(advance.id, 'nham', 'ke-toan');
    expect(reversal.entry?.businessDate).toBe('2026-08-05');
  });

  it('mo lai giu DAU VET, va anh chup cu khong bi ghi de', async () => {
    await h.costing.postAdvance(
      { driverId: 'drv-1', amount: 1_000_000, businessDate: '2026-08-05' },
      'ke-toan',
    );
    const period = await h.periods.openPeriod(AUGUST, 'ke-toan');
    await h.periods.closePeriod(period.id, 'ke-toan');
    const reopened = await h.periods.reopenPeriod(period.id, 'sot mot phieu', 'giam-doc');

    expect(reopened.status).toBe('REOPENED');
    expect(reopened.reopenReason).toBe('sot mot phieu');
    expect(reopened.reopenedBy).toBe('giam-doc');
    expect(reopened.closedAt).not.toBeNull();

    await h.costing.postAdvance(
      { driverId: 'drv-1', amount: 500_000, businessDate: '2026-08-20' },
      'ke-toan',
    );
    await h.periods.closePeriod(period.id, 'ke-toan');

    const snapshots = await h.periods.listSnapshots(period.id);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]!.closingBalance).toBe(1_000_000);
    expect(snapshots[1]!.closingBalance).toBe(1_500_000);
    expect(snapshots.map((row) => row.sequence)).toEqual([1, 2]);
  });

  it('hai ky chong lap cua cung mot so quy bi tu choi', async () => {
    await h.periods.openPeriod(AUGUST, 'ke-toan');
    expect(
      await reasonOf(() =>
        h.periods.openPeriod(
          { driverId: 'drv-1', startDate: '2026-08-31', endDate: '2026-09-30' },
          'ke-toan',
        ),
      ),
    ).toBe('FUND_PERIOD_OVERLAP');
  });

  it('ky cua LAI XE KHAC khong lien quan gi', async () => {
    await h.periods.openPeriod(AUGUST, 'ke-toan');
    const other = await h.periods.openPeriod({ ...AUGUST, driverId: 'drv-2' }, 'ke-toan');
    expect(other.status).toBe('OPEN');
  });

  it('ngay bat dau sau ngay ket thuc bi chan o tang mien', async () => {
    expect(
      await reasonOf(() =>
        h.periods.openPeriod(
          { driverId: 'drv-1', startDate: '2026-08-31', endDate: '2026-08-01' },
          'ke-toan',
        ),
      ),
    ).toBe('FUND_PERIOD_RANGE_INVALID');
  });
});

describe('be mat lai xe: so quy CUA CHINH MINH', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('lai xe da noi tai khoan doc duoc dung so quy cua minh', async () => {
    await h.costing.postAdvance({ driverId: 'drv-1', amount: 3_000_000 }, 'ke-toan');
    await h.costing.postAdvance({ driverId: 'drv-2', amount: 9_000_000 }, 'ke-toan');

    const mine = await h.read.selfFundStatement('user-1');
    expect(mine.driverId).toBe('drv-1');
    expect(mine.balance).toBe(3_000_000);
    expect(mine.entries.every((entry) => entry.accountId === mine.account?.id)).toBe(true);
  });

  /**
   * DUONG DOC KHONG DUOC GHI.
   *
   * Mot lai xe chua co giao dich nao van doc duoc so quy cua minh — va lan doc do KHONG duoc tao ra
   * mot hang so quy. Truoc ban nay `driverFundStatement()` goi `ensureAccount()` cho tien, tuc mot
   * lan `GET` ghi mot hang vao DB.
   */
  it('lai xe chua co giao dich nao: so du 0, va KHONG hang so quy nao duoc tao', async () => {
    const empty = await h.read.driverFundStatement('drv-2');

    expect(empty.account).toBeNull();
    expect(empty.balance).toBe(0);
    expect(empty.entries).toEqual([]);
    // Doc lai bang mot duong KHAC: kho van khong co so quy nao cho lai xe do.
    expect(await h.ledger.findAccountByDriver('drv-2')).toBeNull();
  });

  it('tai khoan chua noi ho so lai xe bi tu choi voi mot ma noi ro phai sua o dau', async () => {
    expect(await reasonOf(() => h.read.selfFundStatement('user-khong-noi'))).toBe(
      'SELF_FUND_SCOPE_NO_DRIVER_BINDING',
    );
  });

  /**
   * `INV-09` duoc giu bang KIEU DU LIEU, khong bang mot bo loc ai do phai nho viet.
   *
   * Bai nay quet CHUOI JSON cua payload that: neu mot ngay nao do co ai them mot truong doanh thu
   * vao `DriverFundStatement`, dong nay do — khong doi toi luc mot lai xe nhin thay gia cuoc.
   */
  it('payload cua be mat lai xe khong mang mot truong doanh thu nao', async () => {
    await h.costing.postAdvance({ driverId: 'drv-1', amount: 3_000_000 }, 'ke-toan');
    const payload = JSON.stringify(await h.read.selfFundStatement('user-1'));

    for (const forbidden of ['freight', 'Freight', 'revenue']) {
      expect(payload, forbidden).not.toContain(forbidden);
    }
  });
});
