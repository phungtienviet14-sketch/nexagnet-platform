import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
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

/** Bon cot gia + ma hang: dung nhung truong quyet dinh gia cua mot don, khong hon. */
export interface FingerprintablePriceRow {
  readonly sku: string;
  readonly wholesale: number;
  readonly minRetailPrice?: number | null;
  readonly retailPrice?: number | null;
  readonly listPrice?: number | null;
}

/**
 * DAU VAN TAY CHUAN HOA cua toan bo dong gia trong mot ky — nguon su that de doi chieu
 * "cai da xem" voi "cai sap kich hoat" (Issue #132).
 *
 * Vi sao phai tinh o MAY CHU chu khong nhan dau do trinh duyet gui len: dau van tay o day la
 * BIEN GIOI DUNG DAN, khong phai mot tien ich giao dien. Mot dau do client tu bia thi khong
 * chan duoc gi ca — no chi noi "trinh duyet nghi rang" chu khong noi "trong co so du lieu co gi".
 *
 * Chuan hoa phai TUONG MINH va ON DINH, vi hai lan doc cung mot ky phai ra cung mot dau:
 *  - sap theo `sku` — thu tu tra ve cua co so du lieu khong duoc lam doi dau;
 *  - o TRONG (`null`/`undefined`) ghi thanh `null` cua JSON, phan biet han voi so `0` — "chua
 *    co gia" va "gia bang 0" la hai su that khac nhau;
 *  - bam SHA-256 de token ngan va khong lo noi dung gia ra ngoai qua URL/log.
 *
 * KHONG gom `id` cua dong (may chu cap, doi sau moi lan ghi lai ma khong doi nghia nghiep vu)
 * va KHONG gom `periodId` (dau van tay noi ve NOI DUNG, khong noi ve cho chua no).
 */
export function pricePeriodRowsFingerprint(rows: readonly FingerprintablePriceRow[]): string {
  // JSON hoa chu khong noi chuoi bang dau phan cach tu chon: `sku` la chuoi tu do toi 128 ky tu,
  // nen bat ky dau phan cach nao cung co the nam TRONG mot ma hang va lam hai ky khac noi dung
  // ra cung mot dau. JSON tu thoat ky tu nen phep ma hoa la mot-doi-mot.
  const canonical = JSON.stringify(
    rows
      .map((row) => [
        row.sku,
        row.wholesale,
        // `null` va `0` phai khac nhau: "chua co gia" va "gia bang 0" la hai su that khac han.
        row.minRetailPrice ?? null,
        row.retailPrice ?? null,
        row.listPrice ?? null,
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]), 'en')),
  );
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);
}

/**
 * Khong gian khoa advisory cua "mot thang gia" (Issue #122).
 *
 * Dung DANG HAI THAM SO `pg_advisory_xact_lock(int4, int4)` chu khong phai dang mot `bigint`:
 * Postgres coi hai dang la HAI khong gian khoa RIENG BIET, nen khoa o day khong the dam vao
 * `2071164281` (chien dich) hay `2071164282` (outbox) du con so co gan nhau den may.
 */
const PRICE_PERIOD_MONTH_LOCK_NAMESPACE = 2_071_164_283;

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
  const missing = products
    .filter((product) => !bySku.has(product.sku))
    .map((product) => product.sku);
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

  /**
   * Cham diem mot ky, VA tra ve chinh dong da luu cung dau van tay cua chung (Issue #132).
   *
   * Truoc day ham nay chi tra ve `valid/errors`, nen man Xem lai phia trinh duyet phai ve lai
   * bang mang dang soan cua chinh no. Hai thu do co the LECH: `applyImport()` chi upsert va
   * khong bao gio prune, nen mot lan nap hang loat chi co A vao mot ky dang co A+B se de lai B
   * tren may chu — nguoi dung xem A roi kich hoat A+B.
   *
   * Tra ve `rows` o day de man Xem lai duoc dung tu SU THAT DA LUU, con `fingerprint` la the
   * ma buoc kich hoat phai xuat trinh lai.
   */
  async validate(periodId: string) {
    this.assertWritable();
    const period = await this.period(periodId);
    const products = await this.prisma.product.findMany({ select: { sku: true } });
    return {
      ...evaluatePricePeriod(period, products),
      fingerprint: pricePeriodRowsFingerprint(period.prices),
      rows: period.prices.map((row) => ({
        sku: row.sku,
        wholesale: row.wholesale,
        minRetailPrice: row.minRetailPrice,
        retailPrice: row.retailPrice,
        listPrice: row.listPrice,
      })),
    };
  }

  /**
   * @param expectedFingerprint Dau van tay cua dong gia ma NGUOI DUNG DA XEM o buoc Xem lai.
   *   Bat buoc: khong ai duoc kich hoat mot ky ma khong noi duoc minh da doc noi dung nao.
   */
  async activate(
    periodId: string,
    expectedFingerprint: string,
    actor: string,
    requestId: string | null,
  ) {
    this.assertWritable();
    const activatedAt = new Date();
    // Kiem trang thai, CHAM DIEM HOP LE va ghi — tat ca sau CUNG mot khoa hang (Issue #121).
    // Diem then chot: `evaluatePricePeriod` chay tren `period.prices` doc SAU khoa, khong phai
    // tren mot anh chup doc truoc do. Neu mot `removeDraftPrice` vua thang, ta thay so dong DA
    // GIAM va tu choi activate neu thieu SKU — thay vi activate mot ky theo du lieu cu.
    //
    // Va sau khoa cua CA THANG (Issue #122). Day la nguoi ghi DUY NHAT can no, vi day la nguoi
    // ghi duy nhat quyet dinh dua tren "thang nay dang co ky nao": phep kiem test-only ngay ben
    // duoi, va buoc `updateMany` luu tru cac ky cu. Thieu khoa thang thi hai phep do doc mot anh
    // chup cu — ket qua that lai do `PricePeriod_one_active_per_month` cua database quyet dinh,
    // va ben thua nhan mot P2002 tran trui thay vi mot cau tu choi doc duoc.
    const { before, after } = await this.withLockedMonth(periodId, async (tx, period) => {
      if (period.status !== 'draft') throw new ConflictException('Chỉ kỳ draft mới được activate');
      // BUOC RANG BUOC cua Issue #132 — dat TRUOC moi phep kiem khac, va o day chu khong o cho
      // nao khac, vi day la cho duy nhat `period.prices` duoc doc SAU khi da giu khoa hang.
      //
      // Khoa hang cua #121/#122 giu cho vong doi khong hong, nhung no khong tra loi duoc cau hoi
      // cua con nguoi: "cai toi vua doc co dung la cai sap ap dung khong?". Mot nguoi khac sua
      // ban nhap thanh mot bo gia KHAC MA VAN HOP LE trong luc minh dang doc man Xem lai thi moi
      // phep kiem con lai deu xanh — va ky duoc kich hoat theo noi dung chua ai duyet.
      //
      // So sanh dau van tay o day bien chuyen do thanh mot cau tu choi doc duoc, thay vi mot lan
      // kich hoat im lang sai noi dung.
      const actualFingerprint = pricePeriodRowsFingerprint(period.prices);
      if (actualFingerprint !== expectedFingerprint) {
        throw new ConflictException(
          'Bảng giá đã thay đổi sau lần kiểm tra vừa rồi, nên chưa kích hoạt. Kiểm tra lại để xem nội dung mới nhất rồi kích hoạt.',
        );
      }
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
    }).catch((error: unknown) => {
      // LUOI CUOI o tang database: `PricePeriod_one_active_per_month` (unique mot phan, tao boi
      // migration `20260812123000_price_periods`, KHONG khai trong `schema.prisma`).
      //
      // Sau khoa thang, hai `activate()` khong con dam nhau duoc nua, nen neu index van keu thi
      // nguoi ghi kia KHONG di qua duong nay — panel `/admin` sua thang truong `status` chang
      // han. Van phai tra ve mot cau nghiep vu doc duoc, khong phai P2002 noi len thanh 500.
      if (isMonthUniquenessViolation(error)) {
        throw new ConflictException(
          'Tháng này vừa có kỳ giá khác được áp dụng — tải lại rồi thử lại',
        );
      }
      throw error;
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
   * GIAO THUC KHOA — MOT THU TU DUY NHAT CHO CA HAI TANG (Issue #121 + #122).
   *
   *     1. khoa THANG   `pg_advisory_xact_lock(<khong gian>, hashtext(validMonth))`
   *     2. khoa HANG ky `SELECT ... FROM "PricePeriod" WHERE "id" = ? FOR UPDATE`
   *
   * KHONG BAO GIO DAO NGUOC. Do la toan bo phan chung minh khong-deadlock, nen no duoc viet o
   * mot cho duy nhat (ham nay) thay vi de moi nguoi ghi tu dat khoa lay.
   *
   * ---------------------------------------------------------------------------------------
   * VI SAO KHOA HANG CUA #121 KHONG DU
   *
   * `activate()` giu mot bat bien rong hon mot hang — no noi ve CA THANG: moi thang chi mot ky
   * chinh thuc ACTIVE, va khong bao gio co ky test-only ACTIVE cung luc voi ky chinh thuc. Hai
   * `activate()` cua HAI ban nhap khac nhau khoa HAI hang khac nhau, nen khoa cua #121 khong he
   * lam ho gap nhau: ca hai cung kiem "thang nay dang co gi" tren anh chup cu roi cung ghi.
   *
   * ---------------------------------------------------------------------------------------
   * VI SAO KHOA ADVISORY CHU KHONG PHAI KHOA HANG CUA CA THANG
   *
   * Cach hien nhien la `SELECT ... WHERE "validMonth" = ? ORDER BY "id" FOR UPDATE`. No chay
   * duoc, nhung yeu o hai cho:
   *
   *   · KHONG khoa duoc hang CHUA TON TAI. Mot ban nhap moi cua cung thang duoc tao sau khi ta
   *     chup xong tap hang thi khong nam trong tap do. Khoa advisory khoa CAI TEN cua thang, nen
   *     no phu ca nhung ky chua sinh ra.
   *   · Thu tu dat khoa tro thanh mot dieu phai chung minh (phai xep theo `id`, va phai chac
   *     rang khong nguoi ghi nao dat nguoc). Voi advisory chi co DUNG MOT khoa cho moi thang,
   *     nen giua hai `activate()` khong ton tai chu trinh nao de ma chung minh.
   *
   * ---------------------------------------------------------------------------------------
   * VI SAO KHONG DEADLOCK — day la dieu Issue #122 doi noi ro
   *
   * Goi `M` la khoa thang, `R(x)` la khoa hang cua ky `x`. Trong toan bo dich vu nay:
   *
   *   · `activate`                                lay `M` -> roi `R(muc tieu)` -> roi cac
   *                                               `R(ky khac cung thang)` qua `updateMany`
   *   · `removeDraftPrice` / `archive` / `applyImport`
   *                                               chi lay `R(muc tieu)`, va khong bao gio doi
   *                                               them mot khoa `PricePeriod` nao nua
   *
   * Suy ra: nguoi ghi khong-activate GIU mot khoa va KHONG DOI khoa nao khac, nen ho khong the
   * nam trong mot chu trinh cho. Con hai `activate()` cung thang thi khong bao gio cung luc giu
   * khoa hang: nguoi thu hai con dang doi `M`, tay trang. Hai `activate()` KHAC thang co hai `M`
   * khac nhau va hai tap hang roi nhau (`validMonth` nam tren chinh hang do). Khong co chu trinh
   * nao => khong co deadlock.
   *
   * Neu ai do doi thu tu thanh `R(muc tieu)` truoc roi moi `M`, chung minh tren SAP: hai giao
   * dich se giu hai hang khac nhau roi doi khoa cua nhau. Do la ly do thu tu nam o day, mot cho.
   */
  private async withLockedPeriod<T>(
    periodId: string,
    work: (tx: Prisma.TransactionClient, period: LockedPricePeriod) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => this.lockThenWork(tx, periodId, 'period', work));
  }

  /**
   * Nhu tren, nhung xep hang CA THANG truoc — chi `activate()` can, vi chi no giu bat bien theo
   * thang. `removeDraftPrice`/`archive`/`applyImport` khong the tao ra ky ACTIVE thu hai nen
   * bat chung xep hang theo thang la lam cham vo ich.
   */
  private async withLockedMonth<T>(
    periodId: string,
    work: (tx: Prisma.TransactionClient, period: LockedPricePeriod) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => this.lockThenWork(tx, periodId, 'month', work));
  }

  private async lockThenWork<T>(
    tx: Prisma.TransactionClient,
    periodId: string,
    scope: 'period' | 'month',
    work: (tx: Prisma.TransactionClient, period: LockedPricePeriod) => Promise<T>,
  ): Promise<T> {
    let lockedMonth: string | null = null;
    if (scope === 'month') {
      // Phai biet thang thi moi khoa duoc thang, nen lan doc nay BUOC PHAI di truoc khoa. No
      // khong khoa gi ca va co the cu — vi vay ben duoi con kiem lai sau khi da khoa hang.
      const peek = await tx.pricePeriod.findUnique({
        where: { id: periodId },
        select: { validMonth: true },
      });
      if (!peek) throw new NotFoundException('Không tìm thấy kỳ giá');
      lockedMonth = peek.validMonth;
      // Ky thieu `validMonth` khong co thang de tranh chap, va `activate()` tu choi no o buoc
      // cham diem ngay sau day. Khoa mot cai ten rong chi lam moi ky hong xep chung mot hang.
      if (lockedMonth) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PRICE_PERIOD_MONTH_LOCK_NAMESPACE}::int4, hashtext(${lockedMonth}))`;
      }
    }
    // Khoa TRUOC khi doc. Doc roi moi khoa thi van la check-then-act, chi hep cua so hon.
    await tx.$executeRaw`SELECT "id" FROM "PricePeriod" WHERE "id" = ${periodId} FOR UPDATE`;
    const period = await tx.pricePeriod.findUnique({
      where: { id: periodId },
      include: { prices: { orderBy: { sku: 'asc' } } },
    });
    if (!period) throw new NotFoundException('Không tìm thấy kỳ giá');
    // Hom nay khong co duong nao sua `validMonth` cua mot ky da tao, nen nhanh nay khong bao gio
    // chay. No o day de neu mai co duong do, cai hong se la mot 409 that tha chu khong phai mot
    // ky duoc chot duoi khoa cua THANG KHAC.
    if (scope === 'month' && period.validMonth !== lockedMonth) {
      throw new ConflictException('Kỳ giá vừa đổi tháng — tải lại rồi thử lại');
    }
    return work(tx, period);
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

/**
 * Co phai database vua tu choi vi "mot thang chi mot ky ACTIVE" khong?
 *
 * Prisma bao P2002 kem `meta.target` la cot cua index bi vi pham. Index o day la unique mot
 * phan tren `("validMonth") WHERE status = 'active'`, nen `target` chinh la `validMonth`.
 */
function isMonthUniquenessViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes('validMonth') : target === 'validMonth';
}

function isTestOnlyPeriod(source: string | null | undefined): boolean {
  return source === TEST_ONLY_PRICE_PERIOD_SOURCE;
}
