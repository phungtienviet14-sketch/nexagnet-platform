'use client';

import type { OrderView } from '@netviet/shared';
import { formatVnd } from '../../lib/api';
import { approvalKind, awaitingApproval } from '../../lib/sales-work';

/**
 * HANG CHO "DUYET & GUI".
 *
 * Vi sao can mot man rieng thay vi mot cot nua: truoc 21/08/2026 muon gui mot tin dang cho, Sale
 * phai TIM no trong feed thoi gian (lan giua moi tin da xu ly xong), bam vao, roi bam nut trong
 * bang chi tiet. Khong cho nao tra loi duoc cau "con bao nhieu tin dang cho toi?" — nen tin bi bo
 * quen la chuyen binh thuong. Man nay chi chua thu CHUA DEN TAY KHACH va DA co noi dung de gui.
 */

interface Props {
  readonly orders: readonly OrderView[];
  readonly isBusy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onReject: (id: string) => void;
  readonly onInspect: (id: string) => void;
}

const KIND_LABEL = {
  xac_nhan_don: { text: 'Xác nhận đơn', className: 'q-kind q-kind--order' },
  tu_van: { text: 'Trả lời tư vấn', className: 'q-kind q-kind--advice' },
} as const;

export function ApprovalQueue({ orders, isBusy, onApprove, onReject, onInspect }: Props) {
  const queue = orders.filter(awaitingApproval);

  if (queue.length === 0) {
    return (
      <div className="queue-empty">
        <p className="queue-empty-title">Không còn tin nào chờ duyệt</p>
        <p className="queue-empty-hint">
          Đơn đủ dữ liệu trong ngưỡng và câu tư vấn có tài liệu đã duyệt được gửi thẳng. Ở đây chỉ
          còn thứ cần người thật quyết.
        </p>
      </div>
    );
  }

  return (
    <div className="queue" aria-label="Hàng chờ duyệt và gửi">
      <p className="col-label">
        Chờ duyệt &amp; gửi · <b>{queue.length}</b> tin
      </p>
      <ul className="queue-list">
        {queue.map((order) => (
          <QueueRow
            key={order.id}
            order={order}
            isBusy={isBusy}
            onApprove={onApprove}
            onReject={onReject}
            onInspect={onInspect}
          />
        ))}
      </ul>
    </div>
  );
}

function QueueRow({
  order,
  isBusy,
  onApprove,
  onReject,
  onInspect,
}: { order: OrderView } & Omit<Props, 'orders'>) {
  const kind = approvalKind(order);
  const label = kind ? KIND_LABEL[kind] : null;
  // Uu tien ten nguoi tu mach hoi thoai: trong nhom nhieu nguoi, "dai ly X" khong du de biet
  // dang tra loi ai.
  const who = order.conversation?.senderDisplayName ?? order.dealerName ?? order.groupName;
  const preview = order.priced?.confirmationText ?? order.trace?.outbound?.text ?? '';
  const blocking = order.draftGaps?.blocking ?? [];
  const handedOff = order.trace?.supervisor.escalate;

  return (
    <li className="queue-row">
      <div className="queue-head">
        {label && <span className={label.className}>{label.text}</span>}
        {who && <span className="q-who">{who}</span>}
        {order.groupName && <span className="q-group">{order.groupName}</span>}
        {order.priced && <span className="q-total">{formatVnd(order.priced.grandTotal)}</span>}
      </div>

      <p className="queue-asked">
        <span className="q-quote">“{order.rawText}”</span>
      </p>

      {preview && <p className="queue-preview">{preview}</p>}

      {(handedOff || blocking.length > 0) && (
        <p className="queue-why">
          ⚑ Cần người thật:{' '}
          {[...(order.trace?.supervisor.reasons ?? []), ...blocking].join('; ')}
        </p>
      )}

      <div className="queue-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={isBusy}
          onClick={() => onInspect(order.id)}
        >
          Xem chi tiết
        </button>
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
    </li>
  );
}
