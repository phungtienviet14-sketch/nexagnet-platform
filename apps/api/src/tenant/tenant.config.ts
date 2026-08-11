import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import type { KnowledgeSnapshot } from '../knowledge/domain.js';
import { knowledgeSnapshotSchema, tenantConfigSchema, type TenantConfig } from './tenant.schema.js';

/**
 * Nap GOI KHACH (`tenants/<slug>/`) — ranh gioi giua NEN TANG dung chung va DU LIEU rieng
 * cua tung khach. Truoc Dot B1 phan nay nam thang trong code (`knowledge/seed.ts` + ten khach
 * hardcode trong prompt parser) nen them khach thu hai la phai sua nhan.
 *
 * Chon goi khach bang bien moi truong:
 *   TENANT=<slug>     -> <goc repo>/tenants/<slug>/        (mac dinh `ultty`)
 *   TENANT_DIR=<path> -> dung thang duong dan nay, uu tien hon TENANT. Danh cho khach chay
 *                        tren HA TANG RIENG: mount goi tu ngoai, khong nam trong image.
 */

const DEFAULT_TENANT_SLUG = 'ultty';
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
 * Doc THANG process.env (khong qua loadEnv): ham nay chay luc NAP MODULE — seed.ts nam trong
 * do thi import cua gan nhu moi module — con loadEnv() chi chay sau khi main.ts nap .env.
 */
export function tenantDir(): string {
  const override = process.env.TENANT_DIR?.trim();
  if (override) return isAbsolute(override) ? override : resolve(process.cwd(), override);
  const slug = process.env.TENANT?.trim() || DEFAULT_TENANT_SLUG;
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
let cachedKnowledge: KnowledgeSnapshot | undefined;

export function loadTenantConfig(): TenantConfig {
  cachedConfig ??= readPackFile('tenant.json', tenantConfigSchema);
  return cachedConfig;
}

export function loadTenantKnowledge(): KnowledgeSnapshot {
  cachedKnowledge ??= readPackFile('data/knowledge.json', knowledgeSnapshotSchema);
  return cachedKnowledge;
}

/** Giong noi cua khach trong prompt LLM (thay cho ten khach truoc day hardcode trong code). */
export function tenantPersona(): TenantConfig['persona'] {
  return loadTenantConfig().persona;
}

/** Chi dung trong test: xoa cache de doc lai goi khach sau khi doi TENANT/TENANT_DIR. */
export function resetTenantCache(): void {
  cachedConfig = undefined;
  cachedKnowledge = undefined;
}
