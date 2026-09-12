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
import { closeWaitingByOperatorSchema } from './waiting.schemas.js';
import { WaitingSessionService } from './waiting.service.js';
import type { WaitingSessionView } from './waiting.view.js';

/**
 * BE MAT VAN HANH cua phien cho — `#279` O5/O11.
 *
 * Tach han khoi `DriverWaitingController`, cung quy uoc voi cap `driver-checkpoints`/`checkpoints`
 * cua `#243`: hai be mat, hai quyen, hai duong ghi khac han nhau.
 *
 * `POST /:sessionId/close` mang ma `transport.waiting.close`, va ma do nam trong
 * `ACCOUNTING_DENIED`. Ke toan DOC duoc moi phien cho — ho phai doc de doi soat mot khoan phu cap
 * — nhung KHONG dong duoc mot phien nao. `#279` O6: *"approving user cannot rewrite WaitingSession
 * timestamps"*, va gio dong la moc tren cua chinh khoang thoi gian ho sap duyet tien cho.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class WaitingController {
  constructor(private readonly waiting: WaitingSessionService) {}

  @Get('runs/:runId/waiting-sessions')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.waiting.read')
  async listForRun(@Param('runId') runId: string): Promise<readonly WaitingSessionView[]> {
    return this.guard(async () => this.waiting.viewAll(await this.waiting.listForRun(runId)));
  }

  @Post('waiting-sessions/:sessionId/close')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.waiting.close')
  async close(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ): Promise<WaitingSessionView> {
    const authUserId = requireAuthUserId(request);
    const parsed = closeWaitingByOperatorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(async () =>
      this.waiting.view(
        await this.waiting.closeByOperator({ sessionId, note: parsed.data.note, authUserId }),
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
