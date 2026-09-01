import { assertBusinessDate, type BusinessDate } from '../business-date.js';

/**
 * DIEU KHOAN THANH TOAN va CANH BAO CONG NO — ham THUAN.
 *
 * ===========================================================================
 * HAI THU O DAY, VA CHUNG KHONG DUOC LAN NHAU:
 *
 *   · HAN THANH TOAN — mot phep cong ngay, tat dinh, khong y kien;
 *   · CANH BAO CONG NO — mot NHAN DOC, khong bao gio la mot lenh chan.
 *
 * Issue #87 noi ro ve cai thu hai: *"Source says warning, not hard block"* va *"Do not prevent the
 * trip from continuing by default."* Nguon nghiep vu la mot cong ty van tai ~10 xe, noi nguoi dieu
 * hanh biet khach cua minh; mot cong chan cung se bi vo hieu hoa trong tuan dau bang cach nhap sai
 * han muc, va ke tu do con so han muc khong con y nghia gi.
 *
 * Nen ham duoi day tra ve mot TRANG THAI de hien thi. Khong ham nao o day nem loi vi ly do nghiep
 * vu, va khong ham nao tra ve `boolean` kieu "duoc phep di tiep hay khong" — cau hoi do khong ton
 * tai o tang nay.
 */

/**
 * HAN THANH TOAN = ngay ghi nhan + so ngay dieu khoan.
 *
 * CONG BANG UTC, KHONG bang mui gio tenant. Nghe nguoc voi `INV-25` nhung khong phai: `INV-25` noi
 * ve cach SINH RA mot ngay nghiep vu tu mot khoanh khac — do la cho mui gio co vai tro. O day dau
 * vao DA LA mot ngay nghiep vu (`2026-09-01`), va "cong 30 ngay" la mot phep tinh tren LICH, khong
 * phai tren dong ho. Dua no qua mui gio dia phuong se lam ngay ket qua nhay mot ngay tuy theo thoi
 * diem chay ham — tuc hai lan tinh cung mot chung tu cho ra hai han khac nhau.
 *
 * `Date.UTC` + `setUTCDate` xu ly dung thang du, nam nhuan va do dai thang khac nhau; tu cong
 * `days * 86400000` thi cung dung o UTC nhung se sai ngay ai do doi sang mot mui gio co DST.
 */
export function dueDateFrom(recognisedOn: BusinessDate, paymentTermDays: number): BusinessDate {
  const base = assertBusinessDate(recognisedOn);
  if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0) {
    throw new RangeError(`Dieu khoan thanh toan phai la so ngay khong am: ${paymentTermDays}`);
  }

  const [year, month, day] = base.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + paymentTermDays);
  return shifted.toISOString().slice(0, 10);
}

/**
 * MOT chung tu da qua han chua, tinh theo mot ngay moc.
 *
 * So sanh CHUOI, cung ly le voi `commission-rules.ts`: `YYYY-MM-DD` sap xep dung theo tu dien.
 *
 * `dueDate === asOf` la CHUA qua han — den han la ngay cuoi cung con dung han. Lech mot ngay o day
 * se lam moi bao cao tuoi no bi day som mot ngay, va no chi lo ra o dung nhung chung tu den han
 * DUNG HOM NAY, tuc khong bao gio lo ra trong mot lan thu tay.
 */
export const isOverdue = (dueDate: BusinessDate | null, asOf: BusinessDate): boolean =>
  dueDate !== null && dueDate < asOf;

/**
 * SO NGAY QUA HAN. `0` khi chua qua han — khong bao gio tra so am.
 *
 * Tra `0` thay vi so am co chu y: mot bao cao cong don "tong ngay qua han" ma nhan so am cua cac
 * chung tu con han se cho ra mot con so tu bu, va no doc len nhu la no dang duoc tra som.
 */
export function daysOverdue(dueDate: BusinessDate | null, asOf: BusinessDate): number {
  if (dueDate === null) return 0;
  const due = Date.parse(`${assertBusinessDate(dueDate)}T00:00:00Z`);
  const now = Date.parse(`${assertBusinessDate(asOf)}T00:00:00Z`);
  const diff = Math.floor((now - due) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/**
 * TRANG THAI CANH BAO — mot nhan de hien thi, khong phai mot quyet dinh chan.
 *
 * Ba muc, va thu tu giua chung la thu tu MUC DO chu khong phai thu tu thoi gian:
 *   · `NONE`            — khong co gi dang noi;
 *   · `OVERDUE`         — co chung tu qua han (bat ke han muc);
 *   · `LIMIT_EXCEEDED`  — tong du no vuot han muc da khai.
 *
 * `LIMIT_EXCEEDED` xep tren `OVERDUE` vi no bao ham rui ro lon hon: qua han mot khoan nho van la
 * chuyen thuong ngay o nganh nay, con vuot han muc la vuot chinh nguong cong ty tu dat ra.
 */
export const CREDIT_WARNING_STATES = ['NONE', 'OVERDUE', 'LIMIT_EXCEEDED'] as const;
export type CreditWarningState = (typeof CREDIT_WARNING_STATES)[number];

export interface CreditExposure {
  /** Tong du no con lai cua khach, gom moi chung tu chua tat toan. */
  readonly outstandingAmount: number;
  /** Phan da qua han trong so tren. */
  readonly overdueAmount: number;
  readonly overdueDocumentCount: number;
  /** `null` = KHONG khai han muc. Khac han `0` = khong duoc no dong nao. */
  readonly creditLimit: number | null;
  readonly warning: CreditWarningState;
  /**
   * Con bao nhieu du dia truoc khi cham han muc. `null` khi khong khai han muc — mot con so o day
   * se ngu y rang co mot nguong, va giao dien se ve mot thanh tien trinh khong dua tren gi ca.
   */
  readonly headroomAmount: number | null;
}

/**
 * TINH MUC PHOI NHIEM tin dung cua mot khach.
 *
 * KHONG doc DB, khong biet khach la ai — nhan vao cac con so da cong san. Tang goi chiu trach
 * nhiem chi lay dung chung tu cua MOT khach o dung MOT dong (`CUSTOMER_FREIGHT`); tron dong o day
 * se lam tien cong ty no cay xang tru vao han muc cua khach — dung kieu bu tru ma `GD-15` cam.
 */
export function assessCreditExposure(input: {
  readonly outstandingAmount: number;
  readonly overdueAmount: number;
  readonly overdueDocumentCount: number;
  readonly creditLimit: number | null;
}): CreditExposure {
  const { outstandingAmount, overdueAmount, overdueDocumentCount, creditLimit } = input;

  const overLimit = creditLimit !== null && outstandingAmount > creditLimit;
  const warning: CreditWarningState = overLimit
    ? 'LIMIT_EXCEEDED'
    : overdueDocumentCount > 0
      ? 'OVERDUE'
      : 'NONE';

  return {
    outstandingAmount,
    overdueAmount,
    overdueDocumentCount,
    creditLimit,
    warning,
    headroomAmount: creditLimit === null ? null : creditLimit - outstandingAmount,
  };
}

/**
 * KHUNG TUOI NO — bon o, ranh gioi theo so ngay qua han.
 *
 * `CURRENT` gom CA chung tu chua den han LAN chung tu khong co han (`dueDate` null). Tach chung ra
 * se tao mot o thu nam ma khong bao cao nao cua nguon yeu cau, va lam bang rong o cho khong can.
 */
export const AGING_BUCKETS = ['CURRENT', 'D1_30', 'D31_60', 'D60_PLUS'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucketFor(dueDate: BusinessDate | null, asOf: BusinessDate): AgingBucket {
  const overdue = daysOverdue(dueDate, asOf);
  if (overdue <= 0) return 'CURRENT';
  if (overdue <= 30) return 'D1_30';
  if (overdue <= 60) return 'D31_60';
  return 'D60_PLUS';
}
