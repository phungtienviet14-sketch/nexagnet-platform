'use client';

import { ROLE_LABELS, type AgentRole, type AgentStep } from '@netviet/shared';
import { ROLE_ICON, ROLE_TAG, SOURCE_META } from '../../lib/labels';
import type { StepUiState } from '../../lib/live';

type Props = {
  role: AgentRole;
  state: StepUiState;
  /** Du lieu buoc — chi co khi da "done"/trace tinh; luc "active" (dang goi LLM) chua co. */
  step?: AgentStep;
};

const STATUS_TEXT: Record<StepUiState, { text: string; cls: string }> = {
  idle: { text: 'chờ…', cls: 'st-idle' },
  active: { text: '⏳ đang xử lý', cls: 'st-active' },
  done: { text: '✓ xong', cls: 'st-done' },
  skipped: { text: '— không tham gia', cls: 'st-skipped' },
  flagged: { text: '⚠ theo dõi', cls: 'st-flagged' },
  handoff: { text: '⚑ chuyển người thật', cls: 'st-handoff' },
};

export function AgentStepCard({ role, state, step }: Props) {
  const status = STATUS_TEXT[state];
  const detailStates = state === 'done' || state === 'flagged' || state === 'handoff';
  const showDetail = detailStates && !!step;
  const src = step ? SOURCE_META[step.source] : null;

  return (
    <li className="agent" data-state={state}>
      <span className="agent-ic" aria-hidden>
        {ROLE_ICON[role]}
      </span>
      <div>
        <div className="agent-head">
          <span className="agent-name">{ROLE_LABELS[role]}</span>
          <span className="agent-role-tag">{ROLE_TAG[role]}</span>
          <span className={`agent-status ${status.cls}`}>{status.text}</span>
        </div>

        {state === 'skipped' && (
          <div className="agent-hidden-note">Tin này không cần vai {ROLE_LABELS[role]}.</div>
        )}

        {showDetail && step && (
          <>
            <div className="agent-action">{step.action}</div>
            {step.notes.length > 0 && (
              <ul className="agent-notes">
                {step.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            <div className="agent-badges">
              {src?.label && <span className={`src ${src.cls}`}>{src.label}</span>}
              {step.usedLlm && <span className="src src-llm">LLM · 1 lần</span>}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
