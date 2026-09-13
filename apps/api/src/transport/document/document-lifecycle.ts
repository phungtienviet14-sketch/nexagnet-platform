import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import type { DocumentRecordReason, DocumentWithdrawReason } from './document-decisions.js';
import type {
  OperationalDocumentBasis,
  OperationalDocumentStatus,
  OperationalDocumentType,
} from './document.types.js';

/**
 * QUY TAC cua chung tu van hanh — ham THUAN, khong cham mang, khong cham dia.
 *
 * ============================================================================================
 * KHONG PHAI MOT MAY TRANG THAI
 * ============================================================================================
 *
 * Cung ly le voi `checkpoint-lifecycle.ts`: mot vong chay co TAT CA cac chung tu cua no cung mot
 * luc. Khong co thu tu bat buoc giua `GATE_PASS` va `WEIGH_TICKET` — nhieu bai khong co cong, va
 * nhieu bai qua cong roi moi den can.
 *
 * Cai duy nhat tep nay ep ve THU TU la mot dieu hien nhien: khong ghi mot to bien nhan giao hang
 * cho mot chang chua ai den.
 */

/**
 * CHINH SACH CHUNG TU — cai gi BAT BUOC o ho so nao.
 *
 * `#279` O3: *"Do not force every document for every customer/site. Required/optional document
 * policy must be configurable/source-backed."*
 *
 * Nen day la mot CAU HINH, khong mot hang so cua nen tang. Va no chi sinh ra CANH BAO, khong chan
 * mot lan ghi nao: `#243` F6 doi *"missing-document/proof warnings without silently fabricating
 * completion"* — canh bao la de nguoi doi soat nhin thay, khong phai de chan mot lai xe dang o hien
 * truong.
 */
/**
 * TOKEN tiem chinh sach chung tu.
 *
 * O DAY chu khong o mot trong hai noi dung no, vi CA HAI deu dung: `DriverFieldReadService` (tinh
 * canh bao cho mot lai xe) va `ControlTowerFieldFactsAdapter` (tinh canh bao cho ca doi xe). Hai
 * ban token se lam hai man hinh doc hai chinh sach khac nhau tren cung du lieu.
 */
export const TRANSPORT_DOCUMENT_POLICY = Symbol('TRANSPORT_DOCUMENT_POLICY');

export interface DocumentRequirementPolicy {
  /** Loai chung tu BAT BUOC tren mot chang CO HANG. Thieu thi canh bao, khong chan. */
  readonly requiredOnLoadedLeg: readonly OperationalDocumentType[];
}

/**
 * MAC DINH CUA HO SO B — mot to bien nhan giao hang, va khong hon.
 *
 * Chi MOT loai, va do la mot lua chon co y. `#232 D-08` chot rang giao hang bat buoc co chung cu;
 * `#279` O3 cam ep moi loai cho moi khach. Ba loai con lai (`GATE_PASS`, `LOADING_SLIP`,
 * `WEIGH_TICKET`) phu thuoc vao tung nha may A — co noi co cong va can, co noi khong — nen ep
 * chung se lam moi chang di qua mot kho khong co can deu hien mot canh bao gia.
 *
 * Khai o day chu khong o `tenant.schema.ts`, cung ly le voi `TRANSPORT_CHECKPOINT_POLICY`: mac
 * dinh nay dung duoc ngay, nen bat khach khai no se bien mot khoi hoan toan tuy chon thanh mot
 * dieu kien boot.
 */
export const DEFAULT_DOCUMENT_REQUIREMENT_POLICY: DocumentRequirementPolicy = {
  requiredOnLoadedLeg: ['DELIVERY_RECEIPT'],
};

/** Loai moc ma mot chung tu duoc phep neo vao, theo tung loai chung tu. `null` = neo vao dau cung duoc. */
const ANCHOR_HINT: Readonly<Record<OperationalDocumentType, readonly RunCheckpointType[] | null>> =
  {
    GATE_PASS: ['GATE_ENTRY', 'PICKUP_ARRIVAL'],
    LOADING_SLIP: ['LOADING'],
    WEIGH_TICKET: ['LOADING', 'PICKUP_DEPARTURE'],
    DELIVERY_RECEIPT: ['DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED'],
    OTHER: null,
  };

/**
 * Loai moc GOI Y cho mot loai chung tu — de giao dien dat nut dung cho.
 *
 * GOI Y, khong RANG BUOC: `evaluateDocumentRecord` khong dung den bang nay. Mot to phieu can ghi
 * o moc `DELIVERY_ARRIVAL` van la mot to phieu can that; chan no lai se lam lai xe khong ghi duoc
 * roi ho bo qua luon buoc ghi.
 */
export const anchorHintFor = (type: OperationalDocumentType): readonly RunCheckpointType[] | null =>
  ANCHOR_HINT[type];

export interface DocumentRecordDecision {
  readonly allowed: boolean;
  readonly reason: DocumentRecordReason;
}

export interface DocumentRecordEvaluation {
  readonly runTerminal: boolean;
  readonly basis: OperationalDocumentBasis;
  readonly hasFileId: boolean;
  readonly externalNote: string;
}

/**
 * Mot chung tu co duoc ghi khong — tra ve LY DO, khong phai `boolean`.
 *
 * Cai tep nay KHONG kiem: quyen so huu moc, su ton tai cua tep, va quyen doc tep. Ca ba deu la
 * loi goi ra ngoai va thuoc tang dich vu. O day chi con phan noi ve HINH DANG cua lenh — va do la
 * phan duy nhat kiem duoc ma khong cham mang.
 */
export function evaluateDocumentRecord(input: DocumentRecordEvaluation): DocumentRecordDecision {
  if (input.runTerminal) return { allowed: false, reason: 'DOCUMENT_RUN_TERMINAL' };

  // CAN CU va MA TEP phai di cung nhau, hoac khong cai nao. Mot lenh khai `DIGITAL_FILE` ma khong
  // co ma tep se ghi ra mot chung tu ban so KHONG CO ban so nao — va no van dem duoc trong moi
  // phep dem "co bao nhieu chung tu".
  if (input.basis === 'DIGITAL_FILE' && !input.hasFileId) {
    return { allowed: false, reason: 'DOCUMENT_BASIS_MISMATCH' };
  }
  if (input.basis === 'EXTERNAL_PHYSICAL' && input.hasFileId) {
    return { allowed: false, reason: 'DOCUMENT_BASIS_MISMATCH' };
  }
  if (input.basis === 'EXTERNAL_PHYSICAL' && input.externalNote.trim().length === 0) {
    return { allowed: false, reason: 'DOCUMENT_EXTERNAL_NOTE_REQUIRED' };
  }

  return { allowed: true, reason: 'DOCUMENT_RECORDED' };
}

export interface DocumentWithdrawDecision {
  readonly allowed: boolean;
  readonly reason: DocumentWithdrawReason;
}

export interface DocumentWithdrawEvaluation {
  readonly status: OperationalDocumentStatus;
  /** To giay nay DA duoc ban giao ve van phong chua — bien bat bien cua `#279` O2/O12 bai 7. */
  readonly handedOver: boolean;
}

/**
 * Mot chung tu co duoc bia mo khong.
 *
 * `handedOver` la BIEN BAT BIEN, va no la mot su that CUA MIEN NAY chu khong doc sang Lane K: tu
 * luc to giay roi khoi tay lai xe va van phong ghi la da nhan, ban ghi so cua no khong con la mot
 * ban nhap. Nguoi o van phong da doi chieu no bang mat, va no co the la can cu cua mot lan ket
 * thuc don.
 *
 * "Bia mo" chu khong "xoa": hang o lai, mang gio va ten nguoi bia. Mot ho so bang chung xoa duoc
 * thi khong con la bang chung cho bat cu dieu gi.
 */
export function evaluateDocumentWithdraw(
  input: DocumentWithdrawEvaluation,
): DocumentWithdrawDecision {
  if (input.status === 'WITHDRAWN') {
    return { allowed: false, reason: 'DOCUMENT_ALREADY_WITHDRAWN' };
  }
  if (input.handedOver) return { allowed: false, reason: 'DOCUMENT_HANDOVER_LOCKED' };
  return { allowed: true, reason: 'DOCUMENT_WITHDRAWN' };
}

/**
 * CANH BAO THIEU CHUNG TU tren mot chang co hang — `#279` O11, `#243` F6.
 *
 * Tra ve DANH SACH loai con thieu, khong mot `boolean`: mot man hinh noi "thieu 2 chung tu" bat
 * nguoi doi soat phai tu doan la thieu nhung gi.
 *
 * Chi dem chung tu con HIEU LUC. Mot to da bia mo khong con thoa man mot yeu cau nao — do la ca
 * diem cua viec bia mo.
 */
export function missingDocumentTypes(
  policy: DocumentRequirementPolicy,
  present: readonly OperationalDocumentType[],
): readonly OperationalDocumentType[] {
  return policy.requiredOnLoadedLeg.filter((type) => !present.includes(type));
}
