import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { TRANSPORT_PLANNING_POLICY } from './planning-policy.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * CONG TAC VAN HANH cua luot quet — khong phai mot chinh sach khach.
 *
 * Cung khuon voi `WORKFLOW_ENGINE` cua `workflow-engine-switch.ts`: mot cong tac doi khi phai tat
 * khan cap mot co che chay nen, tach khoi cau hinh nghiep vu cua khach.
 *
 * MAC DINH LA `on`, va do la mot quyet dinh chu khong mot su sot. Khac bo lap lich workflow (chi
 * chay khi khach bat mot engine ben ngoai), luot quet nay khong can ha tang nao them: no doc dung
 * hai bang da co. Va muc tieu cua ca lane la *"VehicleRun is system-managed and normal users do not
 * have to decide when to close it"* — mot co che mac dinh TAT se lam cau do khong dung voi bat ky
 * khach nao chua doc tai lieu nay.
 *
 * Tat bang gia tri `off` (khong phan biet hoa thuong). Moi gia tri khac — ke ca khong khai — la bat.
 */
export const RUN_CLOSURE_SWEEP_SWITCH_ENV = 'TRANSPORT_RUN_CLOSURE_SWEEP';

export function runClosureSweepEnabled(
  value: string | undefined = process.env[RUN_CLOSURE_SWEEP_SWITCH_ENV],
): boolean {
  return value?.trim().toLowerCase() !== 'off';
}

/**
 * LUOT QUET DINH KY — `#293` R3.
 *
 * ============================================================================================
 * TIMER NAY CHI DANH THUC; NO KHONG GIU TRANG THAI NAO
 * ============================================================================================
 *
 * Cung quy uoc voi `CampaignScheduler`: *"Timer only wakes the durable database worker; delivery
 * state never lives in this timer."* Tap vong chay can dong duoc suy ra TU SU THAT NGUON moi lan
 * quet (xem `RunClosureService.sweep()`), nen tien trinh chet giua hai luot quet khong lam mat gi —
 * luot quet sau doc lai dung nhung vong chay do. Mot bo dem trong bo nho se mat, con mot cau truy
 * van tren bang thi khong.
 *
 * Vi vay `.unref()`: timer nay khong duoc giu tien trinh API song chi vi no.
 */
@Injectable()
export class RunClosureSweepScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunClosureSweepScheduler.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly closures: RunClosureService,
    @Inject(TRANSPORT_PLANNING_POLICY) private readonly policy: TransportPlanningPolicy,
  ) {}

  onModuleInit(): void {
    if (!runClosureSweepEnabled()) {
      this.logger.log(
        `Luot quet dong vong chay dang TAT (${RUN_CLOSURE_SWEEP_SWITCH_ENV}=off) — vong chay chi duoc phan xu khi mot chang doi trang thai.`,
      );
      return;
    }

    this.timer = setInterval(() => void this.runTick(), this.policy.sweep.intervalSeconds * 1_000);
    this.timer.unref();
    void this.runTick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * MOT luot quet khong bao gio nem.
   *
   * Mot lan quet hong (CSDL ngat, mang chap chon) khong duoc lam chet tien trinh API — va cung
   * khong duoc lam chet luot quet ke tiep, vi `setInterval` da len lich no tu truoc. Loi chi duoc
   * ghi log; trang thai vong chay khong doi.
   */
  private async runTick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.closures.sweep();
    } catch (error) {
      this.logger.error(
        `Luot quet dong vong chay that bai: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
