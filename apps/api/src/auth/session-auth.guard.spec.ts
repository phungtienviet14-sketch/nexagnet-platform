import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionAuthGuard } from './session-auth.guard.js';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('session authorization guards', () => {
  const previousAuthMode = process.env.AUTH_MODE;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const reflector = {
    getAllAndOverride: vi.fn(),
  } as unknown as Reflector;
  const user = {
    id: 'sale-1',
    username: 'sale.one',
    name: 'Sale One',
    email: null,
    phone: null,
    role: 'SALE' as const,
    credentialVersion: 1,
    disabledAt: null,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    lastLoginAt: null,
    passwordChangedAt: null,
  };
  const auth = { validateSession: vi.fn(async () => user) } as unknown as AuthService;

  beforeEach(() => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousAuthMode;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
  });

  it('rejects a request without a session identity', async () => {
    const guard = new SessionAuthGuard(reflector, auth);
    reflector.getAllAndOverride = vi.fn(() => false);

    await expect(guard.canActivate(context({ session: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('loads the current user and rejects stale credential versions', async () => {
    const guard = new SessionAuthGuard(reflector, auth);
    reflector.getAllAndOverride = vi.fn(() => false);
    const request = {
      session: { user: { userId: user.id, credentialVersion: 1 } },
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty('authUser', user);

    auth.validateSession = vi.fn(async () => null);
    await expect(guard.canActivate(context(request))).rejects.toThrow(UnauthorizedException);
  });

  it('allows api-key mode to retain backwards compatibility', async () => {
    process.env.AUTH_MODE = 'api-key';
    const guard = new SessionAuthGuard(reflector, auth);
    await expect(guard.canActivate(context({}))).resolves.toBe(true);
  });

  it('denies SALE when a route requires MANAGER or ADMIN', () => {
    const guard = new RolesGuard(reflector);
    reflector.getAllAndOverride = vi.fn(() => ['MANAGER', 'ADMIN']);

    expect(() => guard.canActivate(context({ authUser: user }))).toThrow(ForbiddenException);
  });
});
