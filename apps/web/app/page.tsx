'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderView } from '@netviet/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentTheater } from '../components/console/AgentTheater';
import { BroadcastPanel } from '../components/console/BroadcastPanel';
import { FeedColumn } from '../components/console/FeedColumn';
import { SourceColumn } from '../components/console/SourceColumn';
import { TopBar, type ConsoleView } from '../components/console/TopBar';
import { useAgentStream } from '../hooks/useAgentStream';
import { api } from '../lib/api';
import { buildFeedItems, deriveReveal } from '../lib/live';
import { requiresSalesAction } from '../lib/sales-work';

const EMPTY_ORDERS: OrderView[] = [];

export default function HomePage() {
  const qc = useQueryClient();
  const configQ = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 300_000 });
  const streaming = configQ.data?.streamMode === 'on';

  const [view, setView] = useState<ConsoleView>('console');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Streaming: SSE -> tien do live (runs) + tu chon don moi tao (order.created).
  const { runs, connected } = useAgentStream(streaming, setSelectedId);

  // Luoi an toan: SSE roi (connected=false) -> quay ve polling; noi lai thi ngung.
  const messagesQ = useQuery({
    queryKey: ['messages'],
    queryFn: api.messages,
    refetchInterval: streaming && connected ? false : 2500,
  });
  const orders = messagesQ.data ?? EMPTY_ORDERS;

  // Tu chon: lan dau chon don moi nhat (tinh); che do POLLING tu chon tin moi.
  // Streaming da lo qua onCreated nen KHONG re-select o day (tranh double).
  const seenRef = useRef<Set<string>>(new Set());
  const initedRef = useRef(false);
  useEffect(() => {
    if (!messagesQ.isSuccess) return;
    const newest = orders[0];
    const firstLoad = !initedRef.current;
    initedRef.current = true;
    const isNew = Boolean(newest && !seenRef.current.has(newest.id));
    orders.forEach((o) => seenRef.current.add(o.id));
    if (!newest) return;
    if (firstLoad) {
      setSelectedId((cur) => cur ?? newest.id);
      return;
    }
    if (!streaming && isNew) setSelectedId(newest.id);
    // Deps: messagesQ.data (ref on dinh) + isSuccess + streaming — khong dua `orders` (derive).
  }, [messagesQ.data, messagesQ.isSuccess, streaming]);

  const items = useMemo(() => buildFeedItems(orders, runs), [orders, runs]);
  const selectedItem = items.find((it) => it.id === selectedId);
  const reveal = deriveReveal(selectedItem, selectedId ? runs.get(selectedId) : undefined);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['messages'] });
  };
  const approveM = useMutation({ mutationFn: api.approve, onSuccess: invalidate });
  const completeHandoffM = useMutation({
    mutationFn: api.completeSalesHandoff,
    onSuccess: invalidate,
  });
  const rejectM = useMutation({ mutationFn: api.reject, onSuccess: invalidate });
  const rerunM = useMutation({ mutationFn: api.rerun, onSuccess: invalidate });
  const autoSendM = useMutation({
    mutationFn: api.setAutoSend,
    onSuccess: (state) => {
      qc.setQueryData(['config'], (current: typeof configQ.data) =>
        current ? { ...current, autoSend: state.autoSend } : current,
      );
    },
  });
  const isBusy = approveM.isPending || completeHandoffM.isPending || rejectM.isPending;
  const actionError =
    approveM.error ?? completeHandoffM.error ?? rejectM.error ?? rerunM.error ?? autoSendM.error;

  // Doi don dang chon -> xoa loi hanh dong cu (tranh banner loi treo qua don khac).
  useEffect(() => {
    approveM.reset();
    completeHandoffM.reset();
    rejectM.reset();
    rerunM.reset();
    // Chi chay khi doi selectedId.
  }, [selectedId]);

  const handleRerun = (id: string) => {
    setSelectedId(id);
    rerunM.mutate(id);
  };

  const handleAutoSendChange = (enabled: boolean) => {
    if (
      enabled &&
      !window.confirm(
        'Bật kill switch Tự gửi? Hệ thống chỉ gửi đơn đủ dữ liệu trong ngưỡng policy tenant, sau đó giao việc Sale nhập ERP thủ công.',
      )
    ) {
      return;
    }
    autoSendM.mutate(enabled);
  };

  const orderCount = items.filter((i) => i.intent === 'dat_don').length;
  const pendingCount = items.filter(
    (item) => item.order && item.intent === 'dat_don' && requiresSalesAction(item.order),
  ).length;
  const groupCount = new Set(items.map((i) => i.chatId)).size;

  return (
    <div className="shell">
      <TopBar
        orderCount={orderCount}
        pendingCount={pendingCount}
        groupCount={groupCount}
        config={configQ.data}
        view={view}
        onViewChange={setView}
        streaming={streaming}
        connected={connected}
        autoSendPending={autoSendM.isPending}
        onAutoSendChange={handleAutoSendChange}
      />

      {view === 'broadcast' ? (
        <div className="col theater">
          <BroadcastPanel />
        </div>
      ) : (
        <div className="grid">
          <FeedColumn items={items} selectedId={selectedId} onSelect={setSelectedId} />
          <main className="col theater" aria-label="Luồng xử lý 6 agent">
            {actionError && (
              <div className="error-banner" role="alert">
                ⚠ {actionError.message}
              </div>
            )}
            <AgentTheater
              item={selectedItem}
              reveal={reveal}
              isBusy={isBusy}
              onRerun={handleRerun}
              onApprove={(id) => approveM.mutate(id)}
              onReject={(id) => rejectM.mutate(id)}
              onCompleteSalesHandoff={(id) => completeHandoffM.mutate(id)}
            />
          </main>
          <SourceColumn order={selectedItem?.order} />
        </div>
      )}
    </div>
  );
}
