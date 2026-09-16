import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import {
  FUEL_CONSUMPTION_MAX_ENTRIES,
  FuelConsumptionReadService,
} from './fuel-consumption.service.js';
import type { FuelVerificationStatus } from './fuel-lifecycle.js';
import {
  TransportFuelCoreFacts,
  type FuelDriverFacts,
  type FuelTripFacts,
  type FuelVehicleFacts,
} from './fuel.ports.js';
import { FuelRepository } from './fuel.repository.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';

/**
 * SEAM DOC cua drill-down tieu hao — `#313`.
 *
 * Hai dieu duoc khoa o day ma ham thuan khong khoa duoc: (1) DUNG xe, DUNG ky, doc HET qua nhieu
 * trang, va moc truoc ky bo qua phieu bi tu choi; (2) service KHONG goi mot ham ghi nao cua kho.
 */

const VEHICLE = 'xe-1';
const OTHER_VEHICLE = 'xe-2';

class StubCoreFacts extends TransportFuelCoreFacts {
  async findTrip(): Promise<FuelTripFacts | null> {
    return null;
  }
  async findTripByCode(): Promise<FuelTripFacts | null> {
    return null;
  }
  async findVehicle(vehicleId: string): Promise<FuelVehicleFacts | null> {
    if (vehicleId === VEHICLE) {
      return { id: VEHICLE, registrationPlate: '29C-123.45', vehicleClass: 'tai-5-tan' };
    }
    if (vehicleId === OTHER_VEHICLE) {
      return { id: OTHER_VEHICLE, registrationPlate: '29C-999.99', vehicleClass: 'container' };
    }
    return null;
  }
  async listDrivers(): Promise<FuelDriverFacts[]> {
    return [];
  }
  async listVehicles(): Promise<FuelVehicleFacts[]> {
    return [];
  }
  async findDriver(): Promise<FuelDriverFacts | null> {
    return null;
  }
  async findDriverByAuthUserId(): Promise<FuelDriverFacts | null> {
    return null;
  }
  async wasDriverEverAssignedToTrip(): Promise<boolean> {
    return false;
  }
  async wasVehicleEverAssignedToTrip(): Promise<boolean> {
    return false;
  }
}

const POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: { 'tai-5-tan': 30 }, tolerancePercent: 10 },
};

let repository: InMemoryFuelRepository;
let service: FuelConsumptionReadService;
let seeded = 0;

beforeEach(() => {
  repository = new InMemoryFuelRepository();
  service = new FuelConsumptionReadService(repository, new StubCoreFacts(), POLICY);
  seeded = 0;
});

const seed = async (input: {
  readonly vehicleId?: string;
  readonly businessDate: string;
  readonly odometerKm: number;
  readonly liters: number;
  readonly status?: FuelVerificationStatus;
}) => {
  seeded += 1;
  const entry = await repository.createEntry({
    tripId: 'chuyen-1',
    vehicleId: input.vehicleId ?? VEHICLE,
    driverId: 'lai-xe-1',
    supplierId: 'cay-xang-1',
    businessDate: input.businessDate,
    occurredAt: new Date(`${input.businessDate}T01:00:00.000Z`),
    litersUnits: input.liters * 1000,
    amount: input.liters * 23_000,
    odometerKm: input.odometerKm,
    previousOdometerKm: null,
    consumptionUnits: null,
    reviewReasons: [],
    paymentMethod: 'SUPPLIER_ACCOUNT',
    sourceStatementId: null,
    correlationKey: `khoa-${seeded}`,
    invoiceNo: null,
    note: null,
    declaredBy: 'lai-xe-1',
    at: new Date('2026-09-10T00:00:00.000Z'),
  });
  const status = input.status ?? 'VERIFIED';
  if (status === 'DECLARED') return entry;
  const moved = await repository.setEntryVerification(entry.id, 'DECLARED', {
    to: status,
    actor: 'ke-toan',
    reviewNote: status === 'REJECTED' ? 'odo sai' : null,
    at: new Date('2026-09-10T00:00:00.000Z'),
  });
  if (!moved) throw new Error('khong doi duoc trang thai phieu mau');
  return moved;
};

describe('FuelConsumptionReadService.vehicleConsumption', () => {
  it('chi doc phieu cua DUNG xe trong DUNG ky, kem dinh muc cua hang xe', async () => {
    await seed({ businessDate: '2026-09-01', odometerKm: 1_000, liters: 60 });
    await seed({ businessDate: '2026-09-05', odometerKm: 1_400, liters: 120 });
    await seed({ businessDate: '2026-10-01', odometerKm: 1_900, liters: 150 });
    await seed({
      vehicleId: OTHER_VEHICLE,
      businessDate: '2026-09-03',
      odometerKm: 50,
      liters: 99,
    });

    const result = await service.vehicleConsumption({
      vehicleId: VEHICLE,
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(result.vehicle).toEqual({
      id: VEHICLE,
      registrationPlate: '29C-123.45',
      vehicleClass: 'tai-5-tan',
    });
    expect(result.period).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(result.norm).toEqual({ normL100km: 30, tolerancePercent: 10 });
    expect(result.links.map((link) => link.odometerKm)).toEqual([1_000, 1_400]);
    expect(result.links[1]).toMatchObject({ state: 'COMPUTED', consumptionUnits: 30_000 });
    expect(result.isTruncated).toBe(false);
  });

  it('moc truoc ky la phieu con hieu luc GAN NHAT — phieu bi tu choi sau no bi bo qua', async () => {
    await seed({ businessDate: '2026-08-20', odometerKm: 800, liters: 40 });
    await seed({ businessDate: '2026-08-28', odometerKm: 900, liters: 30, status: 'REJECTED' });
    await seed({ businessDate: '2026-09-02', odometerKm: 1_000, liters: 60 });

    const result = await service.vehicleConsumption({
      vehicleId: VEHICLE,
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(result.leadIn).toMatchObject({ businessDate: '2026-08-20', odometerKm: 800 });
    // 60 L / 200 km — moc la 800, KHONG phai 900 cua phieu bi tu choi.
    expect(result.links[0]).toMatchObject({
      state: 'COMPUTED',
      distanceKm: 200,
      consumptionUnits: 30_000,
    });
  });

  it('phieu CHUA xac thuc truoc ky van la moc — no chua bi ai bac bo', async () => {
    await seed({ businessDate: '2026-08-20', odometerKm: 800, liters: 40, status: 'VERIFIED' });
    await seed({ businessDate: '2026-08-25', odometerKm: 850, liters: 20, status: 'DECLARED' });
    await seed({ businessDate: '2026-09-02', odometerKm: 1_050, liters: 60 });

    const result = await service.vehicleConsumption({
      vehicleId: VEHICLE,
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(result.leadIn).toMatchObject({ businessDate: '2026-08-25', odometerKm: 850 });
  });

  it('doc HET qua nhieu trang cua kho (hon 200 phieu mot ky)', async () => {
    for (let day = 0; day < 230; day += 1) {
      const date = new Date(Date.UTC(2026, 6, 1) + day * 86_400_000).toISOString().slice(0, 10);
      await seed({ businessDate: date, odometerKm: 1_000 + day * 100, liters: 30 });
    }

    const result = await service.vehicleConsumption({
      vehicleId: VEHICLE,
      from: '2026-07-01',
      to: '2027-02-15',
    });

    expect(result.links).toHaveLength(230);
    expect(result.summary.computedCount).toBe(229);
    expect(new Set(result.links.map((link) => link.entryId)).size).toBe(230);
    expect(result.isTruncated).toBe(false);
  });

  it('vuot tran doc thi noi THAT la da cat, khong am tham tra thieu', async () => {
    for (let index = 0; index <= FUEL_CONSUMPTION_MAX_ENTRIES; index += 1) {
      await seed({ businessDate: '2026-09-01', odometerKm: 1_000 + index, liters: 1 });
    }

    const result = await service.vehicleConsumption({
      vehicleId: VEHICLE,
      from: '2026-09-01',
      to: '2026-09-01',
    });

    expect(result.isTruncated).toBe(true);
    expect(result.links).toHaveLength(FUEL_CONSUMPTION_MAX_ENTRIES);
  });

  it('xe khong ton tai -> NOT_FOUND co ma, khong phai mot drill-down rong', async () => {
    const attempt = service.vehicleConsumption({
      vehicleId: 'khong-co',
      from: '2026-09-01',
      to: '2026-09-30',
    });

    await expect(attempt).rejects.toBeInstanceOf(TransportDomainError);
    await expect(attempt).rejects.toMatchObject({ kind: 'NOT_FOUND', reason: 'VEHICLE_NOT_FOUND' });
  });

  it('CHI DOC: khong mot ham ghi nao cua kho bi goi', async () => {
    await seed({ businessDate: '2026-09-01', odometerKm: 1_000, liters: 60 });
    await seed({ businessDate: '2026-09-02', odometerKm: 1_200, liters: 60 });

    const called: string[] = [];
    const watched = new Proxy(repository, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          called.push(String(property));
          return (value as (...inner: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as FuelRepository;

    await new FuelConsumptionReadService(watched, new StubCoreFacts(), POLICY).vehicleConsumption({
      vehicleId: VEHICLE,
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(called.length).toBeGreaterThan(0);
    expect(new Set(called)).toEqual(new Set(['listEntriesForInbox']));
  });
});

describe('ranh gioi tien cua seam drill-down', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sources = [
    'fuel-consumption-drilldown.ts',
    'fuel-consumption.service.ts',
    'fuel-consumption.controller.ts',
  ].map((name) => ({ name, text: readFileSync(resolve(here, name), 'utf8') }));

  /**
   * Canh bao tieu hao KHONG duoc co duong nao toi quy lai xe, bang luong hay cong no.
   *
   * Khong co import thi khong co duong goi — va mot lan them import nhu vay phai lam do bai nay
   * truoc khi no kip lam do mot bang luong.
   */
  it.each(sources)('$name khong import mien tien/luong nao', ({ text }) => {
    for (const forbidden of [
      '../costing/',
      '../driver-settlement/',
      '../workforce/',
      '../settlement/',
      '../claims/',
      'fuel-settlement',
      'FuelCostingPort',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
