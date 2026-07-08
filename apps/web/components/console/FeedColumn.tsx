'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderView } from '@ultty/shared';
import { api } from '../../lib/api';
import { Composer } from './Composer';
import { FeedRow } from './FeedRow';

type Props = {
  orders: OrderView[];
  selectedId: string | null;
  liveId: string | null;
  onSelect: (id: string) => void;
};

export function FeedColumn({ orders, selectedId, liveId, onSelect }: Props) {
  const qc = useQueryClient();
  const samplesQ = useQuery({ queryKey: ['samples'], queryFn: api.samples });
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: api.groups });

  const simulateM = useMutation({
    mutationFn: api.simulate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messages'] });
      void qc.invalidateQueries({ queryKey: ['kiotviet'] });
    },
  });

  return (
    <aside className="col feed" aria-label="Tin & đơn vào">
      <p className="col-label">Tin &amp; đơn vào · realtime</p>

      <Composer
        onSend={(input) => simulateM.mutate(input)}
        samples={samplesQ.data ?? []}
        groups={groupsQ.data ?? []}
        isSending={simulateM.isPending}
      />

      {simulateM.error && (
        <div className="error-banner" role="alert">
          ⚠ {simulateM.error.message}
        </div>
      )}

      <div className="feed-list">
        {orders.length === 0 && <div className="empty">Chưa có tin.</div>}
        {orders.map((o) => (
          <FeedRow
            key={o.id}
            order={o}
            active={o.id === selectedId}
            live={o.id === liveId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}
