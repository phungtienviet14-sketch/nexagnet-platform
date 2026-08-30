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
 * Ky tu ngan cach cua danh tinh ghep mot deal rieng tren URL: `PUT .../overrides/dealer-A:ELNI`.
 * Khai o DUNG mot cho, va chi `overrideId()` duoc dung no.
 */
const OVERRIDE_ID_SEPARATOR = ':';

/**
 * `dealerId` cua mot deal rieng khong duoc chua dau ngan cach.
 *
 * Khong phai vi database cam, ma vi chuoi danh tinh ghep bang dau hai cham thi phai doc nguoc ra
 * duoc DUNG mot cap:
 *
 * ```text
 * dealerId "region:a" + sku "ELNI"    ->  "region:a:ELNI"
 * dealerId "region"   + sku "a:ELNI"  ->  "region:a:ELNI"   <- cung chuoi, HAI ban ghi khac nhau
 * ```
 *
 * Duong GHI da het nhap nhang tu khi `CanonicalIdentity` mang khoa di thang tu than tin. Nhung
 * NHAT KY thi van luu mot chuoi, va nhat ky la thu duy nhat tra loi duoc "gia nay ai doi, doi luc
 * nao" khi mot don sai da ra toi khach — no khong duoc phep tro toi hai ban ghi. Nen cong nay tu
 * choi thang: ma dai ly co dau hai cham thi khong sua deal qua duong nay duoc, va nguoi van hanh
 * biet ngay, thay vi phat hien sau nay rang mot dong nhat ky khong xac dinh duoc ban ghi nao.
 */
const overrideDealerIdSchema = idSchema.refine(
  (value) => !value.includes(OVERRIDE_ID_SEPARATOR),
  { message: `dealerId khong duoc chua "${OVERRIDE_ID_SEPARATOR}"` },
);

/**
 * Deal rieng day du: ngoai gia con co NGUONG SO LUONG va THOI GIAN HIEU LUC — ba thu Sale phai
 * nhap duoc, neu khong thi deal chi dung duoc mot nua (vd "lay 5 cai moi duoc gia nay, ap tu
 * 01/08 den 31/08"). Bo trong = khong gioi han.
 */
const overrideSchema = z
  .object({
    dealerId: overrideDealerIdSchema,
    sku: idSchema,
    /**
     * `positive()` chu khong phai `nonnegative()` nhu `moneySchema` chung: mot deal gia 0d khong
     * phai mot deal, do la mot o de trong bi nhan nham — va no se gui cho khach mot xac nhan
     * "0d/SP". Bang gia chung van dung `moneySchema` nhu cu; chi cong nay siet lai (Issue #77 §5).
     */
    price: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    /** ASM-03 (Issue #77): bo trong -> GHI SO 1, khong de NULL lam mot gia dinh khong ai ky ten. */
    minQuantity: z.coerce.number().int().positive().default(1),
    effectiveFrom: z.coerce.date().nullish(),
    effectiveTo: z.coerce.date().nullish(),
    enabled: z.boolean().optional(),
  })
  .strict()
  // Cua so dai 0 giay khong phai mot deal — no la mot deal khong bao gio ap duoc.
  .refine(
    (value) =>
      !value.effectiveFrom ||
      !value.effectiveTo ||
      value.effectiveTo.getTime() > value.effectiveFrom.getTime(),
    { message: 'effectiveTo phải sau effectiveFrom', path: ['effectiveTo'] },
  );
const glossarySchema = z.object({ meaning: z.string().trim().min(1).max(1_000) }).strict();

type SimpleSourceTruthResource = Exclude<SourceTruthResource, 'overrides'>;

/**
 * DANH TINH CHINH TAC cua ban ghi sap bi ghi — mot gia tri duy nhat cho `findBefore`, `persist`
 * va audit.
 *
 * Diem quan trong: day la mot CAU TRUC, khong phai mot chuoi. Voi `overrides`, khoa tu nhien
 * (`dealerId`, `sku`) di THANG tu than tin da validate xuong database. Ban truoc tra ve chuoi
 * `dealerId:sku` roi buoc ghi TACH chuoi do ra lai — tuc danh tinh duoc ma hoa mot lan roi giai
 * ma mot lan nua, va hai lan do co the ra hai ket qua khac nhau (xem `overrideDealerIdSchema`).
 * Gio khong con buoc giai ma nao: `entityId` chi de NGUOI doc trong nhat ky.
 */
type CanonicalIdentity =
  | { readonly resource: SimpleSourceTruthResource; readonly entityId: string }
  | {
      readonly resource: 'overrides';
      readonly entityId: string;
      readonly dealerId: string;
      readonly sku: string;
    };

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

    // MOT danh tinh cho ca ba buoc. Xem `canonicalIdentity`: truoc ban nay, `findBefore` doc theo
    // ID tren URL, `persist` ghi theo `dealerId`/`sku` trong THAN, con audit ghi lai ID tren URL —
    // ba noi, ba nguon danh tinh. Gio chi con mot gia tri, va no di qua ca ba.
    const identity = this.canonicalIdentity(resource, entityId.data, body);

    const before = await this.findBefore(identity);
    try {
      await this.persist(identity, body);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Khong the ghi ${resource}: ${safeError(error)}`);
    }
    await this.audit.append({
      actor: normalizeActor(actor),
      action: 'source_truth.update',
      entityType: resource,
      entityId: identity.entityId,
      before,
      after: body,
      requestId,
    });
    await this.knowledge.reload();
    return this.list(resource);
  }

  /**
   * DANH TINH CHINH TAC cua ban ghi sap bi ghi — mot gia tri duy nhat cho `findBefore`,
   * `persist` va audit.
   *
   * Voi nam tai nguyen dau, danh tinh nam TRON VEN tren URL: than tin khong mang khoa nao. Rieng
   * `overrides` thi than mang CA `dealerId` lan `sku` — tuc co HAI nguon danh tinh cho cung mot
   * thao tac, va truoc ban nay ba buoc doc ba nguon khac nhau:
   *
   * ```text
   * PUT /settings/source-truth/overrides/dealer-A:ELNI   { dealerId: "dealer-B", sku: "FELIX" }
   *   findBefore()  doc   dealer-A / ELNI      <- URL
   *   persist()     ghi   dealer-B / FELIX     <- THAN
   *   audit()       ghi   dealer-A / ELNI      <- URL
   * ```
   *
   * Nhat ky noi mot ban ghi da doi, trong khi ban ghi that su doi la mot ban ghi KHAC. Do khong
   * phai mot loi hien thi: nhat ky la thu duy nhat tra loi duoc "gia nay ai doi, doi luc nao" khi
   * mot don sai di ra toi khach, va o day no tra loi SAI mot cach tu tin.
   *
   * Cong nay FAIL CLOSED chu khong tu chon ben nao: URL noi mot dang, than noi mot dang, thi
   * khong dang nao dung — do la mot loi cua noi goi, va doan y no se lam mot trong hai cau tren
   * thanh loi noi doi.
   */
  private canonicalIdentity(
    resource: SourceTruthResource,
    routeId: string,
    body: unknown,
  ): CanonicalIdentity {
    if (resource !== 'overrides') return { resource, entityId: routeId };

    const value = parse(overrideSchema, body);
    const entityId = overrideId(value.dealerId, value.sku);
    if (entityId !== routeId) {
      throw new BadRequestException(
        `ID tren duong dan (${routeId}) khong khop dealerId/sku trong than tin (${entityId})`,
      );
    }
    // Khoa di tiep duoi dang HAI TRUONG. Khong noi nao duoi day tach lai `entityId` ra nua.
    return { resource, entityId, dealerId: value.dealerId, sku: value.sku };
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

  private async persist(identity: CanonicalIdentity, body: unknown): Promise<void> {
    switch (identity.resource) {
      case 'dealers': {
        const value = parse(dealerSchema, body);
        const id = identity.entityId;
        await this.prisma.dealer.upsert({ where: { id }, update: value, create: { id, ...value } });
        return;
      }
      case 'groups': {
        const value = parse(groupSchema, body);
        const id = identity.entityId;
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
          where: { sku: identity.entityId },
          update: value,
          create: { sku: identity.entityId, ...value },
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
        //
        // Khoa lay TU danh tinh chinh tac, va no den day duoi dang hai truong chu khong phai mot
        // chuoi phai tach ra — nen khong con buoc nao co the tach lech.
        const { dealerId, sku } = identity;
        const { dealerId: _dealerId, sku: _sku, ...rest } = value;
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
          where: { term: identity.entityId },
          update: value,
          create: { term: identity.entityId, ...value },
        });
      }
    }
  }

  private async findBefore(identity: CanonicalIdentity): Promise<unknown> {
    switch (identity.resource) {
      case 'dealers':
        return this.prisma.dealer.findUnique({ where: { id: identity.entityId } });
      case 'groups':
        return this.prisma.group.findUnique({ where: { id: identity.entityId } });
      case 'products':
        return this.prisma.product.findUnique({ where: { sku: identity.entityId } });
      case 'prices':
        return this.prisma.price.findFirst({
          where: {
            sku: identity.entityId,
            period: { validMonth: currentPriceMonth(), status: 'active' },
          },
          include: { period: true },
        });
      case 'overrides': {
        /*
         * Truoc day tra thang `null`: moi lan Sale sua mot deal, audit ghi lai "truoc = khong co
         * gi". Tuc la lich su khong tra loi duoc cau hoi duy nhat ma nguoi ta se hoi khi gia sai —
         * "gia truoc do la bao nhieu, ai doi, doi luc nao". Issue #77 §5 doi ban cap nhat phai
         * duoc audit THAT.
         *
         * Khoa lay tu danh tinh chinh tac — CUNG hai truong ma `persist` sap ghi. Doc mot ban ghi
         * roi ghi len mot ban ghi khac chinh la ca hong ma cong danh tinh nay sinh ra de chan.
         */
        return this.prisma.dealerPriceOverride.findUnique({
          where: { dealerId_sku: { dealerId: identity.dealerId, sku: identity.sku } },
        });
      }
      case 'glossary':
        return this.prisma.glossaryEntry.findUnique({ where: { term: identity.entityId } });
    }
  }
}

/**
 * Ghep danh tinh mot deal rieng thanh chuoi cho URL va nhat ky. KHONG co ham nguoc lai — do la
 * chu y: he thong chi ghep MOT chieu, con khoa that su di xuong database luon o dang hai truong
 * (`CanonicalIdentity`). Controller cung goi dung ham nay, de duong tao moi va duong sua khong
 * the ghep lech nhau.
 */
export function overrideId(dealerId: string, sku: string): string {
  return `${dealerId}${OVERRIDE_ID_SEPARATOR}${sku}`;
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
