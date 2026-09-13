import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * waiting.start -- WaitingSessionService.start()
 * ------------------------------------------------------------------ */
export const WAITING_START_REASONS = [
  'WAITING_STARTED',
  /**
   * Gui lai DUNG lenh cu — tra ve chinh phien da mo, khong mo phien thu hai.
   *
   * `#279` O13 bai 2: *"same wait start replay => one active wait"*. Day la mot ket qua CHO PHEP:
   * mot lai xe o vung lom bam `Bat dau cho` roi mat song phai bam lai duoc.
   */
  'WAITING_REPLAYED',
  'WAITING_DRIVER_BINDING_MISSING',
  'WAITING_RUN_NOT_FOUND',
  'WAITING_DRIVER_NOT_ASSIGNED',
  'WAITING_RUN_TERMINAL',
  'WAITING_LEG_NOT_FOUND',
  'WAITING_LEG_NOT_IN_RUN',
  /** Chua co moc `DELIVERY_ARRIVAL` nao — khong cho o mot noi minh chua den. */
  'WAITING_ARRIVAL_NOT_FOUND',
  /** Moc neo khong phai `DELIVERY_ARRIVAL`, hoac thuoc mot chang khac. */
  'WAITING_ARRIVAL_NOT_APPLICABLE',
  /** Moc neo do lai xe khac ghi — muon lan den noi cua nguoi khac lam neo. */
  'WAITING_ARRIVAL_NOT_OWNED',
  /**
   * Nguoi nhan DA nhan hang roi. Mo mot phien cho sau `DELIVERY_ACCEPTED` la ghi mot khoang cho
   * khong bao gio xay ra — va no se di thang vao con so ma nguoi duyet phu cap doc.
   */
  'WAITING_DELIVERY_ALREADY_ACCEPTED',
  /**
   * Chang nay DA co mot phien dang mo. `#279` O13 bai 5: *"concurrent wait start does not create
   * two active sessions"*.
   */
  'WAITING_ALREADY_OPEN',
] as const;
export type WaitingStartReason = (typeof WAITING_START_REASONS)[number];

/* ------------------------------------------------------------------ *
 * waiting.close -- dong mot phien cho
 * ------------------------------------------------------------------ */
export const WAITING_CLOSE_DECISION_REASONS = [
  /** Nguoi nhan da nhan hang — duong binh thuong, do chinh moc `DELIVERY_ACCEPTED` dong. */
  'WAITING_CLOSED_BY_ACCEPTANCE',
  /** Van phong don mot phien bo quen. Xem `WAITING_CLOSE_REASONS`. */
  'WAITING_CLOSED_BY_OPERATOR',
  'WAITING_SESSION_NOT_FOUND',
  /** Phien da dong. Dong lai mot lan nua khong doi gi — va khong duoc ghi de gio dong cu. */
  'WAITING_ALREADY_CLOSED',
  /**
   * Gio dong nam TRUOC gio mo. `#279` O13 bai 4.
   *
   * Voi duong binh thuong dieu nay khong xay ra duoc — ca hai gio deu tu mot dong ho may chu, va
   * moc dong luon duoc ghi sau. Ma nay ton tai cho duong con lai: mot dong ho may chu bi keo lui
   * giua hai lan ghi. Tu choi thay vi luu mot khoang am, vi mot khoang am se di thang vao con so
   * phu cap.
   */
  'WAITING_END_BEFORE_START',
] as const;
export type WaitingCloseDecisionReason = (typeof WAITING_CLOSE_DECISION_REASONS)[number];

export type TransportWaitingDecisionReason = WaitingStartReason | WaitingCloseDecisionReason;

export const TRANSPORT_WAITING_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-checkpoint',
  points: ['waiting.start', 'waiting.close'],
  labels: {
    WAITING_STARTED: 'Da mo phien cho nguoi nhan',
    WAITING_REPLAYED: 'Lenh gui lai — tra ve phien da mo, khong mo phien thu hai',
    WAITING_DRIVER_BINDING_MISSING: 'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
    WAITING_RUN_NOT_FOUND: 'Khong tim thay vong chay',
    WAITING_DRIVER_NOT_ASSIGNED: 'Lai xe chua tung duoc phan cong vao vong chay nay',
    WAITING_RUN_TERMINAL: 'Vong chay da o trang thai cuoi, khong mo phien cho duoc',
    WAITING_LEG_NOT_FOUND: 'Khong tim thay chang',
    WAITING_LEG_NOT_IN_RUN: 'Chang do khong thuoc vong chay nay',
    WAITING_ARRIVAL_NOT_FOUND: 'Chua ghi moc den noi giao cho chang nay',
    WAITING_ARRIVAL_NOT_APPLICABLE: 'Moc do khong phai lan den noi giao cua chang nay',
    WAITING_ARRIVAL_NOT_OWNED: 'Lan den noi do khong phai cua ban',
    WAITING_DELIVERY_ALREADY_ACCEPTED: 'Nguoi nhan da nhan hang — khong con gi de cho',
    WAITING_ALREADY_OPEN: 'Chang nay dang co mot phien cho mo',
    WAITING_CLOSED_BY_ACCEPTANCE: 'Nguoi nhan da nhan hang — phien cho dong lai',
    WAITING_CLOSED_BY_OPERATOR: 'Van hanh dong mot phien cho bo quen',
    WAITING_SESSION_NOT_FOUND: 'Khong tim thay phien cho',
    WAITING_ALREADY_CLOSED: 'Phien cho nay da dong tu truoc',
    WAITING_END_BEFORE_START: 'Gio dong nam truoc gio mo — khong ghi mot khoang am',
  } satisfies Record<TransportWaitingDecisionReason, string>,
});
