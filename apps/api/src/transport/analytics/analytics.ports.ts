import { Injectable } from '@nestjs/common';
import { CostingRepository } from '../costing/costing.repository.js';
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
 * VI SAO KHONG CO CONG THU BA (`transport-settlement`, `transport-fuel`, `transport-workforce`).
 *
 * `SettlementBuckets` doi so lieu tu ca bon capability. Nhung `transport-costing` — chu so huu cua
 * `R8` — chi phu thuoc `transport-core` (`tenant.schema.ts`). Mo mot cong sang settlement/fuel o
 * day se bien mot phu thuoc HOP DONG thanh phu thuoc THAT, va mot khach bat `transport-costing` ma
 * tat `transport-settlement` se khong boot duoc nua.
 *
 * Nen `R8` ban nay phoi dung phan doc duoc trong pham vi cua chinh no: chi so van hanh cua mot vong
 * chay. `SettlementBuckets` o `operating-metrics.ts` la HOP DONG cho be mat tong hop do, va viec
 * buoc no vao bon nguon la mot buoc CONG THEM co y thuc — kem mot quyet dinh ve capability nao so
 * huu no.
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
