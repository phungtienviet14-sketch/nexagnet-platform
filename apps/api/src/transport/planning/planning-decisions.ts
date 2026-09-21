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
  /**
   * Chiec xe duoc chon khong co lai xe nao dang phu trach.
   *
   * Giao xe ma khong biet ai cam vo lang se sinh mot vong chay MO COI: no ton tai, no hien tren
   * bang dieu hanh, nhung `listOpenRunsForDriver()` khong tra no ve cho ai ca — khong lai xe nao
   * mo duoc chang cua no. Tu choi TAI DAY dat dung, vi luc nay chua co hang nao duoc ghi.
   */
  'PLAN_VEHICLE_DRIVER_MISSING',
  /**
   * Chiec xe dang co TU HAI ban phan cong lai xe hieu luc tro len.
   *
   * Chon bua mot nguoi se gan viec cho nguoi khong cam chuyen do. Cung ly le voi `DEPOT_AMBIGUOUS`:
   * khi du lieu nen mo ho thi noi that, khong doan.
   */
  'PLAN_VEHICLE_DRIVER_AMBIGUOUS',
  /*
   * BA MA DUOI DAY tra loi mot cau khac hai ma o tren: khong phai "ai cam xe", ma "nguoi cam xe co
   * MO duoc man Hien truong khong". Man do di `phien -> findDriverByAuthUserId -> driver.id ->
   * listOpenRunsForDriver`; dut o mat xich nao thi vong chay van mo coi, chi la mo coi o mot tang
   * khac. Ba mat xich, ba hanh dong sua khac nhau, nen ba ma.
   */
  /**
   * Ban phan cong cua xe tro toi mot ho so lai xe KHONG ton tai.
   *
   * Khoa ngoai cua Postgres chan duoc truong hop nay; kho trong bo nho thi khong. Noi that thay vi
   * gan viec cho mot `driverId` ma khong ai la chu.
   */
  'PLAN_VEHICLE_DRIVER_NOT_FOUND',
  /** Lai xe dang phu trach xe da NGUNG hoat dong — khong giao viec moi cho mot ho so da khoa. */
  'PLAN_VEHICLE_DRIVER_INACTIVE',
  /**
   * Lai xe dang phu trach xe CHUA noi voi tai khoan dang nhap nao (`authUserId` trong).
   *
   * `TransportDriver.authUserId` duoc phep NULL — mot ho so co the co truoc tai khoan. Nhung khi do
   * khong phien nao giai ra duoc nguoi nay, va man Hien truong tra `CHECKPOINT_DRIVER_BINDING_
   * MISSING`: vong chay co chu tren giay, khong co chu tren dien thoai. Cung ten mat xich voi ma do.
   */
  'PLAN_VEHICLE_DRIVER_BINDING_MISSING',
  /*
   * HAI MA DUOI DAY chi co o nhanh NOI DON (`MULTI_ORDER_RUN`), va tra loi cau hoi thu ba: vong
   * chay DANG CHAY thuoc ve ai. Doi xe noi ai cam CHIEC XE; phan cong vong chay noi ai cam VONG
   * CHAY. Vong chay da co nguoi thi nguoi do la su that cua no.
   */
  /**
   * Vong chay dang mo cua xe do MOT lai xe cam, con doi xe noi xe dang thuoc NGUOI KHAC.
   *
   * Noi don luc nay la im lang chon mot ben: chon nguoi cua vong chay thi giao don cho nguoi ma doi
   * xe vua noi KHONG cam xe; chon nguoi cua doi xe thi doi tai xe giua chuyen. Ca hai deu sai, nen
   * tu choi — truoc chang dau tien, de khong mot hang nao cua don nay nam trong vong chay do.
   */
  'PLAN_RUN_DRIVER_CONFLICT',
  /**
   * Vong chay dang mo CHUA co ai cam — sinh ra truoc ban va BUG-01, hoac mo tay qua `POST /runs`.
   * Khong co su that nao de lech, nen nguoi cam xe (da qua du phep kiem cua vong chay moi) duoc
   * ghi lam ban phan cong DAU TIEN, truoc khi noi chang. Cung quy tac voi vong chay moi.
   */
  'PLAN_RUN_DRIVER_ADOPTED',
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
    PLAN_VEHICLE_DRIVER_MISSING:
      'Xe nay chua co lai xe phu trach — gan lai xe cho xe roi giao don lai',
    PLAN_VEHICLE_DRIVER_AMBIGUOUS:
      'Xe nay dang co nhieu lai xe phu trach — dong bot ban phan cong cu roi giao don lai',
    PLAN_VEHICLE_DRIVER_NOT_FOUND:
      'Ban phan cong cua xe tro toi mot ho so lai xe khong con — gan lai lai xe cho xe',
    PLAN_VEHICLE_DRIVER_INACTIVE:
      'Lai xe phu trach xe nay da ngung hoat dong — gan lai xe khac cho xe roi giao don lai',
    PLAN_VEHICLE_DRIVER_BINDING_MISSING:
      'Lai xe phu trach xe nay chua co tai khoan dang nhap — noi tai khoan roi giao don lai',
    PLAN_RUN_DRIVER_CONFLICT:
      'Vong chay dang mo cua xe do lai xe khac cam, khong phai nguoi dang phu trach xe — doi chieu lai roi giao don lai',
    PLAN_RUN_DRIVER_ADOPTED:
      'Vong chay dang mo chua co lai xe: ghi nguoi dang phu trach xe lam lai xe cua vong chay',
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
