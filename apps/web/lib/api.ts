import type {
  BroadcastRequest,
  BroadcastResult,
  AutoSendState,
  DemoConfig,
  DemoGroup,
  KiotVietOrder,
  KiotVietProduct,
  KnowledgeSummary,
  OrderView,
} from '@ultty/shared';
import type { ZaloGroup, ZaloStatus } from './zalo';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Kenh SSE 6 agent real-time. */
export const EVENTS_URL = `${BASE}/events`;

export type { DemoGroup };

/** Tham so giả lập 1 tin — chon nhom de test dinh tuyen dai ly theo nhom. */
export interface SimulateInput {
  text: string;
  chatId?: string;
}

async function toJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 160);
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // giu message tho
    }
    throw new Error(message);
  }
  return JSON.parse(text) as T;
}

export const api = {
  orders: (): Promise<OrderView[]> => fetch(`${BASE}/orders`).then((r) => toJson<OrderView[]>(r)),
  messages: (): Promise<OrderView[]> =>
    fetch(`${BASE}/messages`).then((r) => toJson<OrderView[]>(r)),
  approve: (id: string): Promise<OrderView> =>
    fetch(`${BASE}/orders/${id}/approve`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  reject: (id: string): Promise<OrderView> =>
    fetch(`${BASE}/orders/${id}/reject`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  /** "Chay lai" — goi LAI LLM that voi cung id (real-time, phat lai stream). */
  rerun: (id: string): Promise<OrderView> =>
    fetch(`${BASE}/demo/rerun/${id}`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  simulate: ({ text, chatId }: SimulateInput): Promise<OrderView> =>
    fetch(`${BASE}/demo/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, chatId }),
    }).then((r) => toJson<OrderView>(r)),
  samples: (): Promise<string[]> => fetch(`${BASE}/demo/samples`).then((r) => toJson<string[]>(r)),
  groups: (): Promise<DemoGroup[]> =>
    fetch(`${BASE}/demo/groups`).then((r) => toJson<DemoGroup[]>(r)),
  kiotVietProducts: (): Promise<KiotVietProduct[]> =>
    fetch(`${BASE}/kiotviet/products`).then((r) => toJson<KiotVietProduct[]>(r)),
  kiotVietOrders: (): Promise<KiotVietOrder[]> =>
    fetch(`${BASE}/kiotviet/orders`).then((r) => toJson<KiotVietOrder[]>(r)),
  broadcast: (req: BroadcastRequest): Promise<BroadcastResult> =>
    fetch(`${BASE}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }).then((r) => toJson<BroadcastResult>(r)),
  knowledge: (): Promise<KnowledgeSummary> =>
    fetch(`${BASE}/knowledge/summary`).then((r) => toJson<KnowledgeSummary>(r)),
  config: (): Promise<DemoConfig> => fetch(`${BASE}/demo/config`).then((r) => toJson<DemoConfig>(r)),
  setAutoSend: (enabled: boolean): Promise<AutoSendState> =>
    fetch(`${BASE}/demo/auto-send`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enabled ? { enabled: true, acknowledged: true } : { enabled: false }),
    }).then((r) => toJson<AutoSendState>(r)),
  zaloStatus: (): Promise<ZaloStatus> =>
    fetch(`${BASE}/zalo/status`, { cache: 'no-store' }).then((r) => toJson<ZaloStatus>(r)),
  zaloQr: (): Promise<{ image: string }> =>
    fetch(`${BASE}/zalo/qr`, { cache: 'no-store' }).then((r) => toJson<{ image: string }>(r)),
  zaloLogin: (): Promise<ZaloStatus> =>
    fetch(`${BASE}/zalo/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedRisk: true }),
    }).then((r) => toJson<ZaloStatus>(r)),
  zaloLogout: (): Promise<ZaloStatus> =>
    fetch(`${BASE}/zalo/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    }).then((r) => toJson<ZaloStatus>(r)),
  zaloGroups: (): Promise<ZaloGroup[]> =>
    fetch(`${BASE}/zalo/groups`, { cache: 'no-store' }).then((r) => toJson<ZaloGroup[]>(r)),
  saveZaloGroups: (groupIds: string[]): Promise<ZaloStatus> =>
    fetch(`${BASE}/zalo/allowed-groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds }),
    }).then((r) => toJson<ZaloStatus>(r)),
};

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}
