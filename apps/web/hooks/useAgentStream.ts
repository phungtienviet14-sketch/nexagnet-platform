'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { AgentStreamEvent, OrderView } from '@netviet/shared';
import { useEffect, useRef, useState } from 'react';
import { EVENTS_URL } from '../lib/api';
import { idleByRole, stepUiState, type RunState } from '../lib/live';

/**
 * Nhan su kien 6 agent qua SSE /events (real-time). Day don da chot vao cache
 * react-query (['messages']) + giu tien do LIVE cho don DANG xu ly (map runs).
 * Khong subscriber -> no-op. Che do polling (streaming=false) khong dung hook nay.
 */

function upsert(prev: OrderView[] | undefined, order: OrderView): OrderView[] {
  const list = prev ?? [];
  const idx = list.findIndex((o) => o.id === order.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = order;
    return next;
  }
  return [order, ...list];
}

export interface AgentStreamResult {
  runs: Map<string, RunState>;
  connected: boolean;
}

/** Don run "ket" (mat order.finalized do disconnect/loi) sau bao lau -> tu xoa. */
const RUN_STALE_MS = 15_000;
const SWEEP_INTERVAL_MS = 4_000;

export function useAgentStream(
  enabled: boolean,
  onCreated?: (id: string) => void,
): AgentStreamResult {
  const qc = useQueryClient();
  const [runs, setRuns] = useState<Map<string, RunState>>(() => new Map());
  const [connected, setConnected] = useState(false);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    if (!enabled) {
      setRuns(new Map());
      setConnected(false);
      return;
    }
    let opened = false;
    const es = new EventSource(EVENTS_URL, { withCredentials: true });

    es.onopen = () => {
      setConnected(true);
      if (opened) void qc.invalidateQueries({ queryKey: ['messages'] }); // resync sau reconnect
      opened = true;
    };
    es.onerror = () => setConnected(false); // EventSource tu reconnect; polling la luoi (page.tsx)

    const handle = (e: AgentStreamEvent): void => {
      if (e.type === 'order.created') {
        setRuns((prev) => {
          const next = new Map(prev);
          next.set(e.order.orderId, {
            placeholder: e.order,
            byRole: idleByRole(),
            updatedAt: Date.now(),
          });
          return next;
        });
        onCreatedRef.current?.(e.order.orderId);
      } else if (e.type === 'agent.progress') {
        setRuns((prev) => {
          const run = prev.get(e.orderId);
          if (!run) return prev;
          const next = new Map(prev);
          const byRole = { ...run.byRole };
          byRole[e.role] =
            e.phase === 'active' ? { state: 'active' } : { state: stepUiState(e.step), step: e.step };
          next.set(e.orderId, { ...run, byRole, updatedAt: Date.now() });
          return next;
        });
      } else if (e.type === 'order.finalized') {
        qc.setQueryData<OrderView[]>(['messages'], (prev) => upsert(prev, e.order));
        void qc.invalidateQueries({ queryKey: ['erp'] });
        setRuns((prev) => {
          if (!prev.has(e.order.id)) return prev;
          const next = new Map(prev);
          next.delete(e.order.id);
          return next;
        });
      } else if (e.type === 'order.updated') {
        qc.setQueryData<OrderView[]>(['messages'], (prev) => upsert(prev, e.order));
        void qc.invalidateQueries({ queryKey: ['erp'] });
      }
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const e = JSON.parse(ev.data) as AgentStreamEvent;
        if (e && typeof e.type === 'string') handle(e);
      } catch {
        // Bo qua su kien hong (loi JSON hoac cau truc la) — khong lam vo stream.
      }
    };

    // Quet don run "ket": mat order.finalized (disconnect/loi parser) -> tu xoa de
    // khoi bi ket "dang xu ly" mai; UI se roi ve trang thai tinh tu cache.
    const sweep = setInterval(() => {
      setRuns((prev) => {
        const cutoff = Date.now() - RUN_STALE_MS;
        let changed = false;
        const next = new Map<string, RunState>();
        for (const [id, run] of prev) {
          if (run.updatedAt < cutoff) changed = true;
          else next.set(id, run);
        }
        return changed ? next : prev;
      });
    }, SWEEP_INTERVAL_MS);

    return () => {
      es.close();
      clearInterval(sweep);
    };
  }, [enabled, qc]);

  return { runs, connected };
}
