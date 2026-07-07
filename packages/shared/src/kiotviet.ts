/**
 * DTO cho tab "KiotViet" tren app — xem danh muc SP + ton kho + don da dong bo.
 * GD1 la MOCK (in-memory); GD2 thay bang du lieu tu API KiotViet that.
 */

export interface KiotVietProduct {
  sku: string;
  name: string;
  unit: string;
  /** Gia cap dai ly (VND) — dai dien gia niem yet trong danh muc */
  price: number;
  /** Ton kho gia lap (mock) — giam khi co don day len */
  stock: number;
  /** Tong so luong da xuat (cong don qua cac don) — de UI danh dau SP da ban */
  sold: number;
}

export interface KiotVietOrder {
  /** Ma don KiotViet (vd KV-1001) */
  code: string;
  dealerName: string | null;
  branch: string | null;
  itemsSubtotal: number;
  grandTotal: number;
  lineCount: number;
  /** ISO thoi diem day len KiotViet */
  createdAt: string;
}
