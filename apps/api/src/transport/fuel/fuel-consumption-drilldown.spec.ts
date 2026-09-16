import { describe, expect, it } from 'vitest';
import {
  buildFuelConsumptionDrilldown,
  type FuelConsumptionDrilldownInput,
  type FuelConsumptionLink,
} from './fuel-consumption-drilldown.js';
import type { FuelVerificationStatus } from './fuel-lifecycle.js';
import type { FuelEntry } from './fuel.types.js';

/**
 * DRILL-DOWN TIEU HAO — `#313`, hang doi `G10` cua `#295`.
 *
 * Bo test nay khoa HAI dieu, va thu tu quan trong:
 *
 *   1. KHONG BIA SO. Odo khong tang, khong co moc truoc, hay mot lan do xen giua khong co moc hop
 *      le deu cho `consumptionUnits = null` kem mot trang thai CO MA — khong bao gio mot con so
 *      "gan dung".
 *   2. Chuoi di theo MOC HOP LE, khong theo phieu lien truoc bat ky. Phieu bi tu choi khong phai
 *      mot moc km.
 *
 * Moi con so o day tinh tay duoc tu `L/100km = lit / km * 100`, don vi luu tru ty le 3.
 */

const VEHICLE = 'xe-1';

let sequence = 0;

const entry = (input: {
  readonly odometerKm: number;
  readonly liters: number;
  readonly businessDate: string;
  readonly time?: string;
  readonly id?: string;
  readonly verificationStatus?: FuelVerificationStatus;
  readonly recordedPreviousOdometerKm?: number | null;
  readonly recordedConsumptionUnits?: number | null;
}): FuelEntry => {
  sequence += 1;
  const id = input.id ?? `phieu-${String(sequence).padStart(3, '0')}`;
  return {
    id,
    tripId: `chuyen-${id}`,
    vehicleId: VEHICLE,
    driverId: 'lai-xe-1',
    supplierId: 'cay-xang-1',
    businessDate: input.businessDate,
    occurredAt: `${input.businessDate}T${input.time ?? '08:00:00'}.000Z`,
    litersUnits: input.liters * 1000,
    amount: input.liters * 23_000,
    currencyCode: 'VND',
    odometerKm: input.odometerKm,
    previousOdometerKm: input.recordedPreviousOdometerKm ?? null,
    consumptionUnits: input.recordedConsumptionUnits ?? null,
    reviewReasons: [],
    paymentMethod: 'SUPPLIER_ACCOUNT',
    verificationStatus: input.verificationStatus ?? 'VERIFIED',
    reconciliationStatus: 'UNMATCHED',
    sourceStatementId: null,
    costExpenseId: null,
    correlationKey: `khoa-${id}`,
    invoiceNo: null,
    note: null,
    declaredBy: 'lai-xe-1',
    verifiedAt: null,
    verifiedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    reviewNote: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
};

const build = (overrides: Partial<FuelConsumptionDrilldownInput>) =>
  buildFuelConsumptionDrilldown({
    entries: [],
    leadIn: null,
    normL100km: null,
    tolerancePercent: 10,
    ...overrides,
  });

const byEntry = (links: readonly FuelConsumptionLink[], id: string): FuelConsumptionLink => {
  const found = links.find((link) => link.entryId === id);
  if (!found) throw new Error(`khong co mat xich ${id}`);
  return found;
};

describe('chuoi km hop le -> L/100km', () => {
  it('moc truoc -> km hien tai -> quang duong -> so lit -> L/100km, dung tung buoc', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const b = entry({ id: 'b', odometerKm: 1_400, liters: 120, businessDate: '2026-09-03' });
    const c = entry({ id: 'c', odometerKm: 1_900, liters: 150, businessDate: '2026-09-05' });

    const result = build({ entries: [a, b, c] });

    expect(byEntry(result.links, 'a')).toMatchObject({
      state: 'NO_PREVIOUS_ODOMETER',
      previousOdometerKm: null,
      distanceKm: null,
      consumptionUnits: null,
    });
    expect(byEntry(result.links, 'b')).toMatchObject({
      state: 'COMPUTED',
      previousEntryId: 'a',
      previousOdometerKm: 1_000,
      odometerKm: 1_400,
      distanceKm: 400,
      litersUnits: 120_000,
      // 120 L / 400 km * 100 = 30 L/100km -> 30.000 don vi
      consumptionUnits: 30_000,
    });
    expect(byEntry(result.links, 'c')).toMatchObject({
      state: 'COMPUTED',
      previousEntryId: 'b',
      distanceKm: 500,
      consumptionUnits: 30_000,
    });
  });

  it('moc TRUOC KY (lead-in) la moc cua phieu dau ky', () => {
    const leadIn = entry({ id: 'truoc', odometerKm: 800, liters: 40, businessDate: '2026-08-30' });
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });

    const result = build({ entries: [a], leadIn });

    expect(result.leadIn).toEqual({
      entryId: 'truoc',
      businessDate: '2026-08-30',
      occurredAt: leadIn.occurredAt,
      odometerKm: 800,
    });
    // 60 L / 200 km * 100 = 30 L/100km
    expect(byEntry(result.links, 'a')).toMatchObject({
      state: 'COMPUTED',
      previousEntryId: 'truoc',
      distanceKm: 200,
      consumptionUnits: 30_000,
    });
  });

  it('thu tu la (ngay nghiep vu, thoi diem, id) — khong phu thuoc thu tu dau vao', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 50, businessDate: '2026-09-01' });
    const b = entry({
      id: 'b',
      odometerKm: 1_200,
      liters: 60,
      businessDate: '2026-09-02',
      time: '07:00:00',
    });
    const c = entry({
      id: 'c',
      odometerKm: 1_500,
      liters: 90,
      businessDate: '2026-09-02',
      time: '18:00:00',
    });

    const forward = build({ entries: [a, b, c] });
    const shuffled = build({ entries: [c, a, b] });

    expect(shuffled).toEqual(forward);
    expect(forward.links.map((link) => link.entryId)).toEqual(['a', 'b', 'c']);
  });

  it('khong sua mang dau vao', () => {
    const entries = Object.freeze([
      entry({ id: 'b', odometerKm: 1_400, liters: 120, businessDate: '2026-09-03' }),
      entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' }),
    ]);

    expect(() => build({ entries })).not.toThrow();
    expect(entries.map((row) => row.id)).toEqual(['b', 'a']);
  });
});

describe('odo khong hop le -> KHONG bia L/100km', () => {
  it('odo LUI -> ODOMETER_NOT_ADVANCED, quang duong am duoc giu de nguoi soat thay, khong co tieu hao', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const b = entry({ id: 'b', odometerKm: 950, liters: 50, businessDate: '2026-09-02' });

    const link = byEntry(build({ entries: [a, b] }).links, 'b');

    expect(link).toMatchObject({
      state: 'ODOMETER_NOT_ADVANCED',
      previousOdometerKm: 1_000,
      distanceKm: -50,
      consumptionUnits: null,
    });
  });

  it('odo DUNG YEN (0 km) -> ODOMETER_NOT_ADVANCED, khong chia cho 0', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const b = entry({ id: 'b', odometerKm: 1_000, liters: 50, businessDate: '2026-09-02' });

    const link = byEntry(build({ entries: [a, b] }).links, 'b');

    expect(link.state).toBe('ODOMETER_NOT_ADVANCED');
    expect(link.distanceKm).toBe(0);
    expect(link.consumptionUnits).toBeNull();
  });

  it('phieu SAU mot odo hong: moc van la moc hop le cu, nhung so lit khong con phu du quang duong -> khong tinh', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const hong = entry({ id: 'hong', odometerKm: 950, liters: 50, businessDate: '2026-09-02' });
    const c = entry({ id: 'c', odometerKm: 1_500, liters: 100, businessDate: '2026-09-03' });
    const d = entry({ id: 'd', odometerKm: 1_800, liters: 90, businessDate: '2026-09-04' });

    const result = build({ entries: [a, hong, c, d] });

    // 100 L / 500 km se ra 20 L/100km — mot con so SAI, vi 50 L do o phieu hong cung da chay tren
    // doan do. Khong tinh la cau tra loi trung thuc duy nhat.
    expect(byEntry(result.links, 'c')).toMatchObject({
      state: 'PREVIOUS_FILL_UNANCHORED',
      previousEntryId: 'a',
      previousOdometerKm: 1_000,
      distanceKm: 500,
      consumptionUnits: null,
    });
    // ...va chuoi noi lai ngay sau do, tu moc hop le moi.
    expect(byEntry(result.links, 'd')).toMatchObject({
      state: 'COMPUTED',
      previousEntryId: 'c',
      distanceKm: 300,
      consumptionUnits: 30_000,
    });
  });

  it('khong co moc nao truoc do -> NO_PREVIOUS_ODOMETER, va phieu do tro thanh moc', () => {
    const a = entry({ id: 'a', odometerKm: 5_000, liters: 60, businessDate: '2026-09-01' });

    const result = build({ entries: [a] });

    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      state: 'NO_PREVIOUS_ODOMETER',
      consumptionUnits: null,
    });
    expect(result.summary.consumptionUnits).toBeNull();
  });
});

describe('phieu bi tu choi khong phai moc km', () => {
  it('REJECTED duoc liet ke nhung nam ngoai chuoi, va phieu sau noi vao moc hop le truoc no', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const bo = entry({
      id: 'bo',
      odometerKm: 1_200,
      liters: 40,
      businessDate: '2026-09-02',
      verificationStatus: 'REJECTED',
    });
    const b = entry({
      id: 'b',
      odometerKm: 1_500,
      liters: 150,
      businessDate: '2026-09-03',
      // Luc khai, may chu lay odo cua phieu lien truoc BAT KY — chinh la phieu sau nay bi tu choi.
      recordedPreviousOdometerKm: 1_200,
      recordedConsumptionUnits: 50_000,
    });

    const result = build({ entries: [a, bo, b] });

    expect(byEntry(result.links, 'bo')).toMatchObject({
      state: 'EXCLUDED_REJECTED',
      previousOdometerKm: null,
      distanceKm: null,
      consumptionUnits: null,
      insights: [],
    });
    expect(byEntry(result.links, 'b')).toMatchObject({
      state: 'COMPUTED',
      previousEntryId: 'a',
      distanceKm: 500,
      consumptionUnits: 30_000,
      recorded: { previousOdometerKm: 1_200, consumptionUnits: 50_000, reviewReasons: [] },
    });
    expect(byEntry(result.links, 'b').insights).toContain('RECORDED_SNAPSHOT_DIFFERS');
  });

  it('mot moc truoc ky bi tu choi bi bo qua, khong duoc dung lam moc', () => {
    const leadIn = entry({
      id: 'truoc',
      odometerKm: 800,
      liters: 40,
      businessDate: '2026-08-30',
      verificationStatus: 'REJECTED',
    });
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });

    const result = build({ entries: [a], leadIn });

    expect(result.leadIn).toBeNull();
    expect(byEntry(result.links, 'a').state).toBe('NO_PREVIOUS_ODOMETER');
  });
});

describe('canh bao chi la insight', () => {
  it('vuot dinh muc + dung sai -> CONSUMPTION_ABOVE_NORM tren mat xich da tinh', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    // 160 L / 400 km = 40 L/100km > 30 * 1,1 = 33. Anh chup luc khai KHOP chuoi, nen canh bao duy
    // nhat con lai la vuot dinh muc.
    const b = entry({
      id: 'b',
      odometerKm: 1_400,
      liters: 160,
      businessDate: '2026-09-02',
      recordedPreviousOdometerKm: 1_000,
      recordedConsumptionUnits: 40_000,
    });

    const result = build({ entries: [a, b], normL100km: 30, tolerancePercent: 10 });

    expect(byEntry(result.links, 'b')).toMatchObject({
      consumptionUnits: 40_000,
      insights: ['CONSUMPTION_ABOVE_NORM'],
    });
    expect(result.summary.aboveNormCount).toBe(1);
  });

  it('trong dung sai, hoac hang xe chua co dinh muc -> khong canh bao', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    // 128 L / 400 km = 32 L/100km — duoi tran 33, khong dat dung bien so thuc cua dung sai.
    const b = entry({
      id: 'b',
      odometerKm: 1_400,
      liters: 128,
      businessDate: '2026-09-02',
      recordedPreviousOdometerKm: 1_000,
      recordedConsumptionUnits: 32_000,
    });

    expect(byEntry(build({ entries: [a, b], normL100km: 30 }).links, 'b').insights).toEqual([]);
    expect(byEntry(build({ entries: [a, b], normL100km: null }).links, 'b').insights).toEqual([]);
  });

  it('mat xich KHONG tinh duoc thi khong bao gio mang canh bao vuot dinh muc', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const b = entry({ id: 'b', odometerKm: 990, liters: 400, businessDate: '2026-09-02' });

    const link = byEntry(build({ entries: [a, b], normL100km: 1 }).links, 'b');

    expect(link.state).toBe('ODOMETER_NOT_ADVANCED');
    expect(link.insights).not.toContain('CONSUMPTION_ABOVE_NORM');
  });

  it('mat xich khong mang so tien, khong mang lai xe — drill-down khong phai mot phieu no', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const b = entry({ id: 'b', odometerKm: 1_400, liters: 160, businessDate: '2026-09-02' });

    const link = byEntry(build({ entries: [a, b], normL100km: 30 }).links, 'b');

    expect(Object.keys(link)).not.toContain('amount');
    expect(Object.keys(link)).not.toContain('driverId');
  });
});

describe('tong ky', () => {
  it('chi cong mat xich DA TINH: tong lit / tong km, cung phep so hoc nguyen', () => {
    const a = entry({ id: 'a', odometerKm: 1_000, liters: 60, businessDate: '2026-09-01' });
    const b = entry({ id: 'b', odometerKm: 1_400, liters: 120, businessDate: '2026-09-02' });
    const hong = entry({ id: 'hong', odometerKm: 1_300, liters: 30, businessDate: '2026-09-03' });
    const c = entry({ id: 'c', odometerKm: 1_900, liters: 150, businessDate: '2026-09-04' });
    const d = entry({ id: 'd', odometerKm: 2_200, liters: 99, businessDate: '2026-09-05' });
    const bo = entry({
      id: 'bo',
      odometerKm: 2_100,
      liters: 10,
      businessDate: '2026-09-06',
      verificationStatus: 'REJECTED',
    });
    const cho = entry({
      id: 'cho',
      odometerKm: 2_500,
      liters: 90,
      businessDate: '2026-09-07',
      verificationStatus: 'DECLARED',
    });

    const { summary } = build({ entries: [a, b, hong, c, d, bo, cho] });

    // Da tinh: b (400 km, 120 L), d (300 km, 99 L), cho (300 km, 90 L).
    // c = PREVIOUS_FILL_UNANCHORED, hong = ODOMETER_NOT_ADVANCED, a = NO_PREVIOUS_ODOMETER.
    expect(summary).toEqual({
      entryCount: 7,
      computedCount: 3,
      reviewCount: 3,
      excludedCount: 1,
      unverifiedCount: 1,
      aboveNormCount: 0,
      totalLitersUnits: 309_000,
      totalDistanceKm: 1_000,
      // 309 L / 1000 km * 100 = 30,9 L/100km
      consumptionUnits: 30_900,
      stateCounts: {
        COMPUTED: 3,
        NO_PREVIOUS_ODOMETER: 1,
        ODOMETER_NOT_ADVANCED: 1,
        PREVIOUS_FILL_UNANCHORED: 1,
        EXCLUDED_REJECTED: 1,
      },
    });
  });

  it('khong co phieu nao -> tong rong, khong co con so tieu hao', () => {
    const result = build({ entries: [] });

    expect(result.links).toEqual([]);
    expect(result.summary.consumptionUnits).toBeNull();
    expect(result.summary.entryCount).toBe(0);
  });
});
