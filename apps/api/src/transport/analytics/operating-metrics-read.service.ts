import { Injectable, Optional } from '@nestjs/common';
import {
  AnalyticsCostFacts,
  AnalyticsFuelAttributionFacts,
  AnalyticsMovementFacts,
} from './analytics.ports.js';
import {
  foldRunMargin,
  type AttributedCostFact,
  type LegCostFact,
  type RunMargin,
} from './operating-metrics.js';

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
    /**
     * `#369` R-1 — NGUON THU HAI cua chi phi truc tiep: lop phan bo gia thanh nhien lieu Run-first.
     *
     * `@Optional()`: `transport-fuel` KHONG nam trong phu thuoc cua `transport-costing` (chieu nguoc
     * lai moi dung). Khach tat nhien lieu thi token vang mat va bao cao cong bo `FUEL_COST_ATTRIBUTION`
     * trong `unavailableSources` — con so no dua ra van la tong THAT cua nhung hang no doc duoc.
     */
    @Optional() private readonly fuelAttributions?: AnalyticsFuelAttributionFacts,
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

    /*
     * `#369` R-1 — NGUON THU HAI, doc bang MOT lan hoi theo vong chay.
     *
     * Hai nguon ROI NHAU theo cau truc (`#364` §3: mot phieu chi nam o mot so cai), nen cong thang
     * la dung — khong mot phep tru nao o day, va khong mot phep loc "dong nay da vao TX-03 chua".
     * Neu mot ngay nao do luat do doi, cho sua la o `#364`, khong phai o day.
     */
    const attributions = this.fuelAttributions
      ? (await this.fuelAttributions.listForRun(runId)).map((row): AttributedCostFact => ({
          attributionId: row.id,
          runId: row.runId,
          legId: row.legId,
          signedAmount: row.signedAmount,
        }))
      : [];

    return foldRunMargin(runId, legs, orders, expenseGroups.flat(), {
      attributions,
      unavailableSources: this.fuelAttributions ? [] : ['FUEL_COST_ATTRIBUTION'],
    });
  }
}
