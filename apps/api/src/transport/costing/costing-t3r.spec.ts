import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { CostingReadService } from './costing-read.service.js';
import type { TransportCostingPolicy } from './costing-policy.js';
import { CostingService } from './costing.service.js';
import { describeFundBalance } from './driver-fund-ledger.js';
import { FundPeriodService } from './fund-period.service.js';
import { InMemoryCostingRepository } from './in-memory-costing.repository.js';
import {
  TransportCoreFacts,
  type DriverFacts,
  type TripFacts,
} from './transport-core-facts.port.js';

/**
 * T3R — BON CONG DA HO O BAN T3 DAU, do tren kho trong bo nho (Issue #94 §2, §3, §5, §6).
 *
 * Tep RIENG chu khong noi them vao `costing.service.spec.ts`: bo kia mo ta LUAT NGHIEP VU cua T3 va
 * doc nhu mot dac ta. Bo nay mo ta BON LOI DA CO — moi `it` o day tuong ung mot muc cua #94, va
 * moi `it` o day DO tren ma truoc T3R. Tron chung lai thi sau vai thang khong con ai biet bai nao
 * dang giu cai gi, va mot lan "don dep" se xoa dung cai bay quan trong.
 *
 * Nhung gi tep nay KHONG chung minh duoc: hai lenh chay THAT SU cung luc. Kho trong bo nho mot
 * luong khong co canh tranh nao de thua. §1 va nua con lai cua §2 song o
 * `transport-costing.int.spec.ts`, tren Postgres 16 that.
 */

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const COSTING_POLICY: TransportCostingPolicy = {
  expenseCategories: [],
  advanceApprovalRequired: false,
};
const CLOCK = (): Date => new Date('2026-08-15T03:00:00.000Z');

class FakeCoreFacts extends TransportCoreFacts {
  readonly trips = new Map<string, TripFacts>();
  readonly drivers = new Map<string, DriverFacts>();
  readonly assignments = new Map<string, Set<string>>();

  assign(tripId: string, driverId: string): void {
    const seen = this.assignments.get(tripId) ?? new Set<string>();
    seen.add(driverId);
    this.assignments.set(tripId, seen);
  }

  async findTrip(tripId: string): Promise<TripFacts | null> {
    return this.trips.get(tripId) ?? null;
  }

  async findDriver(driverId: string): Promise<DriverFacts | null> {
    return this.drivers.get(driverId) ?? null;
  }

  async findDriverByAuthUserId(): Promise<DriverFacts | null> {
    return null;
  }

  async wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean> {
    return this.assignments.get(tripId)?.has(driverId) ?? false;
  }
}

/**
 * Kho MAT LUOT: mot phien khac chot xong DUNG giua luc phien nay doc trang thai va goi
 * `finalizeClose()`.
 *
 * Kho trong bo nho chay mot luong nen khong tu tao ra duoc canh tranh; dung lop nay de dung dung
 * ket cuc ma Postgres se cho khi hai lenh chot cung mot ky gap nhau o `SELECT ... FOR UPDATE`.
 * Cai duoc kiem o day la HANH VI CUA SERVICE truoc mot `null`, khong phai co che khoa cua DB —
 * co che do duoc do that o `transport-costing.int.spec.ts`.
 */
class LosingRaceLedger extends InMemoryCostingRepository {
  private stolen = false;

  override async finalizeClose(
    input: Parameters<InMemoryCostingRepository['finalizeClose']>[0],
  ): ReturnType<InMemoryCostingRepository['finalizeClose']> {
    if (this.stolen) return super.finalizeClose(input);
    this.stolen = true;
    await super.finalizeClose({ ...input, takenBy: 'ke-toan-khac' });
    return null;
  }
}

interface Harness {
  readonly ledger: InMemoryCostingRepository;
  readonly core: FakeCoreFacts;
  readonly costing: CostingService;
  readonly read: CostingReadService;
  readonly periods: FundPeriodService;
}

function harness(ledger: InMemoryCostingRepository = new InMemoryCostingRepository()): Harness {
  const core = new FakeCoreFacts();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());

  core.drivers.set('drv-a', { id: 'drv-a', fullName: 'Lai xe A' });
  core.drivers.set('drv-b', { id: 'drv-b', fullName: 'Lai xe B' });
  core.drivers.set('drv-ngoai', { id: 'drv-ngoai', fullName: 'Lai xe khong lien quan' });
  core.trips.set('trip-a', { id: 'trip-a', code: 'CH-A', kind: 'OWN_DIRECT', status: 'IN_TRANSIT' });

  // A nhan chuyen truoc, sau do B thay ca. CA HAI deu nam trong lich su (`GD-06`); lai xe thu ba
  // thi khong.
  core.assign('trip-a', 'drv-a');
  core.assign('trip-a', 'drv-b');

  return {
    ledger,
    core,
    costing: new CostingService(ledger, core, audit, CORE_POLICY, COSTING_POLICY, undefined, CLOCK),
    read: new CostingReadService(ledger, core),
    periods: new FundPeriodService(ledger, core, audit, CORE_POLICY, undefined, CLOCK),
  };
}

async function reasonOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  throw new Error('cho doi mot TransportDomainError nhung khong co gi duoc nem');
}

/* ==================================================================== *
 * #94 §3 — khoa chong ghi trung khong duoc bang qua so quy / quy ket
 * ==================================================================== */

describe('#94 §3 — phat lai phai la CUNG MOT viec, khong chi cung so tien', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  /**
   * BAI CHINH cua §3. Truoc T3R bai nay XANH SAI: lenh thu hai duoc coi la phat lai va tra ve
   * but toan CUA LAI XE A, nen lai xe B khong duoc ung dong nao ma ke toan van thay 200.
   */
  it('cung khoa, cung so tien, cung ngay — nhung KHAC LAI XE -> va cham, khong phat lai', async () => {
    const key = 'idem-ung-0001';
    const first = await h.costing.postAdvance(
      { driverId: 'drv-a', amount: 100_000, businessDate: '2026-08-10', correlationKey: key },
      'ke-toan',
    );

    expect(
      await reasonOf(() =>
        h.costing.postAdvance(
          { driverId: 'drv-b', amount: 100_000, businessDate: '2026-08-10', correlationKey: key },
          'ke-toan',
        ),
      ),
    ).toBe('CORRELATION_KEY_REUSED');

    // Va so quy cua B van tuyet doi khong doi — khong hang nao duoc ghi cho no.
    const b = await h.read.driverFundStatement('drv-b');
    expect(b.balance).toBe(0);
    expect(b.entries).toHaveLength(0);
    // But toan cua A cung khong bi dong den.
    expect((await h.read.driverFundStatement('drv-a')).entries).toEqual([first]);
  });

  it('cung khoa, cung chuyen/so tien/ngay/nhom chi — KHAC LAI XE tren khoan chi tu quy', async () => {
    const key = 'idem-chi-0001';
    const command = {
      tripId: 'trip-a',
      categoryCode: 'BOT',
      amount: 150_000,
      fundedBy: 'DRIVER_FUND' as const,
      businessDate: '2026-08-10',
      correlationKey: key,
    };
    await h.costing.recordTripExpense({ ...command, driverId: 'drv-a' }, 'ke-toan');

    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense({ ...command, driverId: 'drv-b' }, 'ke-toan'),
      ),
    ).toBe('CORRELATION_KEY_REUSED');

    expect((await h.read.driverFundStatement('drv-b')).balance).toBe(0);
    expect((await h.read.tripCostBreakdown('trip-a')).expenses).toHaveLength(1);
  });

  it('cung khoa nhung DOI NGUON TIEN (`COMPANY_DIRECT` <-> `DRIVER_FUND`) -> va cham', async () => {
    const key = 'idem-nguon-0001';
    const base = {
      tripId: 'trip-a',
      categoryCode: 'BOT',
      amount: 150_000,
      businessDate: '2026-08-10',
      correlationKey: key,
    };
    await h.costing.recordTripExpense({ ...base, fundedBy: 'COMPANY_DIRECT' }, 'ke-toan');

    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          { ...base, fundedBy: 'DRIVER_FUND', driverId: 'drv-a' },
          'ke-toan',
        ),
      ),
    ).toBe('CORRELATION_KEY_REUSED');

    expect((await h.read.driverFundStatement('drv-a')).balance).toBe(0);
  });

  it('cung khoa nhung KHAC BANG CHUNG di kem -> va cham (bang chung la mot phan cua lenh)', async () => {
    const key = 'idem-bang-chung-0001';
    const base = {
      tripId: 'trip-a',
      categoryCode: 'BOT',
      amount: 150_000,
      fundedBy: 'COMPANY_DIRECT' as const,
      businessDate: '2026-08-10',
      correlationKey: key,
    };
    await h.costing.recordTripExpense({ ...base, evidenceLocator: 'drive://phieu-A' }, 'ke-toan');

    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense({ ...base, evidenceLocator: 'drive://phieu-B' }, 'ke-toan'),
      ),
    ).toBe('CORRELATION_KEY_REUSED');
  });

  it('DUNG mot lenh y het — ke ca khoang trang thua o ghi chu — van la phat lai vo hai', async () => {
    const key = 'idem-that-0001';
    const first = await h.costing.postAdvance(
      {
        driverId: 'drv-a',
        amount: 100_000,
        businessDate: '2026-08-10',
        note: 'ung dau thang',
        correlationKey: key,
      },
      'ke-toan',
    );
    const second = await h.costing.postAdvance(
      {
        driverId: 'drv-a',
        amount: 100_000,
        businessDate: '2026-08-10',
        note: '  ung dau thang  ',
        correlationKey: key,
      },
      'ke-toan',
    );

    expect(second.id).toBe(first.id);
    expect((await h.read.driverFundStatement('drv-a')).entries).toHaveLength(1);
    expect((await h.read.driverFundStatement('drv-a')).balance).toBe(100_000);
  });

  it('phat lai mot khoan chi tu quy tra ve CA HAI chan, khong chi chan gia thanh', async () => {
    const command = {
      tripId: 'trip-a',
      categoryCode: 'BOT',
      amount: 150_000,
      fundedBy: 'DRIVER_FUND' as const,
      driverId: 'drv-a',
      businessDate: '2026-08-10',
      correlationKey: 'idem-hai-chan-0001',
    };
    const first = await h.costing.recordTripExpense(command, 'ke-toan');
    const second = await h.costing.recordTripExpense(command, 'ke-toan');

    expect(second.expense?.id).toBe(first.expense?.id);
    expect(second.entry?.id).toBe(first.entry?.id);
    expect(second.entry?.accountId).toBe(first.entry?.accountId);
    expect((await h.read.driverFundStatement('drv-a')).balance).toBe(-150_000);
  });
});

/* ==================================================================== *
 * #94 §5 — DA-T3-04: khoan chi tu quy chi gan cho lai xe da chay chuyen
 * ==================================================================== */

describe('#94 §5 — DA-T3-04: khong tru quy cua mot lai xe khong lien quan', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('lai xe CHUA TUNG duoc phan cong -> tu choi, va KHONG hang nao duoc ghi', async () => {
    expect(
      await reasonOf(() =>
        h.costing.recordTripExpense(
          {
            tripId: 'trip-a',
            categoryCode: 'BOT',
            amount: 150_000,
            fundedBy: 'DRIVER_FUND',
            driverId: 'drv-ngoai',
            businessDate: '2026-08-10',
          },
          'ke-toan',
        ),
      ),
    ).toBe('EXPENSE_DRIVER_NOT_ASSIGNED');

    // Khong but toan, khong dong gia thanh — VA khong ca mot so quy moi tinh. Mot lenh bi tu choi
    // khong duoc de lai dau vet nao.
    const outsider = await h.read.driverFundStatement('drv-ngoai');
    expect(outsider.account).toBeNull();
    expect(outsider.entries).toHaveLength(0);
    expect((await h.read.tripCostBreakdown('trip-a')).expenses).toHaveLength(0);
  });

  it('lai xe DA BI THAY CA van ghi duoc khoan chi cua doan ho da chay', async () => {
    // `drv-a` nhan chuyen truoc roi `drv-b` thay; ca hai deu con trong lich su phan cong.
    const posted = await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 150_000,
        fundedBy: 'DRIVER_FUND',
        driverId: 'drv-a',
        businessDate: '2026-08-10',
      },
      'ke-toan',
    );

    expect(posted.entry?.signedAmount).toBe(-150_000);
    expect((await h.read.driverFundStatement('drv-a')).balance).toBe(-150_000);
  });

  it('`COMPANY_DIRECT` khong dinh gi den lich su phan cong — no khong co lai xe nao', async () => {
    const posted = await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'CAU_DUONG',
        amount: 90_000,
        fundedBy: 'COMPANY_DIRECT',
        businessDate: '2026-08-10',
      },
      'ke-toan',
    );

    expect(posted.entry).toBeNull();
    expect(posted.expense?.driverId).toBeNull();
    expect((await h.read.tripCostBreakdown('trip-a')).directCost).toBe(90_000);
  });
});

/* ==================================================================== *
 * #94 §2 — mot lan dong ky = MOT anh chup
 * ==================================================================== */

describe('#94 §2 — dong ky hai lan khong tao hai anh chup cho cung mot lan dong', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  async function openPeriod(): Promise<string> {
    await h.costing.postAdvance(
      { driverId: 'drv-a', amount: 1_000_000, businessDate: '2026-08-10' },
      'ke-toan',
    );
    const period = await h.periods.openPeriod(
      { driverId: 'drv-a', startDate: '2026-08-01', endDate: '2026-08-31' },
      'ke-toan',
    );
    return period.id;
  }

  it('goi lai `closePeriod` tren ky DA DONG -> va cham co ma, khong phai anh chup thu hai', async () => {
    const periodId = await openPeriod();
    const closed = await h.periods.closePeriod(periodId, 'ke-toan');

    expect(closed.snapshot.sequence).toBe(1);
    expect(closed.snapshot.closingBalance).toBe(1_000_000);

    // Ky da `CLOSED`: may trang thai khong co canh `CLOSED -> CLOSING`, nen lenh dung lai o day.
    expect(await reasonOf(() => h.periods.closePeriod(periodId, 'ke-toan'))).toBe(
      'PERIOD_TRANSITION_NOT_PERMITTED',
    );
    expect(await h.periods.listSnapshots(periodId)).toHaveLength(1);
  });

  it('mot ky ket o `CLOSING` (lan truoc chet giua chung) duoc chot tiep, va chi MOT anh', async () => {
    const periodId = await openPeriod();
    const period = await h.ledger.findPeriod(periodId);
    // Mo phong dung trang thai ma mot lan chet giua pha 1 va pha 2 de lai: da dong bang, chua chup.
    await h.ledger.setPeriodStatus(periodId, period!.status, 'CLOSING', {
      at: CLOCK(),
      actor: 'ke-toan',
    });
    expect(await h.periods.listSnapshots(periodId)).toHaveLength(0);

    const closed = await h.periods.closePeriod(periodId, 'ke-toan');

    expect(closed.period.status).toBe('CLOSED');
    expect(await h.periods.listSnapshots(periodId)).toHaveLength(1);
  });

  it('mat luot GIUA CHUNG -> `FUND_PERIOD_STATUS_RACE`, mot anh chup, khong phai 500', async () => {
    const racing = harness(new LosingRaceLedger());
    await racing.costing.postAdvance(
      { driverId: 'drv-a', amount: 1_000_000, businessDate: '2026-08-10' },
      'ke-toan',
    );
    const periodId = (
      await racing.periods.openPeriod(
        { driverId: 'drv-a', startDate: '2026-08-01', endDate: '2026-08-31' },
        'ke-toan',
      )
    ).id;

    expect(await reasonOf(() => racing.periods.closePeriod(periodId, 'ke-toan'))).toBe(
      'FUND_PERIOD_STATUS_RACE',
    );

    // Phien THANG da chot xong va de lai DUNG mot anh; phien thua khong chup them cai nao.
    const snapshots = await racing.periods.listSnapshots(periodId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.takenBy).toBe('ke-toan-khac');
    expect((await racing.ledger.findPeriod(periodId))?.status).toBe('CLOSED');
  });

  it('MO LAI roi dong lai la mot lan dong MOI — va no PHAI de lai anh chup thu hai', async () => {
    const periodId = await openPeriod();
    await h.periods.closePeriod(periodId, 'ke-toan');
    await h.periods.reopenPeriod(periodId, 'ke toan phat hien thieu mot phieu', 'giam-doc');
    await h.periods.closePeriod(periodId, 'ke-toan');

    const snapshots = await h.periods.listSnapshots(periodId);
    expect(snapshots.map((row) => row.sequence)).toEqual([1, 2]);
  });
});

/* ==================================================================== *
 * #94 §6 — DA-T3-01: chieu doc cua dau so du
 * ==================================================================== */

describe('#94 §6 — DA-T3-01: so du am KHONG co nghia la lai xe dang no', () => {
  it('ba chieu doc, ba nhan — va khong nhan nao noi "lai xe no cong ty"', () => {
    expect(describeFundBalance(9_850_000)).toBe('DRIVER_HOLDS_COMPANY_CASH');
    expect(describeFundBalance(0)).toBe('SETTLED');
    expect(describeFundBalance(-150_000)).toBe('COMPANY_OWES_DRIVER');
  });

  it('khung nhin so quy mang san CACH DOC, de T6/T7 khong phai tu suy tu dau', async () => {
    const h = harness();
    await h.costing.postAdvance(
      { driverId: 'drv-a', amount: 100_000, businessDate: '2026-08-10' },
      'ke-toan',
    );
    expect((await h.read.driverFundStatement('drv-a')).balanceStance).toBe(
      'DRIVER_HOLDS_COMPANY_CASH',
    );

    // Chi vuot so da ung: lai xe dang bo tien tui, KHONG phai dang no.
    await h.costing.recordTripExpense(
      {
        tripId: 'trip-a',
        categoryCode: 'BOT',
        amount: 250_000,
        fundedBy: 'DRIVER_FUND',
        driverId: 'drv-a',
        businessDate: '2026-08-11',
      },
      'ke-toan',
    );

    const statement = await h.read.driverFundStatement('drv-a');
    expect(statement.balance).toBe(-150_000);
    expect(statement.balanceStance).toBe('COMPANY_OWES_DRIVER');

    // `GD-12`: khong mot khoan khau tru nao duoc tu sinh ra tu con so am do.
    expect(statement.entries.map((entry) => entry.kind)).toEqual(['ADVANCE', 'TRIP_EXPENSE']);
  });

  it('lai xe chua co giao dich nao doc ra `SETTLED`, khong phai mot trang thai thieu', async () => {
    const h = harness();
    expect((await h.read.driverFundStatement('drv-b')).balanceStance).toBe('SETTLED');
  });
});
