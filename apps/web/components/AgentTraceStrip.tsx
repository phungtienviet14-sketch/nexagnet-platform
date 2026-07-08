'use client';

import { SENDER_LABELS, type AgentSource, type AgentStep, type AgentTrace, type SenderType } from '@ultty/shared';

/**
 * Trinh dien "doi 6 agent phoi hop" (multi-agent 6 con). LUON hien du 6 hang:
 * con tham gia noi bat, con khong tham gia lam mo. Badge nguon lam BANG CHUNG
 * nguyen tac bat bien: tien = 'Rules engine', prose = 'AI', tra cuu = 'Kho tri thức'.
 */

const ROLE_ICON: Record<string, string> = {
  router: '🧭',
  product_advisor: '💡',
  sales: '🧾',
  policy_finance: '📋',
  after_sales: '🛠️',
  supervisor: '🛡️',
};

const SOURCE_META: Record<AgentSource, { label: string; cls: string }> = {
  rules: { label: 'Rules engine', cls: 'at-src-rules' },
  knowledge: { label: 'Kho tri thức', cls: 'at-src-knowledge' },
  llm: { label: 'AI', cls: 'at-src-llm' },
  router: { label: 'Điều phối', cls: 'at-src-router' },
  none: { label: '', cls: '' },
};

type Props = {
  trace: AgentTrace;
  senderType?: SenderType;
};

export function AgentTraceStrip({ trace, senderType }: Props) {
  const sender = senderType ?? trace.senderType;

  return (
    <div className="at">
      <div className="at-head">
        <span className="at-title">🤖 Đội 6 agent</span>
        <span className="at-meta">
          {trace.llmCalls} lần gọi AI · {trace.brainMode}
        </span>
        <span className="at-sender">{SENDER_LABELS[sender]}</span>
      </div>

      <ol className="at-steps">
        {trace.steps.map((step) => (
          <AgentRow key={step.role} step={step} />
        ))}
      </ol>

      {trace.supervisor.escalate && (
        <div className="at-handoff">⚑ Chuyển người thật: {trace.supervisor.reasons.join('; ')}</div>
      )}

      {trace.reply && <ReplyBox reply={trace.reply} />}
    </div>
  );
}

function AgentRow({ step }: { step: AgentStep }) {
  const src = SOURCE_META[step.source];
  return (
    <li className={`at-step at-${step.status}`}>
      <span className="at-icon" aria-hidden>
        {ROLE_ICON[step.role]}
      </span>
      <div className="at-body">
        <div className="at-role">
          <span className="at-name">{step.label}</span>
          {src.label && <span className={`at-src ${src.cls}`}>{src.label}</span>}
          {step.usedLlm && <span className="at-llm">LLM</span>}
          {step.handoff && <span className="at-pill">chuyển người thật</span>}
        </div>
        <div className="at-action">{step.action}</div>
        {step.status !== 'skipped' && step.notes.length > 0 && (
          <ul className="at-notes">
            {step.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function ReplyBox({ reply }: { reply: string }) {
  const copy = () => {
    void navigator.clipboard?.writeText(reply);
  };
  return (
    <div className="at-reply">
      <div className="at-reply-head">
        <span>Trả lời đề xuất · Sale copy, không tự gửi</span>
        <button type="button" className="at-copy" onClick={copy}>
          Copy
        </button>
      </div>
      <pre className="at-reply-text">{reply}</pre>
    </div>
  );
}
