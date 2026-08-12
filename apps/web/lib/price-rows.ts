import type { PricePeriodPrice } from './settings';

/**
 * Logic thuan cua bang sua gia (man "Ky bang gia").
 *
 * Nam o `lib/` chu khong nam trong component: bo test web chay moi truong node va chi phu
 * `lib/**`, nen de trong `.tsx` thi dung cho de sai nhat (o trong = chua co gia hay = 0?) se
 * khong co test nao cham toi.
 */

/** Bon cot gia dat DUNG ten trong "Thong bao gia" cua khach, khong tu dat ten khac. */
export const PRICE_COLUMNS = [
  { key: 'wholesale', label: 'Đơn giá CTV', required: true },
  { key: 'minRetailPrice', label: 'Giá bán lẻ tối thiểu', required: false },
  { key: 'retailPrice', label: 'Giá bán lẻ', required: false },
  { key: 'listPrice', label: 'Giá niêm yết', required: false },
] as const;

export type PriceColumnKey = (typeof PRICE_COLUMNS)[number]['key'];

/**
 * O trong -> `null` (CHUA co gia), khong phai 0.
 *
 * Day la cho de sai nhat ca man hinh: ghi 0 vao gia lam don tinh ra 0 dong ma van "hop le", con
 * `null` thi validate ky gia con bat duoc la SKU nay chua co gia. Chuoi khong phai so cung ve
 * `null` — go nham mot ky tu la khong duoc lang le thanh gia 0.
 */
export function toPriceValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Cap nhat mot o, tra ve mang MOI (khong sua tai cho). */
export function updatePriceCell(
  rows: readonly PricePeriodPrice[],
  index: number,
  key: PriceColumnKey,
  raw: string,
): PricePeriodPrice[] {
  const value = toPriceValue(raw);
  return rows.map((row, position) =>
    position === index
      ? // `wholesale` bat buoc la number trong kieu; o trong tam ve 0 de con go tiep, con
        // `skusMissingWholesale` ben duoi chan gui/kich hoat khi con dong nhu vay.
        { ...row, [key]: key === 'wholesale' ? (value ?? 0) : value }
      : row,
  );
}

/** SKU chua co don gia CTV — chan kich hoat ky gia. Gia am/0/NaN deu tinh la thieu. */
export function skusMissingWholesale(rows: readonly PricePeriodPrice[]): string[] {
  return rows
    .filter((row) => !Number.isFinite(row.wholesale) || row.wholesale <= 0)
    .map((row) => row.sku);
}

/** Hien thi cho de doc: 1250000 -> "1.250.000 đ". Chua co gia thi khong bia so. */
export function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
}
