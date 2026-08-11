import { DEALER_TIERS, POLICY_TYPES } from '@netviet/shared';
import { z } from 'zod';

/**
 * Schema GOI KHACH (`tenants/<slug>/`). Goi khach la DU LIEU doc luc chay chu khong phai code,
 * nen phai validate nhu moi nguon la khac (CLAUDE.md — "khong tin du lieu ngoai"). Sai schema =>
 * nem ngay luc boot, KHONG de he thong chay tiep voi nguon su that hong.
 *
 * LUU Y: day la HAT GIONG, khong phai nguon su that luc chay. Voi PERSISTENCE=prisma, sau lan
 * seed dau tien thi Postgres moi la nguon su that (sua qua /admin hoac MCP) — xem
 * docs/ke-hoach/nen-tang-da-khach.md §5.
 */

const nonEmpty = z.string().min(1);

export const tenantConfigSchema = z.object({
  /** Tang khi doi cau truc goi khach theo kieu pha vo tuong thich. */
  schemaVersion: z.literal(1),
  /** Trung ten thu muc `tenants/<slug>/` va `docs/khach-hang/<slug>/`. */
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: chi chu thuong, so va gach noi'),
  /** Ten phap nhan day du — dung tren chung tu/bao cao. */
  displayName: nonEmpty,
  /** Ten goi tat — dung trong cau chu hien thi. */
  shortName: nonEmpty,
  persona: z.object({
    /** Cau mo dau prompt parser. Truoc B1 cau nay hardcode ten khach trong parser-prompt.ts. */
    parserIntro: nonEmpty,
    /**
     * Ten bot trong nhan "Tin tu dong tu Bot <botName>" gan vao MOI tin he thong gui ra nhom.
     * Dieu khoan Zalo bat buoc gan nhan noi dung do AI tao -> chuoi nay DEN TAY khach cua khach,
     * doi la doi thu nguoi ta doc duoc. Tach rieng khoi shortName vi hai cho xung ho khac nhau.
     */
    botName: nonEmpty,
    /** Mo ta thay the khi mot SP trong kho tri thuc chua co description (vai Tu van SP). */
    productFallbackDescription: nonEmpty,
  }),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

/** Khop 1-1 voi interface KnowledgeSnapshot o ../knowledge/domain.ts. */
export const knowledgeSnapshotSchema = z.object({
  products: z.array(
    z.object({
      sku: nonEmpty,
      name: nonEmpty,
      aliases: z.array(z.string()),
      unit: nonEmpty,
      description: z.string().optional(),
    }),
  ),
  prices: z.array(
    z.object({
      sku: nonEmpty,
      wholesale: z.number(),
      listPrice: z.number().optional(),
      retailPrice: z.number().optional(),
      minRetailPrice: z.number().optional(),
    }),
  ),
  priceOverrides: z.array(z.object({ dealerId: nonEmpty, sku: nonEmpty, price: z.number() })),
  dealers: z.array(
    z.object({
      id: nonEmpty,
      name: nonEmpty,
      aliases: z.array(z.string()),
      tier: z.enum(DEALER_TIERS),
      defaultPolicy: z.enum(POLICY_TYPES),
    }),
  ),
  groups: z.array(
    z.object({ chatId: nonEmpty, dealerId: nonEmpty, branch: z.string(), name: z.string() }),
  ),
  glossary: z.array(z.object({ term: nonEmpty, meaning: nonEmpty })),
});
