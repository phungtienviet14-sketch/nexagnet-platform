import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { CsrfGuard, generateCsrfToken } from './csrf.guard.js';

function context(request: Partial<Request>, response: Partial<Response> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const previousAuthMode = process.env.AUTH_MODE;
  const previousSessionSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousAuthMode;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
  });

  it('rejects a session-authenticated mutation without x-csrf-token', async () => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
    const guard = new CsrfGuard({ getAllAndOverride: () => false } as unknown as Reflector);
    const request = { method: 'POST', headers: {}, session: {} } as Partial<Request>;
    generateCsrfToken(request as Request);

    await expect(guard.canActivate(context(request))).rejects.toThrow(ForbiddenException);
  });

  it('accepts the current token and ignores safe methods', async () => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
    const guard = new CsrfGuard({ getAllAndOverride: () => false } as unknown as Reflector);
    const request = { method: 'POST', headers: {}, session: {} } as Partial<Request>;
    const token = generateCsrfToken(request as Request);
    request.headers = { 'x-csrf-token': token };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ ...request, method: 'GET', headers: {} })),
    ).resolves.toBe(true);
  });
});
