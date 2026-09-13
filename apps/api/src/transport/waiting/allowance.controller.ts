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
  decideWaitingAllowanceSchema,
  proposeWaitingAllowanceSchema,
} from './allowance.schemas.js';
import { WaitingAllowanceService } from './allowance.service.js';
import type { DriverWaitingAllowance } from './allowance.types.js';

/**
 * BE MAT VAN PHONG cua phu cap cho — `#279` O6.
 *
 * KHONG CO BAN CUA LAI XE, va do la mot khang dinh. Ca hai ma quyen deu nam ngoai
 * `SELF_SCOPE_ACTIONS`, nen vai `SALE` khong goi duoc mot duong nao o day. Mot lai xe tu de nghi
 * roi tu duyet phu cap cho chinh minh la dung cai ma kiem soat noi bo sinh ra de chan — cung ly le
 * voi `CommercialAcceptanceController` cua Lane K.
 *
 * Lai xe VAN doc duoc khoan cua chinh ho: no di vao phieu luong nhu mot dong `EARNING`, qua
 * `transport.driver.self.payslip.read` — mot be mat da co, voi mot quyen da co.
 *
 * KHONG CO tuyen sua va KHONG CO tuyen xoa. Doi y ve sau la mot de nghi MOI tren cung phien cho,
 * khong phai mot lan ghi de: `#279` O6 doi *"rejected/corrected history preserved"*.
 */
@Controller('transport/waiting-allowances')
@UseGuards(TransportActionGuard)
export class WaitingAllowanceController {
  constructor(private readonly allowances: WaitingAllowanceService) {}

  /** Hang cho duyet — nguon cua muc `DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL` (`#278`). */
  @Get('pending')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.waiting_allowance.propose')
  listPending(): Promise<readonly DriverWaitingAllowance[]> {
    return this.guard(() => this.allowances.listPending());
  }

  @Get('sessions/:sessionId')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.waiting_allowance.propose')
  listForSession(
    @Param('sessionId') sessionId: string,
  ): Promise<readonly DriverWaitingAllowance[]> {
    return this.guard(() => this.allowances.listForSession(sessionId));
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.waiting_allowance.propose')
  propose(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<DriverWaitingAllowance> {
    const authUserId = requireAuthUserId(request);
    const parsed = proposeWaitingAllowanceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.allowances.propose({
        waitingSessionId: parsed.data.waitingSessionId,
        candidateAmount: parsed.data.candidateAmount,
        reason: parsed.data.reason,
        authUserId,
      }),
    );
  }

  /**
   * `allowanceId` lay tu DUONG DAN, khong tu than yeu cau: mot lieu do vua co `allowanceId` vua
   * nam duoi mot duong dan co `:allowanceId` la hai nguon cho cung mot su that, va se co luc chung
   * lech nhau.
   */
  @Post(':allowanceId/decision')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.waiting_allowance.decide')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('allowanceId') allowanceId: string,
    @Body() body: unknown,
  ): Promise<DriverWaitingAllowance> {
    const authUserId = requireAuthUserId(request);
    const parsed = decideWaitingAllowanceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.allowances.decide({
        allowanceId,
        outcome: parsed.data.outcome,
        approvedAmount: parsed.data.approvedAmount ?? null,
        note: parsed.data.note ?? null,
        idempotencyKey: parsed.data.idempotencyKey,
        authUserId,
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
