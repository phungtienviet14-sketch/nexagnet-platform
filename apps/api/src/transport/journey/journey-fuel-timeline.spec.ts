import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFuelRepository } from '../fuel/in-memory-fuel.repository.js';
import type { FuelEntry } from '../fuel/fuel.types.js';
import type {
  RunAssignment,
  RunLeg,
  Order,
  TripRunLegLink,
  VehicleRun,
} from '../movement/movement.types.js';
import type { Vehicle } from '../transport.types.js';
import { JourneyCoreFacts, JourneyFuelFacts } from './journey-facts.port.js';
import { JourneyReadService } from './journey-read.service.js';

/**
 * `#369` R-2 — DONG THOI GIAN HANH TRINH DOC DUOC PHIEU DAU RUN-FIRST.
 *
 * Truoc `#369`, duong doc duy nhat di qua CHUYEN v1 (`listEntriesByTrip`). Mot vong chay Order-first
 * khong co chuyen nao, nen moi phieu dau cua no vang mat khoi dong thoi gian — mot lan do dau CO THAT
 * khong hien o dau. Bai nay do CA HAI duong, va do rang moi phieu hien DUNG MOT LAN kem mot ly do
 * doc duoc ve VI SAO no nam o chang do.
 */

const AT = '2026-09-22T00:00:00.000Z';
const RUN_ID = 'run-1';
const TRIP_ID = 'chuyen-cu-1';

const leg = (id: string, sequence: number): RunLeg => ({
  id,
  runId: RUN_ID,
  sequence,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderId: null,
  originLabel: 'Kho A',
  destinationLabel: 'Kho B',
  businessDate: '2026-09-22',
  distanceKm: 100,
  plannedDistanceKm: null,
  startedAt: AT,
  completedAt: AT,
  note: null,
  createdAt: AT,
  updatedAt: AT,
});

const LEGS = [leg('leg-1', 1), leg('leg-2', 2)];

class FakeCoreFacts extends JourneyCoreFacts {
  links: TripRunLegLink[] = [];

  async findRun(runId: string): Promise<VehicleRun | null> {
    if (runId !== RUN_ID) return null;
    return {
      id: RUN_ID,
      code: 'RUN-369-J',
      vehicleId: 'xe-a',
      status: 'ACTIVE',
      businessDate: '2026-09-22',
      startedAt: AT,
      completedAt: null,
      note: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: AT,
      updatedAt: AT,
    };
  }

  async findRunByCode(): Promise<VehicleRun | null> {
    return null;
  }

  async listLegs(): Promise<readonly RunLeg[]> {
    return LEGS;
  }

  async listRunAssignments(): Promise<readonly RunAssignment[]> {
    return [];
  }

  async findVehicle(): Promise<Vehicle | null> {
    return null;
  }

  async listOrders(): Promise<readonly Order[]> {
    return [];
  }

  async findTripLinksByLegs(): Promise<readonly TripRunLegLink[]> {
    return this.links;
  }
}

class RepositoryFuelFacts extends JourneyFuelFacts {
  constructor(private readonly repository: InMemoryFuelRepository) {
    super();
  }

  listEntriesByTrip(tripId: string): Promise<readonly FuelEntry[]> {
    return this.repository.listEntriesByTrip(tripId);
  }

  listEntriesByRun(runId: string): Promise<readonly FuelEntry[]> {
    return this.repository.listEntriesByRun(runId);
  }
}

let repository: InMemoryFuelRepository;
let core: FakeCoreFacts;
let journey: JourneyReadService;
let supplierId: string;
let seed = 0;

beforeEach(async () => {
  repository = new InMemoryFuelRepository();
  core = new FakeCoreFacts();
  journey = new JourneyReadService(core, undefined, undefined, new RepositoryFuelFacts(repository));
  supplierId = (
    await repository.createSupplier({
      name: 'Cay xang J',
      code: 'J-CX',
      phone: null,
      address: null,
      taxCode: null,
      at: new Date(AT),
    })
  ).id;
});

/** Mot phieu do dau ghi THANG qua kho — tep nay do DUONG DOC, khong do cong nop. */
const entry = async (context: {
  readonly tripId?: string | null;
  readonly runId?: string | null;
  readonly legId?: string | null;
}): Promise<FuelEntry> =>
  repository.createEntry({
    tripId: context.tripId ?? null,
    runId: context.runId ?? null,
    legId: context.legId ?? null,
    vehicleId: 'xe-a',
    driverId: 'lai-xe-1',
    supplierId,
    stationId: null,
    businessDate: '2026-09-22',
    occurredAt: new Date(`2026-09-22T0${(seed += 1)}:00:00.000Z`),
    litersUnits: 100_000,
    amount: 2_000_000,
    odometerKm: 100_000 + seed,
    previousOdometerKm: null,
    consumptionUnits: null,
    reviewReasons: [],
    paymentMethod: 'SUPPLIER_ACCOUNT',
    sourceStatementId: null,
    correlationKey: `j-${seed}`,
    invoiceNo: null,
    note: null,
    declaredBy: 'lx',
    at: new Date(AT),
  });

const fuelTimeline = async () =>
  (await journey.runJourney(RUN_ID)).timeline.filter((event) => event.kind === 'FUEL');

describe('#369 R-2 — dong thoi gian doc ca hai duong phieu dau', () => {
  it('phieu Run-first CO chang -> nam o chang do, va no TU KHAI dieu do', async () => {
    const declared = await entry({ runId: RUN_ID, legId: 'leg-2' });
    expect(await fuelTimeline()).toEqual([
      expect.objectContaining({
        subjectId: declared.id,
        legId: 'leg-2',
        placement: 'DECLARED',
        hasLocationProof: false,
      }),
    ]);
  });

  it('phieu Run-first KHONG chang -> su kien cua CA vong chay, khong gan vao chang nao', async () => {
    const runLevel = await entry({ runId: RUN_ID });
    expect(await fuelTimeline()).toEqual([
      expect.objectContaining({ subjectId: runLevel.id, legId: null, placement: 'RUN_LEVEL' }),
    ]);
  });

  it('phieu chuyen v1 -> SUY ra chang qua lien ket, va ly do do duoc ghi ten', async () => {
    core.links = [{ tripId: TRIP_ID, legId: 'leg-1', projectedBy: 'dieu-do', createdAt: AT }];
    const legacy = await entry({ tripId: TRIP_ID });

    expect(await fuelTimeline()).toEqual([
      expect.objectContaining({
        subjectId: legacy.id,
        legId: 'leg-1',
        placement: 'DERIVED_FROM_TRIP_LINK',
      }),
    ]);
  });

  /**
   * CA BA LOAI CUNG MOT VONG CHAY — cho de dem hai lan nhat. Hai duong doc di qua hai tap phieu ROI
   * NHAU (`CHECK TransportFuelEntry_one_context_kind`), nen khong phieu nao hien hai lan.
   */
  it('lan lon ba loai: moi phieu hien DUNG MOT LAN, moi ly do dung cho', async () => {
    core.links = [{ tripId: TRIP_ID, legId: 'leg-1', projectedBy: 'dieu-do', createdAt: AT }];
    const legacy = await entry({ tripId: TRIP_ID });
    const declared = await entry({ runId: RUN_ID, legId: 'leg-2' });
    const runLevel = await entry({ runId: RUN_ID });

    const events = await fuelTimeline();
    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.subjectId)).size).toBe(3);
    expect(Object.fromEntries(events.map((event) => [event.subjectId, event.placement]))).toEqual({
      [legacy.id]: 'DERIVED_FROM_TRIP_LINK',
      [declared.id]: 'DECLARED',
      [runLevel.id]: 'RUN_LEVEL',
    });
  });

  it('phieu cua VONG CHAY KHAC khong lot vao dong thoi gian nay', async () => {
    await entry({ runId: 'run-khac' });
    expect(await fuelTimeline()).toEqual([]);
  });

  it('khong co nguon nhien lieu -> bao cao noi ra `FUEL`, khong im lang', async () => {
    const withoutFuel = new JourneyReadService(core);
    const view = await withoutFuel.runJourney(RUN_ID);
    expect(view.unavailableSources).toContain('FUEL');
    expect(view.timeline).toEqual([]);
  });
});
