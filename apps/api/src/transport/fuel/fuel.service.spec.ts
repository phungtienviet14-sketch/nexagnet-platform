import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import type { TripKind, TripStatus } from '../trips/trip-lifecycle.js';
import { toDriverFuelSlipView } from './driver-fuel.view.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReadService } from './fuel-read.service.js';
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
 * LUAT NGHIEP VU cua duong GHI `TX-04`, do tren kho trong bo nho.
 *
 * Bo test nay KHONG chung minh gi ve Postgres — giao dich, unique hai chieu va trigger `INV-26`
 * nam o `transport-fuel.int.spec.ts`. Cai no chung minh la nhung cong ma mot con nguoi phai doc
 * duoc: `INV-04`, `GD-10`, "chi phi dau vao gia thanh chuyen dung mot lan", va pham vi cua lai xe.
 *
 * `FuelCostingPort` o day la mot BAN GHI CHEP chu khong phai mot mock im lang: no giu lai moi lenh
 * da nhan, de bai test khang dinh duoc `TX-03` bi goi BAO NHIEU LAN va voi nguon tien nao. Mot mock
 * chi tra ve gia tri se lam cau hoi "co dem hai lan khong" khong tra loi duoc.
 */

const TRIP = 'chuyen-1';
const VEHICLE = 'xe-1';
const DRIVER = 'lai-xe-1';
const OTHER_DRIVER = 'lai-xe-2';
const AUTH_USER = 'user-lai-xe-1';

class StubCoreFacts extends TransportFuelCoreFacts {
  tripKind: TripKind = 'OWN_DIRECT';
  tripStatus: TripStatus = 'IN_TRANSIT';
  assignedDrivers = new Set([DRIVER]);
  assignedVehicles = new Set([VEHICLE]);

  async findTrip(tripId: string): Promise<FuelTripFacts | null> {
    if (tripId !== TRIP) return null;
    return { id: TRIP, code: 'CH-001', kind: this.tripKind, status: this.tripStatus };
  }

  async findVehicle(vehicleId: string): Promise<FuelVehicleFacts | null> {
    if (vehicleId !== VEHICLE) return null;
    return { id: VEHICLE, registrationPlate: '29C-123.45', vehicleClass: 'tai-5-tan' };
  }

  async listVehicles(): Promise<FuelVehicleFacts[]> {
    const vehicle = await this.findVehicle(VEHICLE);
    return vehicle ? [vehicle] : [];
  }

  async findDriver(driverId: string): Promise<FuelDriverFacts | null> {
    if (driverId !== DRIVER && driverId !== OTHER_DRIVER) return null;
    return { id: driverId, fullName: `Lai xe ${driverId}` };
  }

  async findDriverByAuthUserId(authUserId: string): Promise<FuelDriverFacts | null> {
    return authUserId === AUTH_USER ? { id: DRIVER, fullName: 'Lai xe 1' } : null;
  }

  async wasDriverEverAssignedToTrip(_tripId: string, driverId: string): Promise<boolean> {
    return this.assignedDrivers.has(driverId);
  }

  async wasVehicleEverAssignedToTrip(_tripId: string, vehicleId: string): Promise<boolean> {
    return this.assignedVehicles.has(vehicleId);
  }
}

class RecordingCostingPort extends FuelCostingPort {
  readonly commands: FuelCostPostingCommand[] = [];

  async postFuelCost(command: FuelCostPostingCommand): Promise<string> {
    this.commands.push(command);
    // Khoa tat dinh -> CUNG mot id khoan chi. Do dung la hanh vi cua `CostingService` khi gap lai
    // mot `correlationKey` da dung: no tra lai dong da ghi thay vi ghi them mot dong nua.
    return `expense-of-${command.correlationKey}`;
  }
}

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const FUEL_POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: { 'tai-5-tan': 30 }, tolerancePercent: 10 },
};

let repository: InMemoryFuelRepository;
let core: StubCoreFacts;
let costing: RecordingCostingPort;
let service: FuelService;
let read: FuelReadService;
let supplierId: string;

beforeEach(async () => {
  repository = new InMemoryFuelRepository();
  core = new StubCoreFacts();
  costing = new RecordingCostingPort();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  service = new FuelService(repository, core, costing, audit, CORE_POLICY, FUEL_POLICY);
  read = new FuelReadService(repository, core);

  supplierId = (
    await repository.createSupplier({
      name: 'Cay xang mau',
      code: 'CX-01',
      phone: null,
      address: null,
      taxCode: null,
      at: new Date('2026-08-01T00:00:00Z'),
    })
  ).id;
});

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
      ...overrides,
    },
    'ke-toan',
  );

describe('Nop phieu — cong vao', () => {
  it('ghi phieu voi hai truc trang thai khoi diem', async () => {
    const entry = await submit();

    expect(entry).toMatchObject({
      verificationStatus: 'DECLARED',
      reconciliationStatus: 'UNMATCHED',
      litersUnits: 200_000,
      amount: 4_200_000,
      costExpenseId: null,
      sourceStatementId: null,
      declaredBy: 'ke-toan',
    });
  });

  /**
   * `INV-04` — chuyen thue xe ngoai KHONG duoc co mot phieu dau nao, ke ca o `DECLARED`.
   *
   * Manh hon cong tuong ung cua T3 (`DA-T3-03` van cho khoan `COMPANY_DIRECT`): T1 viet ro "khong
   * duoc co `FuelEntry` HAY `DriverFundEntry` nao". Dau cua xe nha xe la chi phi cua nha xe.
   */
  it('INV-04 — chuyen thue xe ngoai tu choi phieu dau, khong ghi gi', async () => {
    core.tripKind = 'EXTERNAL_CARRIER';

    await expect(submit()).rejects.toMatchObject({ reason: 'FUEL_ENTRY_TRIP_OUTSOURCED' });
    expect(await repository.listEntriesByTrip(TRIP)).toEqual([]);
    expect(costing.commands).toEqual([]);
  });

  it('chuyen nhan chay ho VAN nhan phieu — chi thue xe ngoai bi chan', async () => {
    core.tripKind = 'PARTNER_REFERRED_INTERNAL_RUN';
    await expect(submit()).resolves.toMatchObject({ tripId: TRIP });
  });

  it('chuyen da doi soat hoac da huy khong nhan phieu moi', async () => {
    core.tripStatus = 'RECONCILED';
    await expect(submit()).rejects.toMatchObject({ reason: 'FUEL_ENTRY_TRIP_RECONCILED' });

    core.tripStatus = 'CANCELLED';
    await expect(submit()).rejects.toMatchObject({ reason: 'FUEL_ENTRY_TRIP_CANCELLED' });
  });

  /**
   * Cung ly le voi `DA-T3-04`, va o T4 con chat hon: mot phieu ghi nham xe lam sai CA gia thanh
   * chuyen LAN so lieu tieu hao cua xe do — con so ma VT-046 dung de canh bao ky thuat.
   */
  it('lai xe/xe chua tung duoc phan cong vao chuyen thi bi tu choi, moi ben mot ma', async () => {
    await expect(submit({ driverId: OTHER_DRIVER })).rejects.toMatchObject({
      reason: 'FUEL_ENTRY_DRIVER_NOT_ASSIGNED',
    });

    core.assignedVehicles.clear();
    await expect(submit()).rejects.toMatchObject({ reason: 'FUEL_ENTRY_VEHICLE_NOT_ASSIGNED' });
  });

  it('phat lai cung khoa tra lai phieu cu; khoa dung lai cho phieu KHAC thi va cham', async () => {
    const first = await submit({ correlationKey: 'phieu-doc-nhat-1' });
    const replay = await submit({ correlationKey: 'phieu-doc-nhat-1' });
    expect(replay.id).toBe(first.id);
    expect(await repository.listEntriesByTrip(TRIP)).toHaveLength(1);

    await expect(
      submit({ correlationKey: 'phieu-doc-nhat-1', amount: 9_999_999 }),
    ).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
  });

  /**
   * DAU VAN TAY CHONG GHI TRUNG — Issue #103 §5.
   *
   * ===========================================================================
   * MOI BAI DUOI DAY TUNG LA MOT LAN GHI BI NUOT.
   *
   * Phep so sanh ban dau chi doc bay truong (chuyen/xe/lai xe/ngay/lit/tien/odo). Nam truong con
   * lai — cay xang, cach tra tien, khoanh khac, so hoa don, ghi chu — KHONG duoc doc. Nghia la: hai
   * lenh khac nhau o nhung truong do, gui cung mot khoa, duoc coi la MOT. Lenh thu hai bi bo im
   * lang, va nguoi gui nhan ve phieu cua lenh thu nhat nhu the moi thu deu on.
   *
   * `paymentMethod` la truong nguy hiem nhat, vi no khong mo ta phieu ma DIEU HUONG TIEN o `TX-03`:
   * `DRIVER_CASH` tru vao quy lai xe, `SUPPLIER_ACCOUNT` de cong ty tra cuoi thang. Nuot mot lan
   * doi giua hai gia tri do la tien that cua mot nguoi that, di sai cho, khong mot dau vet nao.
   */
  it('cung khoa + KHAC cay xang = va cham, khong phai phat lai', async () => {
    const other = await repository.createSupplier({
      name: 'Cay xang khac',
      code: 'CX-02',
      phone: null,
      address: null,
      taxCode: null,
      at: new Date('2026-08-01T00:00:00Z'),
    });
    await submit({ correlationKey: 'khoa-cay-xang' });

    await expect(
      submit({ correlationKey: 'khoa-cay-xang', supplierId: other.id }),
    ).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
  });

  it('cung khoa + KHAC cach tra tien = va cham (tien se di sai nguon o TX-03)', async () => {
    await submit({ correlationKey: 'khoa-tra-tien', paymentMethod: 'SUPPLIER_ACCOUNT' });

    await expect(
      submit({ correlationKey: 'khoa-tra-tien', paymentMethod: 'DRIVER_CASH' }),
    ).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
  });

  it('cung khoa + KHAC khoanh khac = va cham, du cung ngay nghiep vu', async () => {
    await submit({ correlationKey: 'khoa-gio', occurredAt: '2026-08-05T06:30:00+07:00' });

    await expect(
      submit({ correlationKey: 'khoa-gio', occurredAt: '2026-08-05T18:45:00+07:00' }),
    ).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
  });

  it('cung khoa + KHAC so hoa don hoac ghi chu = va cham', async () => {
    await submit({ correlationKey: 'khoa-hoa-don', invoiceNo: 'HD-001', note: 'ghi chu goc' });

    await expect(
      submit({ correlationKey: 'khoa-hoa-don', invoiceNo: 'HD-002', note: 'ghi chu goc' }),
    ).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
    await expect(
      submit({ correlationKey: 'khoa-hoa-don', invoiceNo: 'HD-001', note: 'ghi chu khac' }),
    ).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
  });

  /**
   * Chieu NGUOC LAI phai van de: mot lan gui lai DUNG NGUYEN VEN khong duoc bien thanh loi.
   *
   * Neu chi siet phep so sanh ma khong chuan hoa, mot mang chap chon gui lai cung mot phieu se
   * that bai — va bo test nay se do truoc khi mot nguoi that gap no.
   */
  it('gui lai DUNG y nguyen — ke ca khoanh khac ghi bang mui gio khac — van la phat lai', async () => {
    const first = await submit({
      correlationKey: 'khoa-phat-lai',
      occurredAt: '2026-08-05T06:30:00+07:00',
      invoiceNo: 'HD-001',
      note: null,
    });

    // `+07:00` va `Z` cua CUNG mot khoanh khac. So hai chuoi ISO se coi day la hai phieu khac nhau.
    const replay = await submit({
      correlationKey: 'khoa-phat-lai',
      occurredAt: '2026-08-04T23:30:00Z',
      invoiceNo: 'HD-001',
      note: null,
    });

    expect(replay.id).toBe(first.id);
    expect(await repository.listEntriesByTrip(TRIP)).toHaveLength(1);
  });

  /** `null`, `''` va `'  '` la ba cach go cua ba client cho cung mot y: khong ghi gi. */
  it('o van ban de trong duoi ba dang van la CUNG mot phieu', async () => {
    const first = await submit({ correlationKey: 'khoa-o-trong', note: null });
    const replay = await submit({ correlationKey: 'khoa-o-trong', note: '   ' });

    expect(replay.id).toBe(first.id);
    expect(await repository.listEntriesByTrip(TRIP)).toHaveLength(1);
  });

  it('tu choi so lit va odo khong hop le voi ma rieng cho tung truong', async () => {
    await expect(submit({ liters: '0' })).rejects.toMatchObject({ reason: 'FUEL_LITERS_INVALID' });
    await expect(submit({ odometerKm: -1 })).rejects.toMatchObject({
      reason: 'FUEL_ODOMETER_INVALID',
    });
  });
});

describe('Tieu hao va ly do can kiem tra — INV-06 + VT-046', () => {
  it('lan do dau dau tien cua mot xe khong co mau so, va do khong phai loi', async () => {
    const entry = await submit();
    expect(entry.consumptionUnits).toBeNull();
    expect(entry.reviewReasons).toEqual(['NO_PREVIOUS_ODOMETER']);
  });

  it('lan thu hai tinh duoc tieu hao tu odo cua lan truoc', async () => {
    await submit({ odometerKm: 100_000, correlationKey: 'lan-mot-1' });
    const second = await submit({
      odometerKm: 100_500,
      occurredAt: '2026-08-06T06:30:00+07:00',
      businessDate: '2026-08-06',
      correlationKey: 'lan-hai-11',
    });

    expect(second.previousOdometerKm).toBe(100_000);
    // FUEL-001: 200 lit / 500 km = 40,000 L/100km — vuot dinh muc 30 + 10% cua hang xe nay.
    expect(second.consumptionUnits).toBe(40_000);
    expect(second.reviewReasons).toEqual(['CONSUMPTION_ABOVE_NORM']);
  });

  it('INV-06 — odo lui thi khong chia, phieu VAN ghi duoc', async () => {
    await submit({ odometerKm: 100_500, correlationKey: 'lan-mot-2' });
    const second = await submit({
      odometerKm: 100_100,
      occurredAt: '2026-08-06T06:30:00+07:00',
      businessDate: '2026-08-06',
      correlationKey: 'lan-hai-22',
    });

    expect(second.consumptionUnits).toBeNull();
    expect(second.reviewReasons).toEqual(['ODOMETER_NOT_ADVANCED']);
  });
});

describe('Duyet phieu va chi phi vao gia thanh chuyen', () => {
  it('duyet mot lan -> DUNG MOT khoan chi o TX-03', async () => {
    const entry = await submit();
    const verified = await service.verifyFuelEntry(entry.id, 'ke-toan');

    expect(verified.verificationStatus).toBe('VERIFIED');
    expect(verified.verifiedBy).toBe('ke-toan');
    expect(verified.costExpenseId).toBe(`expense-of-fuel:${entry.id}`);
    expect(costing.commands).toHaveLength(1);
    expect(costing.commands[0]).toMatchObject({
      tripId: TRIP,
      fundedBy: 'COMPANY_DIRECT',
      driverId: null,
      amount: 4_200_000,
      correlationKey: `fuel:${entry.id}`,
    });
  });

  /**
   * BAI TEST CUA "DUNG MOT LAN": duyet lai KHONG duoc lam gia thanh chuyen tang len lan hai.
   *
   * Nhien lieu chiem 35-45% gia thanh chuyen theo nguon khach, nen mot lan dem hai khong phai mot
   * sai so — no lam ca bao cao lai/lo cua chuyen do vo nghia.
   */
  it('duyet lai KHONG ghi them khoan chi thu hai', async () => {
    const entry = await submit();
    await service.verifyFuelEntry(entry.id, 'ke-toan');
    const again = await service.verifyFuelEntry(entry.id, 'ke-toan');

    expect(again.costExpenseId).toBe(`expense-of-fuel:${entry.id}`);
    expect(costing.commands).toHaveLength(1);
  });

  /**
   * Lai xe tra tien mat -> khoan chi di duong QUY LAI XE; ky so no -> cong ty tra thang.
   *
   * Doan sai chieu nay lam so quy lai xe lech dung bang so tien do: ho bi tru cho mot khoan cong ty
   * se tra cuoi thang theo bang ke.
   */
  it('cach tra tien quyet dinh nguon tien cua khoan chi', async () => {
    const cash = await submit({ paymentMethod: 'DRIVER_CASH', correlationKey: 'tien-mat-01' });
    await service.verifyFuelEntry(cash.id, 'ke-toan');

    expect(costing.commands[0]).toMatchObject({ fundedBy: 'DRIVER_FUND', driverId: DRIVER });
  });

  it('tra lai phieu thi KHONG co khoan chi nao, va phieu nop lai duoc', async () => {
    const entry = await submit();
    const rejected = await service.rejectFuelEntry(entry.id, 'Anh mo, khong doc duoc so', 'ke-toan');

    expect(rejected.verificationStatus).toBe('REJECTED');
    expect(rejected.reviewNote).toBe('Anh mo, khong doc duoc so');
    expect(costing.commands).toEqual([]);

    const resubmitted = await service.resubmitFuelEntry(entry.id, 'lai-xe');
    expect(resubmitted.verificationStatus).toBe('DECLARED');
    expect(resubmitted.rejectedAt).toBeNull();
  });

  it('phieu da duyet khong tra lai duoc — may trang thai khong co canh do', async () => {
    const entry = await submit();
    await service.verifyFuelEntry(entry.id, 'ke-toan');

    await expect(service.rejectFuelEntry(entry.id, 'doi y', 'ke-toan')).rejects.toMatchObject({
      reason: 'FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED',
    });
  });
});

describe('GD-10 — sua duoc khi con DECLARED, sau do chi dao', () => {
  const amendment = {
    liters: '180',
    amount: 3_800_000,
    odometerKm: 100_600,
    occurredAt: '2026-08-05T06:30:00+07:00',
    businessDate: '2026-08-05',
    paymentMethod: 'SUPPLIER_ACCOUNT' as const,
  };

  it('phieu con DECLARED va UNMATCHED thi sua duoc', async () => {
    const entry = await submit();
    const amended = await service.amendFuelEntry(entry.id, { ...amendment, supplierId }, 'ke-toan');

    expect(amended.litersUnits).toBe(180_000);
    expect(amended.amount).toBe(3_800_000);
  });

  it('phieu DA DUYET khong sua duoc — duong dung la dao khoan chi', async () => {
    const entry = await submit();
    await service.verifyFuelEntry(entry.id, 'ke-toan');

    await expect(
      service.amendFuelEntry(entry.id, { ...amendment, supplierId }, 'ke-toan'),
    ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_AMEND_ALREADY_TRUSTED' });
  });

  /**
   * HAI TRUC DEU PHAI MO. Mot phieu con `DECLARED` nhung DA KHOP van khong sua duoc — neu khong,
   * cap khop lap tuc noi doi, vi no da duoc ghi voi mot chenh lech do tren con so cu.
   */
  it('phieu DA KHOP khong sua duoc du van con DECLARED', async () => {
    const entry = await submit();

    // Ky doi soat THAT chu khong mot id bia ra: `applyMatchingRun` khoa hang doi soat truoc khi
    // ghi (Issue #103 §1), nen mot ky khong ton tai gio la mot loi — dung nhu no phai the.
    const { reconciliation } = await repository.createStatementWithReconciliation({
      supplierId,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      format: 'CSV',
      sourceRef: 'bang-ke.csv',
      sourceDigest: 'digest-ky-1',
      lines: [],
      importedBy: 'ke-toan',
      at: new Date('2026-09-01T00:00:00Z'),
    });

    await repository.applyMatchingRun({
      reconciliationId: reconciliation.id,
      matches: [],
      discrepancies: [],
      lineStatuses: new Map(),
      entryStatuses: new Map([[entry.id, 'MATCHED']]),
      actor: 'ke-toan',
      at: new Date('2026-09-01T00:00:00Z'),
    });

    await expect(
      service.amendFuelEntry(entry.id, { ...amendment, supplierId }, 'ke-toan'),
    ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED' });
  });
});

describe('Be mat lai xe — INV-09 va pham vi cua chinh minh', () => {
  it('khung nhin lai xe KHONG mang mot truong so sach nao', async () => {
    const entry = await submit();
    const view = toDriverFuelSlipView(entry, []);

    for (const forbidden of ['costExpenseId', 'sourceStatementId', 'declaredBy', 'freightAmount']) {
      expect(Object.keys(view)).not.toContain(forbidden);
    }
    expect(JSON.stringify(view)).not.toContain('freight');
  });

  it('lai xe chi doc duoc phieu cua chinh minh', async () => {
    const mine = await submit();
    core.assignedDrivers.add(OTHER_DRIVER);
    const theirs = await submit({ driverId: OTHER_DRIVER, correlationKey: 'phieu-nguoi-khac' });

    await expect(read.getMyFuelSlip(AUTH_USER, mine.id)).resolves.toMatchObject({ id: mine.id });
    await expect(read.getMyFuelSlip(AUTH_USER, theirs.id)).rejects.toMatchObject({
      reason: 'SELF_FUEL_SCOPE_NOT_OWNED',
    });
    expect(await read.listMyFuelSlips(AUTH_USER)).toHaveLength(1);
  });

  it('tai khoan chua noi voi ho so lai xe nao bi tu choi co ma, khong phai 500', async () => {
    await expect(read.listMyFuelSlips('user-la')).rejects.toBeInstanceOf(TransportDomainError);
    await expect(read.listMyFuelSlips('user-la')).rejects.toMatchObject({
      reason: 'SELF_FUEL_SCOPE_NO_DRIVER_BINDING',
    });
  });
});
