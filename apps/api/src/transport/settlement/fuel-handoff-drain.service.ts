import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TRANSPORT_SETTLEMENT_DECISIONS } from './settlement-decisions.js';
import type { FuelHandoffDrainReason } from './settlement-decisions.js';
import {
  FuelSettlementSource,
  type FuelHandoffFacts,
  type FuelHandoffScanPosition,
} from './settlement.ports.js';
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
 * poller o chinh context transport-settlement"*, kem cac rang buoc duoc viet lai thanh sau doan
 * duoi day.
 *
 * ============================================================================================
 * 0. HAI CON TRO. MOT GIU SO TIEN DUNG, MOT GIU VONG QUET CHAY.
 * ============================================================================================
 *
 * Doan nay duoc them SAU mot vong soat doc lap, va no ghi lai mot loi that cua chinh tep nay.
 *
 * Ban dau vong quet doc `pendingHandoffs(500)`: 500 hang DAU cua hop thu theo `emittedAt` tang
 * dan. Con tro tieu thu thi nam ben `TX-05`, nen `TX-04` khong biet hang nao da doc roi va van tra
 * ve dung 500 hang do moi nhip. Hau qua, voi 501 ky da tung dong:
 *
 *     ky #1..#500 -> da co cong no, con tro da o ban moi nhat
 *     ky #501     -> vua dong, chua co cong no
 *
 *     moi 60 giay:  doc lai #1..#500  -> ca 500 deu "khong con viec"
 *                   #501              -> KHONG BAO GIO duoc nhin thay
 *
 * Mot ban giao hop le, va mot khoan phai tra cho cay xang khong bao gio xuat hien. Khong mot dong
 * loi nao, khong mot bai kiem nao do: he thong bao cao rang no khong con viec gi.
 *
 * Bien the thu hai cua cung loi do: chan ghi dung o `ingested + failed >= 25`. Neu 25 ky dau hang
 * deu ghi HONG (du lieu la, ky dong bang), moi nhip thu dung 25 ky do roi dung — va moi ky lanh
 * manh dung sau chung doi vinh vien.
 *
 * Ca hai deu la loi SONG (liveness), khong phai loi tien. Va ca hai duoc chua bang mot thu: mot VI
 * TRI QUET ben ngoai, do `TX-05` so huu, ben qua khoi dong lai, tien qua MOI hang da nhin toi — ke
 * ca hang ghi hong — va QUAY VE DAU khi het hop thu.
 *
 *   `TransportSettlementFuelHandoffCursor` (theo ky)     -> so tien DUNG
 *   `TransportSettlementFuelHandoffScan`   (theo hang)   -> vong quet CHAY
 *
 * Gop hai thu do lai se lam ca hai deu mo nghia. Chung co hai vong doi khac nhau: con tro tieu thu
 * song mai theo ky doi soat; vi tri quet bi xoa sach moi vong.
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
 * 2. CON TRO TIEU THU KHONG PHAI LA THU BAO VE SO TIEN
 * ============================================================================================
 *
 * Doc ky doan nay truoc khi sua bat cu dong nao ben duoi.
 *
 * Thu bao dam *"mot ban giao chi sinh dung mot cong no"* la `@@unique([sourceContext, sourceId])`
 * tren `TransportSettlementDocument`, o TANG CSDL, va `ingestFuelHandoff()` truyen `sourceId` =
 * id cua BAN SUA DOI. Nen hai vong quet chay cung luc, hay mot vong quet chay lai ba lan tren
 * cung mot ky, deu khong tao duoc nghia vu thu hai — ke ca khi ca hai bang con tro trong ron.
 *
 * Con tro chi tra loi mot cau hoi RE hon: *"con viec gi phai lam khong"*. Mat no thi vong quet
 * lam lai mot lan vo hai roi ghi lai chinh no. Dung no lam cho dua cho mot bat bien tien la sai
 * huong: neu mot ngay nao do phep chong ghi trung o tang CSDL bi go, bang nay KHONG cuu duoc.
 *
 * ============================================================================================
 * 3. DAY CON TRO TIEU THU SAU KHI GHI, KHONG TRUOC
 * ============================================================================================
 *
 * Yeu cau 6 cua `#295` P0: *"lỗi tạm thời không làm mất nghĩa vụ và không biến thành 'đã xử lý'
 * giả"*. Neu con tro duoc day truoc roi lan ghi hong, ky do se khong bao gio duoc nhin lai — mot
 * khoan phai tra cho cay xang bien mat im lang. Nen thu tu la: ghi xong -> moi danh dau.
 *
 * Chieu nguoc lai (ghi xong nhung danh dau hong) chi lam luot sau lam lai mot lan vo hai.
 *
 * CHU Y: luat nay chi ap cho CON TRO TIEU THU. Vi tri quet thi nguoc lai — xem doan 4.
 *
 * ============================================================================================
 * 4. MOT KY HONG KHONG LAM CHET CA LUOT QUET, VA CUNG KHONG DUOC CHAN HANG
 * ============================================================================================
 *
 * Moi ky duoc boc rieng. Mot ky nem — ky dong bang, du lieu la, CSDL chap chon — thi ghi log kem
 * ma ly do va DI TIEP. Gom ca lo vao mot `try` se lam mot ky hong chan het nhung ky sau no.
 *
 * Nhung boc rieng thoi thi CHUA DU. Vi tri quet con phai tien qua ca hang vua ghi hong, neu khong
 * thi 25 ky hong se an tron chan ghi cua moi nhip va nhung ky lanh manh phia sau khong bao gio
 * duoc nhin toi — dung hinh dang cu cua loi, chi doi cho.
 *
 * Viec cua ky hong khong mat: con tro TIEU THU cua no chua he duoc day, nen vong quet SAU se lam
 * lai. Cai doi la LUC lam lai — vong sau, khong phai nhip sau. Do la ca ly do phai co `rewind`.
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
 * DO DAI MOT TRANG doc — `bounded batch` cua quyet dinh chu so huu.
 *
 * Mot hang o day la mot KY DOI SOAT da tung dong, tuc mot (cay xang x ky bang ke). Voi mot doanh
 * nghiep van tai, con so do la hang chuc moi nam, khong phai hang trieu.
 *
 * CHU Y — con so nay KHONG con quyet dinh hang nao voi toi duoc nua. Truoc khi co vi tri quet, no
 * la mot tran cung: hang thu 501 nam ngoai tam voi VINH VIEN. Gio no chi quyet dinh mot vong quet
 * tron mat bao nhieu nhip. Tang no len khong chua duoc bat cu loi song nao — do dung la thu ma
 * vong soat doc lap da tu choi nhan lam ban va.
 */
export const FUEL_HANDOFF_SCAN_PAGE = 500;

/**
 * CHAN GHI cua mot nhip.
 *
 * Tach khoi do dai trang vi hai con so chan hai thu khac nhau: trang giu bo nho, chan ghi giu do
 * dai cua mot nhip. Mot lan nhap bang ke lon co the dong nhieu ky lien tiep; xu ly het trong mot
 * nhip se lam luot quet chay rat lau, va `ticking` se bo qua cac nhip sau.
 */
export const FUEL_HANDOFF_DRAIN_BATCH = 25;

/**
 * HAI CON SO CHAN cua mot nhip quet.
 *
 * La THAM SO chu khong hang so doc thang trong than ham, vi hai ly do:
 *
 *   1. Chung la tinh chat cua mot LUOT QUET, khong phai cua dich vu. Lich quet truyen gi la viec
 *      cua lich quet.
 *   2. Mot bai kiem muon cham chan ghi phai dung duoc 25 hang hong that; ha chan xuong cho no lam
 *      duoc dieu do bang mot hang la cach duy nhat de bai kiem tren Postgres THAT chay trong vai
 *      giay thay vi vai phut.
 *
 * Lich quet goi `drain()` khong tham so, tuc luon chay o hai con so san xuat.
 */
export interface FuelHandoffDrainBounds {
  readonly scanPage: number;
  readonly drainBatch: number;
}

const DEFAULT_BOUNDS: FuelHandoffDrainBounds = {
  scanPage: FUEL_HANDOFF_SCAN_PAGE,
  drainBatch: FUEL_HANDOFF_DRAIN_BATCH,
};

export interface FuelHandoffDrainSummary {
  /** So ky da duoc doc sang cong no trong nhip nay. */
  readonly ingested: number;
  /** So ky nhin toi nhung khong con viec — con tro da o ban moi nhat. */
  readonly alreadyCurrent: number;
  /** So ky ghi that bai. Viec cua chung VAN CON; VONG sau lam lai. */
  readonly failed: number;
  /** Cham chan ghi — con hang TRONG TRANG NAY chua nhin toi. Nhip sau doc tiep tu do. */
  readonly saturated: boolean;
  /**
   * Da doc toi duoi hop thu, va vi tri quet vua quay ve dau.
   *
   * Mot he thong lanh manh phat co nay deu dan. Mot he thong KHONG BAO GIO phat no la mot he thong
   * khong bao gio doc het hop thu — tuc mot he thong co ky khong bao gio den luot.
   */
  readonly wrapped: boolean;
}

const EMPTY_SUMMARY: FuelHandoffDrainSummary = {
  ingested: 0,
  alreadyCurrent: 0,
  failed: 0,
  saturated: false,
  wrapped: false,
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
   * nhip. Do la ca ly do no `restart-safe`: tien trinh chet giua hai nhip khong lam mat gi, vi moi
   * thu no can (vi tri quet, con tro tieu thu) deu nam trong PostgreSQL.
   */
  async drain(bounds: FuelHandoffDrainBounds = DEFAULT_BOUNDS): Promise<FuelHandoffDrainSummary> {
    const from = await this.repository.fuelHandoffScanPosition();
    const page = await this.readOutbox(from, bounds.scanPage);
    if (page === null) return EMPTY_SUMMARY;

    /*
     * TRANG RONG = da doc toi duoi hop thu.
     *
     * `from === null` thi hop thu that su khong co gi (chua ky nao tung dong) — khong co vong nao
     * de dong lai, va phat mot ma "vua tron mot vong" o day se lam log cua mot he thong chua chay
     * gi trong giong mot he thong dang quet deu.
     */
    if (page.length === 0) {
      if (from === null) return EMPTY_SUMMARY;
      return await this.wrap(from);
    }

    const cursors = await this.repository.fuelHandoffCursors(
      page.map((handoff) => handoff.reconciliationId),
    );

    let ingested = 0;
    let alreadyCurrent = 0;
    let failed = 0;
    let examined = 0;
    let position: FuelHandoffScanPosition | null = null;

    for (const handoff of page) {
      if (ingested + failed >= bounds.drainBatch) break;

      /*
       * VI TRI TIEN TRUOC KHI BIET KET QUA, va do la diem mau chot cua doan 4 o dau tep.
       *
       * Neu chi tien khi ghi THANH CONG, thi 25 hang hong lien tiep se lam moi nhip dung lai o
       * dung cho cu — va bo cong no cua ca doanh nghiep chet vi 25 hang. Viec cua hang hong khong
       * mat: con tro TIEU THU cua no chua duoc day, nen vong sau lam lai.
       */
      examined += 1;
      position = { emittedAt: handoff.emittedAt, handoffId: handoff.handoffId };

      const consumed = cursors.get(handoff.reconciliationId) ?? 0;
      if (consumed >= handoff.revision) {
        alreadyCurrent += 1;
        continue;
      }

      if (await this.ingestOne(handoff)) ingested += 1;
      else failed += 1;
    }

    const saturated = examined < page.length;
    if (saturated) {
      this.report('allowed', 'FUEL_HANDOFF_BATCH_SATURATED', {
        examined,
        pageSize: page.length,
        drainBatch: bounds.drainBatch,
      });
    }

    /*
     * TRANG NGAN HON YEU CAU va da xem het = vua cham day hop thu. Quan ngay trong nhip nay thay vi
     * ton them mot nhip chi de doc ra mot trang rong.
     *
     * Trang DAY (`page.length === scanPage`) thi khong ket luan duoc gi — co the con hang phia sau,
     * cung co the vua het. Nhip sau se biet.
     */
    if (!saturated && page.length < bounds.scanPage) {
      await this.wrap(position);
      return { ingested, alreadyCurrent, failed, saturated, wrapped: true };
    }

    if (position !== null) await this.repository.advanceFuelHandoffScan(position);
    return { ingested, alreadyCurrent, failed, saturated, wrapped: false };
  }

  /** QUAY VE DAU HOP THU. Tach ra vi no duoc goi tu hai cho voi cung mot y nghia. */
  private async wrap(at: FuelHandoffScanPosition | null): Promise<FuelHandoffDrainSummary> {
    await this.repository.rewindFuelHandoffScan();
    this.report('allowed', 'FUEL_HANDOFF_SCAN_WRAPPED', {
      lastHandoffId: at?.handoffId ?? null,
      lastEmittedAt: at?.emittedAt ?? null,
    });
    return { ...EMPTY_SUMMARY, wrapped: true };
  }

  /**
   * DOC mot trang hop thu. `null` = khong doc duoc, va do la mot ket qua KHAC voi "hop thu rong".
   *
   * Gop hai thu do lai se lam mot CSDL ngat trong nhu mot he thong khong con viec gi — dung loai
   * im lang ma `fail-closed` cua quyet dinh chu so huu cam. Va o day no con te hon mot bac: mot lan
   * doc hong bi doc thanh "rong" se lam vi tri quet QUAN VE DAU, tuc mat luon cho dang dung.
   */
  private async readOutbox(
    after: FuelHandoffScanPosition | null,
    limit: number,
  ): Promise<FuelHandoffFacts[] | null> {
    try {
      return await this.fuelSource.pendingHandoffs({ after, limit });
    } catch (error) {
      this.report('denied', 'FUEL_HANDOFF_SOURCE_UNAVAILABLE', { error: describe(error) });
      return null;
    }
  }

  /** `true` = da ghi xong VA da danh dau. Moi duong khac deu de viec lai cho vong sau. */
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
