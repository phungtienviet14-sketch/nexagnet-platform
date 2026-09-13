import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua lop lap ke hoach vong chay — #276 (Lane L).
 *
 * Cung ky luat voi `movement-decisions.ts`: mot cong nghiep vu co N duong tu choi thi phai co N
 * ma. Lop nay co NHIEU duong tu choi hon binh thuong (che do gom nhom, bai xe, trang thai vong
 * chay, trang thai don, khoa chong lap), va do dung la ly do khong duoc gop chung.
 */

/* ------------------------------------------------------------------ *
 * planning.preview -- PlanningService.preview()
 * ------------------------------------------------------------------ */
export const PLAN_PREVIEW_REASONS = [
  /** Ke hoach se TAO mot vong chay moi cho don nay. */
  'PLAN_PREVIEW_NEW_RUN',
  /** Ke hoach se NOI vao vong chay dang chay cua xe (`MULTI_ORDER_RUN`). */
  'PLAN_PREVIEW_APPEND',
] as const;
export type PlanPreviewReason = (typeof PLAN_PREVIEW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * planning.commit -- PlanningService.commit()
 * ------------------------------------------------------------------ */
export const PLAN_COMMIT_REASONS = [
  'PLAN_COMMITTED_NEW_RUN',
  'PLAN_COMMITTED_APPENDED',
  /**
   * Cung khoa chong lap, cung ket qua. `#276` L9 bai 1: mot lan bam hai lan chi duoc mot vong
   * chay va mot chang co hang.
   */
  'PLAN_COMMIT_REPLAYED',
  /**
   * Don nay DA co mot ke hoach dang hieu luc. `#276` L9 bai 2: hai lan gan cung mot don len hai
   * chiec xe phai that bai TAT DINH, khong phai "ai nhanh hon thi thang roi ban kia im lang".
   */
  'PLAN_ORDER_ALREADY_PLANNED',
  /** Don da huy khong lap ke hoach duoc. */
  'PLAN_ORDER_CANCELLED',
  /** Don da hoan thanh khong lap ke hoach duoc nua. */
  'PLAN_ORDER_FULFILLED',
  /**
   * Hai yeu cau cua CUNG mot khoa den cung luc: ban kia da chiem khoa nhung chua ghi xong. Noi
   * that thay vi doan — cung khuon voi `SITE_INTAKE_CREATE_IN_FLIGHT`.
   */
  'PLAN_COMMIT_IN_FLIGHT',
] as const;
export type PlanCommitReason = (typeof PLAN_COMMIT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * planning.cancel -- PlanningService.cancelPlan()
 * ------------------------------------------------------------------ */
export const PLAN_CANCEL_REASONS = [
  'PLAN_CANCELLED',
  'PLAN_CANCEL_ALREADY_CANCELLED',
  /**
   * Chang co hang cua ke hoach nay DA CHAY XONG. Go no di la viet lai mot quang duong da di —
   * `#276` L3: *"completed legs remain historical/immutable"*.
   */
  'PLAN_CANCEL_LEG_COMPLETED',
] as const;
export type PlanCancelReason = (typeof PLAN_CANCEL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * planning.grouping -- run-grouping.ts / duong quyet dinh gom nhom
 * ------------------------------------------------------------------ */
export const PLAN_GROUPING_REASONS = [
  /** Che do mot-don-mot-vong-chay: luon mot vong chay moi. */
  'GROUPING_ONE_ORDER_PER_RUN',
  /** Che do nhieu-don: xe dang co vong chay chua ket thuc, noi vao do. */
  'GROUPING_MULTI_APPENDED_TO_OPEN_RUN',
  /** Che do nhieu-don nhung xe khong co vong chay nao dang mo: van la mot vong chay moi. */
  'GROUPING_MULTI_NO_OPEN_RUN',
  /**
   * Che do nhieu-don, xe co vong chay nhung no DA o diem cuoi. `#276` L4: *"If a new Order appears
   * after the Run is already closed, create a new Run. Never silently reopen old history."*
   */
  'GROUPING_MULTI_OPEN_RUN_TERMINAL',
] as const;
export type PlanGroupingReason = (typeof PLAN_GROUPING_REASONS)[number];

/* ------------------------------------------------------------------ *
 * planning.depot -- depot.policy.ts
 * ------------------------------------------------------------------ */
export const PLAN_DEPOT_REASONS = [
  'DEPOT_RESOLVED',
  /** Khach khong khai bai nao. Hop le — ke hoach bat dau ngay tai diem lay hang. */
  'DEPOT_NOT_CONFIGURED',
  /**
   * Khach khai HAI bai dang hoat dong tro len. `#276` L5 chot ho so hom nay la MOT bai; chon bua
   * mot cai se sinh nhung chang rong tu mot noi ma xe chua bao gio dau.
   */
  'DEPOT_AMBIGUOUS',
] as const;
export type PlanDepotReason = (typeof PLAN_DEPOT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * planning.run_closure -- PlanningService.evaluateClosure()
 * ------------------------------------------------------------------ */
export const RUN_CLOSURE_REASONS = [
  /** Xe da ve bai va khong con viec: dong. */
  'RUN_CLOSED_ON_DEPOT_RETURN',
  /** Xe dung viec qua nguong nghi da khai: dong. */
  'RUN_CLOSED_ON_IDLE_TIMEOUT',
  /** Khong con gi chan, nhung chua dieu kien nao dong. Khong phai loi. */
  'RUN_CLOSURE_HOLDING',
  /** Con it nhat mot dieu kien chan — chi tiet o `blockers`. */
  'RUN_CLOSURE_BLOCKED',
  /** Vong chay da o diem cuoi tu truoc: khong lam gi, va khong bao loi. */
  'RUN_CLOSURE_ALREADY_TERMINAL',
] as const;
export type RunClosureReason = (typeof RUN_CLOSURE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * planning.run_closure_sweep -- RunClosureService.sweep()
 * ------------------------------------------------------------------ */
export const RUN_CLOSURE_SWEEP_REASONS = [
  /** Co ung vien trong trang nay. `closed` noi bao nhieu vong chay da dong that. */
  'RUN_CLOSURE_SWEEP_RAN',
  /**
   * Khong co ung vien nao. Day la trang thai BINH THUONG cua mot doi xe dang chay — khong phai mot
   * lan quet that bai, va khong phai mot loi.
   */
  'RUN_CLOSURE_SWEEP_EMPTY',
] as const;
export type RunClosureSweepReason = (typeof RUN_CLOSURE_SWEEP_REASONS)[number];

export type TransportPlanningDecisionReason =
  | PlanPreviewReason
  | PlanCommitReason
  | PlanCancelReason
  | PlanGroupingReason
  | PlanDepotReason
  | RunClosureReason
  | RunClosureSweepReason;

export const TRANSPORT_PLANNING_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: [
    'planning.preview',
    'planning.commit',
    'planning.cancel',
    'planning.grouping',
    'planning.depot',
    'planning.run_closure',
    'planning.run_closure_sweep',
  ],
  labels: {
    PLAN_PREVIEW_NEW_RUN: 'Ke hoach se mo mot vong chay moi cho don nay',
    PLAN_PREVIEW_APPEND: 'Ke hoach se noi don nay vao vong chay dang chay',
    PLAN_COMMITTED_NEW_RUN: 'Da mo vong chay moi va gan don vao do',
    PLAN_COMMITTED_APPENDED: 'Da noi don vao vong chay dang chay',
    PLAN_COMMIT_REPLAYED:
      'Cung khoa chong lap: tra lai dung ket qua cu, khong lap ke hoach lan hai',
    PLAN_ORDER_ALREADY_PLANNED: 'Don nay dang co mot ke hoach hieu luc — huy ke hoach do truoc',
    PLAN_ORDER_CANCELLED: 'Don da huy, khong lap ke hoach duoc',
    PLAN_ORDER_FULFILLED: 'Don da hoan thanh, khong lap ke hoach duoc',
    PLAN_COMMIT_IN_FLIGHT: 'Lan bam nay dang duoc xu ly — thu lai sau mot lat',
    PLAN_CANCELLED: 'Da huy ke hoach va cac chang chua chay cua no',
    PLAN_CANCEL_ALREADY_CANCELLED: 'Ke hoach da huy tu truoc',
    PLAN_CANCEL_LEG_COMPLETED: 'Chang co hang cua ke hoach nay da chay xong, khong go nguoc duoc',
    GROUPING_ONE_ORDER_PER_RUN: 'Che do mot don mot vong chay: mo vong chay rieng',
    GROUPING_MULTI_APPENDED_TO_OPEN_RUN: 'Che do nhieu don: noi vao vong chay chua ket thuc cua xe',
    GROUPING_MULTI_NO_OPEN_RUN: 'Che do nhieu don nhung xe chua co vong chay nao dang mo',
    GROUPING_MULTI_OPEN_RUN_TERMINAL:
      'Vong chay cu da ket thuc: mo vong chay moi, khong mo lai cai cu',
    DEPOT_RESOLVED: 'Da xac dinh bai xe dang hoat dong',
    DEPOT_NOT_CONFIGURED: 'Khach chua khai bai xe nao — ke hoach bat dau tai diem lay hang',
    DEPOT_AMBIGUOUS: 'Khach khai nhieu bai xe dang hoat dong — khong chon thay duoc',
    RUN_CLOSED_ON_DEPOT_RETURN: 'Xe da ve bai va het viec: he thong dong vong chay',
    RUN_CLOSED_ON_IDLE_TIMEOUT: 'Xe dung viec qua nguong da khai: he thong dong vong chay',
    RUN_CLOSURE_HOLDING: 'Khong con gi chan, nhung chua den dieu kien dong',
    RUN_CLOSURE_BLOCKED: 'Con dieu kien chan, chua dong vong chay',
    RUN_CLOSURE_ALREADY_TERMINAL: 'Vong chay da o trang thai cuoi tu truoc',
    RUN_CLOSURE_SWEEP_RAN: 'Luot quet dinh ky da chay tren mot trang ung vien',
    RUN_CLOSURE_SWEEP_EMPTY: 'Luot quet dinh ky khong co ung vien nao',
  } satisfies Record<TransportPlanningDecisionReason, string>,
});
