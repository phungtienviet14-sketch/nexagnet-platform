import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('operator mutations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bat kill switch tu gui ma khong gui lai acknowledgement D4 da chot', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ autoSend: 'on' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.setAutoSend(true)).resolves.toEqual({ autoSend: 'on' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/settings/automation/auto-send',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });

  it('dong viec Sale nhap ERP bang endpoint generic, khong goi route KiotViet', async () => {
    const response = {
      id: 'order-1',
      status: 'sent',
      salesHandoff: { action: 'manual_erp_entry', status: 'completed', createdAt: '2026-08-12' },
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.completeSalesHandoff('order-1')).resolves.toEqual(response);
    // Di qua authFetch nen init con co `credentials` + `headers`; van phai la endpoint generic.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/orders/order-1/sales-handoff/complete',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/kiotviet'))).toBe(true);
  });

  it('gui xac nhan khi dang xuat va xoa phien Zalo cuc bo', async () => {
    const response = { channelMode: 'zca', state: 'logged_out', allowedGroupIds: [] };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.zaloLogout()).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/zalo/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmed: true }),
      }),
    );
  });
});
