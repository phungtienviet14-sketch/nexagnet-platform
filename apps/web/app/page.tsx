'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Composer } from '../components/Composer';
import { OrderCard } from '../components/OrderCard';
import { api } from '../lib/api';

export default function HomePage() {
  const qc = useQueryClient();
  const feedQ = useQuery({ queryKey: ['messages'], queryFn: api.messages, refetchInterval: 2500 });
  const samplesQ = useQuery({ queryKey: ['samples'], queryFn: api.samples });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['messages'] });
  };
  const simulateM = useMutation({ mutationFn: api.simulate, onSuccess: invalidate });
  const approveM = useMutation({ mutationFn: api.approve, onSuccess: invalidate });
  const rejectM = useMutation({ mutationFn: api.reject, onSuccess: invalidate });

  const items = feedQ.data ?? [];
  const orders = items.filter((o) => o.intent === 'dat_don');
  const pending = orders.filter(
    (o) => o.status === 'pending_review' || o.status === 'needs_edit',
  ).length;
  const sent = orders.filter((o) => o.status === 'synced').length;
  const isBusy = approveM.isPending || rejectM.isPending;
  const actionError = approveM.error ?? rejectM.error ?? simulateM.error;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Ultty AI</h1>
          <span className="tag">Trợ lý đơn hàng</span>
        </div>
        <div className="counters">
          <div className="counter">
            <b>{orders.length}</b>
            <span>Đơn</span>
          </div>
          <div className="counter">
            <b>{pending}</b>
            <span>Chờ duyệt</span>
          </div>
          <div className="counter">
            <b>{sent}</b>
            <span>Đã gửi</span>
          </div>
        </div>
      </header>

      <Composer
        onSend={(t) => simulateM.mutate(t)}
        samples={samplesQ.data ?? []}
        isSending={simulateM.isPending}
      />

      {actionError && (
        <div className="error-banner" role="alert">
          ⚠ {actionError.message}
        </div>
      )}

      <div className="section-title">Đơn &amp; tin nhắn</div>
      <div className="feed">
        {items.length === 0 && (
          <div className="empty">
            Chưa có tin. Gửi thử một tin ở trên, hoặc bật bot đọc từ nhóm Zalo (BOT_MODE=on).
          </div>
        )}
        {items.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            isBusy={isBusy}
            onApprove={(id) => approveM.mutate(id)}
            onReject={(id) => rejectM.mutate(id)}
          />
        ))}
      </div>
    </main>
  );
}
