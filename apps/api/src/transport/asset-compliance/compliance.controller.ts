import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
import { AssetComplianceReadService } from './asset-compliance-read.service.js';
import { AssetComplianceService } from './asset-compliance.service.js';
import {
  registerComplianceDocumentSchema,
  setComplianceDocumentStatusSchema,
} from './asset-compliance.schemas.js';

/**
 * GIAY TO PHAP LY qua HTTP — VT-011, VT-014, VT-065.
 *
 * KHONG co route `DELETE`: mot ban giay to la BANG CHUNG cua mot ky da qua. Duong go la
 * `PATCH .../status` sang `SUPERSEDED` (da co ban moi) hoac `REVOKED` (bi thu hoi) — ca hai giu
 * nguyen hang cu.
 *
 * `GET alerts` KHONG nhan tham so nguong. Nguong den tu chinh sach cua khach (`GD-18`), khong tu
 * than yeu cau: cho nguoi goi tu chon nguong se lam hai man hinh cua cung mot cong ty noi hai
 * chuyen khac nhau ve cung mot chiec xe.
 */
@Controller('transport/compliance')
@UseGuards(TransportActionGuard)
export class ComplianceController {
  constructor(
    private readonly service: AssetComplianceService,
    private readonly read: AssetComplianceReadService,
  ) {}

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

  @Get('documents')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.compliance.document.read')
  async listDocuments() {
    return this.guard(async () => ({ documents: await this.read.listDocuments() }));
  }

  @Post('documents')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.compliance.document.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async registerDocument(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(registerComplianceDocumentSchema, body);
    return this.guard(async () =>
      this.service.registerDocument({
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        documentType: input.documentType,
        documentNo: input.documentNo ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo,
        evidenceRef: input.evidenceRef ?? null,
        note: input.note ?? null,
        recordedBy: transportActorOf(request),
      }),
    );
  }

  @Patch('documents/:documentId/status')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.compliance.document.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async setStatus(@Param('documentId') documentId: string, @Body() body: unknown) {
    const input = this.parse(setComplianceDocumentStatusSchema, body);
    return this.guard(async () => this.service.setDocumentStatus(documentId, input.status));
  }

  @Get('alerts')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.compliance.document.read')
  async alerts() {
    return this.guard(async () => ({
      alerts: await this.read.complianceAlerts(),
      gaps: await this.read.coverageGaps(),
    }));
  }
}
