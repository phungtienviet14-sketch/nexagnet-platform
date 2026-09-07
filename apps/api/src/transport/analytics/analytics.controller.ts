import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import type { RunMargin } from './operating-metrics.js';
import { OperatingMetricsReadService } from './operating-metrics-read.service.js';

/**
 * CHI SO VAN HANH qua HTTP — `R8` (Issue #237).
 *
 * ===========================================================================
 * CHI DOC. Khong mot route GHI nao, va se khong co.
 *
 * #237 noi thang ve vai cua tang nay: *"AI only summarizes/ranks. AI does not rewrite facts."* Mot
 * be mat bao cao co duong ghi la mot be mat co the sua so lieu goc de bao cao dep hon — va khong
 * ai phat hien duoc dieu do tu chinh bao cao. Ranh gioi duoc giu o CA HAI tang: khong route ghi o
 * day, va khong ham ghi trong hai cong cua `analytics.ports.ts`.
 *
 * ===========================================================================
 * MOT QUYEN, KHONG PHAI MOT QUYEN MOI CHO MOI CON SO.
 *
 * `transport.analytics.read` la mot quyen VAN HANH (Giam doc/Ke toan/Dieu do), khong nam trong be
 * mat lai xe: bao cao nay chua `freightAmount`, va `INV-09` cam gia cuoc di vao khung nhin lai xe.
 */
@Controller('transport/analytics')
@UseGuards(TransportActionGuard)
export class TransportAnalyticsController {
  constructor(private readonly read: OperatingMetricsReadService) {}

  /**
   * BIEN TRUC TIEP + KM CO HANG/RONG cua CA MOT VONG CHAY.
   *
   * `null` cua tang doc thanh 404 chu khong phai mot than rong mang ma 200: mot khung nhin nhan bao
   * cao rong khong phan biet duoc "vong chay khong ton tai" voi "vong chay co that nhung chua co so
   * lieu" — hai tinh huong can hai hanh dong khac han.
   */
  @Get('runs/:runId/margin')
  @RequiresTransportAction('transport.analytics.read')
  async runMargin(@Param('runId') runId: string): Promise<RunMargin> {
    const margin = await this.guard(() => this.read.runMargin(runId));
    if (!margin) throw new NotFoundException(`Khong tim thay vong chay ${runId}`);
    return margin;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw transportErrorToHttp(error);
    }
  }
}
