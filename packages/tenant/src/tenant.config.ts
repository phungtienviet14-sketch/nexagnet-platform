import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import {
  demoMessagesSchema,
  knowledgeOnlySnapshotSchema,
  knowledgeSnapshotSchema,
  tenantConfigSchema,
  tenantContentManifestSchema,
  type DemoMessages,
  type CapabilityId,
  type ExperienceId,
  type TenantConfig,
  type TenantContentManifest,
  type TenantKnowledge,
} from './tenant.schema.js';
import {
  NO_WORKFLOW_ENGINE,
  type WorkflowBinding,
  type WorkflowEngineIntegration,
} from './workflow-binding.schema.js';

/**
 * Nap GOI KHACH (`tenants/<slug>/`) — ranh gioi giua NEN TANG dung chung va DU LIEU rieng cua
 * tung khach. Truoc Dot B1 phan nay nam thang trong code (`knowledge/seed.ts` + ten khach hardcode
 * trong prompt parser va trong app web) nen them khach thu hai la phai sua nhan.
 *
 * Chon goi khach bang bien moi truong — BAT BUOC dat mot trong hai:
 *   TENANT=<slug>     -> <goc repo>/tenants/<slug>/
 *   TENANT_DIR=<path> -> dung thang duong dan nay, uu tien hon TENANT. Danh cho khach chay tren
 *                        HA TANG RIENG: mount goi tu ngoai, khong nam trong image.
 *
 * CO Y KHONG CO GIA TRI MAC DINH. Mot mac dinh nhu `ultty` se lam nhan "biet" mot khach cu the,
 * va nguy hiem hon: quen dat TENANT tren stack cua khach B se lang le nap du lieu cua khach A.
 * Thieu bien -> nem ngay luc boot.
 */

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';
const MAX_WALK_UP = 8;

/**
 * Goc repo = thu muc chua pnpm-workspace.yaml, do NGUOC tu vi tri file nay.
 * KHONG dung process.cwd(): test chay o apps/api, script prisma chay o goc repo, container
 * chay o /app — cwd moi noi mot khac, con duong dan tuong doi voi file nay thi khong doi.
 */
function repoRoot(): string {
  const from = dirname(fileURLToPath(import.meta.url));
  let dir = from;
  for (let i = 0; i < MAX_WALK_UP; i += 1) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Khong tim thay ${WORKSPACE_MARKER} khi do nguoc tu ${from}`);
}

/**
 * Thu muc goi khach dang dung.
 * Doc THANG process.env (khong qua loadEnv): ham nay chay luc NAP MODULE — seed cua nguon su that
 * nam trong do thi import cua gan nhu moi module — con loadEnv() chi chay sau khi main.ts nap .env.
 */
export function tenantDir(): string {
  const override = process.env.TENANT_DIR?.trim();
  if (override) return isAbsolute(override) ? override : resolve(process.cwd(), override);
  const slug = process.env.TENANT?.trim();
  if (!slug) {
    throw new Error(
      'Thieu bien TENANT: khong biet nap goi khach nao. Dat TENANT=<slug> (thu muc trong tenants/), ' +
        'hoac TENANT_DIR=<duong dan> neu goi khach nam ngoai repo. Xem tenants/README.md.',
    );
  }
  return join(repoRoot(), 'tenants', slug);
}

/** Doc + validate mot file trong goi khach. Thieu file hoac sai schema -> nem, khong doan bua. */
function readPackFile<S extends z.ZodType>(relativePath: string, schema: S): z.infer<S> {
  const path = join(tenantDir(), relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `Goi khach thieu file: ${path}. Kiem tra bien TENANT/TENANT_DIR, hoac tao goi theo tenants/README.md.`,
    );
  }
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(goc)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Goi khach sai schema: ${path}\n${issues}`);
  }
  return parsed.data;
}

// Goi khach khong doi trong mot lan chay -> doc dia mot lan roi giu lai.
let cachedConfig: TenantConfig | undefined;
let cachedKnowledge: TenantKnowledge | undefined;
let cachedDemoMessages: DemoMessages | undefined;
// `null` = da doc dia va goi khach KHONG co file noi dung; `undefined` = chua doc lan nao.
let cachedContentManifest: TenantContentManifest | null | undefined;

export function loadTenantConfig(): TenantConfig {
  cachedConfig ??= readPackFile('tenant.json', tenantConfigSchema);
  return cachedConfig;
}

/**
 * Chinh sach mac dinh cua tung dai ly phai nam trong danh sach khach khai bao (D28, phuong an B).
 * Kiem o day chu khong o zod schema vi hai gia tri nam o HAI file khac nhau — `tenant.json` va
 * `data/knowledge.json` — nen khong mot schema don le nao nhin thay ca hai.
 */
function assertDealerPoliciesDeclared(knowledge: TenantKnowledge): void {
  const declared = new Set<string>(
    loadTenantConfig().policies.salesOrder?.supportedDealerPolicies ?? [],
  );
  const lac = knowledge.dealers.filter((dealer) => !declared.has(dealer.defaultPolicy));
  if (lac.length === 0) return;

  const chiTiet = lac.map((d) => `  - ${d.id}: ${d.defaultPolicy}`).join('\n');
  throw new Error(
    'Goi khach mau thuan: dai ly dung chinh sach khong co trong ' +
      'tenant.json.policies.salesOrder.supportedDealerPolicies ' +
      `[${[...declared].join(', ')}]\n${chiTiet}`,
  );
}

export function loadTenantKnowledge(): TenantKnowledge {
  if (cachedKnowledge) return cachedKnowledge;
  const config = loadTenantConfig();
  if (!config.capabilities.includes('knowledge')) {
    throw new Error('Capability knowledge khong duoc bat cho tenant nay');
  }

  const salesOrderEnabled = config.capabilities.includes('sales-order');
  const relativePath = salesOrderEnabled
    ? config.bootstrap.salesOrder?.path
    : config.bootstrap.knowledge?.path;
  if (!relativePath) {
    throw new Error(
      `Thieu bootstrap.${salesOrderEnabled ? 'salesOrder' : 'knowledge'} cho capability knowledge`,
    );
  }

  const knowledge = salesOrderEnabled
    ? readPackFile(relativePath, knowledgeSnapshotSchema)
    : (() => {
        const base = readPackFile(relativePath, knowledgeOnlySnapshotSchema);
        return {
          pricePeriod: null,
          products: base.products,
          prices: [],
          priceOverrides: [],
          dealers: [],
          // Nhom KHONG rong o day nua: no la cong "duoc phep dua sang LLM", va khach khong ban
          // hang cung phai khai duoc nhom cua ho. Cai vang mat la `dealerId`, khong phai nhom.
          groups: base.groups,
          glossary: base.glossary,
        } satisfies TenantKnowledge;
      })();
  if (salesOrderEnabled) assertDealerPoliciesDeclared(knowledge);
  cachedKnowledge = knowledge;
  return cachedKnowledge;
}

/** Tin mau cho luong demo. Goi khach khong co file nay -> mang rong (demo khong co goi y san). */
export function loadDemoMessages(): DemoMessages {
  if (cachedDemoMessages) return cachedDemoMessages;
  const relativePath = loadTenantConfig().bootstrap.demoMessages?.path;
  if (!relativePath) return (cachedDemoMessages = []);
  const path = join(tenantDir(), relativePath);
  cachedDemoMessages = existsSync(path) ? readPackFile(relativePath, demoMessagesSchema) : [];
  return cachedDemoMessages;
}

/**
 * Noi dung tu van dong goi kem goi khach (FAQ / bai tu van / link video-catalog).
 *
 * TUY CHON: khach chua nhap noi dung thi khong co file -> `null`, va he thong van chay (agent tu
 * van fail-closed thanh handoff Sale). CO file nhung SAI schema thi NEM luc boot — mot manifest
 * hong ma bo qua trong im lang la cach chac chan de phat hien thieu FAQ vao dung luc dang chat
 * voi khach.
 *
 * Day la HAT GIONG: import chay o trang thai `draft`, phai co nguoi duyet len `active` moi duoc
 * dung de tra loi (xem `ContentService`).
 */
export function loadTenantContentManifest(): TenantContentManifest | null {
  if (cachedContentManifest !== undefined) return cachedContentManifest;
  const relativePath = loadTenantConfig().bootstrap.content?.path;
  if (!relativePath) return (cachedContentManifest = null);
  const path = join(tenantDir(), relativePath);
  cachedContentManifest = existsSync(path)
    ? readPackFile(relativePath, tenantContentManifestSchema)
    : null;
  return cachedContentManifest;
}

export interface LegacyTenantPersona {
  parserIntro: string;
  botName: string;
  mentionName: string;
  productFallbackDescription: string;
}

function assertCapability(capability: CapabilityId): TenantConfig {
  const config = loadTenantConfig();
  if (!config.capabilities.includes(capability)) {
    throw new Error(`Capability ${capability} khong duoc bat cho tenant ${config.slug}`);
  }
  return config;
}

/**
 * Doc mot KHOI persona thuoc dung capability so huu no.
 *
 * Hai cong, khong phai mot: (1) capability co duoc bat khong, (2) khoi persona cua chinh no co
 * mat khong. Gop hai cau hoi lai la cach chac chan de mot khach thieu du lieu cua mien A nhan
 * duoc thong bao noi ve mien B — dung chuyen da xay ra voi shape gop truoc day.
 */
function personaBlock<K extends keyof TenantConfig['persona']>(
  capability: CapabilityId,
  key: K,
): NonNullable<TenantConfig['persona'][K]> {
  const config = assertCapability(capability);
  const block = config.persona[key];
  if (!block) {
    throw new Error(
      `Tenant ${config.slug} bat capability ${capability} nhung thieu persona.${String(key)}`,
    );
  }
  return block;
}

/**
 * Ten bot cua khach — thuoc `messaging`.
 *
 * Doc tu `channels/auto-label.ts` (nhan tin tu dong) va `channels/bot-name.ts` (boc @mention).
 * CA HAI deu chay o khach khong doc tin va khong ban gi: mot chien dich CSKH mot chieu van phai
 * gan nhan "tin tu dong" theo dieu khoan Zalo. Buoc chung vao `turn-processing` nghia la mot
 * khach `[messaging, campaign]` — hop le theo hop dong — nem ngay o lan gui tin dau tien.
 */
export function tenantMessagingPersona(): NonNullable<TenantConfig['persona']['messaging']> {
  return personaBlock('messaging', 'messaging');
}

/** Loi mo dau prompt parser — thuoc `turn-processing`. */
export function tenantTurnProcessingPersona(): NonNullable<
  TenantConfig['persona']['turnProcessing']
> {
  return personaBlock('turn-processing', 'turnProcessing');
}

/** Cau thay the khi mot san pham chua co mo ta — thuoc `knowledge`. */
export function tenantKnowledgePersona(): NonNullable<TenantConfig['persona']['knowledge']> {
  return personaBlock('knowledge', 'knowledge');
}

/**
 * Shape GOP cho prompt parser — noi duy nhat that su can ca ba khoi cung luc.
 *
 * Neo vao `turn-processing` chu KHONG phai `sales-order` (24/08/2026). Doi ca ba khoi la DUNG o
 * day va chi o day: hop dong capability bat `turn-processing` phu thuoc `messaging` + `knowledge`,
 * nen khach nao dung duoc ham nay thi chac chan da khai du. Ben goi chi can MOT truong thi phai
 * dung accessor cua capability so huu truong do.
 */
export function tenantPersona(): LegacyTenantPersona {
  return {
    parserIntro: tenantTurnProcessingPersona().parserIntro,
    botName: tenantMessagingPersona().botName,
    mentionName: tenantMessagingPersona().mentionName,
    productFallbackDescription: tenantKnowledgePersona().productFallbackDescription,
  };
}

/** Chuoi giao dien cua khach (thay cho chuoi hardcode trong apps/web). */
export function tenantBranding(): TenantConfig['branding'] {
  return loadTenantConfig().branding;
}

/** Policy tu xac nhan don cua tenant; null nghia la chua duoc phe duyet, phai fail-closed. */
export function tenantIdentity(): TenantConfig['identity'] {
  return loadTenantConfig().identity;
}

export function tenantExperience(): ExperienceId {
  return loadTenantConfig().experience;
}

export function tenantCapabilities(): readonly CapabilityId[] {
  return loadTenantConfig().capabilities;
}

export function tenantHasCapability(capability: CapabilityId): boolean {
  return loadTenantConfig().capabilities.includes(capability);
}

export function tenantIntegrations(): TenantConfig['integrations'] {
  return loadTenantConfig().integrations;
}

export function tenantBootstrap(): TenantConfig['bootstrap'] {
  return loadTenantConfig().bootstrap;
}

/**
 * Policy tu xac nhan don cua tenant; `null` nghia la KHONG tu xac nhan — fail-closed.
 *
 * `null` bao gom ca hai truong hop, co chu y: (a) khach ban hang nhung chua duoc phe duyet policy;
 * (b) khach KHONG ban hang. Ca hai deu dan toi cung mot hanh vi dung — khong tu gui don — nen
 * ep ben goi phan biet chung chi tao ra mot cai bay: truoc 24/08/2026 ham nay NEM o (b), va
 * `PipelineService` goi no cho MOI luot, nen mot khach khong ban hang khong chay noi mot luot nao.
 */
export function tenantOrderAutomation(): NonNullable<
  TenantConfig['policies']['salesOrder']
>['automation'] {
  const config = loadTenantConfig();
  if (!config.capabilities.includes('sales-order')) return null;
  return config.policies.salesOrder?.automation ?? null;
}

/** Policy phan phoi/retry campaign cua tenant; du lieu campaign runtime van nam trong Postgres. */
export function tenantCampaignConfig(): NonNullable<TenantConfig['policies']['campaign']> {
  const campaign = assertCapability('campaign').policies.campaign;
  if (!campaign) throw new Error('Tenant campaign thieu policies.campaign');
  return campaign;
}

/** Chien luoc tu van gia le cua tenant; khong re nhanh theo slug trong core. */
export function tenantRetailAdvice(): NonNullable<
  TenantConfig['policies']['salesOrder']
>['retailAdvice'] {
  const salesOrder = assertCapability('sales-order').policies.salesOrder;
  if (!salesOrder) throw new Error('Tenant sales-order thieu policies.salesOrder');
  return salesOrder.retailAdvice;
}

/**
 * Nhu tren, nhung `null` khi khach KHONG ban hang — thay vi nem.
 *
 * Duong xu ly luot (turn-processing) chay cho ca khach khong ban gi, va no van gap cau hoi co
 * chu "gia". Truoc 24/08/2026 no goi thang `tenantRetailAdvice()`, nen mot khach chi tra loi tin
 * nhan vap `Capability sales-order khong duoc bat` ngay giua mot luot. `null` o day co nghia
 * chinh xac la: "khong bao gia" — mot cau tra loi hop le, khong phai mot loi cau hinh.
 */
export function tenantRetailAdviceOrNull():
  NonNullable<TenantConfig['policies']['salesOrder']>['retailAdvice'] | null {
  const config = loadTenantConfig();
  if (!config.capabilities.includes('sales-order')) return null;
  return tenantRetailAdvice();
}

/** He thong ERP cua khach; nhan chi biet cong `ErpPort`, khong biet ten nha cung cap (G1-12). */
export function tenantErp(): NonNullable<TenantConfig['integrations']['erp']> {
  return loadTenantConfig().integrations.erp ?? { adapter: 'none' };
}

/** Blocker do tenant khai bao de health/settings hien thi ma core khong biet ten khach. */
/**
 * Rang buoc workflow cua khach. Khach khong khai bao -> `NO_WORKFLOW_ENGINE` (fail-closed),
 * KHONG nem: mot khach khong dung workflow engine phai boot binh thuong.
 */
export function tenantWorkflowEngine(): WorkflowEngineIntegration {
  return loadTenantConfig().integrations.workflowEngine ?? NO_WORKFLOW_ENGINE;
}

/** Rang buoc DANG BAT cho mot khuon workflow. `undefined` = khach khong chay khuon nay. */
export function tenantWorkflowBinding(workflowKey: string): WorkflowBinding | undefined {
  const integration = tenantWorkflowEngine();
  if (integration.adapter === 'none') return undefined;
  return integration.bindings.find((binding) => binding.key === workflowKey && binding.enabled);
}

export function tenantReadiness(): TenantConfig['policies']['readiness'] {
  return loadTenantConfig().policies.readiness;
}

/** Chi dung trong test: xoa cache de doc lai goi khach sau khi doi TENANT/TENANT_DIR. */
export function resetTenantCache(): void {
  cachedConfig = undefined;
  cachedKnowledge = undefined;
  cachedDemoMessages = undefined;
  cachedContentManifest = undefined;
}
