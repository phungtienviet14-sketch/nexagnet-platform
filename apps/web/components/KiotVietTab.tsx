'use client';

import { useQuery } from '@tanstack/react-query';
import { api, formatVnd } from '../lib/api';

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function KiotVietTab() {
  const productsQ = useQuery({
    queryKey: ['kiotviet', 'products'],
    queryFn: api.kiotVietProducts,
    refetchInterval: 3000,
  });
  const ordersQ = useQuery({
    queryKey: ['kiotviet', 'orders'],
    queryFn: api.kiotVietOrders,
    refetchInterval: 3000,
  });

  const products = productsQ.data ?? [];
  const orders = ordersQ.data ?? [];

  return (
    <>
      <div className="counters">
        <div className="counter">
          <b>{products.length}</b>
          <span>Sản phẩm</span>
        </div>
        <div className="counter">
          <b>{orders.length}</b>
          <span>Đơn đã đồng bộ</span>
        </div>
      </div>

      <div className="kv-note">
        Mô phỏng KiotViet (mock). Duyệt đơn ở tab Đơn hàng → đơn xuất hiện ở đây và trừ tồn kho.
      </div>

      <div className="section-title">Danh mục sản phẩm &amp; tồn kho</div>
      <div className="kv-list">
        {products.length === 0 && <div className="empty">Chưa tải được danh mục.</div>}
        {products.map((p) => (
          <div className="kv-product" key={p.sku}>
            <div className="kv-product-main">
              <div className="name">{p.name}</div>
              <div className="kv-sub">
                {p.sku} · {formatVnd(p.price)}/{p.unit}
                {p.sold > 0 ? ` · đã xuất ${p.sold}` : ''}
              </div>
            </div>
            <div className={`kv-stock ${p.sold > 0 ? 'kv-stock-moved' : ''}`}>
              <b>{p.stock}</b>
              <span>tồn</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">Đơn đã đồng bộ lên KiotViet</div>
      <div className="kv-list">
        {orders.length === 0 && (
          <div className="empty">Chưa có đơn nào. Duyệt 1 đơn ở tab Đơn hàng để thấy đơn hiện ở đây.</div>
        )}
        {orders.map((o) => (
          <div className="kv-order" key={o.code}>
            <div className="kv-order-head">
              <span className="kv-code">{o.code}</span>
              <span className="kv-time">{timeOf(o.createdAt)}</span>
            </div>
            <div className="kv-order-body">
              <span>
                {o.dealerName ?? 'Chưa rõ đại lý'}
                {o.branch ? ` · ${o.branch}` : ''} · {o.lineCount} SP
              </span>
              <b>{formatVnd(o.grandTotal)}</b>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
