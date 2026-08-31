import { loadTenantConfig } from '@netviet/tenant';
import type { FuelMatchTolerance } from './fuel-matching.js';

/**
 * Chinh sach cua `transport-fuel` — phan CAU HINH THEO KHACH, khong phai bat bien cua mien.
 *
 * T1 §10.1 khai capability nay can `transportFuel` (dinh muc, dung sai, khoa so khop). Ca ba deu la
 * lua chon cua khach, khong phai luat ke toan — nen chung o goi khach.
 *
 * Khoi cau hinh HOAN TOAN TUY CHON, cung ly le voi `transportCore`/`transportCosting`: bat mot
 * khach van tai phai go mot khoi rong chi de he thong khoi chet la mot yeu cau khong phuc vu ai.
 *
 * ---------------------------------------------------------------------------
 * KHAC `transportCosting` O MOT DIEM QUAN TRONG: mac dinh o day KHONG RONG.
 *
 * `expenseCategories` cua T3 mac dinh rong = khong gioi han, vi mot danh muc do CHUNG TA nghi ra se
 * bi doc nhu danh muc cua khach. Nhung dung sai so khop thi nguoc lai: `GD-08` DA GHI TEN mot con
 * so cu the (`+-1.000d`, `+-1 ngay`) va ghi ro do la gia dinh cua chung ta voi chi phi dao nguoc
 * "thap". Mot mac dinh rong o day khong co nghia gi — "khong dung sai" la `0`, va `0` se lam moi
 * bang ke viet tay khong khop mot dong nao.
 *
 * Nen mac dinh la con so cua `GD-08`, va no duoc ghi ten o day chu khong nam rai trong service.
 */

/** `GD-08` — mac dinh cua chung ta, khong phai loi khach. */
export const DEFAULT_FUEL_AMOUNT_TOLERANCE_VND = 1_000;
export const DEFAULT_FUEL_BUSINESS_DATE_TOLERANCE_DAYS = 1;

/**
 * Vuot dinh muc bao nhieu phan tram thi danh dau can kiem tra.
 *
 * `10` la mot con so cua CHUNG TA (VT-046 chi noi "canh bao khi vuot dinh muc", khong cho nguong).
 * Dat 0 se lam moi chuyen duong doi hoi hon dinh muc mot chut deu keu; dat qua cao thi canh bao
 * khong bao gio phat. Khach doi duoc bang mot dong cau hinh.
 */
export const DEFAULT_FUEL_CONSUMPTION_TOLERANCE_PERCENT = 10;

/**
 * TEN COT MAC DINH cua file bang ke — tieng Viet, vi bang ke cua cay xang Viet Nam la tieng Viet.
 *
 * Day KHONG phai mot gia dinh ve khach nao ca: no la mot bo mac dinh de mot file mau chay duoc
 * ngay, va moi khach ghi de duoc tung cot mot. Khong khai gi ma van doc duoc mot file la khac biet
 * giua mot demo bam duoc nut va mot demo phai cau hinh truoc khi thay gi.
 */
export const DEFAULT_FUEL_STATEMENT_COLUMNS = {
  vehiclePlate: 'Bien so',
  businessDate: 'Ngay',
  liters: 'So lit',
  amount: 'Thanh tien',
  invoiceNo: 'So hoa don',
  note: 'Ghi chu',
} as const;

export type FuelStatementColumnKey = keyof typeof DEFAULT_FUEL_STATEMENT_COLUMNS;

/** Dang ngay trong file bang ke. `dmy` la mau Viet Nam (`15/08/2026`). */
export const FUEL_STATEMENT_DATE_FORMATS = ['iso', 'dmy'] as const;
export type FuelStatementDateFormat = (typeof FUEL_STATEMENT_DATE_FORMATS)[number];

export interface FuelStatementMappingPolicy {
  readonly columns: Readonly<Record<FuelStatementColumnKey, string>>;
  readonly dateFormat: FuelStatementDateFormat;
}

export interface FuelConsumptionPolicy {
  /** Dinh muc L/100km theo `vehicleClass`. Hang xe khong khai = khong co gi de so. */
  readonly normsByVehicleClass: Readonly<Record<string, number>>;
  readonly tolerancePercent: number;
}

export interface TransportFuelPolicy {
  readonly matching: FuelMatchTolerance;
  readonly statement: FuelStatementMappingPolicy;
  readonly consumption: FuelConsumptionPolicy;
}

export const TRANSPORT_FUEL_POLICY = Symbol('TRANSPORT_FUEL_POLICY');

export function tenantTransportFuelPolicy(): TransportFuelPolicy {
  const configured = loadTenantConfig().policies.transportFuel;

  return {
    matching: {
      amountVnd: configured?.matching?.amountToleranceVnd ?? DEFAULT_FUEL_AMOUNT_TOLERANCE_VND,
      businessDateDays:
        configured?.matching?.businessDateToleranceDays ??
        DEFAULT_FUEL_BUSINESS_DATE_TOLERANCE_DAYS,
    },
    statement: {
      columns: {
        ...DEFAULT_FUEL_STATEMENT_COLUMNS,
        ...stripUndefined(configured?.statement?.columns),
      },
      dateFormat: configured?.statement?.dateFormat ?? 'iso',
    },
    consumption: {
      normsByVehicleClass: configured?.consumption?.normsByVehicleClass ?? {},
      tolerancePercent:
        configured?.consumption?.tolerancePercent ?? DEFAULT_FUEL_CONSUMPTION_TOLERANCE_PERCENT,
    },
  };
}

/**
 * Bo cac khoa co gia tri `undefined` TRUOC khi trai len mac dinh.
 *
 * Zod tra ve doi tuong co khoa nhung gia tri `undefined` cho truong `.optional()` khong khai. Trai
 * thang mot doi tuong nhu vay len mac dinh se GHI DE mac dinh bang `undefined` — tuc mot goi khach
 * khai DUY NHAT cot `Bien so` se lam nam cot con lai bien mat, va file mau ngung doc duoc voi mot
 * loi "thieu cot" kho hieu.
 */
function stripUndefined(
  source: Partial<Record<FuelStatementColumnKey, string | undefined>> | undefined,
): Partial<Record<FuelStatementColumnKey, string>> {
  if (!source) return {};
  const result: Partial<Record<FuelStatementColumnKey, string>> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') result[key as FuelStatementColumnKey] = value;
  }
  return result;
}

/**
 * DINH MUC cua mot hang xe, hoac `null` khi khach chua khai.
 *
 * `null` chu khong `0`: `0` se lam moi phieu vuot muc. Xem `exceedsConsumptionNorm()` — no doc dung
 * `null` la "khong co gi de so", va do la cau tra loi trung thuc khi khach chua nhap dinh muc.
 */
export const consumptionNormFor = (
  policy: TransportFuelPolicy,
  vehicleClass: string,
): number | null => policy.consumption.normsByVehicleClass[vehicleClass] ?? null;
