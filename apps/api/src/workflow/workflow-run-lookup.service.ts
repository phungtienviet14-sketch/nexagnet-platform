import { Injectable, Optional } from '@nestjs/common';
import type { DebugHandoffStatus } from '@netviet/shared';
import { WorkflowEnginePort } from './workflow-engine.port.js';
import { WorkflowOutboxRepository } from './workflow-outbox.repository.js';
import { resolveDashboardTarget, workflowRunDashboardUrl } from './workflow-run-dashboard.js';

/**
 * DUONG DOC cua mien workflow — "thuc the nay da kich nhung workflow nao, den dau roi".
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA MOT DICH VU RIENG chu khong phai mo `WorkflowOutboxRepository` ra ngoai:
 *
 * `WorkflowModule` co y CHI xuat `WorkflowHandoffService` va `WorkflowEnginePort` — de khong ai
 * xep hang truc tiep vao outbox va bo qua bon lop bao ve o cau noi. Rang buoc do van dung.
 *
 * Cai man hinh chan doan can khong phai quyen ghi ma la mot cau tra loi doc. Nen thay vi noi
 * long bien gioi, mien nay tu mo mot cua so DOC, hep dung bang cau hoi do:
 *
 *   `enqueue`/`claimDue`/`markDispatched`  van o trong, khong ai ngoai mien nay cham toi.
 *   `forEntity`                            di ra, va no khong lam gi ngoai doc.
 *
 * ---------------------------------------------------------------------------
 * `payload` VA `metadata` KHONG DI RA. Thu gon o day, tai RANH GIOI, chu khong loc o cho hien
 * thi: mot bo loc dat sau cung se bi quen dung luc co nguoi them mot truong moi vao hang outbox.
 * Cai gi khong duoc mang ra thi khong duoc phep di qua cua nay ngay tu dau.
 */

/**
 * Mot lan BAN GIAO, thu gon cho man hinh chan doan.
 *
 * KIEU NAY THUOC MIEN WORKFLOW, khong thuoc man hinh: chinh mien nay biet mot lan ban giao co
 * nhung chieu nao. Tang hien thi chi doc lai.
 */
export interface WorkflowRunFacts {
  /** Khoa on dinh cua khuon. Khong kem phien ban. */
  readonly key: string;
  readonly version: string;
  readonly operationKey: string;
  readonly handoffStatus: DebugHandoffStatus;
  readonly attempts: number;
  readonly queuedAt: Date;
  readonly dispatchedAt: Date | null;
  readonly engineRunId: string | null;
  readonly lastError: string | null;
  /** Chi co khi ha tang khai URL dashboard. Vang mat = khong co duong bam sang engine. */
  readonly dashboardUrl?: string;
  /** Trang thai THO doc tu engine. Vang mat = KHONG HOI DUOC, khong phai "chua chay". */
  readonly engineStatus?: string;
  /**
   * MOC THOI GIAN cua chinh engine, giu nguyen dang chuoi engine tra ve.
   *
   * Hai truong nay la nguon DUY NHAT do duoc mot lan cho ben vung. `queuedAt`/`dispatchedAt` o
   * tren la moc CUA TA — chung tra loi "viec nam trong hang bao lau truoc khi engine nhan", mot
   * cau hoi khac han. Va cac luot thi khong tra loi duoc gi ve khoang cho, vi lan cho khong sinh
   * them luot nao.
   *
   * Co `engineStartedAt` ma khong co `engineFinishedAt` = run chua ket thuc.
   */
  readonly engineStartedAt?: string;
  readonly engineFinishedAt?: string;
}

/**
 * Lat du lieu doc duoc tu engine cho MOT lan chay — noi bo, khong xuat ra khoi tep nay.
 *
 * Ton tai de `describe()` tra ve mot thu co kieu thay vi mot bo ba tuy tien, va de cho ghep o
 * `forEntity` phai CHON tung truong: `describeRun` con tra ve `errorMessage`/`workflowName`, va
 * chung khong duoc tu troi ra man hinh chan doan chi vi ai do them mot dau `...`.
 */
interface EngineRunFacts {
  readonly status: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface WorkflowRunLookupResult {
  readonly runs: readonly WorkflowRunFacts[];
  /** Gioi han cua chinh cau tra loi nay, bang tieng Viet. Rong = doc duoc day du. */
  readonly notes: readonly string[];
}

@Injectable()
export class WorkflowRunLookup {
  constructor(
    private readonly outbox: WorkflowOutboxRepository,
    /**
     * `@Optional()`: mot ban trien khai khong khai engine van phai mo duoc man hinh chan doan.
     * Thieu cong thi thieu TRANG THAI ENGINE, khong phai thieu ca man hinh.
     */
    @Optional() private readonly engine?: WorkflowEnginePort,
  ) {}

  async forEntity(entityId: string): Promise<WorkflowRunLookupResult> {
    const rows = await this.outbox.findByEntityId(entityId);
    if (rows.length === 0) return { runs: [], notes: [] };

    const dashboard = resolveDashboardTarget();
    const notes: string[] = [];
    const runs: WorkflowRunFacts[] = [];

    for (const row of rows) {
      // URL dung CONG THUC, khong dung mot lan di mang: mot cai link khong dang gia mot vong
      // gRPC, va no van dung ke ca khi engine dang khong tra loi.
      const dashboardUrl = row.engineRunId
        ? workflowRunDashboardUrl(dashboard, row.engineRunId)
        : undefined;

      const engine = row.engineRunId ? await this.describe(row.engineRunId, notes) : undefined;

      runs.push({
        key: row.workflowKey,
        version: row.workflowVersion,
        operationKey: row.operationKey,
        handoffStatus: row.status,
        attempts: row.attempts,
        queuedAt: row.queuedAt,
        dispatchedAt: row.dispatchedAt,
        engineRunId: row.engineRunId,
        lastError: row.lastError,
        ...(dashboardUrl ? { dashboardUrl } : {}),
        // TRAI RA tung truong thay vi rai `...engine`: mot lan `describeRun` tra ve them truong
        // moi thi truong do phai duoc chon vao day co y thuc, khong tu troi ra man hinh.
        ...(engine?.status ? { engineStatus: engine.status } : {}),
        ...(engine?.startedAt ? { engineStartedAt: engine.startedAt } : {}),
        ...(engine?.finishedAt ? { engineFinishedAt: engine.finishedAt } : {}),
      });
    }

    return { runs, notes };
  }

  /**
   * Trang thai VA MOC THOI GIAN cua mot lan thuc thi, hoi truc tiep engine.
   *
   * ---------------------------------------------------------------------------
   * VI SAO KHONG CHI LAY `status`:
   *
   * Ban truoc lam dung the — `return summary.status` — va do la mot cau hep hon cau hoi. Moc
   * `startedAt`/`finishedAt` bi bo lai ngay tai day, nen man hinh chan doan phia tren het nguon
   * do thoi gian workflow va phai quay sang hieu timestamp cua cac LUOT. Con so do khong bao gio
   * bao trum lan cho ben vung (lan cho khong sinh luot moi), nhung no van bi dan nhan la co —
   * mot workflow 95 giay hien ra la 2 giay.
   *
   * Cai gi engine noi ra thi phai di duoc toi noi hien thi.
   *
   * ---------------------------------------------------------------------------
   * FAIL-OPEN, va o day dieu do quan trong hon binh thuong: engine khong tra loi la mot trong
   * nhung ly do NGUOI TA MO man hinh nay. Neu chinh no sap vi engine im lang thi cong cu chan
   * doan hong dung luc can nhat.
   *
   * `null` tu `describeRun` la mot CAU TRA LOI (run cu da het han luu tru sau 30 ngay), khac han
   * mot lan goi nem — nen hai truong hop sinh hai ghi chu khac nhau.
   */
  private async describe(
    engineRunId: string,
    notes: string[],
  ): Promise<EngineRunFacts | undefined> {
    if (!this.engine) return undefined;
    try {
      const summary = await this.engine.describeRun(engineRunId);
      if (summary) {
        return {
          status: summary.status,
          ...(summary.startedAt ? { startedAt: summary.startedAt } : {}),
          ...(summary.finishedAt ? { finishedAt: summary.finishedAt } : {}),
        };
      }
      notes.push(
        `Engine không còn giữ lần chạy '${engineRunId}' — thường là do đã quá hạn lưu trữ. ` +
          'Bản ghi bền vững của Nexagnet vẫn còn trong nhật ký kiểm toán.',
      );
      return undefined;
    } catch {
      // KHONG kem thong bao loi goc vao ghi chu: no co the mang host/token cua engine, va man
      // hinh nay hien cho nguoi dung cuoi. Chi tiet nam trong log may chu.
      notes.push('Không hỏi được trạng thái từ engine lúc này — bên dưới là dữ liệu của Nexagnet.');
      return undefined;
    }
  }
}
