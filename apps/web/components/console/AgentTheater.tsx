'use client';

import { AGENT_ROLES, SENDER_LABELS, type AgentStep, type OrderView } from '@ultty/shared';
import type { RevealState } from '../../hooks/useAgentReveal';
import { AgentPipeline } from './AgentPipeline';
import { AgentStepCard } from './AgentStepCard';
import { OrderDetailPanel } from './OrderDetailPanel';

type Props = {
  order?: OrderView;
  reveal: RevealState;
  isBusy: boolean;
  onReplay: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

const EMPTY_STEP = (role: AgentStep['role']): AgentStep => ({
  role,
  label: role,
  status: 'skipped',
  action: '—',
  notes: [],
  source: 'none',
  usedLlm: false,
});

export function AgentTheater({ order, reveal, isBusy, onReplay, onApprove, onReject }: Props) {
  if (!order) {
    return (
      <div className="empty">
        Chọn một tin ở cột trái, hoặc bơm thử một tin để xem đội 6 agent xử lý.
      </div>
    );
  }

  const trace = order.trace;
  const sender = order.senderType ?? trace?.senderType ?? 'unknown';
  const stepByRole = new Map<string, AgentStep>((trace?.steps ?? []).map((s) => [s.role, s]));

  return (
    <>
      <div className="input-card">
        <div className="ic-head">
          <span className="ic-who">{order.groupName ?? `Nhóm ${order.chatId.slice(0, 14)}…`}</span>
          <span className="chip chip-sender">{SENDER_LABELS[sender]}</span>
          <span className="ic-src">nguồn: nhóm Zalo (dán tay / bot @mention)</span>
        </div>
        <div className="input-msg mono">{order.rawText}</div>
        {order.imageUrl && <img className="input-img" src={order.imageUrl} alt="Ảnh đơn hàng" />}
      </div>

      <AgentPipeline stateByRole={reveal.stateByRole} />

      <p className="theater-sec-label">
        Đội 6 agent phối hợp
        <span className="llm-count">{trace ? `${trace.llmCalls} lần gọi AI` : '—'}</span>
        <span className="sec-note">Rules engine là nơi DUY NHẤT tính tiền</span>
        <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.55rem' }} onClick={onReplay}>
          ▶ Chạy lại
        </button>
      </p>

      <ul className="agents">
        {AGENT_ROLES.map((role) => (
          <AgentStepCard
            key={role}
            step={stepByRole.get(role) ?? EMPTY_STEP(role)}
            state={reveal.stateByRole[role] ?? 'idle'}
          />
        ))}
      </ul>

      <div className={`reveal-block ${reveal.revealed ? '' : 'hidden'}`}>
        <OrderDetailPanel order={order} isBusy={isBusy} onApprove={onApprove} onReject={onReject} />
      </div>
    </>
  );
}
