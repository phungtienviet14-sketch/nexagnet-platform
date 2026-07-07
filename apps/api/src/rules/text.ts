/**
 * Tien ich xu ly chuoi tieng Viet cho rules + parser.
 */

// Dai dau to hop Unicode (U+0300..U+036F) de boc khi da NFD.
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Chuan hoa: bo dau, thuong hoa, gom khoang trang — de so khop khong phu thuoc dau. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dinh dang tien VND: 11500000 -> "11.500.000d" */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}
