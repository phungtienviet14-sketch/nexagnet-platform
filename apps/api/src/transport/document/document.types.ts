import type { BusinessDate } from '../business-date.js';

/**
 * CHUNG TU VAN HANH — `#279` O1, tiep tuc `#243` F2.
 *
 * ============================================================================================
 * NAM LOAI, VA TAT CA DEU LA GIAY THAT
 * ============================================================================================
 *
 * `#279` O1 liet ke dung nam loai duoi day. Chung khong phai mot phan loai do phan mem nghi ra:
 * moi loai la mot to giay CO THAT ma lai xe cam trong tay o mot diem cu the cua quy trinh, va moi
 * to tra loi mot cau hoi khac nhau khi doi soat:
 *
 *   · `GATE_PASS`        — xe CO vao duoc trong nha may khong, va luc may gio;
 *   · `LOADING_SLIP`     — da xep nhung gi len xe;
 *   · `WEIGH_TICKET`     — bao nhieu tan, va do la con so tinh tien voi khach;
 *   · `DELIVERY_RECEIPT` — nguoi nhan DA KY nhan hang;
 *   · `OTHER`            — cai con lai, ghi kem mo ta.
 *
 * `OTHER` co mat de danh sach nay khong bi noi dai bang mot loai moi cho tung khach. Mot khach co
 * `PHIEU KIEM DINH` rieng thi do la `OTHER` kem nhan — khong phai mot gia tri enum thu sau ma moi
 * khach van tai sau deu thua huong (Quyet dinh kien truc #6).
 *
 * ============================================================================================
 * `DELIVERY_RECEIPT` KHONG PHAI MOT LAN NGHIEM THU
 * ============================================================================================
 *
 * Do la bat bien trung tam ma `#274` va `#279` O7 deu phat bieu:
 *
 *     bien nhan da ve  !=  don da ket thuc ve thuong mai
 *
 * Chup duoc mot to bien nhan la mot su that VAN HANH. Ket thuc mot don la mot quyet dinh THUONG
 * MAI cua Ke toan/Giam doc (Lane K). Mien nay khong co mot duong nao dung vao truc do —
 * `no-order-completion.spec.ts` quet ca thu muc de giu dieu do.
 */
export const OPERATIONAL_DOCUMENT_TYPES = [
  'GATE_PASS',
  'LOADING_SLIP',
  'WEIGH_TICKET',
  'DELIVERY_RECEIPT',
  'OTHER',
] as const;
export type OperationalDocumentType = (typeof OPERATIONAL_DOCUMENT_TYPES)[number];

/**
 * CAN CU cua mot chung tu — B thuc su dang cam cai gi.
 *
 * HAI gia tri chu khong mot, va do la ca diem — cung ly le ma Lane K da viet cho
 * `CommercialAcceptanceBasis`:
 *
 *   · chi cho phep `DIGITAL_FILE` se day nguoi dung toi viec tai len mot tam anh bat ky de qua
 *     cong, tuc bien mot rang buoc thanh mot nghi thuc;
 *   · chi cho phep `EXTERNAL_PHYSICAL` thi khong bao gio ep duoc mot ban so that.
 *
 * Va con mot ly do thu ba, rieng cua tranche nay: Nen tang Tep (`#287`) CHUA vao `main`. Neu chi co
 * mot duong `DIGITAL_FILE` thi ca mien nay khong dung duoc cho toi khi lane kia xong — trong khi
 * B hom nay VAN dang cam giay that trong tay.
 */
export const OPERATIONAL_DOCUMENT_BASES = ['DIGITAL_FILE', 'EXTERNAL_PHYSICAL'] as const;
export type OperationalDocumentBasis = (typeof OPERATIONAL_DOCUMENT_BASES)[number];

/**
 * TRANG THAI cua mot chung tu.
 *
 * `LOCKED` KHONG phai mot trang thai ghi duoc — no la mot phep SUY o tang doc, tu viec to giay do
 * da duoc ban giao ve van phong hay chua. Xem `documentLockReasonOf()`.
 */
export const OPERATIONAL_DOCUMENT_STATUSES = ['ACTIVE', 'WITHDRAWN'] as const;
export type OperationalDocumentStatus = (typeof OPERATIONAL_DOCUMENT_STATUSES)[number];

/**
 * MUC TIN CAY cua lan ghi nhan — `#279` O1 *"source/capture trust metadata where current proof
 * model supports it"*.
 *
 * Cung tu vung voi `TransportProofPhotoCaptureMode` cua Lane B, va CO Y giu nguyen DUNG ba gia tri
 * do (`LIVE_CAMERA`/`GALLERY`/`UNKNOWN`) thay vi dat mot bo thu hai: mot he thong co hai thang do
 * tin cay se co luc cho ra hai ket luan khac nhau ve cung mot tam anh. Cot o CSDL dung LUON kieu
 * enum cua Lane B, nen mot gia tri thu tu them vao mot ben se do o `tsc`.
 */
export const DOCUMENT_CAPTURE_MODES = ['LIVE_CAMERA', 'GALLERY', 'UNKNOWN'] as const;
export type DocumentCaptureMode = (typeof DOCUMENT_CAPTURE_MODES)[number];

/**
 * MOT CHUNG TU DA GHI.
 *
 * `orderId` duoc GIAI o may chu tu chinh chang, khong nhan tu than yeu cau. Do la cong cua `#279`
 * O13 bai 8 (*"DELIVERY_RECEIPT for Order A cannot satisfy Order B"*): neu ben goi khai duoc
 * `orderId` thi ho gan duoc mot to bien nhan cua don nay sang don khac.
 *
 * `extraction*` la UNG VIEN, tach han khoi phan da xac minh — `#279` O8. Khong mot truong nao cua
 * no tham gia vao mot quyet dinh; chung ton tai de nguoi doc so sanh bang mat.
 */
export interface OperationalDocument {
  readonly id: string;
  readonly type: OperationalDocumentType;
  readonly runId: string;
  readonly legId: string | null;
  /** Don thuong mai cua chang — GIAI o may chu. `null` khi chang la chang rong. */
  readonly orderId: string | null;
  readonly checkpointId: string | null;
  readonly counterpartySiteId: string | null;
  readonly driverId: string | null;
  readonly recordedBy: string;
  readonly basis: OperationalDocumentBasis;
  /** Ma tep DUC. `null` o duong chung tu giay. KHONG BAO GIO la mot dinh vi kho. */
  readonly fileId: string | null;
  /** B dang cam cai gi — bat buoc o duong khong-co-ban-so. */
  readonly externalNote: string | null;
  readonly label: string | null;
  readonly captureMode: DocumentCaptureMode;
  readonly status: OperationalDocumentStatus;
  readonly clientEventId: string;
  readonly receivedAt: Date;
  readonly withdrawnAt: Date | null;
  readonly withdrawnBy: string | null;
  /** UNG VIEN do may doc ra — `#279` O8. KHONG phai su that da xac minh. */
  readonly extractionCandidate: string | null;
  readonly extractionProvider: string | null;
  readonly businessDate: BusinessDate;
  readonly createdAt: Date;
}

/** Lenh ghi mot chung tu. Danh tinh tu PHIEN, gio tu MAY CHU, `orderId` tu CHANG. */
export interface RecordDocumentCommand {
  readonly type: OperationalDocumentType;
  readonly runId: string;
  readonly legId?: string;
  readonly checkpointId?: string;
  readonly counterpartySiteId?: string;
  readonly basis: OperationalDocumentBasis;
  readonly fileId?: string;
  readonly externalNote?: string;
  readonly label?: string;
  readonly captureMode?: DocumentCaptureMode;
  readonly clientEventId: string;
  readonly authUserId: string;
}

export interface WithdrawDocumentCommand {
  readonly documentId: string;
  readonly reason: string;
  readonly authUserId: string;
}
