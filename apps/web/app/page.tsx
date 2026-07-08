'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderView } from '@ultty/shared';
import { useEffect, useRef, useState } from 'react';
import { AgentTheater } from '../components/console/AgentTheater';
import { BroadcastPanel } from '../components/console/BroadcastPanel';
import { FeedColumn } from '../components/console/FeedColumn';
import { SourceColumn } from '../components/console/SourceColumn';
import { TopBar, type ConsoleView } from '../components/console/TopBar';
import { useAgentReveal } from '../hooks/useAgentReveal';
import { api } from '../lib/api';

const EMPTY_ORDERS: OrderView[] = [];

export default function HomePage() {
  const qc = useQueryClient();
  const configQ = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 300_000 });
  const messagesQ = useQuery({ queryKey: ['messages'], queryFn: api.messages, refetchInterval: 2500 });

  const orders = messagesQ.data ?? EMPTY_ORDERS;

  const [view, setView] = useState<ConsoleView>('console');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replayNonce, setReplayNonce] = useState(0);
  const [animate, setAnimate] = useState(false);

  const seenRef = useRef<Set<string>>(new Set());
  const initedRef = useRef(false);

  // Phat hien tin MOI -> tu chon + phat hieu ung; lan dau chi seed (khong animate).
  useEffect(() => {
    // Cho query resolve xong lan dau moi khoa "inited" — ke ca kho rong (fresh start)
    // thi tin dau tien den sau van duoc coi la MOI va co hieu ung (bug lanh: don dau
    // cua Man 1 bi mat animation neu API vua restart).
    if (!messagesQ.isSuccess) return;
    const newest = orders[0];
    if (!initedRef.current) {
      initedRef.current = true;
      orders.forEach((o) => seenRef.current.add(o.id));
      if (newest) {
        setSelectedId((cur) => cur ?? newest.id);
        setAnimate(false);
      }
      return;
    }
    if (newest && !seenRef.current.has(newest.id)) {
      orders.forEach((o) => seenRef.current.add(o.id));
      setSelectedId(newest.id);
      setAnimate(true);
      setReplayNonce((n) => n + 1);
    } else {
      orders.forEach((o) => seenRef.current.add(o.id));
    }
    // Phu thuoc messagesQ.data (ref on dinh nho structural-sharing) + isSuccess — khong lap moi render.
  }, [messagesQ.data, messagesQ.isSuccess]);

  const selectedOrder = orders.find((o) => o.id === selectedId);
  const reveal = useAgentReveal(selectedOrder, replayNonce, animate);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['messages'] });
    void qc.invalidateQueries({ queryKey: ['kiotviet'] });
  };
  const approveM = useMutation({ mutationFn: api.approve, onSuccess: invalidate });
  const rejectM = useMutation({ mutationFn: api.reject, onSuccess: invalidate });
  const isBusy = approveM.isPending || rejectM.isPending;
  const actionError = approveM.error ?? rejectM.error;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setAnimate(true);
    setReplayNonce((n) => n + 1);
  };
  const handleReplay = () => {
    setAnimate(true);
    setReplayNonce((n) => n + 1);
  };

  const orderCount = orders.filter((o) => o.intent === 'dat_don').length;
  const pendingCount = orders.filter(
    (o) => o.intent === 'dat_don' && (o.status === 'pending_review' || o.status === 'needs_edit'),
  ).length;
  const groupCount = new Set(orders.map((o) => o.chatId)).size;
  const liveId = !reveal.revealed && selectedId ? selectedId : null;

  return (
    <div className="shell">
      <TopBar
        orderCount={orderCount}
        pendingCount={pendingCount}
        groupCount={groupCount}
        config={configQ.data}
        view={view}
        onViewChange={setView}
      />

      {view === 'broadcast' ? (
        <div className="col theater">
          <BroadcastPanel />
        </div>
      ) : (
        <div className="grid">
          <FeedColumn orders={orders} selectedId={selectedId} liveId={liveId} onSelect={handleSelect} />
          <main className="col theater" aria-label="Luồng xử lý 6 agent">
            {actionError && (
              <div className="error-banner" role="alert">
                ⚠ {actionError.message}
              </div>
            )}
            <AgentTheater
              order={selectedOrder}
              reveal={reveal}
              isBusy={isBusy}
              onReplay={handleReplay}
              onApprove={(id) => approveM.mutate(id)}
              onReject={(id) => rejectM.mutate(id)}
            />
          </main>
          <SourceColumn order={selectedOrder} />
        </div>
      )}
    </div>
  );
}
