import { Injectable } from '@nestjs/common';
import { CostingRepository } from '../costing/costing.repository.js';
import { FuelCostAttributionRepository } from '../fuel/fuel-cost-attribution.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { Order, RunLeg, TripRunLegLink, VehicleRun } from '../movement/movement.types.js';

/**
 * HAI CUA SO tu `R8` nhin ra ngoai. Ca hai deu CHI DOC.
 *
 * ===========================================================================
 * T1 §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) — giu bang CAU TRUC, khong bang ky luat.
 *
 * Tang bao cao khong duoc tiem `MovementRepository`/`CostingRepository` truc tiep: ca hai deu co
 * ham ghi, va mot ngay nao do se co nguoi goi mot ham ghi tu mot ham ten la `report...()`. Hai cong
 * duoi day khong co MOT ham ghi nao, nen cau "bao cao khong bao gio ghi" la mot dieu kien bien
 * dich, khong phai mot cau trong tai lieu. Cung khuon `settlement.ports.ts` da dat cho `TX-05`.
 *
 * ===========================================================================
 * CONG THU BA LA TUY CHON, VA DO LA CA DIEM CUA NO (`#369` R-1).
 *
 * `SettlementBuckets` doi so lieu tu ca bon capability. Nhung `transport-costing` — chu so huu cua
 * `R8` — chi phu thuoc `transport-core` (`tenant.schema.ts`). Mot cong BAT BUOC sang settlement/fuel
 * se bien mot phu thuoc HOP DONG thanh phu thuoc THAT, va mot khach bat `transport-costing` ma tat
 * `transport-settlement` se khong boot duoc nua.
 *
 * `AnalyticsFuelAttributionFacts` ben duoi vi vay la cong TUY CHON, theo dung khuon
 * `WorkforceWaitingAllowanceFacts` (`#279` O6): `R8` KHAI cong va adapter, capability so huu du lieu
 * CAM adapter vao qua mot module `@Global()` chi xuat dung token do
 * (`TransportFuelAnalyticsBridgeModule`), va khi vang mat thi `@Optional()` nhan `undefined` — bao
 * cao noi ra trong `unavailableSources`. Khach bat `transport-costing` ma tat `transport-fuel` VAN
 * boot, va van co bien truc tiep cua phan `TX-03`.
 *
 * `SettlementBuckets` o `operating-metrics.ts` van la HOP DONG chua ai noi vao: buoc no vao bon
 * nguon la mot buoc CONG THEM co y thuc, kem mot quyet dinh ve capability nao so huu no.
 */

/** CUA SO sang `transport-core`: don, vong chay, chang, va cau noi chang -> chuyen. */
export abstract class AnalyticsMovementFacts {
  abstract findRun(runId: string): Promise<VehicleRun | null>;
  abstract listLegs(runId: string): Promise<RunLeg[]>;
  /** Doc dung nhung don ma cac chang tro toi — khong quet ca bang. */
  abstract findOrders(orderIds: readonly string[]): Promise<Order[]>;
  abstract findTripLinksByLegs(legIds: readonly string[]): Promise<TripRunLegLink[]>;
}

@Injectable()
export class AnalyticsMovementFactsAdapter extends AnalyticsMovementFacts {
  constructor(private readonly repository: MovementRepository) {
    super();
  }

  findRun(runId: string): Promise<VehicleRun | null> {
    return this.repository.findRun(runId);
  }

  listLegs(runId: string): Promise<RunLeg[]> {
    return this.repository.listLegs(runId);
  }

  async findOrders(orderIds: readonly string[]): Promise<Order[]> {
    const found = await Promise.all(orderIds.map((id) => this.repository.findOrder(id)));
    return found.filter((order): order is Order => order !== null);
  }

  findTripLinksByLegs(legIds: readonly string[]): Promise<TripRunLegLink[]> {
    return this.repository.findTripLinksByLegs(legIds);
  }
}

/**
 * MOT DONG CHI cua `TX-03`, thu gon con dung phan `R8` can.
 *
 * CO Y bo `driverId`, `fundedBy`, `driverFundEntryId`: bien truc tiep khong quan tam AI ung tien,
 * va keo cac truong do vao day se de mot bao cao van hanh vo tinh dung lai so quy lai xe — dung cai
 * `INV-23` cam. Ai la nguoi ung la cau hoi cua `TX-03`, va no co be mat rieng.
 */
export interface AnalyticsExpenseFact {
  readonly id: string;
  readonly tripId: string;
  /** So nguyen dong CO DAU. Dong dao mang so am, nen phep cong khong phai loc gi. */
  readonly signedAmount: number;
  readonly currencyCode: string;
}

/** CUA SO sang `transport-costing`: chi phi truc tiep cua mot chuyen. */
export abstract class AnalyticsCostFacts {
  abstract listExpenses(tripId: string): Promise<AnalyticsExpenseFact[]>;
}

/**
 * MOT DONG PHAN BO GIA THANH NHIEN LIEU Run-first (`TransportFuelCostAttribution`, `#364`) — thu gon
 * con dung phan `R8` can. `#369` R-1.
 *
 * `signedAmount` CO DAU: cap phat duong, dong dao am — cong thang la ra phan dang hieu luc, khong loc
 * gi. `legId` `null` = dich `RUN` (chi phi o muc vong chay, khong thuoc chang nao).
 *
 * CO Y bo `recordedBy`, `note`, `correlationKey`: bao cao bien truc tiep hoi "bao nhieu va vao dau",
 * khong hoi "ai quyet" — cau do co be mat rieng (`GET /transport/fuel/entries/:id/cost-attribution`).
 */
export interface AnalyticsAttributedCostFact {
  /** Dong phan bo — DUONG DOI SOAT nguoc ve `TransportFuelCostAttribution`. */
  readonly id: string;
  readonly fuelEntryId: string;
  readonly runId: string;
  readonly legId: string | null;
  readonly signedAmount: number;
  readonly currencyCode: string;
}

/**
 * CUA SO THU BA — sang lop phan bo gia thanh cua `transport-fuel`. `#369` R-1. CHI DOC.
 *
 * ===========================================================================
 * VI SAO CONG NAY KHAI O DAY ma adapter song o `transport-fuel`
 *
 * `transport-costing` (chu cua `R8`) KHONG phu thuoc `transport-fuel` — chieu nguoc lai moi dung
 * (`tenant.schema.ts`). Nen `R8` khai DIEU NO CAN (cong nay, khong mot ham ghi nao), va capability
 * so huu du lieu cam adapter vao qua mot module `@Global()` chi xuat DUNG cong nay
 * (`TransportFuelAnalyticsBridgeModule`). Khach tat `transport-fuel` thi token vang mat,
 * `OperatingMetricsReadService` nhan `undefined` qua `@Optional()` va bao cao noi thang
 * `FUEL_COST_ATTRIBUTION` trong `unavailableSources` — khong mot so 0 gia.
 *
 * ===========================================================================
 * VI SAO CONG CHU KHONG DOC THANG PRISMA
 *
 * Bat bien "mot phieu, mot so cai" (`#364` §3) song o lop phan bo (trigger + CHECK). Bao cao doc qua
 * kho cua chinh lop do thi moi hien thuc — Prisma lan trong bo nho — cho cung mot tap dong; doc thang
 * bang se tao mot ban sao thu hai cua phep loc "dong nao thuoc vong chay nay".
 */
export abstract class AnalyticsFuelAttributionFacts {
  /** Moi dong (cap phat LAN dao) co dich nam trong vong chay nay — dich `RUN` va dich `LEG`. */
  abstract listForRun(runId: string): Promise<AnalyticsAttributedCostFact[]>;
}

/**
 * Hien thuc DUY NHAT — qua kho cua lop phan bo (`transport-fuel`). Duoc CAM VAO boi
 * `TransportFuelAnalyticsBridgeModule`, module den/di cung `transport-fuel`.
 *
 * Dat o day chu khong trong thu muc fuel, cung khuon `WorkforceWaitingAllowanceFactsAdapter` va
 * `JourneyFuelFactsAdapter`: hinh dang du lieu ma bao cao can la nhu cau CUA BAO CAO, va no phai
 * doi cung mot cho voi cong ngay tren.
 */
@Injectable()
export class AnalyticsFuelAttributionFactsAdapter extends AnalyticsFuelAttributionFacts {
  constructor(private readonly attributions: FuelCostAttributionRepository) {
    super();
  }

  async listForRun(runId: string): Promise<AnalyticsAttributedCostFact[]> {
    const rows = await this.attributions.listForRun(runId);
    return rows.map((row) => ({
      id: row.id,
      fuelEntryId: row.fuelEntryId,
      runId: row.runId,
      legId: row.legId,
      signedAmount: row.signedAmount,
      currencyCode: row.currencyCode,
    }));
  }
}

@Injectable()
export class AnalyticsCostFactsAdapter extends AnalyticsCostFacts {
  constructor(private readonly repository: CostingRepository) {
    super();
  }

  async listExpenses(tripId: string): Promise<AnalyticsExpenseFact[]> {
    const expenses = await this.repository.listExpenses(tripId);
    return expenses.map((expense) => ({
      id: expense.id,
      tripId: expense.tripId,
      signedAmount: expense.signedAmount,
      currencyCode: expense.currencyCode,
    }));
  }
}
