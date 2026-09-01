'use client';

import { MasterDetail, PickListItem } from '../components/MasterDetail';
import { OrderDetailPanel } from '../components/OrderDetailPanel';
import { EmptyState, ErrorState, LoadingState, Panel } from '../components/SectionState';
import { useOrderActions } from '../hooks/useOrderActions';
import {
  toAutoConfirmThreshold,
  useMessageStream,
  useOperationalSummary,
} from '../hooks/useWorkspaceData';
import { buildSectionUrl } from '../navigation';
import { toApprovalQueue, type ApprovalItem } from '../workspace/approvals';
import { resolveOrderSelection } from '../workspace/orders';

/**
 * DUYET & GUI — tinh nang chiu luc cua U-UI1 (Issue #110).
 *
 * Trinh tu tren man hinh co y giong trinh tu trong dau nguoi duyet:
 *
 *   he thong dinh gui GI  ->  VI SAO can toi minh  ->  don gom nhung gi  ->  hai cai nut
 *
 * Nut nam CUOI CUNG, khong nam dau. Mot man hinh dat nut ngay canh tieu de la mot man hinh moi
 * nguoi dung bam truoc khi doc — va viec doc chinh la ly do buoc nay ton tai.
 */

export interface ApprovalsViewProps {
  readonly selection: string | null;
  readonly onSelect: (reference: string | null) => void;
}

export function ApprovalsView({ selection, onSelect }: ApprovalsViewProps) {
  const query = useMessageStream();
  // Nguong tu dong gui la mot LOI GIAI THICH, khong phai mot dieu kien: hang cho van hien day du
  // khi khong doc duoc cau hinh, chi la ly do se noi chung chung hon. Nen o day khong cho.
  const summary = useOperationalSummary();
  const actions = useOrderActions();

  return (
    <Panel
      title="Chờ người kiểm tra"
      description="Phản hồi đã soạn xong nhưng chưa gửi lại nhóm."
    >
      {query.isPending ? <LoadingState what="hàng chờ duyệt" /> : null}
      {query.isError ? <ErrorState what="hàng chờ duyệt" /> : null}
      {query.isSuccess ? (
        <ApprovalQueue
          items={toApprovalQueue(query.data, {
            maxAutoConfirmQuantity: toAutoConfirmThreshold(summary.data),
          })}
          selection={selection}
          onSelect={onSelect}
          actions={actions}
        />
      ) : null}
    </Panel>
  );
}

function ApprovalQueue({
  items,
  selection,
  onSelect,
  actions,
}: {
  items: readonly ApprovalItem[];
  selection: string | null;
  onSelect: (reference: string | null) => void;
  actions: ReturnType<typeof useOrderActions>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Không còn gì chờ duyệt"
        detail="Mọi phản hồi đã được xử lý. Việc mới sẽ tự xuất hiện tại đây."
      />
    );
  }

  const active =
    resolveOrderSelection(
      items.map((item) => item.order),
      selection,
    ) ?? items[0]!.reference;
  const item = items.find((entry) => entry.reference === active) ?? items[0]!;

  return (
    <>
      <p className="b2b-headline">{items.length} phản hồi đang chờ người kiểm tra.</p>
      <MasterDetail
        listLabel="Danh sách chờ duyệt"
        detail={<ApprovalDetail item={item} actions={actions} />}
      >
        {items.map((entry) => (
          <PickListItem
            key={entry.reference}
            selected={entry.reference === item.reference}
            href={buildSectionUrl('approvals', entry.reference)}
            onSelect={() => onSelect(entry.reference)}
          >
            <span className="b2b-pick__title">
              {entry.order.dealerName ?? entry.order.groupName ?? 'Chưa xác định đại lý'}
            </span>
            <span className="b2b-pick__meta">{entry.intentLabel}</span>
            <span className="b2b-pick__excerpt">{entry.order.excerpt}</span>
          </PickListItem>
        ))}
      </MasterDetail>
    </>
  );
}

function ApprovalDetail({
  item,
  actions,
}: {
  item: ApprovalItem;
  actions: ReturnType<typeof useOrderActions>;
}) {
  const failure = actions.failure(item.reference);
  const pending = actions.pendingKind(item.reference);

  return (
    <>
      <section className="b2b-proposal" aria-label="Hệ thống đề xuất">
        <h3 className="b2b-proposal__title">{item.proposal.title}</h3>
        {item.proposal.text ? (
          <p className="b2b-proposal__text">{item.proposal.text}</p>
        ) : (
          <p className="b2b-proposal__empty">
            Chưa có nội dung soạn sẵn cho tin này. Cần người soạn và gửi thủ công trong nhóm.
          </p>
        )}
      </section>

      <section className="b2b-reasons" aria-label="Vì sao cần người xử lý">
        <h3 className="b2b-reasons__title">Vì sao cần bạn xem</h3>
        <ul className="b2b-reasons__list">
          {item.reasons.map((reason) => (
            <li key={`${reason.code}-${reason.text}`} data-reason={reason.code}>
              {reason.text}
            </li>
          ))}
        </ul>
      </section>

      <OrderDetailPanel
        order={item.order}
        actions={
          <>
            {failure ? (
              <p className="b2b-actionerror" role="alert">
                {failure}
                <button
                  type="button"
                  className="b2b-actionerror__close"
                  onClick={() => actions.dismissFailure(item.reference)}
                >
                  Ẩn thông báo
                </button>
              </p>
            ) : null}
            <div className="b2b-actionrow">
              <button
                type="button"
                className="b2b-btn b2b-btn--go"
                disabled={actions.isRunning || item.proposal.text === null}
                aria-busy={pending === 'approve' || undefined}
                onClick={() => actions.run(item.reference, 'approve')}
              >
                {pending === 'approve' ? 'Đang gửi…' : 'Duyệt & gửi'}
              </button>
              <button
                type="button"
                className="b2b-btn b2b-btn--stop"
                disabled={actions.isRunning}
                aria-busy={pending === 'reject' || undefined}
                onClick={() => actions.run(item.reference, 'reject')}
              >
                {pending === 'reject' ? 'Đang huỷ…' : 'Từ chối'}
              </button>
            </div>
            <p className="b2b-actionnote">
              Duyệt là gửi thẳng nội dung ở trên vào nhóm. Từ chối sẽ huỷ đơn và không gửi gì.
            </p>
          </>
        }
      />
    </>
  );
}
