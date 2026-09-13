import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import type { WaitingCloseDecisionReason, WaitingStartReason } from './waiting-decisions.js';

/**
 * QUY TAC cua phien cho — ham THUAN, khong cham mang, khong cham dong ho, khong cham dia.
 *
 * ============================================================================================
 * PHIEN CHO KHONG PHAI MOT MAY TRANG THAI THU BA
 * ============================================================================================
 *
 * `movement-lifecycle.ts` quyet dinh vong doi cua mot vong chay. `checkpoint-lifecycle.ts` quyet
 * dinh mot moc co duoc ghi khong. Tep nay khong dung vao ca hai. No tra loi dung hai cau:
 *
 *   · *"co duoc mo mot khoang cho o day, luc nay khong"*;
 *   · *"co duoc dong khoang cho nay bang moc kia khong"*.
 *
 * Trang thai vong chay chi vao day duoi dang MOT co doc (`runTerminal`), va chuoi moc duoi dang
 * mot danh sach loai da ghi. Khong ham nao o day GHI mot cai gi.
 *
 * ============================================================================================
 * NEO LA `DELIVERY_ARRIVAL`, VA DO LA CA CO CHE AN TOAN
 * ============================================================================================
 *
 * `checkpoint-lifecycle.ts` da bat `DELIVERY_ARRIVAL` phai co ban dinh vi
 * (`DEFAULT_LOCATION_REQUIRED_TYPES`). Phien cho MOC VAO chinh moc do thay vi tu doi mot ban dinh
 * vi rieng. Hai he qua, ca hai deu quan trong:
 *
 *   · lai xe bam `Bat dau cho` chi mat MOT cham — `#279` O9 doi mot/hai cham cho viec thuong lam;
 *   · va khong co duong nao mo mot phien cho cho mot noi chua ai chung minh la da den, vi neo
 *     khong ton tai neu lan den noi khong ton tai.
 *
 * Doi lai mot ban dinh vi THU HAI o day se vua cham hon, vua cho ra mot chung cu vi tri thu hai co
 * the lech voi cai thu nhat — hai cau tra loi cho cung mot cau hoi.
 */

/** Moc MO duong cho mot phien cho. */
export const WAITING_ANCHOR_CHECKPOINT: RunCheckpointType = 'DELIVERY_ARRIVAL';

/** Moc DONG mot phien cho tren duong binh thuong. */
export const WAITING_CLOSING_CHECKPOINT: RunCheckpointType = 'DELIVERY_ACCEPTED';

export interface WaitingStartDecision {
  readonly allowed: boolean;
  readonly reason: WaitingStartReason;
}

const allowStart = (reason: WaitingStartReason): WaitingStartDecision => ({
  allowed: true,
  reason,
});
const denyStart = (reason: WaitingStartReason): WaitingStartDecision => ({
  allowed: false,
  reason,
});

export interface WaitingStartEvaluation {
  /** Vong chay da o `COMPLETED`/`CANCELLED` chua. */
  readonly runTerminal: boolean;
  /** Loai moc DA GHI tren dung chang dang xet. */
  readonly legCheckpointTypes: readonly RunCheckpointType[];
  /** Chang nay da co mot phien cho dang mo chua. */
  readonly hasOpenSession: boolean;
}

/**
 * Mot phien cho co duoc mo khong — tra ve LY DO, khong phai `boolean`.
 *
 * THU TU KIEM la mot phan cua hop dong, cung quy uoc voi `evaluateCheckpoint`: trang thai vong chay
 * truoc, roi den su ton tai cua lan den noi, roi den viec da nhan hang chua, cuoi cung moi den
 * trung lap. Mot yeu cau vua sai vong chay vua trung phien phai bao loi vong chay, vi do la cai
 * nguoi goi phai sua truoc.
 *
 * `WAITING_DELIVERY_ALREADY_ACCEPTED` dung TRUOC `WAITING_ALREADY_OPEN` co chu dich: neu khach da
 * nhan hang thi cau tra loi dung la *"khong con gi de cho"*, khong phai *"dang co mot phien mo"* —
 * cau thu hai se day nguoi dung di dong mot phien thay vi cho ho biet viec da xong.
 */
export function evaluateWaitingStart(input: WaitingStartEvaluation): WaitingStartDecision {
  if (input.runTerminal) return denyStart('WAITING_RUN_TERMINAL');

  if (!input.legCheckpointTypes.includes(WAITING_ANCHOR_CHECKPOINT)) {
    return denyStart('WAITING_ARRIVAL_NOT_FOUND');
  }

  if (input.legCheckpointTypes.includes(WAITING_CLOSING_CHECKPOINT)) {
    return denyStart('WAITING_DELIVERY_ALREADY_ACCEPTED');
  }

  if (input.hasOpenSession) return denyStart('WAITING_ALREADY_OPEN');

  return allowStart('WAITING_STARTED');
}

export interface WaitingCloseDecision {
  readonly allowed: boolean;
  readonly reason: WaitingCloseDecisionReason;
}

export interface WaitingCloseEvaluation {
  readonly status: 'OPEN' | 'CLOSED';
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly by: 'ACCEPTANCE' | 'OPERATOR';
}

/**
 * Mot phien cho co duoc dong khong.
 *
 * `WAITING_ALREADY_CLOSED` la mot TU CHOI chu khong phai mot lan gui lai duoc chap nhan, va do la
 * mot khac biet co y voi `CHECKPOINT_REPLAYED`. Mot moc gui lai la CUNG mot su kien; con mot lenh
 * dong thu hai mang mot gio dong KHAC, va chap nhan no se ghi de len gio dong that. Tang goi bien
 * ma nay thanh mot ket qua yen lang khi va khi thoi no den tu duong moc (lan ghi lai cua cung mot
 * `clientEventId` da bi `CheckpointService` chan tu truoc do).
 */
export function evaluateWaitingClose(input: WaitingCloseEvaluation): WaitingCloseDecision {
  if (input.status === 'CLOSED') return { allowed: false, reason: 'WAITING_ALREADY_CLOSED' };

  if (input.endedAt.getTime() < input.startedAt.getTime()) {
    return { allowed: false, reason: 'WAITING_END_BEFORE_START' };
  }

  return {
    allowed: true,
    reason:
      input.by === 'ACCEPTANCE' ? 'WAITING_CLOSED_BY_ACCEPTANCE' : 'WAITING_CLOSED_BY_OPERATOR',
  };
}
