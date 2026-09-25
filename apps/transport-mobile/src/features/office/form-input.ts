/**
 * O NHAP cua van phong — so tien VND va cau ly do. HAM THUAN.
 *
 * Tien la SO NGUYEN VND (may chu tu choi so le). Nguoi Viet go "1.500.000", "1,5tr" thi khong doan:
 * chi nhan chu so va dau ngan cach, bo "₫"/"đ"; con lai la loi noi ro. Doan sai mot so tien la mot
 * lan ghi sai so sach, re hon nhieu so voi bat go lai.
 */

/** Tran chung cua may chu (`MONEY_MAX_AMOUNT`) — du rong cho moi khoan that. */
export const MONEY_INPUT_MAX = 1_000_000_000_000;

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export function parseVndInput(raw: string): ParseResult<number> {
  const text = raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[₫đĐ]$/u, '');
  if (text === '') return { ok: false, message: 'Nhập số tiền.' };
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(text)) {
    return { ok: false, message: 'Chỉ nhập số nguyên đồng, ví dụ 1.500.000.' };
  }
  const value = Number(text.replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, message: 'Số tiền phải lớn hơn 0.' };
  }
  if (value > MONEY_INPUT_MAX) return { ok: false, message: 'Số tiền quá lớn.' };
  return { ok: true, value };
}

/** "1500000" -> "1.500.000" de hien lai trong o nhap. */
export function groupDigits(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

export interface TextRule {
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/** Cau bat buoc (ly do...) — cat khoang trang hai dau, dem theo ky tu that. */
export function checkText(raw: string, rule: TextRule): ParseResult<string> {
  const text = raw.trim();
  const length = [...text].length;
  if (length < rule.min) {
    return {
      ok: false,
      message:
        rule.min <= 1 ? `Cần nhập ${rule.label}.` : `${rule.label} cần ít nhất ${rule.min} ký tự.`,
    };
  }
  if (length > rule.max) {
    return { ok: false, message: `${rule.label} tối đa ${rule.max} ký tự (đang ${length}).` };
  }
  return { ok: true, value: text };
}

/** Cau tuy chon — rong thi `null` (khong gui), qua dai thi loi. */
export function optionalText(raw: string, rule: Omit<TextRule, 'min'>): ParseResult<string | null> {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  const checked = checkText(text, { ...rule, min: 1 });
  return checked.ok ? { ok: true, value: checked.value } : checked;
}

/** Bo dau + thuong hoa de tim "dinh vu" ra "Đình Vũ". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
