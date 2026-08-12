import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import {
  demoMessagesSchema,
  knowledgeSnapshotSchema,
  tenantConfigSchema,
  type DemoMessages,
  type TenantConfig,
  type TenantKnowledge,
} from './tenant.schema.js';

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
  const declared = new Set<string>(loadTenantConfig().policies);
  const lac = knowledge.dealers.filter((dealer) => !declared.has(dealer.defaultPolicy));
  if (lac.length === 0) return;

  const chiTiet = lac.map((d) => `  - ${d.id}: ${d.defaultPolicy}`).join('\n');
  throw new Error(
    'Goi khach mau thuan: dai ly dung chinh sach khong co trong tenant.json.policies ' +
      `[${[...declared].join(', ')}]\n${chiTiet}`,
  );
}

export function loadTenantKnowledge(): TenantKnowledge {
  if (cachedKnowledge) return cachedKnowledge;
  const knowledge = readPackFile('data/knowledge.json', knowledgeSnapshotSchema);
  assertDealerPoliciesDeclared(knowledge);
  cachedKnowledge = knowledge;
  return cachedKnowledge;
}

/** Tin mau cho luong demo. Goi khach khong co file nay -> mang rong (demo khong co goi y san). */
export function loadDemoMessages(): DemoMessages {
  if (cachedDemoMessages) return cachedDemoMessages;
  const path = join(tenantDir(), 'data/demo-messages.json');
  cachedDemoMessages = existsSync(path)
    ? readPackFile('data/demo-messages.json', demoMessagesSchema)
    : [];
  return cachedDemoMessages;
}

/** Giong noi cua khach trong prompt LLM (thay cho ten khach truoc day hardcode trong code). */
export function tenantPersona(): TenantConfig['persona'] {
  return loadTenantConfig().persona;
}

/** Chuoi giao dien cua khach (thay cho chuoi hardcode trong apps/web). */
export function tenantBranding(): TenantConfig['branding'] {
  return loadTenantConfig().branding;
}

/** Policy tu xac nhan don cua tenant; null nghia la chua duoc phe duyet, phai fail-closed. */
export function tenantOrderAutomation(): TenantConfig['orderAutomation'] {
  return loadTenantConfig().orderAutomation;
}

/** Policy phan phoi/retry campaign cua tenant; du lieu campaign runtime van nam trong Postgres. */
export function tenantCampaignConfig(): TenantConfig['campaign'] {
  return loadTenantConfig().campaign;
}

/** Chien luoc tu van gia le cua tenant; khong re nhanh theo slug trong core. */
export function tenantRetailAdvice(): TenantConfig['retailAdvice'] {
  return loadTenantConfig().retailAdvice;
}

/** He thong ERP cua khach; nhan chi biet cong `ErpPort`, khong biet ten nha cung cap (G1-12). */
export function tenantErp(): TenantConfig['erp'] {
  return loadTenantConfig().erp;
}

/** Blocker do tenant khai bao de health/settings hien thi ma core khong biet ten khach. */
export function tenantReadiness(): TenantConfig['readiness'] {
  return loadTenantConfig().readiness;
}

/** Chi dung trong test: xoa cache de doc lai goi khach sau khi doi TENANT/TENANT_DIR. */
export function resetTenantCache(): void {
  cachedConfig = undefined;
  cachedKnowledge = undefined;
  cachedDemoMessages = undefined;
}
