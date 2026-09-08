import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { InsightReadService } from './insight-read.service.js';
import type { CorridorInsightView, FleetInsightView } from './insight.types.js';

/**
 * BANG DOI XE + BAO CAO TUYEN qua HTTP — `#278` N6/N7.
 *
 * ===========================================================================
 * CHI DOC, va KHONG mot ma quyen moi.
 *
 * `transport.analytics.read` da ton tai va da dung nghia: mot quyen BAO CAO VAN HANH cua Giam
 * doc/Ke toan/Dieu do, khong nam trong be mat lai xe. Ca hai bao cao o day tra ve km va ma don cua
 * CA doi xe, dung loai du lieu ma ma do canh giu. Them mot ma moi chi de "cho ro rang" se lam ma
 * tran vai dai them mot dong ma khong ai noi duoc no khac gi dong da co.
 *
 * KHONG co toa do o day — nen khong can ranh gioi `transport.location.history.read` nhu ben
 * `JourneyController`. Bao cao tuyen tra ve MA vong chay; man hinh muon ve duong thi mo tung vong
 * chay qua tuyen ban do, va o do quyen toa do duoc kiem lai.
 */
@Controller('transport/insight')
@UseGuards(TransportActionGuard)
export class InsightController {
  constructor(private readonly read: InsightReadService) {}

  /**
   * `from`/`to` la `YYYY-MM-DD` (ngay NGHIEP VU), khong phai moc thoi gian.
   *
   * Thieu ca hai thi may chu tu chot 30 ngay gan nhat theo mui gio tenant — xem
   * `InsightReadService.resolveRange`.
   */
  @Get('fleet')
  @RequiresTransportAction('transport.analytics.read')
  fleet(@Query('from') from?: string, @Query('to') to?: string): Promise<FleetInsightView> {
    return this.guard(() => this.read.fleet(from, to));
  }

  @Get('corridors')
  @RequiresTransportAction('transport.analytics.read')
  corridors(@Query('from') from?: string, @Query('to') to?: string): Promise<CorridorInsightView> {
    return this.guard(() => this.read.corridors(from, to));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw transportErrorToHttp(error);
    }
  }
}
