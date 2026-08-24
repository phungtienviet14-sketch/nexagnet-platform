import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTenantConfig, resetTenantCache, tenantDir } from '../tenant.config.js';

/**
 * MOI `tenant.json` TRONG REPO deu phai qua duoc schema — ke ca cac goi FIXTURE.
 *
 * `tenant-packs.spec.ts` chi quet thu muc `tenants/` (khach that). Nhung goi khach gia con nam rai
 * rac: fixture cua loader, va — cho da lam vo bo test — `apps/web/e2e/fixtures/tenant/`.
 *
 * VI SAO TEP NAY TON TAI: ngay 24/08/2026, ban tach capability `turn-processing` doi
 * `persona.salesOrder` -> `persona.turnProcessing`. Moi goi khach that va moi fixture cua loader
 * deu duoc sua; goi fixture cua e2e thi khong ai nho, vi khong mot bai test nao trong `pnpm test`
 * cham vao no. Hau qua: `pnpm test` XANH, `typecheck` XANH, `lint` XANH — roi job `e2e` cua CI
 * chet sau muoi hai phut voi `persona: Invalid input`, va Next.js chi noi duoc dieu do luc render
 * layout.
 *
 * Mot goi khach hong phai vo o CHO RE NHAT: bo test cua loader, khong phai mot may chu Playwright.
 */

/** `tenantDir()` can mot TENANT de tra duong dan; gia tri khong quan trong, chi lay goc repo. */
function tenantDirForRoot(): string {
  process.env.TENANT = 'de-lay-duong-dan';
  delete process.env.TENANT_DIR;
  return tenantDir();
}

const repoRoot = resolve(dirname(tenantDirForRoot()), '..');

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage', 'test-results']);

function findTenantJson(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findTenantJson(join(dir, entry.name), found);
    } else if (entry.name === 'tenant.json') {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

const packs = findTenantJson(repoRoot).map((file) => ({
  dir: dirname(file),
  label: relative(repoRoot, dirname(file)).replace(/\\/g, '/'),
}));

afterEach(() => {
  delete process.env.TENANT;
  delete process.env.TENANT_DIR;
  resetTenantCache();
});

describe('moi goi khach trong repo — that lan fixture', () => {
  it('tim thay nhieu hon danh sach `tenants/` (neu khong, phep quet nay dang mu)', () => {
    expect(packs.length).toBeGreaterThan(0);
    expect(packs.some(({ label }) => !label.startsWith('tenants/'))).toBe(true);
  });

  for (const { dir, label } of packs) {
    it(`${label}: qua duoc schema contract v2`, () => {
      delete process.env.TENANT;
      process.env.TENANT_DIR = dir;
      resetTenantCache();

      expect(() => loadTenantConfig()).not.toThrow();
    });
  }
});
