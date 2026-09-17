import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { FuelHandoffDrainService } from './fuel-handoff-drain.service.js';

/**
 * CONG TAC VAN HANH cua vong quet — khong phai mot chinh sach khach.
 *
 * Cung khuon `TRANSPORT_RUN_CLOSURE_SWEEP` cua `run-closure-sweep.scheduler.ts`: mot cong tac doi
 * khi phai tat khan cap mot co che chay nen, tach khoi cau hinh nghiep vu cua khach.
 *
 * MAC DINH LA `on`, va do la mot quyet dinh chu khong mot su sot. Mot ban mac dinh TAT se lam moi
 * khach da bat `transport-settlement` dong ky doi soat ma khong bao gio thay cong no cay xang —
 * dung cai loi ma lane nay sinh ra de sua. Vong quet khong can ha tang nao them: no doc hai bang
 * da co.
 *
 * Tat bang gia tri `off` (khong phan biet hoa thuong). Moi gia tri khac — ke ca khong khai — la bat.
 */
export const FUEL_HANDOFF_DRAIN_SWITCH_ENV = 'TRANSPORT_FUEL_HANDOFF_DRAIN';

export function fuelHandoffDrainEnabled(
  value: string | undefined = process.env[FUEL_HANDOFF_DRAIN_SWITCH_ENV],
): boolean {
  return value?.trim().toLowerCase() !== 'off';
}

/**
 * NHIP QUET.
 *
 * 60 giay: ban giao duoc phat luc ke toan dong ky, va do la mot thao tac nguoi lam vai lan mot
 * thang. Mot nhip nhanh hon khong lam so tien dung hon — no chi lam nhieu luot doc rong hon. Mot
 * nhip cham hon (vai phut) lam ke toan dong ky xong roi nhin mot bang cong no chua co gi, va se
 * bam lai vi tuong minh lam sai.
 */
const DRAIN_INTERVAL_MS = 60_000;

/**
 * LUOT QUET DINH KY cua `#295` Lane V, P0.
 *
 * ============================================================================================
 * TIMER NAY CHI DANH THUC; NO KHONG GIU TRANG THAI NAO
 * ============================================================================================
 *
 * Cung quy uoc voi `CampaignScheduler` va `RunClosureSweepScheduler`: *"Timer only wakes the
 * durable database worker; delivery state never lives in this timer."*
 *
 * Tap ban giao con phai doc duoc suy TU CSDL moi lan quet (xem `FuelHandoffDrainService.drain()`),
 * nen tien trinh chet giua hai luot quet khong lam mat gi — luot sau doc lai dung chung. Do la ca
 * noi dung cua yeu cau `restart-safe`: khong phai vi timer nho lai duoc, ma vi no KHONG CAN nho.
 *
 * Vi vay `.unref()`: timer nay khong duoc giu tien trinh API song chi vi no.
 */
@Injectable()
export class FuelHandoffDrainScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FuelHandoffDrainScheduler.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly drain: FuelHandoffDrainService) {}

  onModuleInit(): void {
    if (!fuelHandoffDrainEnabled()) {
      this.logger.log(
        `Luot quet ban giao cay xang dang TAT (${FUEL_HANDOFF_DRAIN_SWITCH_ENV}=off) — ky doi soat dong se KHONG sinh cong no cho toi khi bat lai.`,
      );
      return;
    }

    this.timer = setInterval(() => void this.runTick(), DRAIN_INTERVAL_MS);
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
   * ghi log; con tro tieu thu khong doi, nen viec van con nguyen cho luot sau.
   *
   * `ticking` chan mot luot quet cham chong len luot sau cua chinh no. No KHONG phai mot khoa
   * phan tan: hai tien trinh API cung chay se quet song song, va dieu do an toan vi phep chong
   * ghi trung nam o CSDL chu khong o day.
   */
  private async runTick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const summary = await this.drain.drain();
      if (summary.ingested > 0 || summary.failed > 0) {
        this.logger.log(
          `Ban giao cay xang: ${summary.ingested} ky da ghi cong no, ${summary.failed} ky loi, ${summary.alreadyCurrent} ky khong doi.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Luot quet ban giao cay xang that bai: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
