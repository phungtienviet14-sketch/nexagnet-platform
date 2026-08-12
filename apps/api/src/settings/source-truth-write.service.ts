import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { z } from 'zod';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaService } from '../config/prisma.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { currentPriceMonth } from '../knowledge/price-periods.js';

export const SOURCE_TRUTH_RESOURCES = [
  'dealers',
  'groups',
  'products',
  'prices',
  'overrides',
  'glossary',
] as const;
export type SourceTruthResource = (typeof SOURCE_TRUTH_RESOURCES)[number];

const idSchema = z.string().trim().min(1).max(128);
const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalMoneySchema = moneySchema.nullable().optional();
const aliasesSchema = z.array(z.string().trim().min(1).max(200)).max(100).default([]);
const dealerSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    aliases: aliasesSchema,
    tier: z.enum(['dai_ly', 'ctv']),
    defaultPolicy: z.enum(['cong_no_30', 'cong_no_45', 'ky_gui', 'thanh_toan_ngay', 'cod']),
    code: z.string().trim().min(1).max(100).nullable().optional(),
    phone: z.string().trim().min(1).max(30).nullable().optional(),
  })
  .strict();
const groupSchema = z
  .object({
    chatId: idSchema,
    name: z.string().trim().min(1).max(300).nullable().optional(),
    branch: z.string().trim().min(1).max(100).nullable().optional(),
    dealerId: idSchema.nullable().optional(),
    status: z.enum(['pending', 'mapped', 'ignored']),
    source: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();
const productSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    aliases: aliasesSchema,
    unit: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(2_000).nullable().optional(),
  })
  .strict();
const priceSchema = z
  .object({
    wholesale: moneySchema,
    minRetailPrice: optionalMoneySchema,
    retailPrice: optionalMoneySchema,
    listPrice: optionalMoneySchema,
    validMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  })
  .strict();
/**
 * Deal rieng day du: ngoai gia con co NGUONG SO LUONG va THOI GIAN HIEU LUC — ba thu Sale phai
 * nhap duoc, neu khong thi deal chi dung duoc mot nua (vd "lay 5 cai moi duoc gia nay, ap tu
 * 01/08 den 31/08"). Bo trong = khong gioi han.
 */
const overrideSchema = z
  .object({
    dealerId: idSchema,
    sku: idSchema,
    price: moneySchema,
    minQuantity: z.coerce.number().int().positive().nullish(),
    effectiveFrom: z.coerce.date().nullish(),
    effectiveTo: z.coerce.date().nullish(),
    enabled: z.boolean().optional(),
  })
  .strict();
const glossarySchema = z.object({ meaning: z.string().trim().min(1).max(1_000) }).strict();

@Injectable()
export class SourceTruthWriteService {
  private readonly persistence: 'memory' | 'prisma';

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly audit: AuditLogService,
    @Optional() persistenceOverride?: 'memory' | 'prisma',
  ) {
    this.persistence = persistenceOverride ?? loadEnv().PERSISTENCE;
  }

  async write(
    resource: SourceTruthResource,
    id: string | undefined,
    body: unknown,
    actor: string,
    requestId: string | null,
  ): Promise<unknown[]> {
    if (this.persistence !== 'prisma') {
      throw new ServiceUnavailableException('Chi co the sua nguon su that khi PERSISTENCE=prisma');
    }
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) throw new BadRequestException('Thieu ID nguon su that hop le');

    // Validate truoc moi query de input xau khong cham database.
    this.validate(resource, body);
    const before = await this.findBefore(resource, entityId.data);
    try {
      await this.persist(resource, entityId.data, body);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Khong the ghi ${resource}: ${safeError(error)}`);
    }
    await this.audit.append({
      actor: normalizeActor(actor),
      action: 'source_truth.update',
      entityType: resource,
      entityId: entityId.data,
      before,
      after: body,
      requestId,
    });
    await this.knowledge.reload();
    return this.list(resource);
  }

  private validate(resource: SourceTruthResource, body: unknown): void {
    switch (resource) {
      case 'dealers':
        parse(dealerSchema, body);
        return;
      case 'groups':
        parse(groupSchema, body);
        return;
      case 'products':
        parse(productSchema, body);
        return;
      case 'prices':
        parse(priceSchema, body);
        return;
      case 'overrides':
        parse(overrideSchema, body);
        return;
      case 'glossary':
        parse(glossarySchema, body);
    }
  }

  list(resource: SourceTruthResource): unknown[] {
    switch (resource) {
      case 'dealers':
        return this.knowledge.dealers();
      case 'groups':
        return this.knowledge.groups();
      case 'products':
        return this.knowledge.products();
      case 'prices':
        return this.knowledge.prices();
      case 'overrides':
        return this.knowledge.priceOverrides();
      case 'glossary':
        return this.knowledge.glossary();
    }
  }

  private async persist(resource: SourceTruthResource, id: string, body: unknown): Promise<void> {
    switch (resource) {
      case 'dealers': {
        const value = parse(dealerSchema, body);
        await this.prisma.dealer.upsert({ where: { id }, update: value, create: { id, ...value } });
        return;
      }
      case 'groups': {
        const value = parse(groupSchema, body);
        await this.prisma.group.upsert({
          where: { id },
          update: value,
          create: { id, platform: 'zalo', ...value },
        });
        return;
      }
      case 'products': {
        const value = parse(productSchema, body);
        await this.prisma.product.upsert({
          where: { sku: id },
          update: value,
          create: { sku: id, ...value },
        });
        return;
      }
      case 'prices': {
        parse(priceSchema, body);
        throw new BadRequestException(
          'Bảng giá chỉ được sửa qua lifecycle /settings/price-periods (draft → preview → activate)',
        );
      }
      case 'overrides': {
        const value = parse(overrideSchema, body);
        // Sua deal phai ghi CA nguong so luong lan thoi gian hieu luc. Truoc day `update` chi ghi
        // `price`, nen Sale sua "tu 5 cai" thanh "tu 10 cai" xong bam luu ma so cu van nguyen —
        // hong am tham, khong bao loi.
        const { dealerId, sku, ...rest } = value;
        await this.prisma.dealerPriceOverride.upsert({
          where: { dealerId_sku: { dealerId, sku } },
          update: rest,
          create: { dealerId, sku, ...rest },
        });
        return;
      }
      case 'glossary': {
        const value = parse(glossarySchema, body);
        await this.prisma.glossaryEntry.upsert({
          where: { term: id },
          update: value,
          create: { term: id, ...value },
        });
      }
    }
  }

  private async findBefore(resource: SourceTruthResource, id: string): Promise<unknown> {
    switch (resource) {
      case 'dealers':
        return this.prisma.dealer.findUnique({ where: { id } });
      case 'groups':
        return this.prisma.group.findUnique({ where: { id } });
      case 'products':
        return this.prisma.product.findUnique({ where: { sku: id } });
      case 'prices':
        return this.prisma.price.findFirst({
          where: { sku: id, period: { validMonth: currentPriceMonth(), status: 'active' } },
          include: { period: true },
        });
      case 'overrides':
        return null;
      case 'glossary':
        return this.prisma.glossaryEntry.findUnique({ where: { term: id } });
    }
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException('Du lieu nguon su that khong hop le');
  return parsed.data;
}

function normalizeActor(actor: string): string {
  const parsed = z.string().trim().min(1).max(200).safeParse(actor);
  return parsed.success ? parsed.data : 'operator';
}

function safeError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'loi database';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'loi database';
}
