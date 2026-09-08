import { describe, expect, it } from 'vitest';
import { boundsOf, toJourney, toJourneyMap } from '../journey';
import type {
  JourneyLegGeometryView,
  JourneyLegView,
  RunJourneyMapView,
  RunJourneyView,
} from '../../transport-types';

const TODAY = '2026-09-08';

const leg = (over: Partial<JourneyLegView> = {}): JourneyLegView => ({
  legId: 'l1',
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderCode: 'ORD-2026-09-0009',
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  businessDate: TODAY,
  distanceKm: 105,
  startedAt: `${TODAY}T02:00:00.000Z`,
  completedAt: `${TODAY}T06:00:00.000Z`,
  phase: 'DELIVERED',
  ...over,
});

const view = (over: Partial<RunJourneyView> = {}): RunJourneyView => ({
  run: {
    runId: 'r1',
    runCode: 'RUN-001',
    vehicleId: 'v1',
    vehiclePlate: '29H-111.11',
    status: 'COMPLETED',
    businessDate: TODAY,
    startedAt: `${TODAY}T01:00:00.000Z`,
    completedAt: `${TODAY}T12:00:00.000Z`,
    driverId: 'd1',
  },
  distance: {
    loadedKm: 105,
    emptyKm: 105,
    totalKm: 210,
    emptyRatio: 0.5,
    complete: true,
    legsMissingDistance: { loaded: 0, empty: 0 },
    countedLegs: 2,
  },
  orderCodes: ['ORD-2026-09-0009'],
  legs: [leg()],
  timeline: [],
  unavailableSources: [],
  ...over,
});

const geometryLeg = (over: Partial<JourneyLegGeometryView> = {}): JourneyLegGeometryView => ({
  legId: 'l1',
  sequence: 1,
  kind: 'LOADED',
  origin: null,
  originGap: 'NO_CHECKPOINT_RECORDED',
  destination: null,
  destinationGap: 'NO_CHECKPOINT_RECORDED',
  paths: [{ kind: 'PLANNED', points: [], gap: 'NO_ROUTE_PROVIDER', sampledFrom: 0 }],
  ...over,
});

const mapView = (over: Partial<RunJourneyMapView> = {}): RunJourneyMapView => ({
  runId: 'r1',
  runCode: 'RUN-001',
  legs: [geometryLeg()],
  unavailableSources: [],
  ...over,
});

const metric = (model: ReturnType<typeof toJourney>, key: string): string | undefined =>
  model.metrics.find((entry) => entry.key === key)?.value;

describe('bao cao vong chay — null khong bao gio thanh 0', () => {
  it('con chang thieu km thi MOI tong deu la dau gach, khong phai mot tong thieu', () => {
    const model = toJourney(
      view({
        distance: {
          loadedKm: 105,
          emptyKm: 0,
          totalKm: 105,
          emptyRatio: null,
          complete: false,
          legsMissingDistance: { loaded: 0, empty: 1 },
          countedLegs: 2,
        },
      }),
    );

    expect(metric(model, 'total-km')).toBe('—');
    expect(metric(model, 'loaded-km')).toBe('—');
    expect(metric(model, 'empty-km')).toBe('—');
    expect(metric(model, 'empty-ratio')).toBe('—');
    expect(model.distanceIncomplete).toBe(true);
  });

  it('du du lieu thi hien so that va ty le that', () => {
    const model = toJourney(view());

    expect(metric(model, 'total-km')).toContain('210');
    expect(metric(model, 'empty-ratio')).toBe('50,0%');
  });

  it('chang thieu km bi BO khoi bieu do, khong ve thanh cot cao 0', () => {
    const model = toJourney(
      view({
        legs: [
          leg(),
          leg({ legId: 'l2', sequence: 2, kind: 'EMPTY', orderCode: null, distanceKm: null }),
        ],
      }),
    );

    expect(model.chart.sequences).toEqual(['Chặng 1']);
    expect(model.chart.omittedLegs).toBe(1);
  });

  it('chang chua co moc noi dau gach, KHONG doan mot giai doan', () => {
    const model = toJourney(view({ legs: [leg({ phase: null })] }));

    expect(model.legs[0]?.phase).toBe('—');
  });
});

describe('chang RONG doc ra duoc, khong chi nhin ra duoc', () => {
  /*
   * `#278` N13 bai 4 — chang RONG phai phan biet duoc. Tang doc phat CO `isEmpty` VA chu "RỖNG";
   * neu chi co mau o CSS thi mot ban in den trang mat sach thong tin va khong bai nao bat duoc.
   */
  it('chang rong mang co rieng VA chu RONG', () => {
    const model = toJourney(view({ legs: [leg({ kind: 'EMPTY', orderCode: null })] }));

    expect(model.legs[0]?.isEmpty).toBe(true);
    expect(model.legs[0]?.kindLabel).toBe('RỖNG');
  });

  it('chang rong noi ro no KHONG CO don, khac han mot chang co hang chua gan don', () => {
    const empty = toJourney(view({ legs: [leg({ kind: 'EMPTY', orderCode: null })] }));
    const unassigned = toJourney(view({ legs: [leg({ kind: 'LOADED', orderCode: null })] }));

    expect(empty.legs[0]?.orderCode).toBe('Không có đơn (chặng rỗng)');
    expect(unassigned.legs[0]?.orderCode).toBe('Chưa gắn đơn');
  });
});

describe('ban do — moi cho khong ve duoc deu co mot cau chu', () => {
  it('tuyen ke hoach chua co nha cung cap dan duong thi noi ra, khong ve mot doan thang', () => {
    const model = toJourneyMap(mapView());

    expect(model.segments).toEqual([]);
    expect(model.gaps.some((gap) => gap.text.includes('nhà cung cấp dẫn đường'))).toBe(true);
  });

  it('mau cua mot doan den TU DU LIEU — chang rong ra vai EMPTY', () => {
    const model = toJourneyMap(
      mapView({
        legs: [
          geometryLeg({
            kind: 'EMPTY',
            paths: [
              {
                kind: 'CHECKPOINT_ANCHORED',
                points: [
                  { latitude: 21, longitude: 105 },
                  { latitude: 20.8, longitude: 106.6 },
                ],
                gap: null,
                sampledFrom: 2,
              },
            ],
          }),
        ],
      }),
    );

    expect(model.segments[0]?.role).toBe('EMPTY');
    /* Thu tu GeoJSON: kinh do truoc, vi do sau. Dao lai la ve xe chay ra bien Dong. */
    expect(model.segments[0]?.coordinates[0]).toEqual([105, 21]);
  });

  it('so ban dinh vi THAT duoc giu lai de man hinh noi ra da thua bao nhieu', () => {
    const model = toJourneyMap(
      mapView({
        legs: [
          geometryLeg({
            paths: [
              {
                kind: 'RAW_OBSERVED',
                points: [
                  { latitude: 21, longitude: 105 },
                  { latitude: 20.8, longitude: 106.6 },
                ],
                gap: null,
                sampledFrom: 980,
              },
            ],
          }),
        ],
      }),
    );

    expect(model.rawSampledFrom).toBe(980);
  });

  it('khong co gi de ve thi khung bao la null — man hinh KHONG tu chon mot khung mac dinh', () => {
    expect(boundsOf(toJourneyMap(mapView()))).toBeNull();
  });

  it('khung bao om tron moi diem ve duoc', () => {
    const model = toJourneyMap(
      mapView({
        legs: [
          geometryLeg({
            origin: {
              point: { latitude: 21.0278, longitude: 105.8342 },
              source: 'CHECKPOINT_OBSERVATION',
              at: `${TODAY}T02:00:00.000Z`,
            },
            originGap: null,
            destination: {
              point: { latitude: 20.8449, longitude: 106.6881 },
              source: 'CHECKPOINT_OBSERVATION',
              at: `${TODAY}T06:00:00.000Z`,
            },
            destinationGap: null,
            paths: [],
          }),
        ],
      }),
    );

    expect(boundsOf(model)).toEqual([105.8342, 20.8449, 106.6881, 21.0278]);
  });
});

describe('tat dinh', () => {
  it('hai lan doc cung du lieu cho cung mo hinh', () => {
    expect(toJourney(view())).toEqual(toJourney(view()));
    expect(toJourneyMap(mapView())).toEqual(toJourneyMap(mapView()));
  });
});
