import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import express, { type Request, type Response } from 'express';
import session from 'express-session';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CsrfGuard, generateCsrfToken } from './csrf.guard.js';
import {
  NATIVE_CLIENT_HEADER,
  isNativeClientRequest,
  nativeSessionCarrier,
  signSessionToken,
} from './native-session.js';

/**
 * Bai nay chay qua EXPRESS-SESSION THAT tren mot cong HTTP that — khong gia lap phien. Thu can
 * chung minh la "token native va cookie web la CUNG MOT phien, chu ky do CHINH express-session
 * kiem", va mot ban gia lap se chung minh dieu do mot cach vo nghia.
 */
const COOKIE = 'netviet.sid';
const SECRET = 'native-session-spec-secret-0123456789abcdef';

interface Probe {
  readonly native: boolean;
  readonly userId: string | null;
  readonly cookieSeen: string | null;
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(nativeSessionCarrier(COOKIE));
  app.use(
    session({
      name: COOKIE,
      secret: SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60_000 },
    }),
  );
  // Mo phien nhu `POST /auth/login` va `POST /auth/native/session` cung lam: dat user roi luu.
  app.post('/login', (request, response) => {
    request.session.regenerate(() => {
      (request.session as unknown as { user: { userId: string } }).user = {
        userId: String(request.body?.userId ?? 'u-1'),
      };
      request.session.save(() => {
        response.json({ token: signSessionToken(request.sessionID, SECRET) });
      });
    });
  });
  app.get('/probe', (request, response) => {
    const probe: Probe = {
      native: isNativeClientRequest(request),
      userId:
        (request.session as unknown as { user?: { userId: string } } | undefined)?.user?.userId ??
        null,
      cookieSeen: request.headers.cookie ?? null,
    };
    response.json(probe);
  });
  app.post('/logout', (request, response) => {
    request.session.destroy(() => {
      response.clearCookie(COOKIE, { path: '/' });
      response.json({ ok: true });
    });
  });
  return app;
}

let server: Server;
let base: string;

beforeAll(async () => {
  server = buildApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function loginAs(userId: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ userId }),
  });
  const { token } = (await response.json()) as { token: string };
  return { token, setCookie: response.headers.get('set-cookie') };
}

async function probe(headers: Record<string, string>): Promise<Probe> {
  const response = await fetch(`${base}/probe`, { headers });
  return (await response.json()) as Probe;
}

describe('nativeSessionCarrier + express-session that', () => {
  it('token do signSessionToken ky nap DUNG phien ma express-session da luu', async () => {
    const { token } = await loginAs('driver-7', { [NATIVE_CLIENT_HEADER]: 'transport-mobile' });

    const seen = await probe({ authorization: `Bearer ${token}` });

    expect(seen).toMatchObject({ native: true, userId: 'driver-7' });
  });

  it('phien mo qua cookie web va token ky tu cung sid la CUNG mot phien', async () => {
    const { token, setCookie } = await loginAs('director-1');
    // Phan hoi web (khong tu xung native) van mang Set-Cookie nhu truoc.
    expect(setCookie).toMatch(new RegExp(`^${COOKIE.replace('.', '\\.')}=`));
    const cookieValue = decodeURIComponent(String(setCookie).split(';')[0]!.split('=')[1]!);

    expect(cookieValue).toBe(token);
  });

  it('phan hoi cho yeu cau native KHONG mang Set-Cookie cua phien', async () => {
    const { setCookie } = await loginAs('driver-8', { [NATIVE_CLIENT_HEADER]: 'transport-mobile' });

    expect(setCookie).toBeNull();
  });

  it('token bi sua chu ky thi KHONG nap duoc phien nao', async () => {
    const { token } = await loginAs('driver-9', { [NATIVE_CLIENT_HEADER]: 'transport-mobile' });
    const tampered = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;

    const seen = await probe({ authorization: `Bearer ${tampered}` });

    expect(seen).toMatchObject({ native: true, userId: null });
  });

  it('bearer THANG cookie: cookie gui kem bi bo, khong tron hai phien', async () => {
    const web = await loginAs('web-user');
    const native = await loginAs('native-user', { [NATIVE_CLIENT_HEADER]: 'transport-mobile' });
    const webCookie = String(web.setCookie).split(';')[0]!;

    const seen = await probe({ authorization: `Bearer ${native.token}`, cookie: webCookie });

    expect(seen.userId).toBe('native-user');
    expect(seen.cookieSeen).not.toContain(encodeURIComponent(web.token));
  });

  it('tieu de native KHONG bearer thi bo cookie — cookie web khong duoc dung qua duong native', async () => {
    const web = await loginAs('web-user-2');
    const webCookie = String(web.setCookie).split(';')[0]!;

    const seen = await probe({ [NATIVE_CLIENT_HEADER]: 'transport-mobile', cookie: webCookie });

    expect(seen).toEqual({ native: true, userId: null, cookieSeen: null });
  });

  it('bearer sai hinh dang (rong, rac, Basic) fail-closed, khong roi ve cookie', async () => {
    const web = await loginAs('web-user-3');
    const webCookie = String(web.setCookie).split(';')[0]!;

    for (const authorization of ['Bearer', 'Bearer   ', 'Bearer not-a-token']) {
      const seen = await probe({ authorization, cookie: webCookie });
      expect(seen).toEqual({ native: true, userId: null, cookieSeen: null });
    }
  });

  it('yeu cau web thuong di qua nguyen ven: cookie van xac thuc, khong bi danh dau native', async () => {
    const web = await loginAs('web-user-4');
    const webCookie = String(web.setCookie).split(';')[0]!;

    const seen = await probe({ cookie: webCookie });

    expect(seen).toMatchObject({ native: false, userId: 'web-user-4' });
  });

  it('logout qua bearer huy phien that — token cu khong dung lai duoc', async () => {
    const { token } = await loginAs('driver-10', { [NATIVE_CLIENT_HEADER]: 'transport-mobile' });
    const logout = await fetch(`${base}/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.headers.get('set-cookie')).toBeNull();

    const seen = await probe({ authorization: `Bearer ${token}` });

    expect(seen.userId).toBeNull();
  });
});

function guardContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) as Response }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('CsrfGuard voi yeu cau native', () => {
  const previousAuthMode = process.env.AUTH_MODE;
  const previousSessionSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousAuthMode;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
  });

  function markedByCarrier(request: Partial<Request>): Partial<Request> {
    nativeSessionCarrier(COOKIE)(
      request as Request,
      { setHeader: () => undefined } as never,
      () => {},
    );
    return request;
  }

  it('cho qua mutation native khong co x-csrf-token (khong con cookie ngam de bao ve)', async () => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
    const guard = new CsrfGuard({ getAllAndOverride: () => false } as unknown as Reflector);
    const request = markedByCarrier({
      method: 'POST',
      headers: { authorization: `Bearer ${signSessionToken('a'.repeat(32), SECRET)}` },
      session: {} as never,
    });

    await expect(guard.canActivate(guardContext(request))).resolves.toBe(true);
  });

  it('VAN chan mutation web thieu token — bearer gia trong than/thuoc tinh khong mao danh duoc', async () => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
    const guard = new CsrfGuard({ getAllAndOverride: () => false } as unknown as Reflector);
    const request = {
      method: 'POST',
      headers: { cookie: `${COOKIE}=x` },
      session: {} as never,
      // Mot khoa CHUOI cung ten khong phai la dau Symbol cua carrier.
      nativeClient: true,
    } as Partial<Request>;
    generateCsrfToken(request as Request);

    await expect(guard.canActivate(guardContext(request))).rejects.toThrow(ForbiddenException);
  });
});
