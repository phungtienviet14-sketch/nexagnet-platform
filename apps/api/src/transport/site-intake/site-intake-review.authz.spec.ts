import 'reflect-metadata';
import { Module, type DynamicModule, type INestApplication } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { UserRole } from '../../auth/auth.types.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { InMemoryCounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from '../counterparty/site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { InMemoryRunPlanRepository } from '../planning/planning.repository.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
import { UnconfiguredPlaceSearchAdapter } from '../places/place-search.port.js';
import { TransportPlaceService } from '../places/place.service.js';
import { InMemoryGeofenceRepository } from '../proof/geofence.repository.js';
import { TransportActionGuard } from '../transport-action.guard.js';
import { DriverSiteIntakeController } from './driver-site-intake.controller.js';
import { SiteIntakeCommercialService } from './site-intake-commercial.service.js';
import { InMemorySiteIntakeCommercialStore } from './site-intake-commercial.store.js';
import { MovementSiteIntakeConfirmationWriter } from './site-intake-confirmation.writer.js';
import {
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  type SiteIntakeObservationFacts,
} from './site-intake-facts.port.js';
import { SiteIntakePlaceSearchBridge } from './site-intake-place-search.bridge.js';
import { SiteIntakeReadinessReader } from './site-intake-readiness.reader.js';
import { SiteIntakeReviewController } from './site-intake-review.controller.js';
import { SiteIntakeReviewService } from './site-intake-review.service.js';
import { InMemoryRunSiteIntakeRepository } from './site-intake.repository.js';
import { SiteIntakeService } from './site-intake.service.js';

/**
 * QUYEN cua cac tuyen `#398` — do qua HTTP THAT, voi HAI guard THAT.
 *
 * ============================================================================================
 * VI SAO KHONG BOOT `AppModule`
 * ============================================================================================
 *
 * Bai HTTP duy nhat cua mien (`toll-review.http.spec.ts`) boot ca `AppModule` o `AUTH_MODE=api-key`
 * — che do do KHONG co vai, nen `RolesGuard` va `TransportActionGuard` deu tu rut lui. Bai o day can
 * dung dieu nguoc lai: `AUTH_MODE=session`, vai that, va CHINH hai guard do. Nen no dung mot app Nest
 * nho: HAI controller that (`transport/site-intakes` + `transport/me/site-intake`), `RolesGuard`
 * dang ky `APP_GUARD` y nhu `app-composition.ts`, `TransportActionGuard` qua `@UseGuards` cua chinh
 * controller, va dich vu THAT tren kho trong bo nho (`PERSISTENCE=memory`).
 *
 * Phan DUY NHAT gia lap la `SessionAuthGuard`: mot middleware dat `request.authUser` tu hai header
 * cua bai. Moi thu SAU phien — vai, ma hanh dong, controller, anh xa loi mien -> ma HTTP — la that.
 *
 * Bai khang dinh bang MA TRANG THAI va bang DU LIEU: mot lan bi 403 phai khong de lai gi trong kho.
 */

const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const ORIGIN = { latitude: 21.35, longitude: 106.35 };
const DESTINATION = { latitude: 21.03, longitude: 105.85 };
const DRIVER_A = 'lai-xe-a';
const DRIVER_B = 'lai-xe-b';
const DRIVER_C = 'lai-xe-c';
const OFFICE = 'van-phong';
const USER_HEADER = 'x-test-user';
const ROLE_HEADER = 'x-test-role';

const PLANNING_POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'DEPOT-HN', label: 'Bai xe Ha Noi' }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

class NoLocationFacts extends TransportSiteIntakeLocationFacts {
  async findObservation(): Promise<SiteIntakeObservationFacts | null> {
    return null;
  }
}

@Module({})
class SiteIntakeAuthzHarness {}

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
}

interface Caller {
  readonly id: string;
  readonly role: UserRole;
}

/** Nguoi goi cua bai — `id` la `authUserId` ma ho so lai xe tro toi. */
const as = (id: string, role: UserRole): Caller => ({ id, role });

/** Dung phan `SessionAuthGuard` lam truoc hai guard vai: dat `authUser` len yeu cau. */
function fakeSession(request: Request, _response: Response, next: NextFunction): void {
  const id = request.header(USER_HEADER);
  const role = request.header(ROLE_HEADER);
  if (id && role) {
    const now = new Date().toISOString();
    (request as unknown as Record<string, unknown>).authUser = {
      id,
      username: id,
      name: id,
      email: null,
      phone: null,
      role,
      credentialVersion: 1,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }
  next();
}

describe('quyen cac tuyen viec tai xe nhan truc tiep qua HTTP that (#398)', () => {
  const fleet = new InMemoryFleetRepository();
  const movementRepo = new InMemoryMovementRepository();
  const plans = new InMemoryRunPlanRepository();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  const movement = new MovementService(movementRepo, fleet, audit, POLICY);
  const intakes = new InMemoryRunSiteIntakeRepository();
  const sites = new InMemoryCounterpartySiteRepository();
  const counterparties = new InMemoryCounterpartyRepository();
  const geofences = new InMemoryGeofenceRepository();
  const siteService = new CounterpartySiteService(sites, counterparties);
  const core = new TransportSiteIntakeCoreFactsAdapter(fleet, movementRepo, siteService);
  const geo = new TransportSiteIntakeGeoFactsAdapter(geofences, siteService);
  const intakeService = new SiteIntakeService(
    intakes,
    core,
    geo,
    new NoLocationFacts(),
    movement,
    new MovementSiteIntakeConfirmationWriter(movement, intakes, core),
    POLICY,
  );
  const store = new InMemorySiteIntakeCommercialStore(intakes, movementRepo, plans, audit);
  const reader = new SiteIntakeReadinessReader(core, geo, PLANNING_POLICY);
  const commercial = new SiteIntakeCommercialService(store, intakes, core, geo, reader);
  const reviews = new SiteIntakeReviewService(store, intakes, movementRepo, plans, core, reader);
  const places = new SiteIntakePlaceSearchBridge(
    new TransportPlaceService(new UnconfiguredPlaceSearchAdapter()),
  );

  const harness = (): DynamicModule => ({
    module: SiteIntakeAuthzHarness,
    controllers: [SiteIntakeReviewController, DriverSiteIntakeController],
    providers: [
      { provide: SiteIntakeService, useValue: intakeService },
      { provide: SiteIntakeCommercialService, useValue: commercial },
      { provide: SiteIntakeReviewService, useValue: reviews },
      { provide: SiteIntakePlaceSearchBridge, useValue: places },
      TransportActionGuard,
      // Cung vi tri voi `app-composition.ts`: guard vai toan cuc, chay truoc guard cua controller.
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  });

  let app: INestApplication | undefined;
  let base = '';
  let siteId = '';
  let destinationPlaceId = '';
  let intakeOfA = '';
  let intakeOfC = '';

  const send = async (
    caller: Caller,
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
  ): Promise<Reply> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        [USER_HEADER]: caller.id,
        [ROLE_HEADER]: caller.role,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text === '' ? null : (JSON.parse(text) as Record<string, unknown>),
    };
  };

  const aDriver = async (plate: string, authUserId: string) => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: plate,
      vehicleClass: 'Dau keo',
    });
    const driver = await fleet.createDriver({
      fullName: `Lai xe ${plate}`,
      phone: `09${plate.replace(/\D/g, '')}`,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId,
    });
    await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
  };

  /** Lai xe bam "Nhan chuyen tai day" QUA HTTP — chinh tuyen cua app lai xe. */
  const confirmOverHttp = async (authUserId: string): Promise<string> => {
    const reply = await send(
      as(authUserId, 'SALE'),
      'POST',
      '/transport/me/site-intake/confirmations',
      {
        siteId,
        clientEventId: `cham-${authUserId}`,
        latitude: ORIGIN.latitude,
        longitude: ORIGIN.longitude,
        accuracyMetres: 10,
      },
    );
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    return String(reply.body?.['intakeId']);
  };

  /** Dau vet cua mot lan nhan viec — mot lan bi 403/404 phai de nguyen no. */
  const stateOf = async (intakeId: string) => ({
    commercial: await store.findByIntake(intakeId),
    orders: (await movementRepo.listOrders()).length,
    audit: (await audit.list()).length,
  });

  beforeAll(async () => {
    vi.stubEnv('AUTH_MODE', 'session');
    // AUTH_MODE=session bat buoc co SESSION_SECRET >= 32 ky tu, neu khong loadEnv() se nem.
    vi.stubEnv('SESSION_SECRET', 's'.repeat(48));

    const party = await counterparties.create({ name: 'Cong ty ABC' });
    siteId = (
      await sites.create({
        counterpartyId: party.id,
        name: 'Kho A',
        address: null,
        note: null,
        status: 'ACTIVE',
        recordedBy: OFFICE,
      })
    ).id;
    await geofences.register({
      label: 'Kho A',
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: siteId,
      latitude: ORIGIN.latitude,
      longitude: ORIGIN.longitude,
      radiusMetres: 300,
      note: null,
      recordedBy: OFFICE,
    });
    destinationPlaceId = (
      await geofences.register({
        label: 'Bai xe B',
        subjectKind: 'DEPOT',
        subjectId: 'BAI-B',
        latitude: DESTINATION.latitude,
        longitude: DESTINATION.longitude,
        radiusMetres: 200,
        note: null,
        recordedBy: OFFICE,
      })
    ).id;
    await aDriver('15C-11111', DRIVER_A);
    await aDriver('15C-22222', DRIVER_B);
    await aDriver('15C-33333', DRIVER_C);

    app = await NestFactory.create(harness(), { logger: false, abortOnError: false });
    app.use(fakeSession);
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    intakeOfA = await confirmOverHttp(DRIVER_A);
    intakeOfC = await confirmOverHttp(DRIVER_C);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  /* ================================================================ *
   * Lai xe (SALE) KHONG cham duoc be mat van phong
   * ================================================================ */

  describe('lai xe (SALE) -> 403 o moi tuyen van phong, khong ghi gi', () => {
    const officeRoutes = (intakeId: string) =>
      [
        ['GET', '/transport/site-intakes', undefined],
        ['GET', `/transport/site-intakes/${intakeId}`, undefined],
        ['POST', `/transport/site-intakes/${intakeId}/complete`, { idempotencyKey: 'k-sale' }],
        [
          'POST',
          `/transport/site-intakes/${intakeId}/bind-order`,
          { orderId: 'don-bat-ky', idempotencyKey: 'k-sale' },
        ],
        [
          'POST',
          `/transport/site-intakes/${intakeId}/exception`,
          { reason: 'Tu huy viec cua minh', idempotencyKey: 'k-sale' },
        ],
      ] as const;

    it.each([0, 1, 2, 3, 4])('tuyen #%i', async (index) => {
      const [method, path, payload] = officeRoutes(intakeOfA)[index]!;
      const before = await stateOf(intakeOfA);

      // CHINH chu lan nhan viec cung khong duoc: be mat van phong khong co pham vi "cua minh".
      const reply = await send(as(DRIVER_A, 'SALE'), method, path, payload);

      expect(reply.status, `${method} ${path}`).toBe(403);
      expect(await stateOf(intakeOfA)).toEqual(before);
    });

    it('lan nhan viec van PENDING, chua co diem giao, chua co don', async () => {
      expect(await store.findByIntake(intakeOfA)).toMatchObject({
        status: 'PENDING',
        destination: null,
        binding: null,
        exception: null,
      });
    });
  });

  /* ================================================================ *
   * Ke toan: hoan thien duoc, bao bat thuong KHONG duoc
   * ================================================================ */

  describe('ke toan (ACCOUNTING)', () => {
    it('POST :id/exception -> 403, khong huy gi', async () => {
      const before = await stateOf(intakeOfA);

      const reply = await send(
        as(OFFICE, 'ACCOUNTING'),
        'POST',
        `/transport/site-intakes/${intakeOfA}/exception`,
        { reason: 'Ke toan tu huy', idempotencyKey: 'k-ke-toan' },
      );

      expect(reply.status).toBe(403);
      expect(await stateOf(intakeOfA)).toEqual(before);
    });

    it('POST :id/complete -> 200 (qua ca hai guard, toi dich vu that)', async () => {
      const reply = await send(
        as(OFFICE, 'ACCOUNTING'),
        'POST',
        `/transport/site-intakes/${intakeOfA}/complete`,
        { idempotencyKey: 'k-hoan-thien' },
      );

      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      // Chua co diem giao thi KHONG tao don — ly do co ma, viec van cho.
      expect(reply.body?.['outcome']).toMatchObject({
        status: 'PENDING',
        bound: false,
        readiness: expect.objectContaining({
          kind: 'NEEDS_REVIEW',
          reasons: expect.arrayContaining(['DESTINATION_MISSING']),
        }),
      });
    });

    it('GET danh sach + POST :id/bind-order qua duoc guard (404 la cua dich vu, khong phai 403)', async () => {
      const list = await send(as(OFFICE, 'ACCOUNTING'), 'GET', '/transport/site-intakes');
      expect(list.status).toBe(200);

      const bind = await send(
        as(OFFICE, 'ACCOUNTING'),
        'POST',
        `/transport/site-intakes/${intakeOfA}/bind-order`,
        { orderId: 'khong-co-that', idempotencyKey: 'k-gan' },
      );
      expect(bind.status).toBe(404);
      expect(bind.body?.['reason']).toBe('SITE_INTAKE_ORDER_NOT_FOUND');
    });
  });

  it('doi chung duong: giam doc (ADMIN) POST :id/exception -> 200 — tuyen song, 403 o tren la cua QUYEN', async () => {
    const reply = await send(
      as('giam-doc', 'ADMIN'),
      'POST',
      `/transport/site-intakes/${intakeOfC}/exception`,
      { reason: 'Khach huy truoc khi xe chay', idempotencyKey: 'k-giam-doc' },
    );

    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(reply.body?.['outcome']).toMatchObject({
      outcome: 'INTAKE_REJECTED_WORK_CANCELLED',
      status: 'REJECTED',
    });
  });

  /* ================================================================ *
   * Lai xe chi thay viec CUA CHINH MINH
   * ================================================================ */

  describe('lai xe doc / sua viec cua lai xe KHAC -> 404, cung ma voi khong co that', () => {
    it('GET /transport/me/site-intake/:id cua nguoi khac -> 404 SITE_INTAKE_NOT_FOUND; chu viec -> 200', async () => {
      const own = await send(as(DRIVER_A, 'SALE'), 'GET', `/transport/me/site-intake/${intakeOfA}`);
      expect(own.status).toBe(200);
      expect(own.body).toMatchObject({ intakeId: intakeOfA, stage: 'NEEDS_DESTINATION' });

      const other = await send(
        as(DRIVER_B, 'SALE'),
        'GET',
        `/transport/me/site-intake/${intakeOfA}`,
      );
      const ghost = await send(
        as(DRIVER_B, 'SALE'),
        'GET',
        '/transport/me/site-intake/khong-co-that',
      );

      expect(other.status).toBe(404);
      expect(other.body?.['reason']).toBe('SITE_INTAKE_NOT_FOUND');
      // Khong do duoc id nao ton tai: viec cua nguoi khac va id bia tra CUNG mot than.
      expect(other.body).toEqual(ghost.body);
    });

    it('POST /transport/me/site-intake/:id/destination cua nguoi khac -> 404, diem giao khong doi', async () => {
      const before = await stateOf(intakeOfA);

      const reply = await send(
        as(DRIVER_B, 'SALE'),
        'POST',
        `/transport/me/site-intake/${intakeOfA}/destination`,
        {
          clientEventId: 'cuop-viec',
          destination: { kind: 'KNOWN_PLACE', placeId: destinationPlaceId },
        },
      );

      expect(reply.status).toBe(404);
      expect(reply.body?.['reason']).toBe('SITE_INTAKE_NOT_FOUND');
      expect(await stateOf(intakeOfA)).toEqual(before);
    });
  });
});
