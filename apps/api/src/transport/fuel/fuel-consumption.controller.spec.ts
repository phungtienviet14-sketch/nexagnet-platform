import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UserRole } from '../../auth/auth.types.js';
import { TRANSPORT_ACTION_KEY, TransportActionGuard } from '../transport-action.guard.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  FUEL_CONSUMPTION_MAX_SPAN_DAYS,
  FuelConsumptionController,
} from './fuel-consumption.controller.js';
import type {
  FuelConsumptionReadService,
  FuelVehicleConsumptionQuery,
} from './fuel-consumption.service.js';

/**
 * BE MAT HTTP cua drill-down tieu hao — `#313`.
 *
 * Khong co bai HTTP nao trong kho nay chay guard qua mot app that, nen bai nay chay CHINH
 * `TransportActionGuard` tren metadata cua CHINH route nay, o che do `AUTH_MODE=session` — che do
 * cua moi stack da trien khai. Vai lai xe (`SALE`) phai bi chan; ke toan va giam doc thi khong.
 */

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

class RecordingReadService {
  readonly queries: FuelVehicleConsumptionQuery[] = [];
  failWith: Error | null = null;

  async vehicleConsumption(query: FuelVehicleConsumptionQuery) {
    this.queries.push(query);
    if (this.failWith) throw this.failWith;
    return { vehicle: { id: query.vehicleId } };
  }
}

let read: RecordingReadService;
let controller: FuelConsumptionController;

beforeEach(() => {
  read = new RecordingReadService();
  controller = new FuelConsumptionController(read as unknown as FuelConsumptionReadService);
});

describe('hinh dang route', () => {
  it('dung MOT route GET duoi transport/fuel, gac bang transport.fuel.entry.read', () => {
    const prototype = FuelConsumptionController.prototype as unknown as Record<string, unknown>;
    const handlers = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => prototype[name])
      .filter((value): value is () => unknown => typeof value === 'function')
      .filter((handler) => Reflect.getMetadata(METHOD_METADATA, handler) !== undefined);

    expect(Reflect.getMetadata(PATH_METADATA, FuelConsumptionController)).toBe('transport/fuel');
    expect(handlers).toHaveLength(1);
    const handler = handlers[0];
    if (!handler) throw new Error('khong tim thay route nao tren controller');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('vehicles/:vehicleId/consumption');
    expect(Reflect.getMetadata(TRANSPORT_ACTION_KEY, handler)).toBe('transport.fuel.entry.read');
  });
});

describe('cong vai o che do session', () => {
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

  const contextFor = (role: UserRole): ExecutionContext =>
    ({
      getHandler: () => FuelConsumptionController.prototype.vehicleConsumption,
      getClass: () => FuelConsumptionController,
      switchToHttp: () => ({
        getRequest: () => ({ authUser: { id: `user-${role}`, role }, headers: {} }),
      }),
    }) as unknown as ExecutionContext;

  const guard = new TransportActionGuard(new Reflector());

  it('lai xe (SALE) KHONG doc duoc drill-down cua ca doi', () => {
    expect(() => guard.canActivate(contextFor('SALE'))).toThrow(ForbiddenException);
  });

  it('MANAGER chua duoc cap quyen van tai nao nen cung bi chan', () => {
    expect(() => guard.canActivate(contextFor('MANAGER'))).toThrow(ForbiddenException);
  });

  it.each<UserRole>(['ACCOUNTING', 'ADMIN'])('%s doc duoc', (role) => {
    expect(guard.canActivate(contextFor(role))).toBe(true);
  });
});

describe('kiem khoang ngay o bien gioi HTTP', () => {
  it('khoang hop le di thang xuong service', async () => {
    await controller.vehicleConsumption('xe-1', { from: '2026-09-01', to: '2026-09-30' });

    expect(read.queries).toEqual([{ vehicleId: 'xe-1', from: '2026-09-01', to: '2026-09-30' }]);
  });

  it.each([
    ['thieu ca hai dau', {}],
    ['thieu dau cuoi', { from: '2026-09-01' }],
    ['ngay khong co that', { from: '2026-02-30', to: '2026-03-02' }],
    ['sai dinh dang', { from: '01/09/2026', to: '2026-09-30' }],
    ['dau sau truoc dau dau', { from: '2026-09-30', to: '2026-09-01' }],
  ])('%s -> 400, khong goi service', async (_label, query) => {
    await expect(controller.vehicleConsumption('xe-1', query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(read.queries).toEqual([]);
  });

  it(`khoang dai hon ${FUEL_CONSUMPTION_MAX_SPAN_DAYS} ngay -> 400: mot drill-down khong phai mot ban xuat ca nam`, async () => {
    await expect(
      controller.vehicleConsumption('xe-1', { from: '2026-01-01', to: '2026-12-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(read.queries).toEqual([]);
  });

  it('loi mien NOT_FOUND ra 404', async () => {
    read.failWith = TransportDomainError.notFound('VEHICLE_NOT_FOUND', 'khong co xe');

    await expect(
      controller.vehicleConsumption('khong-co', { from: '2026-09-01', to: '2026-09-30' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
