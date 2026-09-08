import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * commercial_acceptance.decide -- CommercialAcceptanceService.decide()
 * ------------------------------------------------------------------ */

/**
 * MA LY DO cua MOT lan nghiem thu chung tu — `#268` I1/I4.
 *
 * ============================================================================================
 * MOI DUONG TU CHOI MOT MA. KHONG GOP.
 * ============================================================================================
 *
 * `#268` I4 dat bon tinh huong khac han nhau len cung mot cong: chua chay xong, thieu can cu,
 * sua mot quyet dinh cu, va va cham hai nguoi cung bam. Mot `boolean` o day se lam nguoi truc phai
 * mo source doc lai bon dieu kien roi doan xem cai nao da dong — dung cai ma
 * `.claude/rules/ecc/common/code-review.md` cam ("mot cong nghiep vu co N duong tu choi phai phan
 * biet duoc N ly do").
 */
export const COMMERCIAL_ACCEPTANCE_DECIDE_REASONS = [
  'ACCEPTANCE_DECIDED',
  /**
   * Gui lai DUNG mot lenh da ghi — tra ve chinh quyet dinh cu, khong ghi ban thu hai.
   *
   * Mot KET QUA CHO PHEP, khong phai mot loi: `#268` I4 doi *"Retry with same idempotency key
   * returns the same business effect"*, va mang cua nguoi bam nut co the mat song giua luc gui va
   * luc nhan y het nhu mang cua lai xe o `#243` F7.
   */
  'ACCEPTANCE_REPLAYED',
  'ACCEPTANCE_RUN_NOT_FOUND',
  /**
   * Vong chay chua `COMPLETED` (hoac da `CANCELLED`).
   *
   * `#268` I5 bai 6: *"Approval before operational completion cannot make work
   * settlement-eligible"*. Chan o day la lop THU NHAT; lop thu hai la moi dieu kien van hanh cu cua
   * `SettlementService` van con nguyen. Hai lop doc lap nhau co chu y.
   */
  'ACCEPTANCE_RUN_NOT_COMPLETED',
  /**
   * Duyet ma khong co mot can cu nao. `#268` I2: *"Do not store `A confirmed = true` without
   * preserving who in B recorded it and what evidence/basis was used."*
   */
  'ACCEPTANCE_EVIDENCE_REQUIRED',
  /**
   * Duyet theo duong `EXTERNAL_PHYSICAL_CONFIRMATION` ma khong noi B da nhan/xac nhan cai gi.
   *
   * Duong khong-co-ban-so LA mot duong hop le (`#268` I2 goi ten no), nhung no phai KE LAI duoc,
   * neu khong thi no chi la mot cach duyet khong can bang chung.
   */
  'ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED',
  /**
   * Chung cu duoc tro toi khong thuoc vong chay dang nghiem thu.
   *
   * Bai I7 so 4: *"Foreign/cross-driver/cross-tenant evidence cannot be used to approve."* Biet mot
   * ma tep khong bao gio la du — quyen doc di qua MIEN, khong di qua viec doan trung mot chuoi.
   */
  'ACCEPTANCE_EVIDENCE_NOT_FOR_RUN',
  /**
   * Da co quyet dinh truoc do ma lenh moi khong khai dang sua quyet dinh nao.
   *
   * `#268` I4: *"Never silently edit `approvedBy/approvedAt`."* Bat khai `supersedesId` bien mot
   * lan doi y thanh mot hanh dong CO TEN, va dong thoi lam the danh dau phien ban — hai nguoi cung
   * bam thi nguoi thu hai va vao `ACCEPTANCE_SUPERSEDES_STALE` thay vi de len nhau.
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
    ACCEPTANCE_DECIDED: 'Da ghi mot quyet dinh nghiem thu chung tu',
    ACCEPTANCE_REPLAYED: 'Lenh gui lai — tra ve quyet dinh da ghi, khong ghi ban thu hai',
    ACCEPTANCE_RUN_NOT_FOUND: 'Khong tim thay vong chay',
    ACCEPTANCE_RUN_NOT_COMPLETED: 'Vong chay chua chay xong nen chua co gi de nghiem thu',
    ACCEPTANCE_EVIDENCE_REQUIRED: 'Duyet theo chung tu thi phai tro toi it nhat mot chung tu',
    ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED:
      'Duyet khong co ban so thi phai ghi ro B da nhan/xac nhan cai gi',
    ACCEPTANCE_EVIDENCE_NOT_FOR_RUN: 'Chung cu do khong thuoc vong chay dang nghiem thu',
    ACCEPTANCE_SUPERSEDES_REQUIRED: 'Da co quyet dinh truoc — phai khai ro dang sua quyet dinh nao',
    ACCEPTANCE_SUPERSEDES_UNKNOWN: 'Chua co quyet dinh nao de sua',
    ACCEPTANCE_SUPERSEDES_STALE: 'Co nguoi vua ghi mot quyet dinh moi hon — hay tai lai',
    ACCEPTANCE_ALREADY_IN_OUTCOME: 'Ho so da o dung ket qua do roi',
  } satisfies Record<TransportCommercialAcceptanceDecisionReason, string>,
});
