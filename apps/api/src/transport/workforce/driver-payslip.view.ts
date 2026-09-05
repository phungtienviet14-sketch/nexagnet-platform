import type { BusinessDate } from '../business-date.js';
import { isPublishableToDriver, type DriverVisiblePayslipStatus } from './payslip-lifecycle.js';
import type {
  PayrollPeriod,
  PayslipComponentKind,
  PayslipComponentSource,
  PayslipDetail,
  PayslipKind,
} from './workforce.types.js';

/**
 * KHUNG NHIN CUA LAI XE cho PHIEU LUONG — `#168 B8`, `GD-23`, VT-083.
 *
 * Mot KIEU RIENG, khong phai `PayslipDetail` da bi loc bot truong — cung ly le da viet o
 * `driver-fuel.view.ts` va `driver-trip.view.ts`:
 *
 *   · loc theo vai -> lan THEM TRUONG sau la lan no ro ra, vi khong ai nho cap nhat danh sach loc;
 *   · kieu rieng   -> them mot truong vao `Payslip` khong lam gi duoc o day ca, vi phep anh xa ben
 *                     duoi phai duoc VIET RA moi co truong.
 *
 * ---------------------------------------------------------------------------
 * BON DANH TINH NGUOI VAN HANH CO Y VANG MAT, va moi cai mot ly do:
 *
 *   `runBy`                — AI da bam nut chay luong thang nay la viec noi bo cua Ke toan. Lai xe
 *                            can biet SO TIEN va CACH RA SO do, khong can biet ban phim nao go no.
 *   `approvedBy`/`paidBy`  — lo ten nguoi duyet ra be mat lai xe la mo mot duong gay ap luc len
 *                            dung ca nhan do. Con `approvedAt`/`paidAt` thi CO: "luong cua toi chot
 *                            luc nao, tra luc nao" la cau hoi cua chinh nguoi nhan luong.
 *   `component.recordedBy` — nhu tren, o muc tung dong: mot khoan tru thu cong doi mot nguoi ky
 *                            (`GD-12`), nhung chu ky do la bang chung KIEM SOAT NOI BO, khong phai
 *                            mot o hien thi tren dien thoai lai xe.
 *
 * `driverFundBalanceSnapshot` cung vang mat, va vi mot ly do khac han: lai xe DA co
 * `GET /transport/me/fund` tra so du SONG. Bay them mot anh chup cu ben canh se cho hai con so khac
 * nhau cho cung mot cau hoi tren cung mot man hinh, va nguoi dung khong co cach nao biet cai nao
 * moi hon. `GD-12` dat anh chup do len phieu de NGUOI DUYET nhin truoc khi quyet — do la be mat
 * van hanh, khong phai be mat nay.
 *
 * `runId` vang mat vi no la mot ma NHOM cua lan chay: no noi len rang phieu nay nam cung lo voi
 * phieu cua dong nghiep, va khong tra loi mot cau hoi nao cua chinh nguoi nhan luong.
 */

/** BON TRUONG cua ky luong — du de doc "luong thang nao", khong mang trang thai dong/mo cua ky. */
export interface DriverPayslipPeriodView {
  readonly id: string;
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
}

/**
 * MOT DONG trong bang tinh luong.
 *
 * `kind` mang CHIEU (`EARNING`/`DEDUCTION`) va `amount` luon DUONG — dung quy uoc cua
 * `workforce.types.ts`, khong dao dau o tang nay. Mot khung nhin doi dau se lam hai man hinh cong
 * ra hai con so tong khac nhau cho cung mot phieu.
 */
export interface DriverPayslipComponentView {
  readonly kind: PayslipComponentKind;
  readonly source: PayslipComponentSource;
  readonly label: string;
  readonly amount: number;
  readonly quantity: number | null;
  readonly unitAmount: number | null;
  readonly note: string | null;
}

export interface DriverPayslipView {
  readonly id: string;
  readonly period: DriverPayslipPeriodView;
  readonly kind: PayslipKind;
  /**
   * KHONG BAO GIO `DRAFT` — va dieu do duoc KIEU giu, khong phai mot bo loc ai do phai nho viet.
   *
   * Xem `isPublishableToDriver()` va khoi chu thich cua `toDriverPayslipView()` ben duoi.
   */
  readonly status: DriverVisiblePayslipStatus;
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly netAmount: number;
  readonly currencyCode: string;
  readonly tripCount: number;
  readonly distanceKm: number;
  /** Phieu nay SUA phieu nao. `null` voi ban goc. Xem khoi chu thich cua `toDriverPayslipView()`. */
  readonly correctsId: string | null;
  readonly correctionReason: string | null;
  readonly components: readonly DriverPayslipComponentView[];
  readonly approvedAt: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

/**
 * Phep anh xa TUONG MINH tung truong — va la CHO DUY NHAT mot `DriverPayslipView` ra doi.
 *
 * TRA `null` CHO PHIEU `DRAFT`, khong nem loi va cung khong tra mot ban rut gon. Do la quy tac cong
 * bo cua `#168 B8` dat bang CAU TRUC:
 *
 *   nguon cua khach KHONG cho phep cong bo luong TAM TINH cho lai xe.
 *
 * Neu phep loc do nam o tang goi, thi mot duong doc thu hai ra doi sau nay se quen no — va lan
 * quen do khong lam do mot bai test nao dang co. O day thi nguoc lai: mot phieu `DRAFT` khong co
 * duong nao tro thanh mot khung nhin lai xe, ke ca khi nguoi goi muon.
 *
 * `correctsId` giu nguyen ma phieu goc chu khong bi cat. Mot phieu bo sung / phieu dao LUON mang
 * cung `driverId` va cung `runId` voi ban goc (xem `WorkforceService.issueCorrection`), va ban goc
 * bat buoc DA CHOT moi sua duoc (`isCorrectable`) — nen ma nay khong bao gio tro toi mot phieu nam
 * ngoai tam nhin cua chinh lai xe do. Cat no di se lam mot phieu dao tro thanh mot dong "-5.000.000"
 * khong giai thich duoc, va do dung la cach mot con so dung tro thanh mot cuoc tranh cai.
 */
export function toDriverPayslipView(
  detail: PayslipDetail,
  period: DriverPayslipPeriodView,
): DriverPayslipView | null {
  const { payslip } = detail;
  if (!isPublishableToDriver(payslip.status)) return null;

  return {
    id: payslip.id,
    period: {
      id: period.id,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
    },
    kind: payslip.kind,
    status: payslip.status,
    grossEarnings: payslip.grossEarnings,
    totalDeductions: payslip.totalDeductions,
    netAmount: payslip.netAmount,
    currencyCode: payslip.currencyCode,
    tripCount: payslip.tripCount,
    distanceKm: payslip.distanceKm,
    correctsId: payslip.correctsId,
    correctionReason: payslip.correctionReason,
    components: detail.components.map((component) => ({
      kind: component.kind,
      source: component.source,
      label: component.label,
      amount: component.amount,
      quantity: component.quantity,
      unitAmount: component.unitAmount,
      note: component.note,
    })),
    approvedAt: payslip.approvedAt,
    paidAt: payslip.paidAt,
    createdAt: payslip.createdAt,
  };
}

/** BON TRUONG cua ky luong duoc lay ra o MOT cho — de khong ai vo tinh bay ca `PayrollPeriod`. */
export const toDriverPayslipPeriodView = (period: PayrollPeriod): DriverPayslipPeriodView => ({
  id: period.id,
  label: period.label,
  startDate: period.startDate,
  endDate: period.endDate,
});
