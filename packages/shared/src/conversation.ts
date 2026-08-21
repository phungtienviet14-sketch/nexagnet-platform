import type { PartialOrder } from './order.js';

/**
 * MACH HOI THOAI theo TUNG KHACH trong mot nhom (Pha 6 — 21/08/2026).
 *
 * Truoc pha nay he thong nho duoc lich su nhom (Pha 1) nhung khong bao gio HANH DONG theo mach:
 * mot tin thieu du lieu -> `needs_edit` -> nam cho Sale. Nhin tu phia khach, bot tra loi mot cau
 * roi im — dung nghia "khong nho cuoc tro chuyen".
 *
 * Mot nhom Zalo co 200 dai ly cung ban tin, nen trang thai KHONG duoc gan theo nhom: khoa la
 * `(chatId, senderExternalId)`. Hai khach hoi cung luc la HAI mach doc lap, moi mach mot don nhap
 * rieng va mot cau hoi dang cho rieng.
 */

/** Don NHAP dung chung khuon voi `partialOrderSchema` — khong dinh nghia hinh thu hai. */
export type OrderDraft = PartialOrder;
export type OrderDraftItem = PartialOrder['items'][number];

/**
 * Slot bot DUOC PHEP hoi lai khach. Danh sach nay co y HEP: chi nhung thu chinh khach biet cau
 * tra loi. Thieu bang gia, chua duyet chinh sach VAT, chua co bieu cuoc COD — deu KHONG nam o day
 * vi khach khong tra loi thay noi bo duoc; nhung truong hop do phai chuyen Sale.
 */
export const CLARIFY_SLOTS = ['product', 'quantity', 'recipient'] as const;
export type ClarifySlot = (typeof CLARIFY_SLOTS)[number];

/**
 * `collecting` = da co don nhap nhung bot chua hoi (hoac khach vua tra loi, chua quyet xong).
 * `awaiting_answer` = da hoi, dang cho khach. `closed` = don da chot va da gui xac nhan.
 * `handed_off` = chuyen Sale (het luot hoi, hoac gap thu chi noi bo quyet duoc).
 *
 * Hai trang thai dau deu KE THUA duoc don nhap sang tin sau; hai trang thai cuoi thi khong —
 * mot tin moi sau khi da chot la mot luot mua moi, khong phai phan tiep cua don cu.
 */
export const THREAD_STATUSES = ['collecting', 'awaiting_answer', 'closed', 'handed_off'] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

/** Mot mach dang mo cua MOT khach trong MOT nhom. */
export interface ConversationThread {
  chatId: string;
  senderExternalId: string;
  senderDisplayName?: string;
  status: ThreadStatus;
  draft: OrderDraft;
  /** Slot dang cho khach tra loi. Rong khi mach khong o trang thai cho. */
  awaitingSlots: ClarifySlot[];
  /** So cau da hoi trong mach nay — tran chan vong lap hoi mai khong ra. */
  askCount: number;
  /** Cau hoi gan nhat da gui, de Sale doc lai va de khong hoi lap y het cau. */
  lastQuestion?: string;
  /** Don gan nhat sinh ra tu mach nay (de noi len console). */
  lastOrderId?: string;
  updatedAt: string;
  /** Qua moc nay, tin moi mo mach MOI — khong ke thua don nhap cu nua. */
  expiresAt: string;
}

/** Trang thai mach dinh kem OrderView de console hien "dang cho khach tra loi". */
export interface ConversationThreadView {
  status: ThreadStatus;
  awaitingSlots: ClarifySlot[];
  askCount: number;
  question?: string;
  /**
   * Ten nguoi dang o dau mach nay.
   *
   * Trong mot nhom 200 dai ly co the co vai nguoi cung dang duoc hoi lai mot luc. Hang cho cua
   * Sale ma khong noi ro DANG CHO AI thi moi dong deu giong nhau, va Sale phai mo tung don ra
   * doi chieu — dung cai viec ma hang cho sinh ra de khoi phai lam.
   */
  senderDisplayName?: string;
}
