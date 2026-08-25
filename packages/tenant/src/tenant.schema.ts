import {
  contentImportManifestSchema,
  DEALER_TIERS,
  POLICY_TYPES,
  type ContentImportManifest,
} from '@netviet/shared';
import { z } from 'zod';
import { workflowEngineIntegrationSchema } from './workflow-binding.schema.js';

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
    key: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]*$/)
      .max(100),
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

/**
 * BAO LAU thi mot viec ban giao cho Sale bi coi la "chua ai dong toi".
 *
 * DAY LA CHINH SACH CUA KHACH, khong phai hang so cua nen tang — va do la ca ly do no nam trong
 * goi khach chu khong nam trong code. Mot khach chot don theo ca lam viec va mot khach truc 24/7
 * co nguong khac han nhau; chon ho mot con so roi goi do la "SLA" la bia ra nghiep vu.
 *
 * `null` (mac dinh) = KHONG theo doi. Fail-safe co chu y: khach chua noi bao lau la du lau thi
 * he thong khong duoc tu quyet, va khong theo doi thi khong bao gio nhac nham.
 *
 * PHAM VI CUA v1: het gio thi DANH DAU de nguoi nhin thay — KHONG day ERP, KHONG nhan tin ra
 * ngoai. Viec cua workflow dau tien la "viec ban giao khong bi quen", khong phai "thay nguoi
 * bang tu dong hoa".
 */
/**
 * KHOA cua khuon workflow thuc thi viec theo doi nay.
 *
 * Mot HANG SO o day chu khong phai mot chuoi go tay trong `superRefine`: no la mot phan cua HOP
 * DONG giua goi khach va ban dang chay (`apps/api/src/workflow/workflow-registry.ts` khai cung
 * khoa nay). Hai ben lech nhau thi goi khach hop le se tro thanh mot bao dam khong ai thuc hien.
 */
export const SALES_HANDOFF_FOLLOWUP_WORKFLOW = 'sales-handoff-followup';

export const salesHandoffFollowupSchema = z
  .object({
    enabled: z.boolean(),
    /**
     * Tinh tu `salesHandoff.createdAt`. Tran 30 ngay de mot so go nham khong sinh ra mot lan cho
     * dai hon vong doi luu tru cua engine.
     */
    remindAfterSeconds: z.number().int().positive().max(2_592_000),
  })
  .strict();

/**
 * He thong ban hang/kho cua khach. NEN TANG chi biet cong `ErpPort`; ten nha cung cap chi duoc
 * xuat hien o DAY (du lieu cua khach) va trong chinh thu muc adapter — khong o nhan (G1-12).
 * Them khach dung ERP khac = them mot hien thuc + mot gia tri enum, khong sua nhan.
 */
export const erpAdapterSchema = z.enum([
  /** Khach chua noi ERP nao: doc tra rong, day don thi NEM. Mac dinh — fail-closed. */
  'none',
  /** Gia lap trong bo nho cho khach dung KiotViet khi ben do chua bat API. */
  'kiotviet_mock',
]);

export const erpConfigSchema = z.object({ adapter: erpAdapterSchema }).strict();

export const CHANNEL_ADAPTERS = ['mock', 'bot', 'zca', 'hybrid'] as const;
export const PARSER_ADAPTERS = ['claude', 'deepseek', 'flowise'] as const;
export const CONTENT_SOURCE_ADAPTERS = ['local_manifest', 'google_drive'] as const;
export const CAPABILITY_IDS = [
  'knowledge',
  'messaging',
  /**
   * XU LY MOT LUOT — trung tinh ve nghiep vu: nhan mot tin, dung ngu canh, goi AI phan loai y
   * dinh + trich xuat, roi dinh tuyen ket qua. KHONG biet gia, don hay ERP.
   *
   * Tach khoi `sales-order` ngay 24/08/2026: truoc do mot khach chi muon tra loi tin nhan phai
   * bat ca `sales-order`, tuc phai khai bang gia, dai ly va chinh sach ban hang cho mot viec
   * khong lien quan gi den ban hang.
   */
  'turn-processing',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
] as const;
export const EXPERIENCE_IDS = [
  'operations-console',
  'knowledge-workspace',
  'agent-workforce',
] as const;

export const capabilityIdSchema = z.enum(CAPABILITY_IDS);
export const experienceIdSchema = z.enum(EXPERIENCE_IDS);
export const channelAdapterSchema = z.enum(CHANNEL_ADAPTERS);
export const parserAdapterSchema = z.enum(PARSER_ADAPTERS);
export const contentSourceAdapterSchema = z.enum(CONTENT_SOURCE_ADAPTERS);

const uniqueNonEmptyArray = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .min(1)
    .refine((items) => new Set(items).size === items.length, 'khong duoc khai bao trung');

export const channelIntegrationSchema = z
  .object({ allowedAdapters: uniqueNonEmptyArray(channelAdapterSchema) })
  .strict();

export const parserIntegrationSchema = z
  .object({ allowedAdapters: uniqueNonEmptyArray(parserAdapterSchema) })
  .strict();

export const contentSourceIntegrationSchema = z
  .object({ adapter: contentSourceAdapterSchema })
  .strict();

/** Duong dan trong goi tenant: tuong doi, khong duoc thoat khoi tenantDir(). */
export const bootstrapPathSchema = nonEmpty
  .max(500)
  .refine((path) => !/^(?:[\\/]|[A-Za-z]:)/.test(path), 'phai la duong dan tuong doi')
  .refine(
    (path) => !path.split(/[\\/]/).some((segment) => segment === '..'),
    'khong duoc chua thanh phan ..',
  );

const bootstrapEntrySchema = z.object({ path: bootstrapPathSchema }).strict();

export const tenantBootstrapSchema = z
  .object({
    knowledge: bootstrapEntrySchema.optional(),
    salesOrder: bootstrapEntrySchema.optional(),
    content: bootstrapEntrySchema.optional(),
    demoMessages: bootstrapEntrySchema.optional(),
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

/**
 * TIN NHAN MAU cho smoke test luc deploy.
 *
 * Vi sao nam trong GOI KHACH chu khong nam trong script deploy: parser lam viec trong TU DIEN DONG
 * cua tung khach (SKU, dai ly, glossary rieng). Truoc 17/08/2026 smoke-test.mjs cam cung mot cau
 * cua mot khach cu the — cau do la don hop le voi khach do, con voi khach khac thi parser tra
 * `khac` va deploy chet du he thong hoan toan binh thuong. Mot chuoi mang ten dai ly va SKU cua
 * mot khach cung khong duoc phep nam trong base (CLAUDE.md muc 6).
 *
 * KHONG khai bao (`null`) = khach chua co nguon su that de dat hang duoc, vi du goi vua dung.
 * Luc do smoke chi kiem duoc phan ha tang; xem smoke-test.mjs.
 */
export const smokeFixtureSchema = z
  .object({
    /** Mot don HOP LE theo dung nguon su that cua khach nay — phai ra intent `dat_don`. */
    orderText: nonEmpty,
    /** So luong ma rules engine phai tinh ra tu `orderText`. Smoke doi dung mot dong hang. */
    expectedQuantity: z.number().int().positive(),
  })
  .strict();

const salesOrderPolicySchema = z
  .object({
    supportedDealerPolicies: uniqueNonEmptyArray(z.enum(POLICY_TYPES)),
    /** Null = chua phe duyet policy tu dong, fail-closed. */
    automation: orderAutomationSchema.nullable(),
    retailAdvice: retailAdviceSchema,
    /**
     * Null (va cung la mac dinh khi khong khai) = KHONG theo doi viec ban giao. Tuy chon co chu
     * y: moi goi khach dang co van hop le sau thay doi nay, va khach nao chua chon nguong thi
     * khong bi he thong chon ho.
     */
    handoffFollowup: salesHandoffFollowupSchema.nullable().optional(),
  })
  .strict();

const tenantPoliciesSchema = z
  .object({
    salesOrder: salesOrderPolicySchema.optional(),
    campaign: campaignConfigSchema.optional(),
    readiness: tenantReadinessSchema,
  })
  .strict();

const tenantIntegrationsSchema = z
  .object({
    /** Runtime env chon mot adapter trong allowlist nay; API se fail-fast neu nam ngoai. */
    channel: channelIntegrationSchema.optional(),
    parser: parserIntegrationSchema.optional(),
    /** ERP la mot adapter active; `none` giu fail-closed cho GĐ1. */
    erp: erpConfigSchema.optional(),
    contentSource: contentSourceIntegrationSchema.optional(),
    /**
     * Workflow engine ben ngoai. TUY CHON co chu dich: khach khong khai bao thi nhan
     * `DisabledWorkflowEngineAdapter` va boot binh thuong — quan sat/nghiep vu khong phu thuoc
     * vao viec co engine hay khong. Xem `workflow-binding.schema.ts`.
     */
    workflowEngine: workflowEngineIntegrationSchema.optional(),
  })
  .strict();

const tenantPersonaSchema = z
  .object({
    messaging: z.object({ botName: nonEmpty, mentionName: nonEmpty }).strict().optional(),
    /** Loi mo dau prompt parser. Thuoc turn-processing: parser chay ca khi khach khong ban gi. */
    turnProcessing: z.object({ parserIntro: nonEmpty }).strict().optional(),
    knowledge: z.object({ productFallbackDescription: nonEmpty }).strict().optional(),
  })
  .strict();

const capabilityRequirements = {
  knowledge: { dependencies: [] },
  messaging: { dependencies: [], integration: 'channel', persona: 'messaging' },
  'turn-processing': {
    dependencies: ['knowledge', 'messaging'],
    integration: 'parser',
    persona: 'turnProcessing',
  },
  /**
   * `sales-order` la mot NGUOI DUNG cua turn-processing, khong phai chu cua no. Quan he phu
   * thuoc di dung mot chieu: ban hang can duong xu ly luot, duong xu ly luot khong can ban hang.
   */
  'sales-order': {
    dependencies: ['knowledge', 'messaging', 'turn-processing'],
    policy: 'salesOrder',
  },
  campaign: { dependencies: ['messaging'], policy: 'campaign' },
  operations: { dependencies: [] },
  notifications: { dependencies: ['messaging'] },
} as const satisfies Record<
  z.infer<typeof capabilityIdSchema>,
  {
    dependencies: readonly z.infer<typeof capabilityIdSchema>[];
    integration?: keyof z.infer<typeof tenantIntegrationsSchema>;
    policy?: keyof z.infer<typeof tenantPoliciesSchema>;
    persona?: keyof z.infer<typeof tenantPersonaSchema>;
  }
>;

export const EXPERIENCE_REQUIREMENTS = {
  'operations-console': ['knowledge', 'messaging', 'turn-processing', 'sales-order', 'operations'],
  'knowledge-workspace': ['knowledge'],
  'agent-workforce': ['knowledge', 'operations'],
} as const satisfies Record<
  z.infer<typeof experienceIdSchema>,
  readonly z.infer<typeof capabilityIdSchema>[]
>;

export const tenantConfigSchema = z
  .object({
    /** V2 la boundary pha vo co chu y; v1/unknown khong duoc silent migrate. */
    schemaVersion: z.literal(2),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: chi chu thuong, so va gach noi'),
    identity: z.object({ displayName: nonEmpty, shortName: nonEmpty }).strict(),
    branding: z
      .object({
        productName: nonEmpty,
        installName: nonEmpty,
        pageTitle: nonEmpty,
        pageDescription: nonEmpty,
        themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'themeColor: dang #rrggbb'),
        backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'backgroundColor: dang #rrggbb'),
        /** Tai nguyen logo cong khai duoc dong goi cung app; chi chap nhan duong dan tuyet doi an toan. */
        logoPath: z
          .string()
          .regex(
            /^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/,
            'logoPath: phai la duong dan public bat dau bang /',
          )
          .refine(
            (path) => !path.split('/').some((segment) => segment === '..'),
            'logoPath: khong duoc chua thanh phan ..',
          )
          .optional(),
        monogram: z.string().min(1).max(3),
        composerPlaceholder: nonEmpty,
      })
      .strict(),
    experience: experienceIdSchema,
    capabilities: uniqueNonEmptyArray(capabilityIdSchema),
    policies: tenantPoliciesSchema,
    integrations: tenantIntegrationsSchema,
    persona: tenantPersonaSchema.default({}),
    bootstrap: tenantBootstrapSchema,
    smoke: smokeFixtureSchema.nullable().default(null),
  })
  .strict()
  .superRefine((config, ctx) => {
    const enabled = new Set(config.capabilities);

    for (const capability of config.capabilities) {
      const requirement = capabilityRequirements[capability];
      for (const dependency of requirement.dependencies) {
        if (!enabled.has(dependency)) {
          ctx.addIssue({
            code: 'custom',
            path: ['capabilities'],
            message: `${capability} yeu cau capability ${dependency}`,
          });
        }
      }
      if ('integration' in requirement && !config.integrations[requirement.integration]) {
        ctx.addIssue({
          code: 'custom',
          path: ['integrations', requirement.integration],
          message: `${capability} yeu cau integration ${requirement.integration}`,
        });
      }
      if ('policy' in requirement && !config.policies[requirement.policy]) {
        ctx.addIssue({
          code: 'custom',
          path: ['policies', requirement.policy],
          message: `${capability} yeu cau policy ${requirement.policy}`,
        });
      }
      if ('persona' in requirement && !config.persona[requirement.persona]) {
        ctx.addIssue({
          code: 'custom',
          path: ['persona', requirement.persona],
          message: `${capability} yeu cau persona ${requirement.persona}`,
        });
      }
    }

    if (enabled.has('knowledge') && !config.bootstrap.knowledge) {
      ctx.addIssue({
        code: 'custom',
        path: ['bootstrap', 'knowledge'],
        message: 'knowledge yeu cau bootstrap.knowledge',
      });
    }
    if (enabled.has('sales-order')) {
      if (!config.bootstrap.salesOrder) {
        ctx.addIssue({
          code: 'custom',
          path: ['bootstrap', 'salesOrder'],
          message: 'sales-order yeu cau bootstrap.salesOrder',
        });
      }
      if (!config.persona.knowledge) {
        ctx.addIssue({
          code: 'custom',
          path: ['persona', 'knowledge'],
          message: 'sales-order yeu cau persona knowledge',
        });
      }
    }

    /*
     * `handoffFollowup.enabled: true` = KHACH DOI MOT BAO DAM, khong phai "khach cho phep".
     *
     * Do la mot lua chon co y giua hai cach doc, va cach kia bi loai:
     *
     *   (A) policy chi CHO PHEP, binding moi bat thuc thi  -> bat `enabled` ma quen binding thi
     *       don van gui, khong ai theo doi, va he thong IM LANG. Dung che do hong ma ca khuon
     *       workflow nay sinh ra de xoa bo — nen no khong duoc phep la mac dinh cua mot loi go.
     *   (B) `enabled` la mot YEU CAU  -> thieu binding la CAU HINH TU MAU THUAN, va no phai hong
     *       to ngay luc boot.
     *
     * Chon (B). Cung khuon voi rang buoc da co o `workflowEngineIntegrationSchema`: "khai
     * adapter=none nhung van bat mot binding" cung bi tu choi vi cung mot ly do.
     *
     * Tat theo doi thi dat `enabled: false` (hoac bo han khoi goi khach) — ro rang va khong
     * mau thuan. `enabled: false` KHONG doi hoi binding nao.
     */
    if (config.policies.salesOrder?.handoffFollowup?.enabled) {
      const integration = config.integrations.workflowEngine;
      const bound = integration?.bindings.some(
        (binding) => binding.key === SALES_HANDOFF_FOLLOWUP_WORKFLOW && binding.enabled,
      );
      if (!bound) {
        ctx.addIssue({
          code: 'custom',
          path: ['policies', 'salesOrder', 'handoffFollowup', 'enabled'],
          message:
            `handoffFollowup.enabled=true doi mot rang buoc workflow dang bat cho ` +
            `'${SALES_HANDOFF_FOLLOWUP_WORKFLOW}' trong integrations.workflowEngine.bindings. ` +
            `Khong co no thi don van gui ma khong ai theo doi. Dat enabled=false neu khong muon ` +
            `theo doi.`,
        });
      }
    }

    for (const requiredCapability of EXPERIENCE_REQUIREMENTS[config.experience]) {
      if (!enabled.has(requiredCapability)) {
        ctx.addIssue({
          code: 'custom',
          path: ['experience'],
          message: `${config.experience} yeu cau capability ${requiredCapability}`,
        });
      }
    }
  });

export type TenantConfig = z.infer<typeof tenantConfigSchema>;
export type CapabilityId = z.infer<typeof capabilityIdSchema>;
export type ExperienceId = z.infer<typeof experienceIdSchema>;
export type TenantBootstrap = z.infer<typeof tenantBootstrapSchema>;
export type TenantIntegrations = z.infer<typeof tenantIntegrationsSchema>;
export type OrderAutomation = z.infer<typeof orderAutomationSchema>;
export type SalesHandoffFollowup = z.infer<typeof salesHandoffFollowupSchema>;
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;
export type RetailAdvice = z.infer<typeof retailAdviceSchema>;
export type ErpConfig = z.infer<typeof erpConfigSchema>;
export type ErpAdapterName = z.infer<typeof erpAdapterSchema>;
export type TenantReadiness = z.infer<typeof tenantReadinessSchema>;
export type SmokeFixture = z.infer<typeof smokeFixtureSchema>;

/**
 * Hat giong nguon su that. Khop 1-1 voi interface `KnowledgeSnapshot` cua apps/api — ben do co
 * mot phep gan kiem kieu de hai hinh khong tro nhau luc nao khong biet.
 */
export const knowledgeSnapshotSchema = z.object({
  pricePeriod: z
    .object({
      validMonth: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .nullable(),
      status: z.enum(['draft', 'active', 'archived']),
      /**
       * NGUON GOC cua bieu gia — phai ghi khi `validMonth` KHONG trung thang in tren van ban goc
       * cua khach. Doi mot nhan thang tran, khong kem cau tra loi "can cu vao dau", la lam gia
       * bang gia: cong readiness `price.current_period` xanh len ma khong ai con lan duoc ve toi
       * to giay nao (CLAUDE.md quyet dinh #10).
       */
      note: z.string().min(1).max(500).optional(),
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
  priceOverrides: z.array(
    z.object({
      dealerId: nonEmpty,
      sku: nonEmpty,
      price: z.number(),
      // Nguong so luong de deal co hieu luc; bo trong = ap moi so luong.
      minQuantity: z.number().int().positive().optional(),
    }),
  ),
  dealers: z.array(
    z.object({
      id: nonEmpty,
      name: nonEmpty,
      aliases: z.array(z.string()),
      tier: z.enum(DEALER_TIERS),
      defaultPolicy: z.enum(POLICY_TYPES),
    }),
  ),
  /**
   * Nhom duoc phep xu ly. `dealerId` la RANG BUOC CUA SALES-ORDER, khong phai cua nhom: mot khach
   * khong ban hang van co nhom can doc, va Prisma da cho `dealerId` null tu truoc (nhom `pending`).
   */
  groups: z.array(
    z.object({
      chatId: nonEmpty,
      dealerId: nonEmpty.optional(),
      branch: z.string(),
      name: z.string(),
    }),
  ),
  glossary: z.array(z.object({ term: nonEmpty, meaning: nonEmpty })),
});

/**
 * Knowledge-only tenant khong phai khai bao gia/dai ly/group cua sales-order. Loader se chuyen
 * boundary nay ve `TenantKnowledge` day du bang cac mang sales rong de consumer chung khong phai
 * re nhanh theo tenant.
 */
export const knowledgeOnlySnapshotSchema = z
  .object({
    products: z
      .array(
        z.object({
          sku: nonEmpty,
          name: nonEmpty,
          aliases: z.array(z.string()),
          unit: nonEmpty,
          description: z.string().optional(),
        }),
      )
      .default([]),
    glossary: z.array(z.object({ term: nonEmpty, meaning: nonEmpty })).default([]),
    /** Danh sach nhom duoc phep dua noi dung sang LLM — cong PII, khong phai map dai ly. */
    groups: z
      .array(z.object({ chatId: nonEmpty, name: z.string(), branch: z.string().default('') }))
      .default([]),
  })
  .strict();

export type TenantKnowledge = z.infer<typeof knowledgeSnapshotSchema>;

/**
 * Noi dung tu van cua khach (FAQ / bai tu van / link video-catalog / media) dong goi kem goi khach.
 * Dung LAI schema import cua nhan (`contentImportManifestSchema`) chu khong dinh nghia schema thu
 * hai: goi khach va man hinh `/settings` phai di qua CUNG mot cong kiem, neu khong thi du lieu hop
 * le o duong nay lai hong o duong kia.
 *
 * File nay TUY CHON — khach chua co noi dung thi khong co file, va agent tu van fail-closed
 * (`ContentService.productAdvice()` tra handoff) chu khong bia cau tra loi.
 */
export const tenantContentManifestSchema = contentImportManifestSchema;
export type TenantContentManifest = ContentImportManifest;

/** Tin nhan mau cho luong demo (`/demo/simulate`) — la vi du dat hang cua chinh khach. */
export const demoMessagesSchema = z.array(nonEmpty).min(1);
export type DemoMessages = z.infer<typeof demoMessagesSchema>;
