'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Composer } from './Composer';
import { OrderCard } from './OrderCard';
import { api } from '../lib/api';

export function OrdersTab() {
  const qc = useQueryClient();
  const feedQ = useQuery({ queryKey: ['messages'], queryFn: api.messages, refetchInterval: 2500 });
  const samplesQ = useQuery({ queryKey: ['samples'], queryFn: api.samples });
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: api.groups });

  const [filterChatId, setFilterChatId] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['messages'] });
    void qc.invalidateQueries({ queryKey: ['kiotviet'] });
  };
  const simulateM = useMutation({ mutationFn: api.simulate, onSuccess: invalidate });
  const approveM = useMutation({ mutationFn: api.approve, onSuccess: invalidate });
  const rejectM = useMutation({ mutationFn: api.reject, onSuccess: invalidate });

  const groups = groupsQ.data ?? [];
  const items = feedQ.data ?? [];
  const visible = filterChatId ? items.filter((o) => o.chatId === filterChatId) : items;
  const orders = items.filter((o) => o.intent === 'dat_don');
  const pending = orders.filter(
    (o) => o.status === 'pending_review' || o.status === 'needs_edit',
  ).length;
  const activeGroups = new Set(items.map((o) => o.chatId)).size;
  const isBusy = approveM.isPending || rejectM.isPending;
  const actionError = approveM.error ?? rejectM.error ?? simulateM.error;

  return (
    <>
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
          <b>{activeGroups}</b>
          <span>Nhóm</span>
        </div>
      </div>

      <Composer
        onSend={(input) => simulateM.mutate(input)}
        samples={samplesQ.data ?? []}
        groups={groups}
        isSending={simulateM.isPending}
      />

      {actionError && (
        <div className="error-banner" role="alert">
          ⚠ {actionError.message}
        </div>
      )}

      {groups.length > 1 && (
        <div className="group-filter">
          <button
            type="button"
            className={`chip ${filterChatId === '' ? 'chip-active' : ''}`}
            onClick={() => setFilterChatId('')}
          >
            Tất cả
          </button>
          {groups.map((g) => (
            <button
              type="button"
              key={g.chatId}
              className={`chip ${filterChatId === g.chatId ? 'chip-active' : ''}`}
              onClick={() => setFilterChatId(g.chatId)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <div className="section-title">Đơn &amp; tin nhắn</div>
      <div className="feed">
        {visible.length === 0 && (
          <div className="empty">
            Chưa có tin. Gửi thử một tin ở trên, hoặc bật bot đọc từ nhóm Zalo (BOT_MODE=on).
          </div>
        )}
        {visible.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            isBusy={isBusy}
            onApprove={(id) => approveM.mutate(id)}
            onReject={(id) => rejectM.mutate(id)}
          />
        ))}
      </div>
    </>
  );
}
