import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('operator mutations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gui xac nhan ro rang khi bat tu gui', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ autoSend: 'on' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.setAutoSend(true)).resolves.toEqual({ autoSend: 'on' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/demo/auto-send',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ enabled: true, acknowledged: true }),
      }),
    );
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
