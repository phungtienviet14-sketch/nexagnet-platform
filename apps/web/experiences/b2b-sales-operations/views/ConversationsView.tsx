'use client';

import { MasterDetail, PickListItem } from '../components/MasterDetail';
import { OrderDetailPanel } from '../components/OrderDetailPanel';
import { EmptyState, ErrorState, LoadingState, Panel } from '../components/SectionState';
import { useMessageStream } from '../hooks/useWorkspaceData';
import { buildSectionUrl } from '../navigation';
import {
  conversationTitle,
  resolveConversationKey,
  toConversationDetail,
  toConversationList,
  type ConversationDetail,
} from '../workspace/conversations';
import type { OrderView } from '@netviet/shared';

/**
 * HOI THOAI — danh sach nhom ben trai, ca cuoc hoi thoai ben phai (Issue #110 §Hội thoại).
 *
 * O CHI TIET chi hien nhung gi NGUON HIEN CO chung minh duoc: danh tinh nhom/dai ly, cac tin da
 * nhan kem trich dan, y dinh he thong da hieu, tom tat don neu co, canh bao, va viec con lai cua
 * con nguoi. Khong co cot "AI dang nghi gi", khong co vet 6 vai agent, khong co lan goi mo hinh —
 * nhung thu do song o be mat noi bo va o lai do.
 */

export interface ConversationsViewProps {
  readonly selection: string | null;
  readonly onSelect: (key: string | null) => void;
}

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

export function ConversationsView({ selection, onSelect }: ConversationsViewProps) {
  const query = useMessageStream();
  return (
    <Panel
      title="Hội thoại theo nhóm"
      description="Mỗi nhóm đại lý là một cuộc hội thoại; số liệu tính trên tin đã nhận."
    >
      {query.isPending ? <LoadingState what="danh sách hội thoại" /> : null}
      {query.isError ? <ErrorState what="danh sách hội thoại" /> : null}
      {query.isSuccess ? (
        <ConversationWorkspace orders={query.data} selection={selection} onSelect={onSelect} />
      ) : null}
    </Panel>
  );
}

function ConversationWorkspace({
  orders,
  selection,
  onSelect,
}: {
  orders: readonly OrderView[];
  selection: string | null;
  onSelect: (key: string | null) => void;
}) {
  const conversations = toConversationList(orders);
  if (conversations.length === 0) {
    return (
      <EmptyState
        title="Chưa có hội thoại nào"
        detail="Khi nhóm Zalo đầu tiên gửi tin, hội thoại sẽ xuất hiện tại đây."
      />
    );
  }

  const activeKey = resolveConversationKey(conversations, selection);
  const detail = toConversationDetail(orders, activeKey);

  return (
    <MasterDetail
      listLabel="Danh sách hội thoại"
      detail={detail ? <ConversationPane detail={detail} /> : null}
    >
      {conversations.map((conversation) => (
        <PickListItem
          key={conversation.key}
          selected={conversation.key === activeKey}
          href={buildSectionUrl('conversations', conversation.key)}
          onSelect={() => onSelect(conversation.key)}
        >
          <span className="b2b-pick__title">{conversationTitle(conversation)}</span>
          <span className="b2b-pick__meta">
            {conversation.dealerName ?? 'Chưa xác định đại lý'}
            {conversation.needsPerson > 0 ? (
              <span className="b2b-pill b2b-pill--cho_duyet">
                {conversation.needsPerson} việc cần người
              </span>
            ) : null}
          </span>
          <span className="b2b-pick__excerpt">{conversation.lastExcerpt}</span>
          <span className="b2b-pick__foot">
            {conversation.messageCount} tin · gần nhất{' '}
            <time dateTime={conversation.lastMessageAt}>
              {formatMoment(conversation.lastMessageAt)}
            </time>
          </span>
        </PickListItem>
      ))}
    </MasterDetail>
  );
}

function ConversationPane({ detail }: { detail: ConversationDetail }) {
  const { conversation } = detail;
  return (
    <>
      <header className="b2b-detail__head">
        <h3 className="b2b-detail__title">{conversationTitle(conversation)}</h3>
        <p className="b2b-detail__sub">
          {conversation.dealerName ?? 'Chưa xác định đại lý'} · {conversation.messageCount} tin đã
          nhận
        </p>
        <p className="b2b-detail__sub">
          {detail.needsPerson > 0
            ? `${detail.needsPerson} tin trong cuộc này đang chờ người xử lý.`
            : 'Không còn tin nào trong cuộc này chờ người xử lý.'}
        </p>
      </header>

      {detail.attentionNotes.length > 0 ? (
        <section className="b2b-detail__block" aria-label="Cảnh báo của cuộc hội thoại">
          <h4 className="b2b-detail__blocktitle">Cần chú ý trong cuộc này</h4>
          <ul className="b2b-notes">
            {detail.attentionNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className="b2b-thread">
        {detail.messages.map((message) => (
          <li key={message.order.reference} className="b2b-thread__item">
            <p className="b2b-thread__action">{message.humanAction}</p>
            <OrderDetailPanel order={message.order} />
          </li>
        ))}
      </ol>
    </>
  );
}
