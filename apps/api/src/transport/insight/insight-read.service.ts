import { Inject, Injectable, Optional } from '@nestjs/common';
import { toBusinessDate } from '../business-date.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { InsightCoreFacts } from './insight-facts.port.js';
import { buildCorridorInsight, buildFleetInsight, resolveInsightRange } from './insight-metrics.js';
import type { RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { CorridorInsightView, FleetInsightView, InsightRange } from './insight.types.js';

/**
 * BANG DOI XE + BAO CAO TUYEN — mot lan doc, khong mot duong ghi nao (#278 N6/N7).
 *
 * ===========================================================================
 * KHOANG NGAY DO MAY CHU CHOT, KHONG DO TRINH DUYET.
 *
 * `#278` N10: *"Time ranges must use tenant business-date/timezone semantics, not browser-local/UTC
 * accidents."* Khi man hinh khong gui khoang, may chu tu lay 30 ngay gan nhat TINH THEO MUI GIO
 * TENANT. Neu de trinh duyet tu tinh, mot nguoi mo bao cao luc 00:30 gio Viet Nam se thay mot
 * khoang lech mot ngay so voi dong nghiep ngoi canh — vi may cua ho doc `new Date()` ra ngay hom
 * truoc theo UTC.
 */
@Injectable()
export class InsightReadService {
  constructor(
    private readonly core: InsightCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async fleet(from?: string, to?: string): Promise<FleetInsightView> {
    const range = this.resolveRange(from, to);
    const [vehicles, runs] = await Promise.all([this.core.listVehicles(), this.core.listRuns()]);

    return buildFleetInsight({
      range,
      vehicles,
      runs,
      legsByRun: await this.readLegs(runs),
    });
  }

  async corridors(from?: string, to?: string): Promise<CorridorInsightView> {
    const range = this.resolveRange(from, to);
    const [runs, orders] = await Promise.all([this.core.listRuns(), this.core.listOrders()]);

    return buildCorridorInsight({
      range,
      runs,
      orders,
      legsByRun: await this.readLegs(runs),
    });
  }

  /**
   * Chi doc chang cua vong chay CHUA HUY — cung ly le voi thap dieu hanh: mot vong chay da huy
   * khong vao bao cao nao, nen doc chang cua no la N lan goi kho cho mot dong khong ai thay.
   */
  private async readLegs(
    runs: readonly VehicleRun[],
  ): Promise<ReadonlyMap<string, readonly RunLeg[]>> {
    const live = runs.filter((run) => run.status !== 'CANCELLED');
    const entries = await Promise.all(
      live.map(async (run) => [run.id, await this.core.listLegs(run.id)] as const),
    );
    return new Map(entries);
  }

  /**
   * `from`/`to` do nguoi goi dat, hoac 30 ngay gan nhat theo mui gio tenant.
   *
   * `assertBusinessDate` nem khi chuoi khong phai `YYYY-MM-DD` — mot khoang sai phai DUNG LAI o
   * bien, khong duoc di tiep thanh mot bao cao rong ma nguoi doc tuong la "khong co chuyen nao".
   */
  private resolveRange(from?: string, to?: string): InsightRange {
    return resolveInsightRange(
      from,
      to,
      toBusinessDate(this.clock?.() ?? new Date(), this.corePolicy.timeZone),
    );
  }
}
