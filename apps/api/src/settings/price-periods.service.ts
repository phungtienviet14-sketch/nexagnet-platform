import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditLogService } from '../audit/audit-log.service.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
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

/** Ky gia da doc SAU khi khoa hang — xem `withLockedPeriod`. */
type LockedPricePeriod = Prisma.PricePeriodGetPayload<{ include: { prices: true } }>;

interface EvaluablePricePeriod {
  validMonth: string | null;
  source: string | null;
  prices: ReadonlyArray<{ sku: string; wholesale: number }>;
}

/**
 * Luat hop le cua mot ky gia — THUAN, khong cham DB.
 *
 * Truoc day than ham nay nam thang trong `validate()`, va `activate()` goi `validate()` de cham
 * diem. Dieu do buoc `activate()` phai doc DB them mot lan NGOAI giao dich dang giu khoa, nen no
 * cham diem tren mot anh chup CU: mot `removeDraftPrice` vua commit xong khong duoc nhin thay, va
 * ky van activate voi so dong da khong con dung (Issue #121, muc 6).
 *
 * Tach ra thanh ham thuan de CA HAI duong dung chung mot luat, nhung moi ben tu chon doc dong o
 * dau: `validate()` doc ngoai giao dich (chi de xem truoc), `activate()` doc SAU khoa hang.
 */
function evaluatePricePeriod(
  period: EvaluablePricePeriod,
  products: ReadonlyArray<{ sku: string }>,
) {
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
  return {
    valid: errors.length === 0,
    errors,
    warnings: [] as string[],
    productCount: products.length,
    priceCount: period.prices.length,
  };
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
    this.persistence = persistenceOverride ?? loadFoundationEnv().PERSISTENCE;
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
    const parsed = z
      .object({ rows: importRowsSchema, overwrite: z.boolean().default(false) })
      .strict()
      .safeParse(input);
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
      .object({
        rows: importRowsSchema,
        overwrite: z.boolean().default(false),
        confirmed: z.literal(true),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Import apply cần dữ liệu hợp lệ và confirmed=true');
    this.assertWritable();
    // CUNG mot khoa hang voi ba nguoi ghi vong doi (Issue #121).
    //
    // Truoc day day la DUNG cai bay ma `removeDraftPrice` mac phai, chi o mot cua khac: doc ky va
    // kiem `status === 'draft'` nam trong `previewImport()`, con cac lenh `upsert` nam trong MOT
    // giao dich khac. Giua hai buoc do, `activate()` kip commit — va ban import ghi de gia vao
    // mot ky DA ACTIVE. Cung mot bat bien bi pha ("dong gia cua ky active/archived la su that da
    // chot"), nen phai dong bang cung mot giao thuc, khong phai bang mot co che thu hai.
    //
    // `previewImport()` van la duong CHI DOC (xem truoc, khong ghi) nen no khong can khoa.
    const preview = await this.withLockedPeriod(periodId, async (tx, period) => {
      if (period.status !== 'draft') throw new ConflictException('Chỉ được import vào kỳ draft');
      const products = await tx.product.findMany({ select: { sku: true } });
      const computed = buildPriceImportPreview(
        parsed.data.rows,
        period.prices,
        new Set(products.map((product) => product.sku)),
        parsed.data.overwrite,
      );
      if (!computed.valid) throw new BadRequestException(computed.errors);
      for (const row of parsed.data.rows) {
        await tx.price.upsert({
          where: { periodId_sku: { periodId, sku: row.sku } },
          create: { periodId, ...row },
          update: parsed.data.overwrite ? row : {},
        });
      }
      return computed;
    });
    await this.record('price_period.import.apply', periodId, actor, null, preview, requestId);
    return { periodId, preview };
  }

  /**
   * Xoa MOT dong gia khoi ky NHAP — duong duy nhat de bo mot SKU da tro vao ban nhap.
   *
   * `applyImport()` chi upsert dong gui len, khong bao gio prune dong bi bo ra, nen truoc day mot
   * ban nhap copy 19 SKU khong the rut ve 1 SKU bang bat ky thao tac nao tren UI (Issue #116).
   *
   * Fail closed theo dung thu tu: ky phai ton tai -> phai la `draft` -> dong phai thuoc chinh ky
   * do. Ky `active`/`archived` la su that nghiep vu da chot: khong xoa dong cua chung, va cung
   * khong co duong hard-delete ca ky.
   */
  async removeDraftPrice(periodId: string, sku: string, actor: string, requestId: string | null) {
    this.assertWritable();
    const parsedSku = z.string().trim().min(1).max(128).safeParse(sku);
    if (!parsedSku.success) throw new BadRequestException('SKU cần xóa không hợp lệ');
    // Kiem trang thai VA xoa nam trong CUNG mot giao dich da khoa hang ky (Issue #121): neu mot
    // `activate`/`archive` dang chay, ta cho no commit roi doc lai — va luc do `status` khong con
    // la `draft` nua, nen khong bao gio xoa duoc dong khoi mot ky da ACTIVE/ARCHIVED.
    const { row, remaining } = await this.withLockedPeriod(periodId, async (tx, period) => {
      if (period.status !== 'draft') {
        throw new ConflictException('Chỉ được xóa dòng giá khỏi kỳ nháp');
      }
      const found = period.prices.find((price) => price.sku === parsedSku.data);
      if (!found) {
        throw new NotFoundException(`Kỳ nháp này không có dòng giá cho SKU ${parsedSku.data}`);
      }
      // `deleteMany` chu khong phai `delete`: hai lan bam Xoa cung luc thi lan sau chi dem duoc 0
      // dong roi tra 404 that tha — thay vi de Prisma P2025 noi len thanh 500 cho mot lan thu lai
      // binh thuong (Issue #116 yeu cau ro dieu nay). Duoi khoa hang, lan thu hai thuc te da thay
      // dong bien mat o `find` ben tren; nhanh nay giu lai lam luoi thu hai.
      const deleted = await tx.price.deleteMany({ where: { periodId, sku: found.sku } });
      if (deleted.count === 0) {
        throw new NotFoundException(`Kỳ nháp này không có dòng giá cho SKU ${parsedSku.data}`);
      }
      return { row: found, remaining: period.prices.length - 1 };
    });
    await this.record('price_period.price.remove', periodId, actor, row, null, requestId);
    // KHONG goi `knowledge.reload()`: ban nhap chua bao gio nam trong snapshot nghiep vu
    // (`loadSnapshot()` chi doc ky active dung thang hien hanh), nen xoa dong nhap khong doi gia
    // dang chay. Reload o day chi lam cham va tao mot lan doc DB khong co ly do.
    return { periodId, sku: row.sku, removed: true, remaining };
  }

  async validate(periodId: string) {
    this.assertWritable();
    const period = await this.period(periodId);
    const products = await this.prisma.product.findMany({ select: { sku: true } });
    return evaluatePricePeriod(period, products);
  }

  async activate(periodId: string, actor: string, requestId: string | null) {
    this.assertWritable();
    const activatedAt = new Date();
    // Kiem trang thai, CHAM DIEM HOP LE va ghi — tat ca sau CUNG mot khoa hang (Issue #121).
    // Diem then chot: `evaluatePricePeriod` chay tren `period.prices` doc SAU khoa, khong phai
    // tren mot anh chup doc truoc do. Neu mot `removeDraftPrice` vua thang, ta thay so dong DA
    // GIAM va tu choi activate neu thieu SKU — thay vi activate mot ky theo du lieu cu.
    const { before, after } = await this.withLockedPeriod(periodId, async (tx, period) => {
      if (period.status !== 'draft') throw new ConflictException('Chỉ kỳ draft mới được activate');
      const testOnly = isTestOnlyPeriod(period.source);
      if (testOnly && loadFoundationEnv().DATA_CLASSIFICATION !== 'test') {
        throw new ConflictException(
          'Kỳ giá test-only chỉ được activate trong môi trường dữ liệu TEST',
        );
      }
      const products = await tx.product.findMany({ select: { sku: true } });
      const result = evaluatePricePeriod(period, products);
      if (!result.valid || !period.validMonth) throw new BadRequestException(result.errors);
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
      const activated = await tx.pricePeriod.update({
        where: { id: periodId },
        data: { status: 'active', activatedAt, activatedBy: actorName(actor) },
      });
      return { before: period, after: activated };
    });
    await this.record('price_period.activate', periodId, actor, before, after, requestId);
    await this.knowledge.reload();
    return after;
  }

  async archive(periodId: string, actor: string, requestId: string | null) {
    this.assertWritable();
    // Cung mot khoa hang voi `removeDraftPrice`/`activate` (Issue #121): mot `remove` dang cho se
    // doc lai trang thai `archived` sau khi ta commit, va bi tu choi — khong xoa duoc dong khoi
    // mot ky DA LUU TRU.
    const { before, after } = await this.withLockedPeriod(periodId, async (tx, period) => {
      if (period.status !== 'active' && period.status !== 'draft') {
        throw new ConflictException('Chỉ kỳ active hoặc draft mới được archive');
      }
      const archived = await tx.pricePeriod.update({
        where: { id: periodId },
        data: { status: 'archived' },
      });
      return { before: period, after: archived };
    });
    await this.record('price_period.archive', periodId, actor, before, after, requestId);
    await this.knowledge.reload();
    return after;
  }

  private async period(id: string) {
    const period = await this.prisma.pricePeriod.findUnique({
      where: { id },
      include: { prices: { orderBy: { sku: 'asc' } } },
    });
    if (!period) throw new NotFoundException('Không tìm thấy kỳ giá');
    return period;
  }

  /**
   * GIAO THUC DUY NHAT cho moi nguoi ghi vong doi cua mot ky gia (Issue #121).
   *
   * Ba nguoi ghi — `removeDraftPrice`, `activate`, `archive` — deu la `check-then-act`: doc trang
   * thai, quyet dinh theo trang thai do, roi ghi. Truoc ban va ca ba doc NGOAI giao dich, nen ho
   * xen duoc vao nhau:
   *
   *     T1 removeDraftPrice doc  status=draft
   *     T2 activate         commit status=active
   *     T1 deleteMany            -> xoa mot dong khoi ky DA ACTIVE
   *
   * MOT `$transaction` THUONG KHONG DU. Muc co lap mac dinh cua Postgres la `READ COMMITTED`:
   * hai giao dich van doc duoc CUNG mot anh chup cu roi ca hai cung ghi de. Boc hai lan di DB vao
   * mot giao dich chi thu hep cua so, khong dong duoc no.
   *
   * `SELECT ... FOR UPDATE` tren dung hang `PricePeriod` bat nguoi thu hai CHO cho toi khi nguoi
   * thu nhat commit, roi no doc LAI hang moi. Nho vay `period` tra ve duoi day luon la trang thai
   * DA CHOT cua ben thang — khong bao gio la anh chup truoc do. Ca ba nguoi ghi khoa CUNG MOT
   * hang nen ho xep hang voi nhau; do la ly do ca ba bat buoc phai di qua ham nay.
   *
   * Cung mau voi `PrismaOrdersRepository.compareAndSet` va cac kho transport (fuel/settlement).
   */
  private async withLockedPeriod<T>(
    periodId: string,
    work: (tx: Prisma.TransactionClient, period: LockedPricePeriod) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Khoa TRUOC khi doc. Doc roi moi khoa thi van la check-then-act, chi hep cua so hon.
      await tx.$executeRaw`SELECT "id" FROM "PricePeriod" WHERE "id" = ${periodId} FOR UPDATE`;
      const period = await tx.pricePeriod.findUnique({
        where: { id: periodId },
        include: { prices: { orderBy: { sku: 'asc' } } },
      });
      if (!period) throw new NotFoundException('Không tìm thấy kỳ giá');
      return work(tx, period);
    });
  }

  private assertWritable(): void {
    if (this.persistence !== 'prisma') {
      throw new ServiceUnavailableException('Quản lý kỳ giá cần PERSISTENCE=prisma');
    }
  }

  private async record(
    action: string,
    id: string,
    actor: string,
    before: unknown,
    after: unknown,
    requestId: string | null,
  ) {
    await this.audit.append({
      actor: actorName(actor),
      action,
      entityType: 'PricePeriod',
      entityId: id,
      before,
      after,
      requestId,
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
