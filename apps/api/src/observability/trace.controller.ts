import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { SourceContext, TraceView } from '@netviet/shared';
import { RecentTracesSink } from './recent-traces.sink.js';
import { currentSourceContext } from './source-manifest.js';
import { TelemetryService } from './telemetry.service.js';
import { buildTraceView } from './trace-view.builder.js';

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
    private readonly traces: RecentTracesSink,
    /**
     * Chi de doc DANH TINH BAN PHAT HANH — `releaseIdentity()` giu git SHA DAY DU, con
     * `TelemetryRecord.release` chi giu 12 ky tu dau. Permalink can ban day du.
     */
    private readonly telemetry: TelemetryService,
  ) {}

  /** Repo + release cua ban dang chay. Dung mot lan cho ca cau tra loi. */
  private sourceContext(): SourceContext {
    return currentSourceContext(this.telemetry.releaseIdentity());
  }

  /** Danh sach luot gan day — moi nhat truoc. Cho man hinh chan doan. */
  @Get()
  list(@Query('limit') limit?: string): {
    traces: TraceView[];
    stats: ReturnType<RecentTracesSink['stats']>;
  } {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20;
    const context = this.sourceContext();
    return {
      traces: this.traces.list(take).map((stored) => buildTraceView(stored, context)),
      stats: this.traces.stats(),
    };
  }

  /**
   * Luot da sinh ra mot don. Day la duong console dung cho nut "Xem luong xu ly" — Sale co
   * `orderId` truoc mat, khong co `traceId`.
   */
  @Get('by-order/:orderId')
  byOrder(@Param('orderId') orderId: string): TraceView {
    const stored = this.traces.findByOrderId(orderId);
    if (!stored) {
      throw new NotFoundException(
        'Khong con luu luot xu ly cua don nay. Vong dem chi giu cac luot gan day; ' +
          'luot cu hon van con trong `docker logs` (xem docs/phat-trien/van-hanh/debugging.md).',
      );
    }
    return buildTraceView(stored, this.sourceContext());
  }

  @Get(':traceId')
  byTraceId(@Param('traceId') traceId: string): TraceView {
    const stored = this.traces.get(traceId);
    if (!stored) throw new NotFoundException('Khong tim thay luot xu ly nay trong vong dem.');
    return buildTraceView(stored, this.sourceContext());
  }
}
