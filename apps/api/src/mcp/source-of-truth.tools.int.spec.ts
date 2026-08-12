import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import {
  addGlossary,
  listDealers,
  listGroups,
  listProducts,
  listUnmappedGroups,
  mapGroup,
  setPrice,
  upsertDealer,
} from './source-of-truth.tools.js';

/**
 * IT THAT tren Postgres cho MCP tool nguon su that — chi chay khi RUN_PRISMA_IT=1 (giong cac IT khac).
 *   docker compose up -d postgres && pnpm --filter @netviet/api exec tsx prisma/seed.ts
 *   RUN_PRISMA_IT=1 DATABASE_URL=postgresql://ultty:ultty_local@localhost:5432/ultty \
 *     pnpm --filter @netviet/api exec vitest run src/mcp/source-of-truth.tools.int.spec.ts
 *
 * Fixture rieng tien to "it-mcp-*" (KHONG dung chung du lieu seed) -> don sach hoan toan o afterAll.
 * Cac test chay tuan tu (thu tu file) — trang thai mang qua giua cac test (giong prisma-orders IT).
 */
const SKU = 'IT-MCP-SKU';
const DEALER_ID = 'it-mcp-dealer';
const DEALER_UPSERT_ID = 'it-mcp-dealer-upsert';
const CHAT_PENDING = 'it-mcp-chat-pending';
const CHAT_MAP = 'it-mcp-chat-map';
const TERM = 'it-mcp-term';

describe.runIf(process.env.RUN_PRISMA_IT === '1')('MCP source-of-truth tools (Postgres THAT)', () => {
  const prisma = new PrismaService();

  async function cleanup(): Promise<void> {
    await prisma.group.deleteMany({ where: { chatId: { in: [CHAT_PENDING, CHAT_MAP] } } });
    await prisma.price.deleteMany({ where: { sku: SKU } });
    await prisma.dealerPriceOverride.deleteMany({
      where: { dealerId: { in: [DEALER_ID, DEALER_UPSERT_ID] } },
    });
    await prisma.product.deleteMany({ where: { sku: SKU } });
    await prisma.dealer.deleteMany({ where: { id: { in: [DEALER_ID, DEALER_UPSERT_ID] } } });
    await prisma.glossaryEntry.deleteMany({ where: { term: TERM } });
  }

  beforeAll(async () => {
    await cleanup();
    // Fixture: 1 SP (chua co gia), 1 dai ly dich de map, 2 nhom pending.
    await prisma.product.create({ data: { sku: SKU, name: 'SP test MCP', unit: 'Chiếc', aliases: [] } });
    await prisma.dealer.create({
      data: { id: DEALER_ID, name: 'Đại lý test MCP', aliases: [], tier: 'dai_ly', defaultPolicy: 'cong_no_30' },
    });
    await prisma.group.create({
      data: { platform: 'zalo', chatId: CHAT_PENDING, name: 'Nhóm pending A', status: 'pending', source: 'it' },
    });
    await prisma.group.create({
      data: { platform: 'zalo', chatId: CHAT_MAP, name: 'Nhóm pending B', status: 'pending', source: 'it' },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('list_products doc danh muc + gia (gom FELIX da seed va SP test)', async () => {
    const result = await listProducts(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const products = result.products as Array<{ sku: string; wholesale: number | null }>;
    expect(products.some((p) => p.sku === SKU)).toBe(true);
    expect(products.find((p) => p.sku === 'FELIX')?.wholesale).toBe(1_250_000);
  });

  it('list_dealers gom dai ly seed (meta-hn) + dai ly test', async () => {
    const result = await listDealers(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dealers = result.dealers as Array<{ id: string }>;
    expect(dealers.some((d) => d.id === DEALER_ID)).toBe(true);
    expect(dealers.some((d) => d.id === 'meta-hn')).toBe(true);
  });

  it('list_unmapped_groups chi tra nhom pending (hop thu nhom chua map)', async () => {
    const result = await listUnmappedGroups(prisma);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = result.groups as Array<{ chatId: string }>;
    expect(groups.some((g) => g.chatId === CHAT_PENDING)).toBe(true);
    expect(groups.some((g) => g.chatId === CHAT_MAP)).toBe(true);
  });

  it('map_group lat 1 nhom pending -> mapped + gan dealerId', async () => {
    const result = await mapGroup(prisma, { chatId: CHAT_MAP, dealerId: DEALER_ID });
    expect(result.ok).toBe(true);

    const row = await prisma.group.findUnique({
      where: { platform_chatId: { platform: 'zalo', chatId: CHAT_MAP } },
    });
    expect(row?.status).toBe('mapped');
    expect(row?.dealerId).toBe(DEALER_ID);

    // Sau khi map -> khong con trong hop thu nhom chua map.
    const after = await listUnmappedGroups(prisma);
    if (after.ok) {
      const groups = after.groups as Array<{ chatId: string }>;
      expect(groups.some((g) => g.chatId === CHAT_MAP)).toBe(false);
    }
  });

  it('map_group loi ro rang khi dealer khong ton tai (FK)', async () => {
    const result = await mapGroup(prisma, { chatId: CHAT_PENDING, dealerId: 'khong-ton-tai' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Đại lý');
  });

  it('set_price cap nhat gia si cho SKU co san', async () => {
    const result = await setPrice(prisma, {
      sku: SKU,
      wholesale: 1_234_000,
      retailPrice: 1_500_000,
      validMonth: '2026-07',
    });
    expect(result.ok).toBe(true);

    const row = await prisma.price.findFirst({
      where: { sku: SKU, period: { validMonth: '2026-07', status: 'draft' } },
    });
    expect(row?.wholesale).toBe(1_234_000);
    expect(row?.retailPrice).toBe(1_500_000);
  });

  it('set_price loi ro rang khi SKU khong ton tai', async () => {
    const result = await setPrice(prisma, { sku: 'SKU-KHONG-CO', wholesale: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Sản phẩm');
  });

  it('add_glossary upsert (them roi cap nhat nghia)', async () => {
    const first = await addGlossary(prisma, { term: TERM, meaning: 'nghĩa 1' });
    expect(first.ok).toBe(true);
    const second = await addGlossary(prisma, { term: TERM, meaning: 'nghĩa 2' });
    expect(second.ok).toBe(true);

    const row = await prisma.glossaryEntry.findUnique({ where: { term: TERM } });
    expect(row?.meaning).toBe('nghĩa 2');
  });

  it('upsert_dealer tao moi roi cap nhat', async () => {
    const created = await upsertDealer(prisma, {
      id: DEALER_UPSERT_ID,
      name: 'Tên A',
      aliases: ['a'],
      tier: 'ctv',
      defaultPolicy: 'thanh_toan_ngay',
    });
    expect(created.ok).toBe(true);

    const updated = await upsertDealer(prisma, {
      id: DEALER_UPSERT_ID,
      name: 'Tên B',
      aliases: ['a', 'b'],
      tier: 'ctv',
      defaultPolicy: 'thanh_toan_ngay',
    });
    expect(updated.ok).toBe(true);

    const row = await prisma.dealer.findUnique({ where: { id: DEALER_UPSERT_ID } });
    expect(row?.name).toBe('Tên B');
    expect(row?.aliases).toEqual(['a', 'b']);
  });

  it('upsert_dealer bao loi khi enum tier sai (zod validate, khong nem)', async () => {
    const result = await upsertDealer(prisma, {
      id: DEALER_UPSERT_ID,
      name: 'X',
      aliases: [],
      tier: 'sai_tier',
      defaultPolicy: 'cong_no_30',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('hợp lệ');
  });

  it('list_groups loc theo status=mapped', async () => {
    const result = await listGroups(prisma, { status: 'mapped' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = result.groups as Array<{ status: string; chatId: string }>;
    expect(groups.every((g) => g.status === 'mapped')).toBe(true);
    expect(groups.some((g) => g.chatId === CHAT_MAP)).toBe(true); // da map o test truoc
  });
});
