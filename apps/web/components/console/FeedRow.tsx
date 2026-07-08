'use client';

import { SENDER_LABELS, type OrderView } from '@ultty/shared';
import { INTENT_LABEL, STATUS_META } from '../../lib/labels';

type Props = {
  order: OrderView;
  active: boolean;
  live: boolean;
  onSelect: (id: string) => void;
};

export function FeedRow({ order, active, live, onSelect }: Props) {
  const status = STATUS_META[order.status];
  const sender = order.senderType ?? 'unknown';
  return (
    <button
      type="button"
      className={`feed-row ${active ? 'active' : ''}`}
      aria-current={active}
      onClick={() => onSelect(order.id)}
    >
      <div className="fr-top">
        <span className="fr-group">{order.groupName ?? `Nhóm ${order.chatId.slice(0, 10)}…`}</span>
        {live && (
          <span className="fr-live">
            <span className="live-dot" aria-label="đang xử lý" />
          </span>
        )}
      </div>
      <div className="fr-text">“{order.rawText}”</div>
      <div className="fr-meta">
        <span className="chip chip-intent">{INTENT_LABEL[order.intent]}</span>
        <span className={`chip ${status.cls}`}>{status.label}</span>
        <span className="chip chip-sender">{SENDER_LABELS[sender]}</span>
      </div>
    </button>
  );
}
