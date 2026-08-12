import { DEALER_TIERS, POLICY_TYPES } from '@netviet/shared';
import { z } from 'zod';

/**
 * Schema GOI KHACH (`tenants/<slug>/`). Goi khach la DU LIEU doc luc chay chu khong phai code,
 * nen phai validate nhu moi nguon la khac (CLAUDE.md — "khong tin du lieu ngoai"). Sai schema =>
 * nem ngay luc boot, KHONG de he thong chay tiep voi nguon su that hong.
 *
 * LUU Y: day la HAT GIONG, khong phai nguon su that luc chay. Voi PERSISTENCE=prisma, sau lan
 * seed dau tien thi Postgres moi la nguon su that (sua qua /admin hoac MCP) — xem
 * docs/phat-trien/ke-hoach/nen-tang-da-khach.md §5.
 */

const nonEmpty = z.string().min(1);
export const retailPriceFieldSchema = z.enum([
  'wholesale',
  'minRetailPrice',
  'retailPrice',
  'listPrice',
]);

export const retailAdviceSchema = z
  .object({
    priceField: retailPriceFieldSchema,
    qualifier: nonEmpty,
  })
  .strict();

export const blockedCapabilitySchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).max(100),
    label: nonEmpty.max(200),
    reason: nonEmpty.max(1_000),
  })
  .strict();

export const tenantReadinessSchema = z
  .object({
    /** Cac blocker nghiep vu do tenant khai bao; core chi hien thi, khong suy dien hanh vi. */
    blockedCapabilities: z.array(blockedCapabilitySchema).max(100),
  })
  .strict();

export const orderAutomationSchema = z
  .object({
    /** Policy kinh doanh cua tenant; AUTO_SEND runtime chi la kill switch van hanh. */
    enabled: z.boolean(),
    /** Tong so luong toi da duoc tu xac nhan, tinh inclusive tren tat ca dong hang. */
    maxAutoConfirmQuantity: z.number().int().positive().max(1_000_000),
  })
  .strict();

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'gio phai co dang HH:mm');

export const campaignConfigSchema = z
  .object({
    defaultWindow: z
      .object({ start: timeOfDaySchema, end: timeOfDaySchema })
      .strict()
      .refine((window) => window.end > window.start, 'campaign.defaultWindow.end phai sau start'),
    minSpacingSeconds: z.number().int().positive().max(86_400),
    maxTargets: z.number().int().positive().max(100_000),
    rateLimitPerMinute: z.number().int().positive().max(10_000),
    claimLeaseSeconds: z.number().int().positive().max(3_600),
    tickIntervalSeconds: z.number().int().positive().max(300),
    retry: z
      .object({
        maxAttempts: z.number().int().positive().max(20),
        baseBackoffSeconds: z.number().int().positive().max(86_400),
      })
      .strict(),
    features: z.object({ lunarCalendarEnabled: z.boolean() }).strict(),
  })
  .strict();

export const tenantConfigSchema = z.object({
  /** Tang khi doi cau truc goi khach theo kieu pha vo tuong thich. */
  schemaVersion: z.literal(1),
  /** Trung ten thu muc `tenants/<slug>/` va `docs/khach-hang/<slug>/`. */
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: chi chu thuong, so va gach noi'),
  /** Ten phap nhan day du — dung tren chung tu/bao cao. */
  displayName: nonEmpty,
  /** Ten goi tat — dung trong cau chu hien thi. */
  shortName: nonEmpty,
  /**
   * Chuoi giao dien. Truoc Dot B1 nhung chuoi nay nam thang trong `apps/web` (`layout.tsx`,
   * `TopBar.tsx`, `SettingsShell.tsx`, `Composer.tsx`) — doi khach la phai sua ma nguon app.
   */
  branding: z.object({
    /** Ten san pham tren thanh tieu de console. Cung la `short_name` cua PWA manifest. */
    productName: nonEmpty,
    /** Ten day du khi cai PWA (`name` cua manifest) — hien duoi icon tren man hinh chinh. */
    installName: nonEmpty,
    /** <title> cua trang. */
    pageTitle: nonEmpty,
    /** Mo ta trang (the description + PWA). */
    pageDescription: nonEmpty,
    /** Mau chu dao cho `theme-color` cua trinh duyet, va la mau nen cua icon. */
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'themeColor: dang #rrggbb'),
    /** Mau nen PWA luc khoi dong, va la mau chu monogram tren icon. */
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'backgroundColor: dang #rrggbb'),
    /**
     * Chu dat giua icon app (1-3 ky tu). Icon duoc SINH luc chay tu monogram + hai mau o tren
     * (`app/icon.svg/route.ts`) chu khong con la file tinh trong `public/` — file tinh se di theo
     * image va lam image gan chet vao mot khach.
     */
    monogram: z.string().min(1).max(3),
    /** Cau goi y trong o soan tin cua console — chua vi du dat hang cua chinh khach. */
    composerPlaceholder: nonEmpty,
  }),
  /**
   * D28 (chot 12/08/2026, phuong an B): chinh sach ban hang khach nay THUC SU dung — mot TAP CON
   * cua `POLICY_TYPES`. Khong dung bang `Policy` rieng, khong doi enum Prisma.
   *
   * Ly do chon B: khong cho nao trong code re nhanh theo policy (`policy ===` / `switch (policy)`
   * = 0 ket qua toan repo); phi COD chay theo co `codCollect` cua don chu khong theo policy. Policy
   * hom nay la NHAN MO TA chu khong phai luat tinh tien, nen mot bang rieng chi mua linh hoat chua
   * ai can, doi lai mat luoi an toan luc bien dich. Danh sach nay cho phep tung khach thu hep xuong
   * dung nhung gi ho ban, ma van giu kieu tinh.
   *
   * Them chinh sach that su MOI (khach khac han) van phai sua `POLICY_TYPES` + migration Prisma —
   * do la luc can xet lai phuong an C.
   */
  policies: z.array(z.enum(POLICY_TYPES)).min(1),
  /**
   * Null = tenant chua chot policy, fail-closed va khong tu gui. Khong dung default code vi
   * nguong la du lieu kinh doanh rieng tung khach.
   */
  orderAutomation: orderAutomationSchema.nullable(),
  /** Gioi han van han campaign cua tung silo; noi dung/lich thuc te nam trong Postgres. */
  campaign: campaignConfigSchema,
  /** Chien luoc tu van gia le; core chi doc field va cau giai thich nay. */
  retailAdvice: retailAdviceSchema,
  readiness: tenantReadinessSchema,
  persona: z.object({
    /** Cau mo dau prompt parser. Truoc B1 cau nay hardcode ten khach trong parser-prompt.ts. */
    parserIntro: nonEmpty,
    /**
     * Ten bot trong nhan "Tin tu dong tu Bot <botName>" gan vao MOI tin he thong gui ra nhom.
     * Dieu khoan Zalo bat buoc gan nhan noi dung do AI tao -> chuoi nay DEN TAY khach cua khach,
     * doi la doi thu nguoi ta doc duoc. Tach rieng khoi shortName vi hai cho xung ho khac nhau.
     */
    botName: nonEmpty,
    /**
     * Ten dung de BOC @mention khoi noi dung tin den. Khac `botName`: day la chuoi dung nhu no
     * xuat hien trong nhom Zalo (vd "Bot ultty AI orders"), con botName la ten hien thi.
     * Bien moi truong BOT_NAME van ghi de duoc cho tung moi truong chay.
     */
    mentionName: nonEmpty,
    /** Mo ta thay the khi mot SP trong kho tri thuc chua co description (vai Tu van SP). */
    productFallbackDescription: nonEmpty,
  }),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;
export type OrderAutomation = z.infer<typeof orderAutomationSchema>;
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;
export type RetailAdvice = z.infer<typeof retailAdviceSchema>;
export type TenantReadiness = z.infer<typeof tenantReadinessSchema>;

/**
 * Hat giong nguon su that. Khop 1-1 voi interface `KnowledgeSnapshot` cua apps/api — ben do co
 * mot phep gan kiem kieu de hai hinh khong tro nhau luc nao khong biet.
 */
export const knowledgeSnapshotSchema = z.object({
  pricePeriod: z
    .object({
      validMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(),
      status: z.enum(['draft', 'active', 'archived']),
    })
    .strict()
    .nullable(),
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

export type TenantKnowledge = z.infer<typeof knowledgeSnapshotSchema>;

/** Tin nhan mau cho luong demo (`/demo/simulate`) — la vi du dat hang cua chinh khach. */
export const demoMessagesSchema = z.array(nonEmpty).min(1);
export type DemoMessages = z.infer<typeof demoMessagesSchema>;
