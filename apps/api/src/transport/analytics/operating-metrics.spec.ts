import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Order, RunLeg } from '../movement/movement.types.js';
import { summariseRunDistance } from '../movement/run-distance.js';
import {
  distanceProvenance,
  foldOrderMargins,
  foldRunMargin,
  type LegCostFact,
  type SettlementBuckets,
} from './operating-metrics.js';

/**
 * `R8` — CHI SO VAN HANH, va nam dieu chung phai giu.
 *
 * Kich ban goc lay tu chinh #232 §4 `R1-B`:
 *
 * ```text
 * VehicleRun R1
 * ├─ RunLeg HN -> HP, LOADED, order = A-001
 * └─ RunLeg HP -> HN, EMPTY
 * ```
 *
 * Cong them mot kich ban thu hai (chieu ve cung co don) de phep dem-mot-lan co gi de chung minh.
 *
 * Dung CHINH `RunLeg`/`Order` cua Lane A, khong dung kieu chieu rieng: mot bo fixture rieng se van
 * xanh sau ngay Lane A doi mo hinh, va do la dung cai bay ma #237 goi ten (*"no shadow copies"*).
 */

const AT = '2027-03-01T00:00:00.000Z';

const leg = (over: Partial<RunLeg> & Pick<RunLeg, 'id'>): RunLeg => ({
  runId: 'run-1',
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderId: null,
  originLabel: 'HN',
  destinationLabel: 'HP',
  businessDate: '2027-03-01',
  distanceKm: 100,
  plannedDistanceKm: null,
  startedAt: AT,
  completedAt: AT,
  note: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

const order = (over: Partial<Order> & Pick<Order, 'id'>): Order => ({
  code: `ORD-${over.id}`,
  status: 'FULFILLED',
  businessDate: '2027-03-01',
  customerId: 'cus-1',
  originLabel: 'HN',
  destinationLabel: 'HP',
  cargoDescription: null,
  freightAmount: 6_500_000,
  currencyCode: 'VND',
  note: null,
  createdAt: AT,
  updatedAt: AT,
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const ORDER_A = order({ id: 'ord-A' });
const ORDER_C = order({ id: 'ord-C', freightAmount: 4_000_000 });

const cost = (legId: string, signedAmount: number, tripId = `trip-${legId}`): LegCostFact => ({
  legId,
  tripId,
  signedAmount,
});

/** Hai chang cua kich ban #232: di co hang, ve rong. */
const CYCLE: readonly RunLeg[] = [
  leg({ id: 'leg-1', kind: 'LOADED', distanceKm: 100, orderId: 'ord-A' }),
  leg({ id: 'leg-2', sequence: 2, kind: 'EMPTY', distanceKm: 100 }),
];

describe('distanceProvenance', () => {
  /**
   * PHEP GOP KM LA CUA LANE A. Tep nay chi them DUONG DOI SOAT — nen bai dau tien phai la bai
   * chung minh hai ben van dem cung mot tap chang. Neu quy uoc "chang huy khong duoc dem" troi o
   * mot ben, bai nay do TRUOC khi mot bao cao lech duoc phat ra.
   */
  it('dem dung cung tap chang ma `summariseRunDistance` dem', () => {
    const legs = [
      ...CYCLE,
      leg({ id: 'leg-3', sequence: 3, status: 'CANCELLED', distanceKm: 500 }),
      leg({ id: 'leg-4', sequence: 4, distanceKm: null }),
    ];
    const provenance = distanceProvenance(legs);
    expect(summariseRunDistance(legs).countedLegs).toBe(
      provenance.legIdsCounted.length + provenance.legIdsMissingDistance.length,
    );
    expect(provenance.legIdsExcluded).toEqual(['leg-3']);
  });

  /**
   * `GD-14` cam bia km. Mot chang thieu km ma dong gop `0` se lam ty le rong TUT xuong ma khong ai
   * biet — mot bao cao khen doi xe vi mot o du lieu con trong. Lane A tra `emptyRatio = null` o
   * dung tinh huong nay; o day chi kiem rang chang do CO TEN de nguoi van hanh di nhap.
   */
  it('chang THIEU km duoc goi ten, khong bi nuot', () => {
    const legs = [CYCLE[0]!, leg({ id: 'leg-2', sequence: 2, kind: 'EMPTY', distanceKm: null })];
    expect(distanceProvenance(legs).legIdsMissingDistance).toEqual(['leg-2']);
    expect(summariseRunDistance(legs).emptyRatio).toBeNull();
  });
});

describe('foldOrderMargins', () => {
  const costs = [cost('leg-1', 2_000_000), cost('leg-2', 1_500_000)];

  it('bien cua don CHI gom chi phi cua chang chay don do', () => {
    const [margin] = foldOrderMargins([ORDER_A], CYCLE, costs);
    expect(margin).toMatchObject({
      orderId: 'ord-A',
      revenue: 6_500_000,
      directCost: 2_000_000,
      directMargin: 4_500_000,
      loadedKm: 100,
      currencyCode: 'VND',
    });
    expect(margin?.legIds).toEqual(['leg-1']);
    expect(margin?.tripIds).toEqual(['trip-leg-1']);
  });

  /**
   * CHI PHI CHIEU VE RONG KHONG THUOC DON NAO.
   *
   * Do la ly do `foldOrderMargins` va `foldRunMargin` ton tai RIENG: don lai 4.500.000 trong khi ca
   * vong chay chi lai 3.000.000, va gop hai phep do lam mot se giau mat 1.500.000 do.
   */
  it('chi phi chang rong khong roi vao bien cua don nao', () => {
    const totalOrderCost = foldOrderMargins([ORDER_A], CYCLE, costs).reduce(
      (sum, row) => sum + row.directCost,
      0,
    );
    expect(totalOrderCost).toBe(2_000_000);
    expect(foldRunMargin('run-1', CYCLE, [ORDER_A], costs).directCost).toBe(3_500_000);
  });

  it('don chua chot cuoc cho bien `null` va mot ma thieu co ten', () => {
    const [margin] = foldOrderMargins([order({ id: 'ord-A', freightAmount: null })], CYCLE, costs);
    expect(margin?.directMargin).toBeNull();
    expect(margin?.gaps).toContain('ORDER_FREIGHT_MISSING');
  });

  it('dong dao mang so am nen tu tru ra, khong phai loc gi', () => {
    const [margin] = foldOrderMargins([ORDER_A], CYCLE, [
      cost('leg-1', 2_000_000),
      cost('leg-1', -2_000_000),
    ]);
    expect(margin?.directCost).toBe(0);
    expect(margin?.directMargin).toBe(6_500_000);
  });

  it('chang DA HUY khong keo chi phi vao bien cua don', () => {
    const legs = [leg({ id: 'leg-1', status: 'CANCELLED', orderId: 'ord-A' })];
    const [margin] = foldOrderMargins([ORDER_A], legs, [cost('leg-1', 2_000_000)]);
    expect(margin?.directCost).toBe(0);
    expect(margin?.legIds).toEqual([]);
  });
});

describe('foldRunMargin', () => {
  it('kich ban #232: HN->HP co hang, HP->HN rong', () => {
    const run = foldRunMargin(
      'run-1',
      CYCLE,
      [ORDER_A],
      [cost('leg-1', 2_000_000), cost('leg-2', 1_500_000)],
    );

    expect(run).toMatchObject({
      revenue: 6_500_000,
      directCost: 3_500_000,
      directMargin: 3_000_000,
      revenuePerKm: 32_500,
      costPerKm: 17_500,
    });
    expect(run.distance).toMatchObject({ loadedKm: 100, emptyKm: 100, totalKm: 200 });
    expect(run.distance.emptyRatio).toBe(0.5);
    expect(run.tripIds).toEqual(['trip-leg-1', 'trip-leg-2']);
  });

  it('kich ban #232 thu hai: chieu ve cung co don, ty le rong ve 0', () => {
    const legs = [
      leg({ id: 'leg-1', kind: 'LOADED', distanceKm: 100, orderId: 'ord-A' }),
      leg({ id: 'leg-2', sequence: 2, kind: 'LOADED', distanceKm: 100, orderId: 'ord-C' }),
    ];
    const run = foldRunMargin('run-1', legs, [ORDER_A, ORDER_C], []);
    expect(run.revenue).toBe(10_500_000);
    expect(run.distance.emptyRatio).toBe(0);
    expect(run.orderIds).toEqual(['ord-A', 'ord-C']);
  });

  /**
   * DEM MOT LAN MOI DON — cho de dem doi nhat trong ca tep.
   *
   * Mot don chay het hai chang (vd dung giua duong roi di tiep) van chi co MOT khoan cuoc. Neu
   * `Set` bien mat, doanh thu vong chay nhan doi va bien duong len gap doi — mot bao cao noi doi
   * theo dung chieu de chiu nhat.
   */
  it('mot don chay HAI chang chi duoc cong cuoc MOT lan', () => {
    const legs = [
      leg({ id: 'leg-1', kind: 'LOADED', distanceKm: 60, orderId: 'ord-A' }),
      leg({ id: 'leg-2', sequence: 2, kind: 'LOADED', distanceKm: 40, orderId: 'ord-A' }),
    ];
    const run = foldRunMargin('run-1', legs, [ORDER_A], []);
    expect(run.revenue).toBe(6_500_000);
    expect(run.orderIds).toEqual(['ord-A']);
    expect(run.distance.loadedKm).toBe(100);
  });

  it('chi tinh chang cua CHINH vong chay do', () => {
    const legs = [
      leg({ id: 'leg-1', runId: 'run-1', orderId: 'ord-A' }),
      leg({ id: 'leg-9', runId: 'run-2', distanceKm: 999, orderId: 'ord-C' }),
    ];
    const run = foldRunMargin('run-1', legs, [ORDER_A, ORDER_C], []);
    expect(run.distance.totalKm).toBe(100);
    expect(run.revenue).toBe(6_500_000);
  });

  it('chua co km nao thi hai con so theo km la `null` kem ma thieu', () => {
    const run = foldRunMargin('run-1', [leg({ id: 'leg-1', distanceKm: null })], [], []);
    expect(run.revenuePerKm).toBeNull();
    expect(run.costPerKm).toBeNull();
    expect(run.gaps).toContain('NO_DISTANCE_RECORDED');
    expect(run.gaps).toContain('LEG_DISTANCE_MISSING');
  });

  /**
   * MAU THUAN DU LIEU duoc BAO RA, khong duoc tu xu — cung khuon `unexpectedInternalCost` cua
   * `TX-05`. Bo doanh thu cua mot don da huy hay giu lai deu la quyet dinh nghiep vu chua ai ra.
   */
  it('don DA HUY ma van co chang chay thi bao mau thuan, khong tu bo doanh thu', () => {
    const legs = [leg({ id: 'leg-1', orderId: 'ord-A' })];
    const cancelled = order({ id: 'ord-A', status: 'CANCELLED', cancelledAt: AT });
    const run = foldRunMargin('run-1', legs, [cancelled], []);
    expect(run.gaps).toContain('ORDER_CANCELLED_WITH_ACTIVE_LEG');
    expect(run.revenue).toBe(6_500_000);
  });

  /**
   * DOI SOAT TAT DINH: tong chi phi cua vong chay phai bang tong cac dong nguon da cong vao. Day la
   * phep thu ma #237 goi la *"reconcile deterministically to underlying source rows"*.
   */
  it('tong chi phi khop dung tong cac dong nguon', () => {
    const costs = [cost('leg-1', 2_000_000), cost('leg-1', 300_000), cost('leg-2', 1_500_000)];
    const run = foldRunMargin('run-1', CYCLE, [ORDER_A], costs);
    expect(run.directCost).toBe(costs.reduce((sum, row) => sum + row.signedAmount, 0));
  });
});

/**
 * ===========================================================================
 * NAM DONG TIEN KHONG DUOC GOP.
 *
 * `INV-23` + Issue #87 + #237 (*"AR/AP/driver payable are not merged into one meaningless
 * number"*). Bai duoi day giu dieu do bang KIEU: neu ai them mot truong `total`, no thoi la `never`
 * va bai do — truoc khi mot con so vo nghia kip di vao mot bao cao.
 */
describe('nam dong tien giu rieng', () => {
  it('`SettlementBuckets` khong co truong tong nao', () => {
    expectTypeOf<Extract<keyof SettlementBuckets, 'total'>>().toBeNever();
    expectTypeOf<Extract<keyof SettlementBuckets, 'netPosition'>>().toBeNever();
  });

  /** Hoan ung KHONG PHAI luong — cau chu cua #237, giu bang hai truong tach han. */
  it('hoan ung va luong con lai la HAI truong khac nhau', () => {
    expectTypeOf<SettlementBuckets>().toHaveProperty('driverReimbursementOutstanding');
    expectTypeOf<SettlementBuckets>().toHaveProperty('driverSettlementRemaining');
  });

  /**
   * BON DONG CUA `TX-05` PHAI DU MAT. `Record<SettlementFlow, number>` bat buoc du khoa, nen ngay
   * ai them mot dong tien thu nam, tep khong bien dich duoc nua thay vi lang le bo sot no.
   */
  it('bon so cai cua `TX-05` deu co mat va giu rieng', () => {
    const buckets: SettlementBuckets = {
      flows: {
        CUSTOMER_FREIGHT: 12_000_000,
        FUEL_SUPPLIER: 3_000_000,
        CARRIER_SERVICE: 5_000_000,
        PARTNER_COMMISSION: 800_000,
      },
      driverReimbursementOutstanding: 450_000,
      driverSettlementRemaining: 9_000_000,
    };
    expect(Object.keys(buckets.flows).sort()).toEqual([
      'CARRIER_SERVICE',
      'CUSTOMER_FREIGHT',
      'FUEL_SUPPLIER',
      'PARTNER_COMMISSION',
    ]);
  });
});
