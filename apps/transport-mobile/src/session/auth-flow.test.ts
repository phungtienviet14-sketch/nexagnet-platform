import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../api/http';
import { EdgeFiltersSessionError, openNativeSession } from './auth-flow';

const USER = {
  id: 'u-1',
  username: 'lx.binh',
  name: 'Lái xe Bình',
  role: 'SALE',
  credentialVersion: 2,
};
const TOKEN = `s:${'a'.repeat(32)}.${'b'.repeat(43)}`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function factory(fetchImpl: typeof fetch) {
  return (token: string | null) =>
    new HttpClient({
      baseUrl: 'https://api.example.vn',
      clientTag: 'transport-mobile/test',
      getToken: () => token,
      fetchImpl,
    });
}

describe('openNativeSession', () => {
  it('doi mat khau lay token roi XAC NHAN lai bang chinh token do', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/native/session')) {
        return json(201, { user: USER, sessionToken: TOKEN, idleTimeoutMs: 28_800_000 });
      }
      expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
      return json(200, { user: USER });
    });

    const session = await openNativeSession(
      'https://api.example.vn',
      { username: ' lx.binh ', password: 'pw' },
      factory(fetchImpl as unknown as typeof fetch),
      () => new Date('2026-09-25T07:00:00.000Z'),
    );

    expect(session).toEqual({
      serverUrl: 'https://api.example.vn',
      token: TOKEN,
      user: {
        id: 'u-1',
        username: 'lx.binh',
        name: 'Lái xe Bình',
        role: 'SALE',
        credentialVersion: 2,
      },
      idleTimeoutMs: 28_800_000,
      verifiedAt: '2026-09-25T07:00:00.000Z',
    });
    const loginBody = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(loginBody).toEqual({ username: 'lx.binh', password: 'pw' });
  });

  it('token bi edge loc (401 ngay sau khi cap) -> loi RIENG, khong phai "sai mat khau"', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/auth/native/session')
        ? json(201, { user: USER, sessionToken: TOKEN })
        : json(401, { message: 'Bạn cần đăng nhập' }),
    );

    await expect(
      openNativeSession(
        'https://api.example.vn',
        { username: 'lx.binh', password: 'pw' },
        factory(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toBeInstanceOf(EdgeFiltersSessionError);
  });

  it('sai mat khau -> di thang loi 401 cua may chu', async () => {
    const fetchImpl = vi.fn(async () =>
      json(401, { message: 'Tên đăng nhập hoặc mật khẩu không đúng' }),
    );

    await expect(
      openNativeSession(
        'https://api.example.vn',
        { username: 'x', password: 'y' },
        factory(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toMatchObject({
      kind: 'UNAUTHENTICATED',
      message: 'Tên đăng nhập hoặc mật khẩu không đúng',
    });
  });

  it('may chu chua co duong native (404 khong JSON) -> noi ro can cap nhat may chu', async () => {
    const fetchImpl = vi.fn(async () => new Response('Cannot POST', { status: 404 }));

    await expect(
      openNativeSession(
        'https://api.example.vn',
        { username: 'x', password: 'y' },
        factory(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toMatchObject({ kind: 'NOT_MOUNTED' });
  });

  it('may chu xac nhan MOT tai khoan khac -> huy, khong luu phien', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/auth/native/session')
        ? json(201, { user: USER, sessionToken: TOKEN })
        : json(200, { user: { ...USER, id: 'u-2' } }),
    );

    await expect(
      openNativeSession(
        'https://api.example.vn',
        { username: 'lx.binh', password: 'pw' },
        factory(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toThrow(/nhầm tài khoản/);
  });
});
