'use client';

import type { AgentStep } from '@ultty/shared';
import { ROLE_ICON, ROLE_TAG, SOURCE_META } from '../../lib/labels';
import type { StepUiState } from '../../hooks/useAgentReveal';

type Props = {
  step: AgentStep;
  state: StepUiState;
};

const STATUS_TEXT: Record<StepUiState, { text: string; cls: string }> = {
  idle: { text: 'chờ…', cls: 'st-idle' },
  active: { text: '⏳ đang xử lý', cls: 'st-active' },
  done: { text: '✓ xong', cls: 'st-done' },
  skipped: { text: '— không tham gia', cls: 'st-skipped' },
  flagged: { text: '⚠ theo dõi', cls: 'st-flagged' },
  handoff: { text: '⚑ chuyển người thật', cls: 'st-handoff' },
};

export function AgentStepCard({ step, state }: Props) {
  const status = STATUS_TEXT[state];
  const src = SOURCE_META[step.source];
  const showDetail =
    state === 'active' || state === 'done' || state === 'flagged' || state === 'handoff';

  return (
    <li className="agent" data-state={state}>
      <span className="agent-ic" aria-hidden>
        {ROLE_ICON[step.role]}
      </span>
      <div>
        <div className="agent-head">
          <span className="agent-name">{step.label}</span>
          <span className="agent-role-tag">{ROLE_TAG[step.role]}</span>
          <span className={`agent-status ${status.cls}`}>{status.text}</span>
        </div>

        {state === 'skipped' && (
          <div className="agent-hidden-note">Tin này không cần vai {step.label}.</div>
        )}

        {showDetail && (
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
              {src.label && <span className={`src ${src.cls}`}>{src.label}</span>}
              {step.usedLlm && <span className="src src-llm">LLM · 1 lần</span>}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
