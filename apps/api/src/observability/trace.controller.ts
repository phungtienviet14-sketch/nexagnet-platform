import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { TraceView } from '@netviet/shared';
import { RecentTracesSink } from './recent-traces.sink.js';
import { TelemetryService } from './telemetry.service.js';
import type { ReleaseIdentity } from './trace-context.js';
import { buildTraceView } from './trace-view.builder.js';
import { TraceLookupService, type TraceLookup } from './historical/trace-lookup.service.js';

/**
 * Duong doc TRACE cho console.
 *
 * KHONG gan `@Public()` co chu y: trace mang noi dung nghiep vu (tin khach, ma ly do, so lieu
 * don). No phai nam sau dung lop xac thuc nhu moi duong nghiep vu khac — guard toan cuc
 * (`SessionAuthGuard`/`ApiKeyGuard` qua `APP_GUARD`) tu ap vao day.
 *
 * Du lieu tra ve DA duoc bo loc telemetry xu ly TRUOC khi vao sink, nen khong co lop sanitize
 * thu hai o day — sanitize hai lan la cach de hai ban quy tac troi khoi nhau.
 */
@Controller('observability/traces')
export class TraceController {
  constructor(
    /**
     * Tra loi "cho toi luot nay" tu vong dem TRUOC, kho lich su SAU. Thu tu do nam trong dich vu
     * chu khong o day, vi ba duong doc luot deu phai theo dung mot thu tu.
     */
    private readonly lookup: TraceLookupService,
    /** Chi cho `list()`/`stats()` — hai thu ma chi vong dem tra loi duoc. */
    private readonly traces: RecentTracesSink,
    /**
     * Chi de doc DANH TINH BAN PHAT HANH — `releaseIdentity()` giu git SHA DAY DU, con
     * `TelemetryRecord.release` chi giu 12 ky tu dau. Permalink can ban day du.
     */
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * Danh sach luot gan day — moi nhat truoc. Cho man hinh chan doan.
   *
   * CHI DOC VONG DEM, co y: cau hoi o day la "gan day co gi", va "gan day" dung la dinh nghia
   * cua vong dem. Mot danh sach ghep them lich su se bien mot man hinh "dang xay ra gi" thanh
   * mot cong tim kiem tren ca thang — cau hoi khac, chi phi khac.
   *
   * `release` nam o VO BOC chu khong chi trong tung luot, va do la co y: mot stack vua deploy
   * xong co ZERO luot, nen neu danh tinh chi di kem tung `TraceView` thi dung luc can tra loi
   * "ban nao dang chay" nhat lai khong co cho nao tra loi. Day cung la duong ma bang chung deploy
   * doc danh tinh TU TIEN TRINH thay vi doc tep tren host.
   */
  @Get()
  list(@Query('limit') limit?: string): {
    traces: TraceView[];
    stats: ReturnType<RecentTracesSink['stats']>;
    release: ReleaseIdentity;
  } {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20;
    return {
      traces: this.traces
        .list(take)
        .map((stored) => ({ ...buildTraceView(stored), origin: 'buffer' as const })),
      stats: this.traces.stats(),
      release: this.telemetry.releaseIdentity(),
    };
  }

  /**
   * Luot da sinh ra mot don. Day la duong console dung cho nut "Xem luong xu ly" — Sale co
   * `orderId` truoc mat, khong co `traceId`.
   */
  @Get('by-order/:orderId')
  async byOrder(@Param('orderId') orderId: string): Promise<TraceView> {
    return single(
      await this.lookup.byOrderId(orderId),
      'Khong con luu luot xu ly cua don nay. Vong dem chi giu cac luot gan day, va ban trien ' +
        'khai nay khong co kho quan sat ben de lui ve (xem docs/phat-trien/van-hanh/debugging.md).',
    );
  }

  @Get(':traceId')
  async byTraceId(@Param('traceId') traceId: string): Promise<TraceView> {
    return single(
      await this.lookup.byTraceId(traceId),
      'Khong tim thay luot xu ly nay trong vong dem, va ban trien khai nay khong co kho quan ' +
        'sat ben de lui ve.',
    );
  }
}

/**
 * BA KET CUC -> BA CAU TRA LOI HTTP. Gop chung lai la lam mat dung phan dat gia nhat.
 *
 *   `found`        200, kem `origin` de biet kho nao da tra loi;
 *   `not_found`    404 — da hoi duoc, va that su khong co;
 *   `unavailable`  503 — CO kho, nhung chua hoi duoc.
 *
 * `NOT_CONFIGURED` nam trong nhom `unavailable` nhung tra 404, va day khong phai su lien tay:
 * ban trien khai do KHONG CO kho lich su nao ca. Voi no, "vong dem khong con giu" that su la cau
 * tra loi cuoi cung — mot 503 se hua hen mot lan thu lai khong bao gio co ich.
 */
function single(result: TraceLookup, notFoundMessage: string): TraceView {
  if (result.status === 'found') {
    return { ...buildTraceView(result.traces[0]!), origin: result.origin };
  }
  if (result.status === 'not_found' || result.reason === 'NOT_CONFIGURED') {
    throw new NotFoundException(notFoundMessage);
  }
  throw new ServiceUnavailableException(
    `Chua doc duoc kho quan sat (${result.reason}). Luot nay CO THE van con — day khong phai ` +
      'cau tra loi "khong tim thay". Chi tiet nam o log may chu.',
  );
}
