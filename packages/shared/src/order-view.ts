import type { AgentTrace, SenderType } from './agents.js';
import type { FieldConfidence, Intent, OrderStatus, OrderType, ParsedOrder } from './order.js';

/**
 * DTO ket qua sau khi rules engine tinh (tang 4) — hop dong API -> web.
 * Day la output noi bo (khong parse tu nguon la), dung TS interface thay zod.
 */

export type DealerTier = 'dai_ly' | 'ctv';
export type PolicyType = 'cong_no_30' | 'cong_no_45' | 'ky_gui' | 'thanh_toan_ngay' | 'cod';
export type ReplyChannel = 'mock' | 'bot' | 'zca';

export interface PricedLine {
  skuRaw: string;
  /** SKU chuan sau khi map; null neu khong khop danh muc */
  sku: string | null;
  productName: string | null;
  quantity: number;
  /** Gia he thong ap theo cap dai ly (0 neu chua map duoc) */
  unitPrice: number;
  lineTotal: number;
  matched: boolean;
}

export interface PricedOrder {
  orderType: OrderType;
  dealerName: string | null;
  branch: string | null;
  lines: PricedLine[];
  itemsSubtotal: number;
  shippingFee: number;
  policy: PolicyType | null;
  codCollect: boolean;
  codFee: number;
  vat: boolean;
  vatAmount: number;
  grandTotal: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  /** Canh bao validation (SKU la, tong lech, thieu dai ly) -> Sale can kiem tra */
  warnings: string[];
  /** Format xac nhan TH1/TH2 de gui lai nhom */
  confirmationText: string;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  createdAt: string;
  chatId: string;
  /** Kenh da nhan tin; moi phan hoi phai quay lai dung kenh nay. */
  replyChannel?: ReplyChannel;
  /** Ten nhom Zalo (map tu chatId) — hien tren feed de phan biet nhieu nhom */
  groupName?: string;
  /** Ten dai ly (map tu nhom) — hien ca khi tin khong phai don hang */
  dealerName?: string;
  rawText: string;
  /** photo_url neu tin la anh (hien anh don tren app) */
  imageUrl?: string;
  intent: Intent;
  parsed: ParsedOrder | null;
  priced: PricedOrder | null;
  confidence: FieldConfidence;
  /** Ma don KiotViet sau khi day len (GD1: mock; GD2: API that) */
  kiotVietCode?: string;
  /** Loai nguoi gui suy tu nhom (multi-agent 6 con). */
  senderType?: SenderType;
  /** Vet 6 vai agent da phoi hop xu ly tin (multi-agent 6 con). */
  trace?: AgentTrace;
  /** Version rules typed da ap dung; bo trong nghia la defaults trong code. */
  ruleConfigVersion?: number;
}
