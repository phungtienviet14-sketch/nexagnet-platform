import type { Intent, OrderView } from '@netviet/shared';

/**
 * PHEP CHIEU HUONG KHACH cua mot tin/don — Issue #107 §4.
 *
 * `OrderView` mang CA hai the gioi: nhung gi khach can (nhom nao, dai ly nao, bao nhieu tien, dang
 * cho ai) va nhung gi chi ky su can (`traceId`, `trace` sau vai agent, `ruleConfigVersion`,
 * `senderExternalId`, do tin cay tung truong). Ca hai deu dung o cho cua no; ghep chung tren mot
 * man hinh thi khong cho nao dung.
 *
 * Ranh gioi o day duoc giu bang KIEU chu khong bang ky luat: `CustomerOrder` KHONG CO cho de dat
 * mot truong ky thuat vao. Ai them `traceId` vao be mat khach se phai sua kieu nay truoc, va luc
 * do `customer-view.spec.ts` do. Cung the ma `DriverTripView` giu bat bien doanh thu cua mien van
 * tai (xem `EXPERIENCE_IDS` trong packages/tenant/src/tenant.schema.ts).
 */

/** Trang thai mot tin, KE ca viec con lai cho nguoi — khong lo ra trang thai noi bo nao. */
export type CustomerOrderStage =
  | 'cho_duyet'
  | 'da_gui'
  | 'cho_nhap_don'
  | 'da_huy'
  | 'dang_xu_ly';

export interface CustomerOrder {
  /** Ma tin de nguoi doi chieu voi nhau — khong phai dinh danh luot xu ly. */
  readonly reference: string;
  readonly receivedAt: string;
  readonly groupName: string | null;
  readonly dealerName: string | null;
  readonly intent: Intent;
  readonly stage: CustomerOrderStage;
  /** Trich tin khach da nhan — chinh chu khach viet, khong phai prompt hay dap an cua mo hinh. */
  readonly excerpt: string;
  readonly totalQuantity: number | null;
  readonly grandTotal: number | null;
  /** Cau canh bao cua rules engine, da la tieng nghiep vu san. */
  readonly attentionNotes: readonly string[];
  readonly needsPerson: boolean;
}

const EXCERPT_LIMIT = 160;

function stageOf(order: Pick<OrderView, 'status' | 'salesHandoff'>): CustomerOrderStage {
  if (order.status === 'rejected') return 'da_huy';
  if (order.status === 'pending_review' || order.status === 'needs_edit') return 'cho_duyet';
  if (order.status === 'sent' && order.salesHandoff?.status === 'pending') return 'cho_nhap_don';
  if (order.status === 'sent' || order.status === 'synced') return 'da_gui';
  return 'dang_xu_ly';
}

export const CUSTOMER_STAGE_LABEL: Readonly<Record<CustomerOrderStage, string>> = {
  cho_duyet: 'Chờ duyệt',
  da_gui: 'Đã gửi',
  cho_nhap_don: 'Đã gửi · chờ nhập đơn',
  da_huy: 'Đã huỷ',
  dang_xu_ly: 'Đang xử lý',
};

export function excerptOf(rawText: string): string {
  const collapsed = rawText.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= EXCERPT_LIMIT) return collapsed;
  return `${collapsed.slice(0, EXCERPT_LIMIT - 1)}…`;
}

/**
 * CHON TUNG TRUONG mot, khong bao gio `...order`.
 *
 * Trai tim cua ranh gioi nam o day. Mot phep spread se keo theo moi truong ma `OrderView` co them
 * trong tuong lai — nghia la be mat khach lang le nhan them truong ky thuat moi ma khong ai sua
 * mot dong nao o day, va khong test nao keu.
 */
export function toCustomerOrder(order: OrderView): CustomerOrder {
  const lines = order.priced?.lines ?? [];
  const stage = stageOf(order);
  return {
    reference: order.id,
    receivedAt: order.createdAt,
    groupName: order.groupName ?? null,
    dealerName: order.dealerName ?? order.priced?.dealerName ?? null,
    intent: order.intent,
    stage,
    excerpt: excerptOf(order.rawText),
    totalQuantity: lines.length > 0 ? lines.reduce((sum, line) => sum + line.quantity, 0) : null,
    grandTotal: order.priced?.grandTotal ?? null,
    attentionNotes: order.priced?.warnings ?? [],
    needsPerson: stage === 'cho_duyet' || stage === 'cho_nhap_don',
  };
}

export function toCustomerOrders(orders: readonly OrderView[]): readonly CustomerOrder[] {
  return orders.map(toCustomerOrder);
}

export interface CustomerWorkloadSummary {
  readonly total: number;
  readonly awaitingApproval: number;
  readonly awaitingOrderEntry: number;
  readonly sentToday: number;
  readonly groups: number;
}

/**
 * Con so tren trang Tong quan — dem tren du lieu THAT, va khong dem gi khi chua co du lieu.
 *
 * `sentToday` so theo NGAY DIA PHUONG cua nguoi dang xem, khong theo UTC: mot don chot luc 8 gio
 * toi gio Viet Nam ma bi tinh sang "hom sau" se lam con so hom nay doc ra sai.
 */
export function summarizeWorkload(
  orders: readonly CustomerOrder[],
  now: Date = new Date(),
): CustomerWorkloadSummary {
  const sameLocalDay = (iso: string): boolean => {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return false;
    return (
      at.getFullYear() === now.getFullYear() &&
      at.getMonth() === now.getMonth() &&
      at.getDate() === now.getDate()
    );
  };
  return {
    total: orders.length,
    awaitingApproval: orders.filter((order) => order.stage === 'cho_duyet').length,
    awaitingOrderEntry: orders.filter((order) => order.stage === 'cho_nhap_don').length,
    sentToday: orders.filter(
      (order) =>
        (order.stage === 'da_gui' || order.stage === 'cho_nhap_don') &&
        sameLocalDay(order.receivedAt),
    ).length,
    groups: new Set(orders.map((order) => order.groupName).filter(Boolean)).size,
  };
}

/**
 * Mot cuoc hoi thoai = mot nhom chat, gom lai tu cac tin da nhan.
 *
 * Gom theo TEN NHOM chu khong theo `chatId`: `chatId` la dinh danh ky thuat cua Zalo va khong duoc
 * phep xuat hien tren be mat khach. Tin chua map duoc ten nhom roi vao mot muc chung, va no duoc
 * goi dung ten: chua gan nhom.
 */
export interface CustomerConversation {
  readonly key: string;
  readonly groupName: string | null;
  readonly dealerName: string | null;
  readonly messageCount: number;
  readonly needsPerson: number;
  readonly lastMessageAt: string;
  readonly lastExcerpt: string;
}

export const UNASSIGNED_CONVERSATION_KEY = '__chua-gan-nhom__';

export function toConversations(orders: readonly CustomerOrder[]): readonly CustomerConversation[] {
  const byGroup = new Map<string, CustomerOrder[]>();
  for (const order of orders) {
    const key = order.groupName ?? UNASSIGNED_CONVERSATION_KEY;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(order);
    else byGroup.set(key, [order]);
  }

  return [...byGroup.entries()]
    .map(([key, bucket]) => {
      const sorted = [...bucket].sort(
        (left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt),
      );
      const latest = sorted[0]!;
      return {
        key,
        groupName: latest.groupName,
        dealerName: sorted.find((order) => order.dealerName)?.dealerName ?? null,
        messageCount: sorted.length,
        needsPerson: sorted.filter((order) => order.needsPerson).length,
        lastMessageAt: latest.receivedAt,
        lastExcerpt: latest.excerpt,
      };
    })
    .sort((left, right) => Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt));
}

export const CUSTOMER_INTENT_LABEL: Readonly<Record<Intent, string>> = {
  dat_don: 'Đặt đơn',
  hoi_gia: 'Hỏi giá',
  hoi_san_pham: 'Hỏi sản phẩm',
  chinh_sach_cong_no: 'Chính sách / công nợ',
  bao_hanh_khieu_nai: 'Bảo hành / khiếu nại',
  van_chuyen: 'Vận chuyển',
  khac: 'Khác',
};
