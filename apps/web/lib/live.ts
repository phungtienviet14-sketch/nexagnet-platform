import {
  AGENT_ROLES,
  type AgentRole,
  type AgentStep,
  type Intent,
  type OrderCreatedPayload,
  type OrderStatus,
  type OrderView,
  type SenderType,
} from '@ultty/shared';

/**
 * Trang thai HIEN THI 6 agent + hop nhat feed cho console streaming.
 * Nguon nhip la SU KIEN SSE that (khong con timer client). Chon don cu = tinh;
 * chi chay lai khi bam "Chay lai" (goi lai LLM -> stream lai).
 */

export type StepUiState = 'idle' | 'active' | 'done' | 'skipped' | 'flagged' | 'handoff';

export interface RoleReveal {
  state: StepUiState;
  /** Du lieu buoc — chi co khi da "done" (hoac trace tinh). */
  step?: AgentStep;
}

export interface RevealState {
  byRole: Record<AgentRole, RoleReveal>;
  /** true -> hien khoi don + nut duyet (da xong / don da chot). */
  revealed: boolean;
}

/** Tien do 1 don DANG xu ly (nhan tu SSE); xoa khi order.finalized hoac qua han (stuck). */
export interface RunState {
  placeholder: OrderCreatedPayload;
  byRole: Record<AgentRole, RoleReveal>;
  /** epoch ms lan cap nhat cuoi — de don run "ket" khi mat order.finalized (disconnect/loi). */
  updatedAt: number;
}

/** 1 dong feed — hop nhat don da chot (order) + don dang xu ly (processing). */
export interface FeedItem {
  id: string;
  createdAt: string;
  rawText: string;
  chatId: string;
  groupName?: string;
  dealerName?: string;
  senderType?: SenderType;
  imageUrl?: string;
  intent?: Intent;
  status: OrderStatus | 'processing';
  order?: OrderView;
  processing: boolean;
}

export function stepUiState(step?: AgentStep): StepUiState {
  if (!step || step.status === 'skipped') return 'skipped';
  if (step.status === 'handoff') return 'handoff';
  if (step.status === 'flagged') return 'flagged';
  return 'done';
}

export function idleByRole(): Record<AgentRole, RoleReveal> {
  const out = {} as Record<AgentRole, RoleReveal>;
  for (const role of AGENT_ROLES) out[role] = { state: 'idle' };
  return out;
}

/** Trang thai TINH tu trace da chot (tat ca vai da xong / bo qua). */
export function staticReveal(order: OrderView): RevealState {
  const byRole = {} as Record<AgentRole, RoleReveal>;
  for (const role of AGENT_ROLES) {
    const step = order.trace?.steps.find((s) => s.role === role);
    byRole[role] = { state: stepUiState(step), step };
  }
  return { byRole, revealed: true };
}

/** Uu tien tien do LIVE (dang xu ly), roi den trace TINH, roi idle. */
export function deriveReveal(item: FeedItem | undefined, run: RunState | undefined): RevealState {
  if (run) return { byRole: run.byRole, revealed: false };
  if (item?.order?.trace) return staticReveal(item.order);
  return { byRole: idleByRole(), revealed: Boolean(item?.order) };
}

/** Hop nhat don da chot + don dang xu ly -> danh sach feed (moi nhat truoc). */
export function buildFeedItems(orders: OrderView[], runs: Map<string, RunState>): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    const processing = runs.has(order.id);
    items.push({
      id: order.id,
      createdAt: order.createdAt,
      rawText: order.rawText,
      chatId: order.chatId,
      groupName: order.groupName,
      dealerName: order.dealerName,
      senderType: order.senderType,
      imageUrl: order.imageUrl,
      intent: order.intent,
      status: processing ? 'processing' : order.status,
      order,
      processing,
    });
    seen.add(order.id);
  }
  for (const [id, run] of runs) {
    if (seen.has(id)) continue;
    const p = run.placeholder;
    items.push({
      id,
      createdAt: p.createdAt,
      rawText: p.rawText,
      chatId: p.chatId,
      groupName: p.groupName,
      dealerName: p.dealerName,
      senderType: p.senderType,
      imageUrl: p.imageUrl,
      status: 'processing',
      processing: true,
    });
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items;
}
