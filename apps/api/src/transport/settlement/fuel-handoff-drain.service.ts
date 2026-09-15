import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TRANSPORT_SETTLEMENT_DECISIONS } from './settlement-decisions.js';
import type { FuelHandoffDrainReason } from './settlement-decisions.js';
import { FuelSettlementSource, type FuelHandoffFacts } from './settlement.ports.js';
import { SettlementRepository } from './settlement.repository.js';
import { SettlementService } from './settlement.service.js';

/**
 * VONG QUET DOC HOP THU DI CUA `TX-04` — `#295` Lane V, P0.
 *
 * ============================================================================================
 * VI SAO TEP NAY TON TAI
 * ============================================================================================
 *
 * `SettlementService.ingestFuelHandoff()` da lam dung viec cua no tu truoc lane nay: doc chuoi ban
 * sua doi cua mot ky doi soat, ghi MOT chung tu goc roi ghi CHENH LECH cho moi ban sau. Cai thieu
 * khong phai phep tinh — la NGUOI GOI. Truoc lane nay ham do co dung hai lan goi, ca hai trong
 * mot tep `.int.spec.ts`. Tuc: ke toan dong mot ky doi soat, ban giao duoc phat dung quy dinh, va
 * khong cong no cay xang nao xuat hien — mai mai.
 *
 * `OWNER_DECISION_2026_09_13` chot phuong an (b): *"settlement-side bounded sweep / restart-safe
 * poller o chinh context transport-settlement"*, kem cac rang buoc duoc viet lai thanh nam doan
 * duoi day.
 *
 * ============================================================================================
 * 1. KHONG CO NUT NGUOI DUNG NAO O DAY
 * ============================================================================================
 *
 * Mot lua chon de hon la them `POST /transport/settlement/fuel-handoffs/:id/ingest` roi cho ke
 * toan bam. Quyet dinh cua chu so huu cam dieu do: *"Không thêm public write HTTP route chỉ để
 * trigger F4"*. Ly do khong phai tham my — mot nut nhu vay bien mot phep CHIEU noi bo thanh mot
 * quyet dinh nghiep vu thu hai ma khong ai dinh nghia: neu ke toan KHONG bam thi sao? Ky da dong
 * roi, so tien da duoc nguoi quyet roi. Khong con gi de hoi nua.
 *
 * ============================================================================================
 * 2. CON TRO KHONG PHAI LA THU BAO VE SO TIEN
 * ============================================================================================
 *
 * Doc ky doan nay truoc khi sua bat cu dong nao ben duoi.
 *
 * Thu bao dam *"mot ban giao chi sinh dung mot cong no"* la `@@unique([sourceContext, sourceId])`
 * tren `TransportSettlementDocument`, o TANG CSDL, va `ingestFuelHandoff()` truyen `sourceId` =
 * id cua BAN SUA DOI. Nen hai vong quet chay cung luc, hay mot vong quet chay lai ba lan tren
 * cung mot ky, deu khong tao duoc nghia vu thu hai — ke ca khi bang con tro trong ron.
 *
 * Con tro chi tra loi mot cau hoi RE hon: *"con viec gi phai lam khong"*. Mat no thi vong quet
 * lam lai mot lan vo hai roi ghi lai chinh no. Dung no lam cho dua cho mot bat bien tien la sai
 * huong: neu mot ngay nao do phep chong ghi trung o tang CSDL bi go, bang nay KHONG cuu duoc.
 *
 * ============================================================================================
 * 3. DAY CON TRO SAU KHI GHI, KHONG TRUOC
 * ============================================================================================
 *
 * Yeu cau 6 cua `#295` P0: *"lỗi tạm thời không làm mất nghĩa vụ và không biến thành 'đã xử lý'
 * giả"*. Neu con tro duoc day truoc roi lan ghi hong, ky do se khong bao gio duoc nhin lai — mot
 * khoan phai tra cho cay xang bien mat im lang. Nen thu tu la: ghi xong -> moi danh dau.
 *
 * Chieu nguoc lai (ghi xong nhung danh dau hong) chi lam luot sau lam lai mot lan vo hai.
 *
 * ============================================================================================
 * 4. MOT KY HONG KHONG LAM CHET CA LUOT QUET
 * ============================================================================================
 *
 * Moi ky duoc boc rieng. Mot ky nem — ky dong bang, du lieu la, CSDL chap chon — thi ghi log kem
 * ma ly do va DI TIEP. Gom ca lo vao mot `try` se lam mot ky hong chan het nhung ky sau no, va
 * thu tu cu-truoc-moi-sau se bien dieu do thanh mot hang doi tac nghen vinh vien.
 *
 * ============================================================================================
 * 5. KHONG MOT DONG NAO O DAY CHAM VAO QUY LAI XE
 * ============================================================================================
 *
 * Bat bien 1 va 3 cua `#295`. Duong ghi duy nhat cua tep nay la `ingestFuelHandoff()`, va ham do
 * chi goi `recogniseDocument`/`correctDocument` tren dong `FUEL_SUPPLIER`. Khong co
 * `DriverSettlementRepository` trong danh sach tiem cua lop nay, va do la mot rang buoc CO Y:
 * khong the vo tinh viet mot dong tru luong khi kho luong khong nam trong tam tay.
 */

/**
 * AI la nguoi ghi. Cung khuon `SYSTEM_ACTOR` cua `transport-planning`.
 *
 * KHONG dung id cua ke toan da dong ky: nguoi do quyet dinh *so tien*, con lan ghi nay la mot phep
 * chieu cua he thong. Ghi ten ho vao `recordedBy` se lam dau vet noi ho da lam mot viec ho khong
 * lam, va se sai hon nua khi lan ghi xay ra nhieu gio sau luc ho dang nhap.
 */
export const FUEL_HANDOFF_DRAIN_ACTOR = 'system:transport-settlement';

/**
 * CHAN DOC cua mot nhip — `bounded batch` cua quyet dinh chu so huu.
 *
 * Mot hang doc o day la mot KY DOI SOAT da tung dong, tuc mot (cay xang x ky bang ke). Voi mot
 * doanh nghiep van tai, con so do la hang chuc moi nam, khong phai hang trieu. 500 la rong rai
 * gap nhieu lan nhu cau that, va van la mot chan.
 *
 * Cham tran khong bi nuot: xem `FUEL_HANDOFF_BATCH_SATURATED`.
 */
export const FUEL_HANDOFF_SCAN_LIMIT = 500;

/**
 * CHAN GHI cua mot nhip.
 *
 * Tach khoi chan doc vi hai con so chan hai thu khac nhau: chan doc giu bo nho, chan ghi giu do
 * dai cua mot nhip. Mot lan nhap bang ke lon co the dong nhieu ky lien tiep; xu ly het trong mot
 * nhip se lam luot quet chay rat lau, va `ticking` se bo qua cac nhip sau.
 */
export const FUEL_HANDOFF_DRAIN_BATCH = 25;

export interface FuelHandoffDrainSummary {
  /** So ky da duoc doc sang cong no trong nhip nay. */
  readonly ingested: number;
  /** So ky nhin toi nhung khong con viec — con tro da o ban moi nhat. */
  readonly alreadyCurrent: number;
  /** So ky ghi that bai. Viec cua chung VAN CON; luot sau lam lai. */
  readonly failed: number;
  /** Con viec chua nhin toi trong nhip nay — cham chan doc hoac cham chan ghi. */
  readonly saturated: boolean;
}

const EMPTY_SUMMARY: FuelHandoffDrainSummary = {
  ingested: 0,
  alreadyCurrent: 0,
  failed: 0,
  saturated: false,
};

@Injectable()
export class FuelHandoffDrainService {
  constructor(
    private readonly settlement: SettlementService,
    private readonly repository: SettlementRepository,
    private readonly fuelSource: FuelSettlementSource,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /**
   * MOT NHIP.
   *
   * Trang thai cua nhip nay duoc suy TU CSDL moi lan chay — khong mot bo dem nao song giua hai
   * nhip. Do la ca ly do no `restart-safe`: tien trinh chet giua hai nhip khong lam mat gi, vi
   * chang co gi de mat.
   */
  async drain(): Promise<FuelHandoffDrainSummary> {
    const latest = await this.readOutbox();
    if (latest === null || latest.length === 0) return EMPTY_SUMMARY;

    let saturated = latest.length >= FUEL_HANDOFF_SCAN_LIMIT;
    if (saturated) {
      this.report('allowed', 'FUEL_HANDOFF_BATCH_SATURATED', { scanned: latest.length });
    }

    const cursors = await this.repository.fuelHandoffCursors(
      latest.map((handoff) => handoff.reconciliationId),
    );

    let ingested = 0;
    let alreadyCurrent = 0;
    let failed = 0;

    for (const handoff of latest) {
      if (ingested + failed >= FUEL_HANDOFF_DRAIN_BATCH) {
        /*
         * Da lam du viec cua mot nhip. Nhung ky con lai KHONG bi bo — nhip sau doc lai dung chung,
         * va thu tu cu-truoc-moi-sau bao dam chung o dau hang.
         */
        saturated = true;
        break;
      }

      const consumed = cursors.get(handoff.reconciliationId) ?? 0;
      if (consumed >= handoff.revision) {
        alreadyCurrent += 1;
        continue;
      }

      if (await this.ingestOne(handoff)) ingested += 1;
      else failed += 1;
    }

    return { ingested, alreadyCurrent, failed, saturated };
  }

  /**
   * DOC hop thu. `null` = khong doc duoc, va do la mot ket qua KHAC voi "hop thu rong".
   *
   * Gop hai thu do lai se lam mot CSDL ngat trong nhu mot he thong khong con viec gi — dung loai
   * im lang ma `fail-closed` cua quyet dinh chu so huu cam.
   */
  private async readOutbox(): Promise<FuelHandoffFacts[] | null> {
    try {
      return await this.fuelSource.pendingHandoffs(FUEL_HANDOFF_SCAN_LIMIT);
    } catch (error) {
      this.report('denied', 'FUEL_HANDOFF_SOURCE_UNAVAILABLE', { error: describe(error) });
      return null;
    }
  }

  /** `true` = da ghi xong VA da danh dau. Moi duong khac deu de viec lai cho luot sau. */
  private async ingestOne(handoff: FuelHandoffFacts): Promise<boolean> {
    const { reconciliationId, revision, handoffId } = handoff;
    try {
      const outcome = await this.settlement.ingestFuelHandoff(
        reconciliationId,
        FUEL_HANDOFF_DRAIN_ACTOR,
      );
      await this.repository.advanceFuelHandoffCursor({ reconciliationId, revision, handoffId });
      this.report('allowed', 'FUEL_HANDOFF_INGESTED', {
        reconciliationId,
        revision,
        handoffId,
        created: outcome.created,
        replayed: outcome.replayed,
      });
      return true;
    } catch (error) {
      this.report('denied', 'FUEL_HANDOFF_INGEST_FAILED', {
        reconciliationId,
        revision,
        handoffId,
        error: describe(error),
      });
      return false;
    }
  }

  private report(
    outcome: 'allowed' | 'denied',
    reason: FuelHandoffDrainReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'fuel_handoff.drain',
      outcome,
      reason,
      detail,
    });
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
