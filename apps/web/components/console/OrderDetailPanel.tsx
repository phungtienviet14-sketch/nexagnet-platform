'use client';

import type { OrderView } from '@netviet/shared';
import { formatVnd } from '../../lib/api';
import { INTENT_LABEL, POLICY_LABEL, statusMetaFor, timeOf } from '../../lib/labels';
import { OrderFlowPanel } from './OrderFlowPanel';

type Props = {
  order: OrderView;
  isBusy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCompleteSalesHandoff: (id: string) => void;
};

function ReplyBox({ reply }: { reply: string }) {
  const copy = () => void navigator.clipboard?.writeText(reply);
  return (
    <div className="reply-box">
      <div className="reply-head">
        <span>Nội dung trả lời đã tạo từ dữ liệu và rules</span>
        <button type="button" className="reply-copy" onClick={copy}>
          Copy
        </button>
      </div>
      <pre className="reply-text">{reply}</pre>
    </div>
  );
}

export function OrderDetailPanel({
  order,
  isBusy,
  onApprove,
  onReject,
  onCompleteSalesHandoff,
}: Props) {
  const status = statusMetaFor(order);
  const canAct = order.status === 'pending_review' || order.status === 'needs_edit';
  const reply = order.trace?.reply;
  const p = order.priced;

  // Tin khong phai don (hoi gia / tu van / khac) — chi co nhap tra loi.
  if (!p) {
    return (
      <div className="order-card">
        <div className="oc-head">
          <div>
            <div className="who">{INTENT_LABEL[order.intent]}</div>
            <div className="meta">
              {timeOf(order.createdAt)} · {order.groupName ?? 'nhóm chưa map'}
            </div>
          </div>
          <span className={`chip ${status.cls}`}>{status.label}</span>
        </div>
        {reply && <ReplyBox reply={reply} />}
        {/*
          Nhanh KHONG-PHAI-DON (tu van, hoi dap, `khac`) cung phai xem duoc luong.
          Do moi la cho hay bi hoi nhat: "vi sao bot tra loi the nay", "vi sao bot im lang".
        */}
        <OrderFlowPanel orderId={order.id} />
        {/*
          Truoc 21/08/2026 nhanh nay tra ve som VA KHONG CO NUT NAO — chi mot dong chu "chuyen
          Sale xu ly". Nen mot cau bao gia da tinh xong van khong the gui tu giao dien. Nay tin
          nao DA CO ban tra loi soan san thi Sale bam gui duoc ngay tai day.
        */}
        {canAct && order.trace?.outbound ? (
          <div className="oc-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={isBusy}
              onClick={() => onReject(order.id)}
            >
              Từ chối
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isBusy}
              onClick={() => onApprove(order.id)}
            >
              Duyệt &amp; gửi
            </button>
          </div>
        ) : canAct ? (
          <div className="non-order">
            Chưa có nội dung đã duyệt để gửi — Sale trả lời thủ công giúp khách ạ.
          </div>
        ) : order.status === 'sent' ? (
          <div className="oc-done">✓ Khách đã nhận trả lời trong nhóm Zalo</div>
        ) : (
          <div className="non-order">Không phải đơn hàng.</div>
        )}
      </div>
    );
  }

  return (
    <div className="order-card">
      <div className="oc-head">
        <div>
          <div className="who">{p.dealerName ?? order.dealerName ?? 'Chưa rõ đại lý'}</div>
          <div className="meta">
            {p.orderType} · {timeOf(order.createdAt)} · {INTENT_LABEL[order.intent]}
            {order.groupName ? ` · 📍 ${order.groupName}` : ''}
          </div>
        </div>
        <span className={`chip ${status.cls}`}>{status.label}</span>
      </div>

      {p.orderType === 'TH2' && p.customerName && (
        <div className="oc-customer">
          Khách: {p.customerName}
          {p.customerPhone ? ` · ${p.customerPhone}` : ''}
          {p.customerAddress ? ` · ${p.customerAddress}` : ''}
        </div>
      )}

      <div className="oc-lines">
        {p.lines.map((l, i) => (
          <div className={`oc-line ${l.matched ? '' : 'unmatched'}`} key={`${l.skuRaw}-${i}`}>
            <div>
              <div className="name">{l.productName ?? l.skuRaw}</div>
              <div className="qty">
                {l.quantity} × {l.matched ? formatVnd(l.unitPrice) : 'chưa có giá'}
              </div>
            </div>
            <div className="mono">{formatVnd(l.lineTotal)}</div>
          </div>
        ))}
      </div>

      <div className="oc-totals">
        <div className="row">
          <span>Tiền hàng</span>
          <span className="mono">{formatVnd(p.itemsSubtotal)}</span>
        </div>
        <div className="row">
          <span>Phí ship</span>
          <span>{p.shippingFee === 0 ? 'Miễn phí' : formatVnd(p.shippingFee)}</span>
        </div>
        {p.vat && (
          <div className="row">
            <span>VAT</span>
            <span className="mono">{formatVnd(p.vatAmount)}</span>
          </div>
        )}
        {p.codCollect && (
          <div className="row">
            <span>Thu hộ COD</span>
            <span className="mono">{formatVnd(p.codFee)}</span>
          </div>
        )}
        <div className="row grand">
          <span>TỔNG</span>
          <b className="mono">{formatVnd(p.grandTotal)}</b>
        </div>
        {p.policy && <div className="oc-policy">Chính sách: {POLICY_LABEL[p.policy]}</div>}
      </div>

      {p.warnings.length > 0 && (
        <ul className="oc-warn">
          {p.warnings.map((w, i) => (
            <li key={`${w}-${i}`}>{w}</li>
          ))}
        </ul>
      )}

      {canAct && order.trace?.supervisor.escalate ? (
        <div className="handoff-banner">
          ⚑ Chuyển người thật: {order.trace.supervisor.reasons.join('; ')}
        </div>
      ) : canAct && order.trace?.supervisor.riskLevel === 'watch' ? (
        <div className="watch-banner">
          ⚠ Giám sát theo dõi: {order.trace.supervisor.reasons.join('; ')}
        </div>
      ) : null}

      {reply && <ReplyBox reply={reply} />}
      <OrderFlowPanel orderId={order.id} />

      {canAct ? (
        <div className="oc-actions">
          <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => onReject(order.id)}>
            Từ chối
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isBusy}
            onClick={() => onApprove(order.id)}
          >
            Sale kiểm tra &amp; gửi nhóm
          </button>
        </div>
      ) : order.status === 'sent' ? (
        <div className="oc-done">
          <span>✓ Khách đã nhận xác nhận trong nhóm Zalo</span>
          {order.salesHandoff?.status === 'pending' && (
            <>
              <span>⚑ Việc Sale: nhập đơn thủ công vào ERP</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isBusy}
                onClick={() => onCompleteSalesHandoff(order.id)}
              >
                Đánh dấu đã nhập ERP
              </button>
            </>
          )}
          {order.salesHandoff?.status === 'completed' && (
            <span>✓ Sale đã xác nhận nhập ERP thủ công</span>
          )}
        </div>
      ) : order.status === 'synced' ? (
        <div className="oc-done">
          <span>✓ Đã gửi xác nhận vào nhóm Zalo</span>
          <span>
            ✓ Đã đồng bộ ERP{order.erpCode ? ` · ${order.erpCode}` : ''}
          </span>
        </div>
      ) : (
        <div className="non-order">Trạng thái: {status.label}</div>
      )}
    </div>
  );
}
