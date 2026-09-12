import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * waiting_allowance.propose
 * ------------------------------------------------------------------ */
export const WAITING_ALLOWANCE_PROPOSE_REASONS = [
  'WAITING_ALLOWANCE_PROPOSED',
  'WAITING_ALLOWANCE_SESSION_NOT_FOUND',
  /**
   * Phien cho con MO — chua biet cho bao lau thi chua de nghi duoc.
   *
   * Khong phai mot su can tro hanh chinh: `#279` O6 dat khoan tien nay tren THOI LUONG THUC TE
   * (*"actual WaitingSession duration"*), va mot phien chua dong thi chua co thoi luong thuc te —
   * chi co mot con so dang chay. De nghi tren mot con so dang chay se duoc duyet tren mot con so
   * KHAC voi con so luc bam.
   */
  'WAITING_ALLOWANCE_SESSION_STILL_OPEN',
  /** Phien do da co mot de nghi CHUA quyet. Sua de nghi cu, dung xep hang hai cai. */
  'WAITING_ALLOWANCE_ALREADY_PENDING',
  /** Phien do da co mot khoan DA DUYET. Mot phien cho khong duoc tra tien hai lan. */
  'WAITING_ALLOWANCE_ALREADY_APPROVED',
  /** So tien phai la so nguyen DUONG. Mot de nghi 0d khong phai mot de nghi. */
  'WAITING_ALLOWANCE_AMOUNT_INVALID',
  'WAITING_ALLOWANCE_REASON_REQUIRED',
  /**
   * Nguoi de nghi CHINH LA lai xe huong khoan nay.
   *
   * `#279` O6: *"driver cannot approve their own allowance"*. Cong o tang vai da chan roi (vai
   * `SALE` khong co mot ma van hanh nao), nhung mot nguoi CO CA hai ho so — mot tai khoan `ADMIN`
   * duoc noi voi mot `TransportDriver` — thi tang vai khong noi duoc gi. Nen phep kiem that nam o
   * day, tren DANH TINH, va no chan CA duong de nghi lan duong duyet.
   */
  'WAITING_ALLOWANCE_SELF_DEALING',
] as const;
export type WaitingAllowanceProposeReason = (typeof WAITING_ALLOWANCE_PROPOSE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * waiting_allowance.decide
 * ------------------------------------------------------------------ */
export const WAITING_ALLOWANCE_DECIDE_REASONS = [
  'WAITING_ALLOWANCE_APPROVED',
  'WAITING_ALLOWANCE_REJECTED',
  /**
   * Gui lai DUNG lenh quyet dinh cu — tra ve chinh ket qua do, khong quyet lan hai.
   *
   * `#279` O13 bai 11: *"duplicate allowance approval does not pay twice"*. Day la mot ket qua CHO
   * PHEP, khong phai mot loi: mot lan bam `Duyet` mat song tren duong ve phai bam lai duoc.
   */
  'WAITING_ALLOWANCE_DECISION_REPLAYED',
  'WAITING_ALLOWANCE_NOT_FOUND',
  /** Da quyet roi, va bang mot khoa khac. Doi y la mot de nghi MOI, khong phai mot lan ghi de. */
  'WAITING_ALLOWANCE_ALREADY_DECIDED',
  'WAITING_ALLOWANCE_AMOUNT_INVALID',
  /** Duyet mot so LON HON so van phong de nghi. Nguoi duyet cat bot duoc, khong cong them duoc. */
  'WAITING_ALLOWANCE_ABOVE_CANDIDATE',
  'WAITING_ALLOWANCE_SELF_DEALING',
] as const;
export type WaitingAllowanceDecideReason = (typeof WAITING_ALLOWANCE_DECIDE_REASONS)[number];

export type TransportWaitingAllowanceDecisionReason =
  WaitingAllowanceProposeReason | WaitingAllowanceDecideReason;

export const TRANSPORT_WAITING_ALLOWANCE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-checkpoint',
  points: ['waiting_allowance.propose', 'waiting_allowance.decide'],
  labels: {
    WAITING_ALLOWANCE_PROPOSED: 'Da ghi mot de nghi phu cap cho',
    WAITING_ALLOWANCE_SESSION_NOT_FOUND: 'Khong tim thay phien cho',
    WAITING_ALLOWANCE_SESSION_STILL_OPEN: 'Phien cho chua dong — chua co thoi luong thuc te',
    WAITING_ALLOWANCE_ALREADY_PENDING: 'Phien nay da co mot de nghi dang cho duyet',
    WAITING_ALLOWANCE_ALREADY_APPROVED: 'Phien nay da co mot khoan phu cap duoc duyet',
    WAITING_ALLOWANCE_AMOUNT_INVALID: 'So tien phai la so nguyen duong',
    WAITING_ALLOWANCE_REASON_REQUIRED: 'Phai ghi ly do de nghi',
    WAITING_ALLOWANCE_SELF_DEALING: 'Khong tu de nghi hay tu duyet khoan phu cap cua chinh minh',
    WAITING_ALLOWANCE_APPROVED: 'Da duyet khoan phu cap cho',
    WAITING_ALLOWANCE_REJECTED: 'Da tu choi khoan phu cap cho',
    WAITING_ALLOWANCE_DECISION_REPLAYED:
      'Lenh gui lai — tra ve quyet dinh da ghi, khong quyet lan hai',
    WAITING_ALLOWANCE_NOT_FOUND: 'Khong tim thay de nghi phu cap',
    WAITING_ALLOWANCE_ALREADY_DECIDED: 'De nghi nay da duoc quyet tu truoc',
    WAITING_ALLOWANCE_ABOVE_CANDIDATE: 'So duyet khong duoc lon hon so de nghi',
  } satisfies Record<TransportWaitingAllowanceDecisionReason, string>,
});
