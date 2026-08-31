'use client';

import { formatVnd } from '../../../lib/format';
import { CUSTOMER_INTENT_LABEL, CUSTOMER_STAGE_LABEL, type CustomerOrder } from '../customer-view';

/**
 * Danh sach tin/don tren be mat khach.
 *
 * Nhan `CustomerOrder[]` chu KHONG nhan `OrderView[]`: kieu la thu chan mot truong ky thuat di lac
 * vao day, va no chan o cho khong ai phai nho de kiem tra (xem `customer-view.ts`).
 */

function formatMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderList({ orders }: { orders: readonly CustomerOrder[] }) {
  return (
    <ul className="b2b-orders">
      {orders.map((order) => (
        <li key={order.reference} className={`b2b-order b2b-order--${order.stage}`}>
          <div className="b2b-order__lead">
            <span className={`b2b-pill b2b-pill--${order.stage}`}>
              {CUSTOMER_STAGE_LABEL[order.stage]}
            </span>
            <span className="b2b-order__intent">{CUSTOMER_INTENT_LABEL[order.intent]}</span>
            <time className="b2b-order__time" dateTime={order.receivedAt}>
              {formatMoment(order.receivedAt)}
            </time>
          </div>

          <p className="b2b-order__excerpt">{order.excerpt}</p>

          <dl className="b2b-order__meta">
            <div>
              <dt>Nhóm</dt>
              <dd>{order.groupName ?? 'Chưa gán nhóm'}</dd>
            </div>
            <div>
              <dt>Đại lý</dt>
              <dd>{order.dealerName ?? 'Chưa xác định'}</dd>
            </div>
            {order.totalQuantity !== null ? (
              <div>
                <dt>Số lượng</dt>
                <dd>{order.totalQuantity}</dd>
              </div>
            ) : null}
            {order.grandTotal !== null ? (
              <div>
                <dt>Tổng đơn</dt>
                <dd className="b2b-order__total">{formatVnd(order.grandTotal)}</dd>
              </div>
            ) : null}
          </dl>

          {order.attentionNotes.length > 0 ? (
            <ul className="b2b-order__notes">
              {order.attentionNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
