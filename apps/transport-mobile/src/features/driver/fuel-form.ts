import type { FuelSlipAction } from '../../outbox/field-actions';
import type { BusinessDate, DriverFuelRunView, FuelPaymentMethod } from './types';

/**
 * TO KHAI PHIEU DO DAU — phan THUAN cua bieu mau (port web `fuel-declaration.ts`, `#313`/`#364`).
 *
 * BA BAT BIEN, moi cai co ly do:
 *   · `occurredAt` NAM TRONG FORM (mac dinh luc mo form), khong sinh luc bam: may chu chong ghi
 *     trung bang `correlationKey` + dinh danh co `occurredAtMs`. Sinh lai luc gui = 409.
 *   · `businessDate` gui TUONG MINH, tinh theo mui gio DOANH NGHIEP: do dau 23:00, gui luc 00:30 hom
 *     sau (vi mat song) khong duoc roi sang ngay khac.
 *   · Ngu canh la VONG CHAY — KHONG `vehicleId`: xe LA xe cua vong chay, may chu tu lay.
 * Than lenh dong bang MOT lan roi vao hang doi; hang doi gui lai y het.
 */

export const DEFAULT_PAYMENT_METHOD: FuelPaymentMethod = 'SUPPLIER_ACCOUNT';
/** Dong ho lech vai phut la chuyen thuong; mot phieu cua ngay mai thi khong. */
export const OCCURRED_AT_CLOCK_SKEW_MS = 5 * 60_000;
export const LITERS_SCALE = 3;

export interface FuelForm {
  readonly runId: string | null;
  readonly legId: string | null;
  readonly supplierId: string;
  /** `''` = khong khai tram. */
  readonly stationId: string;
  /** Chuoi nguoi go — dau phay hay dau cham deu nhan. */
  readonly liters: string;
  /** Chi chu so (da bo dau cham ngan cach). */
  readonly amountDigits: string;
  readonly odometerKm: string;
  /** `dd/mm/yyyy` theo gio dien thoai. */
  readonly dateText: string;
  /** `HH:mm` theo gio dien thoai. */
  readonly timeText: string;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

export function dateTextOf(instant: Date): string {
  return `${pad(instant.getDate())}/${pad(instant.getMonth() + 1)}/${instant.getFullYear()}`;
}

export function timeTextOf(instant: Date): string {
  return `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

export function emptyFuelForm(now: Date): FuelForm {
  return {
    runId: null,
    legId: null,
    supplierId: '',
    stationId: '',
    liters: '',
    amountDigits: '',
    odometerKm: '',
    dateText: dateTextOf(now),
    timeText: timeTextOf(now),
    paymentMethod: DEFAULT_PAYMENT_METHOD,
    invoiceNo: '',
  };
}

const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

/** `null` cho gia tri khong co that (30/02, 25:00) — khong de `Date` am tham tran sang ngay khac. */
export function parseLocalDateTime(dateText: string, timeText: string): Date | null {
  const date = DATE.exec(dateText.trim());
  const time = TIME.exec(timeText.trim());
  if (!date || !time) return null;
  const [day, month, year] = [Number(date[1]), Number(date[2]), Number(date[3])];
  const [hour, minute] = [Number(time[1]), Number(time[2])];
  const instant = new Date(year, month - 1, day, hour, minute, 0, 0);
  const same =
    instant.getFullYear() === year &&
    instant.getMonth() === month - 1 &&
    instant.getDate() === day &&
    instant.getHours() === hour &&
    instant.getMinutes() === minute;
  return same ? instant : null;
}

/** Ngay nghiep vu theo mui gio doanh nghiep; mui gio hong thi roi ve mui gio may. */
export function businessDateOf(instant: Date, timeZone: string | undefined): BusinessDate {
  const parts = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  try {
    return new Intl.DateTimeFormat('en-CA', { ...parts, timeZone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', parts).format(instant);
  }
}

/** So lit: chap nhan `45,5` va `45.5`; toi da 3 chu so thap phan; > 0. `null` = khong hop le. */
export function normalizeLiters(raw: string): string | null {
  const value = raw.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${LITERS_SCALE}})?$`).test(value)) return null;
  return Number(value) > 0 ? value : null;
}

/** Chi giu chu so — nguoi go "1.250.000" hay "1250000" deu ra cung mot so. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
}

/** Hien "1.250.000" trong luc go — dau cham ngan cach kieu Viet. */
export function groupThousands(digits: string): string {
  const clean = digitsOnly(digits);
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export type FuelFormField =
  'context' | 'supplier' | 'liters' | 'amount' | 'odometer' | 'occurredAt';

export type FuelFormProblems = Partial<Record<FuelFormField, string>>;

export function validateFuelForm(form: FuelForm, now: Date): FuelFormProblems {
  const problems: { -readonly [K in FuelFormField]?: string } = {};
  if (form.runId === null) {
    problems.context = 'Chưa có việc được điều nào để ghi phiếu — báo điều hành.';
  }
  if (form.supplierId === '') problems.supplier = 'Chọn cây xăng.';
  if (normalizeLiters(form.liters) === null) {
    problems.liters = 'Nhập số lít lớn hơn 0 (tối đa 3 chữ số thập phân).';
  }
  const amount = Number(digitsOnly(form.amountDigits));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    problems.amount = 'Nhập số tiền (đồng) lớn hơn 0.';
  }
  const odometer = form.odometerKm.trim();
  if (!/^\d+$/.test(odometer) || !Number.isSafeInteger(Number(odometer))) {
    problems.odometer = 'Nhập số km trên đồng hồ (số nguyên).';
  }
  const occurredAt = parseLocalDateTime(form.dateText, form.timeText);
  if (occurredAt === null) problems.occurredAt = 'Chọn thời điểm đổ.';
  else if (occurredAt.getTime() > now.getTime() + OCCURRED_AT_CLOCK_SKEW_MS) {
    problems.occurredAt = 'Thời điểm đổ không được ở tương lai.';
  }
  return problems;
}

export function hasProblems(problems: FuelFormProblems): boolean {
  return Object.values(problems).some((value) => typeof value === 'string');
}

/** Khoa chong ghi trung — may chu nhan 8-120 ky tu. */
export function isValidCorrelationKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length >= 8 && trimmed.length <= 120;
}

export interface FuelSlipBody {
  readonly runId: string;
  readonly legId: string | null;
  readonly supplierId: string;
  readonly stationId: string | null;
  readonly liters: string;
  readonly amount: number;
  readonly odometerKm: number;
  readonly occurredAt: string;
  readonly businessDate: BusinessDate;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo: string | null;
  readonly correlationKey: string;
}

/**
 * THAN `POST /transport/me/fuel/slips` — dong bang. Nem loi neu form chua hop le (goi
 * `validateFuelForm` truoc). `null` tuong minh thay vi bo truong: gui lai phai giong het.
 */
export function toFuelSlipBody(input: {
  readonly form: FuelForm;
  readonly correlationKey: string;
  readonly timeZone: string | undefined;
  readonly now: Date;
}): FuelSlipBody {
  const { form } = input;
  if (hasProblems(validateFuelForm(form, input.now)) || form.runId === null) {
    throw new Error('Phiếu chưa đủ thông tin.');
  }
  if (!isValidCorrelationKey(input.correlationKey)) throw new Error('Khoá chống ghi trùng hỏng.');
  const occurredAt = parseLocalDateTime(form.dateText, form.timeText) as Date;
  const invoiceNo = form.invoiceNo.trim();
  return {
    runId: form.runId,
    legId: form.legId,
    supplierId: form.supplierId,
    stationId: form.stationId === '' ? null : form.stationId,
    liters: normalizeLiters(form.liters) as string,
    amount: Number(digitsOnly(form.amountDigits)),
    odometerKm: Number(form.odometerKm.trim()),
    occurredAt: occurredAt.toISOString(),
    businessDate: businessDateOf(occurredAt, input.timeZone),
    paymentMethod: form.paymentMethod,
    invoiceNo: invoiceNo === '' ? null : invoiceNo,
    correlationKey: input.correlationKey.trim(),
  };
}

/** Nhan cua muc hang doi — nguoi doc "Việc trên máy" nhan ra phieu nao. */
export function fuelSlipLabel(body: FuelSlipBody): string {
  const liters = body.liters.replace('.', ',');
  return `Phiếu đổ dầu ${liters} lít · ${groupThousands(String(body.amount))} ₫`;
}

/**
 * LENH HANG DOI cho MOT phieu: than DONG BANG (ban sao — form doi sau do khong cham vao hang doi),
 * nhan de "Việc trên máy" doc ra phieu nao.
 */
export function fuelSlipCommand(body: FuelSlipBody): FuelSlipAction {
  return { type: 'FUEL_SLIP', label: fuelSlipLabel(body), body: { ...body } };
}

/**
 * MOT lua chon duy nhat thi chon san — hang do HIEN RO la da chon, lai xe thay va doi duoc. Nhieu hon
 * mot thi de trong: chon mac dinh an la mot quyet dinh lai xe chua dua ra.
 */
export function soleOptionId<T>(options: readonly T[], idOf: (option: T) => string): string | null {
  const [only] = options;
  return options.length === 1 && only !== undefined ? idOf(only) : null;
}

export interface FuelRunOption {
  readonly runId: string;
  readonly label: string;
  readonly vehicleLabel: string;
  readonly legs: readonly { readonly legId: string; readonly label: string }[];
}

/** Vong chay DANG CHAY truoc vong moi len ke hoach, roi theo ma; chang da huy khong chon duoc. */
export function fuelRunOptions(runs: readonly DriverFuelRunView[]): readonly FuelRunOption[] {
  const rank = (status: string): number => (status === 'ACTIVE' ? 0 : 1);
  return [...runs]
    .sort((a, b) => rank(a.runStatus) - rank(b.runStatus) || a.runCode.localeCompare(b.runCode))
    .map((run) => ({
      runId: run.runId,
      label: `Vòng xe ${run.runCode}`,
      vehicleLabel: run.vehiclePlate ?? 'Xe của vòng xe',
      legs: run.legs
        .filter((leg) => leg.status !== 'CANCELLED')
        .map((leg) => ({
          legId: leg.legId,
          label: `Chặng ${leg.sequence}: ${leg.originLabel} → ${leg.destinationLabel}`,
        })),
    }));
}
