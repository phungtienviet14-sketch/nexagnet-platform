import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loadEnv } from '@netviet/shared';
import { z } from 'zod';
import { AuditLogService } from '../audit/audit-log.service.js';
import {
  RuleConfigLifecycleError,
  RuleConfigService,
} from '../rule-config/rule-config.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import {
  GroupMappingService,
  groupHiddenSchema,
  groupMappingSchema,
} from './group-mapping.service.js';
import { SettingsQueryService } from './settings-query.service.js';
import { PricePeriodsService } from './price-periods.service.js';
import {
  SOURCE_TRUTH_RESOURCES,
  SourceTruthWriteService,
  overrideId,
  type SourceTruthResource,
} from './source-truth-write.service.js';
import { Roles } from '../auth/roles.decorator.js';

const resourceSchema = z.enum(SOURCE_TRUTH_RESOURCES);
const idSchema = z.string().trim().min(1).max(128);
const autoSendSchema = z.object({ enabled: z.boolean() }).strict();
const ruleDraftSchema = z.object({ payload: z.unknown() }).strict();
const previewSchema = z
  .object({
    sampleOrder: z
      .object({
        orderType: z.enum(['TH1', 'TH2']),
        totalQuantity: z.number().int().positive().max(1_000_000),
        region: z.string().trim().max(500),
        itemsSubtotal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        codCollect: z.boolean(),
        wantVat: z.boolean(),
      })
      .strict(),
  })
  .strict();
const activateSchema = z.object({ confirmed: z.literal(true) }).strict();
const auditQuerySchema = z
  .object({
    actor: z.string().trim().min(1).max(200).optional(),
    action: z.string().trim().min(1).max(200).optional(),
    entityType: z.string().trim().min(1).max(200).optional(),
    entityId: z.string().trim().min(1).max(200).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(25),
  })
  .strict();

// Mac dinh: DOC mo cho ca 4 vai. Moi mutation cham nguon su that / tien / cong tac van hanh
// deu bi siet lai MANAGER+ADMIN o cap phuong thuc ben duoi (§9 gd1-ultty).
@Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
@Controller('settings')
export class SettingsController {
  private readonly env = loadEnv();

  constructor(
    private readonly queryService: SettingsQueryService,
    private readonly sourceTruthWrites: SourceTruthWriteService,
    private readonly runtime: RuntimeSettingsService,
    private readonly rules: RuleConfigService,
    private readonly audit: AuditLogService,
    private readonly groupMapping: GroupMappingService,
    private readonly pricePeriods: PricePeriodsService,
  ) {}

  @Get('summary')
  summary() {
    return this.queryService.summary();
  }

  @Get('price-periods')
  pricePeriodList() {
    return this.pricePeriods.list();
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('price-periods')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createPricePeriod(
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    return this.pricePeriods.createDraft(body, actorName(actor), requestId ?? null);
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('price-periods/:id/copy')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  copyPricePeriod(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    return this.pricePeriods.copyDraft(id, body, actorName(actor), requestId ?? null);
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('price-periods/:id/import/preview')
  previewPriceImport(@Param('id') id: string, @Body() body: unknown) {
    return this.pricePeriods.previewImport(id, body);
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('price-periods/:id/import/apply')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  applyPriceImport(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    return this.pricePeriods.applyImport(id, body, actorName(actor), requestId ?? null);
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('price-periods/:id/validate')
  validatePricePeriod(@Param('id') id: string) {
    return this.pricePeriods.validate(id);
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('price-periods/:id/activate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  activatePricePeriod(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    if (!activateSchema.safeParse(body).success) {
      throw new BadRequestException('Phải xác nhận trước khi kích hoạt kỳ giá');
    }
    return this.pricePeriods.activate(id, actorName(actor), requestId ?? null);
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('price-periods/:id/archive')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  archivePricePeriod(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    if (!activateSchema.safeParse(body).success) {
      throw new BadRequestException('Phải xác nhận trước khi lưu trữ kỳ giá');
    }
    return this.pricePeriods.archive(id, actorName(actor), requestId ?? null);
  }

  @Get('source-truth/:resource')
  sourceTruth(@Param('resource') resource: string) {
    return this.queryService.sourceTruth(parseResource(resource));
  }

  @Roles('MANAGER', 'ADMIN')
  @Put('source-truth/:resource/:id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  putSourceTruth(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) throw new BadRequestException('ID nguon su that khong hop le');
    return this.sourceTruthWrites.write(
      parseResource(resource),
      parsedId.data,
      body,
      actor,
      requestId ?? null,
    );
  }

  @Roles('MANAGER', 'ADMIN')
  @Put('source-truth/:resource')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  putNewSourceTruth(
    @Param('resource') resource: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsedResource = parseResource(resource);
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    if (
      parsedResource === 'overrides' &&
      (!idSchema.safeParse(record.dealerId).success || !idSchema.safeParse(record.sku).success)
    ) {
      throw new BadRequestException('Override can co dealerId va sku hop le');
    }
    // Duong TAO MOI phai ghep danh tinh y het duong SUA, nen no goi chung overrideId() cua
    // service thay vi tu ghep chuoi. Hai cho ghep bang hai doan code la hai cho lech duoc nhau.
    const inferredId =
      parsedResource === 'overrides'
        ? overrideId(String(record.dealerId ?? ''), String(record.sku ?? ''))
        : (record.id ?? record.sku ?? record.term ?? record.chatId);
    const parsedId = idSchema.safeParse(inferredId);
    if (!parsedId.success) throw new BadRequestException('Can co id, sku, term hoac chatId de tao moi');
    const changes = createChangesWithoutRouteIdentifier(parsedResource, record);
    return this.sourceTruthWrites.write(
      parsedResource,
      parsedId.data,
      changes,
      actor,
      requestId ?? null,
    );
  }

  /**
   * Map nhom -> dai ly bang chatId (UI da hien san), khong bat nguoi van hanh go ID vao form
   * nguon su that. Khoa tu nhien platform+chatId nen dung duoc voi ca nhom vua phat hien.
   */
  @Roles('MANAGER', 'ADMIN')
  @Put('groups/:chatId/mapping')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  setGroupMapping(
    @Param('chatId') chatId: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsedChatId = idSchema.safeParse(chatId);
    if (!parsedChatId.success) throw new BadRequestException('chatId nhom khong hop le');
    const parsed = groupMappingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Can dealerId (chuoi hoac null) de map nhom');
    }
    return this.groupMapping.setMapping(
      parsedChatId.data,
      parsed.data,
      actorName(actor),
      requestId ?? null,
    );
  }

  /**
   * Go nhom khoi danh sach lam viec (`hidden=true`) hoac dua tro lai (`hidden=false`).
   * Khong phai xoa: xem giai thich o `GroupMappingService.setHidden`.
   */
  @Roles('MANAGER', 'ADMIN')
  @Put('groups/:chatId/hidden')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  setGroupHidden(
    @Param('chatId') chatId: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsedChatId = idSchema.safeParse(chatId);
    if (!parsedChatId.success) throw new BadRequestException('chatId nhom khong hop le');
    const parsed = groupHiddenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Can hidden (true hoac false)');
    return this.groupMapping.setHidden(
      parsedChatId.data,
      parsed.data.hidden,
      actorName(actor),
      requestId ?? null,
    );
  }

  @Get('rules')
  rulesList() {
    return this.rules.list();
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('rules')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createRule(
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsed = ruleDraftSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Payload rules khong hop le');
    try {
      const version = await this.rules.createDraft(parsed.data.payload, actorName(actor));
      await this.audit.append({
        actor: actorName(actor),
        action: 'rules.draft.create',
        entityType: 'RuleConfigVersion',
        entityId: version.id,
        after: version,
        requestId,
      });
      return version;
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('rules/:id/preview')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async previewRule(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Don mau preview khong hop le');
    try {
      const version = await this.rules.preview(id);
      const sample = parsed.data.sampleOrder;
      const totals = {
        itemsSubtotal: sample.itemsSubtotal,
        shippingFee: null,
        vatAmount: null,
        codFee: null,
        grandTotal: null,
      };
      await this.audit.append({
        actor: actorName(actor),
        action: 'rules.preview',
        entityType: 'RuleConfigVersion',
        entityId: version.id,
        after: version,
        requestId,
      });
      return {
        version,
        totals,
        warnings: [
          'VAT, COD và ship đang thiếu cấu hình nghiệp vụ chính thức; preview không dùng số tạm.',
        ],
        trace: [`Rules v${version.version} da qua schema typed va san sang kich hoat.`],
      };
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('rules/:id/activate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async activateRule(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    if (!activateSchema.safeParse(body).success) {
      throw new BadRequestException('Phai xac nhan truoc khi kich hoat rules');
    }
    try {
      const version = await this.rules.activate(id, actorName(actor));
      await this.audit.append({
        actor: actorName(actor),
        action: 'rules.activate',
        entityType: 'RuleConfigVersion',
        entityId: version.id,
        after: version,
        requestId,
      });
      return version;
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  @Roles('MANAGER', 'ADMIN')
  @Put('automation/auto-send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async setAutoSend(
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    this.assertMutationOrigin(origin);
    const parsed = autoSendSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Payload AUTO_SEND phai chi gom enabled=true|false');
    }
    const before = { autoSend: this.runtime.autoSend() };
    const after = this.runtime.setAutoSend(parsed.data.enabled);
    await this.audit.append({
      actor: actorName(actor),
      action: 'automation.auto_send',
      entityType: 'RuntimeSettings',
      entityId: 'AUTO_SEND',
      before,
      after,
      requestId,
    });
    return after;
  }

  @Get('audit')
  async auditList(@Query() raw: unknown) {
    const parsed = auditQuerySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Bo loc audit khong hop le');
    const { page, limit, ...filter } = parsed.data;
    const entries = await this.audit.list({ ...filter, limit: page * limit });
    const paged = entries.slice((page - 1) * limit, page * limit);
    return { entries: paged, total: entries.length, page, limit };
  }

  private assertMutationOrigin(origin?: string): void {
    // AUTH_MODE=none (VM dev/demo): xac thuc da tat -> khong kiem Origin nua. Xem env.ts.
    if (this.env.AUTH_MODE === 'none') return;
    if (this.env.NODE_ENV !== 'production') return;
    const allowed = new Set(
      [this.env.CORS_ORIGIN, this.env.ZALO_OPERATOR_ORIGIN]
        .filter((url): url is string => Boolean(url))
        .map((url) => url.replace(/\/+$/, '')),
    );
    const normalizedOrigin = origin?.replace(/\/+$/, '');
    if (!normalizedOrigin || !allowed.has(normalizedOrigin)) {
      throw new ForbiddenException('Origin trang cau hinh khong hop le');
    }
  }

  private rethrowRuleError(error: unknown): never {
    if (!(error instanceof RuleConfigLifecycleError)) throw error;
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'INVALID_TRANSITION') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
}

function createChangesWithoutRouteIdentifier(
  resource: SourceTruthResource,
  record: Record<string, unknown>,
): Record<string, unknown> {
  if (resource === 'overrides' || resource === 'groups') return { ...record };
  const identifier =
    resource === 'dealers'
      ? 'id'
      : resource === 'glossary'
        ? 'term'
        : 'sku';
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== identifier));
}

function parseResource(resource: string): SourceTruthResource {
  const parsed = resourceSchema.safeParse(resource);
  if (!parsed.success) throw new NotFoundException('Nguon su that khong ton tai');
  return parsed.data;
}

function actorName(actor: string): string {
  const parsed = z.string().trim().min(1).max(200).safeParse(actor);
  return parsed.success ? parsed.data : 'operator';
}
