import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { acceptanceQuerySchema, recordAcceptanceDecisionSchema } from './acceptance.schemas.js';
import { CommercialAcceptanceService } from './acceptance.service.js';
import type {
  CommercialAcceptanceDetail,
  CommercialAcceptanceQueueRow,
} from './acceptance.types.js';

/**
 * BE MAT NGHIEM THU CHUNG TU — `#268` I3/I6.
 *
 * ============================================================================================
 * KHONG CO BE MAT LAI XE O DAY, VA DO LA MOT KHANG DINH
 * ============================================================================================
 *
 * Ca hai duong doc lan duong ghi deu doi `transport.commercial_acceptance.*`, va hai ma do KHONG
 * nam trong `SELF_SCOPE_ACTIONS`. Nen vai `SALE` — vai as-built cua LAI XE — khong goi duoc mot
 * duong nao trong tep nay, ke ca doc, ke ca tren vong chay cua chinh ho.
 *
 * Do la co y va no manh hon "an nut di": `#268` I7 bai 15 doi *"UI-hidden action is still denied
 * server-side"*, va bai 1 doi *"Driver cannot approve their own run"*. Cong that nam o
 * `TransportActionGuard`, khong o man hinh.
 *
 * `MANAGER` cung khong goi duoc gi: `ROLE_ACTIONS.MANAGER` la `[]`, va do la fail-closed CO CHU
 * DICH — chua ai noi vai do lam gi trong nghiep vu van tai.
 *
 * ============================================================================================
 * `@Roles` VA `@RequiresTransportAction` DUNG KEM NHAU
 * ============================================================================================
 *
 * Hai tang tra loi hai cau hoi khac nhau, dung quy uoc da chay: `@Roles` la cong AS-BUILT cua nen
 * tang (thu ma `roles-coverage.spec.ts` duyet), `@RequiresTransportAction` la cong CUA MIEN. Bo mot
 * trong hai se lam mot nua so cong mo mot nua dong.
 */
@Controller('transport/commercial-acceptance')
@UseGuards(TransportActionGuard)
export class CommercialAcceptanceController {
  constructor(private readonly acceptance: CommercialAcceptanceService) {}

  /**
   * HANG CHO — `Cho nghiem thu chung tu`, `Da nghiem thu`, `Can bo sung`, `Khong chap nhan`.
   *
   * Tra ve mot PHONG BI (`{ acceptances: [...] }`) chu khong mot mang tran, dung quy uoc ma
   * `transport-api-envelope.spec.ts` cua `apps/web` khoa: mot mang tran khong con cho de them
   * phan trang ma khong pha moi ben goi.
   */
  @Get()
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.commercial_acceptance.read')
  async queue(
    @Query() query: unknown,
  ): Promise<{ readonly acceptances: readonly CommercialAcceptanceQueueRow[] }> {
    const parsed = acceptanceQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    const acceptances = await this.guard(() =>
      this.acceptance.queue(parsed.data.state ? { state: parsed.data.state } : {}),
    );
    return { acceptances };
  }

  /** HO SO cua mot vong chay — kem CA lich su quyet dinh (`#268` I4: khong ban nao bi mat). */
  @Get('runs/:runId')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.commercial_acceptance.read')
  detail(@Param('runId') runId: string): Promise<CommercialAcceptanceDetail> {
    return this.guard(() => this.acceptance.detailForRun(runId));
  }

  /**
   * GHI mot quyet dinh nghiem thu.
   *
   * `runId` lay tu DUONG DAN, khong tu than yeu cau — cung ly le da ghi o `CheckpointsController`:
   * hai nguon cho cung mot su that se co luc lech nhau.
   *
   * `POST .../decisions` chu khong `POST .../approve` + `POST .../reject`: ba ket qua di qua CUNG
   * mot cong nghiep vu voi cung mot bo luat (`evaluateAcceptanceDecision`), va tach thanh ba route
   * se tao ba cho de mot lan sua sau nay quen mot dieu kien. Tai nguyen duoc tao o day la MOT
   * QUYET DINH — va do dung la thu duoc them vao lich su.
   */
  @Post('runs/:runId/decisions')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.commercial_acceptance.decide')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('runId') runId: string,
    @Body() body: unknown,
  ): Promise<CommercialAcceptanceDetail> {
    const authUserId = requireAuthUserId(request);
    const parsed = recordAcceptanceDecisionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.acceptance.decide({
        runId,
        outcome: parsed.data.outcome,
        reasonCode: parsed.data.reasonCode,
        basis: parsed.data.basis,
        evidenceRefs: parsed.data.evidenceRefs,
        externalNote: parsed.data.externalNote ?? null,
        counterpartyId: parsed.data.counterpartyId ?? null,
        supersedesId: parsed.data.supersedesId ?? null,
        idempotencyKey: parsed.data.idempotencyKey,
        // DANH TINH TU PHIEN. Khong doc mot truong nao cua `body` cho cho nay.
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
