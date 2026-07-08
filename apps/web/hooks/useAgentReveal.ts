'use client';

import { AGENT_ROLES, type AgentRole, type OrderView } from '@ultty/shared';
import { useEffect, useRef, useState } from 'react';

/**
 * "Staged reveal" — he lo 6 agent TUAN TU (idle -> dang xu ly -> xong) de nguoi xem
 * thay AI dang xu ly. Dung DUNG data trace that (da hoan tat khi ve); chi paced lai
 * cho de nhin. Neu can stream that sau nay -> nang cap bang SSE (khong doi UI nay).
 *
 * QUAN TRONG: hieu ung chi replay khi order.id HOAC nonce doi — KHONG replay moi lan
 * feed poll (2.5s) du object trace la moi.
 */

export type StepUiState = 'idle' | 'active' | 'done' | 'skipped' | 'flagged' | 'handoff';

const ACTIVE_MS = 640;
const GAP_MS = 220;

const IDLE_STATE = Object.fromEntries(AGENT_ROLES.map((r) => [r, 'idle'])) as Record<
  AgentRole,
  StepUiState
>;

function finalState(order: OrderView, role: AgentRole): StepUiState {
  const step = order.trace?.steps.find((s) => s.role === role);
  if (!step || step.status === 'skipped') return 'skipped';
  if (step.status === 'handoff') return 'handoff';
  if (step.status === 'flagged') return 'flagged';
  return 'done';
}

function allFinal(order: OrderView): Record<AgentRole, StepUiState> {
  const out = {} as Record<AgentRole, StepUiState>;
  for (const role of AGENT_ROLES) out[role] = finalState(order, role);
  return out;
}

export interface RevealState {
  stateByRole: Record<AgentRole, StepUiState>;
  /** true khi da he lo xong -> hien khoi don + nut duyet. */
  revealed: boolean;
}

export function useAgentReveal(
  order: OrderView | undefined,
  nonce: number,
  animate: boolean,
): RevealState {
  const [state, setState] = useState<RevealState>({ stateByRole: IDLE_STATE, revealed: false });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    clear();

    if (!order || !order.trace) {
      setState({ stateByRole: IDLE_STATE, revealed: Boolean(order) });
      return clear;
    }

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!animate || reduce) {
      setState({ stateByRole: allFinal(order), revealed: true });
      return clear;
    }

    // Init: con tham gia -> idle; con khong tham gia -> skipped ngay.
    const init = {} as Record<AgentRole, StepUiState>;
    for (const role of AGENT_ROLES) {
      init[role] = finalState(order, role) === 'skipped' ? 'skipped' : 'idle';
    }
    setState({ stateByRole: init, revealed: false });

    const participating = AGENT_ROLES.filter((r) => finalState(order, r) !== 'skipped');
    let t = 120;
    for (const role of participating) {
      const at = t;
      timers.current.push(
        setTimeout(
          () => setState((s) => ({ ...s, stateByRole: { ...s.stateByRole, [role]: 'active' } })),
          at,
        ),
      );
      timers.current.push(
        setTimeout(
          () =>
            setState((s) => ({
              ...s,
              stateByRole: { ...s.stateByRole, [role]: finalState(order, role) },
            })),
          at + ACTIVE_MS,
        ),
      );
      t += ACTIVE_MS + GAP_MS;
    }
    timers.current.push(setTimeout(() => setState((s) => ({ ...s, revealed: true })), t + 120));

    return clear;
    // Chi chay lai khi doi don (id) hoac nonce (replay/arrival) — order.trace on dinh theo id,
    // KHONG dua `order`/`animate` vao deps de tranh replay moi lan feed poll.
  }, [order?.id, nonce]);

  return state;
}
