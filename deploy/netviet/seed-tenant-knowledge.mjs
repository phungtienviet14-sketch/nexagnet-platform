import { readFile } from 'node:fs/promises';
import process from 'node:process';
// This deploy tool lives outside a pnpm workspace package. Resolve through apps/api, which owns
// the dependency, instead of relying on a forbidden root-hoist that differs by pnpm layout.
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client/default.js';

/**
 * SEED nguon su that tu GOI KHACH vao mot Postgres CON RONG.
 *
 * Voi `PERSISTENCE=prisma`, KnowledgeService nap snapshot tu Postgres luc boot va bo qua SEED
 * trong bo nho. Mot stack moi vi the len voi danh muc RONG: parser khong co san pham nao de doi
 * chieu, nen tin dat hang mau cua smoke test bi phan loai `khac` thay vi `dat_don`. Do la lan
 * deploy dau cua BAT KY stack nao, khong rieng gd1-test.
 *
 * Goi khach la HAT GIONG, khong phai nguon su that luc chay (tenants/README.md). Nen script nay
 * gieo DUNG MOT LAN:
 *   - da co san pham trong DB  -> KHONG dung toi gi ca, Postgres da la nguon su that;
 *   - DB rong                  -> gieo nguyen goi khach roi dung.
 * Khong bao gio ghi de. Sau lan gieo dau, moi thay doi di qua /admin hoac MCP tool.
 */

const TENANT_DIR = process.env.TENANT_DIR ?? '/srv/tenant';

function required(value, label) {
  if (value === undefined || value === null) throw new Error(`Goi khach thieu ${label}`);
  return value;
}

const prisma = new PrismaClient();
try {
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    process.stdout.write(
      `Da co ${existingProducts} san pham trong DB — Postgres la nguon su that, khong gieo lai.\n`,
    );
    process.exit(0);
  }

  const tenant = JSON.parse(await readFile(`${TENANT_DIR}/tenant.json`, 'utf8'));
  const knowledgePath = tenant.bootstrap?.knowledge?.path ?? 'data/knowledge.json';
  const knowledge = JSON.parse(await readFile(`${TENANT_DIR}/${knowledgePath}`, 'utf8'));

  const products = required(knowledge.products, 'products');
  // `dealers` la khai niem RIENG cua nang luc `sales-order`. Doi hoi no o MOI khach la keo khai
  // niem ban hang vao base (quyet dinh kien truc #6): mot khach chi bat `knowledge` thi khong co
  // dai ly nao ca, va goi khach cua ho dung la khong nen co truong do. Guard van giu nguyen cho
  // khach CO `sales-order` — thieu dai ly o day la goi khach hong that, khong phai khach khac loai.
  const capabilities = tenant.capabilities ?? [];
  const dealers = capabilities.includes('sales-order')
    ? required(knowledge.dealers, 'dealers')
    : (knowledge.dealers ?? []);
  const groups = knowledge.groups ?? [];
  const glossary = knowledge.glossary ?? [];
  const prices = knowledge.prices ?? [];
  const priceOverrides = knowledge.priceOverrides ?? [];
  const pricePeriod = knowledge.pricePeriod ?? null;

  // Mot giao dich duy nhat: mot goi khach hong nua chung khong duoc de lai DB nua voi, vi lan
  // chay sau se thay `product.count() > 0` va bo qua phan con thieu.
  await prisma.$transaction(async (tx) => {
    await tx.product.createMany({
      data: products.map((p) => ({
        sku: p.sku,
        name: p.name,
        aliases: p.aliases ?? [],
        unit: p.unit,
        description: p.description ?? null,
      })),
    });

    await tx.dealer.createMany({
      data: dealers.map((d) => ({
        id: d.id,
        name: d.name,
        aliases: d.aliases ?? [],
        tier: d.tier,
        defaultPolicy: d.defaultPolicy,
      })),
    });

    if (groups.length > 0) {
      // `status: 'mapped'` co chu dich: loadSnapshot CHI lay nhom da map co dealerId. Nhom gieo
      // tu goi khach la nhom da biet thuoc dai ly nao, khac voi nhom la roi vao hop thu chua map.
      await tx.group.createMany({
        data: groups.map((g) => ({
          chatId: g.chatId,
          dealerId: g.dealerId,
          branch: g.branch ?? null,
          name: g.name ?? null,
          status: 'mapped',
          source: 'import',
        })),
      });
    }

    if (glossary.length > 0) {
      await tx.glossaryEntry.createMany({
        data: glossary.map((g) => ({ term: g.term, meaning: g.meaning })),
      });
    }

    if (pricePeriod && prices.length > 0) {
      const period = await tx.pricePeriod.create({
        data: {
          validMonth: pricePeriod.validMonth ?? null,
          status: pricePeriod.status ?? 'draft',
          source: pricePeriod.source ?? null,
          note: pricePeriod.note ?? null,
          activatedAt: pricePeriod.status === 'active' ? new Date() : null,
        },
      });
      await tx.price.createMany({
        data: prices.map((p) => ({
          periodId: period.id,
          sku: p.sku,
          wholesale: p.wholesale,
          minRetailPrice: p.minRetailPrice ?? null,
          retailPrice: p.retailPrice ?? null,
          listPrice: p.listPrice ?? null,
        })),
      });
    }

    if (priceOverrides.length > 0) {
      await tx.dealerPriceOverride.createMany({
        data: priceOverrides.map((o) => ({
          dealerId: o.dealerId,
          sku: o.sku,
          price: o.price,
          minQuantity: o.minQuantity ?? null,
          enabled: true,
        })),
      });
    }
  });

  process.stdout.write(
    `Da gieo goi khach '${tenant.slug}': ${products.length} SP, ${prices.length} gia, ` +
      `${dealers.length} dai ly, ${groups.length} nhom, ${glossary.length} tu dien.\n`,
  );
} finally {
  await prisma.$disconnect();
}
