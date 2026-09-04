/**
 * NGAY NGHIEP VU theo mui gio tenant (`INV-25`, `GD-04`).
 *
 * Bat bien: ngay nghiep vu duoc TINH MOT LAN luc ghi va luu ra mot cot rieng. KHONG suy nguoc tu
 * `createdAt` luc truy van. Ly do rat cu the: Viet Nam o UTC+7, nen mot phieu luc 06:30 sang ngay
 * 01/08 la `2026-07-31T23:30Z`; doc bang UTC se xep no vao thang 7. Ky cong no, ky quy va ky luong
 * deu cat theo ngay, nen sai lech nay khong phai "lech hien thi" — no la mot phieu roi nham ky.
 * Va no chi xay ra voi cac phieu quanh nua dem, tuc khong bao gio lo ra trong lan thu tay.
 *
 * ĐAT O DAU: T1 §19 xep "mui gio tenant / ngay nghiep vu" vao `PG-08`, thuoc Platform Track. O day
 * chi co dung hai ham ma T2 dung, khong co lich kỳ, khong co khoa kỳ (`PG-07`) va khong co lop
 * lich tong quat nao. Khi `PG-08` dong thi doi cho goi, khong doi hinh dang du lieu.
 *
 * Khong them phu thuoc: `Intl.DateTimeFormat` co san trong Node 22 va biet du lieu mui gio IANA.
 */

/** Chuoi `YYYY-MM-DD` theo lich dia phuong cua tenant. */
export type BusinessDate = string;

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class BusinessDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessDateError';
  }
}

/**
 * `en-CA` cho ra dung dang `YYYY-MM-DD`, nen khong phai ghep tay tung phan roi tu chen so 0.
 * `formatToParts` la duong an toan hon `format` vi khong phu thuoc dau phan cach cua locale.
 */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new BusinessDateError(`Mui gio khong hop le: ${timeZone}`);
  }
}

/** Doi mot KHOANH KHAC tuyet doi thanh NGAY NGHIEP VU theo mui gio tenant. */
export function toBusinessDate(instant: Date, timeZone: string): BusinessDate {
  if (Number.isNaN(instant.getTime())) {
    throw new BusinessDateError('Khoanh khac khong hop le');
  }
  const parts = formatterFor(timeZone).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const value = `${pick('year')}-${pick('month')}-${pick('day')}`;
  if (!BUSINESS_DATE_PATTERN.test(value)) {
    throw new BusinessDateError(`Khong dinh dang duoc ngay nghiep vu cho mui gio ${timeZone}`);
  }
  return value;
}

/**
 * Kiem mot chuoi do NGUOI hoac API ben ngoai dua vao.
 *
 * Kiem ca dang LAN su ton tai: `2026-02-30` dung dang nhung khong phai mot ngay co that, va neu
 * de lot thi no se tro thanh mot moc ky ma khong lich nao xep duoc.
 */
export function assertBusinessDate(value: string): BusinessDate {
  if (!BUSINESS_DATE_PATTERN.test(value)) {
    throw new BusinessDateError(`Ngay nghiep vu phai co dang YYYY-MM-DD, nhan duoc: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BusinessDateError(`Ngay nghiep vu khong co that: ${value}`);
  }
  return value;
}

/**
 * SO NGAY tu `from` den `to`, duong khi `to` o sau.
 *
 * Tinh bang UTC midnight CO CHU DICH — ca hai dau vao da la NGAY nghiep vu, tuc mui gio da duoc
 * ap MOT LAN luc ghi (`INV-25`). Ap mui gio lan thu hai o day se lam mot ngay bien gioi lech mot
 * don vi vao dung nhung hom co chuyen giao gio — va do la kieu sai chi lo ra o vai phieu quanh
 * nua dem, dung cai ma toan bo tep nay ton tai de tranh.
 *
 * UTC midnight khong co gio mua he nen mot ngay luon dung 86.400.000ms; phep tru la chinh xac,
 * khong phai xap xi.
 */
export function businessDateDifferenceInDays(from: BusinessDate, to: BusinessDate): number {
  const start = Date.parse(`${assertBusinessDate(from)}T00:00:00Z`);
  const end = Date.parse(`${assertBusinessDate(to)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** Cong them `days` ngay vao mot ngay nghiep vu. `days` am thi lui lai. */
export function addBusinessDays(date: BusinessDate, days: number): BusinessDate {
  if (!Number.isInteger(days)) {
    throw new BusinessDateError(`So ngay cong them phai la so nguyen, nhan duoc: ${days}`);
  }
  const base = Date.parse(`${assertBusinessDate(date)}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}
