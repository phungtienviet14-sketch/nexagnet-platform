import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { CampaignController } from '../campaigns/campaign.controller.js';
import { ContentController } from '../content/content.controller.js';
import { DemoController } from '../demo/demo.controller.js';
import { GroupParticipantsController } from '../groups/group-participants.controller.js';
import { KnowledgeController } from '../knowledge/knowledge.controller.js';
import { OrdersController } from '../orders/orders.controller.js';
import { MessagesController } from '../turns/turns.controller.js';
import { BroadcastController } from '../broadcast/broadcast.controller.js';
import { MasterDataController } from '../settings/master-data.controller.js';
import { SettingsController } from '../settings/settings.controller.js';
import { ZaloController } from '../channels/zalo.controller.js';
import { DriverFundController } from '../transport/costing/driver-fund.controller.js';
import { DriverFundSelfController } from '../transport/costing/driver-fund-self.controller.js';
import { TripExpensesController } from '../transport/costing/trip-expenses.controller.js';
import { FleetController } from '../transport/fleet/fleet.controller.js';
import { DriverTripsController } from '../transport/trips/driver-trips.controller.js';
import { TripsController } from '../transport/trips/trips.controller.js';
import { UsersController } from './users.controller.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import type { UserRole } from './auth.types.js';

/**
 * §9 gd1-ultty: moi mutation cham nguon su that / tien / thao tac van hanh phai co vai.
 * Bai test nay CO Y duyet TOAN BO controller thay vi liet ke tung route: them mot route
 * POST/PUT/PATCH/DELETE moi ma quen `@Roles` se lam do ngay, khong cho tuot ra pilot.
 */
const CONTROLLERS = [
  BroadcastController,
  CampaignController,
  ContentController,
  DemoController,
  GroupParticipantsController,
  KnowledgeController,
  MasterDataController,
  MessagesController,
  OrdersController,
  SettingsController,
  UsersController,
  ZaloController,
  // Van tai: moi mutation cham doi xe / chuyen / phan cong deu la thao tac van hanh.
  FleetController,
  TripsController,
  DriverTripsController,
  // Van tai T3: moi mutation o day cham TIEN. Neu co dieu gi phai co vai thi la nhung route nay.
  TripExpensesController,
  DriverFundController,
  DriverFundSelfController,
];

/**
 * Khoa metadata cua Nest. `@nestjs/common/constants` khong co khai bao type nen khong import
 * duoc; hai chuoi nay la gia tri Nest dung. Neu Nest doi khoa, bai test "tim thay route"
 * ben duoi se do ngay thay vi lang le duyet qua mot danh sach rong.
 */
const METHOD_METADATA = 'method';
const PATH_METADATA = 'path';

const MUTATING = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

interface RouteInfo {
  readonly label: string;
  readonly handler: (...args: never[]) => unknown;
  readonly controller: NewableFunction;
}

function mutatingRoutes(controller: NewableFunction): RouteInfo[] {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => prototype[name])
    .filter((value): value is (...args: never[]) => unknown => typeof value === 'function')
    .filter((handler) => MUTATING.has(Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod))
    .map((handler) => ({
      label: `${controller.name}.${handler.name} ${String(Reflect.getMetadata(PATH_METADATA, handler))}`,
      handler,
      controller,
    }));
}

describe('RBAC coverage (§9)', () => {
  const reflector = new Reflector();

  it('moi route POST/PUT/PATCH/DELETE deu khai bao vai hoac duoc danh dau @Public', () => {
    const routes = CONTROLLERS.flatMap(mutatingRoutes);
    // Luoi an toan: neu Nest doi khoa metadata thi `routes` rong va bai test se "xanh gia".
    expect(routes.length).toBeGreaterThan(20);

    const unprotected = routes.filter((route) => {
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        route.handler,
        route.controller,
      ]);
      if (isPublic) return false;
      const roles = reflector.getAllAndOverride<readonly UserRole[]>(ROLES_KEY, [
        route.handler,
        route.controller,
      ]);
      return !roles || roles.length === 0;
    });

    expect(unprotected.map((route) => route.label)).toEqual([]);
  });

  it('cong tac van hanh nhay cam chi danh cho MANAGER/ADMIN', () => {
    const rolesOf = (controller: NewableFunction, method: string): readonly UserRole[] | undefined =>
      reflector.getAllAndOverride<readonly UserRole[]>(ROLES_KEY, [
        (controller.prototype as Record<string, (...args: never[]) => unknown>)[method]!,
        controller,
      ]);

    // Cong tac tat/bat auto-send + kich hoat ky gia = vung tien/van hanh.
    expect(rolesOf(SettingsController, 'setAutoSend')).toEqual(['MANAGER', 'ADMIN']);
    expect(rolesOf(SettingsController, 'activatePricePeriod')).toEqual(['MANAGER', 'ADMIN']);
    expect(rolesOf(KnowledgeController, 'reload')).toEqual(['MANAGER', 'ADMIN']);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  function contextFor(role: UserRole | null, required: readonly UserRole[]) {
    const handler = (): undefined => undefined;
    Reflect.defineMetadata(ROLES_KEY, required, handler);
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => (role ? { authUser: { role } } : {}),
      }),
    } as unknown as Parameters<RolesGuard['canActivate']>[0];
  }

  it('cho qua khi dung vai, chan 403 khi sai vai va khi chua dang nhap', () => {
    vi.stubEnv('AUTH_MODE', 'session');
    // AUTH_MODE=session bat buoc co SESSION_SECRET >= 32 ky tu, neu khong loadEnv() se nem.
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(48));
    try {
      expect(guard.canActivate(contextFor('MANAGER', ['MANAGER', 'ADMIN']))).toBe(true);
      expect(() => guard.canActivate(contextFor('SALE', ['MANAGER', 'ADMIN']))).toThrow(
        ForbiddenException,
      );
      // Chua dang nhap: SessionAuthGuard da tra 401 truoc do; neu lot toi day van phai chan.
      expect(() => guard.canActivate(contextFor(null, ['MANAGER', 'ADMIN']))).toThrow(
        ForbiddenException,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
