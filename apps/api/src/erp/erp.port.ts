import type { ErpOrder, ErpProduct, PricedOrder } from '@netviet/shared';

/**
 * Tang 5 — CONG ERP: hop dong trung tinh giua pipeline va he thong ban hang/kho cua khach.
 * Nen tang chi biet cong nay; moi khach cam mot hien thuc khac nhau (Dot B1):
 *   - KiotVietMockAdapter  — U Ultty, GD1 (KiotViet chua bat API -> gia lap trong bo nho).
 *   - KiotVietApiAdapter   — U Ultty, GD2 khi khach bat API (chua lam).
 *   - NhanhAdapter         — khach Amico dung Nhanh.vn (CHUA lam — Dot B4).
 *
 * Doi hien thuc = doi mot dong `useClass` o app.module.ts, khong dung den orders.service.
 * Nguyen tac giu nguyen (CLAUDE.md): KHONG xay module quan ly kho rieng — ERP cua khach van
 * la nguon su that duy nhat cho ton kho.
 */
export abstract class ErpPort {
  abstract pushOrder(order: PricedOrder): Promise<{ code: string }>;
  /** Danh muc SP + ton kho hien tai (cho tab ERP tren app). */
  abstract listProducts(): ErpProduct[];
  /** Cac don da day len ERP (moi nhat truoc). */
  abstract listOrders(): ErpOrder[];
}
