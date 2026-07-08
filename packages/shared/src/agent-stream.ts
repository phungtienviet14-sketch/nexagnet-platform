import type { AgentRole, AgentStep, SenderType } from './agents.js';
import type { OrderView } from './order-view.js';

/**
 * Su kien STREAMING 6 agent qua SSE (/events) — real-time.
 * Backend phat khi xu ly TUNG BUOC; frontend hien dung luc thay vi timer client.
 * Chi 1 lan goi LLM/tin: vai Router co do tre THAT; cac vai rules tuc thi (co the
 * gian nhe bang STREAM_STEP_DELAY_MS de de nhin).
 */

/** Payload nhe luc tao don (truoc khi parse xong) — de hien card "dang xu ly". */
export interface OrderCreatedPayload {
  orderId: string;
  chatId: string;
  groupName?: string;
  dealerName?: string;
  senderType?: SenderType;
  rawText: string;
  imageUrl?: string;
  createdAt: string;
  /** true khi day la lan CHAY LAI (nut "Chay lai") cua don da co. */
  rerun?: boolean;
}

/** Union su kien tren kenh /events. */
export type AgentStreamEvent =
  | { type: 'order.created'; order: OrderCreatedPayload }
  | { type: 'agent.progress'; orderId: string; role: AgentRole; phase: 'active' | 'done'; step?: AgentStep }
  | { type: 'order.finalized'; order: OrderView }
  | { type: 'order.updated'; order: OrderView };

export type AgentStreamEventType = AgentStreamEvent['type'];
