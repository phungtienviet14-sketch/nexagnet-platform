import type { DriverFuelSubmitInput } from '../transport-api';
import type { BusinessDate, FuelPaymentMethod } from '../transport-types';

/**
 * TO KHAI NHIEN LIEU cua lai xe — phan THUAN cua bieu mau (`#313`).
 *
 * ================================================================================================
 * `occurredAt` DUOC GIU TRONG FORM, KHONG SINH LUC BAM
 * ================================================================================================
 *
 * May chu chong ghi trung bang `correlationKey` + mot dinh danh 11 truong co `occurredAtMs`
 * (`fuel-entry-identity.ts`). Ban tren `main` gui `new Date().toISOString()` ngay luc bam, nen mot
 * lan bam lai sau khi mat mang — CUNG khoa — mang mot `occurredAt` khac va bi `409
 * FUEL_CORRELATION_KEY_REUSED` thay vi duoc phat lai phieu da ghi. Gio thoi diem la mot o CUA FORM
 * (mac dinh la luc mo form, lai xe sua duoc), va than yeu cau la mot ham thuan cua form: cung form +
 * cung khoa -> cung than.
 *
 * ================================================================================================
 * NGAY NGHIEP VU THEO MUI GIO KHACH (`INV-25`)
 * ================================================================================================
 *
 * O `datetime-local` hien gio theo dien thoai cua lai xe. Khoanh khac suy ra tu do la tuyet doi
 * (ISO co `Z`), va `businessDate` duoc tinh tu khoanh khac do theo `policies.transportCore.timeZone`
 * — gui TUONG MINH, vi may chu khong suy ngay tu `occurredAt` ma lay "hom nay" khi thieu. Do dau luc
 * 23:00 roi khai luc 00:30 hom sau se khong con roi sang nham ngay.
 */

export interface DriverFuelForm {
  readonly supplierId: string;
  /** `#317` G1 — tram/diem do. `''` = khong khai (nha cung cap chua co danh muc tram). */
  readonly stationId: string;
  readonly liters: string;
  readonly amount: string;
  readonly odometerKm: string;
  readonly invoiceNo: string;
  /** Gia tri cua `<input type="datetime-local">` — `YYYY-MM-DDTHH:mm` theo gio dien thoai. */
  readonly occurredAtLocal: string;
  readonly paymentMethod: FuelPaymentMethod;
}

/**
 * MAC DINH LA GHI NO CAY XANG (`SUPPLIER_ACCOUNT`) — `OWNER_DECISIONS_2026_09_17`, `#317`.
 *
 * Luong chuan cua `#295` la cay xang HOP DONG: lai xe do dau va KHONG tra tien mat. `DRIVER_CASH`
 * (-> quy lai xe khi duyet) chi khi lai xe CHU DONG chon vi that su ung tien. Guong cua
 * `DEFAULT_FUEL_PAYMENT_METHOD` o may chu.
 *
 * Mac dinh nay KHONG sinh cong no luc khai: to khai van chi la mot su that van hanh; cong no nha
 * cung cap chi xuat hien sau doi soat bang ke + dong ky.
 */
export const DEFAULT_DRIVER_PAYMENT_METHOD: FuelPaymentMethod = 'SUPPLIER_ACCOUNT';

/** Dong ho dien thoai lech vai phut la chuyen thuong; mot phieu cua ngay mai thi khong. */
export const OCCURRED_AT_CLOCK_SKEW_MS = 5 * 60_000;

const pad = (value: number): string => String(value).padStart(2, '0');

export const toDateTimeLocalValue = (instant: Date): string =>
  `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
  `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`;

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `null` cho gia tri khong co that (thang 13, 99 gio) — khong de `Date` am tham tran sang ngay khac. */
export const fromDateTimeLocalValue = (value: string): Date | null => {
  const parts = LOCAL_VALUE.exec(value);
  if (parts === null) return null;
  const [year, month, day, hour, minute] = parts.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const instant = new Date(year, month - 1, day, hour, minute, 0, 0);
  const isSame =
    instant.getFullYear() === year &&
    instant.getMonth() === month - 1 &&
    instant.getDate() === day &&
    instant.getHours() === hour &&
    instant.getMinutes() === minute;
  return isSame ? instant : null;
};

/** Ngay nghiep vu cua mot khoanh khac theo mui gio khach; mui gio hong thi roi ve mui gio may. */
export const businessDateOf = (instant: Date, timeZone: string | undefined): BusinessDate => {
  const parts = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  try {
    return new Intl.DateTimeFormat('en-CA', { ...parts, timeZone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', parts).format(instant);
  }
};

export const occurredAtProblem = (value: string, now: Date): string | null => {
  const instant = fromDateTimeLocalValue(value);
  if (instant === null) return 'Chọn thời điểm đổ.';
  if (instant.getTime() > now.getTime() + OCCURRED_AT_CLOCK_SKEW_MS) {
    return 'Thời điểm đổ không được ở tương lai.';
  }
  return null;
};

/** Than `POST /transport/me/fuel/slips`. Ham THUAN: cung dau vao, cung than — dieu kien de gui lai. */
export const toDriverFuelSubmission = (input: {
  readonly form: DriverFuelForm;
  readonly trip: { readonly id: string; readonly vehicleId: string };
  readonly correlationKey: string;
  readonly timeZone: string | undefined;
}): DriverFuelSubmitInput => {
  const occurredAt = fromDateTimeLocalValue(input.form.occurredAtLocal);
  if (occurredAt === null) throw new Error('Chọn thời điểm đổ.');
  const invoiceNo = input.form.invoiceNo.trim();
  return {
    tripId: input.trip.id,
    vehicleId: input.trip.vehicleId,
    supplierId: input.form.supplierId,
    // `null` tuong minh chu khong bo truong: than yeu cau la ham thuan cua form, gui lai phai giong het.
    stationId: input.form.stationId === '' ? null : input.form.stationId,
    liters: input.form.liters.trim(),
    amount: Number(input.form.amount),
    odometerKm: Number(input.form.odometerKm),
    occurredAt: occurredAt.toISOString(),
    businessDate: businessDateOf(occurredAt, input.timeZone),
    paymentMethod: input.form.paymentMethod,
    invoiceNo: invoiceNo === '' ? null : invoiceNo,
    correlationKey: input.correlationKey,
  };
};
