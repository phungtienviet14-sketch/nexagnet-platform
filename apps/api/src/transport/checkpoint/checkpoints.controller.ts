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
import { CheckpointService } from './checkpoint.service.js';
import { recordCheckpointSchema } from './checkpoint.schemas.js';
import type { RunCheckpoint } from './checkpoint.types.js';
import type { RunTimeline } from './run-timeline.js';

/**
 * BE MAT VAN HANH cua moc — dong thoi gian mot chuyen (`#243` F6) va moc do dieu hanh ghi.
 *
 * Tach han khoi `DriverCheckpointsController`: mot controller `import` controller kia chi de dung
 * chung mot ham la cach hai be mat le ra phai tach bat dau dinh lai voi nhau. Cung quy uoc voi
 * cap `driver-fuel-evidence` / `fuel-evidence` cua `#169`.
 *
 * Dong thoi gian KHONG mang toa do — cung nguyen tac voi `OperationalProofService.viewsForTrip`.
 * Ai can duong di tung phut thi di qua `transport.location.history.read`, va de lai mot dong o do.
 */
@Controller('transport/runs/:runId/checkpoints')
@UseGuards(TransportActionGuard)
export class CheckpointsController {
  constructor(private readonly checkpoints: CheckpointService) {}

  @Get()
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.checkpoint.read')
  timeline(@Param('runId') runId: string): Promise<RunTimeline> {
    return this.guard(() => this.checkpoints.timelineForRun(runId));
  }

  /**
   * Dieu hanh ghi moc — trong thuc te la `ASSIGNED`, va cac moc bu khi lai xe khong ghi duoc.
   *
   * `runId` lay tu DUONG DAN, khong tu than yeu cau: mot lieu do vua co `runId` vua nam duoi mot
   * duong dan co `:runId` la hai nguon cho cung mot su that, va se co luc chung lech nhau.
   */
  @Post()
  @Roles('ADMIN')
  @RequiresTransportAction('transport.checkpoint.record')
  record(
    @Req() request: AuthenticatedRequest,
    @Param('runId') runId: string,
    @Body() body: unknown,
  ): Promise<RunCheckpoint> {
    const authUserId = requireAuthUserId(request);
    const parsed = recordCheckpointSchema.safeParse({ ...(body as object), runId });
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.checkpoints.recordAsOperator({
        type: parsed.data.type,
        runId,
        legId: parsed.data.legId,
        authUserId,
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
