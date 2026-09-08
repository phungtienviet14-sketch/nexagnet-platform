import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import { TollAccountService } from './toll-account.service.js';
import { TollService } from './toll.service.js';
import {
  closeTollLinkSchema,
  createTollAccountSchema,
  listTollCandidatesQuerySchema,
  listTollProviderQuerySchema,
  openTollLinkSchema,
  tollImportSchema,
  tollReviewSchema,
  updateTollAccountSchema,
} from './toll.schemas.js';

/**
 * NAP DU LIEU ETC qua HTTP — be mat VAN HANH / KE TOAN.
 *
 * ===========================================================================
 * KHONG CO MOT DUONG NAO CHO LAI XE, va do la mot quyet dinh chu khong mot thieu sot.
 *
 * ETC la CONG TY TRA (#229 §8). Mot lai xe khong nop, khong doi soat, va khong doc lich su ETC cua
 * ca doi xe. Cong that nam o bang phan quyen (`transport-actions.ts`: `SALE` chi co
 * `SELF_SCOPE_ACTIONS`, va khong ma `transport.toll.*` nao nam trong do), khong o giao dien.
 *
 * ===========================================================================
 * KHONG CO DUONG XOA. Mot lan nap la mot su kien da xay ra; go no di se lam moi quyet dinh doi
 * soat tro vao hu khong. Sua mot dong sai = mot QUYET DINH MOI duoc ghi them (`POST .../review`).
 */
@Controller('transport/toll')
@UseGuards(TransportActionGuard)
export class TollController {
  constructor(
    private readonly toll: TollService,
    private readonly accounts: TollAccountService,
  ) {}

  /**
   * SAN SANG CUA TUNG NHA CUNG CAP — #269 doi bang chung RIENG cho VETC va ePass.
   *
   * Be mat nay ton tai de `BLOCKED_SAMPLE_REQUIRED` la mot cau tra loi DOC DUOC, thay vi mot muc
   * "ETC" hien ra trong giao dien roi khong lam gi khi bam vao — dung kieu loi hua sai ma `F-09`
   * da day.
   */
  @Get('providers')
  @RequiresTransportAction('transport.toll.account.read')
  providers() {
    return {
      readiness: this.toll.providerReadiness(),
      api: this.toll.apiDiagnostics(),
    };
  }

  /* ------------------------------ Tai khoan ----------------------------- */

  @Get('accounts')
  @RequiresTransportAction('transport.toll.account.read')
  listAccounts(@Query() query: unknown) {
    const parsed = listTollProviderQuerySchema.parse(query ?? {});
    return this.guard(() => this.accounts.listAccounts(parsed.provider ?? null));
  }

  @Post('accounts')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.toll.account.manage')
  createAccount(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createTollAccountSchema, body);
    return this.guard(() => this.accounts.createAccount(input, transportActorOf(request)));
  }

  @Patch('accounts/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.toll.account.manage')
  updateAccount(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { active } = this.parse(updateTollAccountSchema, body);
    return this.guard(() => this.accounts.setAccountActive(id, active, transportActorOf(request)));
  }

  @Get('accounts/:id/links')
  @RequiresTransportAction('transport.toll.account.read')
  listLinks(@Param('id') id: string) {
    return this.guard(() => this.accounts.listLinksForAccount(id));
  }

  @Post('accounts/:id/links')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.toll.account.manage')
  openLink(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(openTollLinkSchema, body);
    return this.guard(() =>
      this.accounts.openLink({ ...input, accountId: id }, transportActorOf(request)),
    );
  }

  /**
   * DONG mot doan noi — `PATCH` chu khong `DELETE`.
   *
   * "Xe doi tai khoan" phai giu duoc CA HAI doan, vi mot luot qua tram thang truoc thuoc ve tai
   * khoan CU. Xoa doan cu di se lam moi dong cu tro thanh `VEHICLE_UNRESOLVED` — mot lich su bi
   * viet lai boi mot thao tac hom nay.
   */
  @Patch('links/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.toll.account.manage')
  closeLink(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { effectiveTo } = this.parse(closeTollLinkSchema, body);
    return this.guard(() => this.accounts.closeLink(id, effectiveTo, transportActorOf(request)));
  }

  /* -------------------------------- Nap -------------------------------- */

  /** DOC THU — khong ghi mot hang nao. An toan de bam bao nhieu lan cung duoc. */
  @Post('imports/preview')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.toll.import')
  preview(@Body() body: unknown) {
    const input = this.parse(tollImportSchema, body);
    return this.guard(async () => {
      const preview = await this.toll.previewImport(input);
      return this.summarise(preview);
    });
  }

  @Post('imports')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.toll.import')
  commit(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(tollImportSchema, body);
    return this.guard(async () => {
      const result = await this.toll.commitImport(input, transportActorOf(request));
      return {
        import: result.import,
        replayed: result.replayed,
        candidateCount: result.candidates.length,
      };
    });
  }

  @Get('imports')
  @RequiresTransportAction('transport.toll.review.read')
  listImports(@Query() query: unknown) {
    const parsed = listTollProviderQuerySchema.parse(query ?? {});
    return this.guard(() => this.toll.listImports(parsed.provider ?? null));
  }

  /* ------------------------------ Doi soat ------------------------------ */

  @Get('candidates')
  @RequiresTransportAction('transport.toll.review.read')
  listCandidates(@Query() query: unknown) {
    const parsed = listTollCandidatesQuerySchema.parse(query ?? {});
    return this.guard(async () => ({
      items: await this.toll.listCandidates(parsed),
      total: await this.toll.countCandidates(parsed),
      limit: parsed.limit,
      offset: parsed.offset,
    }));
  }

  @Get('candidates/:id')
  @RequiresTransportAction('transport.toll.review.read')
  candidate(@Param('id') id: string) {
    return this.guard(() => this.toll.candidateDetail(id));
  }

  @Post('candidates/:id/review')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.toll.review.resolve')
  review(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(tollReviewSchema, body);
    return this.guard(() =>
      this.toll.review({ ...input, candidateId: id }, transportActorOf(request)),
    );
  }

  /**
   * BAN THU KHONG TRA VE TOAN BO CAC DONG.
   *
   * Mot tep 20.000 dong tra ve nguyen ven se lam mot than phan hoi hang chuc megabyte, va nguoi
   * bam "xem thu" chi can biet: doc duoc bao nhieu, hong bao nhieu va vi sao, va se roi vao nhung
   * o doi soat nao. Hai muoi dong dau la du de nhin thay hinh dang tep.
   */
  private summarise(preview: Awaited<ReturnType<TollService['previewImport']>>) {
    return {
      provider: preview.provider,
      sourceKind: preview.sourceKind,
      sourceDigest: preview.sourceDigest,
      rowCount: preview.rowCount,
      acceptedCount: preview.acceptedCount,
      rejectedCount: preview.rejectedCount,
      rejectionsByReason: preview.rejectionsByReason,
      matchStateCounts: preview.matchStateCounts,
      alreadyImportedId: preview.alreadyImportedId,
      sample: preview.lines.slice(0, 20).map((line, index) => ({
        rowNumber: line.rowNumber,
        parseStatus: line.parseStatus,
        rejectReason: line.rejectReason,
        kind: line.kind,
        vehiclePlateRaw: line.vehiclePlateRaw,
        businessDate: line.businessDate,
        signedAmount: line.signedAmount,
        stationLabel: line.stationLabel,
        matchState: preview.classified[index]?.matchState ?? null,
      })),
    };
  }

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
