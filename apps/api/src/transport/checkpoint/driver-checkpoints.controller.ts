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
import { CheckpointService } from './checkpoint.service.js';
import { recordCheckpointSchema } from './checkpoint.schemas.js';
import type { RunCheckpoint } from './checkpoint.types.js';

/**
 * BE MAT LAI XE cua moc van hanh — `#243` F5.
 *
 * MOT tuyen ghi cho ca chin loai moc, phan biet bang `type` trong than yeu cau. Khong tach thanh
 * `/arrive-pickup`, `/depart-pickup`, `/arrive-delivery`... vi chin duong do khac nhau DUNG hai
 * dieu — thu tu, va chinh sach chung cu vi tri — va ca hai deu la QUY TAC NGHIEP VU thuoc dich vu,
 * khong phai hinh dang HTTP. Chin tuyen se la chin cho de quen mot phep kiem.
 *
 * KHONG co tuyen sua va KHONG co tuyen xoa. Moc la so ghi them; sua mot moc ghi nham la ghi mot
 * moc dinh chinh, khong phai goi `PATCH`.
 */
@Controller('transport/me/checkpoints')
@UseGuards(TransportActionGuard)
export class DriverCheckpointsController {
  constructor(private readonly checkpoints: CheckpointService) {}

  @Get()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.checkpoint.record')
  listOwn(@Req() request: AuthenticatedRequest): Promise<readonly RunCheckpoint[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.checkpoints.listOwn(authUserId));
  }

  @Post()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.checkpoint.record')
  record(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<RunCheckpoint> {
    const authUserId = requireAuthUserId(request);
    const parsed = recordCheckpointSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.checkpoints.recordAsDriver({
        type: parsed.data.type,
        runId: parsed.data.runId,
        legId: parsed.data.legId,
        authUserId,
        observationId: parsed.data.observationId,
        clientEventId: parsed.data.clientEventId,
        note: parsed.data.note,
      }),
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
