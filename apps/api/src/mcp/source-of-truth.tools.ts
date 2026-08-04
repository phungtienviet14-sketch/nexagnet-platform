import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

/**
 * LOGIC THUAN cho MCP tool "Nguon su that" (tach khoi transport de test doc lap).
 *
 * Nguyen tac (CLAUDE.md): agent/LLM KHONG tinh tien / KHONG quyet chinh sach. Cac tool nay chi
 * CRUD "hang" nguon su that (SP/gia/dai ly/nhom/glossary) — rules engine tinh tien luc chay tu
 * chinh cac hang nay. Vi vay day thuan la CRUD co validate, khong co logic gia.
 *
 * Moi ham nhan (prisma, input: unknown), TU validate bang zod, va tra KET QUA co cau truc
 * ({ ok:true, ... } | { ok:false, error }). KHONG nem loi cho input sai / thieu FK -> transport
 * chi can boc lai thanh noi dung tool.
 */

// ----- Enums (khop literal union @ultty/shared + enum Prisma) -----
export const dealerTierSchema = z.enum(['dai_ly', 'ctv']);
export const policyTypeSchema = z.enum([
  'cong_no_30',
  'cong_no_45',
  'ky_gui',
  'thanh_toan_ngay',
  'cod',
]);
export const groupStatusSchema = z.enum(['pending', 'mapped', 'ignored']);

// ----- Input schemas (zod — validate tai bien) -----
export const listGroupsInput = z.object({
  /** Loc theo trang thai map. Bo trong = tat ca. */
  status: groupStatusSchema.optional(),
});

export const upsertDealerInput = z.object({
  /** Khoa on dinh (vd "meta-hn") — nhom/override tham chieu theo id nay. */
  id: z.string().trim().min(1, 'id không được để trống'),
  name: z.string().trim().min(1, 'name không được để trống'),
  /** Ten thuong goi/viet tat dai ly hay dung (giup parser nhan dien). */
  aliases: z.array(z.string().trim().min(1)).default([]),
  tier: dealerTierSchema,
  defaultPolicy: policyTypeSchema,
  phone: z.string().trim().min(1).optional(),
});

export const mapGroupInput = z.object({
  /** external_id nhom Zalo (chatId/threadId) — KHONG phai ten nhom. */
  chatId: z.string().trim().min(1, 'chatId không được để trống'),
  dealerId: z.string().trim().min(1, 'dealerId không được để trống'),
  platform: z.string().trim().min(1).default('zalo'),
});

export const setPriceInput = z.object({
  sku: z.string().trim().min(1, 'sku không được để trống'),
  /** Don gia CTV (gia si dai ly/CTV TRA) — dong VND, so nguyen. */
  wholesale: z.number().int().nonnegative(),
  minRetailPrice: z.number().int().nonnegative().optional(),
  retailPrice: z.number().int().nonnegative().optional(),
  listPrice: z.number().int().nonnegative().optional(),
  /** Thang hieu luc, vd "2026-07". */
  validMonth: z.string().trim().min(1).optional(),
});

export const addGlossaryInput = z.object({
  term: z.string().trim().min(1, 'term không được để trống'),
  meaning: z.string().trim().min(1, 'meaning không được để trống'),
});

// ----- Ket qua tool -----
export type ToolSuccess = { ok: true; [key: string]: unknown };
export type ToolFailure = { ok: false; error: string };
export type ToolResult = ToolSuccess | ToolFailure;

function success(data: Record<string, unknown>): ToolSuccess {
  return { ...data, ok: true };
}
function failure(error: string): ToolFailure {
  return { ok: false, error };
}

type Parsed<T> = { ok: true; value: T } | ToolFailure;

/** Validate input bang zod; tra loi ro rang (tieng Viet) thay vi nem. */
function parseInput<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.infer<S>> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`)
      .join('; ');
    return failure(`Dữ liệu không hợp lệ: ${detail}`);
  }
  return { ok: true, value: result.data };
}

// ===== READ tools (giup agent nam nguon su that hien tai) =====

/** Danh muc SP kem gia si (Don gia CTV) + gia ban le tham chieu. */
export async function listProducts(prisma: PrismaClient): Promise<ToolResult> {
  const rows = await prisma.product.findMany({
    include: { price: true },
    orderBy: { sku: 'asc' },
  });
  const products = rows.map((p) => ({
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    aliases: p.aliases,
    wholesale: p.price?.wholesale ?? null,
    minRetailPrice: p.price?.minRetailPrice ?? null,
    retailPrice: p.price?.retailPrice ?? null,
    listPrice: p.price?.listPrice ?? null,
    validMonth: p.price?.validMonth ?? null,
  }));
  return success({ count: products.length, products });
}

/** Danh sach dai ly/CTV (cap + chinh sach mac dinh). */
export async function listDealers(prisma: PrismaClient): Promise<ToolResult> {
  const rows = await prisma.dealer.findMany({ orderBy: { id: 'asc' } });
  const dealers = rows.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    aliases: d.aliases,
    tier: d.tier,
    defaultPolicy: d.defaultPolicy,
    phone: d.phone,
  }));
  return success({ count: dealers.length, dealers });
}

/** Nhom Zalo (co the loc theo status). Kem ten dai ly da gan. */
export async function listGroups(prisma: PrismaClient, input: unknown): Promise<ToolResult> {
  const parsed = parseInput(listGroupsInput, input);
  if (!parsed.ok) return parsed;
  const { status } = parsed.value;
  const rows = await prisma.group.findMany({
    where: status ? { status } : {},
    include: { dealer: true },
    orderBy: { chatId: 'asc' },
  });
  const groups = rows.map((g) => ({
    chatId: g.chatId,
    platform: g.platform,
    name: g.name,
    branch: g.branch,
    status: g.status,
    dealerId: g.dealerId,
    dealerName: g.dealer?.name ?? null,
  }));
  return success({ count: groups.length, groups });
}

/** Hop thu "nhom chua map" (status=pending) — nhom moi thay, chua gan dai ly. */
export async function listUnmappedGroups(prisma: PrismaClient): Promise<ToolResult> {
  const rows = await prisma.group.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });
  const groups = rows.map((g) => ({
    chatId: g.chatId,
    platform: g.platform,
    name: g.name,
    branch: g.branch,
    lastSeenAt: g.lastSeenAt,
  }));
  return success({ count: groups.length, groups });
}

// ===== WRITE tools (validate; loi ro rang khi input sai / thieu FK) =====

/** Them/cap nhat dai ly theo id. */
export async function upsertDealer(prisma: PrismaClient, input: unknown): Promise<ToolResult> {
  const parsed = parseInput(upsertDealerInput, input);
  if (!parsed.ok) return parsed;
  const { id, name, aliases, tier, defaultPolicy, phone } = parsed.value;
  // Chi set phone khi co -> tranh xoa phone cu khi cap nhat ma khong truyen.
  const data = { name, aliases, tier, defaultPolicy, ...(phone !== undefined ? { phone } : {}) };
  const dealer = await prisma.dealer.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
  return success({
    dealer: {
      id: dealer.id,
      name: dealer.name,
      aliases: dealer.aliases,
      tier: dealer.tier,
      defaultPolicy: dealer.defaultPolicy,
      phone: dealer.phone,
    },
  });
}

/** Gan 1 nhom Zalo -> dai ly (status=mapped). Validate dai ly ton tai truoc (FK an toan). */
export async function mapGroup(prisma: PrismaClient, input: unknown): Promise<ToolResult> {
  const parsed = parseInput(mapGroupInput, input);
  if (!parsed.ok) return parsed;
  const { chatId, dealerId, platform } = parsed.value;
  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) {
    return failure(
      `Đại lý không tồn tại: "${dealerId}". Tạo đại lý bằng upsert_dealer trước, hoặc kiểm tra lại id.`,
    );
  }
  const group = await prisma.group.upsert({
    where: { platform_chatId: { platform, chatId } },
    create: { platform, chatId, dealerId, status: 'mapped', source: 'mcp' },
    update: { dealerId, status: 'mapped' },
  });
  return success({
    group: {
      chatId: group.chatId,
      platform: group.platform,
      dealerId: group.dealerId,
      dealerName: dealer.name,
      status: group.status,
    },
  });
}

/** Cap nhat bang gia cho 1 SKU. Validate SP ton tai truoc (set_price khong tao SP moi). */
export async function setPrice(prisma: PrismaClient, input: unknown): Promise<ToolResult> {
  const parsed = parseInput(setPriceInput, input);
  if (!parsed.ok) return parsed;
  const { sku, wholesale, minRetailPrice, retailPrice, listPrice, validMonth } = parsed.value;
  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    return failure(
      `Sản phẩm không tồn tại: "${sku}". set_price chỉ cập nhật giá cho SKU đã có trong danh mục.`,
    );
  }
  // Chi ghi de cac muc gia duoc truyen (giu nguyen muc khong truyen).
  const data = {
    wholesale,
    ...(minRetailPrice !== undefined ? { minRetailPrice } : {}),
    ...(retailPrice !== undefined ? { retailPrice } : {}),
    ...(listPrice !== undefined ? { listPrice } : {}),
    ...(validMonth !== undefined ? { validMonth } : {}),
  };
  const price = await prisma.price.upsert({
    where: { sku },
    create: { sku, ...data },
    update: data,
  });
  return success({
    price: {
      sku: price.sku,
      wholesale: price.wholesale,
      minRetailPrice: price.minRetailPrice,
      retailPrice: price.retailPrice,
      listPrice: price.listPrice,
      validMonth: price.validMonth,
    },
  });
}

/** Them/cap nhat 1 muc glossary (viet tat -> nghia). Upsert theo term. */
export async function addGlossary(prisma: PrismaClient, input: unknown): Promise<ToolResult> {
  const parsed = parseInput(addGlossaryInput, input);
  if (!parsed.ok) return parsed;
  const { term, meaning } = parsed.value;
  const entry = await prisma.glossaryEntry.upsert({
    where: { term },
    create: { term, meaning },
    update: { meaning },
  });
  return success({ entry: { term: entry.term, meaning: entry.meaning } });
}
