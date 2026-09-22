import type { CapabilityId } from '@netviet/tenant';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { NavigationInput } from '../../navigation';
import type { ControlTowerView } from '../../transport-types';
import { toControlTower } from '../control-tower';
import { toDashboard, WORK_LIMIT, type DashboardInput, type DashboardModel } from '../dashboard';
import {
  boardCard,
  boardColumns,
  controlTowerView,
  order,
  queueItem,
  reconciliation,
  trip,
} from './fixtures';

const CORE: readonly CapabilityId[] = ['transport-core'];
const WITH_SETTLEMENT: readonly CapabilityId[] = ['transport-core', 'transport-settlement'];
const ADMIN: NavigationInput = { capabilities: CORE, role: 'ADMIN' };

const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  tower: controlTowerView(),
  orders: [],
  trips: [],
  tripsFailed: false,
  reconciliations: [],
  navigation: ADMIN,
  ...over,
});

/** Doi xe da phan hoach o may chu: `runs` vong chay dang chay tren `vehicles` xe. */
const running = (runs: number, vehicles: number): ControlTowerView['fleet'] => ({
  total: vehicles,
  idle: 0,
  onTrip: vehicles,
  underMaintenance: 0,
  activeDrivers: vehicles,
  runningRuns: runs,
});

const statOf = (model: DashboardModel, key: string) => model.stats.find((stat) => stat.key === key);

/** Moi chu ma man Tong quan IN RA tu mo hinh. */
const renderedTexts = (model: DashboardModel): readonly string[] => [
  ...model.stats.flatMap((stat) => [stat.label, stat.value, stat.hint ?? '']),
  ...model.work.map((item) => item.title),
  model.headline ?? '',
  model.operationsNotice ?? '',
  model.moreWork?.label ?? '',
  model.legacy?.text ?? '',
  model.legacy?.link?.label ?? '',
];

describe('#348 — con so chinh doc tu DON + VONG CHAY, khong tu chuyen lap tay', () => {
  it('0 chuyen lap tay + 1 vong chay dang chay: Tong quan THAY dang co van hanh', () => {
    const model = toDashboard(
      input({
        trips: [],
        tower: controlTowerView({
          fleet: running(1, 1),
          board: boardColumns({ IN_TRANSIT: [boardCard()] }),
        }),
      }),
    );

    expect(statOf(model, 'runs-running')).toMatchObject({
      label: 'Vòng chạy đang chạy',
      value: '1',
      hint: 'Trên 1 xe.',
      section: 'control-tower',
    });
    /* Khong co viec cho — nhung cau tieu de van noi vong chay dang chay, khong noi "khong co gi". */
    expect(model.headline).toBe('1 vòng chạy đang chạy, không có việc nào đang chờ người xử lý.');
    expect(renderedTexts(model).some((text) => text.includes('Không có chuyến nào'))).toBe(false);
  });

  it('viec cua vong chay len hang viec — Tong quan khong con noi "khong co viec" khi co viec', () => {
    const model = toDashboard(
      input({
        tower: controlTowerView({ fleet: running(1, 1), queue: [queueItem()], queueTotal: 1 }),
      }),
    );

    expect(model.hasWork).toBe(true);
    expect(model.headline).toBe('1 việc đang chờ người xử lý.');
    expect(model.work).toEqual([
      expect.objectContaining({
        title: 'Vòng chạy đang chạy mà chưa phân công lái xe',
        tone: 'danger',
        section: 'movement',
        selection: 'VR-001',
      }),
    ]);
  });

  it('co ca chuyen cu lan vong chay moi: con so chinh la VONG CHAY, chuyen chi la thong tin phu', () => {
    const model = toDashboard(
      input({
        trips: [
          trip({ id: 'a', code: 'VT-A', status: 'IN_TRANSIT' }),
          trip({ id: 'b', code: 'VT-B', status: 'IN_TRANSIT' }),
          trip({ id: 'c', code: 'VT-C', status: 'PLANNED' }),
          trip({ id: 'd', code: 'VT-D', status: 'DELIVERED' }),
          trip({ id: 'e', code: 'VT-E', status: 'RECONCILED' }),
          trip({ id: 'f', code: 'VT-F', status: 'CANCELLED' }),
        ],
        tower: controlTowerView({ fleet: running(1, 1) }),
      }),
    );

    /* 1 vong chay, KHONG phai 3 (1 + 2 chuyen dang chay) va khong phai 2. */
    expect(statOf(model, 'runs-running')?.value).toBe('1');
    for (const tripKey of ['in-transit', 'planned', 'delivered']) {
      expect(model.stats.map((stat) => stat.key)).not.toContain(tripKey);
    }
    expect(model.legacy).toEqual({
      text: 'Còn 4 chuyến lập tay theo cách làm trước đây chưa khép.',
      link: { label: 'Xem ở “Chuyến xe”', section: 'trips' },
    });
  });

  it('doc chuyen lap tay HONG thi dong phu noi "chua doc duoc", khong im lang nhu "khong con chuyen"', () => {
    const model = toDashboard(input({ trips: null, tripsFailed: true }));
    expect(model.legacy).toEqual({
      text: 'Chưa đọc được các chuyến lập tay theo cách làm trước đây, nên chưa biết còn chuyến nào chưa khép.',
      link: { label: 'Xem ở “Chuyến xe”', section: 'trips' },
    });
    /* Nguon PHU hong khong duoc cham vao con so CHINH. */
    expect(statOf(model, 'runs-running')?.value).toBe('0');
  });

  it('chuyen lap tay chua co trong tay (dang doc, hoac bi chan) thi chua noi gi ve chung', () => {
    expect(toDashboard(input({ trips: null })).legacy).toBeNull();
  });

  it('chuyen cu da khep het thi khong co dong thong tin phu nao', () => {
    const model = toDashboard(
      input({
        trips: [trip({ status: 'RECONCILED' }), trip({ id: 'x', status: 'CANCELLED' })],
      }),
    );
    expect(model.legacy).toBeNull();
  });

  it('don dang mo dem dung trang thai OPEN, va dan vao Don hang & vong chay', () => {
    const model = toDashboard(
      input({
        orders: [
          order(),
          order({ id: 'o2', code: 'DH-2', status: 'OPEN' }),
          order({ id: 'o3', code: 'DH-3', status: 'FULFILLED' }),
          order({ id: 'o4', code: 'DH-4', status: 'CANCELLED' }),
        ],
      }),
    );
    expect(statOf(model, 'orders-open')).toMatchObject({
      label: 'Đơn đang mở',
      value: '2',
      section: 'movement',
    });
  });

  it('chua co don trong tay thi KHONG co the don — khong bay so 0', () => {
    expect(statOf(toDashboard(input({ orders: null })), 'orders-open')).toBeUndefined();
  });

  it('the "đã lên kế hoạch" la tong cot cung ten cua bang dieu hanh', () => {
    const model = toDashboard(
      input({
        tower: controlTowerView({
          board: boardColumns({
            PLANNED: [boardCard({ runId: 'p1', runCode: 'VR-P1' }), boardCard({ runId: 'p2' })],
          }),
        }),
      }),
    );
    expect(statOf(model, 'runs-planned')).toMatchObject({
      label: 'Vòng chạy đã lên kế hoạch',
      value: '2',
      section: 'control-tower',
    });
  });
});

/**
 * #348 acceptance — con so "đang chạy" cua Tong quan = con so cua Bang dieu hanh, tren CUNG mot
 * fixture. Doi chieu voi CHINH cau ma `Bảng điều hành` in ra (`runningSummary`), khong voi mot
 * hang so chep tay: doi dinh nghia o may chu thi hai ben doi cung nhau, hoac bai nay do.
 */
describe('#348 — Tong quan va Bang dieu hanh noi CUNG mot con so', () => {
  const SUMMARY = /^Vòng chạy đang chạy: (\S+) trên (\S+) xe — /;

  it.each([
    { name: '1 xe, 1 vong chay', fleet: running(1, 1) },
    { name: '1 xe mo 2 vong chay (#344)', fleet: running(2, 1) },
    { name: '2 xe, moi xe 1 vong chay', fleet: running(2, 2) },
    { name: '12 vong chay tren 9 xe', fleet: running(12, 9) },
  ])('$name', ({ fleet }) => {
    const shared = controlTowerView({
      fleet,
      board: boardColumns({ PLANNED: [boardCard({ runId: 'p1', runCode: 'VR-P1' })] }),
    });

    const overview = toDashboard(input({ tower: shared }));
    const tower = toControlTower(shared);
    const [, runs, vehicles] = SUMMARY.exec(tower.runningSummary) ?? [];

    expect(statOf(overview, 'runs-running')?.value).toBe(runs);
    expect(statOf(overview, 'runs-running')?.hint).toBe(`Trên ${vehicles} xe.`);
    expect(statOf(overview, 'runs-planned')?.value).toBe(
      tower.columns.find((column) => column.column === 'PLANNED')?.total,
    );
  });

  it('0 vong chay: ca hai man cung noi 0, khong man nao tu dem', () => {
    const shared = controlTowerView({ fleet: running(0, 0) });
    expect(toControlTower(shared).runningSummary).toBe('Không có vòng chạy nào đang chạy.');
    expect(statOf(toDashboard(input({ tower: shared })), 'runs-running')?.value).toBe('0');
  });

  it('hang viec cua Tong quan la DAU hang viec cua Bang dieu hanh, cung nhan, cung duong', () => {
    const shared = controlTowerView({
      queue: [
        queueItem(),
        queueItem({
          kind: 'FUEL_ENTRY_AWAITING_VERIFICATION',
          severity: 'WARNING',
          subject: { kind: 'FUEL_ENTRY', id: 'fe-1', reference: null },
        }),
      ],
      queueTotal: 2,
    });
    const { queue } = toControlTower(shared);
    expect(toDashboard(input({ tower: shared })).work).toEqual(
      queue.map(({ key, title, tone, section, selection }) => ({
        key,
        title,
        tone,
        section,
        selection,
      })),
    );
  });
});

describe('#348 — duong dan: khong mot the/dong viec chinh nao con vao Chuyen xe', () => {
  const busy = input({
    orders: [order()],
    trips: [trip({ status: 'PLANNED' }), trip({ id: 'b', status: 'DELIVERED' })],
    reconciliations: [reconciliation()],
    tower: controlTowerView({
      fleet: running(1, 1),
      queue: Array.from({ length: 9 }, (_, index) =>
        queueItem({ subject: { kind: 'RUN', id: `run-${index}`, reference: `VR-${index}` } }),
      ),
      queueTotal: 9,
    }),
  });

  it('the so van hanh dan vao Don hang & vong chay hoac Bang dieu hanh', () => {
    const model = toDashboard(busy);
    for (const key of ['orders-open', 'runs-running', 'runs-planned']) {
      expect(['movement', 'control-tower']).toContain(statOf(model, key)?.section);
    }
  });

  it('khong the, khong dong viec, khong loi "xem du" nao tro vao `trips`', () => {
    const model = toDashboard(busy);
    expect(model.stats.map((stat) => stat.section)).not.toContain('trips');
    expect(model.work.map((item) => item.section)).not.toContain('trips');
    expect(model.moreWork?.section).toBe('control-tower');
    /* Cho DUY NHAT con vao `trips` la dong thong tin phu. */
    expect(model.legacy?.link?.section).toBe('trips');
  });

  it('nhieu viec hon suc bay: tieu de noi TONG THAT, va loi sang Bang dieu hanh noi du so', () => {
    const model = toDashboard(busy);
    expect(model.pendingTotal).toBe(9);
    expect(model.work).toHaveLength(WORK_LIMIT);
    expect(model.headline).toBe('9 việc đang chờ người xử lý — bảng đang hiện 6 việc đầu.');
    expect(model.moreWork).toEqual({
      label: 'Xem đủ 9 việc ở “Bảng điều hành”',
      section: 'control-tower',
    });
  });

  it('dong viec mang MA nghiep vu, khong bao gio `id` — va khong co ma thi khong co lua chon', () => {
    const model = toDashboard(
      input({
        tower: controlTowerView({
          queue: [
            queueItem({ subject: { kind: 'RUN', id: 'uuid-xyz', reference: 'VR-0912' } }),
            queueItem({
              kind: 'EXPENSE_CLAIM_AWAITING_REVIEW',
              severity: 'WARNING',
              subject: { kind: 'EXPENSE_CLAIM', id: 'claim-uuid', reference: null },
            }),
          ],
          queueTotal: 2,
        }),
      }),
    );
    expect(model.work.map((item) => item.selection)).toEqual(['VR-0912', null]);
  });
});

/**
 * #348 — FAIL-CLOSED theo hai truc quyen.
 *
 * Ke ca khi du lieu thap dieu hanh DA nam trong tay (vd con trong cache tu mot phien truoc), nguoi
 * khong mo duoc `Bảng điều hành` khong duoc thay mot con so vong chay nao — ke ca so 0.
 */
/** Bon cach KHONG mo duoc `Bảng điều hành` — vi vai, vi goi khach, hay vi nang luc dang bi chan. */
const BLOCKED = [
  {
    name: 'MANAGER (chua duoc cap quyen van tai)',
    navigation: { capabilities: CORE, role: 'MANAGER' },
  },
  { name: 'Lai xe (SALE)', navigation: { capabilities: CORE, role: 'SALE' } },
  { name: 'khach chua bat transport-core', navigation: { capabilities: [], role: 'ADMIN' } },
  {
    name: 'transport-core dang bi chan',
    navigation: { capabilities: CORE, role: 'ADMIN', blockedCapabilityKeys: ['transport-core'] },
  },
] satisfies readonly { name: string; navigation: NavigationInput }[];

describe('#348 — vai/goi khong du quyen thi KHONG co con so vong chay', () => {
  const tower = controlTowerView({ fleet: running(3, 2), queue: [queueItem()], queueTotal: 1 });

  it.each(BLOCKED)('$name', ({ navigation }) => {
    const model = toDashboard(input({ tower, navigation }));

    expect(statOf(model, 'runs-running')).toBeUndefined();
    expect(statOf(model, 'runs-planned')).toBeUndefined();
    expect(model.work).toEqual([]);
    expect(model.pendingTotal).toBe(0);
    expect(model.headline).toBeNull();
    expect(model.moreWork).toBeNull();
    expect(model.generatedFor).toBeNull();
    expect(model.operationsNotice).toContain('không hiện số vòng chạy');
  });

  it.each([
    { name: 'Ke toan', navigation: { capabilities: CORE, role: 'ACCOUNTING' } },
    { name: 'chua biet vai (dang doi /auth/me)', navigation: { capabilities: CORE, role: null } },
  ] satisfies readonly { name: string; navigation: NavigationInput }[])(
    '$name mo duoc Bang dieu hanh nen thay so',
    ({ navigation }) => {
      const model = toDashboard(input({ tower, navigation }));
      expect(statOf(model, 'runs-running')?.value).toBe('3');
      expect(model.operationsNotice).toBeNull();
    },
  );

  it('khong mo duoc Don hang & vong chay thi the don van la so, nhung khong dan di dau', () => {
    const model = toDashboard(
      input({
        orders: [order()],
        navigation: {
          capabilities: CORE,
          role: 'ADMIN',
          blockedCapabilityKeys: ['transport-core'],
        },
      }),
    );
    expect(statOf(model, 'orders-open')).toMatchObject({ value: '1', section: null });
  });

  it('khach chua bat transport-core: moi query bi chan, trang KHONG co mot con so nao — ke ca 0', () => {
    /* Dung dau vao ma `OverviewView` nhan khi `allowed()` chan moi query: moi nguon deu `null`. */
    const model = toDashboard(
      input({
        tower: null,
        orders: null,
        trips: null,
        reconciliations: [],
        navigation: { capabilities: [], role: 'ADMIN' },
      }),
    );
    expect(model.stats).toEqual([]);
    expect(model.legacy).toBeNull();
    expect(model.headline).toBeNull();
    expect(model.operationsNotice).toContain('chưa bật hoặc chưa thiết lập xong');
  });

  it('dang doc (chua co thap dieu hanh) thi khong noi 0 va khong noi "khong co viec"', () => {
    const model = toDashboard(input({ tower: null }));
    expect(statOf(model, 'runs-running')).toBeUndefined();
    expect(model.headline).toBeNull();
    expect(model.operationsNotice).toBeNull();
  });
});

/**
 * #351 — BA THE DOI XE LA `fleet` CUA BANG DIEU HANH, KHONG DEM LAI.
 *
 * Truoc #351, "Xe đang rỗi" / "Xe đang bảo dưỡng" / "Lái xe đang làm" dem lai hai danh sach: cot
 * `TransportVehicle.status` nhap tay va danh sach lai xe. Luong Order-first khong ghi cot do (#336),
 * nen mot xe dang chay vong chay `ACTIVE` ma cot van luu `IDLE` bi Tong quan dem la "rỗi" — ngay
 * canh `Bảng điều hành` noi "Đang rảnh 0" tren cung du lieu.
 *
 * Moi kich ban duoi day la CAU TRA LOI cua phep chieu may chu (`countFleetPresence`) cho mot hinh
 * dang du lieu — dung hinh dang ma `control-tower-projection.spec.ts` khoa o may chu. Web KHONG
 * phan hoach lai doi xe: cac bai nay khoa rang Tong quan in DUNG con so ma `Bảng điều hành` in, tu
 * CUNG mot doi tuong `controlTowerView()` — cung khuon voi khoi #348 o tren.
 *
 * Cot trang thai xe cua tung kich ban chi con nam trong TEN bai: `DashboardInput` khong con truong
 * nao nhan danh sach xe hay lai xe, va bai cuoi khoi khoa dieu do o muc kieu.
 */
const FLEET_KEYS = ['vehicles-idle', 'vehicles-maintenance', 'drivers-active'] as const;

describe('#351 — ba the doi xe la `fleet` cua Bang dieu hanh, khong dem lai cot trang thai xe', () => {
  /** Con so ma `Bảng điều hành` IN RA cho cung doi tuong — khong phai mot hang so chep tay. */
  const towerValue = (shared: ControlTowerView, key: string): string | undefined =>
    toControlTower(shared).stats.find((stat) => stat.key === key)?.value;

  it.each([
    {
      /* Xe luu IDLE — luong Order-first khong ghi cot do — va dang chay mot vong chay ACTIVE. */
      name: 'xe luu IDLE ma dang chay 1 vong chay ACTIVE: 1 vong chay tren 1 xe, dang roi 0',
      fleet: {
        total: 1,
        idle: 0,
        onTrip: 1,
        underMaintenance: 0,
        activeDrivers: 1,
        runningRuns: 1,
      },
      cards: [boardCard()],
      expected: { runs: '1', vehicles: '1', idle: '0', maintenance: '0' },
    },
    {
      /* Mot xe luu IDLE mo hai vong chay ACTIVE cung luc (#344): the dem XE, loi tom tat dem VONG. */
      name: '1 xe mo 2 vong chay ACTIVE: 2 vong chay tren 1 xe, dang roi 0',
      fleet: {
        total: 1,
        idle: 0,
        onTrip: 1,
        underMaintenance: 0,
        activeDrivers: 1,
        runningRuns: 2,
      },
      cards: [boardCard(), boardCard({ runId: 'run-2', runCode: 'VR-002' })],
      expected: { runs: '2', vehicles: '1', idle: '0', maintenance: '0' },
    },
    {
      /* Ba xe luu IDLE / UNDER_MAINTENANCE / ON_TRIP cu, khong vong chay nao ACTIVE. */
      name: 'xe dang sua KHONG co vong chay ACTIVE: bao duong 1, xe luu ON_TRIP cu la xe roi',
      fleet: {
        total: 3,
        idle: 2,
        onTrip: 0,
        underMaintenance: 1,
        activeDrivers: 2,
        runningRuns: 0,
      },
      cards: [],
      expected: { runs: '0', vehicles: '0', idle: '2', maintenance: '1' },
    },
    {
      /* Hai xe cung luu UNDER_MAINTENANCE, mot xe dang chay vong chay ACTIVE (#344 §5). */
      name: 'xe dang sua CO vong chay ACTIVE: dem MOT lan, o vong chay — khong o bao duong',
      fleet: {
        total: 2,
        idle: 0,
        onTrip: 1,
        underMaintenance: 1,
        activeDrivers: 1,
        runningRuns: 1,
      },
      cards: [boardCard()],
      expected: { runs: '1', vehicles: '1', idle: '0', maintenance: '1' },
    },
  ])('$name', ({ fleet, cards, expected }) => {
    const shared = controlTowerView({ fleet, board: boardColumns({ IN_TRANSIT: cards }) });
    const overview = toDashboard(input({ tower: shared }));

    expect(statOf(overview, 'runs-running')).toMatchObject({
      value: expected.runs,
      hint: `Trên ${expected.vehicles} xe.`,
    });
    expect(statOf(overview, 'vehicles-idle')?.value).toBe(expected.idle);
    expect(statOf(overview, 'vehicles-maintenance')?.value).toBe(expected.maintenance);

    /* Va dung con so `Bảng điều hành` in ra tren CUNG doi tuong. */
    expect(statOf(overview, 'vehicles-idle')?.value).toBe(towerValue(shared, 'idle'));
    expect(statOf(overview, 'vehicles-maintenance')?.value).toBe(towerValue(shared, 'maintenance'));
    expect(statOf(overview, 'drivers-active')?.value).toBe(towerValue(shared, 'drivers'));
    expect(statOf(overview, 'runs-running')?.hint).toBe(
      `Trên ${towerValue(shared, 'on-trip')} xe.`,
    );
  });

  it('lai xe dang lam la `fleet.activeDrivers` cua Bang dieu hanh, khong dem danh sach lai xe', () => {
    const shared = controlTowerView({
      fleet: {
        total: 0,
        idle: 0,
        onTrip: 0,
        underMaintenance: 0,
        activeDrivers: 7,
        runningRuns: 0,
      },
    });
    const overview = toDashboard(input({ tower: shared }));

    expect(statOf(overview, 'drivers-active')).toMatchObject({
      label: 'Lái xe đang làm',
      value: '7',
    });
    expect(statOf(overview, 'drivers-active')?.value).toBe(towerValue(shared, 'drivers'));
  });

  it('moi the doc DUNG truong cua no — sau truong, sau con so khac nhau', () => {
    const model = toDashboard(
      input({
        tower: controlTowerView({
          fleet: {
            total: 9,
            idle: 2,
            onTrip: 3,
            underMaintenance: 4,
            activeDrivers: 5,
            runningRuns: 6,
          },
        }),
      }),
    );

    expect(statOf(model, 'runs-running')).toMatchObject({ value: '6', hint: 'Trên 3 xe.' });
    expect(FLEET_KEYS.map((key) => statOf(model, key)?.value)).toEqual(['2', '4', '5']);
  });

  it('doi xe rong la so 0 THAT — ba the van hien, voi so 0, khac han luc chua doc duoc', () => {
    const model = toDashboard(input({ tower: controlTowerView() }));
    expect(FLEET_KEYS.map((key) => statOf(model, key)?.value)).toEqual(['0', '0', '0']);
  });

  it('giu nhan, thu tu va duong dan cua ba the — dan vao `Đội xe & lái xe`', () => {
    const model = toDashboard(input({ tower: controlTowerView({ fleet: running(1, 1) }) }));

    expect(model.stats.map((stat) => stat.key)).toEqual([
      'orders-open',
      'runs-running',
      'runs-planned',
      ...FLEET_KEYS,
    ]);
    expect(statOf(model, 'vehicles-idle')).toMatchObject({
      label: 'Xe đang rỗi',
      hint: null,
      section: 'fleet',
    });
    expect(statOf(model, 'vehicles-maintenance')).toMatchObject({
      label: 'Xe đang bảo dưỡng',
      section: 'fleet',
    });
    expect(statOf(model, 'drivers-active')).toMatchObject({
      label: 'Lái xe đang làm',
      hint: null,
      section: 'fleet',
    });
  });

  it('the bao duong noi ro: doc tu trang thai xe, va xe co vong chay dang chay khong tinh o day', () => {
    const hint = statOf(toDashboard(input()), 'vehicles-maintenance')?.hint;
    expect(hint).toContain('chưa phải từ lịch bảo dưỡng');
    expect(hint).toContain('vòng chạy đang chạy');
  });

  it('Bang dieu hanh chua co trong tay (dang doc, doc loi): KHONG the doi xe nao, KHONG so 0', () => {
    const model = toDashboard(
      input({ tower: null, orders: [order()], reconciliations: [reconciliation()] }),
    );

    for (const key of FLEET_KEYS) expect(statOf(model, key), key).toBeUndefined();
    /* Nguon khac van song: the don va the ky doi soat van la so that. */
    expect(statOf(model, 'orders-open')?.value).toBe('1');
    expect(statOf(model, 'reconciliations-open')?.value).toBe('1');
  });

  it.each(BLOCKED)(
    '$name: KHONG so doi xe nao — ke ca khi du lieu con trong cache',
    ({ navigation }) => {
      const model = toDashboard(
        input({ tower: controlTowerView({ fleet: running(3, 2) }), navigation }),
      );

      for (const key of FLEET_KEYS) expect(statOf(model, key), key).toBeUndefined();
      expect(model.operationsNotice).toContain('số liệu đội xe');
    },
  );

  it.each([
    { name: 'Ke toan', navigation: { capabilities: CORE, role: 'ACCOUNTING' } },
    { name: 'chua biet vai (dang doi /auth/me)', navigation: { capabilities: CORE, role: null } },
  ] satisfies readonly { name: string; navigation: NavigationInput }[])(
    '$name mo duoc Bang dieu hanh nen thay so doi xe',
    ({ navigation }) => {
      const model = toDashboard(
        input({ tower: controlTowerView({ fleet: running(3, 2) }), navigation }),
      );
      expect(FLEET_KEYS.map((key) => statOf(model, key)?.value)).toEqual(['0', '0', '2']);
    },
  );

  it('Tong quan KHONG nhan danh sach xe hay lai xe — khong con duong nao de dem lai', () => {
    expectTypeOf<Extract<keyof DashboardInput, 'vehicles' | 'drivers'>>().toBeNever();
  });
});

describe('the ky doi soat — nguon giu nguyen', () => {
  it('goi khong bat nhien lieu thi the van la so that nhung khong dan di dau', () => {
    const model = toDashboard(input({ reconciliations: [reconciliation()] }));
    /* `fuel` doi `transport-fuel`, ma goi nay khong bat. */
    expect(statOf(model, 'reconciliations-open')).toMatchObject({ value: '1', section: null });
  });

  it('muc mo duoc thi the dan dung muc', () => {
    const model = toDashboard(
      input({
        reconciliations: [reconciliation()],
        navigation: { capabilities: ['transport-core', 'transport-fuel'], role: 'ADMIN' },
      }),
    );
    expect(statOf(model, 'reconciliations-open')?.section).toBe('fuel');
  });

  it('the ky doi soat chi hien khi co du lieu ky — khong bay mot so 0 vo nghia', () => {
    expect(statOf(toDashboard(input()), 'reconciliations-open')).toBeUndefined();
    expect(
      statOf(toDashboard(input({ reconciliations: [reconciliation()] })), 'reconciliations-open')
        ?.value,
    ).toBe('1');
  });
});

/**
 * BANG CHI DEM DUOC MOI HIEN — #195, va luat nhan cua #348: giao dien noi bang chu cua nguoi van
 * hanh, khong bang chu cua kien truc.
 */
describe('bang khong duoc bia so, va khong noi tieng cua kien truc', () => {
  it('KHONG bia the bao duong / tuan thu / luong', () => {
    const labels = toDashboard(
      input({ navigation: { ...ADMIN, capabilities: WITH_SETTLEMENT } }),
    ).stats.map((stat) => stat.label);
    for (const forbidden of ['Bảo dưỡng', 'Giấy tờ', 'Lương', 'Phiếu lương']) {
      expect(labels.some((label) => label.includes(forbidden))).toBe(false);
    }
  });

  it('bat them nghiep vu quyet toan KHONG lam moc them mot con so nao', () => {
    const labelsOf = (capabilities: readonly CapabilityId[]) =>
      toDashboard(input({ navigation: { ...ADMIN, capabilities } })).stats.map(
        (stat) => stat.label,
      );
    expect(labelsOf(WITH_SETTLEMENT)).toEqual(labelsOf(CORE));
  });

  it('moi con so tro ve mot muc dung duoc, hoac khong tro di dau', () => {
    const surfaced = ['movement', 'control-tower', 'fleet', 'fuel', null];
    for (const stat of toDashboard(
      input({ orders: [order()], reconciliations: [reconciliation()] }),
    ).stats) {
      expect(surfaced).toContain(stat.section);
    }
  });

  it('khong mot chu `run`, `leg`, `legacy`, `TransportTrip` nao len giao dien', () => {
    const model = toDashboard(
      input({
        orders: [order()],
        trips: [trip({ status: 'IN_TRANSIT' })],
        tower: controlTowerView({ fleet: running(2, 1), queue: [queueItem()], queueTotal: 1 }),
      }),
    );
    const blocked = toDashboard(input({ navigation: { capabilities: CORE, role: 'MANAGER' } }));
    for (const text of [...renderedTexts(model), ...renderedTexts(blocked)]) {
      expect(text).not.toMatch(/\b(run|runs|leg|legs|legacy|TransportTrip)\b/i);
    }
  });
});

describe('tat dinh', () => {
  it('cung dau vao cho ra cung ket qua', () => {
    const source = input({
      orders: [order()],
      trips: [trip({ status: 'PLANNED' })],
      tower: controlTowerView({ fleet: running(1, 1), queue: [queueItem()], queueTotal: 1 }),
    });
    expect(toDashboard(source)).toEqual(toDashboard(source));
  });
});
