import type { OrderView } from '@ultty/shared';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
