import type { BusinessDate } from '../business-date.js';
import type { OrderStatus } from '../movement/movement.types.js';

/**
 * KET THUC THUONG MAI cua mot DON HANG — `#275` Lane K (sua `#268` Lane I).
 *
 * ============================================================================================
 * CHU THE LA `TransportOrder`, KHONG PHAI `TransportVehicleRun`
 * ============================================================================================
 *
 * `#275` chot lai dieu ma `#268` de mo:
 *
 *     FINAL COMPLETION SUBJECT = TransportOrder
 *     NOT VehicleRun
 *     NOT projected-work-only
 *
 * Ly do la nghiep vu, khong phai kien truc: sep va ke toan lam viec tren DON. Mot vong chay la mot
 * hien vat DIEU HANH — no co the cho hai don, no co the dong lai truoc khi mot trong hai don duoc
 * nghiem thu, va mot don co the KHONG BAO GIO chay bang xe cua B (thue nha xe ngoai). Dat cong ket
 * thuc len vong chay se lam ba tinh huong do khong bieu dien duoc.
 *
 * `TransportOrder` giu nguyen ba trang thai cua no (`OPEN/FULFILLED/CANCELLED`) va KHONG duoc noi
 * them mot gia tri nao — `#275` K1: *"Do not force a huge mutable enum if append-only decisions are
 * already the accepted design."* Hai cau hoi, hai truc:
 *
 *     `TransportOrder.status = FULFILLED`  =  hang da giao xong
 *     ket thuc `APPROVED`                  =  ke toan da bam `Da ket thuc` tren don
 *
 * ============================================================================================
 * `PENDING` LA SU VANG MAT, KHONG PHAI MOT HANG PHAI GHI
 * ============================================================================================
 *
 * Khong co hang ket thuc nao cho mot don ⇒ don do dang `PENDING` ⇒ KHONG du dieu kien doi soat.
 * Ba he qua, va ca ba deu la he qua an toan:
 *
 *   · lane nay khong phai cam mot duong GHI nao vao luong van hanh — khong sua vong doi don, khong
 *     dung vao lich su moc cua `#243`;
 *   · vang mat khong bao gio doc thanh "da ket thuc";
 *   · khong can backfill — `#275` K6 cam *"mass fake `APPROVED by system`"*, va thiet ke nay lam
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
 * TRANG THAI doc len cua mot ho so ket thuc don — bon gia tri `#275` K1 liet ke.
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
 *
 * `APPROVED` la ma NOI BO cho hanh dong ma nguoi dung thay la `Da ket thuc` (`#275` K1 cho phep
 * dung mot ma noi bo ro hon thay vi nhoi them gia tri vao enum vong doi cua don). Chu hien thi song
 * o tang giao dien, khong o day — mot enum mang chu tieng Viet co dau se lam moi phep loc va moi
 * lan di tru phu thuoc vao cach viet.
 */
export const COMMERCIAL_ACCEPTANCE_OUTCOMES = ['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'] as const;
export type CommercialAcceptanceOutcome = (typeof COMMERCIAL_ACCEPTANCE_OUTCOMES)[number];

/**
 * CAN CU cua mot lan ket thuc — B da dua vao cai gi.
 *
 * `#275` K2: *"The business fact is not 'AI saw a signature'. It is: B has a real receipt /
 * confirmation basis → human Accounting/Admin records the final decision."*
 *
 * HAI gia tri chu khong mot, va do la ca diem: mot he thong chi cho phep `DOCUMENT` se day nguoi
 * dung toi viec tai len mot tam anh bat ky de qua cong — tuc bien mot rang buoc thanh mot nghi
 * thuc. Mot he thong chi cho phep ghi chu thi khong bao gio ep duoc chung tu that. Khai ca hai,
 * moi cai voi dieu kien rieng, la cach duy nhat de con so "bao nhieu phan tram ket thuc co ban so"
 * co nghia.
 */
export const COMMERCIAL_ACCEPTANCE_BASES = ['DOCUMENT', 'EXTERNAL_PHYSICAL_CONFIRMATION'] as const;
export type CommercialAcceptanceBasis = (typeof COMMERCIAL_ACCEPTANCE_BASES)[number];

/**
 * MOT LAN QUYET DINH — hang chi ghi them, khong bao gio sua.
 *
 * Cung khuon `TransportExpenseClaimDecision` cua `#232 D-06`, va cung ly le: mot lan ket thuc la
 * mot su kien DA XAY RA. Doi y ve sau la mot quyet dinh MOI (`sequence` ke tiep), khong phai mot
 * lan ghi de len quyet dinh cu — ghi de la xoa mat dau ai quyet cai gi, luc nao.
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
   * va bat chon mot cai se lam nguoi quyet phai bo bot bang chung de qua duoc form.
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
  /** Gio MAY CHU. Ben goi khong chon duoc gio nay (`#275` K8 bai 16). */
  readonly decidedAt: string;
}

/**
 * HO SO ket thuc cua MOT DON HANG.
 *
 * `orderId` la chu the — `#275` K1. Truong `runId` cua `#271` khong con o day: mot ho so ket thuc
 * KHONG noi gi ve vong chay nao da cho hang, va lam no noi duoc se mo lai dung su nham lan ma
 * `#275` dong lai. (Cot `runId` van con TRONG CSDL de mot hang cu doc duoc — xem khoi chu thich cua
 * migration `20260910120000`.)
 *
 * `state` KHONG phai mot `boolean` mat lich su: no la hinh chieu cua quyet dinh moi nhat, chi duoc
 * ghi trong CUNG MOT giao dich voi viec them mot hang quyet dinh.
 */
export interface CommercialAcceptance {
  readonly id: string;
  readonly orderId: string;
  readonly state: CommercialAcceptanceState;
  /** Phap nhan ben A, khi biet. `#275` K1 goi day la truong TUY CHON. */
  readonly counterpartyId: string | null;
  readonly businessDate: BusinessDate;
  readonly latestDecisionId: string | null;
  readonly openedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Ho so kem CA lich su — hinh dang ma be mat nguoi quyet can. */
export interface CommercialAcceptanceDetail {
  readonly acceptance: CommercialAcceptance;
  readonly decisions: readonly CommercialAcceptanceDecision[];
}

/**
 * LENH ghi mot quyet dinh. Danh tinh den tu PHIEN, gio den tu MAY CHU.
 *
 * KHONG co truong `decidedBy` lan `decidedAt` — do la ca diem. `#275` K1 doi *"`decidedBy`, role
 * and server time must never come from caller payload"*. Cach chac chan nhat de giu dieu do la lam
 * cho chung KHONG BIEU DIEN DUOC o bien mien, thay vi kiem tra roi bo di.
 */
export interface RecordAcceptanceDecisionCommand {
  readonly orderId: string;
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
 * KET LUAN ve mot DON, doc tu truc ket thuc — hinh dang ma cong doi soat (`#275` K5) can.
 *
 * MOT UNION CO NHAN, khong phai mot `boolean`. Cong doi soat co BA duong di khac han nhau va moi
 * duong phai de lai mot ma ly do RIENG trong so quyet dinh:
 *
 *   · `NO_ORDER`  — nguon quyet toan nay chua co DON nao lam chu the. `#275` K5 doi bo hanh vi
 *     *"`NOT_PROJECTED` => pass"* cua `#273`: *"projection absence must not be an authorization
 *     bypass"*. Nen nhanh nay DONG CONG — nhung no van la mot nhanh RIENG, vi viec nguoi truc phai
 *     lam khac han: chieu/tao don cho chuyen do, chu khong phai di xin chung tu.
 *   · `BLOCKED`   — co don, va no CHUA du dieu kien. Mang theo ca hai ve cua dieu kien
 *     (`orderStatus` va `state`) de thong bao noi duoc CAI GI con thieu.
 *   · `ELIGIBLE`  — `FULFILLED` + `APPROVED`.
 *
 * KHONG co nhanh nao noi ve vong chay. `#275` K5: *"no dependency on whether the internal
 * VehicleRun is open or closed"* — va cach chac nhat de giu dieu do la khong cho kieu nay bieu dien
 * duoc mot trang thai vong chay.
 */
export type OrderCompletionEligibility =
  | { readonly kind: 'NO_ORDER' }
  | {
      readonly kind: 'BLOCKED';
      readonly orderId: string;
      readonly orderCode: string;
      readonly orderStatus: OrderStatus;
      readonly state: CommercialAcceptanceState;
    }
  | {
      readonly kind: 'ELIGIBLE';
      readonly orderId: string;
      readonly orderCode: string;
      readonly acceptanceId: string;
    };

/**
 * MOT DONG cua hang cho `Cho ket thuc / Cho nghiem thu chung tu` — `#275` K4.
 *
 * `settlementEligible` la mot phep SUY RA (`state === 'APPROVED'` VA don da `FULFILLED`), khong
 * phai mot cot. Mot cot se lech voi cong that ngay lan dau ai do sua mot ben ma quen ben kia, va
 * luc do khong ai biet ben nao dung.
 *
 * `vehicleId`/`runCode` la NGU CANH, khong phai dau vao: `#275` K4 noi *"Run may be visible only as
 * advanced/debug context, not required input"*. Chung `null` duoc, va mot dong `null` van quyet
 * dinh duoc — do la phep thu that su cua viec da go bo phu thuoc vao vong chay.
 *
 * KHONG co truong gia cuoc/doanh thu: hang cho nay noi ve CHUNG TU, khong noi ve tien. Mang tien
 * vao day se lam mot man hinh nghiem thu tro thanh mot bao cao cong no — hai be mat, hai quyen.
 */
export interface CommercialAcceptanceQueueRow {
  readonly acceptanceId: string | null;
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: OrderStatus;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly state: CommercialAcceptanceState;
  readonly counterpartyId: string | null;
  readonly businessDate: BusinessDate;
  readonly evidenceCount: number;
  readonly settlementEligible: boolean;
  /** NGU CANH dieu hanh: vong chay dang cho don nay, neu co. Khong phai dau vao cua quyet dinh. */
  readonly runCode: string | null;
  readonly vehicleId: string | null;
  readonly latestDecidedAt: string | null;
  readonly latestDecidedBy: string | null;
}
