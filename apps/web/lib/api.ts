import type {
  AutoSendState,
  DemoConfig,
  DemoGroup,
  ErpOrder,
  ErpProduct,
  KnowledgeSummary,
  OrderView,
} from '@netviet/shared';
import type { ZaloGroup, ZaloStatus } from './zalo';
import { authFetch } from './auth';

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
  orders: (): Promise<OrderView[]> => authFetch(`${BASE}/orders`).then((r) => toJson<OrderView[]>(r)),
  messages: (): Promise<OrderView[]> =>
    authFetch(`${BASE}/messages`).then((r) => toJson<OrderView[]>(r)),
  approve: (id: string): Promise<OrderView> =>
    authFetch(`${BASE}/orders/${id}/approve`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  completeSalesHandoff: (id: string): Promise<OrderView> =>
    authFetch(`${BASE}/orders/${id}/sales-handoff/complete`, { method: 'POST' }).then((r) =>
      toJson<OrderView>(r),
    ),
  reject: (id: string): Promise<OrderView> =>
    authFetch(`${BASE}/orders/${id}/reject`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  /** "Chay lai" — goi LAI LLM that voi cung id (real-time, phat lai stream). */
  rerun: (id: string): Promise<OrderView> =>
    authFetch(`${BASE}/demo/rerun/${id}`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  simulate: ({ text, chatId }: SimulateInput): Promise<OrderView> =>
    authFetch(`${BASE}/demo/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, chatId }),
    }).then((r) => toJson<OrderView>(r)),
  samples: (): Promise<string[]> => authFetch(`${BASE}/demo/samples`).then((r) => toJson<string[]>(r)),
  groups: (): Promise<DemoGroup[]> =>
    authFetch(`${BASE}/demo/groups`).then((r) => toJson<DemoGroup[]>(r)),
  erpProducts: (): Promise<ErpProduct[]> =>
    authFetch(`${BASE}/erp/products`).then((r) => toJson<ErpProduct[]>(r)),
  erpOrders: (): Promise<ErpOrder[]> =>
    authFetch(`${BASE}/erp/orders`).then((r) => toJson<ErpOrder[]>(r)),
  knowledge: (): Promise<KnowledgeSummary> =>
    authFetch(`${BASE}/knowledge/summary`).then((r) => toJson<KnowledgeSummary>(r)),
  config: (): Promise<DemoConfig> => authFetch(`${BASE}/demo/config`).then((r) => toJson<DemoConfig>(r)),
  setAutoSend: (enabled: boolean): Promise<AutoSendState> =>
    authFetch(`${BASE}/settings/automation/auto-send`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then((r) => toJson<AutoSendState>(r)),
  zaloStatus: (): Promise<ZaloStatus> =>
    authFetch(`${BASE}/zalo/status`, { cache: 'no-store' }).then((r) => toJson<ZaloStatus>(r)),
  zaloQr: (): Promise<{ image: string }> =>
    authFetch(`${BASE}/zalo/qr`, { cache: 'no-store' }).then((r) => toJson<{ image: string }>(r)),
  zaloLogin: (): Promise<ZaloStatus> =>
    authFetch(`${BASE}/zalo/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Hai xac nhan tach roi: rui ro ToS (D16) va tai khoan phu/SIM rieng (D20). Man hinh
      // /zalo bat tick tung o rieng, API ghi ca hai vao nhat ky thay doi.
      body: JSON.stringify({ acceptedRisk: true, acceptedSecondaryAccount: true }),
    }).then((r) => toJson<ZaloStatus>(r)),
  zaloLogout: (): Promise<ZaloStatus> =>
    authFetch(`${BASE}/zalo/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    }).then((r) => toJson<ZaloStatus>(r)),
  zaloGroups: (): Promise<ZaloGroup[]> =>
    authFetch(`${BASE}/zalo/groups`, { cache: 'no-store' }).then((r) => toJson<ZaloGroup[]>(r)),
  saveZaloGroups: (groupIds: string[]): Promise<ZaloStatus> =>
    authFetch(`${BASE}/zalo/allowed-groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds }),
    }).then((r) => toJson<ZaloStatus>(r)),
};

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}
