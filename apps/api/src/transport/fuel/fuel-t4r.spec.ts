import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import type { TripKind, TripStatus } from '../trips/trip-lifecycle.js';
import {
  FUEL_RECONCILIATION_STATES,
  planFuelReconciliationPath,
  type FuelReconciliationState,
} from './fuel-lifecycle.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { settlementResultFingerprint, sumAcceptedSettlement } from './fuel-settlement.js';
import {
  FuelCostingPort,
  TransportFuelCoreFacts,
  type FuelCostPostingCommand,
  type FuelDriverFacts,
  type FuelTripFacts,
  type FuelVehicleFacts,
} from './fuel.ports.js';
import { FuelService, type SubmitFuelEntryCommand } from './fuel.service.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';

/**
 * T4R — CAC BAT BIEN CUA BAN RA SOAT #103, do o muc DOC DUOC BANG MAT THUONG.
 *
 * ===========================================================================
 * TEP NAY CHUNG MINH GI, VA KHONG CHUNG MINH GI.
 *
 * CO: hinh dang quyet dinh — mot khoa chong ghi trung phan biet duoc bao nhieu kieu "phieu khac",
 * dau van tay kinh te bam vao nhung gi, va may trang thai co bao gio di TAT qua `CLOSED` de toi mot
 * dich khac khong.
 *
 * KHONG: tinh nguyen tu, khoa hang, va thu tu hai phien. Kho trong bo nho chay mot luong va se XANH
 * ca ba du khong cai nao ton tai. Nhung phep do do nam o `transport-fuel-concurrency.int.spec.ts`
 * va `transport-fuel-recovery.int.spec.ts`, tren Postgres THAT.
 *
 * Hai muc tieu tach nhau la co y: mot lan doi luat nghiep vu phai do o day trong mot giay, khong
 * phai doi mot container Postgres khoi dong.
 */

const TRIP = 'chuyen-t4r';
const VEHICLE = 'xe-t4r';
const DRIVER = 'lai-xe-t4r';

class StubCoreFacts extends TransportFuelCoreFacts {
  tripKind: TripKind = 'OWN_DIRECT';
  tripStatus: TripStatus = 'IN_TRANSIT';

  async findTrip(tripId: string): Promise<FuelTripFacts | null> {
    if (tripId !== TRIP) return null;
    return { id: TRIP, code: 'CH-T4R', kind: this.tripKind, status: this.tripStatus };
  }

  async findVehicle(vehicleId: string): Promise<FuelVehicleFacts | null> {
    if (vehicleId !== VEHICLE) return null;
    return { id: VEHICLE, registrationPlate: '29C-000.01', vehicleClass: 'tai-5-tan' };
  }

  async listVehicles(): Promise<FuelVehicleFacts[]> {
    const vehicle = await this.findVehicle(VEHICLE);
    return vehicle ? [vehicle] : [];
  }

  async findDriver(driverId: string): Promise<FuelDriverFacts | null> {
    return driverId === DRIVER ? { id: DRIVER, fullName: 'Lai xe T4R' } : null;
  }

  async findDriverByAuthUserId(): Promise<FuelDriverFacts | null> {
    return null;
  }

  async wasDriverEverAssignedToTrip(): Promise<boolean> {
    return true;
  }

  async wasVehicleEverAssignedToTrip(): Promise<boolean> {
    return true;
  }
}

class SilentCostingPort extends FuelCostingPort {
  async postFuelCost(command: FuelCostPostingCommand): Promise<string> {
    return `expense-of-${command.correlationKey}`;
  }
}

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const FUEL_POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: {}, tolerancePercent: 10 },
};

let repository: InMemoryFuelRepository;
let service: FuelService;
let supplierId: string;
let otherSupplierId: string;

beforeEach(async () => {
  repository = new InMemoryFuelRepository();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  service = new FuelService(
    repository,
    new StubCoreFacts(),
    new SilentCostingPort(),
    audit,
    CORE_POLICY,
    FUEL_POLICY,
  );

  const at = new Date('2026-08-01T00:00:00Z');
  supplierId = (
    await repository.createSupplier({
      name: 'Cay xang A',
      code: 'T4R-CX-A',
      phone: null,
      address: null,
      taxCode: null,
      at,
    })
  ).id;
  otherSupplierId = (
    await repository.createSupplier({
      name: 'Cay xang B',
      code: 'T4R-CX-B',
      phone: null,
      address: null,
      taxCode: null,
      at,
    })
  ).id;
});

const KEY = 'idem-t4r-1';

const submit = (overrides: Partial<SubmitFuelEntryCommand> = {}) =>
  service.submitFuelEntry(
    {
      tripId: TRIP,
      vehicleId: VEHICLE,
      driverId: DRIVER,
      supplierId,
      liters: '200',
      amount: 4_200_000,
      odometerKm: 100_500,
      occurredAt: '2026-08-05T06:30:00+07:00',
      businessDate: '2026-08-05',
      paymentMethod: 'SUPPLIER_ACCOUNT',
      invoiceNo: 'HD-001',
      note: 'Do dau chieu di',
      correlationKey: KEY,
      ...overrides,
    },
    'ke-toan',
  );

/* ==================================================================== *
 * §5 — DANH TINH CHUAN HOA CUA MOT LENH NOP PHIEU
 * ==================================================================== */

describe('T4R §5 — khoa chong ghi trung phan biet duoc PHAT LAI voi PHIEU KHAC', () => {
  /**
   * Phep so cu doc BAY truong va bo qua nam. Moi bai duoi day dung mot trong nam truong bi bo qua
   * do, va TAT CA deu phai la mot va cham — khong mot cai nao duoc lang le tra ve phieu cu.
   */
  it.each([
    ['supplierId', {}],
    ['paymentMethod', { paymentMethod: 'DRIVER_CASH' as const }],
    ['occurredAt', { occurredAt: '2026-08-05T09:15:00+07:00' }],
    ['invoiceNo', { invoiceNo: 'HD-002' }],
    ['note', { note: 'Mot ghi chu khac han' }],
  ])('cung khoa + lech `%s` => VA CHAM, khong tra ve phieu cu', async (field, patch) => {
    const first = await submit();
    const overrides: Partial<SubmitFuelEntryCommand> =
      field === 'supplierId' ? { supplierId: otherSupplierId } : patch;

    await expect(submit(overrides)).rejects.toMatchObject({
      reason: 'FUEL_CORRELATION_KEY_REUSED',
    });
    // Thong diep phai NOI RA truong nao lech — nguoi nhan phai sua duoc mot cai gi do.
    await expect(submit(overrides)).rejects.toThrow(new RegExp(field));

    // Va phieu cu KHONG bi cham vao.
    const stored = await repository.findEntry(first.id);
    expect(stored?.supplierId).toBe(supplierId);
    expect(stored?.paymentMethod).toBe('SUPPLIER_ACCOUNT');
    expect(await repository.listEntriesByTrip(TRIP)).toHaveLength(1);
  });

  /**
   * `paymentMethod` co mot lop nghia rieng, va day la ly do no phai nam trong danh tinh.
   *
   * `DRIVER_CASH` -> `DRIVER_FUND`, `SUPPLIER_ACCOUNT` -> `COMPANY_DIRECT`. Cung mot so tien, hai
   * duong tien khac han nhau o `TX-03`. Tra ve phieu cu se lam ke toan tin rang khoan nay da vao
   * dung so — trong khi no vao so kia.
   */
  it('lech `paymentMethod` bi tu choi du MOI con so con lai giong het', async () => {
    await submit({ paymentMethod: 'SUPPLIER_ACCOUNT' });
    await expect(submit({ paymentMethod: 'DRIVER_CASH' })).rejects.toMatchObject({
      reason: 'FUEL_CORRELATION_KEY_REUSED',
    });
  });

  it('nop lai DUNG y het => phat lai phieu cu, KHONG ghi them hang nao', async () => {
    const first = await submit();
    const replay = await submit();

    expect(replay.id).toBe(first.id);
    expect(await repository.listEntriesByTrip(TRIP)).toHaveLength(1);
  });

  /**
   * CHUAN HOA, va chi hai phep — xem `fuel-entry-identity.ts`.
   *
   * Mot dau cach thua o cuoi so hoa don va mot moc thoi gian viet o mui gio khac deu la CUNG mot
   * lenh. Bat nguoi dung sua tay hai thu do de duoc coi la "gui lai" la bat ho doan.
   */
  it('khoang trang thua va mui gio khac nhau VAN la cung mot lenh', async () => {
    const first = await submit();
    const replay = await submit({
      invoiceNo: '  HD-001  ',
      note: 'Do dau chieu di',
      occurredAt: '2026-08-04T23:30:00Z',
    });

    expect(replay.id).toBe(first.id);
    expect(await repository.listEntriesByTrip(TRIP)).toHaveLength(1);
  });

  it('chuoi rong va `null` la CUNG mot "khong khai"', async () => {
    const first = await submit({ note: null });
    expect((await submit({ note: '   ' })).id).toBe(first.id);
  });
});

/* ==================================================================== *
 * §1 — MAY TRANG THAI KHONG DUOC DI TAT QUA `CLOSED`
 * ==================================================================== */

describe('T4R §1 — duong di tu dong giua hai trang thai ky doi soat', () => {
  it('DRAFT -> RESOLVED di qua MATCHING, dung hai buoc', () => {
    expect(planFuelReconciliationPath('DRAFT', 'RESOLVED')).toEqual(['MATCHING', 'RESOLVED']);
  });

  it('da o dich thi tra ve mang RONG — khong phai mot buoc chuyen, khong phai mot loi', () => {
    for (const state of FUEL_RECONCILIATION_STATES) {
      expect(planFuelReconciliationPath(state, state)).toEqual([]);
    }
  });

  /**
   * BAI QUAN TRONG NHAT CUA MUC NAY.
   *
   * Mot phep tim duong tong quat se tim thay `RESOLVED -> CLOSED -> REOPENED` va lang le DONG mot
   * ky de di toi dich — tuc phat mot ban giao cong no cho T5 ma khong ai bam nut nao. Dong ky va mo
   * lai deu la thao tac cua NGUOI (`GD-11`), khong bao gio la mot buoc trung gian.
   */
  it('KHONG duong tu dong nao di qua `CLOSED` hay `REOPENED`', () => {
    const passesThrough = (path: readonly FuelReconciliationState[], to: FuelReconciliationState) =>
      path.slice(0, -1).includes(to);

    for (const from of FUEL_RECONCILIATION_STATES) {
      for (const to of FUEL_RECONCILIATION_STATES) {
        const path = planFuelReconciliationPath(from, to);
        if (path === null) continue;
        expect(passesThrough(path, 'CLOSED')).toBe(false);
        expect(passesThrough(path, 'REOPENED')).toBe(false);
      }
    }
  });

  it('`CLOSED` khong tu di dau duoc ngoai `REOPENED`', () => {
    expect(planFuelReconciliationPath('CLOSED', 'MATCHING')).toBeNull();
    expect(planFuelReconciliationPath('CLOSED', 'RESOLVED')).toBeNull();
    expect(planFuelReconciliationPath('CLOSED', 'REOPENED')).toEqual(['REOPENED']);
  });

  it('mot ky chua chay so khop lan nao KHONG dong duoc', () => {
    expect(planFuelReconciliationPath('DRAFT', 'CLOSED')).toBeNull();
  });
});

/* ==================================================================== *
 * §2 — DAU VAN TAY KINH TE
 * ==================================================================== */

describe('T4R §2 — dau van tay phan biet "phat lai" voi "da sua"', () => {
  const lines = [
    { id: 'dong-1', amount: 1_000_000 },
    { id: 'dong-2', amount: 2_000_000 },
    { id: 'dong-3', amount: 3_000_000 },
  ];

  it('chi dong DA KHOP va dong duoc quyet `ACCEPT_SUPPLIER_AMOUNT` duoc tinh tien', () => {
    const accepted = sumAcceptedSettlement({
      lines,
      matches: [{ statementLineId: 'dong-1' }],
      discrepancies: [
        { statementLineId: 'dong-2', resolution: 'ACCEPT_SUPPLIER_AMOUNT' },
        { statementLineId: 'dong-3', resolution: 'IGNORE_WITH_REASON' },
      ],
    });

    expect(accepted).toEqual({ amount: 3_000_000, lineCount: 2, lineIds: ['dong-1', 'dong-2'] });
  });

  /**
   * HAI KY CUNG TONG NHUNG KHAC BO DONG la HAI ket qua khac nhau.
   *
   * Neu dau van tay chi bam vao tong tien, mot lan sua doi dong nay lay dong kia — dung bang tien —
   * se duoc coi la "khong doi gi", va T5 se tra tien theo mot bo dong khong con dung.
   */
  it('cung tong nhung KHAC bo dong => dau van tay KHAC nhau', () => {
    const left = settlementResultFingerprint({
      amount: 3_000_000,
      lineCount: 1,
      lineIds: ['dong-3'],
    });
    const right = settlementResultFingerprint({
      amount: 3_000_000,
      lineCount: 2,
      lineIds: ['dong-1', 'dong-2'],
    });
    expect(left).not.toBe(right);
  });

  it('thu tu cua bo dong KHONG lam doi dau van tay', () => {
    const forward = settlementResultFingerprint({
      amount: 10,
      lineCount: 3,
      lineIds: ['a', 'b', 'c'],
    });
    const backward = settlementResultFingerprint({
      amount: 10,
      lineCount: 3,
      lineIds: ['c', 'b', 'a'],
    });
    expect(forward).toBe(backward);
  });
});
