/**
 * SO LIT va TIEU HAO — SO NGUYEN CO TY LE, khong bao gio so thuc nhi phan.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG `number` THAP PHAN THANG:
 *
 * `0.1 + 0.2 === 0.30000000000000004`. Voi tien thi `money.ts` da giai quyet bang cach luu DONG
 * nguyen; voi lit thi khong co "don vi nho nhat" tu nhien nao, nen phai CHON mot ty le va ghi ro.
 * Chon 3 chu so thap phan (mililit) vi do la do phan giai cua voi bom o cay xang Viet Nam — bang ke
 * in ra `12,345 L`, khong bao gio min hon.
 *
 * Neu de `Float` vao day thi kieu hong khong phai "sai mot phep tinh": no la mot ky doi soat trong
 * nhu khop het, roi tong lit cua ky lech vai chuc mililit so voi tong tren bang ke giay — va khong
 * ai tim ra cho lech vi tung dong deu doc len dung.
 *
 * ---------------------------------------------------------------------------
 * BIEN GIOI LUU TRU la CHUOI, khong phai `Prisma.Decimal`.
 *
 * Cot la `NUMERIC(12,3)`/`NUMERIC(10,3)`. Prisma nhan mot CHUOI cho cot `Decimal` va tra ve mot doi
 * tuong co `toString()` cho ra dung con so thap phan. Di qua chuoi thay vi import kieu `Decimal`
 * cua client sinh ra giu dung nguyen tac ma cac repository khac cua mien nay da ghi: tang kho KHONG
 * phu thuoc vao ban sinh cua Prisma.
 *
 * ---------------------------------------------------------------------------
 * DAT O DAU: cung cho voi `money.ts` — trong thu muc cua mien, khong o `packages/`. T1 §19 xep
 * primitive so/lam tron vao `PG-03` cua Platform Track; o day chi co dung phan T4 that su dung.
 */

import type { FuelReviewReason } from './fuel-lifecycle.js';

/** So chu so thap phan cua cot `liters` — khop `NUMERIC(12,3)` cua DB. */
export const LITERS_SCALE = 3;
/** Mot lit = bao nhieu don vi luu tru (mililit). */
export const LITERS_UNITS_PER_LITER = 1000;

/** So chu so thap phan cua cot `consumptionL100km` — khop `NUMERIC(10,3)`. */
export const CONSUMPTION_SCALE = 3;
export const CONSUMPTION_UNITS_PER_L100KM = 1000;

/**
 * Bien tren, LAY TU DUNG hinh dang cot chu khong tu `Number.MAX_SAFE_INTEGER`.
 *
 * `NUMERIC(12,3)` chua toi da `999999999.999` lit = `999_999_999_999` mililit. Neu ham nay cho qua
 * mot so lon hon thi gia tri se qua duoc ca kiem HTTP lan kiem mien roi chet o `INSERT` — dung cai
 * lech ma T2.1/F1 da va cho cot gia cuoc. Bien cua mien va bien cua cot phai la MOT.
 */
export const MAX_LITERS_UNITS = 999_999_999_999;
/** `NUMERIC(10,3)` chua toi da `9999999.999` L/100km. */
export const MAX_CONSUMPTION_UNITS = 9_999_999_999;

export class FuelQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FuelQuantityError';
  }
}

/** Chi nhan dang thap phan don gian, khong dau, khong dang mu. */
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d{1,9}))?$/;

/**
 * Doi mot so lit NGUOI NHAP thanh so nguyen mililit — KHONG qua mot phep nhan so thuc nao.
 *
 * `Math.round(value * 1000)` trong duoc va gan nhu luon dung, nhung "gan nhu" o day co gia: no dua
 * mot phep nhan so thuc vao dung cho ma ca tep nay ton tai de tranh. Thay vao do di qua CHUOI —
 * `String(12.345) === '12.345'` vi JavaScript in ra bieu dien ngan nhat quay vong duoc — roi dem
 * du ba chu so thap phan va doc ra mot so nguyen.
 *
 * Nhan ca `string` vi bang ke doc tu CSV/XLSX den duoi dang chuoi, va doi no sang `number` truoc
 * khi vao day la lam mat chinh xac o dung buoc khong can thiet.
 */
export function litersToUnits(value: number | string): number {
  const text = typeof value === 'number' ? decimalTextOf(value) : value.trim();
  const matched = DECIMAL_PATTERN.exec(text);
  if (!matched) {
    throw new FuelQuantityError(`So lit phai la mot so thap phan khong am, nhan duoc: ${text}`);
  }

  const [, whole, fraction = ''] = matched;
  if (fraction.length > LITERS_SCALE) {
    throw new FuelQuantityError(
      `So lit chi nhan toi ${LITERS_SCALE} chu so thap phan, nhan duoc: ${text}`,
    );
  }

  const units = Number(`${whole}${fraction.padEnd(LITERS_SCALE, '0')}`);
  if (!Number.isSafeInteger(units) || units > MAX_LITERS_UNITS) {
    throw new FuelQuantityError(`So lit vuot khoang bieu dien duoc: ${text}`);
  }
  if (units <= 0) {
    throw new FuelQuantityError(
      'So lit phai lon hon 0 — mot phieu 0 lit khong phai mot lan do dau',
    );
  }
  return units;
}

/**
 * Mot `number` -> chuoi thap phan, CHAN dang mu.
 *
 * `String(1e21) === '1e+21'`, va chuoi do khong khop `DECIMAL_PATTERN` — nen no bi tu choi voi dung
 * thong diep "vuot khoang" thay vi lot qua thanh mot so vo nghia. Kiem `Number.isFinite` truoc de
 * `NaN`/`Infinity` khong tro thanh mot chuoi khong ai doc duoc.
 */
function decimalTextOf(value: number): string {
  if (!Number.isFinite(value)) {
    throw new FuelQuantityError(`So lit khong hop le: ${String(value)}`);
  }
  return String(value);
}

/** Don vi luu tru -> chuoi thap phan dung cho cot `NUMERIC(12,3)`. Vd `200000` -> `"200.000"`. */
export const formatLiters = (units: number): string => formatScaled(units, LITERS_SCALE);

/** Nhu tren cho tieu hao: `40000` -> `"40.000"`. */
export const formatConsumption = (units: number): string => formatScaled(units, CONSUMPTION_SCALE);

function formatScaled(units: number, scale: number): string {
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new FuelQuantityError(`Gia tri co ty le phai la so nguyen khong am: ${String(units)}`);
  }
  const text = String(units).padStart(scale + 1, '0');
  return `${text.slice(0, text.length - scale)}.${text.slice(text.length - scale)}`;
}

/**
 * Cot `NUMERIC` doc len -> don vi luu tru.
 *
 * Nhan `{ toString(): string }` chu khong `Decimal` cua Prisma: tang kho cua mien nay CO Y khong
 * phu thuoc vao ban sinh cua client (xem chu thich `model()` trong cac repository). Mot chuoi
 * `'200.000'` va mot `Decimal(200)` deu di qua day duoc, va ca hai ra cung mot so.
 */
export function litersFromStored(stored: { toString(): string } | null): number | null {
  if (stored === null) return null;
  return litersToUnits(stored.toString());
}

export function consumptionFromStored(stored: { toString(): string } | null): number | null {
  if (stored === null) return null;
  const text = stored.toString().trim();
  const matched = DECIMAL_PATTERN.exec(text);
  if (!matched) {
    throw new FuelQuantityError(`Tieu hao doc len khong phai mot so thap phan: ${text}`);
  }
  const [, whole, fraction = ''] = matched;
  const units = Number(
    `${whole}${fraction.slice(0, CONSUMPTION_SCALE).padEnd(CONSUMPTION_SCALE, '0')}`,
  );
  if (!Number.isSafeInteger(units) || units > MAX_CONSUMPTION_UNITS) {
    throw new FuelQuantityError(`Tieu hao doc len vuot khoang bieu dien duoc: ${text}`);
  }
  return units;
}

export interface ConsumptionInput {
  /** So lit da do sang don vi luu tru (mililit). */
  readonly litersUnits: number;
  readonly odometerKm: number;
  /** Odo cua lan do dau TRUOC cua chinh xe do. `null` = chua co lan nao. */
  readonly previousOdometerKm: number | null;
}

export interface ConsumptionResult {
  /** `null` = KHONG tinh duoc. Khong bao gio la `0` thay cho "khong biet". */
  readonly consumptionUnits: number | null;
  /** Vi sao phieu can nguoi kiem. Rong = khong co gi bat thuong. */
  readonly reviewReasons: readonly FuelReviewReason[];
}

/**
 * TIEU HAO = `lit / (odo hien tai - odo truoc) * 100` — `INV-06`, hat giong `FUEL-001`/`FUEL-002`.
 *
 * ---------------------------------------------------------------------------
 * MAU SO <= 0 THI KHONG TINH, VA KHONG NEM.
 *
 * `FUEL-002` noi ro ca hai ve: khong bia ra mot con so, VA khong lam hong viec nhap phieu. Do la
 * mot phan biet quan trong — mot lai xe dung o cay xang luc 5 gio sang khong sua duoc dong ho odo
 * cua chuyen truoc, va chan ho nop phieu se chi khien phieu do khong bao gio duoc nhap. Nen phieu
 * VAN GHI, chi mang them mot ly do can kiem tra co ten.
 *
 * Doc theo dung chieu do: ham nay tra ve mot KET QUA (co the la "khong tinh duoc"), khong nem
 * ngoai le. Ngoai le chi danh cho dau vao khong the la mot lan do dau — do la viec cua
 * `litersToUnits`.
 *
 * ---------------------------------------------------------------------------
 * SO HOC NGUYEN, khong mot phep chia so thuc nao:
 *
 * ```text
 * lit            = litersUnits / 1000
 * L/100km        = lit / km * 100 = litersUnits / (10 * km)
 * don vi luu tru = L/100km * 1000 = litersUnits * 100 / km
 * ```
 *
 * `FUEL-001`: 200 L (200.000 don vi) tren 500 km -> `200000 * 100 / 500 = 40000` -> **40,000
 * L/100km**. So nguyen tu dau den cuoi, khong lam tron o dau ca.
 *
 * `Math.round` chi vao cuoc khi phep chia khong chan — vd 173 km. Lam tron NUA LEN la lua chon cua
 * so hoc thap phan thong thuong, va sai so toi da la 0,0005 L/100km: nho hon do phan giai ma cot
 * `NUMERIC(10,3)` bieu dien duoc, tuc khong quan sat duoc o bat ky bao cao nao.
 */
export function computeConsumption(input: ConsumptionInput): ConsumptionResult {
  if (input.previousOdometerKm === null) {
    return { consumptionUnits: null, reviewReasons: ['NO_PREVIOUS_ODOMETER'] };
  }

  const distanceKm = input.odometerKm - input.previousOdometerKm;
  if (distanceKm <= 0) {
    return { consumptionUnits: null, reviewReasons: ['ODOMETER_NOT_ADVANCED'] };
  }

  const units = Math.round((input.litersUnits * 100) / distanceKm);
  if (!Number.isSafeInteger(units) || units > MAX_CONSUMPTION_UNITS) {
    throw new FuelQuantityError(
      `Tieu hao vuot khoang bieu dien duoc: ${input.litersUnits} don vi tren ${distanceKm} km`,
    );
  }
  return { consumptionUnits: units, reviewReasons: [] };
}

/**
 * TIEU HAO CO VUOT DINH MUC KHONG — VT-046.
 *
 * Dinh muc va dung sai deu la DU LIEU CUA GOI KHACH (`policies.transportFuel.consumption`), khong
 * phai hang so trong ma: mot xe tai 5 tan va mot xe container khong the chung mot con so, va con so
 * do la cua doi xe cua khach chu khong cua chung ta.
 *
 * `null` cho ca hai duong "khong co dinh muc": hang xe chua khai thi khong co gi de so, va do KHONG
 * phai mot canh bao. Bia ra mot dinh muc mac dinh se lam moi xe cua khach chua cau hinh deu hien
 * ra nhu vuot muc — roi khong ai tin canh bao nua.
 */
export function exceedsConsumptionNorm(
  consumptionUnits: number | null,
  normL100km: number | null,
  tolerancePercent: number,
): boolean {
  if (consumptionUnits === null || normL100km === null || normL100km <= 0) return false;
  const ceilingUnits = normL100km * CONSUMPTION_UNITS_PER_L100KM * (1 + tolerancePercent / 100);
  return consumptionUnits > ceilingUnits;
}
