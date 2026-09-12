import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import { startWaitingSchema } from './waiting.schemas.js';
import { WaitingSessionService } from './waiting.service.js';
import type { WaitingSessionView } from './waiting.view.js';

/**
 * BE MAT LAI XE cua phien cho — `#279` O4/O9.
 *
 * HAI tuyen, va KHONG co tuyen thu ba:
 *
 *   · `POST` mo mot phien (`Bat dau cho`);
 *   · `GET`  doc phien cua chinh minh.
 *
 * KHONG co `POST /:id/close`. Lai xe dong mot phien cho bang cach bam `Khach da nhan hang` — tuc
 * ghi moc `DELIVERY_ACCEPTED` qua `DriverCheckpointsController` — va chinh moc do dong phien
 * (`DeliveryWaitingCloser`). Mot tuyen dong rieng se la duong ghi THU HAI cho cung mot su that:
 * mot phien da dong ma khong co moc nhan hang nao doi ung, va thoi luong cho lech voi dong thoi
 * gian. Xem khoi chu thich cua `WaitingSessionService`.
 *
 * KHONG co tuyen sua. `startedAt` cua may chu la su that; sua no la sua can cu cua mot khoan tien.
 */
@Controller('transport/me/waiting-sessions')
@UseGuards(TransportActionGuard)
export class DriverWaitingController {
  constructor(private readonly waiting: WaitingSessionService) {}

  @Get()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.waiting.start')
  async listOwn(@Req() request: AuthenticatedRequest): Promise<readonly WaitingSessionView[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(async () => this.waiting.viewAll(await this.waiting.listOwn(authUserId)));
  }

  @Post()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.waiting.start')
  async start(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<WaitingSessionView> {
    const authUserId = requireAuthUserId(request);
    const parsed = startWaitingSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(async () =>
      this.waiting.view(
        await this.waiting.start({
          runId: parsed.data.runId,
          legId: parsed.data.legId,
          arrivalCheckpointId: parsed.data.arrivalCheckpointId,
          reason: parsed.data.reason,
          clientEventId: parsed.data.clientEventId,
          note: parsed.data.note,
          authUserId,
        }),
      ),
    );
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
