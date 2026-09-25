import {
  ForbiddenException,
  RequestMethod,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { USER_ROLES, type AuthenticatedUser, type UserRole } from '../../auth/auth.types.js';
import { IS_PUBLIC_KEY } from '../../auth/public.decorator.js';
import { ROLES_KEY } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { TRANSPORT_ACTION_KEY, TransportActionGuard } from '../transport-action.guard.js';
import {
  TRANSPORT_ACTIONS,
  isStakeholderScopeAction,
  roleCanPerform,
  type TransportAction,
} from '../transport-actions.js';
import { TransportAccessController } from './transport-access.controller.js';

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

const userWith = (role: UserRole): AuthenticatedUser => ({
  id: `user-${role.toLowerCase()}`,
  username: `${role.toLowerCase()}.one`,
  name: role,
  email: null,
  phone: null,
  role,
  credentialVersion: 1,
  disabledAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  lastLoginAt: null,
  passwordChangedAt: null,
});

const requestOf = (user: AuthenticatedUser | undefined): AuthenticatedRequest =>
  ({ authUser: user, session: {} }) as unknown as AuthenticatedRequest;

/** Cau tra loi CUA CHINH GUARD cho mot cap (nguoi, hanh dong) — o che do co phien. */
const guardAllows = (user: AuthenticatedUser, action: TransportAction): boolean => {
  const guard = new TransportActionGuard({
    getAllAndOverride: () => action,
  } as unknown as Reflector);
  const context = {
    getHandler: () => (): void => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => requestOf(user) }),
  } as unknown as ExecutionContext;
  try {
    return guard.canActivate(context);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
};

describe('GET /transport/access', () => {
  const controller = new TransportAccessController();
  const previous = { mode: process.env.AUTH_MODE, secret: process.env.SESSION_SECRET };

  beforeEach(() => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
  });

  afterEach(() => {
    if (previous.mode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previous.mode;
    if (previous.secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous.secret;
  });

  it('la GET /transport/access, can dang nhap, khong doi vai hay ma hanh dong nao', () => {
    const handler = TransportAccessController.prototype.access;
    const reflector = new Reflector();
    const meta = (key: string) =>
      reflector.getAllAndOverride<unknown>(key, [handler, TransportAccessController]);

    expect(Reflect.getMetadata(PATH_METADATA, TransportAccessController)).toBe('transport');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('access');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(meta(IS_PUBLIC_KEY)).toBeUndefined();
    expect(meta(ROLES_KEY)).toBeUndefined();
    expect(meta(TRANSPORT_ACTION_KEY)).toBeUndefined();
  });

  for (const role of USER_ROLES) {
    it(`${role}: dung tap ma roleCanPerform cho phep, sap xep on dinh`, () => {
      const view = controller.access(requestOf(userWith(role)));
      const expected = TRANSPORT_ACTIONS.filter((action) => roleCanPerform(role, action)).sort();

      expect(view.role).toBe(role);
      expect(view.actions).toEqual(expected);
      expect([...view.actions]).toEqual([...view.actions].sort());
    });

    /*
     * Doi chieu voi CHINH GUARD, khong chi voi bang: moi ma tra ve phai qua duoc guard, moi ma bi
     * guard chan phai vang mat. Pham vi ben huu quan bi loai khoi phep doi chieu vi guard cho no qua
     * tang vai co y — cong that cua no la mot hang du lieu, khong phai mot vai.
     */
    it(`${role}: khong lech voi TransportActionGuard o mot ma nao`, () => {
      const user = userWith(role);
      const listed = new Set(controller.access(requestOf(user)).actions);
      const drift = TRANSPORT_ACTIONS.filter((action) => !isStakeholderScopeAction(action)).filter(
        (action) => guardAllows(user, action) !== listed.has(action),
      );

      expect(drift).toEqual([]);
    });
  }

  it('MANAGER chua duoc cap gi trong mien van tai', () => {
    expect(controller.access(requestOf(userWith('MANAGER'))).actions).toEqual([]);
  });

  it('Ke toan khong doc duoc duong di tho', () => {
    const actions = controller.access(requestOf(userWith('ACCOUNTING'))).actions;

    expect(actions.length).toBeGreaterThan(0);
    expect(actions).not.toContain('transport.location.history.read');
    expect(actions).toContain('transport.tracking.read');
  });

  it('khong co phien -> 401', () => {
    expect(() => controller.access(requestOf(undefined))).toThrow(UnauthorizedException);
    try {
      controller.access(requestOf(undefined));
    } catch (error) {
      expect((error as UnauthorizedException).getStatus()).toBe(401);
    }
  });

  it('den cung transport-core va bien mat cung no', () => {
    const names = (capabilities: Parameters<typeof buildAppComposition>[0]) =>
      buildAppComposition(capabilities).controllers.map((controller) => controller.name);

    expect(names(['transport-core'])).toContain('TransportAccessController');
    expect(names(['knowledge'])).not.toContain('TransportAccessController');
  });
});
