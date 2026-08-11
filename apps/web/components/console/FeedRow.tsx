'use client';

import { SENDER_LABELS, type OrderStatus } from '@netviet/shared';
import { INTENT_LABEL, STATUS_META } from '../../lib/labels';
import type { FeedItem } from '../../lib/live';

type Props = {
  item: FeedItem;
  active: boolean;
  onSelect: (id: string) => void;
};

export function FeedRow({ item, active, onSelect }: Props) {
  const sender = item.senderType ?? 'unknown';
  const status = item.processing ? null : STATUS_META[item.status as OrderStatus];

  return (
    <button
      type="button"
      className={`feed-row ${active ? 'active' : ''}`}
      aria-current={active}
      onClick={() => onSelect(item.id)}
    >
      <div className="fr-top">
        <span className="fr-group">{item.groupName ?? `Nhóm ${item.chatId.slice(0, 10)}…`}</span>
        {item.processing && (
          <span className="fr-live">
            <span className="live-dot" aria-label="đang xử lý" />
          </span>
        )}
      </div>
      <div className="fr-text">“{item.rawText}”</div>
      <div className="fr-meta">
        {item.processing ? (
          <span className="chip chip-review">⏳ Đang xử lý</span>
        ) : (
          <>
            {item.intent && <span className="chip chip-intent">{INTENT_LABEL[item.intent]}</span>}
            {status && <span className={`chip ${status.cls}`}>{status.label}</span>}
          </>
        )}
        <span className="chip chip-sender">{SENDER_LABELS[sender]}</span>
      </div>
    </button>
  );
}
