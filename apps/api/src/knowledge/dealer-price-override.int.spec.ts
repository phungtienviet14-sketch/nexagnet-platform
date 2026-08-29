import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { resolveDealerPrice } from '../rules/dealer-price.js';
import { PrismaKnowledgeRepository } from './prisma-knowledge.repository.js';

/**
 * BANG CHUNG RUNTIME cua U2 Step 2 (Issue #77 §8) tren Postgres THAT.
 *
 * Bo test o `rules/dealer-price.spec.ts` chung minh CONG QUYET DINH dung tren du lieu trong bo
 * nho. Bo nay chung minh phan con lai — cai ma unit test khong voi toi duoc:
 *   · deal ghi xuong Postgres doc len van con nguyen NGUONG va CUA SO HIEU LUC;
 *   · mot tien trinh MOI (client moi, snapshot moi) van thay deal do — khong mat khi restart;
 *   · dai ly khac khong an nham gia rieng cua nguoi ben canh;
 *   · va tenant B khong doc/ghi duoc deal cua tenant A.
 *
 * CHAY (giong job `integration` cua CI):
 *   docker run -d --name u2-pg -e POSTGRES_USER=netviet -e POSTGRES_PASSWORD=netviet_local \
 *     -e POSTGRES_DB=netviet -p 5432:5432 postgres:16-alpine
 *   pnpm --filter @netviet/api exec prisma migrate deploy --schema prisma/schema.prisma
 *   pnpm --filter @netviet/api exec tsx prisma/seed.ts
 *   RUN_PRISMA_IT=1 DATABASE_URL=postgresql://netviet:netviet_local@127.0.0.1:5432/netviet \
 *     pnpm --filter @netviet/api exec vitest run src/knowledge/dealer-price-override.int.spec.ts
 *
 * DU LIEU TONG HOP. Khong co ma tran gia rieng that cua khach nao trong tep nay — repo la PUBLIC
 * va gia rieng theo dai ly la du lieu kinh doanh mat (Issue #77 §4).
 */

const DEALER_A = 'meta-hn';
const DEALER_B = 'dl-thai-nguyen';
const SKU = 'ELNI';

/** Nam ngoai moi ky gia that de khong bao gio dung vao du lieu seed. */
const SYNTHETIC_OVERRIDE_PRICE = 1_234_000;

describe.runIf(process.env.RUN_PRISMA_IT === '1')('Deal rieng theo dai ly (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaKnowledgeRepository(prisma);
  const now = new Date();

  async function clearSyntheticOverrides(): Promise<void> {
    await prisma.dealerPriceOverride.deleteMany({
      where: { dealerId: { in: [DEALER_A, DEALER_B] }, sku: SKU },
    });
  }

  beforeAll(async () => {
    await clearSyntheticOverrides();
  });

  afterAll(async () => {
    await clearSyntheticOverrides();
    await prisma.$disconnect();
  });

  /** Gia si chung dang co hieu luc — moc de doi chieu "co roi ve bang gia chung khong". */
  async function baseWholesale(): Promise<number> {
    const snapshot = await repo.loadSnapshot();
    const row = snapshot.prices.find((price) => price.sku === SKU);
    expect(row, `SKU ${SKU} phai co dong gia trong ky dang active (chay seed truoc)`).toBeDefined();
    return row!.wholesale;
  }

  it('§8.1 deal ghi xuong Postgres va doc len con NGUYEN nguong + cua so hieu luc', async () => {
    const created = await prisma.dealerPriceOverride.create({
      data: {
        dealerId: DEALER_A,
        sku: SKU,
        price: SYNTHETIC_OVERRIDE_PRICE,
        // ASM-03: ghi SO 1 tuong minh, khong de NULL lam mot gia dinh khong ai ky ten.
        minQuantity: 1,
        enabled: true,
      },
    });

    const snapshot = await repo.loadSnapshot();
    const loaded = snapshot.priceOverrides.find((o) => o.dealerId === DEALER_A && o.sku === SKU);
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(created.id);
    expect(loaded!.price).toBe(SYNTHETIC_OVERRIDE_PRICE);
    expect(loaded!.minQuantity).toBe(1);
    // Truong nay tung bi bo lai trong cau truy van; thieu no thi cong khong xet lai duoc.
    expect(loaded!.enabled).toBe(true);
  });

  it('§8.2 dai ly A giai ra DEAL RIENG, §8.3 dai ly B giai ra GIA SI CHUNG', async () => {
    const base = await baseWholesale();
    const snapshot = await repo.loadSnapshot();

    const a = resolveDealerPrice({
      sku: SKU,
      dealerId: DEALER_A,
      quantity: 1,
      prices: snapshot.prices,
      overrides: snapshot.priceOverrides,
      now,
    });
    expect(a.source).toBe('dealer_override');
    expect(a.reason).toBe('DEALER_PRICE_OVERRIDE_APPLIED');
    expect(a.unitPrice).toBe(SYNTHETIC_OVERRIDE_PRICE);

    const b = resolveDealerPrice({
      sku: SKU,
      dealerId: DEALER_B,
      quantity: 1,
      prices: snapshot.prices,
      overrides: snapshot.priceOverrides,
      now,
    });
    expect(b.source).toBe('base_wholesale');
    expect(b.reason).toBe('DEALER_PRICE_BASE_NO_OVERRIDE');
    expect(b.unitPrice).toBe(base);
    expect(b.unitPrice).not.toBe(SYNTHETIC_OVERRIDE_PRICE);
  });

  it('§8.4 nguong so luong duoc ton trong qua duong Postgres', async () => {
    const base = await baseWholesale();
    await prisma.dealerPriceOverride.update({
      where: { dealerId_sku: { dealerId: DEALER_A, sku: SKU } },
      data: { minQuantity: 5 },
    });
    const snapshot = await repo.loadSnapshot();

    const duoiNguong = resolveDealerPrice({
      sku: SKU,
      dealerId: DEALER_A,
      quantity: 4,
      prices: snapshot.prices,
      overrides: snapshot.priceOverrides,
      now,
    });
    expect(duoiNguong.source).toBe('base_wholesale');
    expect(duoiNguong.reason).toBe('DEALER_PRICE_OVERRIDE_BELOW_MIN_QUANTITY');
    expect(duoiNguong.unitPrice).toBe(base);

    const dungNguong = resolveDealerPrice({
      sku: SKU,
      dealerId: DEALER_A,
      quantity: 5,
      prices: snapshot.prices,
      overrides: snapshot.priceOverrides,
      now,
    });
    expect(dungNguong.source).toBe('dealer_override');
    expect(dungNguong.unitPrice).toBe(SYNTHETIC_OVERRIDE_PRICE);

    await prisma.dealerPriceOverride.update({
      where: { dealerId_sku: { dealerId: DEALER_A, sku: SKU } },
      data: { minQuantity: 1 },
    });
  });

  it('§8.5 RESTART khong lam mat deal — client moi, snapshot moi, van con', async () => {
    // Mot PrismaClient hoan toan khac = mot tien trinh khac doc lai cung Postgres. Neu deal chi
    // song trong bo nho cua tien trinh da ghi thi cho nay se rong.
    const freshClient = new PrismaService();
    const freshRepo = new PrismaKnowledgeRepository(freshClient);
    try {
      const snapshot = await freshRepo.loadSnapshot();
      const survived = snapshot.priceOverrides.find(
        (o) => o.dealerId === DEALER_A && o.sku === SKU,
      );
      expect(survived).toBeDefined();
      expect(survived!.price).toBe(SYNTHETIC_OVERRIDE_PRICE);
      expect(survived!.minQuantity).toBe(1);
    } finally {
      await freshClient.$disconnect();
    }
  });

  it('deal BI TAT / HET HAN khong ap — chan o CA hai lop', async () => {
    const base = await baseWholesale();

    await prisma.dealerPriceOverride.update({
      where: { dealerId_sku: { dealerId: DEALER_A, sku: SKU } },
      data: { enabled: false },
    });
    const tat = await repo.loadSnapshot();
    // Lop 1 — cau truy van khong tra deal da tat ra nua.
    expect(tat.priceOverrides.some((o) => o.dealerId === DEALER_A && o.sku === SKU)).toBe(false);
    expect(
      resolveDealerPrice({
        sku: SKU,
        dealerId: DEALER_A,
        quantity: 10,
        prices: tat.prices,
        overrides: tat.priceOverrides,
        now,
      }).unitPrice,
    ).toBe(base);

    // Lop 2 — ngay ca khi mot snapshot CU (nap truoc luc tat) con giu ban ghi, cong van tu choi.
    // Day chinh la ke ho ma U2 Step 2 va: snapshot song suot vong doi tien trinh.
    const snapshotCu = [
      {
        id: 'stale',
        dealerId: DEALER_A,
        sku: SKU,
        price: SYNTHETIC_OVERRIDE_PRICE,
        minQuantity: 1,
        enabled: false,
      },
    ];
    const quyetDinh = resolveDealerPrice({
      sku: SKU,
      dealerId: DEALER_A,
      quantity: 10,
      prices: tat.prices,
      overrides: snapshotCu,
      now,
    });
    expect(quyetDinh.source).toBe('base_wholesale');
    expect(quyetDinh.reason).toBe('DEALER_PRICE_OVERRIDE_DISABLED');

    await prisma.dealerPriceOverride.update({
      where: { dealerId_sku: { dealerId: DEALER_A, sku: SKU } },
      data: { enabled: true, effectiveTo: new Date('2026-01-01T00:00:00Z') },
    });
    const hetHan = await repo.loadSnapshot();
    expect(hetHan.priceOverrides.some((o) => o.dealerId === DEALER_A && o.sku === SKU)).toBe(false);

    // Va lai lop 2: snapshot cu con giu ban ghi het han -> cong van quay ve gia si chung.
    const snapshotCuHetHan = [
      {
        id: 'stale-expired',
        dealerId: DEALER_A,
        sku: SKU,
        price: SYNTHETIC_OVERRIDE_PRICE,
        minQuantity: 1,
        enabled: true,
        effectiveTo: new Date('2026-01-01T00:00:00Z'),
      },
    ];
    expect(
      resolveDealerPrice({
        sku: SKU,
        dealerId: DEALER_A,
        quantity: 10,
        prices: hetHan.prices,
        overrides: snapshotCuHetHan,
        now,
      }).reason,
    ).toBe('DEALER_PRICE_OVERRIDE_EXPIRED');

    await prisma.dealerPriceOverride.update({
      where: { dealerId_sku: { dealerId: DEALER_A, sku: SKU } },
      data: { effectiveTo: null },
    });
  });
});

/**
 * CACH LY TENANT — chung minh AM TINH (Issue #77 §7, §11).
 *
 * Kien truc hien tai la SILO DEPLOYMENT: moi khach mot Postgres rieng, va
 * `docs/kien-truc/nen-tang-da-khach.md` ghi ro bat bien "chua dung shared DB va chua them
 * `tenantId`". Nen cach ly KHONG duoc chung minh bang mot cot `tenantId` — no khong ton tai, va
 * them vao day se pha dung bat bien do va lan sang phan viec cua task Platform (§9).
 *
 * Cai PHAI chung minh la: hai chuoi ket noi khac nhau cho ra hai the gioi roi nhau. Deal cua
 * tenant A khong xuat hien o tenant B, va ghi ben B khong dong toi A.
 *
 * Bo qua khi thieu `TENANT_B_DATABASE_URL` — bo test khong tu tao database cua nguoi khac.
 */
describe.runIf(
  process.env.RUN_PRISMA_IT === '1' && Boolean(process.env.TENANT_B_DATABASE_URL),
)('Cach ly tenant cho deal rieng (hai Postgres roi nhau)', () => {
  const tenantA = new PrismaService();
  const tenantB = new PrismaClient({ datasourceUrl: process.env.TENANT_B_DATABASE_URL });

  afterAll(async () => {
    await tenantA.dealerPriceOverride.deleteMany({ where: { sku: SKU, dealerId: DEALER_A } });
    await tenantB.dealerPriceOverride.deleteMany({ where: { sku: SKU } });
    await Promise.all([tenantA.$disconnect(), tenantB.$disconnect()]);
  });

  it('deal cua tenant A KHONG doc duoc tu tenant B, va nguoc lai', async () => {
    await tenantA.dealerPriceOverride.deleteMany({ where: { sku: SKU, dealerId: DEALER_A } });
    await tenantB.dealerPriceOverride.deleteMany({ where: { sku: SKU } });

    await tenantA.dealerPriceOverride.create({
      data: { dealerId: DEALER_A, sku: SKU, price: SYNTHETIC_OVERRIDE_PRICE, minQuantity: 1 },
    });

    // DOC tu B: khong thay gi. Neu hai tenant dung chung mot database thi dong nay se thay deal.
    const thayTuB = await tenantB.dealerPriceOverride.findMany({ where: { sku: SKU } });
    expect(thayTuB).toEqual([]);

    // GHI tu B khong duoc dong vao A. B chua co dai ly nao -> khoa ngoai chan luon; ke ca khi
    // ghi duoc thi so ban ghi ben A phai giu nguyen.
    await tenantB.dealerPriceOverride
      .create({ data: { dealerId: DEALER_A, sku: SKU, price: 1, minQuantity: 1 } })
      .catch(() => undefined);

    const conBenA = await tenantA.dealerPriceOverride.findMany({
      where: { sku: SKU, dealerId: DEALER_A },
    });
    expect(conBenA).toHaveLength(1);
    expect(conBenA[0]!.price).toBe(SYNTHETIC_OVERRIDE_PRICE);
  });
});
