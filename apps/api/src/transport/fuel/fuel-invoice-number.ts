/**
 * SO HOA DON TREN PHIEU / DONG BANG KE — `#317` G4, ham THUAN.
 *
 * ===========================================================================
 * QUYET DINH CHU SO HUU (`OWNER_DECISIONS_2026_09_17`, G4): `invoiceNo` KHONG phai khoa so khop.
 *
 * No la mot tin hieu TAT DINH BO SUNG, va chi ba cau tra loi ton tai:
 *
 *   `EQUAL`    ca hai ben co so, va trung sau chuan hoa  -> tang do chac / dung lam bo phan biet
 *   `CONFLICT` ca hai ben co so, va KHAC nhau          -> khong tu khop, dua ve nguoi soat
 *   `ABSENT`   mot ben (hoac ca hai) khong khai          -> KHONG duoc pha mot cap von dung
 *
 * Khong co cau tra loi thu tu kieu "gan giong": khong khoang cach chinh sua, khong so tien to, khong
 * mo hinh. Mot ky tu lech la `CONFLICT`, va viec cua `CONFLICT` la dua cap do ve mat NGUOI — khong
 * phai tu doan xem lai xe go nham hay cay xang in nham.
 *
 * ===========================================================================
 * CHUOI HOA DON KHONG BAO GIO TU TAO MOT CAP.
 *
 * Ham nay chi SO SANH hai chuoi. No khong biet xe, ngay, tien — va `fuel-matching.ts` chi goi no tren
 * nhung cap DA HOP LE theo ba tieu chi do. Mot so hoa don trung tren hai xe khac nhau van la hai xe
 * khac nhau: danh tinh kinh te cua mot khoan phai tra la DONG BANG KE, khong phai chuoi in tren giay.
 */

export const FUEL_INVOICE_RELATIONS = ['EQUAL', 'CONFLICT', 'ABSENT'] as const;
export type FuelInvoiceRelation = (typeof FUEL_INVOICE_RELATIONS)[number];

/**
 * Ky tu PHAN CACH bi bo khi so sanh: khoang trang, `-`, `_`, `.`, `/`, `\`, `#`, `:`.
 *
 * Danh sach DONG, viet ra: mot may tinh tien in `HD-00123`, mot file bang ke ghi `HD 00123`, mot lai
 * xe go `hd00123` — ba cach viet cua cung mot so. Chu cai va chu so thi KHONG bao gio bi bo.
 */
const SEPARATORS = /[\s\-_./\\#:]+/gu;

const ALL_DIGITS = /^\d+$/u;

/**
 * CHUAN HOA — bon buoc, theo dung thu tu, va khong buoc nao doan:
 *
 *   1. `NFKC` — chu so/chu cai toan goc (`１２３`) doc nhu ban thuong;
 *   2. doi CHU HOA;
 *   3. bo ky tu phan cach (`SEPARATORS`);
 *   4. chuoi TOAN SO thi bo so 0 dau (`0000123` -> `123`, `0000` -> `0`).
 *
 * Buoc 4 CHI ap cho chuoi toan so. Trong mot ma co chu (`A0123`), so 0 co the la mot ky tu that cua
 * ma — bo no di se lam `A0123` va `A123` thanh mot, tuc mot lan doan.
 *
 * Chuoi rong sau chuan hoa la "khong khai" (`null`), khong phai mot so hoa don bang chuoi rong.
 */
export function normalizeFuelInvoiceNo(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const compact = raw.normalize('NFKC').toUpperCase().replace(SEPARATORS, '');
  if (compact === '') return null;
  if (!ALL_DIGITS.test(compact)) return compact;
  const stripped = compact.replace(/^0+/u, '');
  return stripped === '' ? '0' : stripped;
}

/** Quan he giua so hoa don cua hai ben. Xem khoi chu thich dau tep. */
export function compareFuelInvoiceNumbers(
  left: string | null | undefined,
  right: string | null | undefined,
): FuelInvoiceRelation {
  const a = normalizeFuelInvoiceNo(left);
  const b = normalizeFuelInvoiceNo(right);
  if (a === null || b === null) return 'ABSENT';
  return a === b ? 'EQUAL' : 'CONFLICT';
}
