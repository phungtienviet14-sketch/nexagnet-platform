import type { Order, RunLeg } from '../movement/movement.types.js';
import { summariseRunDistance, type RunDistanceSummary } from '../movement/run-distance.js';
import type { SettlementFlow } from '../settlement/settlement-flows.js';
import { money, MoneyError } from '../money.js';

/**
 * CHI SO VAN HANH NOI BO-B — ham THUAN, doi soat duoc ve tung hang nguon (`R8`, Issue #237).
 *
 * ===========================================================================
 * TEP NAY KHONG DINH NGHIA MOT MO HINH NAO, VA KHONG TINH LAI THU DA CO.
 *
 * #237: *"Do not create shadow copies of upstream domain models just to make analytics compile."*
 * Nen dau vao o day la CHINH `Order`/`RunLeg` cua Lane A, va phep gop quang duong la CHINH
 * `summariseRunDistance()` — ham ma Lane A da viet kem mot ghi chu noi thang rang no danh cho `R8`.
 *
 * Viec con lai cua tep nay la ba con so ma CHUA AI tinh, va chung deu o grain moi cua Lane A:
 *
 *   · bien truc tiep theo DON HANG      (`TX-05` tinh theo CHUYEN, khong theo don)
 *   · bien truc tiep theo CA VONG CHAY  (ke ca chang rong — chinh la "full VehicleRun/cycle")
 *   · doanh thu/km va chi phi/km
 *
 * `computeDirectMargin()` cua `TX-05` KHONG bi thay the va khong bi goi lai o day: no tra loi mot
 * cau khac ("mot CHUYEN lai bao nhieu", co hoa hong va cong no nha xe), tren mot truc khac. Hai con
 * so song song la co y; gop chung se lam mat mot trong hai cau hoi.
 *
 * ===========================================================================
 * MOI CON SO PHAI DOI SOAT DUOC. Do la yeu cau chu cua #237: *"headline loaded/empty/direct-margin
 * metrics reconcile deterministically to underlying source rows"*. Nen moi ket qua tong hop deu
 * mang theo MA cac hang da duoc cong vao. Mot con so khong noi duoc no den tu dau la mot con so
 * khong ai kiem duoc, va no se duoc tin cho toi ngay co nguoi doi chieu tay.
 *
 * ===========================================================================
 * KHONG CONG NAM DONG TIEN VAO MOT TONG (`INV-23`, Issue #87) — xem `SettlementBuckets` o cuoi tep.
 */

/**
 * MOT KHOAN CHI TRUC TIEP da quy ve CHANG.
 *
 * KHONG phai ban sao cua mot mo hinh nao: `TX-03` gan chi phi vao `TransportTrip`, va Lane A gan
 * chang vao `TransportRunLeg`; "chi phi o grain chang" la mot thu chua ton tai o dau ca. Cau noi la
 * `TransportTripRunLegLink` (1-1: `tripId` la khoa chinh, `legId` la `@unique`), nen mot chang co
 * toi da MOT chuyen, va tong chi phi cua chang la tong cac dong cua chuyen do.
 *
 * `signedAmount` CO DAU — dong dao mang so am, nen phep cong o day khong phai loc gi ca.
 */
export interface LegCostFact {
  readonly legId: string;
  /** Chuyen `TX-03` da sinh ra khoan nay — duong doi soat nguoc ve `TransportTripExpense`. */
  readonly tripId: string;
  readonly signedAmount: number;
}

const add = (left: number, right: number): number => {
  try {
    return money(money(left).amount + money(right).amount).amount;
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new MoneyError(`Cong don chi so van hanh vuot khoang bieu dien duoc: ${error.message}`);
    }
    throw error;
  }
};

/**
 * CHANG DA HUY KHONG DUOC DEM — cung quy uoc voi `summariseRunDistance()`.
 *
 * Vi sao viet lai o day thay vi dung chung mot ham: `countsTowardsDistance` cua Lane A la chi tiet
 * NOI BO cua phep gop km, va keo no ra thanh API cong khai chi de dung mot lan la lam dong cung mot
 * thu Lane A con quyen doi. Doi lai, co MOT bai test khang dinh hai ben van dem cung mot tap chang
 * (`countedLegs` khop voi so ma thu duoc) — nen neu quy uoc troi, bai do do truoc khi bao cao lech.
 */
const counts = (leg: RunLeg): boolean => leg.status !== 'CANCELLED';

/**
 * DAU VAO THIEU, ghi ten thay vi de ngam — cung khuon `PAYROLL_MISSING_INPUTS` cua `TX-07`.
 *
 * Mot ty le km rong tinh tren mot tap co chang thieu km la mot con so SAI ma khong bao loi. Nen moi
 * phep do deu mang theo danh sach nay, va giao dien phai hien no.
 */
export const METRIC_GAPS = [
  /** Co chang khong co `distanceKm`. Moi con so theo km deu bi anh huong. */
  'LEG_DISTANCE_MISSING',
  /** Co don hang chua chot cuoc. Doanh thu va bien deu bi anh huong. */
  'ORDER_FREIGHT_MISSING',
  /** Tong km bang khong — khong chia duoc. `revenuePerKm`/`costPerKm` se la `null`. */
  'NO_DISTANCE_RECORDED',
  /**
   * MAU THUAN DU LIEU: mot chang chua huy dang chay mot don DA HUY.
   *
   * Bao ra thay vi tu quyet — cung khuon `unexpectedInternalCost` cua `TX-05`. Bo doanh thu di hay
   * giu lai deu la mot quyet dinh nghiep vu ma chua ai ra; cai dung o tang bao cao la NOI RANG co
   * mau thuan, va de nguoi doc xu ly.
   */
  'ORDER_CANCELLED_WITH_ACTIVE_LEG',
] as const;
export type MetricGap = (typeof METRIC_GAPS)[number];

/**
 * DUONG DOI SOAT cua phep gop km — MA cac chang, khong phai so luong.
 *
 * `summariseRunDistance()` tra ve DEM (`countedLegs`, `legsMissingDistance`), du de doc mot bao cao
 * nhung khong du de kiem no: "3 chang thieu km" khong cho ai biet di mo chang nao. #237 doi doi
 * soat duoc ve tung hang, nen o day la danh sach ma.
 */
export interface DistanceProvenance {
  /** Chang co gop km vao tong. */
  readonly legIdsCounted: readonly string[];
  /** Chang duoc dem nhung THIEU km — ly do khien `emptyRatio` la `null`. */
  readonly legIdsMissingDistance: readonly string[];
  /** Chang DA HUY, khong duoc dem. Doc duoc, khong bi nuot. */
  readonly legIdsExcluded: readonly string[];
}

export function distanceProvenance(legs: readonly RunLeg[]): DistanceProvenance {
  const counted: string[] = [];
  const missing: string[] = [];
  const excluded: string[] = [];

  for (const leg of legs) {
    if (!counts(leg)) excluded.push(leg.id);
    else if (leg.distanceKm === null) missing.push(leg.id);
    else counted.push(leg.id);
  }

  return {
    legIdsCounted: counted,
    legIdsMissingDistance: missing,
    legIdsExcluded: excluded,
  };
}

/** BIEN TRUC TIEP cua MOT don hang — doanh thu tru chi phi truc tiep cua cac chang chay no. */
export interface OrderMargin {
  readonly orderId: string;
  readonly revenue: number | null;
  readonly directCost: number;
  /** `revenue - directCost`. `null` khi chua chot cuoc — khong doan bang `0`. */
  readonly directMargin: number | null;
  readonly loadedKm: number;
  readonly legIds: readonly string[];
  /** Chuyen `TX-03` da gop chi phi vao day — duong doi soat ve `TransportTripExpense`. */
  readonly tripIds: readonly string[];
  readonly currencyCode: string;
  readonly gaps: readonly MetricGap[];
}

/**
 * BIEN THEO DON HANG.
 *
 * CHI cong chi phi cua nhung chang CHAY DON DO. Mot chang rong khong thuoc don hang nao (Lane A da
 * bat bien hoa: `orderId` BAT BUOC `null` khi `kind === 'EMPTY'`), nen chi phi chang rong KHONG vao
 * bien cua bat ky don nao — no chi xuat hien o bien cua ca VONG CHAY. Do chinh la ly do hai phep do
 * nay ton tai rieng: mot don hang co the co lai trong khi ca vong chay lo, va gop chung se giau mat
 * dieu do.
 */
export function foldOrderMargins(
  orders: readonly Order[],
  legs: readonly RunLeg[],
  costs: readonly LegCostFact[],
): readonly OrderMargin[] {
  const costByLeg = new Map<string, number>();
  const tripsByLeg = new Map<string, Set<string>>();
  for (const cost of costs) {
    costByLeg.set(cost.legId, add(costByLeg.get(cost.legId) ?? 0, cost.signedAmount));
    const trips = tripsByLeg.get(cost.legId) ?? new Set<string>();
    trips.add(cost.tripId);
    tripsByLeg.set(cost.legId, trips);
  }

  return orders.map((order) => {
    const own = legs.filter((leg) => leg.orderId === order.id && counts(leg));
    const gaps: MetricGap[] = [];
    if (order.freightAmount === null) gaps.push('ORDER_FREIGHT_MISSING');
    if (own.some((leg) => leg.distanceKm === null)) gaps.push('LEG_DISTANCE_MISSING');
    if (order.status === 'CANCELLED' && own.length > 0)
      gaps.push('ORDER_CANCELLED_WITH_ACTIVE_LEG');

    let directCost = 0;
    let loadedKm = 0;
    const tripIds = new Set<string>();
    for (const leg of own) {
      directCost = add(directCost, costByLeg.get(leg.id) ?? 0);
      for (const tripId of tripsByLeg.get(leg.id) ?? []) tripIds.add(tripId);
      if (leg.kind === 'LOADED' && leg.distanceKm !== null)
        loadedKm = add(loadedKm, leg.distanceKm);
    }

    return {
      orderId: order.id,
      revenue: order.freightAmount,
      directCost,
      directMargin: order.freightAmount === null ? null : add(order.freightAmount, -directCost),
      loadedKm,
      legIds: own.map((leg) => leg.id),
      tripIds: [...tripIds],
      currencyCode: order.currencyCode,
      gaps,
    };
  });
}

/** BIEN cua MOT VONG CHAY — ca chu ky, ke ca chang rong. */
export interface RunMargin {
  readonly runId: string;
  readonly revenue: number;
  readonly directCost: number;
  readonly directMargin: number;
  /** Phep gop km cua Lane A, nguyen ven — khong tinh lai o day. */
  readonly distance: RunDistanceSummary;
  readonly provenance: DistanceProvenance;
  /** `revenue / totalKm`, lam tron ve dong. `null` khi chua co km nao. */
  readonly revenuePerKm: number | null;
  readonly costPerKm: number | null;
  /** Don da duoc cong cuoc — DEM MOT LAN moi don. */
  readonly orderIds: readonly string[];
  readonly tripIds: readonly string[];
  readonly gaps: readonly MetricGap[];
}

/**
 * BIEN THEO VONG CHAY — con so ma #237 goi la *"direct operating margin by full VehicleRun/cycle"*.
 *
 * Doanh thu la tong cuoc cua cac don ma vong chay nay CHAY, DEM MOT LAN moi don: hai chang cua cung
 * mot don khong duoc cong cuoc hai lan. Do la cho de dem doi nhat trong ca tep, va `Set` o duoi la
 * thu duy nhat ngan no.
 *
 * Chi phi la tong MOI chang cua vong chay — KE CA chang rong. Chieu ve rong ton tien dau, tien
 * duong va tien luong y het chieu di; bo no ra khoi bien la lam moi vong chay trong dep hon thuc te.
 */
export function foldRunMargin(
  runId: string,
  legs: readonly RunLeg[],
  orders: readonly Order[],
  costs: readonly LegCostFact[],
): RunMargin {
  const own = legs.filter((leg) => leg.runId === runId);
  const counted = own.filter(counts);
  const distance = summariseRunDistance(own);
  const provenance = distanceProvenance(own);

  const costByLeg = new Map<string, number>();
  const tripsByLeg = new Map<string, Set<string>>();
  for (const cost of costs) {
    costByLeg.set(cost.legId, add(costByLeg.get(cost.legId) ?? 0, cost.signedAmount));
    const trips = tripsByLeg.get(cost.legId) ?? new Set<string>();
    trips.add(cost.tripId);
    tripsByLeg.set(cost.legId, trips);
  }

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const seenOrders = new Set<string>();
  const tripIds = new Set<string>();
  const gaps: MetricGap[] = [];

  let revenue = 0;
  let directCost = 0;
  for (const leg of counted) {
    directCost = add(directCost, costByLeg.get(leg.id) ?? 0);
    for (const tripId of tripsByLeg.get(leg.id) ?? []) tripIds.add(tripId);

    if (leg.orderId === null || seenOrders.has(leg.orderId)) continue;
    seenOrders.add(leg.orderId);
    const order = orderById.get(leg.orderId);
    if (!order) continue;
    if (order.status === 'CANCELLED') gaps.push('ORDER_CANCELLED_WITH_ACTIVE_LEG');
    if (order.freightAmount === null) {
      gaps.push('ORDER_FREIGHT_MISSING');
      continue;
    }
    revenue = add(revenue, order.freightAmount);
  }

  if (provenance.legIdsMissingDistance.length > 0) gaps.push('LEG_DISTANCE_MISSING');
  if (distance.totalKm === 0) gaps.push('NO_DISTANCE_RECORDED');

  const perKm = (value: number): number | null =>
    distance.totalKm === 0 ? null : Math.round(value / distance.totalKm);

  return {
    runId,
    revenue,
    directCost,
    directMargin: add(revenue, -directCost),
    distance,
    provenance,
    revenuePerKm: perKm(revenue),
    costPerKm: perKm(directCost),
    orderIds: [...seenOrders],
    tripIds: [...tripIds],
    gaps: [...new Set(gaps)],
  };
}

/**
 * NAM DONG TIEN, GIU RIENG — va CO Y khong co truong `total`.
 *
 * `INV-23` + Issue #87: cong no khach, cong no cay xang, cong no nha xe, hoa hong doi tac, tien
 * phai tra lai xe va luong da ghi nhan chua rut la nhung cau hoi khac nhau voi nhung doi tuong khac
 * nhau. Cong chung lai cho ra mot con so khong ai no ai ca — va vi no doc len co ve co nghia, no se
 * di vao mot bao cao.
 *
 * BON DONG DAU KHOA THEO `SettlementFlow` chu khong phai bon truong roi. Do khong phai chuyen hinh
 * thuc: `Record<SettlementFlow, number>` bat buoc du bon khoa, nen ngay ai them mot dong tien thu
 * nam vao `TX-05`, tep nay KHONG BIEN DICH duoc nua — thay vi lang le bo sot no khoi bao cao.
 *
 * `import type` chu khong `import`: `SettlementFlow` bien mat hoan toan khi sinh JavaScript, nen
 * mot khach bat `transport-costing` ma tat `transport-settlement` van nap duoc tep nay. Cung ly le
 * da viet o `transport.errors.ts`.
 *
 * HAI DONG CUOI PHAI TACH: `driverReimbursementOutstanding` la tien lai xe da bo tui cho cong ty
 * (`TX-03`, so du quy am — `DA-T3-01`); `driverSettlementRemaining` la luong DA GHI NHAN ma lai xe
 * chua rut (`TX-07b`). Gop chung se lam mot lan chi hoan ung trong nhu mot lan tra luong — dung
 * dieu `TX-07b` ton tai de tranh.
 */
export interface SettlementBuckets {
  /** `TX-05` — bon so cai co chung tu, KHONG BAO GIO cong lai voi nhau (`GD-15`). */
  readonly flows: Readonly<Record<SettlementFlow, number>>;
  /** `TX-03` — cong ty no lai xe bao nhieu. KHONG PHAI luong. */
  readonly driverReimbursementOutstanding: number;
  /** `TX-07b` — luong da ghi nhan ma lai xe chua rut. KHONG PHAI hoan ung. */
  readonly driverSettlementRemaining: number;
}
