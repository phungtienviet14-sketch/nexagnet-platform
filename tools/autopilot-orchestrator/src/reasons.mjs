/**
 * Ma ly do cua TANG ORCHESTRATOR — khong phai cua giao thuc.
 *
 * Giao thuc co bo ma rieng (`validator/reasons.mjs`, 59 ma) noi ve THONG DIEP va CONG. Bo nay noi
 * ve viec LAY BANG CHUNG TU GITHUB: goi API hong, hinh dang tra ve khac hop dong, thieu quyen.
 * Hai bo tach nhau co chu dich — mot ma o day khong bao gio duoc dung de tu choi mot thong diep,
 * va nguoc lai. Co test khoa dieu do.
 */
export const ORCHESTRATOR_REASONS = Object.freeze({
  /** Payload su kien khong co hinh dang cua mot webhook GitHub da biet. */
  EVENT_SHAPE_UNKNOWN: 'EVENT_SHAPE_UNKNOWN',
  /** Su kien co hinh dang dung nhung khong phai loai orchestrator nay xu ly. */
  EVENT_NOT_HANDLED: 'EVENT_NOT_HANDLED',
  /** Comment khong mang mot thong diep giao thuc nao — khong phai loi, chi la khong lien quan. */
  NOT_A_PROTOCOL_MESSAGE: 'NOT_A_PROTOCOL_MESSAGE',
  /** Goi API ruleset khong tra ve mang rule. Khong duoc doan danh sach check bat buoc. */
  BRANCH_RULES_UNAVAILABLE: 'BRANCH_RULES_UNAVAILABLE',
  /** API tra ve mang rule nhung khong rule nao khai required_status_checks. */
  BRANCH_RULES_NO_REQUIRED_CHECKS: 'BRANCH_RULES_NO_REQUIRED_CHECKS',
  /** Goi API check-runs khong tra ve mang. */
  CHECK_RUNS_UNAVAILABLE: 'CHECK_RUNS_UNAVAILABLE',
  /** Mot check-run tu API thieu `head_sha` — bang chung khong buoc duoc vao HEAD. */
  CHECK_RUN_UNBOUND: 'CHECK_RUN_UNBOUND',
  /** Khong doc duoc HEAD hien tai cua PR. */
  PR_HEAD_UNAVAILABLE: 'PR_HEAD_UNAVAILABLE',
  /** So do principal chua duoc cau hinh cho repo nay. */
  REGISTRY_NOT_CONFIGURED: 'REGISTRY_NOT_CONFIGURED',
});

/** @typedef {{ ok: false, reason: string, detail?: Record<string, unknown> }} Failed */

/**
 * @template T
 * @param {T} value
 * @returns {{ ok: true, value: T }}
 */
export const succeed = (value) => ({ ok: true, value });

/**
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 * @returns {Failed}
 */
export const fail = (reason, detail) =>
  detail ? { ok: false, reason, detail } : { ok: false, reason };
