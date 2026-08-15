import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { contentLifecycleStatusSchema } from '@netviet/shared';
import { z } from 'zod';
import { AuditLogService } from '../audit/audit-log.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { ContentImportService } from './content-import.service.js';
import { ContentManagementService } from './content-management.service.js';
import { ContentService } from './content.service.js';
import type { ContentEntityKind } from './content.repository.js';

const kindSchema = z.enum(['asset', 'faq', 'advice', 'link']);
const idSchema = z.string().trim().min(1).max(1_000);
const applySchema = z.object({ manifest: z.unknown(), confirmed: z.literal(true) }).strict();

/** Tran 500 id/lan: du cho ca bo anh mot goi khach, van chan mot request keo ca bang len. */
const bulkStatusSchema = z
  .object({
    ids: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
    status: contentLifecycleStatusSchema,
  })
  .strict();
const previewSchema = z.object({ manifest: z.unknown() }).strict();

@Controller('settings/content')
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly management: ContentManagementService,
    private readonly imports: ContentImportService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  list() {
    return this.content.snapshot();
  }

  @Post('reload')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reload() {
    return this.content.reload();
  }

  @Post('import/preview')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  previewImport(@Body() body: unknown) {
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Cần manifest để xem trước');
    return this.imports.preview(parsed.data.manifest);
  }

  @Post('import/apply')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async applyImport(
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Phải preview và xác nhận manifest');
    const result = await this.imports.apply(parsed.data.manifest, true, actor);
    await this.content.reload();
    await this.audit.append({
      actor,
      action: 'content.import',
      entityType: 'ContentManifest',
      after: result,
      requestId,
    });
    return result;
  }

  /**
   * Duyet hang loat. Dat TRUOC `@Post(':kind')` co chu y: Nest khop route theo thu tu khai bao,
   * neu de sau thi `:kind` = "assets" se nuot luon duong nay.
   */
  @Post(':kind/bulk-status')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async bulkStatus(
    @Param('kind') rawKind: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    const kind = parseKind(rawKind);
    const parsed = bulkStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Cần ids[] và status hợp lệ');
    const result = await this.content.bulkSetStatus(kind, parsed.data.ids, parsed.data.status);
    await this.audit.append({
      actor,
      action: 'content.bulk_status',
      entityType: kind,
      after: { status: parsed.data.status, ...result },
      requestId,
    });
    return result;
  }

  @Post(':kind')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(
    @Param('kind') rawKind: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    const kind = parseKind(rawKind);
    const result = await this.management.save(kind, body);
    await this.audit.append({
      actor,
      action: 'content.create',
      entityType: kind,
      after: body,
      requestId,
    });
    return result;
  }

  @Put(':kind/:id')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async update(
    @Param('kind') rawKind: string,
    @Param('id') rawId: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    const kind = parseKind(rawKind);
    const id = parseId(rawId);
    const result = await this.management.save(kind, body, id);
    await this.audit.append({
      actor,
      action: 'content.update',
      entityType: kind,
      entityId: id,
      after: body,
      requestId,
    });
    return result;
  }

  @Put(':kind/:id/status')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async transition(
    @Param('kind') rawKind: string,
    @Param('id') rawId: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
    @Headers('x-request-id') requestId?: string,
  ) {
    const kind = parseKind(rawKind);
    const id = parseId(rawId);
    const result = await this.management.transition(kind, id, body);
    await this.audit.append({
      actor,
      action: 'content.status',
      entityType: kind,
      entityId: id,
      after: body,
      requestId,
    });
    return result;
  }
}

function parseKind(value: string): ContentEntityKind {
  const parsed = kindSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Loại content không hợp lệ');
  return parsed.data;
}

function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('ID content không hợp lệ');
  return parsed.data;
}
