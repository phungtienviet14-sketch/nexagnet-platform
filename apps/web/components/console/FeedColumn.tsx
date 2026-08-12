'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { FeedItem } from '../../lib/live';
import { Composer } from './Composer';
import { FeedRow } from './FeedRow';

type Props = {
  items: FeedItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function FeedColumn({ items, selectedId, onSelect }: Props) {
  const qc = useQueryClient();
  const samplesQ = useQuery({ queryKey: ['samples'], queryFn: api.samples });
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: api.groups });

  const simulateM = useMutation({
    mutationFn: api.simulate,
    onSuccess: () => {
      // SSE tu day don vao cache; polling can invalidate. Giu ca 2 cho an toan.
      void qc.invalidateQueries({ queryKey: ['messages'] });
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
        {items.length === 0 && <div className="empty">Chưa có tin.</div>}
        {items.map((it) => (
          <FeedRow key={it.id} item={it} active={it.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </aside>
  );
}
