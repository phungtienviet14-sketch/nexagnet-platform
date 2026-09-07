import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { TrackingService } from './tracking.service.js';
import type { LocationTrackView, TrackingSummaryView } from './tracking.types.js';

/**
 * BE MAT VAN HANH cua bam vi tri — HAI tuyen, va chung co HAI quyen khac nhau.
 *
 * Do la toan bo diem cua controller nay:
 *
 *   · `GET /trips/:tripId/tracking`  -> `transport.tracking.read`
 *     Tra ve `TrackingSummaryView` — dem, quang duong, co rui ro. Kieu do KHONG CO mot truong nao
 *     co the chua mot toa do. Ke toan doi soat duoc bang no.
 *
 *   · `GET /tracking/sessions/:id/track` -> `transport.location.history.read`
 *     Tra ve duong di THO. Ke toan KHONG co ma nay (`ACCOUNTING_DENIED`), va moi lan doc de lai
 *     mot dong o diem quyet dinh `tracking.history_read`.
 *
 * Neu hai tuyen nay dung chung mot quyen, cau "khong lo duong di chi tiet cua mot con nguoi cho
 * vai khong can biet" se chi con la mot loi hua trong tai lieu.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('trips/:tripId/tracking')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.tracking.read')
  summaries(@Param('tripId') tripId: string): Promise<readonly TrackingSummaryView[]> {
    return this.guard(() => this.tracking.summariesForTrip(tripId));
  }

  @Get('tracking/sessions/:sessionId/track')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.location.history.read')
  track(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<LocationTrackView> {
    // `transportActorOf` la nguon DUY NHAT cua "ai dang lam viec nay" — no khong bao gio doc mot
    // header. Ghi ten nguoi doc vao so quyet dinh la phan con lai cua cau tra loi cho "ai da xem
    // duong di cua ai".
    const actor = transportActorOf(request);
    return this.guard(() => this.tracking.trackForSession(sessionId, actor));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
