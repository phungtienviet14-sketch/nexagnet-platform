import { digitsOnly } from './fuel-form';
import type { BusinessDate, DriverTripView, ExpenseCatalogue } from './types';

/**
 * KHOAN CHI cua lai xe — CHI duong chuyen cu (`POST /transport/me/expenses`, can `tripId`).
 *
 * Chi phi theo VONG CHAY chua co duong HTTP nao (#383 — `RunExpenseService` chi duoc goi tu luong
 * nhien lieu). Man hinh KHONG gia mot duong: khong co chuyen cu dang mo thi noi thang "chua co tren
 * he thong", khong gui gi.
 *
 * Chong ghi trung: `correlationKey` sinh MOT lan cho mot bieu mau, va THAN LENH DONG BANG o lan gui
 * dau (ke ca `businessDate` tuong minh). Lan gui lai sau loi mang gui DUNG than cu — may chu tra ban
 * ghi cu. Doi mot truong roi gui cung khoa = 409 `CORRELATION_KEY_REUSED`.
 */

const OPEN_TRIP: ReadonlySet<string> = new Set(['PLANNED', 'IN_TRANSIT']);

/** Chuyen cu CON MO cua chinh lai xe — web chi cho chon chuyen `PLANNED`/`IN_TRANSIT`. */
export function openLegacyTrips(trips: readonly DriverTripView[]): readonly DriverTripView[] {
  return trips.filter((trip) => OPEN_TRIP.has(trip.status));
}

/** Chuyen DANG LAM (nguoi phu trach hien tai): dang chay truoc, roi da len ke hoach. */
export function currentLegacyTrip(trips: readonly DriverTripView[]): DriverTripView | null {
  const mine = trips.filter((trip) => trip.isCurrentAssignee);
  return (
    mine.find((trip) => trip.status === 'IN_TRANSIT') ??
    mine.find((trip) => trip.status === 'PLANNED') ??
    null
  );
}

export type CategoryInput = 'CHOOSE' | 'FREE_TEXT';

/** Danh muc DONG -> chon; danh muc mo (`unrestricted`) hoac rong -> go tu do. Hai nghia nguoc nhau. */
export function categoryInputMode(catalogue: ExpenseCatalogue): CategoryInput {
  return catalogue.unrestricted || catalogue.categories.length === 0 ? 'FREE_TEXT' : 'CHOOSE';
}

export interface ExpenseForm {
  readonly tripId: string;
  readonly categoryCode: string;
  readonly amountDigits: string;
  readonly note: string;
}

export interface ExpenseBody {
  readonly tripId: string;
  readonly categoryCode: string;
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly note: string | null;
  readonly correlationKey: string;
}

export function expenseProblem(form: ExpenseForm): string | null {
  if (form.tripId === '') return 'Chọn chuyến.';
  const category = form.categoryCode.trim();
  if (category === '') return 'Chọn nhóm chi phí.';
  if (category.length > 60) return 'Tên nhóm chi phí tối đa 60 ký tự.';
  const amount = Number(digitsOnly(form.amountDigits));
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Nhập số tiền (đồng) lớn hơn 0.';
  return null;
}

export function toExpenseBody(input: {
  readonly form: ExpenseForm;
  readonly correlationKey: string;
  readonly businessDate: BusinessDate;
}): ExpenseBody {
  const problem = expenseProblem(input.form);
  if (problem !== null) throw new Error(problem);
  const note = input.form.note.trim();
  return {
    tripId: input.form.tripId,
    categoryCode: input.form.categoryCode.trim(),
    amount: Number(digitsOnly(input.form.amountDigits)),
    businessDate: input.businessDate,
    note: note === '' ? null : note,
    correlationKey: input.correlationKey,
  };
}

/**
 * Sau MOT lan gui hong, ket cuc co RO khong.
 *
 * `DEFINITE` — may chu da tra loi tu choi (400/403/409): lan do CHAC CHAN khong ghi gi, sua form
 * roi gui lai bang khoa MOI la an toan. `UNKNOWN` — mat mang/het gio/5xx: co the da ghi roi. Chi
 * duoc gui lai DUNG than cu; muon nhap lai thi phai bo han lan cu (co the thanh hai khoan).
 */
export type FailureCertainty = 'DEFINITE' | 'UNKNOWN';

export function failureCertainty(kind: string | null): FailureCertainty {
  return kind === 'DOMAIN' || kind === 'FORBIDDEN' || kind === 'NOT_MOUNTED'
    ? 'DEFINITE'
    : 'UNKNOWN';
}
