import { describe, expect, it } from 'vitest';
import { DEFAULT_TRANSPORT_DISPATCH_POLICY } from '../dispatch-policy.js';
import { CachedRoutingAdapter } from './cached-routing.adapter.js';
import type { MatrixOutcome, MatrixRequest, RouteOutcome, RouteRequest } from './routing.types.js';
import { SyntheticRoadRoutingAdapter } from './synthetic-road-routing.adapter.js';
import { TransportRoutingPort } from './transport-routing.port.js';

const HA_NOI = { latitude: 21.0278, longitude: 105.8342 };
const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };
const NINH_BINH = { latitude: 20.2506, longitude: 105.9745 };

/** Mot cong dinh tuyen DEM SO LAN bi goi — de khang dinh bo dem that su cat duoc mot lan goi. */
class CountingRoutingPort extends TransportRoutingPort {
  readonly providerId = 'dem-lan-goi';
  routeCalls = 0;
  matrixCalls = 0;
  lastMatrixOriginCount = 0;

  constructor(private readonly failing = false) {
    super();
  }

  route(_request: RouteRequest): Promise<RouteOutcome> {
    this.routeCalls += 1;
    if (this.failing) {
      return Promise.resolve({
        ok: false,
        failure: {
          reason: 'PROVIDER_UNAVAILABLE',
          providerId: this.providerId,
          detail: 'khong goi duoc',
        },
      });
    }
    return Promise.resolve({
      ok: true,
      estimate: {
        providerId: this.providerId,
        providerProfile: null,
        quality: 'ROAD_NETWORK',
        roadDistanceMetres: 1_000,
        durationSeconds: 100,
        estimated: true,
        geometry: null,
        computedAt: '2026-09-08T10:00:00.000Z',
        fromCache: false,
      },
    });
  }

  matrix(request: MatrixRequest): Promise<MatrixOutcome> {
    this.matrixCalls += 1;
    this.lastMatrixOriginCount = request.origins.length;
    return Promise.resolve({
      ok: true,
      cells: request.origins.flatMap((_origin, originIndex) =>
        request.destinations.map((_destination, destinationIndex) => ({
          originIndex,
          destinationIndex,
          estimate: {
            providerId: this.providerId,
            providerProfile: null,
            quality: 'ROAD_NETWORK' as const,
            roadDistanceMetres: 1_000 * (originIndex + 1),
            durationSeconds: 100 * (originIndex + 1),
            estimated: true as const,
            geometry: null,
            computedAt: '2026-09-08T10:00:00.000Z',
            fromCache: false,
          },
          failure: null,
        })),
      ),
    });
  }
}

const request = (origin = HA_NOI): RouteRequest => ({
  origin,
  destination: HAI_PHONG,
  truck: {
    heightCm: null,
    widthCm: null,
    lengthCm: null,
    grossWeightKg: null,
    currentWeightKg: null,
    weightPerAxleKg: null,
    axleCount: null,
    trailerCount: null,
    complete: false,
    missingFields: [],
  },
  departAt: null,
});

describe('bo nho dem ket qua dinh tuyen', () => {
  it('lan thu hai KHONG goi lai nha cung cap', async () => {
    const inner = new CountingRoutingPort();
    const cache = new CachedRoutingAdapter(inner, DEFAULT_TRANSPORT_DISPATCH_POLICY);

    await cache.route(request());
    await cache.route(request());

    expect(inner.routeCalls).toBe(1);
    expect(cache.stats().cellsServedFromCache).toBe(1);
  });

  /**
   * `#277 M12`: *"stale route estimate cannot be presented as live without timestamp."*
   *
   * Bai nay khoa hai dieu cung luc: `fromCache` bat len, VA `computedAt` giu nguyen moc GOC. Cap
   * nhat `computedAt` thanh "bay gio" se lam mot con so 4 phut tuoi trong y het vua tinh xong.
   */
  it('ban lay tu bo dem mang nhan `fromCache` va giu NGUYEN moc tinh goc', async () => {
    const inner = new CountingRoutingPort();
    const cache = new CachedRoutingAdapter(inner, DEFAULT_TRANSPORT_DISPATCH_POLICY);

    await cache.route(request());
    const second = await cache.route(request());

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.estimate.fromCache).toBe(true);
    expect(second.estimate.computedAt).toBe('2026-09-08T10:00:00.000Z');
  });

  it('het han thi goi lai', async () => {
    const inner = new CountingRoutingPort();
    let now = new Date('2026-09-08T10:00:00.000Z');
    const cache = new CachedRoutingAdapter(
      inner,
      { ...DEFAULT_TRANSPORT_DISPATCH_POLICY, routeCacheTtlSeconds: 60 },
      () => now,
    );

    await cache.route(request());
    now = new Date('2026-09-08T10:02:00.000Z');
    await cache.route(request());

    expect(inner.routeCalls).toBe(2);
  });

  it('TTL bang 0 tat han bo dem', async () => {
    const inner = new CountingRoutingPort();
    const cache = new CachedRoutingAdapter(inner, {
      ...DEFAULT_TRANSPORT_DISPATCH_POLICY,
      routeCacheTtlSeconds: 0,
    });

    await cache.route(request());
    await cache.route(request());

    expect(inner.routeCalls).toBe(2);
  });

  /** Nho mot lan hong se bien mot cu ngat mang hai giay thanh nam phut he thong tu tu choi. */
  it('KHONG dem lai mot lan that bai', async () => {
    const inner = new CountingRoutingPort(true);
    const cache = new CachedRoutingAdapter(inner, DEFAULT_TRANSPORT_DISPATCH_POLICY);

    await cache.route(request());
    await cache.route(request());

    expect(inner.routeCalls).toBe(2);
    expect(cache.stats().providerFailures).toBe(2);
  });

  it('ma tran chi hoi lai nhung diem xuat phat CHUA co trong dem', async () => {
    const inner = new CountingRoutingPort();
    const cache = new CachedRoutingAdapter(inner, DEFAULT_TRANSPORT_DISPATCH_POLICY);

    await cache.matrix({
      origins: [HA_NOI],
      destinations: [HAI_PHONG],
      truck: request().truck,
      departAt: null,
    });
    await cache.matrix({
      origins: [HA_NOI, NINH_BINH],
      destinations: [HAI_PHONG],
      truck: request().truck,
      departAt: null,
    });

    expect(inner.matrixCalls).toBe(2);
    // Lan hai chi con MOT diem xuat phat chua biet.
    expect(inner.lastMatrixOriginCount).toBe(1);
  });

  it('ma tran ghep lai giu dung chi so diem xuat phat khi tron dem voi ket qua moi', async () => {
    const inner = new CountingRoutingPort();
    const cache = new CachedRoutingAdapter(inner, DEFAULT_TRANSPORT_DISPATCH_POLICY);

    await cache.matrix({
      origins: [NINH_BINH],
      destinations: [HAI_PHONG],
      truck: request().truck,
      departAt: null,
    });
    const outcome = await cache.matrix({
      origins: [HA_NOI, NINH_BINH],
      destinations: [HAI_PHONG],
      truck: request().truck,
      departAt: null,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.cells.map((cell) => cell.originIndex)).toEqual([0, 1]);
    expect(outcome.cells[1]?.estimate?.fromCache).toBe(true);
  });

  /** `#277 M12`: *"no unbounded matrix fan-out."* Chan TRUOC khi goi ra ngoai. */
  it('vuot tran ma tran thi tu choi CO KIEU va khong goi nha cung cap', async () => {
    const inner = new CountingRoutingPort();
    const cache = new CachedRoutingAdapter(inner, {
      ...DEFAULT_TRANSPORT_DISPATCH_POLICY,
      maxMatrixElements: 2,
    });

    const outcome = await cache.matrix({
      origins: [HA_NOI, NINH_BINH, HAI_PHONG],
      destinations: [HAI_PHONG],
      truck: request().truck,
      departAt: null,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.reason).toBe('REQUEST_BOUND_EXCEEDED');
    expect(inner.matrixCalls).toBe(0);
  });
});

describe('bo uoc luong tong hop', () => {
  const adapter = new SyntheticRoadRoutingAdapter(
    DEFAULT_TRANSPORT_DISPATCH_POLICY,
    () => new Date('2026-09-08T10:00:00.000Z'),
  );

  /** `#277 M5`: ho so tong hop duoc phep, voi dieu kien *"clearly labeled as synthetic"*. */
  it('moi ket qua deu mang nhan SYNTHETIC', async () => {
    const outcome = await adapter.route(request());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.estimate.quality).toBe('SYNTHETIC');
    expect(outcome.estimate.providerId).toBe('synthetic-detour-v1');
    expect(outcome.estimate.estimated).toBe(true);
  });

  it('tat dinh: cung dau vao cho cung ket qua', async () => {
    const first = await adapter.route(request());
    const second = await adapter.route(request());
    expect(first).toEqual(second);
  });

  it('quang duong lon hon duong chim bay dung bang he so duong vong', async () => {
    // Ha Noi - Hai Phong theo cung lon ~ 92 km; nhan 1,3 ra khoang 120 km.
    const outcome = await adapter.route(request());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.estimate.roadDistanceMetres).toBeGreaterThan(110_000);
    expect(outcome.estimate.roadDistanceMetres).toBeLessThan(130_000);
  });

  it('khong bia ra mot hinh duong di', async () => {
    const outcome = await adapter.route(request());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.estimate.geometry).toBeNull();
  });
});
