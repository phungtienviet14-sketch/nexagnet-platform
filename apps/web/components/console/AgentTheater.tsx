'use client';

import { AGENT_ROLES, SENDER_LABELS, type AgentRole } from '@ultty/shared';
import type { FeedItem, RevealState, StepUiState } from '../../lib/live';
import { AgentPipeline } from './AgentPipeline';
import { AgentStepCard } from './AgentStepCard';
import { OrderDetailPanel } from './OrderDetailPanel';

type Props = {
  item?: FeedItem;
  reveal: RevealState;
  isBusy: boolean;
  onRerun: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

export function AgentTheater({ item, reveal, isBusy, onRerun, onApprove, onReject }: Props) {
  if (!item) {
    return (
      <div className="empty">
        Chọn một tin ở cột trái, hoặc bơm thử một tin để xem đội 6 agent xử lý.
      </div>
    );
  }

  const sender = item.senderType ?? 'unknown';
  const stateByRole = Object.fromEntries(
    AGENT_ROLES.map((r) => [r, reveal.byRole[r].state]),
  ) as Record<AgentRole, StepUiState>;
  const llmText = item.order?.trace
    ? `${item.order.trace.llmCalls} lần gọi AI`
    : item.processing
      ? 'đang gọi AI…'
      : '—';
  // Don da dong bo/gui KiotViet -> khong chay lai (backend cung chan, giu idempotent).
  const isFinalized = item.order?.status === 'synced' || item.order?.status === 'sent';
  const canRerun = !item.processing && !isFinalized;

  return (
    <>
      <div className="input-card">
        <div className="ic-head">
          <span className="ic-who">{item.groupName ?? `Nhóm ${item.chatId.slice(0, 14)}…`}</span>
          <span className="chip chip-sender">{SENDER_LABELS[sender]}</span>
          <span className="ic-src">nguồn: nhóm Zalo (dán tay / bot @mention)</span>
        </div>
        <div className="input-msg mono">{item.rawText}</div>
        {item.imageUrl && <img className="input-img" src={item.imageUrl} alt="Ảnh đơn hàng" />}
      </div>

      <AgentPipeline stateByRole={stateByRole} />

      <p className="theater-sec-label">
        Đội 6 agent phối hợp
        <span className="llm-count">{llmText}</span>
        <span className="sec-note">Rules engine là nơi DUY NHẤT tính tiền</span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: '0.2rem 0.55rem' }}
          disabled={!canRerun}
          title={isFinalized ? 'Đơn đã đồng bộ KiotViet' : undefined}
          onClick={() => onRerun(item.id)}
        >
          {item.processing ? '⏳ đang chạy…' : '▶ Chạy lại (gọi lại AI)'}
        </button>
      </p>

      <ul className="agents">
        {AGENT_ROLES.map((role) => (
          <AgentStepCard
            key={role}
            role={role}
            state={reveal.byRole[role].state}
            step={reveal.byRole[role].step}
          />
        ))}
      </ul>

      {item.order && (
        <div className={`reveal-block ${reveal.revealed ? '' : 'hidden'}`}>
          <OrderDetailPanel order={item.order} isBusy={isBusy} onApprove={onApprove} onReject={onReject} />
        </div>
      )}
    </>
  );
}
