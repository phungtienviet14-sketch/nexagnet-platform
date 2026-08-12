'use client';

import { useQuery } from '@tanstack/react-query';
import { api, formatVnd } from '../../lib/api';
import { timeOf } from '../../lib/labels';

/**
 * Trang thai ERP cua khach — ton kho la source of truth kho; don xuat hien sau khi da day len ERP.
 *
 * KHONG gan vao `SourceColumn` trong GD1: GD1 khong day don len ERP (Sale nhap tay), nen mot tab
 * hien "don da dong bo" se noi sai su that. Giu lai cho giai doan bat tich hop ERP.
 */
export function ErpPanel() {
  const productsQ = useQuery({
    queryKey: ['erp', 'products'],
    queryFn: api.erpProducts,
    refetchInterval: 3000,
  });
  const ordersQ = useQuery({
    queryKey: ['erp', 'orders'],
    queryFn: api.erpOrders,
    refetchInterval: 3000,
  });

  const products = productsQ.data ?? [];
  const orders = ordersQ.data ?? [];

  return (
    <div>
      <div className="kb-block">
        <p className="kb-title">Tồn kho · source of truth</p>
        {products.length === 0 && <div className="empty">Chưa tải được danh mục.</div>}
        {products.map((p) => (
          <div className="kv-item" key={p.sku}>
            <div>
              <div className="kv-name">{p.name}</div>
              <div className="kv-sub">
                {p.sku} · {formatVnd(p.price)}
                {p.sold > 0 ? ` · đã xuất ${p.sold}` : ''}
              </div>
            </div>
            <div className={`kv-stock ${p.sold > 0 ? 'moved' : ''}`}>
              <b className="num">{p.stock}</b>
              <span>tồn</span>
            </div>
          </div>
        ))}
      </div>

      <div className="kb-block">
        <p className="kb-title">Đơn đã đồng bộ ({orders.length})</p>
        {orders.length === 0 && <div className="empty">Chưa có đơn đồng bộ.</div>}
        {orders.map((o) => (
          <div className="kv-item" key={o.code}>
            <div>
              <div className="kv-name mono">{o.code}</div>
              <div className="kv-sub">
                {o.dealerName ?? 'chưa rõ đại lý'}
                {o.branch ? ` · ${o.branch}` : ''} · {o.lineCount} SP · {timeOf(o.createdAt)}
              </div>
            </div>
            <div className="kv-stock moved">
              <b className="mono">{formatVnd(o.grandTotal)}</b>
              <span>tổng</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
