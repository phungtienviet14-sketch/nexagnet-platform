import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { HttpClient, buildUrl } from './http';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function client(
  fetchImpl: typeof fetch,
  token: string | null = 'tok',
  onUnauthenticated = vi.fn(),
) {
  return {
    http: new HttpClient({
      baseUrl: 'https://api.example.vn',
      clientTag: 'transport-mobile/0.1.0 (android)',
      getToken: () => token,
      onUnauthenticated,
      fetchImpl,
    }),
    onUnauthenticated,
  };
}

describe('HttpClient', () => {
  it('goi `fetch` toan cuc KHONG gan `this` — trinh duyet nem "Illegal invocation" neu gan', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function browserLikeFetch(this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(jsonResponse(200, { ok: true }));
    } as typeof fetch;
    try {
      const http = new HttpClient({
        baseUrl: 'https://api.example.vn',
        clientTag: 'transport-mobile/0.1.0 (web)',
        getToken: () => null,
      });
      await expect(http.get('/auth/me')).resolves.toEqual({ ok: true });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('gui bearer + tieu de native, KHONG gui cookie ngam', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const { http } = client(fetchImpl as unknown as typeof fetch);

    await http.post('/transport/me/checkpoints', { a: 1 });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.vn/transport/me/checkpoints');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer tok',
      'x-nexagnet-client': 'transport-mobile/0.1.0 (android)',
      'content-type': 'application/json',
    });
    expect(init.body).toBe('{"a":1}');
  });

  it('yeu cau an danh (dang nhap) khong mang token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const { http } = client(fetchImpl as unknown as typeof fetch);

    await http.post('/auth/native/session', {}, { anonymous: true });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('401 CO token -> bao het phien; 401 luc dang nhap an danh thi khong', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { message: 'Bạn cần đăng nhập' }));
    const { http, onUnauthenticated } = client(fetchImpl as unknown as typeof fetch);

    await expect(http.get('/auth/me')).rejects.toMatchObject({ kind: 'UNAUTHENTICATED' });
    expect(onUnauthenticated).toHaveBeenCalledOnce();

    await expect(http.post('/auth/native/session', {}, { anonymous: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('giu `reason` cua loi nghiep vu de ung dung chon cach xu ly', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { message: 'Moc da ghi', reason: 'CHECKPOINT_ALREADY_RECORDED' }),
    );
    const { http } = client(fetchImpl as unknown as typeof fetch);

    await expect(http.post('/x', {})).rejects.toMatchObject({
      kind: 'DOMAIN',
      status: 409,
      reason: 'CHECKPOINT_ALREADY_RECORDED',
      isRetryable: false,
    });
  });

  it('404 khong phai JSON = nang luc chua bat tren may chu nay', async () => {
    const fetchImpl = vi.fn(async () => new Response('Not Found', { status: 404 }));
    const { http } = client(fetchImpl as unknown as typeof fetch);

    await expect(http.get('/transport/me/field-work')).rejects.toMatchObject({
      kind: 'NOT_MOUNTED',
    });
  });

  it('loi mang va 5xx la thu lai duoc', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(client(offline as unknown as typeof fetch).http.get('/x')).rejects.toMatchObject({
      kind: 'NETWORK',
      isRetryable: true,
    });
    const down = vi.fn(async () => jsonResponse(503, { message: 'down' }));
    await expect(client(down as unknown as typeof fetch).http.get('/x')).rejects.toMatchObject({
      kind: 'SERVER',
      isRetryable: true,
    });
  });

  it('het gio -> TIMEOUT, khong treo mai', async () => {
    const never = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const { http } = client(never as unknown as typeof fetch);

    await expect(http.get('/slow', { timeoutMs: 20 })).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });

  it('buildUrl bo tham so rong va ma hoa gia tri', () => {
    expect(buildUrl('https://a.vn', '/x', { q: 'Hà Nội', empty: '', none: null, n: 2 })).toBe(
      'https://a.vn/x?q=H%C3%A0%20N%E1%BB%99i&n=2',
    );
  });
});

describe('HttpClient — che do cookie (PWA cung origin)', () => {
  function cookieClient(fetchImpl: typeof fetch) {
    let token = 'csrf-1';
    const csrf = {
      current: vi.fn(async () => token),
      refresh: vi.fn(async () => {
        token = 'csrf-2';
        return token;
      }),
    };
    const onUnauthenticated = vi.fn();
    const http = new HttpClient({
      baseUrl: '',
      clientTag: 'transport-mobile/web',
      getToken: () => null,
      mode: 'cookie',
      csrf,
      onUnauthenticated,
      fetchImpl,
    });
    return { http, csrf, onUnauthenticated };
  }

  it('ghi mang x-csrf-token, KHONG mang tieu de native (gui thi may chu bo cookie), cookie cung origin', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const { http } = cookieClient(fetchImpl as unknown as typeof fetch);

    await http.get('/auth/me');
    await http.post('/transport/me/checkpoints', {});

    const [getUrl, getInit] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const [, postInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(getUrl).toBe('/auth/me');
    expect(getInit.credentials).toBe('same-origin');
    expect(getInit.headers).not.toHaveProperty('x-csrf-token');
    expect(postInit.headers).toMatchObject({ 'x-csrf-token': 'csrf-1' });
    expect(postInit.headers).not.toHaveProperty('x-nexagnet-client');
    expect(postInit.headers).not.toHaveProperty('authorization');
  });

  it('CSRF het han -> xin token moi, gui lai DUNG mot lan, thanh cong', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { message: 'CSRF token không hợp lệ' }))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'cp-1' }));
    const { http, csrf } = cookieClient(fetchImpl as unknown as typeof fetch);

    await expect(http.post('/x', {})).resolves.toEqual({ id: 'cp-1' });
    expect(csrf.refresh).toHaveBeenCalledOnce();
    const [, retryInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(retryInit.headers).toMatchObject({ 'x-csrf-token': 'csrf-2' });
  });

  it('403 QUYEN (thong bao khac) KHONG bi gui lai', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(403, { message: 'Ban khong co quyen', reason: 'X' }),
    );
    const { http, csrf } = cookieClient(fetchImpl as unknown as typeof fetch);

    await expect(http.post('/x', {})).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    expect(csrf.refresh).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('401 o che do cookie cung bao het phien', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { message: 'Bạn cần đăng nhập' }));
    const { http, onUnauthenticated } = cookieClient(fetchImpl as unknown as typeof fetch);

    await expect(http.get('/auth/me')).rejects.toMatchObject({ kind: 'UNAUTHENTICATED' });
    expect(onUnauthenticated).toHaveBeenCalledOnce();
    expect(http.authHeaders()).toEqual({});
  });
});
