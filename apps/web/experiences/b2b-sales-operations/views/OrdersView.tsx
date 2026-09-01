'use client';

import type { OrderView } from '@netviet/shared';
import { useId, useState } from 'react';
import { MasterDetail, PickListItem } from '../components/MasterDetail';
import { OrderDetailPanel } from '../components/OrderDetailPanel';
import { EmptyState, ErrorState, LoadingState, Panel } from '../components/SectionState';
import { useOrderActions } from '../hooks/useOrderActions';
import { useMessageStream } from '../hooks/useWorkspaceData';
import { buildSectionUrl } from '../navigation';
import { CUSTOMER_STAGE_LABEL } from '../customer-view';
import type { CustomerOrderDetail } from '../workspace/order-detail';
import {
  DEFAULT_ORDER_FILTER,
  ORDER_STAGE_FILTERS,
  filterOrderBook,
  orderBookHeadline,
  resolveOrderSelection,
  toOrderBook,
  type OrderFilter,
  type OrderStageFilter,
} from '../workspace/orders';

/**
 * DON HANG — so don doc duoc, tim duoc, mo ra xem duoc (Issue #110 §Đơn hàng).
 *
 * Thao tac DUY NHAT o muc nay la danh dau "đã nhập vào phần mềm bán hàng". Do la mot lua chon co
 * chu dich: muc nay la SO SACH, khong phai hang cho. Viec quyet dinh gui hay khong gui thuoc muc
 * Duyệt & gửi va chi o do — dat hai cai nut do o hai cho se lam mot don co the bi gui tu mot man
 * hinh ma nguoi bam khong nhin thay ban xac nhan.
 */

export interface OrdersViewProps {
  readonly selection: string | null;
  readonly onSelect: (reference: string | null) => void;
}

export function OrdersView({ selection, onSelect }: OrdersViewProps) {
  const query = useMessageStream();
  const [filter, setFilter] = useState<OrderFilter>(DEFAULT_ORDER_FILTER);
  const actions = useOrderActions();

  return (
    <Panel
      title="Đơn hàng"
      description="Tin đã được hiểu là đơn đặt hàng, kèm trạng thái hiện tại."
    >
      {query.isPending ? <LoadingState what="danh sách đơn hàng" /> : null}
      {query.isError ? <ErrorState what="danh sách đơn hàng" /> : null}
      {query.isSuccess ? (
        <OrderBook
          orders={query.data}
          filter={filter}
          onFilter={setFilter}
          selection={selection}
          onSelect={onSelect}
          actions={actions}
        />
      ) : null}
    </Panel>
  );
}

function OrderBook({
  orders,
  filter,
  onFilter,
  selection,
  onSelect,
  actions,
}: {
  orders: readonly OrderView[];
  filter: OrderFilter;
  onFilter: (next: OrderFilter) => void;
  selection: string | null;
  onSelect: (reference: string | null) => void;
  actions: ReturnType<typeof useOrderActions>;
}) {
  const searchId = useId();
  const book = toOrderBook(orders);
  if (book.length === 0) {
    return (
      <EmptyState
        title="Chưa có đơn hàng nào"
        detail="Đơn được ghi nhận ngay khi đại lý chốt trong nhóm."
      />
    );
  }

  const visible = filterOrderBook(book, filter);
  const active = resolveOrderSelection(visible, selection);
  const order = visible.find((entry) => entry.reference === active) ?? null;

  return (
    <>
      <p className="b2b-headline">{orderBookHeadline(visible, book.length)}</p>
      <MasterDetail
        listLabel="Danh sách đơn hàng"
        listHead={
          <OrderFilters filter={filter} onFilter={onFilter} searchId={searchId} />
        }
        detail={
          order ? (
            <OrderDetailPanel
              order={order}
              actions={<HandoffAction order={order} actions={actions} />}
            />
          ) : (
            <EmptyState
              title="Không có đơn nào khớp bộ lọc"
              detail="Thử bỏ bớt điều kiện lọc hoặc xoá từ khoá đang tìm."
            />
          )
        }
      >
        {visible.map((entry) => (
          <PickListItem
            key={entry.reference}
            selected={entry.reference === active}
            href={buildSectionUrl('orders', entry.reference)}
            onSelect={() => onSelect(entry.reference)}
          >
            <span className="b2b-pick__title">
              {entry.dealerName ?? entry.groupName ?? 'Chưa xác định đại lý'}
            </span>
            <span className="b2b-pick__meta">
              <span className={`b2b-pill b2b-pill--${entry.stage}`}>
                {CUSTOMER_STAGE_LABEL[entry.stage]}
              </span>
              {entry.attentionNotes.length > 0 ? (
                <span className="b2b-pill b2b-pill--blocked">Có cảnh báo</span>
              ) : null}
            </span>
            <span className="b2b-pick__excerpt">{entry.excerpt}</span>
          </PickListItem>
        ))}
      </MasterDetail>
    </>
  );
}

function OrderFilters({
  filter,
  onFilter,
  searchId,
}: {
  filter: OrderFilter;
  onFilter: (next: OrderFilter) => void;
  searchId: string;
}) {
  return (
    <div className="b2b-filters">
      <label className="b2b-search" htmlFor={searchId}>
        <span className="b2b-search__label">Tìm đơn</span>
        <input
          id={searchId}
          type="search"
          className="b2b-search__input"
          placeholder="Tên nhóm, đại lý hoặc sản phẩm"
          value={filter.search}
          onChange={(event) => onFilter({ ...filter, search: event.target.value })}
        />
      </label>
      <div className="b2b-chips" role="group" aria-label="Lọc theo trạng thái">
        {ORDER_STAGE_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="b2b-chip"
            aria-pressed={filter.stage === option.value}
            onClick={() => onFilter({ ...filter, stage: option.value as OrderStageFilter })}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Danh dau MOT don da duoc go vao phan mem ban hang.
 *
 * Nut nay chi hien khi don DANG o dung trang thai do. An mot nut khong bam duoc di, thay vi hien
 * no ra roi bao loi khi bam, la cach trung thuc hon — va no khop voi cong that o phia may chu:
 * `completeSalesHandoff` nem 422 khi don khong o `sent` + `salesHandoff.pending`.
 */
function HandoffAction({
  order,
  actions,
}: {
  order: CustomerOrderDetail;
  actions: ReturnType<typeof useOrderActions>;
}) {
  const failure = actions.failure(order.reference);
  const pending = actions.pendingKind(order.reference);
  if (order.stage !== 'cho_nhap_don') {
    return failure ? <ActionError message={failure} onDismiss={() => actions.dismissFailure(order.reference)} /> : null;
  }

  return (
    <>
      {failure ? (
        <ActionError message={failure} onDismiss={() => actions.dismissFailure(order.reference)} />
      ) : null}
      <div className="b2b-actionrow">
        <button
          type="button"
          className="b2b-btn b2b-btn--go"
          disabled={actions.isRunning}
          aria-busy={pending === 'complete-handoff' || undefined}
          onClick={() => actions.run(order.reference, 'complete-handoff')}
        >
          {pending === 'complete-handoff' ? 'Đang ghi nhận…' : 'Đã nhập vào phần mềm bán hàng'}
        </button>
      </div>
      <p className="b2b-actionnote">
        Đánh dấu để đơn này rời khỏi hàng việc. Thao tác không gửi thêm tin nào vào nhóm.
      </p>
    </>
  );
}

function ActionError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <p className="b2b-actionerror" role="alert">
      {message}
      <button type="button" className="b2b-actionerror__close" onClick={onDismiss}>
        Ẩn thông báo
      </button>
    </p>
  );
}
