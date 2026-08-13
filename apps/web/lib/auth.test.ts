import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi, authFetch, resetAuthClientForTests } from './auth';

/**
 * `authFetch` gui `headers` duoi dang `Headers` (chuan web, khong phan biet hoa thuong va gop
 * duoc header caller tu dat). `expect.objectContaining({'x-csrf-token': ...})` KHONG khop mot
 * `Headers` vi no khong co thuoc tinh enumerable — nen doc bang chinh API cua Headers.
 */
function headerOf(mock: ReturnType<typeof vi.fn>, nth: number, name: string): string | null {
  const init = mock.mock.calls[nth - 1]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers).get(name);
}

describe('auth client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    resetAuthClientForTests();
  });

  it('keeps login, logout and user settings same-origin when API configuration is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.resetModules();
    const { authApi: sameOriginAuth } = await import('./auth');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/auth/csrf') {
        return new Response(JSON.stringify({ csrfToken: 'before-login' }), { status: 200 });
      }
      if (url === '/auth/login') {
        return new Response(
          JSON.stringify({
            csrfToken: 'after-login',
            user: { id: 'u1', username: 'sale.one', name: 'Sale One', role: 'SALE' },
          }),
          { status: 200 },
        );
      }
      if (url === '/auth/config') {
        return new Response(JSON.stringify({ mode: 'none' }), { status: 200 });
      }
      if (url === '/settings/users') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sameOriginAuth.config()).resolves.toEqual({ mode: 'none' });
    await expect(sameOriginAuth.users()).resolves.toEqual([]);
    await expect(sameOriginAuth.login('sale.one', 'correct-password')).resolves.toMatchObject({
      csrfToken: 'after-login',
    });
    await expect(sameOriginAuth.logout()).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/auth/config',
      '/settings/users',
      '/auth/csrf',
      '/auth/login',
      '/auth/logout',
    ]);
    expect(headerOf(fetchMock, 4, 'x-csrf-token')).toBe('before-login');
    expect(headerOf(fetchMock, 5, 'x-csrf-token')).toBe('after-login');
  });

  it('includes cookies and obtains a CSRF token before a mutation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await authFetch('http://localhost:3001/settings/rules', { method: 'POST', body: '{}' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/auth/csrf',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/settings/rules',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    expect(headerOf(fetchMock, 2, 'x-csrf-token')).toBe('csrf-1');
  });

  it('uses the rotated token returned after login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'before-login' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            csrfToken: 'after-login',
            user: { id: 'u1', username: 'sale.one', name: 'Sale One', role: 'SALE' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await authApi.login('sale.one', 'correct-password');
    await authFetch('http://localhost:3001/orders/one/approve', { method: 'POST' });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:3001/orders/one/approve',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    // Sau login, token phai la ban XOAY VONG tra ve tu /auth/login — khong dung lai token cu.
    expect(headerOf(fetchMock, fetchMock.mock.calls.length, 'x-csrf-token')).toBe('after-login');
  });
});
