import { z } from 'zod';

/**
 * Schema don hang do AI trich xuat (tang 3 thiet ke hop nhat).
 * LLM chi trich xuat cau truc tho (skuRaw, so luong, gia khach ghi) — KHONG tinh tien.
 * Rules engine (tang 4) moi tinh gia/ship/chinh sach tu nguon su that.
 */

/** 7 loai intent theo NetViet 5.2 */
export const INTENTS = [
  'hoi_san_pham',
  'hoi_gia',
  'dat_don',
  'chinh_sach_cong_no',
  'bao_hanh_khieu_nai',
  'van_chuyen',
  'khac',
] as const;

export const intentResultSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
});
export type Intent = (typeof INTENTS)[number];
export type IntentResult = z.infer<typeof intentResultSchema>;

/** TH1 = giao cho dai ly; TH2 = giao thang khach cua dai ly */
export const ORDER_TYPES = ['TH1', 'TH2'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const parsedOrderItemSchema = z.object({
  /** Ten/ma SP nhu dai ly ghi (vd "ghe felix") — rules engine se map ve SKU chuan */
  skuRaw: z.string().min(1),
  quantity: z.number().int().positive(),
  /** Gia khach ghi (neu co) — dung de doi chieu, KHONG phai gia he thong ap */
  unitPriceRaw: z.number().nonnegative().optional(),
});
export type ParsedOrderItem = z.infer<typeof parsedOrderItemSchema>;

export const parsedOrderSchema = z.object({
  orderType: z.enum(ORDER_TYPES),
  dealerNameRaw: z.string().optional(),
  branch: z.string().optional(),
  items: z.array(parsedOrderItemSchema).min(1),
  /** Tong khach ghi (neu co) — de validation doi chieu voi tong rules tinh */
  totalRaw: z.number().nonnegative().optional(),
  noVat: z.boolean().default(false),
  // Truong rieng TH2
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  shippingFeeRaw: z.number().nonnegative().optional(),
  codCollect: z.boolean().optional(),
});
export type ParsedOrder = z.infer<typeof parsedOrderSchema>;

/** Do tin cay tung field: key theo duong dan (vd "items.0.quantity") -> [0,1] */
export const fieldConfidenceSchema = z.record(z.string(), z.number().min(0).max(1));
export type FieldConfidence = z.infer<typeof fieldConfidenceSchema>;

/** Ket qua parser tra ve cho tang pipeline */
export const parseResultSchema = z.object({
  intent: z.enum(INTENTS),
  order: parsedOrderSchema.optional(),
  confidence: fieldConfidenceSchema.default({}),
});
export type ParseResult = z.infer<typeof parseResultSchema>;

/** Vong doi don hang (state machine, so do 4) */
export const ORDER_STATUSES = [
  'draft',
  'pending_review',
  'needs_edit',
  'approved',
  'rejected',
  'sent',
  // Da duyet -> gui xac nhan nhom + day len KiotViet (hoan tat)
  'synced',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
