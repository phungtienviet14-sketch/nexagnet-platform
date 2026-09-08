import type { BusinessDate } from '../business-date.js';

/**
 * NGHIEM THU CHUNG TU / THUONG MAI cua mot vong chay — `#268` Lane I.
 *
 * ============================================================================================
 * DAY LA MOT TRUC KHAC, KHONG PHAI MOT TRANG THAI MOI CUA VONG CHAY
 * ============================================================================================
 *
 * `TransportVehicleRun` giu nguyen bon trang thai cua Lane A (`PLANNED/ACTIVE/COMPLETED/
 * CANCELLED`) va KHONG duoc noi them mot gia tri nao. `#268` noi ro dieu can tach:
 *
 *     `TransportVehicleRun.status = COMPLETED`  =  xe da chay xong
 *     nghiem thu `APPROVED`                     =  B da co chung tu duoc A xac nhan
 *
 * Hai cau do tra loi hai cau hoi khac nhau, do hai nguoi khac nhau tra loi, o hai thoi diem khac
 * nhau. Nhet cau thu hai vao enum trang thai cua vong chay se lam mot lai xe bam "hoan thanh" tro
 * thanh mot su kien TAI CHINH — dung dieu ca lane nay ton tai de chan.
 *
 * ============================================================================================
 * `PENDING` LA SU VANG MAT, KHONG PHAI MOT HANG PHAI GHI
 * ============================================================================================
 *
 * Khong co hang nghiem thu nao cho mot vong chay ⇒ ho so do dang `PENDING` ⇒ KHONG du dieu kien
 * doi soat. Ba he qua, va ca ba deu la he qua an toan:
 *
 *   · Lane I khong phai cam mot duong GHI nao vao luong van hanh — khong sua `MovementService`,
 *     khong sua `CheckpointService`, khong dung vao lich su moc cua `#243` (dieu `#266` cam);
 *   · vang mat khong bao gio doc thanh "da duyet";
 *   · khong can backfill — `#268` I5 cam *"a mass fake `APPROVED by system`"*, va thiet ke nay lam
 *     cho viec backfill tro thanh KHONG CAN THIET chu khong phai bi cam bang ky luat.
 *
 * ============================================================================================
 * TIEN LE TRONG CHINH REPO NAY
 * ============================================================================================
 *
 * `BusinessApproval` cua `source-registry` da viet dung ly le nay cho mot mien khac:
 * *"mot co boolean tra loi duoc 'da duyet chua' va khong tra loi duoc 'ai duyet, luc nao, dua vao
 * dau'"*. No KHONG dung lai duoc o day (chu the cua no la mot nguon tri thuc, no khong co truc ket
 * qua va khong co khoa chong ghi trung), nhung ket luan cua no thi dung nguyen.
 */

/**
 * TRANG THAI doc len cua mot ho so nghiem thu — bon gia tri `#268` I1 liet ke.
 *
 * `PENDING` co mat trong danh sach nay du no khong bao gio duoc GHI: no la gia tri ma tang doc tra
 * ve khi chua co quyet dinh nao. Bo no ra khoi kieu se buoc moi cho doc phai xu ly `null` rieng.
 */
export const COMMERCIAL_ACCEPTANCE_STATES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'NEEDS_CORRECTION',
] as const;
export type CommercialAcceptanceState = (typeof COMMERCIAL_ACCEPTANCE_STATES)[number];

/**
 * KET QUA mot lan quyet dinh — ba gia tri, va `PENDING` CO Y khong nam trong so do.
 *
 * Khong ai "quyet dinh cho no ve trang thai cho". Quay lai trang thai cho la mot lan MO LAI, va no
 * duoc bieu dien bang `NEEDS_CORRECTION` — mot ma noi duoc VI SAO no quay lai, dieu ma mot lan ghi
 * `PENDING` khong noi duoc.
 */
export const COMMERCIAL_ACCEPTANCE_OUTCOMES = ['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'] as const;
export type CommercialAcceptanceOutcome = (typeof COMMERCIAL_ACCEPTANCE_OUTCOMES)[number];

/**
 * CAN CU cua mot lan duyet — B da dua vao cai gi.
 *
 * `#268` I2: *"if the business case legitimately has no digital copy, support an explicit auditable
 * `EXTERNAL_PHYSICAL_CONFIRMATION`/equivalent basis rather than inventing a fake file."*
 *
 * HAI gia tri chu khong mot, va do la ca diem: mot he thong chi cho phep `DOCUMENT` se day nguoi
 * dung toi viec tai len mot tam anh bat ky de qua cong — tuc bien mot rang buoc thanh mot nghi
 * thuc. Mot he thong chi cho phep ghi chu thi khong bao gio ep duoc chung tu that. Khai ca hai,
 * moi cai voi dieu kien rieng, la cach duy nhat de con so "bao nhieu phan tram duyet co ban so"
 * co nghia.
 */
export const COMMERCIAL_ACCEPTANCE_BASES = ['DOCUMENT', 'EXTERNAL_PHYSICAL_CONFIRMATION'] as const;
export type CommercialAcceptanceBasis = (typeof COMMERCIAL_ACCEPTANCE_BASES)[number];

/**
 * MOT LAN QUYET DINH — hang chi ghi them, khong bao gio sua.
 *
 * Cung khuon `TransportExpenseClaimDecision` cua `#232 D-06`, va cung ly le: mot lan duyet la mot
 * su kien DA XAY RA. Doi y ve sau la mot quyet dinh MOI (`sequence` ke tiep), khong phai mot lan
 * ghi de len quyet dinh cu — ghi de la xoa mat dau ai duyet cai gi, luc nao.
 */
export interface CommercialAcceptanceDecision {
  readonly id: string;
  readonly acceptanceId: string;
  /** Bat dau tu 1, duy nhat trong mot ho so. */
  readonly sequence: number;
  readonly outcome: CommercialAcceptanceOutcome;
  /** MA co kieu de loc duoc, khong phai cau chu tu do. */
  readonly reasonCode: string;
  readonly basis: CommercialAcceptanceBasis;
  /**
   * Khoa DUC cua chung tu lam can cu. Rong khi can cu la `EXTERNAL_PHYSICAL_CONFIRMATION`.
   *
   * Mot MANG chu khong mot khoa don: mot lan giao co the co ca phieu giao lan bien ban doi chieu,
   * va bat chon mot cai se lam nguoi duyet phai bo bot bang chung de qua duoc form.
   */
  readonly evidenceRefs: readonly string[];
  /** B thuc su nhan/xac nhan cai gi — bat buoc o duong khong-co-ban-so. */
  readonly externalNote: string | null;
  /** Quyet dinh ma lan nay SUA. `null` o lan dau. */
  readonly supersedesId: string | null;
  /** Khoa chong ghi trung do ben goi dat. Duy nhat trong mot ho so. */
  readonly idempotencyKey: string;
  /** Danh tinh tu PHIEN, khong tu than yeu cau. */
  readonly decidedBy: string;
  /** Gio MAY CHU. Ben goi khong chon duoc gio nay (bai I7 so 14). */
  readonly decidedAt: string;
}

/**
 * HO SO nghiem thu cua MOT vong chay.
 *
 * `state` KHONG phai mot `boolean` mat lich su: no la hinh chieu cua quyet dinh moi nhat, chi duoc
 * ghi trong CUNG MOT giao dich voi viec them mot hang quyet dinh. Dung quy uoc da chay cua
 * `TransportExpenseClaim.status`, va cung ly do: mot phep doc "dang cho ai xu ly" khong nen phai
 * duyet ca lich su moi lan mo hang cho.
 */
export interface CommercialAcceptance {
  readonly id: string;
  readonly runId: string;
  readonly state: CommercialAcceptanceState;
  /** Phap nhan ben A, khi biet. `#268` I1 goi day la truong TUY CHON. */
  readonly counterpartyId: string | null;
  readonly businessDate: BusinessDate;
  readonly latestDecisionId: string | null;
  readonly openedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Ho so kem CA lich su — hinh dang ma be mat nguoi duyet can. */
export interface CommercialAcceptanceDetail {
  readonly acceptance: CommercialAcceptance;
  readonly decisions: readonly CommercialAcceptanceDecision[];
}

/**
 * LENH ghi mot quyet dinh. Danh tinh den tu PHIEN, gio den tu MAY CHU.
 *
 * KHONG co truong `decidedBy` lan `decidedAt` — do la ca diem. `#268` I3 doi *"no caller-supplied
 * `decidedBy`"* va I7 so 14 doi *"Client clock cannot choose `approvedAt`"*. Cach chac chan nhat de
 * giu hai dieu do la lam cho chung KHONG BIEU DIEN DUOC o bien mien, thay vi kiem tra roi bo di.
 */
export interface RecordAcceptanceDecisionCommand {
  readonly runId: string;
  readonly outcome: CommercialAcceptanceOutcome;
  readonly reasonCode: string;
  readonly basis: CommercialAcceptanceBasis;
  readonly evidenceRefs: readonly string[];
  readonly externalNote: string | null;
  readonly counterpartyId: string | null;
  readonly supersedesId: string | null;
  readonly idempotencyKey: string;
  /** Tu `request.authUser.id`. Xem `requireAuthUserId`. */
  readonly authUserId: string;
}

/**
 * MOT DONG cua hang cho nguoi duyet — `#268` I6.
 *
 * `settlementEligible` la mot phep SUY RA (`state === 'APPROVED'` VA vong chay da `COMPLETED`),
 * khong phai mot cot. Mot cot se lech voi cong that ngay lan dau ai do sua mot ben ma quen ben kia,
 * va luc do khong ai biet ben nao dung.
 *
 * KHONG co truong gia cuoc/doanh thu: hang cho nay noi ve CHUNG TU, khong noi ve tien. Mang tien
 * vao day se lam mot man hinh nghiem thu tro thanh mot bao cao cong no — hai be mat, hai quyen.
 */
export interface CommercialAcceptanceQueueRow {
  readonly acceptanceId: string | null;
  readonly runId: string;
  readonly runCode: string;
  readonly runStatus: string;
  readonly runCompletedAt: string | null;
  readonly vehicleId: string;
  readonly state: CommercialAcceptanceState;
  readonly counterpartyId: string | null;
  readonly businessDate: BusinessDate;
  readonly evidenceCount: number;
  readonly settlementEligible: boolean;
  readonly latestDecidedAt: string | null;
  readonly latestDecidedBy: string | null;
}
