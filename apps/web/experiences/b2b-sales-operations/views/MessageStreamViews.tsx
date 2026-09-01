'use client';

import { useQuery } from '@tanstack/react-query';
import type { OrderView } from '@netviet/shared';
import type { ReactNode } from 'react';
import { api } from '../../../lib/api';
import { OrderList } from '../components/OrderList';
import { EmptyState, ErrorState, LoadingState, Panel } from '../components/SectionState';
import { toConversations, toCustomerOrders } from '../customer-view';

/**
 * BA CACH NHIN cung MOT dong tin nhan — Hoi thoai, Duyet & gui, Don hang.
 *
 * Cung mot tep vi chung la cung mot nguon (`GET /messages`) va cung mot phep chieu huong khach;
 * cai khac nhau chi la BO LOC va CAU CHU. Tach ra ba tep se de lai ba ban sao cua cung mot vong
 * doi tai/rong/loi, va den lan sua thu tu se co ba noi de quen mot.
 *
 * PHAM VI U-UI0: chi DOC. Nut duyet/gui/tu choi thuoc U-UI1 (Sale Workspace) va CO Y khong nam o
 * day — Issue #107 §10 liet ke no la ngoai pham vi.
 */

function useMessageStream() {
  return useQuery({ queryKey: ['b2b', 'messages'], queryFn: api.messages });
}

function StreamPanel({
  title,
  description,
  what,
  query,
  children,
}: {
  title: string;
  description: string;
  what: string;
  query: ReturnType<typeof useMessageStream>;
  children: (orders: readonly OrderView[]) => ReactNode;
}) {
  return (
    <Panel title={title} description={description}>
      {query.isPending ? <LoadingState what={what} /> : null}
      {query.isError ? <ErrorState what={what} /> : null}
      {query.isSuccess ? children(query.data) : null}
    </Panel>
  );
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

export function ConversationsView() {
  const query = useMessageStream();
  return (
    <StreamPanel
      title="Hội thoại theo nhóm"
      description="Mỗi nhóm đại lý là một cuộc hội thoại; số liệu tính trên tin đã nhận."
      what="danh sách hội thoại"
      query={query}
    >
      {(orders) => {
        const conversations = toConversations(toCustomerOrders(orders));
        if (conversations.length === 0) {
          return (
            <EmptyState
              title="Chưa có hội thoại nào"
              detail="Khi nhóm Zalo đầu tiên gửi tin, hội thoại sẽ xuất hiện tại đây."
            />
          );
        }
        return (
          <ul className="b2b-conversations">
            {conversations.map((conversation) => (
              <li key={conversation.key} className="b2b-conversation">
                <div className="b2b-conversation__head">
                  <span className="b2b-conversation__name">
                    {conversation.groupName ?? 'Chưa gán nhóm'}
                  </span>
                  {conversation.needsPerson > 0 ? (
                    <span className="b2b-pill b2b-pill--cho_duyet">
                      {conversation.needsPerson} việc cần người
                    </span>
                  ) : null}
                </div>
                <p className="b2b-conversation__dealer">
                  {conversation.dealerName ?? 'Chưa xác định đại lý'}
                </p>
                <p className="b2b-conversation__excerpt">{conversation.lastExcerpt}</p>
                <p className="b2b-conversation__foot">
                  {conversation.messageCount} tin · gần nhất{' '}
                  <time dateTime={conversation.lastMessageAt}>
                    {formatMoment(conversation.lastMessageAt)}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        );
      }}
    </StreamPanel>
  );
}

export function ApprovalsView() {
  const query = useMessageStream();
  return (
    <StreamPanel
      title="Chờ người kiểm tra"
      description="Phản hồi đã soạn xong nhưng chưa gửi lại nhóm."
      what="hàng chờ duyệt"
      query={query}
    >
      {(orders) => {
        const waiting = toCustomerOrders(orders).filter((order) => order.stage === 'cho_duyet');
        if (waiting.length === 0) {
          return (
            <EmptyState
              title="Không còn gì chờ duyệt"
              detail="Mọi phản hồi đã được xử lý. Việc mới sẽ tự xuất hiện tại đây."
            />
          );
        }
        return (
          <>
            <p className="b2b-headline">{waiting.length} phản hồi đang chờ người kiểm tra.</p>
            <OrderList orders={waiting} />
            <p className="b2b-note">
              Thao tác duyệt và gửi được mở ở bản kế tiếp của màn hình bán hàng.
            </p>
          </>
        );
      }}
    </StreamPanel>
  );
}

export function OrdersView() {
  const query = useMessageStream();
  return (
    <StreamPanel
      title="Đơn hàng"
      description="Tin đã được hiểu là đơn đặt hàng, kèm trạng thái hiện tại."
      what="danh sách đơn hàng"
      query={query}
    >
      {(orders) => {
        const salesOrders = toCustomerOrders(orders).filter(
          (order) => order.intent === 'dat_don',
        );
        if (salesOrders.length === 0) {
          return (
            <EmptyState
              title="Chưa có đơn hàng nào"
              detail="Đơn được ghi nhận ngay khi đại lý chốt trong nhóm."
            />
          );
        }
        const awaitingEntry = salesOrders.filter((order) => order.stage === 'cho_nhap_don').length;
        return (
          <>
            <p className="b2b-headline">
              {salesOrders.length} đơn đã ghi nhận
              {awaitingEntry > 0 ? ` · ${awaitingEntry} đơn chờ nhập vào phần mềm bán hàng` : ''}.
            </p>
            <OrderList orders={salesOrders} />
          </>
        );
      }}
    </StreamPanel>
  );
}
