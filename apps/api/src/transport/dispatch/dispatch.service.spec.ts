import { beforeEach, describe, expect, it } from 'vitest';
import type { DispatchReadiness } from '../asset-compliance/vehicle-availability.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import { TransportDomainError } from '../transport.errors.js';
import type { Vehicle } from '../transport.types.js';
import {
  DispatchComplianceFacts,
  DispatchCoreFacts,
  DispatchLocationFacts,
  type DispatchLegFact,
} from './dispatch-facts.port.js';
import {
  DispatchAssignmentPlanner,
  type DispatchCommitCommand,
  type DispatchCommitResult,
} from './dispatch-planner.port.js';
import { DEFAULT_TRANSPORT_DISPATCH_POLICY } from './dispatch-policy.js';
import {
  DispatchService,
  EMPTY_DISPATCH_REQUEST,
  type DispatchCaller,
  type DispatchSuggestionRequest,
} from './dispatch.service.js';
import type { PlaceIndexEntry } from './place-resolution.js';
import type {
  MatrixOutcome,
  MatrixRequest,
  RouteOutcome,
  RouteRequest,
} from './routing/routing.types.js';
import { TransportRoutingPort } from './routing/transport-routing.port.js';
import type { ObservationSample } from './vehicle-state-projection.js';

/**
 * `#277 M14` — bo bai doi khang cua be mat de nghi dieu xe.
 *
 * Moi bai o day dung MOT cong dinh tuyen gia co CON SO DUONG BO DAT TAY. Do la co y: no cho phep
 * dung nhung tinh huong ma ket luan theo duong bo NGUOC voi ket luan theo duong chim bay, tuc
 * dung cai ma `M3` cam (*"straight-line distance ... must not be the final ranking metric"*).
 */

const NOW = new Date('2026-09-08T10:00:00.000Z');

const HA_NOI = { latitude: 21.0278, longitude: 105.8342 };
const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };
const NINH_BINH = { latitude: 20.2506, longitude: 105.9745 };

const PLACE_INDEX: readonly PlaceIndexEntry[] = [
  { geofenceId: 'gf-hn', label: 'Kho Ha Noi', point: HA_NOI, siteId: null, siteName: null },
  { geofenceId: 'gf-hp', label: 'Kho Hai Phong', point: HAI_PHONG, siteId: null, siteName: null },
  { geofenceId: 'gf-nb', label: 'Bai Ninh Binh', point: NINH_BINH, siteId: null, siteName: null },
];

const order = (over: Partial<Order> = {}): Order => ({
  id: 'ord-1',
  code: 'ORD-1',
  status: 'OPEN',
  businessDate: '2026-09-08',
  customerId: null,
  originLabel: 'Kho Hai Phong',
  destinationLabel: 'Bai Ninh Binh',
  cargoDescription: null,
  freightAmount: null,
  currencyCode: 'VND',
  note: null,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const vehicle = (over: Partial<Vehicle> & { id: string }): Vehicle => ({
  registrationPlate: over.id,
  vehicleClass: 'TRUCK_10T',
  allowedPayloadKg: 10_000,
  currentOdoKm: 0,
  status: 'IDLE',
  operationalControl: 'INTERNAL_OPERATED',
  ownershipRegisterComplete: false,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...over,
});

const run = (over: Partial<VehicleRun> & { id: string; vehicleId: string }): VehicleRun => ({
  code: `RUN-${over.id}`,
  status: 'ACTIVE',
  businessDate: '2026-09-08',
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T08:00:00.000Z',
  updatedAt: '2026-09-08T08:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const leg = (over: Partial<RunLeg> & { id: string; runId: string }): RunLeg => ({
  sequence: 1,
  kind: 'LOADED',
  status: 'IN_TRANSIT',
  orderId: null,
  originLabel: 'Kho Ha Noi',
  destinationLabel: 'Kho Hai Phong',
  businessDate: '2026-09-08',
  distanceKm: null,
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T08:00:00.000Z',
  updatedAt: '2026-09-08T08:00:00.000Z',
  ...over,
});

class FakeCoreFacts extends DispatchCoreFacts {
  orders: Order[] = [order()];
  vehicles: Vehicle[] = [];
  legs: DispatchLegFact[] = [];

  listVehicles(): Promise<readonly Vehicle[]> {
    return Promise.resolve(this.vehicles);
  }
  findVehicle(vehicleId: string): Promise<Vehicle | null> {
    return Promise.resolve(this.vehicles.find((entry) => entry.id === vehicleId) ?? null);
  }
  findOrder(orderId: string): Promise<Order | null> {
    return Promise.resolve(this.orders.find((entry) => entry.id === orderId) ?? null);
  }
  listOpenLegsForVehicle(vehicleId: string): Promise<readonly DispatchLegFact[]> {
    return Promise.resolve(this.legs.filter((fact) => fact.run.vehicleId === vehicleId));
  }
  listLegsForOrder(orderId: string): Promise<readonly DispatchLegFact[]> {
    return Promise.resolve(this.legs.filter((fact) => fact.leg.orderId === orderId));
  }
}

class FakeLocationFacts extends DispatchLocationFacts {
  samples = new Map<string, ObservationSample>();

  latestObservationForVehicle(vehicleId: string): Promise<ObservationSample | null> {
    return Promise.resolve(this.samples.get(vehicleId) ?? null);
  }
  placeIndex(): Promise<readonly PlaceIndexEntry[]> {
    return Promise.resolve(PLACE_INDEX);
  }
}

class FakeComplianceFacts extends DispatchComplianceFacts {
  readiness = new Map<string, DispatchReadiness>();

  readinessForVehicle(target: Vehicle): Promise<DispatchReadiness> {
    return Promise.resolve(
      this.readiness.get(target.id) ?? {
        vehicleId: target.id,
        effectiveStatus: 'IDLE',
        warnings: [],
        blocking: [],
      },
    );
  }
}

/**
 * Cong dinh tuyen GIA voi bang quang duong DAT TAY.
 *
 * Khoa tra cuu la cap vi do da lam tron; khong tim thay thi roi ve mot con so co dinh. Nho vay
 * mot bai kiem thu dung duoc tinh huong "gan theo duong thang nhung xa theo duong bo".
 */
class TableRoutingPort extends TransportRoutingPort {
  readonly providerId = 'bang-tay';
  failure: MatrixOutcome | null = null;
  matrixCalls = 0;

  constructor(private readonly table: ReadonlyMap<string, { metres: number; seconds: number }>) {
    super();
  }

  private static key(from: { latitude: number }, to: { latitude: number }): string {
    return `${from.latitude.toFixed(4)}->${to.latitude.toFixed(4)}`;
  }

  private lookup(
    from: { latitude: number },
    to: { latitude: number },
  ): { metres: number; seconds: number } {
    return this.table.get(TableRoutingPort.key(from, to)) ?? { metres: 50_000, seconds: 3_600 };
  }

  route(request: RouteRequest): Promise<RouteOutcome> {
    const hit = this.lookup(request.origin, request.destination);
    return Promise.resolve({
      ok: true,
      estimate: {
        providerId: this.providerId,
        providerProfile: null,
        quality: 'ROAD_NETWORK',
        roadDistanceMetres: hit.metres,
        durationSeconds: hit.seconds,
        estimated: true,
        geometry: null,
        computedAt: NOW.toISOString(),
        fromCache: false,
      },
    });
  }

  matrix(request: MatrixRequest): Promise<MatrixOutcome> {
    this.matrixCalls += 1;
    if (this.failure) return Promise.resolve(this.failure);
    return Promise.resolve({
      ok: true,
      cells: request.origins.flatMap((origin, originIndex) =>
        request.destinations.map((destination, destinationIndex) => {
          const hit = this.lookup(origin, destination);
          return {
            originIndex,
            destinationIndex,
            estimate: {
              providerId: this.providerId,
              providerProfile: null,
              quality: 'ROAD_NETWORK' as const,
              roadDistanceMetres: hit.metres,
              durationSeconds: hit.seconds,
              estimated: true as const,
              geometry: null,
              computedAt: NOW.toISOString(),
              fromCache: false,
            },
            failure: null,
          };
        }),
      ),
    });
  }
}

class RecordingPlanner extends DispatchAssignmentPlanner {
  calls: DispatchCommitCommand[] = [];

  commit(command: DispatchCommitCommand): Promise<DispatchCommitResult> {
    this.calls.push(command);
    return Promise.resolve({
      runId: 'run-moi',
      legId: 'leg-moi',
      created: true,
      reason: 'COMMIT_PLANNED',
    });
  }
}

const ADMIN: DispatchCaller = { actor: 'boss', canReadLocationHistory: true };
const ACCOUNTANT: DispatchCaller = { actor: 'ke-toan', canReadLocationHistory: false };

const distances = (
  entries: readonly (readonly [number, number, number, number])[],
): ReadonlyMap<string, { metres: number; seconds: number }> =>
  new Map(
    entries.map(([fromLat, toLat, metres, seconds]) => [
      `${fromLat.toFixed(4)}->${toLat.toFixed(4)}`,
      { metres, seconds },
    ]),
  );

describe('be mat de nghi dieu xe', () => {
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let compliance: FakeComplianceFacts;
  let planner: RecordingPlanner;

  const build = (routing: TransportRoutingPort): DispatchService =>
    new DispatchService(
      core,
      routing,
      planner,
      DEFAULT_TRANSPORT_DISPATCH_POLICY,
      location,
      compliance,
      undefined,
      () => NOW,
    );

  const observe = (vehicleId: string, point: typeof HA_NOI, ageSeconds = 60): void => {
    location.samples.set(vehicleId, {
      sessionId: `ses-${vehicleId}`,
      point,
      accuracyMetres: 10,
      source: 'DEVICE_GNSS',
      receivedAt: new Date(NOW.getTime() - ageSeconds * 1000),
    });
  };

  beforeEach(() => {
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    compliance = new FakeComplianceFacts();
    planner = new RecordingPlanner();
  });

  /** `M14` muc 1. */
  it('xe dang ranh va gan diem lay hang dung dau bang', async () => {
    core.vehicles = [vehicle({ id: 'gan' }), vehicle({ id: 'xa' })];
    observe('gan', HAI_PHONG);
    observe('xa', HA_NOI);

    const service = build(
      new TableRoutingPort(
        distances([
          [HAI_PHONG.latitude, HAI_PHONG.latitude, 2_000, 300],
          [HA_NOI.latitude, HAI_PHONG.latitude, 120_000, 7_200],
        ]),
      ),
    );

    const view = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    expect(view.candidates[0]?.vehicleId).toBe('gan');
    expect(view.candidates[0]?.mode).toBe('CURRENT_NEAR');
    expect(view.candidates[0]?.emptyRoadMetresToPickup).toBe(2_000);
    expect(view.assignmentCreated).toBe(false);
  });

  /**
   * `M14` muc 2 — VA LA BAI QUAN TRONG NHAT CUA TEP NAY.
   *
   * `dang-cho-hang` DANG DUNG ngay canh diem lay hang, nhung no dang cho hang cua mot don khac va
   * se ket thuc o Ninh Binh (xa). `se-ranh-gan` dang o Ha Noi (xa) nhung chang cuoi cua no ket
   * thuc NGAY TAI diem lay hang.
   *
   * Ket qua dung: `se-ranh-gan` thang — vi diem xuat phat THAT su cua no cho don nay la cho no se
   * ranh, khong phai cho no dang dung.
   */
  it('xe se RANH ngay tai diem lay hang thang xe dang dung gan nhung ban', async () => {
    core.vehicles = [vehicle({ id: 'dang-cho-hang' }), vehicle({ id: 'se-ranh-gan' })];
    observe('dang-cho-hang', HAI_PHONG);
    observe('se-ranh-gan', HA_NOI);

    core.legs = [
      {
        run: run({ id: 'r1', vehicleId: 'dang-cho-hang' }),
        leg: leg({ id: 'l1', runId: 'r1', destinationLabel: 'Bai Ninh Binh' }),
      },
      {
        run: run({ id: 'r2', vehicleId: 'se-ranh-gan' }),
        leg: leg({ id: 'l2', runId: 'r2', destinationLabel: 'Kho Hai Phong' }),
      },
    ];

    const service = build(
      new TableRoutingPort(
        distances([
          // Tu cho `dang-cho-hang` SE ranh (Ninh Binh) den diem lay hang (Hai Phong): xa.
          [NINH_BINH.latitude, HAI_PHONG.latitude, 130_000, 8_000],
          // Tu cho `se-ranh-gan` SE ranh (Hai Phong) den diem lay hang: ngay tai cho.
          [HAI_PHONG.latitude, HAI_PHONG.latitude, 500, 120],
          [HA_NOI.latitude, HAI_PHONG.latitude, 120_000, 7_200],
        ]),
      ),
    );

    const view = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    expect(view.candidates[0]?.vehicleId).toBe('se-ranh-gan');
    expect(view.candidates[0]?.mode).toBe('NEXT_FREE_NEAR');

    // Xe dang cho hang van HIEN RA, nhung mang co cat ngang va KHONG duoc dung dau.
    const interruptingIndex = view.candidates.findIndex(
      (candidate) => candidate.vehicleId === 'dang-cho-hang' && candidate.mode === 'CURRENT_NEAR',
    );
    expect(interruptingIndex).toBeGreaterThan(0);
    expect(view.candidates[interruptingIndex]?.suitability).toContain(
      'WOULD_INTERRUPT_COMMITTED_WORK',
    );
  });

  /** `M14` muc 3. */
  it('xe khong du tai trong bi LOAI kem ly do co kieu', async () => {
    core.vehicles = [vehicle({ id: 'nho', allowedPayloadKg: 3_000 }), vehicle({ id: 'to' })];
    observe('nho', HAI_PHONG);
    observe('to', HAI_PHONG);

    const service = build(new TableRoutingPort(new Map()));
    const request: DispatchSuggestionRequest = {
      ...EMPTY_DISPATCH_REQUEST,
      requirement: { payloadKg: 8_000, vehicleClass: null },
    };

    const view = await service.suggest('ord-1', request, ADMIN);
    expect(view.candidates.map((candidate) => candidate.vehicleId)).toEqual(['to']);
    expect(view.excluded).toEqual([
      expect.objectContaining({
        vehicleId: 'nho',
        reasons: ['VEHICLE_PAYLOAD_BELOW_REQUIREMENT'],
      }),
    ]);
  });

  /** `M1` — xe nha ngoai khong duoc vao bang de nghi doi xe noi bo. */
  it('xe nha ngoai bi LOAI', async () => {
    core.vehicles = [vehicle({ id: 'ngoai', operationalControl: 'EXTERNAL_CARRIER' })];
    observe('ngoai', HAI_PHONG);

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(0);
    expect(view.excluded[0]?.reasons).toEqual(['VEHICLE_NOT_INTERNALLY_OPERATED']);
  });

  /** `M14` muc 4 — vi tri qua han khong lang le tro thanh diem xuat phat. */
  it('vi tri qua han KHONG duoc dung lam diem xuat phat', async () => {
    core.vehicles = [vehicle({ id: 'mat-song' })];
    observe(
      'mat-song',
      HAI_PHONG,
      DEFAULT_TRANSPORT_DISPATCH_POLICY.currentLocationUsableSeconds + 60,
    );

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(0);
    expect(view.excluded[0]?.reasons).toEqual(['VEHICLE_HAS_NO_USABLE_ORIGIN']);
  });

  /** `M14` muc 5 + 12 — khong biet thi noi la khong biet, khong lap day bang so 0. */
  it('xe chua bam vi tri va khong co ke hoach -> LOAI kem ly do, khong phai 0 km', async () => {
    core.vehicles = [vehicle({ id: 'chua-bam' })];

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(0);
    expect(view.excluded[0]?.reasons).toEqual(['VEHICLE_HAS_NO_USABLE_ORIGIN']);
  });

  it('ke hoach con lai khuyet -> ly do CO TEN, khong phai mot cho trong', async () => {
    core.vehicles = [vehicle({ id: 'khuyet' })];
    observe('khuyet', HA_NOI);
    core.legs = [
      {
        run: run({ id: 'r1', vehicleId: 'khuyet' }),
        leg: leg({ id: 'l1', runId: 'r1', destinationLabel: 'Mot cho chua khai hang rao' }),
      },
    ];

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    // Chang cuoi khong giai duoc -> khong co cho "se ranh" -> chi con duong cat ngang.
    expect(view.candidates.some((candidate) => candidate.mode === 'NEXT_FREE_NEAR')).toBe(false);
    const interrupting = view.candidates.find((candidate) => candidate.mode === 'CURRENT_NEAR');
    expect(interrupting?.nextFree?.gaps).toContain('FINAL_DESTINATION_UNRESOLVED');
    expect(interrupting?.nextFree?.completeness).toBe('UNKNOWN');
  });

  /** `M14` muc 7 — nha cung cap hong thi TU CHOI, khong tu xep hang bang duong chim bay. */
  it('nha cung cap dinh tuyen hong -> tu choi CO KIEU, khong mot phan cong nao', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);

    const routing = new TableRoutingPort(new Map());
    routing.failure = {
      ok: false,
      failure: {
        reason: 'PROVIDER_UNAVAILABLE',
        providerId: 'bang-tay',
        detail: 'khong goi duoc',
      },
    };

    await expect(
      build(routing).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ROUTING_UNAVAILABLE' });
    expect(planner.calls).toHaveLength(0);
  });

  it('vuot tran ma tran -> ma ly do RIENG', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);

    const routing = new TableRoutingPort(new Map());
    routing.failure = {
      ok: false,
      failure: { reason: 'REQUEST_BOUND_EXCEEDED', providerId: 'bang-tay', detail: 'qua tran' },
    };

    await expect(
      build(routing).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_MATRIX_BOUND_EXCEEDED' });
  });

  /** `M14` muc 8 + 10 — xem bang bao nhieu lan cung khong sinh mot vong chay nao. */
  it('xem bang nhieu lan KHONG ghi mot dong nao', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);
    const service = build(new TableRoutingPort(new Map()));

    await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(planner.calls).toHaveLength(0);
  });

  /** `M14` muc 13 — don khong ton tai thi fail-closed. */
  it('ma don la, khong thuoc he thong -> khong tim thay', async () => {
    await expect(
      build(new TableRoutingPort(new Map())).suggest('ord-la', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ORDER_NOT_FOUND' });
  });

  it('don da huy khong con la mot cau hoi dieu xe', async () => {
    core.orders = [order({ status: 'CANCELLED', cancelledAt: NOW.toISOString() })];
    await expect(
      build(new TableRoutingPort(new Map())).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ORDER_CANCELLED' });
  });

  it('khong giai duoc diem lay hang -> tu choi CO KIEU, khong lay dai mot toa do', async () => {
    core.orders = [order({ originLabel: 'Mot cho chua khai hang rao' })];
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);

    await expect(
      build(new TableRoutingPort(new Map())).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_PICKUP_LOCATION_UNRESOLVED' });
  });

  /**
   * `#277 M13` — toa do la du lieu vi tri cua MOT CON NGUOI.
   *
   * Ke toan thay moi con so cua bang (km rong, gio den, ly do) nhung KHONG thay chiec xe dang dung
   * o dau. Bai nay kiem CA HAI cho co toa do: khung nhin vi tri hien tai, va diem xuat phat.
   */
  it('nguoi khong co quyen doc duong di khong nhan duoc toa do xe', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);
    const service = build(new TableRoutingPort(new Map()));

    const forAdmin = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    expect(forAdmin.candidates[0]?.currentLocation?.point).toEqual(HAI_PHONG);
    expect(forAdmin.candidates[0]?.origin.point).toEqual(HAI_PHONG);

    const forAccountant = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ACCOUNTANT);
    expect(forAccountant.candidates[0]?.currentLocation?.point).toBeNull();
    expect(forAccountant.candidates[0]?.currentLocation?.pointRedacted).toBe(true);
    expect(forAccountant.candidates[0]?.origin.point).toBeNull();
    expect(forAccountant.candidates[0]?.origin.pointRedacted).toBe(true);
    // Nhung con so quyet dinh VAN con — do la thu ho can de doi soat.
    expect(forAccountant.candidates[0]?.emptyRoadMetresToPickup).toBeGreaterThan(0);
    expect(forAccountant.candidates[0]?.currentLocation?.freshness).toBe('FRESH');
  });

  /**
   * `M14` muc 11 — ban dinh vi THO khong bi ghi de boi ket qua dinh tuyen.
   *
   * Cong dinh tuyen o day tra ve mot quang duong hoan toan khac; toa do trong khung nhin phai van
   * la toa do da quan sat duoc, khong phai mot diem nao do tren tuyen.
   */
  it('ket qua dinh tuyen KHONG ghi de ban dinh vi goc', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HA_NOI);

    const view = await build(
      new TableRoutingPort(distances([[HA_NOI.latitude, HAI_PHONG.latitude, 120_000, 7_200]])),
    ).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(view.candidates[0]?.currentLocation?.point).toEqual(HA_NOI);
    expect(view.candidates[0]?.currentLocation?.observedAt).toBe(
      new Date(NOW.getTime() - 60_000).toISOString(),
    );
  });

  it('canh bao bao duong KHONG loai xe — #237 chua co nguon cho mot cong chan', async () => {
    core.vehicles = [vehicle({ id: 'dang-sua' })];
    observe('dang-sua', HAI_PHONG);
    compliance.readiness.set('dang-sua', {
      vehicleId: 'dang-sua',
      effectiveStatus: 'UNDER_MAINTENANCE',
      warnings: ['VEHICLE_HAS_OPEN_WORK_ORDER'],
      blocking: [],
    });

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(1);
    expect(view.candidates[0]?.suitability).toContain('VEHICLE_HAS_OPEN_WORK_ORDER');
    expect(view.excluded).toHaveLength(0);
  });

  it('bo khoa xep hang duoc cong bo ra ngoai de man hinh giai thich duoc thu tu', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);
    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.orderingKeys).toContain('EMPTY_ROAD_DISTANCE');
    expect(view.orderingKeys).toContain('NO_WORK_INTERRUPTION');
    expect(view.candidates[0]?.reasonSummary).toMatch(/Chay rong/);
  });
});

describe('xac nhan cua con nguoi', () => {
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let planner: RecordingPlanner;

  const build = (): DispatchService =>
    new DispatchService(
      core,
      new TableRoutingPort(new Map()),
      planner,
      DEFAULT_TRANSPORT_DISPATCH_POLICY,
      location,
      undefined,
      undefined,
      () => NOW,
    );

  beforeEach(() => {
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    planner = new RecordingPlanner();
    core.vehicles = [vehicle({ id: 'a' })];
    location.samples.set('a', {
      sessionId: 'ses-a',
      point: HAI_PHONG,
      accuracyMetres: 10,
      source: 'DEVICE_GNSS',
      receivedAt: NOW,
    });
  });

  it('chuyen dung don + xe da chon cho bo lap ke hoach', async () => {
    const result = await build().commit('ord-1', 'a', EMPTY_DISPATCH_REQUEST, {
      actor: 'boss',
      canReadLocationHistory: true,
    });
    expect(planner.calls).toEqual([{ orderId: 'ord-1', vehicleId: 'a', actor: 'boss' }]);
    expect(result.runId).toBe('run-moi');
    expect(result.created).toBe(true);
  });

  /**
   * `M14` muc 9 — VA LA BAI DOT BIEN CHO CONG XAC NHAN.
   *
   * Giua luc bang duoc ve va luc boss bam, chiec xe da tro thanh xe nha ngoai. Lan tinh lai o
   * `commit()` phai bat duoc dieu do va tu choi — bo lan tinh lai di se lam bai nay do.
   */
  it('su that doi giua luc nhin va luc bam -> tu choi, KHONG ghi gi', async () => {
    const service = build();
    core.vehicles = [vehicle({ id: 'a', operationalControl: 'EXTERNAL_CARRIER' })];

    await expect(
      service.commit('ord-1', 'a', EMPTY_DISPATCH_REQUEST, {
        actor: 'boss',
        canReadLocationHistory: true,
      }),
    ).rejects.toMatchObject({ reason: 'DISPATCH_RECOMMENDATION_STALE' });
    expect(planner.calls).toHaveLength(0);
  });

  it('xe khong ton tai -> khong tim thay, khong ghi gi', async () => {
    await expect(
      build().commit('ord-1', 'xe-la', EMPTY_DISPATCH_REQUEST, {
        actor: 'boss',
        canReadLocationHistory: true,
      }),
    ).rejects.toBeInstanceOf(TransportDomainError);
    expect(planner.calls).toHaveLength(0);
  });
});
