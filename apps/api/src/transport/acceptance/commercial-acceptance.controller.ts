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
 * BE MAT KET THUC DON — `#275` K3/K4.
 *
 * ============================================================================================
 * DUONG DI KEY BANG `orderId`, KHONG BANG `runId`
 * ============================================================================================
 *
 * `#275` K4: *"Normal boss/accounting surface should not ask them for a Run ID."* Duong
 * `runs/:runId` cua `#271` da bi GO — khong phai de don dep, ma vi giu no lai se de mot nguoi ke
 * toan quyet mot VONG CHAY roi tuong don da xong, trong khi cong doi soat khong doc duong do. Hai
 * be mat cho mot cau hoi la mot be mat noi doi.
 *
 * Khong ben goi nao mat: `grep` toan `apps/web` truoc lane nay cho ZERO ket qua cho hai route cu.
 *
 * ============================================================================================
 * KHONG CO BE MAT LAI XE O DAY, VA DO LA MOT KHANG DINH
 * ============================================================================================
 *
 * Ca hai duong doc lan duong ghi deu doi `transport.commercial_acceptance.*`, va hai ma do KHONG
 * nam trong `SELF_SCOPE_ACTIONS`. Nen vai `SALE` — vai as-built cua LAI XE — khong goi duoc mot
 * duong nao trong tep nay, ke ca doc, ke ca tren vong chay cua chinh ho.
 *
 * Do la co y va no manh hon "an nut di": `#275` K3 doi *"direct API calls enforce
 * authorization"*, va K8 bai 1 doi *"Driver direct POST => denied"*. Cong that nam o
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
   * HANG CHO — `Cho ket thuc`, `Da ket thuc`, `Can bo sung`, `Tu choi` (`#275` K4).
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

  /** HO SO cua mot DON — kem CA lich su quyet dinh (`#275` K1: khong ban nao bi mat). */
  @Get('orders/:orderId')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.commercial_acceptance.read')
  detail(@Param('orderId') orderId: string): Promise<CommercialAcceptanceDetail> {
    return this.guard(() => this.acceptance.detailForOrder(orderId));
  }

  /**
   * GHI mot quyet dinh ket thuc don — hanh dong ma nguoi dung thay la `Da ket thuc`.
   *
   * `orderId` lay tu DUONG DAN, khong tu than yeu cau — cung ly le da ghi o `CheckpointsController`:
   * hai nguon cho cung mot su that se co luc lech nhau.
   *
   * `POST .../decisions` chu khong `POST .../approve` + `POST .../reject`: ba ket qua di qua CUNG
   * mot cong nghiep vu voi cung mot bo luat (`evaluateAcceptanceDecision`), va tach thanh ba route
   * se tao ba cho de mot lan sua sau nay quen mot dieu kien. Tai nguyen duoc tao o day la MOT
   * QUYET DINH — va do dung la thu duoc them vao lich su.
   */
  @Post('orders/:orderId/decisions')
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.commercial_acceptance.decide')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ): Promise<CommercialAcceptanceDetail> {
    const authUserId = requireAuthUserId(request);
    const parsed = recordAcceptanceDecisionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    return this.guard(() =>
      this.acceptance.decide({
        orderId,
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
