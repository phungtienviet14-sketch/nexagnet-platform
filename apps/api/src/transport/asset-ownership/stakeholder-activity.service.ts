import { Inject, Injectable, Optional } from '@nestjs/common';
import { toBusinessDate } from '../business-date.js';
import { InsightCoreFacts } from '../insight/insight-facts.port.js';
import { resolveInsightRange } from '../insight/insight-metrics.js';
import type { RunLeg } from '../movement/movement.types.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { AssetOwnershipScopeService } from './asset-ownership-scope.service.js';
import { StakeholderMaintenanceFacts } from './stakeholder-activity-facts.port.js';
import {
  buildStakeholderActivity,
  type StakeholderActivityView,
  type StakeholderDowntime,
} from './stakeholder-activity.js';

/**
 * "XE TOI CO CO PHAN" — PHAN HOAT DONG (`#278` N9).
 *
 * ===========================================================================
 * PHAM VI DUOC AP TRUOC KHI DOC, KHONG PHAI LOC SAU KHI DOC.
 *
 * `InsightCoreFacts` la cong cua Bang doi xe: `listVehicles()` cua no tra ve CA DOI XE cua doanh
 * nghiep. Dung lai cong do o day la co y — hai man hinh phai doc cung mot nguon, neu khong thi ty
 * le su dung cua cung mot chiec xe se khac nhau o hai cho.
 *
 * Doi lai, tep nay phai tu ap pham vi, va no lam dieu do NGAY tai diem doc: `scope.vehicleIds` duoc
 * giai tu PHIEN (`AssetOwnershipScopeService.resolve()`), roi ca xe lan vong chay deu bi loc TRUOC
 * khi mot con so nao duoc cong. Khong mot tong nao trong ket qua chay tren mot chiec xe ngoai pham
 * vi — `stakeholder-activity.spec.ts` khang dinh dieu do bang mot cong co du lieu cua nguoi khac.
 *
 * ===========================================================================
 * KHONG MOT DUONG GHI NAO, VA KHONG MOT CON SO TIEN NAO.
 *
 * `#278` N9 cam: khong cong no toan cong ty, khong bang luong, khong toa do lai xe, khong xe cua
 * nguoi khac. Ba dieu dau khong co cong nao dan toi tu day; dieu thu tu la `scope`. Tien thi bi
 * chan boi KIEU — xem chu thich dau `stakeholder-activity.ts`.
 */
@Injectable()
export class StakeholderActivityService {
  constructor(
    private readonly scope: AssetOwnershipScopeService,
    private readonly core: InsightCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
    @Optional() private readonly maintenance?: StakeholderMaintenanceFacts,
  ) {}

  async activity(authUserId: string, from?: string, to?: string): Promise<StakeholderActivityView> {
    const scope = await this.scope.resolve(authUserId);
    const entitled = new Set(scope.vehicleIds);

    const today = toBusinessDate(this.clock?.() ?? new Date(), this.corePolicy.timeZone);
    const range = resolveInsightRange(from, to, today);

    const [allVehicles, allRuns] = await Promise.all([
      this.core.listVehicles(),
      this.core.listRuns(),
    ]);
    const vehicles = allVehicles.filter((vehicle) => entitled.has(vehicle.id));
    const runs = allRuns.filter((run) => entitled.has(run.vehicleId));

    const legsByRun = new Map<string, readonly RunLeg[]>();
    for (const run of runs) legsByRun.set(run.id, await this.core.listLegs(run.id));

    return buildStakeholderActivity({
      range,
      vehicles,
      runs,
      legsByRun,
      downtimeByVehicle: await this.readDowntime(vehicles.map((vehicle) => vehicle.id)),
    });
  }

  /**
   * SO NGAY NGHI — `null` khi khach chua bat `transport-asset-compliance`.
   *
   * Mot chiec xe doc HONG (cong nem) khong lam ca bang thanh "khong co nang luc": no chi vang o
   * dong cua chinh no. Gop hai truong hop lam mot se noi voi khach rang ho chua bat mot tinh nang
   * ma ho DA bat — va nguoi doc se di bat lai mot thu dang chay.
   */
  private async readDowntime(
    vehicleIds: readonly string[],
  ): Promise<ReadonlyMap<string, StakeholderDowntime> | null> {
    const facts = this.maintenance;
    if (!facts) return null;

    const byVehicle = new Map<string, StakeholderDowntime>();
    for (const vehicleId of vehicleIds) {
      try {
        const downtime = await facts.downtimeFor(vehicleId);
        if (downtime) byVehicle.set(vehicleId, downtime);
      } catch {
        /* Bo qua dong nay — quan sat khong duoc phep lam hong mot lan doc nghiep vu. */
      }
    }
    return byVehicle;
  }
}
