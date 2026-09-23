import { InMemoryAuditLogRepository } from '../../../audit/audit-log.repository.js';
import { AuditLogService } from '../../../audit/audit-log.service.js';
import { InMemoryMovementRepository } from '../../movement/movement.repository.js';
import type { RunLeg, VehicleRun } from '../../movement/movement.types.js';
import type { TransportCorePolicy } from '../../transport-policy.js';
import type { TripKind, TripStatus } from '../../trips/trip-lifecycle.js';
import { FuelCostAttributionReadService } from '../fuel-cost-attribution-read.service.js';
import { InMemoryFuelCostAttributionRepository } from '../fuel-cost-attribution.repository.js';
import { FuelCostAttributionService } from '../fuel-cost-attribution.service.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from '../fuel-policy.js';
import { FuelReadService } from '../fuel-read.service.js';
import { MovementFuelRunContextAdapter } from '../fuel-run-context.port.js';
import { InMemoryFuelStationRepository } from '../fuel-station.repository.js';
import {
  FuelCostingPort,
  TransportFuelCoreFacts,
  type FuelCostPostingCommand,
  type FuelDriverCashPostingCommand,
  type FuelDriverFacts,
  type FuelTripFacts,
  type FuelVehicleFacts,
} from '../fuel.ports.js';
import { FuelService, type SubmitFuelEntryCommand } from '../fuel.service.js';
import { InMemoryFuelRepository } from '../in-memory-fuel.repository.js';

/**
 * BO DUNG CHO BAI KIEM RUN-FIRST (`#364`) — kho trong bo nho, vong chay/chang/phan cong THAT qua
 * `InMemoryMovementRepository` (khong gia lap cong `FuelRunContextFacts`: adapter that chay tren kho
 * that, nen bai kiem do dung duong ma may chu di).
 *
 * `FuelCostingPort` la mot BAN GHI CHEP: bai kiem hoi duoc `TX-03` bi goi BAO NHIEU lan — cau hoi
 * "phieu Run-first co lot vao gia thanh chuyen / Quy lai xe khong" chi tra loi duoc bang so lan goi.
 */

export const VEHICLE_A = 'xe-a';
export const VEHICLE_B = 'xe-b';
export const DRIVER = 'lai-xe-binh';
export const OTHER_DRIVER = 'lai-xe-khac';
export const AUTH_USER = 'user-binh';
export const OTHER_AUTH_USER = 'user-khac';
export const LEGACY_TRIP = 'chuyen-cu-1';

export class RunFirstCoreFacts extends TransportFuelCoreFacts {
  tripKind: TripKind = 'OWN_DIRECT';
  tripStatus: TripStatus = 'IN_TRANSIT';

  async findTrip(tripId: string): Promise<FuelTripFacts | null> {
    if (tripId !== LEGACY_TRIP) return null;
    return { id: LEGACY_TRIP, code: 'CH-CU-01', kind: this.tripKind, status: this.tripStatus };
  }

  async findTripByCode(code: string): Promise<FuelTripFacts | null> {
    return code === 'CH-CU-01' ? this.findTrip(LEGACY_TRIP) : null;
  }

  async findVehicle(vehicleId: string): Promise<FuelVehicleFacts | null> {
    if (vehicleId === VEHICLE_A) {
      return { id: VEHICLE_A, registrationPlate: '29H-152.44', vehicleClass: 'tai-5-tan' };
    }
    if (vehicleId === VEHICLE_B) {
      return { id: VEHICLE_B, registrationPlate: '15C-556.33', vehicleClass: 'tai-5-tan' };
    }
    return null;
  }

  async listVehicles(): Promise<FuelVehicleFacts[]> {
    const found = await Promise.all([this.findVehicle(VEHICLE_A), this.findVehicle(VEHICLE_B)]);
    return found.filter((vehicle): vehicle is FuelVehicleFacts => vehicle !== null);
  }

  async listDrivers(): Promise<FuelDriverFacts[]> {
    return [
      { id: DRIVER, fullName: 'Nguyen Van Binh' },
      { id: OTHER_DRIVER, fullName: 'Lai xe khac' },
    ];
  }

  async findDriver(driverId: string): Promise<FuelDriverFacts | null> {
    return (await this.listDrivers()).find((driver) => driver.id === driverId) ?? null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<FuelDriverFacts | null> {
    if (authUserId === AUTH_USER) return this.findDriver(DRIVER);
    if (authUserId === OTHER_AUTH_USER) return this.findDriver(OTHER_DRIVER);
    return null;
  }

  async wasDriverEverAssignedToTrip(_tripId: string, driverId: string): Promise<boolean> {
    return driverId === DRIVER;
  }

  async wasVehicleEverAssignedToTrip(_tripId: string, vehicleId: string): Promise<boolean> {
    return vehicleId === VEHICLE_A;
  }
}

export class RecordingCostingPort extends FuelCostingPort {
  readonly commands: FuelCostPostingCommand[] = [];
  /** `#369` R-4 — moi lan goi ghi Quy lai xe Run-first, ke ca lan phat lai. */
  readonly driverCashCommands: FuelDriverCashPostingCommand[] = [];

  async postFuelCost(command: FuelCostPostingCommand): Promise<string> {
    this.commands.push(command);
    return `expense-of-${command.correlationKey}`;
  }

  /** Khoa tat dinh -> CUNG mot id but toan, y het `RunExpenseService` khi gap lai mot khoa da dung. */
  async postRunFirstDriverCash(command: FuelDriverCashPostingCommand): Promise<string> {
    this.driverCashCommands.push(command);
    return `fund-of-${command.correlationKey}`;
  }
}

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const FUEL_POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: { 'tai-5-tan': 30 }, tolerancePercent: 10 },
};

export interface RunFirstWorld {
  readonly fuelRepo: InMemoryFuelRepository;
  readonly movement: InMemoryMovementRepository;
  readonly core: RunFirstCoreFacts;
  readonly costing: RecordingCostingPort;
  readonly fuel: FuelService;
  readonly read: FuelReadService;
  readonly attribution: FuelCostAttributionService;
  readonly attributionRead: FuelCostAttributionReadService;
  readonly supplierId: string;
  /** Vong chay dang chay cua xe A, lai xe Binh dang duoc phan cong; hai chang (rong + co hang). */
  readonly run: VehicleRun;
  readonly emptyLeg: RunLeg;
  readonly loadedLeg: RunLeg;
  /** Vong chay cua XE B — lai xe Binh KHONG duoc phan cong. */
  readonly otherRun: VehicleRun;
  readonly otherLeg: RunLeg;
}

/**
 * `fuelRepo` thay duoc: `#371` can mot kho CHEN duoc mot lenh sua phieu vao giua lan kiem cua dich vu
 * va lan ghi cua tang kho. Mac dinh la kho trong bo nho thuong.
 */
export async function buildRunFirstWorld(
  options: { readonly fuelRepo?: InMemoryFuelRepository } = {},
): Promise<RunFirstWorld> {
  const fuelRepo = options.fuelRepo ?? new InMemoryFuelRepository();
  const movement = new InMemoryMovementRepository();
  const runs = new MovementFuelRunContextAdapter(movement);
  const core = new RunFirstCoreFacts();
  const costing = new RecordingCostingPort();
  const stations = new InMemoryFuelStationRepository();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  const attributions = new InMemoryFuelCostAttributionRepository(fuelRepo);
  const attributionRead = new FuelCostAttributionReadService(fuelRepo, attributions, runs, core);

  const at = new Date('2026-09-22T00:00:00Z');
  const supplierId = (
    await fuelRepo.createSupplier({
      name: 'Cay xang Petrolimex 21',
      code: 'PLX-21',
      phone: null,
      address: null,
      taxCode: null,
      at,
    })
  ).id;

  const run = await movement.createRun({
    code: 'RUN-364-A',
    vehicleId: VEHICLE_A,
    businessDate: '2026-09-22',
  });
  const emptyLeg = await movement.createLeg({
    runId: run.id,
    sequence: 1,
    kind: 'EMPTY',
    orderId: null,
    originLabel: 'Bai xe Long Bien',
    destinationLabel: 'Kho A',
    businessDate: '2026-09-22',
  });
  const loadedLeg = await movement.createLeg({
    runId: run.id,
    sequence: 2,
    kind: 'LOADED',
    orderId: null,
    originLabel: 'Kho A',
    destinationLabel: 'Kho B',
    businessDate: '2026-09-22',
  });
  await movement.assignRun(run.id, { driverId: DRIVER, effectiveFrom: at, assignedBy: 'dieu-do' });

  const otherRun = await movement.createRun({
    code: 'RUN-364-B',
    vehicleId: VEHICLE_B,
    businessDate: '2026-09-22',
  });
  const otherLeg = await movement.createLeg({
    runId: otherRun.id,
    sequence: 1,
    kind: 'LOADED',
    orderId: null,
    originLabel: 'Kho C',
    destinationLabel: 'Kho D',
    businessDate: '2026-09-22',
  });
  await movement.assignRun(otherRun.id, {
    driverId: OTHER_DRIVER,
    effectiveFrom: at,
    assignedBy: 'dieu-do',
  });

  const fuel = new FuelService(
    fuelRepo,
    stations,
    core,
    runs,
    costing,
    audit,
    CORE_POLICY,
    FUEL_POLICY,
  );
  const read = new FuelReadService(fuelRepo, core, stations, runs);
  const attribution = new FuelCostAttributionService(
    fuelRepo,
    attributions,
    runs,
    attributionRead,
    audit,
  );

  return {
    fuelRepo,
    movement,
    core,
    costing,
    fuel,
    read,
    attribution,
    attributionRead,
    supplierId,
    run,
    emptyLeg,
    loadedLeg,
    otherRun,
    otherLeg,
  };
}

let keySeed = 0;

/** Mot to khai Run-first HOP LE cua lai xe Binh tren vong chay xe A — ghi de tung truong qua `patch`. */
export function runFirstCommand(
  world: RunFirstWorld,
  patch: Partial<SubmitFuelEntryCommand> = {},
): SubmitFuelEntryCommand {
  keySeed += 1;
  return {
    runId: world.run.id,
    driverId: DRIVER,
    supplierId: world.supplierId,
    liters: '100',
    amount: 2_100_000,
    odometerKm: 120_000,
    occurredAt: '2026-09-22T11:30:00+07:00',
    businessDate: '2026-09-22',
    paymentMethod: 'SUPPLIER_ACCOUNT',
    invoiceNo: `HD-364-${keySeed}`,
    note: null,
    correlationKey: `run-first-364-${keySeed}`,
    ...patch,
  };
}
