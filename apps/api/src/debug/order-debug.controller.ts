import { Controller, Get, Optional, Param } from '@nestjs/common';
import type { OrderDebugView } from '@netviet/shared';
import { RecentTracesSink } from '../observability/recent-traces.sink.js';
import { currentSourceContext } from '../observability/source-manifest.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import {
  WorkflowRunLookup,
  type WorkflowRunFacts,
} from '../workflow/workflow-run-lookup.service.js';
import { buildOrderDebugView } from './order-debug.builder.js';

/**
 * DUONG DOC cua man hinh "Luong xu ly" — nut chan doan tren console.
 *
 * ---------------------------------------------------------------------------
 * KHONG `@Public()`, cung ly do voi `TraceController`: cau tra loi o day mang noi dung nghiep vu
 * (ma ly do, so lieu don, ma don). No nam sau guard toan cuc nhu moi duong nghiep vu khac.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG NEM 404 khi khong tim thay gi:
 *
 * `TraceController.byOrder` nem 404 va do la dung voi cau hoi cua no — "cho toi luot cua don
 * nay" khong co cau tra loi thi la khong tim thay. Cau hoi o day khac: "cho toi biet nhung gi
 * he thong con biet ve don nay". Cau do LUON co cau tra loi, ke ca khi cau tra loi la "khong
 * con gi trong vong dem" — va chinh cau tra loi do moi la thu nguoi debug can doc.
 *
 * Nem 404 se buoc giao dien phai dung mot man hinh loi cho mot tinh huong hoan toan binh thuong
 * voi don cu, va giau mat cac ghi chu giai thich vi sao.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN: THIEU MOT NGUON THI THIEU MOT PHAN, KHONG PHAI HONG CA MAN HINH.
 * Mot khach khong bat workflow engine van phai xem duoc luot xu ly.
 */
@Controller('observability/debug/orders')
export class OrderDebugController {
  constructor(
    private readonly traces: RecentTracesSink,
    /**
     * `@Optional()`: mien workflow la nen tang nen no gan nhu luon co mat, nhung man hinh chan
     * doan khong duoc phep phu thuoc vao dieu do. Vang mat -> khong co phan workflow, kem mot
     * ghi chu noi ro la KHONG DOC DUOC chu khong phai KHONG CO.
     */
    @Optional() private readonly workflows?: WorkflowRunLookup,
    /**
     * `@Optional()` cung ly le voi `workflows`: mot man hinh chan doan khong duoc chet vi
     * khong biet minh dang chay commit nao. Vang mat -> khong co lien ket ma nguon, kem mot
     * cau noi ro — chu khong phai mot man hinh trang.
     */
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  @Get(':orderId')
  async byOrder(@Param('orderId') orderId: string): Promise<OrderDebugView> {
    const traces = this.traces.findAllByOrderId(orderId);
    const found = await this.lookupWorkflows(orderId);

    const sourceContext = this.telemetry
      ? currentSourceContext(this.telemetry.releaseIdentity())
      : undefined;

    return buildOrderDebugView({
      orderId,
      traces,
      workflowRuns: found.runs,
      notes: found.notes,
      ...(sourceContext ? { sourceContext } : {}),
    });
  }

  /**
   * Doc cac lan ban giao. NUOT LOI co chu y: quan sat khong bao gio duoc lam hong thu no quan
   * sat, va o day "thu no quan sat" chinh la man hinh nguoi ta dang mo de tim loi.
   *
   * Ghi chu tra ve KHONG kem thong bao loi goc — no co the mang chuoi ket noi hoac host cua
   * engine, va man hinh nay hien cho nguoi dung cuoi. Chi tiet nam trong log may chu.
   */
  private async lookupWorkflows(
    orderId: string,
  ): Promise<{ runs: readonly WorkflowRunFacts[]; notes: string[] }> {
    if (!this.workflows) {
      return { runs: [], notes: ['Bản triển khai này không bật workflow engine.'] };
    }
    try {
      const result = await this.workflows.forEntity(orderId);
      return { runs: result.runs, notes: [...result.notes] };
    } catch {
      return {
        runs: [],
        notes: [
          'Không đọc được các lần bàn giao workflow của đơn này — chi tiết nằm ở log máy chủ.',
        ],
      };
    }
  }
}
