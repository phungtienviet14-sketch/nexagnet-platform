/**
 * Trang thai cua cau noi + bo tu vung LY DO co ma.
 *
 * Hai thu KHAC NHAU, va gop lai la mat kha nang chan doan:
 *
 *   TRANG THAI  — ket cuc tho ma nguoi van hanh nhin thay tren popup (#204 §3.3). Dong.
 *   LY DO       — DUONG nao dan toi ket cuc do. Mot trang thai tu choi co NHIEU duong, va mot cong
 *                 co N duong tu choi phai phan biet duoc N ly do (cung nguyen tac voi
 *                 `validator/reasons.mjs` cua giao thuc va `decision-vocabulary.ts` cua api).
 *
 * Vi du: `REJECTED_STALE` den tu nam duong that khac han nhau — repo sai, PR khong ton tai, PR da
 * dong, HEAD da doi, doc GitHub that bai. Bao mot `REJECTED_STALE` tran thi nguoi doc log khong
 * biet minh phai sua cau hinh hay chi can doi mot HEAD moi.
 *
 * MAC DINH LA FAIL-CLOSED: khong co duong nao "coi nhu qua". Thieu du lieu = tu choi.
 */

/** Trang thai theo hop dong #204 §3.3. Day la toan bo tap ket cuc — khong co gia tri nao khac. */
export const BRIDGE_STATES = Object.freeze({
  /** Nguoi dung chua arm cuoc hoi thoai nao. Khong bao gio duoc dong toi DOM. */
  DISARMED: 'DISARMED',
  /** Da arm DUNG MOT URL hoi thoai. Dieu kien CAN (chua du) de duoc tiem. */
  ARMED_EXACT_CHAT: 'ARMED_EXACT_CHAT',
  /** Da dat tin nhan danh thuc vao khung soan va gui MOT lan. */
  DELIVERED: 'DELIVERED',
  /** Carrier noi ve mot HEAD/PR khong con dung voi GitHub song. */
  REJECTED_STALE: 'REJECTED_STALE',
  /** Nguoi phat carrier khong nam trong so do principal cuc bo. */
  REJECTED_PROVENANCE: 'REJECTED_PROVENANCE',
  /** Tab dich khong phai dung cuoc hoi thoai da arm. */
  REJECTED_WRONG_CHAT: 'REJECTED_WRONG_CHAT',
  /** Van ban khong phai mot thong diep Giao thuc V0 hop le. */
  REJECTED_MALFORMED: 'REJECTED_MALFORMED',
});

/**
 * Ly do co ma. Moi ma thuoc ve DUNG MOT trang thai (xem `STATE_OF_REASON`), nen mot log co
 * `reason` la du de suy ra `state` — nhung ta van ghi ca hai, vi popup doc `state` con nguoi
 * doc log loc theo `reason`.
 */
export const BRIDGE_REASONS = Object.freeze({
  // --- REJECTED_MALFORMED ---------------------------------------------------------------------
  /** `readMessage` cua giao thuc tu choi. `detail.protocolReason` giu ma goc cua giao thuc. */
  PROTOCOL_REJECTED: 'PROTOCOL_REJECTED',
  /** Van ban hop le nhung khong phai REVIEW_REQUEST — cau noi chi thuc day dung loai nay. */
  WRONG_MESSAGE_TYPE: 'WRONG_MESSAGE_TYPE',
  // --- REJECTED_PROVENANCE --------------------------------------------------------------------
  /** Khong dan xuat duoc principal da xac thuc tu metadata cua comment. */
  PRINCIPAL_UNKNOWN: 'PRINCIPAL_UNKNOWN',
  /** So do principal cuc bo trong/hong — thieu so do KHONG PHAI "ai cung duoc". */
  REGISTRY_UNUSABLE: 'REGISTRY_UNUSABLE',
  /** Principal co that nhung khong duoc phat REVIEW_REQUEST. `detail.protocolReason` giu ma goc. */
  PRODUCER_NOT_AUTHORIZED: 'PRODUCER_NOT_AUTHORIZED',
  // --- REJECTED_STALE -------------------------------------------------------------------------
  /** Carrier den tu mot kho khac kho da cau hinh. */
  REPOSITORY_MISMATCH: 'REPOSITORY_MISMATCH',
  /** GitHub song khong co PR do. */
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  /** PR da dong/da merge — khong con la doi tuong review dang mo. */
  PR_NOT_OPEN: 'PR_NOT_OPEN',
  /** HEAD_SHA trong carrier khac HEAD song. Cong chong "danh thuc cho mot commit cu". */
  HEAD_MISMATCH: 'HEAD_MISMATCH',
  /** Doc GitHub that bai — khong co bang chung tuc la khong giao. */
  LIVE_STATE_UNAVAILABLE: 'LIVE_STATE_UNAVAILABLE',
  // --- DELIVERED (khong phai loi) --------------------------------------------------------------
  /** Khoa idempotency da co trong so. Poll trung lap la mot viec KHONG-LAM-GI. */
  ALREADY_DELIVERED: 'ALREADY_DELIVERED',
  /** Duong thanh cong. */
  WAKE_SENT: 'WAKE_SENT',
  // --- DISARMED / REJECTED_WRONG_CHAT ----------------------------------------------------------
  /** Chua arm cuoc hoi thoai nao. */
  NOT_ARMED: 'NOT_ARMED',
  /** URL da arm khong khop URL cua tab dinh tiem. */
  ARMED_URL_MISMATCH: 'ARMED_URL_MISMATCH',
  /** Khong co tab nao dang mo dung URL da arm. */
  TARGET_TAB_NOT_FOUND: 'TARGET_TAB_NOT_FOUND',
  /** Nhieu hon mot tab khop — khong doan, tu choi. */
  TARGET_TAB_AMBIGUOUS: 'TARGET_TAB_AMBIGUOUS',
  /** Khong tim thay khung soan bang bat ky selector nao trong danh sach cho phep. */
  COMPOSER_NOT_FOUND: 'COMPOSER_NOT_FOUND',
  /** Mot selector khop nhieu hon mot phan tu — khong doan, tu choi. */
  COMPOSER_AMBIGUOUS: 'COMPOSER_AMBIGUOUS',
  /** Tim duoc khung soan nhung khong tim duoc nut gui thuoc chinh form do. */
  SUBMIT_CONTROL_NOT_FOUND: 'SUBMIT_CONTROL_NOT_FOUND',
  /** Dat duoc chu nhung khong gui duoc. */
  SUBMIT_FAILED: 'SUBMIT_FAILED',
  /** Phan tu tim duoc khong nhan chu duoc (khong contenteditable, khong co `value`). */
  COMPOSER_NOT_EDITABLE: 'COMPOSER_NOT_EDITABLE',
  /** Goi lenh dat chu that bai — khong doan, khong thu lai bang duong khac. */
  COMPOSER_WRITE_FAILED: 'COMPOSER_WRITE_FAILED',
});

/**
 * Moi ma ly do thuoc ve dung mot trang thai. Bang nay la thu duy nhat quyet dinh trang thai —
 * khong noi nao trong ma nguon duoc tu dat `state` bang tay.
 * @type {Readonly<Record<string, string>>}
 */
export const STATE_OF_REASON = Object.freeze({
  [BRIDGE_REASONS.PROTOCOL_REJECTED]: BRIDGE_STATES.REJECTED_MALFORMED,
  [BRIDGE_REASONS.WRONG_MESSAGE_TYPE]: BRIDGE_STATES.REJECTED_MALFORMED,
  [BRIDGE_REASONS.PRINCIPAL_UNKNOWN]: BRIDGE_STATES.REJECTED_PROVENANCE,
  [BRIDGE_REASONS.REGISTRY_UNUSABLE]: BRIDGE_STATES.REJECTED_PROVENANCE,
  [BRIDGE_REASONS.PRODUCER_NOT_AUTHORIZED]: BRIDGE_STATES.REJECTED_PROVENANCE,
  [BRIDGE_REASONS.REPOSITORY_MISMATCH]: BRIDGE_STATES.REJECTED_STALE,
  [BRIDGE_REASONS.PR_NOT_FOUND]: BRIDGE_STATES.REJECTED_STALE,
  [BRIDGE_REASONS.PR_NOT_OPEN]: BRIDGE_STATES.REJECTED_STALE,
  [BRIDGE_REASONS.HEAD_MISMATCH]: BRIDGE_STATES.REJECTED_STALE,
  [BRIDGE_REASONS.LIVE_STATE_UNAVAILABLE]: BRIDGE_STATES.REJECTED_STALE,
  [BRIDGE_REASONS.ALREADY_DELIVERED]: BRIDGE_STATES.DELIVERED,
  [BRIDGE_REASONS.WAKE_SENT]: BRIDGE_STATES.DELIVERED,
  [BRIDGE_REASONS.NOT_ARMED]: BRIDGE_STATES.DISARMED,
  [BRIDGE_REASONS.ARMED_URL_MISMATCH]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.TARGET_TAB_NOT_FOUND]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.TARGET_TAB_AMBIGUOUS]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.COMPOSER_NOT_FOUND]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.COMPOSER_AMBIGUOUS]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.SUBMIT_CONTROL_NOT_FOUND]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.SUBMIT_FAILED]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.COMPOSER_NOT_EDITABLE]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
  [BRIDGE_REASONS.COMPOSER_WRITE_FAILED]: BRIDGE_STATES.REJECTED_WRONG_CHAT,
});

/**
 * @typedef {{ ok: false, state: string, reason: string, detail?: Record<string, unknown> }} Rejection
 */

/**
 * Dung mot ket cuc tu choi. Ma ly do khong co trong bang la LOI LAP TRINH — nem ngay, vi mot
 * ket cuc khong xep duoc vao trang thai nao thi popup se hien mot o trong va khong ai biet vi sao.
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 * @returns {Rejection}
 */
export function rejected(reason, detail) {
  const state = STATE_OF_REASON[reason];
  if (state === undefined) throw new Error(`Ly do khong thuoc trang thai nao: ${reason}`);
  return detail ? { ok: false, state, reason, detail } : { ok: false, state, reason };
}
