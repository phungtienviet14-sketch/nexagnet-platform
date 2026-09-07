import { Injectable } from '@nestjs/common';
import { AnalyticsCostFacts, AnalyticsMovementFacts } from './analytics.ports.js';
import { foldRunMargin, type LegCostFact, type RunMargin } from './operating-metrics.js';

/**
 * BAO CAO CHI SO VAN HANH — CHI DOC, va khong mot ham nao o day ghi gi.
 *
 * ===========================================================================
 * TANG NAY CHI LAM MOT VIEC: GOM HANG NGUON. Moi phep tinh nam o `operating-metrics.ts` (ham thuan,
 * co bai kiem rieng) va o `run-distance.ts` cua Lane A. Neu mot con so xuat hien o day ma khong di
 * qua mot trong hai cho do, thi no la mot phep tinh khong ai kiem duoc.
 *
 * ===========================================================================
 * DUONG CHI PHI: CHANG -> CHUYEN -> KHOAN CHI, va ba buoc do deu la du lieu that.
 *
 *   `TransportRunLeg` --(`TransportTripRunLegLink`, 1-1)--> `TransportTrip` --> `TransportTripExpense`
 *
 * Cau noi la mot bang CO THAT cua Lane A, khong phai mot phep doan theo ngay/xe. Do la ly do `R8`
 * doi soat duoc: moi dong tien trong bao cao co mot chuyen di kem ma nguoi doi soat mo len xem duoc.
 *
 * Chang KHONG co lien ket chuyen thi chi phi bang 0 — khong phai "chua biet". Mot chang chua duoc
 * chieu tu chuyen v1 nao la mot chang khong co khoan chi nao duoc ghi, va do la su that.
 */
@Injectable()
export class OperatingMetricsReadService {
  constructor(
    private readonly movement: AnalyticsMovementFacts,
    private readonly costs: AnalyticsCostFacts,
  ) {}

  /**
   * BIEN TRUC TIEP cua CA MOT VONG CHAY — *"direct operating margin by full VehicleRun/cycle"*.
   *
   * `null` = khong co vong chay nay. Tra `null` chu khong tra mot bao cao rong: mot khung nhin nhan
   * bao cao rong khong phan biet duoc "vong chay khong ton tai" voi "vong chay co that nhung chua
   * chay km nao".
   */
  async runMargin(runId: string): Promise<RunMargin | null> {
    const run = await this.movement.findRun(runId);
    if (!run) return null;

    const legs = await this.movement.listLegs(runId);

    /**
     * MOT lan hoi cho ca lo chang, khong phai mot lan moi chang. Mot vong chay muoi chang se thanh
     * muoi lan di ve neu viet trong vong lap — va cai gia do roi thang vao mot man hinh bao cao.
     */
    const links = await this.movement.findTripLinksByLegs(legs.map((leg) => leg.id));
    const expenseGroups = await Promise.all(
      links.map(async (link) => {
        const expenses = await this.costs.listExpenses(link.tripId);
        return expenses.map((expense): LegCostFact => ({
          legId: link.legId,
          tripId: link.tripId,
          signedAmount: expense.signedAmount,
        }));
      }),
    );

    const orderIds = [
      ...new Set(legs.map((leg) => leg.orderId).filter((id): id is string => id !== null)),
    ];
    const orders = await this.movement.findOrders(orderIds);

    return foldRunMargin(runId, legs, orders, expenseGroups.flat());
  }
}
