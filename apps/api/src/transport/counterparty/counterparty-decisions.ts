import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua xuong song danh tinh doi tac (R1-A).
 *
 * Mot cong nghiep vu co N duong tu choi phai phan biet duoc N ly do. O day co ba duong tu choi
 * KHAC HAN NHAU ma mot `boolean` se gop mat:
 *
 *   · chu the khong ton tai        -> nguoi nhap go nham id, sua duoc ngay;
 *   · chu the da thuoc phap nhan khac -> du lieu that su xung dot, phai co nguoi quyet;
 *   · loai chu the chua co adapter -> khach chua bat capability tuong ung, khong ai sai ca.
 *
 * Gop ba thu do thanh mot `403` se lam nguoi truc khong biet phai sua o dau.
 */

/* ------------------------------------------------------------------ *
 * counterparty.link — CounterpartyService.link()
 * ------------------------------------------------------------------ */
export const COUNTERPARTY_LINK_REASONS = [
  'LINK_CREATED',
  /** Lien ket y het ban dang co — khong ghi them mot hang nao, va do la mot lan chay lai binh thuong. */
  'LINK_UNCHANGED',
  /** `subjectId` khong tro toi hang nao trong bang chuyen mon tuong ung. */
  'SUBJECT_NOT_FOUND',
  /** Hang chuyen mon do DA thuoc mot phap nhan khac. Khong ghi de — bat bien cua ca tranche. */
  'SUBJECT_ALREADY_LINKED',
  /**
   * Loai chu the nay chua co adapter o tang lap rap.
   *
   * Khong phai loi cua nguoi goi: no co nghia la kho tuong ung khong duoc nap vi khach chua bat
   * capability do. Tra ve mot ma RIENG de nguoi truc doc log biet phai bat cai gi, thay vi di tim
   * mot `subjectId` khong he sai.
   */
  'SUBJECT_KIND_UNAVAILABLE',
] as const;
export type CounterpartyLinkReason = (typeof COUNTERPARTY_LINK_REASONS)[number];

/* ------------------------------------------------------------------ *
 * counterparty.unlink — CounterpartyService.unlink()
 * ------------------------------------------------------------------ */
export const COUNTERPARTY_UNLINK_REASONS = [
  'UNLINK_RECORDED',
  /** Khong co lien ket nao de go. Idempotent, khong nem. */
  'UNLINK_NOT_LINKED',
] as const;
export type CounterpartyUnlinkReason = (typeof COUNTERPARTY_UNLINK_REASONS)[number];

export type TransportCounterpartyDecisionReason = CounterpartyLinkReason | CounterpartyUnlinkReason;

export const TRANSPORT_COUNTERPARTY_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: ['counterparty.link', 'counterparty.unlink'],
  labels: {
    LINK_CREATED: 'Đã nối một mặt của pháp nhân',
    LINK_UNCHANGED: 'Liên kết đã có sẵn, không ghi thêm',
    SUBJECT_NOT_FOUND: 'Không tìm thấy bản ghi chuyên môn để nối',
    SUBJECT_ALREADY_LINKED: 'Bản ghi đó đã thuộc một pháp nhân khác',
    SUBJECT_KIND_UNAVAILABLE:
      'Loại chủ thể này chưa có adapter — khách chưa bật capability tương ứng',

    UNLINK_RECORDED: 'Đã gỡ liên kết',
    UNLINK_NOT_LINKED: 'Không có liên kết nào để gỡ',
  } satisfies Record<TransportCounterpartyDecisionReason, string>,
});
