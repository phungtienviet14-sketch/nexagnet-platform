import type { OrderView } from '@ultty/shared';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 120)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  orders: (): Promise<OrderView[]> => fetch(`${BASE}/orders`).then((r) => toJson<OrderView[]>(r)),
  messages: (): Promise<OrderView[]> =>
    fetch(`${BASE}/messages`).then((r) => toJson<OrderView[]>(r)),
  approve: (id: string): Promise<OrderView> =>
    fetch(`${BASE}/orders/${id}/approve`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  reject: (id: string): Promise<OrderView> =>
    fetch(`${BASE}/orders/${id}/reject`, { method: 'POST' }).then((r) => toJson<OrderView>(r)),
  simulate: (text: string): Promise<OrderView> =>
    fetch(`${BASE}/demo/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then((r) => toJson<OrderView>(r)),
  samples: (): Promise<string[]> => fetch(`${BASE}/demo/samples`).then((r) => toJson<string[]>(r)),
};

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}
