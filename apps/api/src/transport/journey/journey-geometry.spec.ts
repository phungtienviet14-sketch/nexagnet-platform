import { describe, expect, it } from 'vitest';
import { RAW_PATH_MAX_POINTS, buildLegGeometry, decimate } from './journey-geometry.js';
import type { LegGeometrySource } from './journey-geometry.js';
import type { RunCheckpoint } from '../checkpoint/checkpoint.types.js';
import type { LocationObservation } from '../proof/tracking.types.js';

const TODAY = '2026-09-08';
const LEG_ID = '9a2b3c4d-0000-4000-8000-000000000001';

const checkpoint = (over: Partial<RunCheckpoint> = {}): RunCheckpoint => ({
  id: 'cp-1',
  type: 'PICKUP_ARRIVAL',
  runId: '7c1f0a2e-0000-4000-8000-000000000001',
  legId: LEG_ID,
  recordedBy: 'auth-user-1',
  driverId: 'dd44ee55-0000-4000-8000-000000000001',
  observationId: null,
  clientEventId: 'ev-1',
  capturedAt: null,
  receivedAt: new Date(`${TODAY}T02:00:00.000Z`),
  businessDate: TODAY,
  note: null,
  createdAt: new Date(`${TODAY}T02:00:00.000Z`),
  ...over,
});

const observation = (over: Partial<LocationObservation> = {}): LocationObservation => ({
  id: 'ob-1',
  sessionId: 'se-1',
  clientEventId: 'ev-1',
  point: { latitude: 21.0278, longitude: 105.8342 },
  accuracyMetres: 12,
  speedMetresPerSecond: null,
  bearingDegrees: null,
  source: 'DEVICE_GNSS',
  capturedAt: new Date(`${TODAY}T02:00:00.000Z`),
  receivedAt: new Date(`${TODAY}T02:00:05.000Z`),
  clockSkewSeconds: 5,
  mockLocationReported: false,
  businessDate: TODAY,
  ...over,
});

const source = (over: Partial<LegGeometrySource> = {}): LegGeometrySource => ({
  checkpoints: [],
  observationsById: new Map(),
  rawObservations: null,
  ...over,
});

const pathOf = (result: ReturnType<typeof buildLegGeometry>, kind: string) =>
  result.paths.find((path) => path.kind === kind);

describe('hinh hoc mot chang — KHONG toa do nao duoc sinh ra', () => {
  it('chua co moc nao: hai dau deu null, va ly do la CHUA BAM, khong phai THIEU BANG CHUNG', () => {
    const result = buildLegGeometry(source());

    expect(result.origin).toBeNull();
    expect(result.originGap).toBe('NO_CHECKPOINT_RECORDED');
    expect(result.destination).toBeNull();
    expect(result.destinationGap).toBe('NO_CHECKPOINT_RECORDED');
  });

  /*
   * Hai ma nay KHONG duoc gop. Mot chang chua chay den noi giao va mot chang da giao xong ma dien
   * thoai khong lay duoc vi tri dan toi hai viec khac han nhau cua con nguoi.
   */
  it('da bam moc nhung khong moc nao kem ban dinh vi: ly do la THIEU BANG CHUNG', () => {
    const result = buildLegGeometry(source({ checkpoints: [checkpoint({ observationId: null })] }));

    expect(result.origin).toBeNull();
    expect(result.originGap).toBe('NO_CHECKPOINT_OBSERVATION');
  });

  it('moc kem ban dinh vi cho ra toa do, va toa do do ghi ro no den tu dau', () => {
    const result = buildLegGeometry(
      source({
        checkpoints: [checkpoint({ observationId: 'ob-1' })],
        observationsById: new Map([['ob-1', observation()]]),
      }),
    );

    expect(result.origin).toEqual({
      point: { latitude: 21.0278, longitude: 105.8342 },
      source: 'CHECKPOINT_OBSERVATION',
      at: `${TODAY}T02:00:05.000Z`,
    });
  });

  it('dau lay hang va noi giao doc tu HAI nhom moc khac nhau', () => {
    const result = buildLegGeometry(
      source({
        checkpoints: [
          checkpoint({ id: 'cp-1', type: 'GATE_ENTRY', observationId: 'ob-1' }),
          checkpoint({
            id: 'cp-2',
            type: 'DELIVERY_ARRIVAL',
            observationId: 'ob-2',
            receivedAt: new Date(`${TODAY}T06:00:00.000Z`),
          }),
        ],
        observationsById: new Map([
          ['ob-1', observation({ id: 'ob-1' })],
          ['ob-2', observation({ id: 'ob-2', point: { latitude: 20.8449, longitude: 106.6881 } })],
        ]),
      }),
    );

    expect(result.origin?.point).toEqual({ latitude: 21.0278, longitude: 105.8342 });
    expect(result.destination?.point).toEqual({ latitude: 20.8449, longitude: 106.6881 });
  });

  it('ban dinh vi tra cuu khong ra thi coi nhu khong co — khong nem, khong bia', () => {
    const result = buildLegGeometry(
      source({
        checkpoints: [checkpoint({ observationId: 'ob-mat-tich' })],
        observationsById: new Map(),
      }),
    );

    expect(result.origin).toBeNull();
    expect(result.originGap).toBe('NO_CHECKPOINT_OBSERVATION');
  });
});

describe('duong di — ba loai, va khong loai nao duoc bia', () => {
  /*
   * `#278` N5 doi tuyen ke hoach phan biet duoc voi tuyen thuc te. Tren `main` hom nay khong co nha
   * cung cap dan duong nao, nen cau tra loi trung thuc la MOT MA LY DO — khong phai mot doan thang
   * noi hai kho cach nhau 100km.
   */
  it('tuyen KE HOACH luon rong kem `NO_ROUTE_PROVIDER` — khong bao gio mot doan thang', () => {
    const planned = pathOf(
      buildLegGeometry(
        source({
          checkpoints: [
            checkpoint({ id: 'cp-1', observationId: 'ob-1' }),
            checkpoint({
              id: 'cp-2',
              type: 'DELIVERY_ARRIVAL',
              observationId: 'ob-2',
              receivedAt: new Date(`${TODAY}T06:00:00.000Z`),
            }),
          ],
          observationsById: new Map([
            ['ob-1', observation({ id: 'ob-1' })],
            ['ob-2', observation({ id: 'ob-2' })],
          ]),
        }),
      ),
      'PLANNED',
    );

    expect(planned?.points).toEqual([]);
    expect(planned?.gap).toBe('NO_ROUTE_PROVIDER');
  });

  it('duong noi moc can it nhat HAI diem — mot diem le khong phai mot duong', () => {
    const path = pathOf(
      buildLegGeometry(
        source({
          checkpoints: [checkpoint({ observationId: 'ob-1' })],
          observationsById: new Map([['ob-1', observation()]]),
        }),
      ),
      'CHECKPOINT_ANCHORED',
    );

    expect(path?.points).toEqual([]);
    expect(path?.gap).toBe('NO_CHECKPOINT_OBSERVATION');
  });

  it('duong noi moc xep theo GIO MAY CHU, khong theo gio may khach', () => {
    const path = pathOf(
      buildLegGeometry(
        source({
          checkpoints: [
            checkpoint({
              id: 'cp-late',
              type: 'DELIVERY_ARRIVAL',
              observationId: 'ob-2',
              receivedAt: new Date(`${TODAY}T06:00:00.000Z`),
            }),
            checkpoint({ id: 'cp-early', observationId: 'ob-1' }),
          ],
          observationsById: new Map([
            ['ob-1', observation({ id: 'ob-1', point: { latitude: 1, longitude: 1 } })],
            ['ob-2', observation({ id: 'ob-2', point: { latitude: 2, longitude: 2 } })],
          ]),
        }),
      ),
      'CHECKPOINT_ANCHORED',
    );

    expect(path?.points).toEqual([
      { latitude: 1, longitude: 1 },
      { latitude: 2, longitude: 2 },
    ]);
  });

  it('chang khong noi voi chuyen nao: duong THO noi ro khong co phien bam vi tri', () => {
    const path = pathOf(buildLegGeometry(source({ rawObservations: null })), 'RAW_OBSERVED');

    expect(path?.gap).toBe('NO_TRACKING_SESSION');
    expect(path?.sampledFrom).toBe(0);
  });

  it('duong THO khong bao gio duoc goi la duong da khop ban do', () => {
    const kinds = buildLegGeometry(source()).paths.map((path) => path.kind);

    expect(kinds).toEqual(['PLANNED', 'CHECKPOINT_ANCHORED', 'RAW_OBSERVED']);
    expect(kinds).not.toContain('MATCHED');
  });

  it('duong THO bi thua o may chu, va NOI RA no da thua tu bao nhieu diem', () => {
    const many = Array.from({ length: 1000 }, (_, index) =>
      observation({
        id: `ob-${index}`,
        capturedAt: new Date(Date.parse(`${TODAY}T02:00:00.000Z`) + index * 1000),
        point: { latitude: 21 + index / 10_000, longitude: 105 + index / 10_000 },
      }),
    );

    const path = pathOf(buildLegGeometry(source({ rawObservations: many })), 'RAW_OBSERVED');

    expect(path?.sampledFrom).toBe(1000);
    expect(path?.points).toHaveLength(RAW_PATH_MAX_POINTS);
    /* Diem dau va diem cuoi PHAI song sot — chung la hai dau cua doan duong. */
    expect(path?.points[0]).toEqual(many[0]?.point);
    expect(path?.points[RAW_PATH_MAX_POINTS - 1]).toEqual(many[999]?.point);
  });
});

describe('thua deu — moi diem con lai la mot ban dinh vi CO THAT', () => {
  it('duoi tran thi khong dong vao gi ca', () => {
    expect(decimate([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('giu dung so diem yeu cau, ke ca diem dau va diem cuoi', () => {
    const kept = decimate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);

    expect(kept).toHaveLength(4);
    expect(kept[0]).toBe(1);
    expect(kept[3]).toBe(10);
  });

  it('tat dinh — hai lan thua cung dau vao cho cung ket qua', () => {
    const input = Array.from({ length: 77 }, (_, index) => index);

    expect(decimate(input, 9)).toEqual(decimate(input, 9));
  });

  it('tu choi mot tran vo nghia thay vi tra ve mot duong khong ve duoc', () => {
    expect(() => decimate([1, 2, 3], 1)).toThrow(RangeError);
  });
});
