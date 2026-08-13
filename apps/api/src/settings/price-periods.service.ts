import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { z } from 'zod';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaService } from '../config/prisma.service.js';
import { TEST_ONLY_PRICE_PERIOD_SOURCE } from '../knowledge/domain.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { currentPriceMonth } from '../knowledge/price-periods.js';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const importRowSchema = z
  .object({
    sku: z.string().trim().min(1).max(128),
    wholesale: moneySchema,
    minRetailPrice: moneySchema.nullable().optional(),
    retailPrice: moneySchema.nullable().optional(),
    listPrice: moneySchema.nullable().optional(),
  })
  .strict();
const importRowsSchema = z.array(importRowSchema).min(1).max(10_000);
const pricePeriodDraftSchema = z
  .object({
    validMonth: monthSchema,
    note: z.string().max(500).optional(),
    testOnly: z.boolean().optional(),
  })
  .strict();
const pricePeriodCopySchema = z
  .object({ validMonth: monthSchema, note: z.string().max(500).optional() })
  .strict();

export type PriceImportRow = z.infer<typeof importRowSchema>;
export interface PriceImportPreview {
  valid: boolean;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  warnings: string[];
  diff: Array<{ sku: string; action: 'create' | 'update'; before: unknown; after: PriceImportRow }>;
}

function samePrice(left: PriceImportRow, right: PriceImportRow): boolean {
  return (['wholesale', 'minRetailPrice', 'retailPrice', 'listPrice'] as const).every(
    (key) => (left[key] ?? null) === (right[key] ?? null),
  );
}

/** Pure preview: validate/diff first; rerun same import becomes unchanged, never duplicates. */
export function buildPriceImportPreview(
  incoming: readonly PriceImportRow[],
  existing: readonly PriceImportRow[],
  productSkus: ReadonlySet<string>,
  overwrite = false,
): PriceImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const row of incoming) {
    if (seen.has(row.sku)) duplicate.add(row.sku);
    seen.add(row.sku);
    if (!productSkus.has(row.sku)) errors.push(`SKU không tồn tại trong danh mục: ${row.sku}`);
  }
  if (duplicate.size > 0) errors.push(`SKU trùng trong file import: ${[...duplicate].join(', ')}`);

  const current = new Map(existing.map((row) => [row.sku, row]));
  const diff: PriceImportPreview['diff'] = [];
  let unchanged = 0;
  let created = 0;
  let updated = 0;
  for (const row of incoming) {
    const before = current.get(row.sku);
    if (!before) {
      created += 1;
      diff.push({ sku: row.sku, action: 'create', before: null, after: row });
      continue;
    }
    if (samePrice(before, row)) {
      unchanged += 1;
      continue;
    }
    if (!overwrite) {
      errors.push(`SKU ${row.sku} đã được operator sửa; cần overwrite=true để ghi đè có chủ ý`);
      continue;
    }
    updated += 1;
    diff.push({ sku: row.sku, action: 'update', before, after: row });
  }
  return { valid: errors.length === 0, created, updated, unchanged, errors, warnings, diff };
}

@Injectable()
export class PricePeriodsService {
  private readonly persistence: 'memory' | 'prisma';

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly knowledge: KnowledgeService,
    @Optional() persistenceOverride?: 'memory' | 'prisma',
  ) {
    this.persistence = persistenceOverride ?? loadEnv().PERSISTENCE;
  }

  async list() {
    this.assertWritable();
    const periods = await this.prisma.pricePeriod.findMany({
      include: { prices: { orderBy: { sku: 'asc' } }, _count: { select: { prices: true } } },
      orderBy: [{ validMonth: 'desc' }, { createdAt: 'desc' }],
    });
    const currentMonth = currentPriceMonth();
    return {
      currentMonth,
      currentPeriodId:
        periods.find(
          (period) =>
            period.validMonth === currentMonth &&
            period.status === 'active' &&
            !isTestOnlyPeriod(period.source),
        )?.id ?? null,
      testOnlyCurrentPeriodId:
        periods.find(
          (period) =>
            period.validMonth === currentMonth &&
            period.status === 'active' &&
            isTestOnlyPeriod(period.source),
        )?.id ?? null,
      missingCurrentPeriod: !periods.some(
        (period) =>
          period.validMonth === currentMonth &&
          period.status === 'active' &&
          !isTestOnlyPeriod(period.source),
      ),
      periods,
    };
  }

  async createDraft(input: unknown, actor: string, requestId: string | null) {
    this.assertWritable();
    const parsed = pricePeriodDraftSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Kỳ giá phải có validMonth dạng YYYY-MM');
    const { testOnly, ...draft } = parsed.data;
    const period = await this.prisma.pricePeriod.create({
      data: {
        ...draft,
        status: 'draft',
        source: testOnly ? TEST_ONLY_PRICE_PERIOD_SOURCE : 'operator',
        createdBy: actorName(actor),
      },
      include: { prices: true },
    });
    await this.record('price_period.create', period.id, actor, null, period, requestId);
    return period;
  }

  async copyDraft(sourceId: string, input: unknown, actor: string, requestId: string | null) {
    this.assertWritable();
    const parsed = pricePeriodCopySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Kỳ đích phải có validMonth dạng YYYY-MM');
    const draft = parsed.data;
    const source = await this.period(sourceId);
    const period = await this.prisma.pricePeriod.create({
      data: {
        validMonth: draft.validMonth,
        note: draft.note,
        status: 'draft',
        source: `copy:${source.id}`,
        createdBy: actorName(actor),
        prices: {
          create: source.prices.map((row) => ({
            sku: row.sku,
            wholesale: row.wholesale,
            minRetailPrice: row.minRetailPrice,
            retailPrice: row.retailPrice,
            listPrice: row.listPrice,
          })),
        },
      },
      include: { prices: true },
    });
    await this.record('price_period.copy', period.id, actor, { sourceId }, period, requestId);
    return period;
  }

  async previewImport(periodId: string, input: unknown): Promise<PriceImportPreview> {
    this.assertWritable();
    const parsed = z.object({ rows: importRowsSchema, overwrite: z.boolean().default(false) }).strict().safeParse(input);
    if (!parsed.success) throw new BadRequestException('Dữ liệu import bảng giá không hợp lệ');
    const period = await this.period(periodId);
    if (period.status !== 'draft') throw new ConflictException('Chỉ được import vào kỳ draft');
    const products = await this.prisma.product.findMany({ select: { sku: true } });
    return buildPriceImportPreview(
      parsed.data.rows,
      period.prices,
      new Set(products.map((product) => product.sku)),
      parsed.data.overwrite,
    );
  }

  async applyImport(periodId: string, input: unknown, actor: string, requestId: string | null) {
    const parsed = z
      .object({ rows: importRowsSchema, overwrite: z.boolean().default(false), confirmed: z.literal(true) })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new BadRequestException('Import apply cần dữ liệu hợp lệ và confirmed=true');
    const preview = await this.previewImport(periodId, {
      rows: parsed.data.rows,
      overwrite: parsed.data.overwrite,
    });
    if (!preview.valid) throw new BadRequestException(preview.errors);
    await this.prisma.$transaction(
      parsed.data.rows.map((row) =>
        this.prisma.price.upsert({
          where: { periodId_sku: { periodId, sku: row.sku } },
          create: { periodId, ...row },
          update: parsed.data.overwrite ? row : {},
        }),
      ),
    );
    await this.record('price_period.import.apply', periodId, actor, null, preview, requestId);
    return { periodId, preview };
  }

  async validate(periodId: string) {
    this.assertWritable();
    const period = await this.period(periodId);
    const products = await this.prisma.product.findMany({ select: { sku: true } });
    const bySku = new Map(period.prices.map((price) => [price.sku, price]));
    const errors: string[] = [];
    if (!period.validMonth || !monthSchema.safeParse(period.validMonth).success) {
      errors.push('Kỳ giá thiếu validMonth YYYY-MM hợp lệ');
    }
    const missing = products.filter((product) => !bySku.has(product.sku)).map((product) => product.sku);
    if (isTestOnlyPeriod(period.source)) {
      if (period.prices.length < 1 || period.prices.length > 2) {
        errors.push('Kỳ giá test-only chỉ được có 1-2 SKU để smoke pre-pilot');
      }
    } else if (missing.length > 0) {
      errors.push(`Thiếu giá cho SKU: ${missing.join(', ')}`);
    }
    const invalid = period.prices.filter((price) => price.wholesale <= 0).map((price) => price.sku);
    if (invalid.length > 0) errors.push(`Wholesale phải lớn hơn 0: ${invalid.join(', ')}`);
    return { valid: errors.length === 0, errors, warnings: [], productCount: products.length, priceCount: period.prices.length };
  }

  async activate(periodId: string, actor: string, requestId: string | null) {
    this.assertWritable();
    const period = await this.period(periodId);
    if (period.status !== 'draft') throw new ConflictException('Chỉ kỳ draft mới được activate');
    const testOnly = isTestOnlyPeriod(period.source);
    if (testOnly && loadEnv().DATA_CLASSIFICATION !== 'test') {
      throw new ConflictException('Kỳ giá test-only chỉ được activate trong môi trường dữ liệu TEST');
    }
    const result = await this.validate(periodId);
    if (!result.valid || !period.validMonth) throw new BadRequestException(result.errors);
    const activatedAt = new Date();
    const activated = await this.prisma.$transaction(async (tx) => {
      if (testOnly) {
        const productionPeriod = await tx.pricePeriod.findFirst({
          where: {
            validMonth: period.validMonth,
            status: 'active',
            NOT: { source: TEST_ONLY_PRICE_PERIOD_SOURCE },
          },
          select: { id: true },
        });
        if (productionPeriod) {
          throw new ConflictException(
            'Không activate kỳ test-only khi đã có kỳ production active cùng tháng',
          );
        }
      }
      await tx.pricePeriod.updateMany({
        where: {
          validMonth: period.validMonth,
          status: 'active',
          NOT: { id: periodId },
          ...(testOnly ? { source: TEST_ONLY_PRICE_PERIOD_SOURCE } : {}),
        },
        data: { status: 'archived' },
      });
      return tx.pricePeriod.update({
        where: { id: periodId },
        data: { status: 'active', activatedAt, activatedBy: actorName(actor) },
      });
    });
    await this.record('price_period.activate', periodId, actor, period, activated, requestId);
    await this.knowledge.reload();
    return activated;
  }

  async archive(periodId: string, actor: string, requestId: string | null) {
    this.assertWritable();
    const period = await this.period(periodId);
    if (period.status !== 'active' && period.status !== 'draft') {
      throw new ConflictException('Chỉ kỳ active hoặc draft mới được archive');
    }
    const archived = await this.prisma.pricePeriod.update({
      where: { id: periodId },
      data: { status: 'archived' },
    });
    await this.record('price_period.archive', periodId, actor, period, archived, requestId);
    await this.knowledge.reload();
    return archived;
  }

  private async period(id: string) {
    const period = await this.prisma.pricePeriod.findUnique({
      where: { id },
      include: { prices: { orderBy: { sku: 'asc' } } },
    });
    if (!period) throw new NotFoundException('Không tìm thấy kỳ giá');
    return period;
  }

  private assertWritable(): void {
    if (this.persistence !== 'prisma') {
      throw new ServiceUnavailableException('Quản lý kỳ giá cần PERSISTENCE=prisma');
    }
  }

  private async record(action: string, id: string, actor: string, before: unknown, after: unknown, requestId: string | null) {
    await this.audit.append({
      actor: actorName(actor), action, entityType: 'PricePeriod', entityId: id, before, after, requestId,
    });
  }
}

function actorName(actor: string): string {
  const parsed = z.string().trim().min(1).max(200).safeParse(actor);
  return parsed.success ? parsed.data : 'operator';
}

function isTestOnlyPeriod(source: string | null | undefined): boolean {
  return source === TEST_ONLY_PRICE_PERIOD_SOURCE;
}
