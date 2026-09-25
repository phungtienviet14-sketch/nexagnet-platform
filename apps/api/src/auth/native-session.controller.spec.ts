import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { NativeSessionController } from './native-session.controller.js';
import { NATIVE_CLIENT_HEADER, nativeSessionCarrier, signSessionToken } from './native-session.js';

// Hang so de bo quet bi mat pre-commit khong bao dong gia (xem auth.service.spec.ts).
const VALID_PW = 'correct-password';
const SECRET = 'n'.repeat(48);

const USER: AuthenticatedUser = {
  id: 'user-9',
  username: 'lx.binh',
  name: 'Lái xe Bình',
  email: null,
  phone: null,
  role: 'SALE',
  credentialVersion: 4,
  disabledAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  lastLoginAt: null,
  passwordChangedAt: null,
};

function sessionStub(nextId: string) {
  const request = {
    headers: {} as Record<string, string>,
    sessionID: 'old-anonymous-sid',
    session: {} as Record<string, unknown>,
  };
  request.session = {
    regenerate: vi.fn((done: (error?: unknown) => void) => {
      request.sessionID = nextId;
      done();
    }),
    save: vi.fn((done: (error?: unknown) => void) => done()),
    cookie: {},
  };
  return request;
}

function viaCarrier<T extends { headers: Record<string, string> }>(request: T): T {
  nativeSessionCarrier('netviet.sid')(
    request as unknown as Request,
    { setHeader: () => undefined } as unknown as Response,
    () => undefined,
  );
  return request;
}

describe('NativeSessionController', () => {
  const previous = { ...process.env };

  beforeEach(() => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = SECRET;
    process.env.SESSION_MAX_AGE_MS = String(8 * 60 * 60 * 1000);
  });

  afterEach(() => {
    process.env = { ...previous };
  });

  it('doi mat khau lay token cua phien MOI (sau regenerate), ky dung dinh dang express-session', async () => {
    const auth = { authenticate: vi.fn(async () => USER) } as unknown as AuthService;
    const request = viaCarrier(sessionStub('fresh-sid-0123456789abcdef'));
    request.headers[NATIVE_CLIENT_HEADER] = 'transport-mobile/0.1.0';
    viaCarrier(request);

    const result = await new NativeSessionController(auth).open(
      { username: USER.username, password: VALID_PW },
      request as never,
    );

    expect(auth.authenticate).toHaveBeenCalledOnce();
    expect(request.session.regenerate).toHaveBeenCalledOnce();
    expect(request.session.user).toEqual({ userId: USER.id, credentialVersion: 4 });
    expect(result).toEqual({
      user: USER,
      sessionToken: signSessionToken('fresh-sid-0123456789abcdef', SECRET),
      idleTimeoutMs: 8 * 60 * 60 * 1000,
    });
  });

  it('tu choi yeu cau KHONG tu xung native — trinh duyet khong duoc cap token qua duong nay', async () => {
    const auth = { authenticate: vi.fn(async () => USER) } as unknown as AuthService;
    const request = sessionStub('sid-x');

    await expect(
      new NativeSessionController(auth).open(
        { username: USER.username, password: VALID_PW },
        request as never,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('may chu khong o che do phien thi route nay khong ton tai', async () => {
    process.env.AUTH_MODE = 'none';
    const auth = { authenticate: vi.fn(async () => USER) } as unknown as AuthService;
    const request = sessionStub('sid-y');
    request.headers[NATIVE_CLIENT_HEADER] = 'transport-mobile/0.1.0';
    viaCarrier(request);

    await expect(
      new NativeSessionController(auth).open(
        { username: USER.username, password: VALID_PW },
        request as never,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('sai mat khau thi KHONG regenerate va KHONG cap token (loi tu authenticate di thang ra)', async () => {
    const failure = new Error('Tên đăng nhập hoặc mật khẩu không đúng');
    const auth = {
      authenticate: vi.fn(async () => {
        throw failure;
      }),
    } as unknown as AuthService;
    const request = sessionStub('sid-z');
    request.headers[NATIVE_CLIENT_HEADER] = 'transport-mobile/0.1.0';
    viaCarrier(request);

    await expect(
      new NativeSessionController(auth).open(
        { username: 'x.y', password: 'nope' },
        request as never,
      ),
    ).rejects.toBe(failure);
    expect(request.session.regenerate).not.toHaveBeenCalled();
  });
});
