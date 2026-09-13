import { elapsedSecondsOf, type DeliveryWaitingSession } from './waiting.types.js';

/**
 * PHIEN CHO, NHIN TU MOT MAN HINH — `#279` O4/O9/O11.
 *
 * ============================================================================================
 * `elapsedSeconds` DUOC TINH O MAY CHU, VA DO LA CA DIEM
 * ============================================================================================
 *
 * Mot man hinh nhan `startedAt` roi tu tru voi `Date.now()` cua may no se hien mot con so phu
 * thuoc dong ho cua chiec dien thoai do. Mot may lech mot tieng se hien "da cho 4 tieng" trong khi
 * may chu biet la 3 — va con so nguoi ta doc chinh la con so nguoi ta nhap vao de nghi phu cap.
 *
 * Nen tang doc tra ve CA HAI: `elapsedSeconds` da tinh, va `serverNow` de man hinh dem tiep giay
 * ma khong can hoi lai. `#279` O5: *"elapsed display derives from server start time"*.
 *
 * KHONG mot truong tien nao o day. `#279` O9: *"driver payload still excludes freight/revenue"* —
 * va o mien nay con manh hon the: mot phien cho khong biet gi ve so tien phu cap cua no.
 */
export interface WaitingSessionView {
  readonly id: string;
  readonly runId: string;
  readonly legId: string;
  readonly status: DeliveryWaitingSession['status'];
  readonly reason: DeliveryWaitingSession['reason'];
  readonly closeReason: DeliveryWaitingSession['closeReason'];
  readonly startedAt: string;
  readonly endedAt: string | null;
  /** Da cho bao nhieu giay — do o MAY CHU. Phien con mo thi do den `serverNow`. */
  readonly elapsedSeconds: number;
  /** Gio may chu luc tra loi. Man hinh dem tiep tu day, khong tu dong ho cua chinh no. */
  readonly serverNow: string;
  readonly note: string | null;
  readonly closeNote: string | null;
  readonly businessDate: string;
}

export const toWaitingSessionView = (
  session: DeliveryWaitingSession,
  now: Date,
): WaitingSessionView => ({
  id: session.id,
  runId: session.runId,
  legId: session.legId,
  status: session.status,
  reason: session.reason,
  closeReason: session.closeReason,
  startedAt: session.startedAt.toISOString(),
  endedAt: session.endedAt === null ? null : session.endedAt.toISOString(),
  elapsedSeconds: elapsedSecondsOf(session, now),
  serverNow: now.toISOString(),
  note: session.note,
  closeNote: session.closeNote,
  businessDate: session.businessDate,
});
