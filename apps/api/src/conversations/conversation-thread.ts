import type { ClarifySlot, ConversationThread, OrderDraft } from '@netviet/shared';
import { emptyDraft } from './order-draft.js';

/**
 * May trang thai cua MOT mach hoi thoai. Thuan (pure): `(state, event) -> state`.
 *
 * Viet tay thay vi dung mot thu vien FSM (xstate...) la quyet dinh co y (21/08/2026): may nay chi
 * co 4 trang thai va 4 su kien, con snapshot cua thu vien FSM luu xuong Postgres se KHONG tuong
 * thich nguoc moi lan sua may — doi lai khong duoc gi ma them mot loai su co.
 */

export interface ThreadPolicy {
  /** So cau hoi toi da trong MOT mach. Het luot -> chuyen Sale, khong hoi tiep. */
  readonly maxQuestions: number;
  /** Mach im lang qua nguong nay thi tin sau la mach MOI, khong ke thua don nhap cu. */
  readonly ttlMinutes: number;
}

export const DEFAULT_THREAD_POLICY: Readonly<ThreadPolicy> = {
  // Hai cau la tran that te: mot cau cho SP, mot cau cho so luong. Cau thu ba trong mot nhom dai
  // ly bat dau giong may hoi dap, va Sale se phai xin loi thay bot.
  maxQuestions: 2,
  // Dai hon mot luot chot don thong thuong, ngan hon mot buoi lam viec: mot don nhap song qua dem
  // roi tu dung "chot" vao sang hom sau la mot don khach khong he dat.
  ttlMinutes: 45,
};

export interface ThreadKey {
  readonly chatId: string;
  readonly senderExternalId: string;
}

export type ThreadEvent =
  /**
   * Khach vua nhan tin. `draft` la don nhap DA GOP xong do `mergeConversationTurn` tinh — reducer
   * chi luu, KHONG gop lai lan nua. Gop hai lan la cach chac chan de mot mon hang xuat hien hai
   * dong khi parser goi cung san pham bang hai cach viet khac nhau.
   */
  | { readonly type: 'customer_message'; readonly draft: OrderDraft; readonly displayName?: string }
  /** Bot vua hoi lai khach. */
  | { readonly type: 'asked'; readonly slots: readonly ClarifySlot[]; readonly question: string }
  /** Don da chot va da gui xac nhan. */
  | { readonly type: 'closed'; readonly orderId?: string }
  /** Chuyen Sale — het luot hoi, hoac gap thu chi noi bo quyet duoc. */
  | { readonly type: 'handed_off'; readonly orderId?: string };

/**
 * Mach da het han thi coi nhu khong ton tai. Goi TRUOC khi doc `draft`, khong phai sau: mot don
 * nhap qua han van con nguyen trong DB, va dung lai no la dung mot thu khach da quen tu lau.
 */
export function isExpired(thread: ConversationThread, now: Date): boolean {
  return new Date(thread.expiresAt).getTime() <= now.getTime();
}

/**
 * Mach con SONG: con ke thua duoc don nhap sang tin ke tiep. `closed`/`handed_off` khong song —
 * tin sau do la mot luot mua moi, khong phai phan tiep cua don cu.
 */
export function isLive(
  thread: ConversationThread | null,
  now: Date,
): thread is ConversationThread {
  if (!thread || isExpired(thread, now)) return false;
  return thread.status === 'collecting' || thread.status === 'awaiting_answer';
}

/** Mach dang cho khach tra loi (va chua het han) — tin ke tiep duoc coi la CAU TRA LOI. */
export function isAwaiting(thread: ConversationThread | null, now: Date): boolean {
  return thread?.status === 'awaiting_answer' && !isExpired(thread, now);
}

export function reduceThread(
  current: ConversationThread | null,
  event: ThreadEvent,
  key: ThreadKey,
  now: Date,
  policy: ThreadPolicy = DEFAULT_THREAD_POLICY,
): ConversationThread {
  // Mach dong/het han khong duoc hoi sinh: mot tin moi bat dau tu trang giay trang.
  const live = isLive(current, now) ? current : null;
  const base = live ?? newThread(key, now, policy);
  const stamped = { ...base, updatedAt: now.toISOString(), expiresAt: expiryFrom(now, policy) };

  switch (event.type) {
    case 'customer_message':
      return {
        ...stamped,
        status: 'collecting',
        ...(event.displayName ? { senderDisplayName: event.displayName } : {}),
        draft: event.draft,
      };
    case 'asked':
      return {
        ...stamped,
        status: 'awaiting_answer',
        awaitingSlots: [...event.slots],
        askCount: stamped.askCount + 1,
        lastQuestion: event.question,
      };
    case 'closed':
      return {
        ...stamped,
        status: 'closed',
        awaitingSlots: [],
        ...(event.orderId ? { lastOrderId: event.orderId } : {}),
      };
    case 'handed_off':
      return {
        ...stamped,
        status: 'handed_off',
        awaitingSlots: [],
        ...(event.orderId ? { lastOrderId: event.orderId } : {}),
      };
  }
}

/** Con luot hoi khong. Het luot la mot ly do chuyen Sale, khong phai mot ly do im lang. */
export function canAskAgain(
  thread: ConversationThread | null,
  policy: ThreadPolicy = DEFAULT_THREAD_POLICY,
): boolean {
  return (thread?.askCount ?? 0) < policy.maxQuestions;
}

function newThread(key: ThreadKey, now: Date, policy: ThreadPolicy): ConversationThread {
  return {
    chatId: key.chatId,
    senderExternalId: key.senderExternalId,
    status: 'collecting',
    draft: emptyDraft(),
    awaitingSlots: [],
    askCount: 0,
    updatedAt: now.toISOString(),
    expiresAt: expiryFrom(now, policy),
  };
}

function expiryFrom(now: Date, policy: ThreadPolicy): string {
  return new Date(now.getTime() + policy.ttlMinutes * 60_000).toISOString();
}
