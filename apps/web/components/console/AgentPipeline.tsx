'use client';

import { AGENT_ROLES, ROLE_LABELS } from '@ultty/shared';
import { Fragment } from 'react';
import { ROLE_ICON } from '../../lib/labels';
import type { StepUiState } from '../../hooks/useAgentReveal';

type Props = {
  stateByRole: Record<string, StepUiState>;
};

/** Dai bang 6 node sang len tuan tu — tom tat luong 6 vai (🧭→…→🛡). */
export function AgentPipeline({ stateByRole }: Props) {
  return (
    <div className="pipe-strip" aria-hidden>
      {AGENT_ROLES.map((role, i) => (
        <Fragment key={role}>
          <div className="pipe-node" data-state={stateByRole[role] ?? 'idle'}>
            <div className="pipe-ic" data-state={stateByRole[role] ?? 'idle'}>
              {ROLE_ICON[role]}
            </div>
            <span className="pl">{ROLE_LABELS[role]}</span>
          </div>
          {i < AGENT_ROLES.length - 1 && <span className="pipe-arrow">→</span>}
        </Fragment>
      ))}
    </div>
  );
}
