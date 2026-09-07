import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import {
  closeTrackingSessionSchema,
  openTrackingSessionSchema,
  reportObservationBatchSchema,
} from './proof.schemas.js';
import { TrackingService } from './tracking.service.js';
import type {
  LocationObservation,
  TrackingSession,
  TrackingSummaryView,
} from './tracking.types.js';

/**
 * BE MAT LAI XE cua bam vi tri — `GD-23`.
 *
 * MOT CONTROLLER RIENG tren mot tien to duong dan rieng (`/transport/me/tracking`), khong phai vai
 * nhanh `if` trong controller van hanh. Ba dieu duoc bao dam bang CAU TRUC:
 *
 *   1. **khong route nao o day nhan `:driverId`** — danh tinh chi den tu phien;
 *   2. **khong lieu do nao nhan `vehicleId`** — xe do may chu doc tu ban phan cong;
 *   3. pham vi "phien cua chinh toi" duoc chot bang QUYEN SO HUU trong `TrackingService`, khong
 *      bang vai `SALE` — hai lai xe khac nhau van cung mot vai, nen vai khong the la cong.
 *
 * `@Roles('SALE', 'ADMIN')`: `SALE` la CHO GIU TAM cho vai lai xe (`GD-22`) — nen tang chua co vai
 * `DRIVER`. `ADMIN` giu de nguoi ho tro con mo duoc man hinh lai xe khi di tim su co.
 */
@Controller('transport/me/tracking')
@UseGuards(TransportActionGuard)
export class DriverTrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post('sessions')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.tracking.start')
  openSession(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<TrackingSession> {
    const authUserId = requireAuthUserId(request);
    const parsed = openTrackingSessionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return this.guard(() =>
      this.tracking.openSession({
        authUserId,
        tripId: parsed.data.tripId,
        device: parsed.data.device ?? null,
      }),
    );
  }

  @Get('sessions')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.tracking.start')
  listOwnSessions(@Req() request: AuthenticatedRequest): Promise<readonly TrackingSummaryView[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.tracking.summariesForDriver(authUserId));
  }

  /**
   * MOT LO, khong phai mot diem.
   *
   * Duong nay ton tai vi hang doi ngoai tuyen: khi may co song tro lai, no co the co hang tram ban
   * dinh vi tich luy. Gui tung cai la hang tram vong khu hoi tren mot ket noi vua moi hoi phuc.
   *
   * Moi phan tu mang `clientEventId` rieng, nen mot lo gui LAI mot phan la an toan: nhung ban da
   * co tra ve ban cu, nhung ban moi duoc ghi. Do la ly do dau ra la mot mang cung do dai voi dau
   * vao — may khach doi chieu duoc tung cai va biet chac cai nao da vao.
   */
  @Post('sessions/:sessionId/observations')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.tracking.report')
  report(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ): Promise<readonly LocationObservation[]> {
    const authUserId = requireAuthUserId(request);
    const parsed = reportObservationBatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return this.guard(async () => {
      const accepted: LocationObservation[] = [];
      // TUAN TU, co y: phep kiem lien tuc cua moi ban doc ban LIEN TRUOC no. Chay song song se
      // lam moi ban trong mot lo cung so voi cung mot "ban truoc", va toan bo phep kiem di chuyen
      // bat kha thi trong mot lo se im lang.
      for (const observation of parsed.data.observations) {
        accepted.push(
          await this.tracking.ingest({
            authUserId,
            sessionId,
            clientEventId: observation.clientEventId,
            latitude: observation.latitude,
            longitude: observation.longitude,
            accuracyMetres: observation.accuracyMetres ?? null,
            speedMetresPerSecond: observation.speedMetresPerSecond ?? null,
            bearingDegrees: observation.bearingDegrees ?? null,
            source: observation.source,
            capturedAt: observation.capturedAt,
            mockLocationReported: observation.mockLocationReported ?? null,
          }),
        );
      }
      return accepted;
    });
  }

  @Post('sessions/:sessionId/close')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.tracking.stop')
  closeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ): Promise<TrackingSession> {
    const authUserId = requireAuthUserId(request);
    const parsed = closeTrackingSessionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return this.guard(() => this.tracking.closeSession(authUserId, sessionId, parsed.data.reason));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
