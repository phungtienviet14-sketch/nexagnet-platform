import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadDemoMessages,
  loadTenantConfig,
  loadTenantKnowledge,
  resetTenantCache,
  tenantDir,
} from '../tenant.config.js';

/**
 * MOI goi khach co that trong `tenants/` deu phai nap duoc.
 *
 * Khac `tenant.config.spec.ts` (chi dung goi GIA de kiem co che loader), file nay LIET KE thu muc
 * that va nap tung goi bang chinh loader — nen goi khach moi tu dong duoc phu, khong phai nho ai do
 * nho them test. Mot goi hong ma khong co test nay thi chi lo ra luc boot cua dung khach do, tuc la
 * lo ra o production.
 *
 * Khang dinh o day CO Y chi ve cau truc: khong nhac ten san pham, gia hay dai ly cua khach nao.
 */

// tenantDir() tra <goc repo>/tenants/<slug> -> lay thu muc cha de liet ke, khoi do lai goc repo.
process.env.TENANT = 'de-lay-duong-dan';
delete process.env.TENANT_DIR;
const TENANTS_DIR = dirname(tenantDir());

const slugs = readdirSync(TENANTS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

afterEach(() => {
  delete process.env.TENANT;
  delete process.env.TENANT_DIR;
  resetTenantCache();
});

describe('goi khach co that trong tenants/', () => {
  it('co it nhat mot goi (khong thi cac test duoi day xanh mot cach vo nghia)', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    it(`${slug}: nap duoc bang loader that, khong nem`, () => {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      const cfg = loadTenantConfig();

      // Slug trong file phai trung TEN THU MUC. Lech nhau thi `TENANT=<thu muc>` van nap duoc nhung
      // moi thu bao cao theo slug kia — sai lam rat kho lan ra.
      expect(cfg.slug).toBe(slug);
      // Nem neu sai schema, hoac neu mot dai ly dung chinh sach khong khai bao trong policies (D28).
      expect(() => loadTenantKnowledge()).not.toThrow();
      expect(() => loadDemoMessages()).not.toThrow();
    });
  }
});
