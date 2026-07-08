'use client';

import type { Intent, OrderStatus, OrderView, PolicyType } from '@ultty/shared';
import { formatVnd } from '../lib/api';
import { AgentTraceStrip } from './AgentTraceStrip';

type Props = {
  order: OrderView;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isBusy: boolean;
};

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'badge-review' },
  pending_review: { label: 'Chờ duyệt', cls: 'badge-review' },
  needs_edit: { label: 'Cần kiểm tra', cls: 'badge-edit' },
  approved: { label: 'Đã duyệt', cls: 'badge-sent' },
  sent: { label: 'Đã gửi nhóm', cls: 'badge-sent' },
  synced: { label: 'Hoàn tất', cls: 'badge-sent' },
  rejected: { label: 'Đã từ chối', cls: 'badge-rejected' },
};

const INTENT_LABEL: Record<Intent, string> = {
  dat_don: 'Đặt đơn',
  hoi_gia: 'Hỏi giá',
  hoi_san_pham: 'Hỏi sản phẩm',
  chinh_sach_cong_no: 'Chính sách / công nợ',
  bao_hanh_khieu_nai: 'Bảo hành / khiếu nại',
  van_chuyen: 'Vận chuyển',
  khac: 'Khác',
};

const POLICY_LABEL: Record<PolicyType, string> = {
  cong_no_30: 'Công nợ 30 ngày',
  cong_no_45: 'Công nợ 45 ngày',
  ky_gui: 'Ký gửi',
  thanh_toan_ngay: 'Thanh toán ngay',
  cod: 'COD (thu hộ)',
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function OrderCard({ order, onApprove, onReject, isBusy }: Props) {
  const status = STATUS_META[order.status];
  const canAct = order.status === 'pending_review' || order.status === 'needs_edit';
  const p = order.priced;

  if (!p) {
    return (
      <article className="card">
        <div className="card-head">
          <div>
            <div className="who">{INTENT_LABEL[order.intent]}</div>
            <div className="meta">
              {timeOf(order.createdAt)} · {order.groupName ?? `nhóm ${order.chatId.slice(0, 12)}…`}
            </div>
          </div>
          <span className={`badge ${status.cls}`}>{status.label}</span>
        </div>
        <div className="raw">“{order.rawText}”</div>
        {order.trace && <AgentTraceStrip trace={order.trace} senderType={order.senderType} />}
        <div className="non-order">AI: không phải đơn hàng — chuyển Sale xử lý thủ công.</div>
      </article>
    );
  }

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <div className="who">{p.dealerName ?? order.dealerName ?? 'Chưa rõ đại lý'}</div>
          <div className="meta">
            {p.orderType} · {timeOf(order.createdAt)} · {INTENT_LABEL[order.intent]}
          </div>
          {order.groupName && <div className="group-tag">📍 {order.groupName}</div>}
        </div>
        <span className={`badge ${status.cls}`}>{status.label}</span>
      </div>

      {p.orderType === 'TH2' && p.customerName && (
        <div className="raw">
          Khách: {p.customerName}
          {p.customerPhone ? ` · ${p.customerPhone}` : ''}
          {p.customerAddress ? ` · ${p.customerAddress}` : ''}
        </div>
      )}

      <div className="lines">
        {p.lines.map((l, i) => (
          <div className={`line ${l.matched ? '' : 'unmatched'}`} key={`${l.skuRaw}-${i}`}>
            <div>
              <div className="name">{l.productName ?? l.skuRaw}</div>
              <div className="qty">
                {l.quantity} × {l.matched ? formatVnd(l.unitPrice) : 'chưa có giá'}
              </div>
            </div>
            <div className="amt">{formatVnd(l.lineTotal)}</div>
          </div>
        ))}
      </div>

      <div className="totals">
        <div className="row">
          <span>Tiền hàng</span>
          <span>{formatVnd(p.itemsSubtotal)}</span>
        </div>
        <div className="row">
          <span>Phí ship</span>
          <span>{p.shippingFee === 0 ? 'Miễn phí' : formatVnd(p.shippingFee)}</span>
        </div>
        {p.vat && (
          <div className="row">
            <span>VAT</span>
            <span>{formatVnd(p.vatAmount)}</span>
          </div>
        )}
        {p.codCollect && (
          <div className="row">
            <span>Thu hộ COD</span>
            <span>{formatVnd(p.codFee)}</span>
          </div>
        )}
        <div className="row grand">
          <span>TỔNG</span>
          <b>{formatVnd(p.grandTotal)}</b>
        </div>
        {p.policy && <div className="policy">Chính sách: {POLICY_LABEL[p.policy]}</div>}
      </div>

      {p.warnings.length > 0 && (
        <ul className="warnings">
          {p.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div className="raw">
        “{order.rawText}”
        {order.imageUrl && <img src={order.imageUrl} alt="Ảnh đơn hàng" />}
      </div>

      {order.trace && <AgentTraceStrip trace={order.trace} senderType={order.senderType} />}

      {canAct ? (
        <div className="actions">
          <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => onReject(order.id)}>
            Từ chối
          </button>
          <button type="button" className="btn btn-primary" disabled={isBusy} onClick={() => onApprove(order.id)}>
            Duyệt & gửi nhóm
          </button>
        </div>
      ) : order.status === 'synced' ? (
        <div className="done">
          <span>✓ Đã gửi xác nhận vào nhóm Zalo</span>
          <span>✓ Lên KiotViet · {order.kiotVietCode}</span>
        </div>
      ) : (
        <div className="non-order">
          {order.status === 'sent'
            ? '✓ Đã gửi format xác nhận vào nhóm Zalo.'
            : `Trạng thái: ${status.label}`}
        </div>
      )}
    </article>
  );
}
