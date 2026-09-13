import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * document.record
 * ------------------------------------------------------------------ */
export const DOCUMENT_RECORD_REASONS = [
  'DOCUMENT_RECORDED',
  /** Gui lai DUNG lenh cu — tra ve chinh chung tu do. `#279` O10 *"retry keeps same identity"*. */
  'DOCUMENT_REPLAYED',
  'DOCUMENT_DRIVER_BINDING_MISSING',
  'DOCUMENT_RUN_NOT_FOUND',
  'DOCUMENT_DRIVER_NOT_ASSIGNED',
  'DOCUMENT_RUN_TERMINAL',
  'DOCUMENT_LEG_NOT_FOUND',
  'DOCUMENT_LEG_NOT_IN_RUN',
  /** Moc neo khong ton tai, hoac thuoc mot vong chay khac. */
  'DOCUMENT_CHECKPOINT_NOT_APPLICABLE',
  /**
   * `#279` O12 — lai xe A gan chung tu vao viec cua lai xe B.
   *
   * Cong THAT nam o day chu khong o giao dien: neo la mot moc, va moc do phai la moc CUA CHINH
   * nguoi dang ghi.
   */
  'DOCUMENT_CHECKPOINT_NOT_OWNED',
  /**
   * Ma tep khong ton tai, hoac khong thuoc pham vi nguoi goi. `#279` O12 *"foreign/unknown File
   * IDs fail closed"*.
   *
   * MOT ma cho ca hai tinh huong, co y: tach chung se bien duong nay thanh mot may do su ton tai.
   */
  'DOCUMENT_FILE_NOT_AVAILABLE',
  /** Tep da bi rut/cach ly. `#279` O2: khong duoc lang le thoa man mot lan nghiem thu sau nay. */
  'DOCUMENT_FILE_NOT_ACTIVE',
  /**
   * Ben goi khai can cu `DIGITAL_FILE` nhung Nen tang Tep chua co tren ban nay.
   *
   * Mot ma RIENG, khong gop vao `DOCUMENT_FILE_NOT_AVAILABLE`: hai tinh huong doi hai viec khac
   * han. O day nguoi dung khong sai gi ca — ho chi phai di duong chung tu giay.
   */
  'DOCUMENT_FILE_PLATFORM_UNAVAILABLE',
  /** Can cu `DIGITAL_FILE` ma khong kem ma tep, hoac nguoc lai. */
  'DOCUMENT_BASIS_MISMATCH',
  /** Can cu chung tu giay ma khong ai noi dang cam cai gi. */
  'DOCUMENT_EXTERNAL_NOTE_REQUIRED',
] as const;
export type DocumentRecordReason = (typeof DOCUMENT_RECORD_REASONS)[number];

/* ------------------------------------------------------------------ *
 * document.withdraw
 * ------------------------------------------------------------------ */
export const DOCUMENT_WITHDRAW_REASONS = [
  'DOCUMENT_WITHDRAWN',
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_ALREADY_WITHDRAWN',
  /**
   * BIEN BAT BIEN — `#279` O2/O12 bai 7.
   *
   * Mot to bien nhan DA DUOC BAN GIAO ve van phong khong rut lai duoc nua. Tu luc to giay roi khoi
   * tay lai xe, ban ghi so cua no khong con la mot ban nhap: no la thu ma nguoi o van phong da doi
   * chieu bang mat, va co the la can cu cua mot lan ket thuc don.
   *
   * Bien nay la CUA MIEN NAY, khong doc sang Lane K: chieu phu thuoc chi di mot huong (nghiem thu
   * DOC chung tu, chung tu khong bao gio nhin thay mot lan nghiem thu). Doc nguoc lai se mo dung su
   * phu thuoc vong ma `#274` cam.
   */
  'DOCUMENT_HANDOVER_LOCKED',
] as const;
export type DocumentWithdrawReason = (typeof DOCUMENT_WITHDRAW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * receipt_handover.record
 * ------------------------------------------------------------------ */
export const RECEIPT_HANDOVER_REASONS = [
  'RECEIPT_HANDOVER_RECORDED',
  'RECEIPT_HANDOVER_REPLAYED',
  'RECEIPT_HANDOVER_ORDER_NOT_FOUND',
  'RECEIPT_HANDOVER_DRIVER_BINDING_MISSING',
  /** Lai xe khai mot don ho khong chay. */
  'RECEIPT_HANDOVER_DRIVER_NOT_ASSIGNED',
  /** Chung tu vien dan khong thuoc don nay — khong muon bien nhan cua don khac. */
  'RECEIPT_HANDOVER_DOCUMENT_NOT_FOR_ORDER',
  /** Khong co ban so va cung khong ai noi dang ban giao cai gi. */
  'RECEIPT_HANDOVER_BASIS_REQUIRED',
  /**
   * Buoc nay khong noi tiep duoc buoc truoc.
   *
   * Vi du: van phong ghi `SUBMITTED_FOR_CONFIRMATION` khi chua ai ghi rang da nhan duoc to giay.
   * Mot chuoi ban giao nhay coc la mot chuoi khong doi chieu duoc voi thuc te.
   */
  'RECEIPT_HANDOVER_OUT_OF_ORDER',
  /** Chinh trang thai do da duoc ghi. Ghi lai khong them mot su that nao. */
  'RECEIPT_HANDOVER_ALREADY_RECORDED',
] as const;
export type ReceiptHandoverReason = (typeof RECEIPT_HANDOVER_REASONS)[number];

export type TransportDocumentDecisionReason =
  | DocumentRecordReason
  | DocumentWithdrawReason
  | ReceiptHandoverReason;

export const TRANSPORT_DOCUMENT_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-checkpoint',
  points: ['document.record', 'document.withdraw', 'receipt_handover.record'],
  labels: {
    DOCUMENT_RECORDED: 'Da ghi mot chung tu van hanh',
    DOCUMENT_REPLAYED: 'Lenh gui lai — tra ve chung tu da ghi, khong ghi ban thu hai',
    DOCUMENT_DRIVER_BINDING_MISSING: 'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
    DOCUMENT_RUN_NOT_FOUND: 'Khong tim thay vong chay',
    DOCUMENT_DRIVER_NOT_ASSIGNED: 'Lai xe chua tung duoc phan cong vao vong chay nay',
    DOCUMENT_RUN_TERMINAL: 'Vong chay da o trang thai cuoi, khong ghi them chung tu duoc',
    DOCUMENT_LEG_NOT_FOUND: 'Khong tim thay chang',
    DOCUMENT_LEG_NOT_IN_RUN: 'Chang do khong thuoc vong chay nay',
    DOCUMENT_CHECKPOINT_NOT_APPLICABLE: 'Moc do khong thuoc vong chay nay',
    DOCUMENT_CHECKPOINT_NOT_OWNED: 'Moc do khong phai cua ban',
    DOCUMENT_FILE_NOT_AVAILABLE: 'Khong dung duoc ma tep do',
    DOCUMENT_FILE_NOT_ACTIVE: 'Tep do da bi rut hoac dang bi cach ly',
    DOCUMENT_FILE_PLATFORM_UNAVAILABLE:
      'Ban nay chua co nen tang tep — hay ghi theo duong chung tu giay',
    DOCUMENT_BASIS_MISMATCH: 'Can cu va ma tep khong khop nhau',
    DOCUMENT_EXTERNAL_NOTE_REQUIRED: 'Phai ghi ro dang cam chung tu giay nao',
    DOCUMENT_WITHDRAWN: 'Da bia mo mot chung tu',
    DOCUMENT_NOT_FOUND: 'Khong tim thay chung tu',
    DOCUMENT_ALREADY_WITHDRAWN: 'Chung tu nay da duoc bia mo tu truoc',
    DOCUMENT_HANDOVER_LOCKED: 'Chung tu da ban giao ve van phong — khong bia mo duoc nua',
    RECEIPT_HANDOVER_RECORDED: 'Da ghi mot buoc ban giao bien nhan',
    RECEIPT_HANDOVER_REPLAYED: 'Lenh gui lai — tra ve buoc da ghi, khong ghi ban thu hai',
    RECEIPT_HANDOVER_ORDER_NOT_FOUND: 'Khong tim thay don hang',
    RECEIPT_HANDOVER_DRIVER_BINDING_MISSING:
      'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
    RECEIPT_HANDOVER_DRIVER_NOT_ASSIGNED: 'Ban chua tung chay don nay',
    RECEIPT_HANDOVER_DOCUMENT_NOT_FOR_ORDER: 'Chung tu do khong thuoc don nay',
    RECEIPT_HANDOVER_BASIS_REQUIRED: 'Phai co ban so hoac ghi ro dang ban giao cai gi',
    RECEIPT_HANDOVER_OUT_OF_ORDER: 'Buoc nay khong noi tiep duoc buoc truoc',
    RECEIPT_HANDOVER_ALREADY_RECORDED: 'Buoc nay da duoc ghi tu truoc',
  } satisfies Record<TransportDocumentDecisionReason, string>,
});
