import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiKeyGuard } from './api-key.guard.js';

const KEY = 'test-api-key-1234567890';

/** ExecutionContext gia — chi can headers + getHandler/getClass cho Reflector. */
function ctx(headers: Record<string, unknown> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function reflector(isPublic = false): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

describe('ApiKeyGuard', () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['API_KEY', 'NODE_ENV', 'AUTH_MODE', 'SESSION_SECRET'] as const;

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('API_KEY BO TRONG -> che do mo, moi request deu qua (giu demo/CI chay nhu cu)', () => {
    delete process.env.API_KEY;
    const guard = new ApiKeyGuard(reflector());
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('API_KEY dat + header dung -> cho qua', () => {
    process.env.API_KEY = KEY;
    const guard = new ApiKeyGuard(reflector());
    expect(guard.canActivate(ctx({ 'x-api-key': KEY }))).toBe(true);
  });

  it('API_KEY dat + THIEU header -> 401', () => {
    process.env.API_KEY = KEY;
    const guard = new ApiKeyGuard(reflector());
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });

  it('API_KEY dat + header SAI -> 401', () => {
    process.env.API_KEY = KEY;
    const guard = new ApiKeyGuard(reflector());
    expect(() => guard.canActivate(ctx({ 'x-api-key': 'khoa-sai-hoan-toan-nhe' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('key sai nhung DAI BANG NHAU -> van 401 (khong loi timingSafeEqual do lech do dai)', () => {
    process.env.API_KEY = KEY;
    const guard = new ApiKeyGuard(reflector());
    const sameLength = 'X'.repeat(KEY.length);
    expect(() => guard.canActivate(ctx({ 'x-api-key': sameLength }))).toThrow(UnauthorizedException);
  });

  it('route gan @Public -> qua du KHONG co header (vd /health)', () => {
    process.env.API_KEY = KEY;
    const guard = new ApiKeyGuard(reflector(true));
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('AUTH_MODE=none -> mo hoan toan du DA dat API_KEY (VM dev/demo)', () => {
    process.env.API_KEY = KEY;
    process.env.AUTH_MODE = 'none';
    const guard = new ApiKeyGuard(reflector());
    expect(guard.canActivate(ctx())).toBe(true);
    expect(guard.canActivate(ctx({ 'x-api-key': 'khoa-hoan-toan-sai' }))).toBe(true);
  });

  it('AUTH_MODE=session -> bo qua API key de guard session xu ly', () => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
    const guard = new ApiKeyGuard(reflector());
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('header khong phai chuoi (mang) -> 401, khong crash', () => {
    process.env.API_KEY = KEY;
    const guard = new ApiKeyGuard(reflector());
    expect(() => guard.canActivate(ctx({ 'x-api-key': ['a', 'b'] }))).toThrow(UnauthorizedException);
  });
});
