import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * commercial_acceptance.decide -- CommercialAcceptanceService.decide()
 * ------------------------------------------------------------------ */

/**
 * MA LY DO cua MOT lan ket thuc don — `#275` K1/K8.
 *
 * ============================================================================================
 * MOI DUONG TU CHOI MOT MA. KHONG GOP.
 * ============================================================================================
 *
 * `#275` K8 dat sau tinh huong khac han nhau len cung mot cong: don chua giao xong, don da huy,
 * thieu can cu, chung tu cua don khac, sua mot quyet dinh cu, va va cham hai nguoi cung bam. Mot
 * `boolean` o day se lam nguoi truc phai mo source doc lai sau dieu kien roi doan xem cai nao da
 * dong — dung cai ma `.claude/rules/ecc/common/code-review.md` cam ("mot cong nghiep vu co N duong
 * tu choi phai phan biet duoc N ly do").
 */
export const COMMERCIAL_ACCEPTANCE_DECIDE_REASONS = [
  'ACCEPTANCE_DECIDED',
  /**
   * Gui lai DUNG mot lenh da ghi — tra ve chinh quyet dinh cu, khong ghi ban thu hai.
   *
   * Mot KET QUA CHO PHEP, khong phai mot loi: `#275` K8 bai 4 doi *"Same idempotency key retry =>
   * one decision/effect"*, va mang cua nguoi bam nut co the mat song giua luc gui va luc nhan y het
   * nhu mang cua lai xe o `#243` F7.
   */
  'ACCEPTANCE_REPLAYED',
  'ACCEPTANCE_ORDER_NOT_FOUND',
  /**
   * Don chua `FULFILLED` — hang chua giao xong.
   *
   * `#275` K5: *"APPROVED but operational prerequisite false => excluded"*. Chan o day la lop THU
   * NHAT; lop thu hai la moi dieu kien van hanh cu cua `SettlementService` van con nguyen. Hai lop
   * doc lap nhau co chu y.
   *
   * DIEU KIEN NAY DOC TU DON, KHONG TU VONG CHAY. `#275` K7 doi chung minh ca hai chieu: vong chay
   * dong duoc trong khi don van cho, va ke toan ket thuc duoc mot don ma khong dung vao vong chay.
   * Neu ma nay con doc `runStatus` thi ca hai chieu do deu khong con dung.
   */
  'ACCEPTANCE_ORDER_NOT_FULFILLED',
  /**
   * Don da bi HUY. Tach khoi `NOT_FULFILLED` vi hai viec phai lam khac han nhau: mot cai cho giao
   * hang, cai kia khong bao gio den.
   */
  'ACCEPTANCE_ORDER_CANCELLED',
  /**
   * Ket thuc ma khong co mot can cu nao. `#275` K2: *"Do not fabricate a file ID. Do not let a raw
   * storage locator satisfy the gate."*
   */
  'ACCEPTANCE_EVIDENCE_REQUIRED',
  /**
   * Ket thuc theo duong `EXTERNAL_PHYSICAL_CONFIRMATION` ma khong noi B da nhan/xac nhan cai gi.
   *
   * Duong khong-co-ban-so LA mot duong hop le (`#275` K2 goi ten no), nhung no phai KE LAI duoc,
   * neu khong thi no chi la mot cach ket thuc khong can bang chung.
   */
  'ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED',
  /**
   * Chung cu duoc tro toi khong thuoc DON dang ket thuc.
   *
   * `#275` K8 bai 6 (*"Order A evidence cannot complete Order B"*) va bai 7 (*"Foreign/unknown
   * evidence fails closed without useful enumeration"*). Biet mot ma tep khong bao gio la du —
   * quyen doc di qua MIEN, khong di qua viec doan trung mot chuoi.
   */
  'ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER',
  /**
   * Da co quyet dinh truoc do ma lenh moi khong khai dang sua quyet dinh nao.
   *
   * `#275` K1 doi giu *"supersedes/correction history"*. Bat khai `supersedesId` bien mot lan doi y
   * thanh mot hanh dong CO TEN, va dong thoi lam the danh dau phien ban — hai nguoi cung bam thi
   * nguoi thu hai va vao `ACCEPTANCE_SUPERSEDES_STALE` thay vi de len nhau (`#275` K8 bai 5).
   */
  'ACCEPTANCE_SUPERSEDES_REQUIRED',
  /** Khai sua mot quyet dinh trong khi chua co quyet dinh nao. */
  'ACCEPTANCE_SUPERSEDES_UNKNOWN',
  /** Khai sua mot quyet dinh KHONG con la ban moi nhat — co nguoi vua ghi truoc. */
  'ACCEPTANCE_SUPERSEDES_STALE',
  /**
   * Ket qua moi trung ket qua dang co, va lenh khong khai la mot lan sua.
   *
   * Tach khoi `ACCEPTANCE_SUPERSEDES_REQUIRED` vi hai cau tra loi khac nhau: cai kia noi "hay khai
   * ban dang sua", cai nay noi "khong co gi de doi".
   */
  'ACCEPTANCE_ALREADY_IN_OUTCOME',
] as const;
export type CommercialAcceptanceDecideReason =
  (typeof COMMERCIAL_ACCEPTANCE_DECIDE_REASONS)[number];

export type TransportCommercialAcceptanceDecisionReason = CommercialAcceptanceDecideReason;

export const TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-acceptance',
  points: ['commercial_acceptance.decide'],
  labels: {
    ACCEPTANCE_DECIDED: 'Da ghi mot quyet dinh ket thuc don',
    ACCEPTANCE_REPLAYED: 'Lenh gui lai — tra ve quyet dinh da ghi, khong ghi ban thu hai',
    ACCEPTANCE_ORDER_NOT_FOUND: 'Khong tim thay don hang',
    ACCEPTANCE_ORDER_NOT_FULFILLED: 'Don chua giao xong nen chua co gi de ket thuc',
    ACCEPTANCE_ORDER_CANCELLED: 'Don da bi huy — khong ket thuc thuong mai duoc',
    ACCEPTANCE_EVIDENCE_REQUIRED: 'Ket thuc theo chung tu thi phai tro toi it nhat mot chung tu',
    ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED:
      'Ket thuc khong co ban so thi phai ghi ro B da nhan/xac nhan cai gi',
    ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER: 'Chung cu do khong thuoc don dang ket thuc',
    ACCEPTANCE_SUPERSEDES_REQUIRED: 'Da co quyet dinh truoc — phai khai ro dang sua quyet dinh nao',
    ACCEPTANCE_SUPERSEDES_UNKNOWN: 'Chua co quyet dinh nao de sua',
    ACCEPTANCE_SUPERSEDES_STALE: 'Co nguoi vua ghi mot quyet dinh moi hon — hay tai lai',
    ACCEPTANCE_ALREADY_IN_OUTCOME: 'Ho so da o dung ket qua do roi',
  } satisfies Record<TransportCommercialAcceptanceDecisionReason, string>,
});
