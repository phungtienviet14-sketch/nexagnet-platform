import type { OrderView } from '@netviet/shared';
import {
  toConversations,
  toCustomerOrders,
  UNASSIGNED_CONVERSATION_KEY,
  type CustomerConversation,
  type CustomerOrderStage,
} from '../customer-view';
import { toCustomerOrderDetail, type CustomerOrderDetail } from './order-detail';

/**
 * HOI THOAI: DANH SACH + CHI TIET (Issue #110 §Hội thoại).
 *
 * U-UI0 chi co danh sach tom tat, va mot danh sach tom tat khong lam duoc viec: Sale mo muc nay
 * ra la de xem MOT nhom dang can gi, chu khong phai de dem xem co bao nhieu nhom.
 *
 * Ba dieu tep nay giu chac:
 *
 *   1. CHON LA TAT DINH. Cung mot du lieu + cung mot yeu cau -> cung mot cuoc duoc mo. Khong co
 *      "cuoc nao vua toi thi nhay sang cuoc do" — mot man hinh tu doi thu dang mo giua luc nguoi
 *      dung dang doc la mot man hinh khong dung duoc.
 *   2. KHOA LA TEN NHOM, khong bao gio la `chatId`. Xem `toConversations` trong `customer-view.ts`.
 *   3. Chi tiet la `CustomerOrderDetail[]` — di qua dung mot phep chieu voi phan con lai cua be
 *      mat khach, khong co duong tat nao doc thang `OrderView`.
 */

export const CONVERSATION_ACTION_LABEL: Readonly<Record<CustomerOrderStage, string>> = {
  cho_duyet: 'Chờ người duyệt & gửi',
  cho_nhap_don: 'Chờ nhập vào phần mềm bán hàng',
  da_gui: 'Không còn việc phải làm',
  da_huy: 'Đã huỷ',
  dang_xu_ly: 'Hệ thống đang xử lý',
};

export interface ConversationMessage {
  readonly order: CustomerOrderDetail;
  /** Viec CON LAI cua con nguoi tren tin nay — cau tra loi cua cot "hiện đang chờ ai". */
  readonly humanAction: string;
}

export interface ConversationDetail {
  readonly conversation: CustomerConversation;
  /** Tin moi nhat len truoc — nguoc voi hang cho duyet, vi day la mot dong tin, khong phai hang doi. */
  readonly messages: readonly ConversationMessage[];
  /** Tong so tin dang cho mot nguoi lam gi do, de dau cuoc hoi thoai noi duoc ngay. */
  readonly needsPerson: number;
  /** Moi canh bao con hieu luc trong cuoc nay, da gop va bo trung. */
  readonly attentionNotes: readonly string[];
}

function isUnassigned(key: string): boolean {
  return key === UNASSIGNED_CONVERSATION_KEY;
}

/** Ten hien tren man hinh cho mot cuoc — nhom chua map co ten rieng, khong de trong. */
export function conversationTitle(conversation: CustomerConversation): string {
  return conversation.groupName ?? 'Chưa gán nhóm';
}

function ordersOfConversation(
  orders: readonly OrderView[],
  key: string,
): readonly OrderView[] {
  return orders.filter((order) => {
    const name = order.groupName ?? null;
    return isUnassigned(key) ? name === null : name === key;
  });
}

/**
 * CUOC DUOC MO, quyet dinh mot cach tat dinh.
 *
 * Thu tu xet: khoa duoc yeu cau neu no CON TON TAI -> nguoc lai la cuoc dau danh sach -> `null`
 * khi khong co cuoc nao. Mot duong dan luu tro toi nhom da khong con tin thi roi ve cuoc dau,
 * chu khong render mot o trong va cung khong im lang giu lai mot khoa chet.
 */
export function resolveConversationKey(
  conversations: readonly CustomerConversation[],
  requested: string | null,
): string | null {
  if (conversations.length === 0) return null;
  if (requested && conversations.some((conversation) => conversation.key === requested)) {
    return requested;
  }
  return conversations[0]!.key;
}

export function toConversationList(
  orders: readonly OrderView[],
): readonly CustomerConversation[] {
  return toConversations(toCustomerOrders(orders));
}

export function toConversationDetail(
  orders: readonly OrderView[],
  key: string | null,
): ConversationDetail | null {
  if (!key) return null;
  const conversation = toConversationList(orders).find((entry) => entry.key === key);
  if (!conversation) return null;

  const messages = ordersOfConversation(orders, key)
    .map(toCustomerOrderDetail)
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
    .map((order) => ({ order, humanAction: CONVERSATION_ACTION_LABEL[order.stage] }));

  // `Set` de bo trung: mot canh bao lap lai qua nam tin lien tiep van la MOT viec phai xu ly, va
  // in no nam lan o dau cuoc hoi thoai chi lam nguoi doc bo qua ca nam.
  const attentionNotes = [
    ...new Set(
      messages
        .filter((message) => message.order.stage !== 'da_huy')
        .flatMap((message) => message.order.attentionNotes),
    ),
  ];

  return {
    conversation,
    messages,
    needsPerson: messages.filter((message) => message.order.needsPerson).length,
    attentionNotes,
  };
}
