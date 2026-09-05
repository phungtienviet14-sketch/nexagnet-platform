import type { BusinessDate } from '../business-date.js';
import type {
  FuelReconciliationStatus,
  FuelReviewReason,
  FuelVerificationStatus,
} from './fuel-lifecycle.js';
import type { FuelEntry, FuelPaymentMethod, FuelReceiptEvidence } from './fuel.types.js';

/**
 * KHUNG NHIN CUA LAI XE cho phieu do dau — `INV-09`, VT-083, `GD-23`.
 *
 * Mot KIEU RIENG, khong phai `FuelEntry` da bi loc bot truong — cung ly le da viet o
 * `driver-trip.view.ts`:
 *
 *   · loc theo vai   -> lan THEM TRUONG sau la lan no ro ra, vi khong ai nho cap nhat danh sach loc;
 *   · kieu rieng     -> them mot truong vao `FuelEntry` khong lam gi duoc o day ca, vi phep anh xa
 *                       ben duoi phai duoc VIET RA moi co truong.
 *
 * ---------------------------------------------------------------------------
 * O DAY KHONG CHI THIEU DOANH THU. Con thieu ba thu nua, va moi thu mot ly do:
 *
 *   `costExpenseId`      — day la SO CUA KE TOAN. Lai xe khong can biet phieu cua ho da thanh dong
 *                          gia thanh nao, va lo id do ra la mo mot duong doan ve so sach noi bo.
 *   `sourceStatementId`  — noi phieu tu dau ra la chuyen cua doi soat (`INV-26`), khong phai cua
 *                          nguoi nop phieu.
 *   `declaredBy`         — lai xe chi thay phieu CUA CHINH HO, nen truong nay luon la chinh ho:
 *                          mot o hien thi khong noi them gi, va no lam be mat rong ra vo ich.
 *
 * `verificationStatus` thi CO, va co chu dich: mot lai xe phai biet phieu cua minh da duoc duyet
 * hay bi tra lai, va bi tra lai VI SAO — do la ca ly do `reviewNote` cung nam o day.
 */
export interface DriverFuelSlipView {
  readonly id: string;
  readonly tripId: string;
  readonly vehicleId: string;
  readonly supplierId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly paymentMethod: FuelPaymentMethod;
  readonly verificationStatus: FuelVerificationStatus;
  readonly reconciliationStatus: FuelReconciliationStatus;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  /** Ly do ke toan tra lai phieu. `null` khi chua ai tra lai. */
  readonly reviewNote: string | null;
  readonly evidenceCount: number;
  /**
   * ANH CUA CHINH PHIEU NAY — chi `id` va loai noi dung, khong hon.
   *
   * Vi sao phai co: `GET /transport/me/fuel/slips/:id/evidence/:evidenceId` doi mot `evidenceId`,
   * va truoc lan sua nay be mat lai xe KHONG co duong nao hoc duoc ma do — chi biet co BAO NHIEU
   * anh (`evidenceCount`). Nen lai xe tai anh len duoc nhung khong xem lai duoc no sau khi tai
   * trang, va acceptance 8 cua #170 khong the dat.
   *
   * `locator` CO Y vang mat: no la khoa trong kho anh, va dua no ra trinh duyet se bien mot dinh vi
   * duc thanh mot dia chi doan duoc. `uploadedBy` cung vang mat — do la danh tinh nguoi van hanh,
   * cung ly le voi bon truong bi bo o be mat phieu luong (`#168 B8 §3`).
   *
   * `contentType` co mat vi man hinh phai chon giua the anh va mot lien ket tai ve cho PDF.
   */
  readonly evidence: readonly DriverFuelEvidenceView[];
  readonly createdAt: string;
}

/** Mot anh cua phieu, o dang lai xe duoc phep biet. */
export interface DriverFuelEvidenceView {
  readonly id: string;
  readonly contentType: string | null;
}

/**
 * Phep anh xa TUONG MINH tung truong.
 *
 * CO Y khong dung `{ ...entry, costExpenseId: undefined }` hay mot ham `omit()`: ca hai deu la
 * "loc" doi lot, va ca hai deu de lot truong moi. O day, mot truong chi co mat neu ai do go ten no
 * ra — va luc go thi phai doc lai chinh khoi chu thich ben tren.
 */
export function toDriverFuelSlipView(
  entry: FuelEntry,
  evidence: readonly FuelReceiptEvidence[],
): DriverFuelSlipView {
  return {
    id: entry.id,
    tripId: entry.tripId,
    vehicleId: entry.vehicleId,
    supplierId: entry.supplierId,
    businessDate: entry.businessDate,
    occurredAt: entry.occurredAt,
    litersUnits: entry.litersUnits,
    amount: entry.amount,
    currencyCode: entry.currencyCode,
    odometerKm: entry.odometerKm,
    previousOdometerKm: entry.previousOdometerKm,
    consumptionUnits: entry.consumptionUnits,
    reviewReasons: entry.reviewReasons,
    paymentMethod: entry.paymentMethod,
    verificationStatus: entry.verificationStatus,
    reconciliationStatus: entry.reconciliationStatus,
    invoiceNo: entry.invoiceNo,
    note: entry.note,
    reviewNote: entry.reviewNote,
    evidenceCount: evidence.length,
    // Chon TUNG TRUONG, khong spread: `FuelReceiptEvidence` mang `locator` va `uploadedBy`, va mot
    // `...row` o day se lang le day ca hai ra trinh duyet.
    evidence: evidence.map((row) => ({ id: row.id, contentType: row.contentType })),
    createdAt: entry.createdAt,
  };
}
