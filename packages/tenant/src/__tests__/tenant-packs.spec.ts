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

      // TRI THUC LA MOT CAPABILITY, KHONG PHAI MOT DIEU HIEN NHIEN.
      //
      // `loadTenantKnowledge()` nem CO CHU Y khi tenant khong bat `knowledge`
      // (`tenant.config.ts:130-133`), va schema chua bao gio doi moi khach phai bat no. Truoc day
      // bai nay goi thang loader cho MOI goi, nen no vo tinh khang dinh mot dieu manh hon schema:
      // "moi khach that deu ban hang hoac it nhat co tri thuc". Mot khach van tai thuan tuy lam
      // cau do sai — va lam do mot bai test le ra phai noi ve viec NAP GOI.
      //
      // Nay kiem dung ca hai chieu, nen ranh gioi capability van duoc khoa chat nhu cu.
      if (cfg.capabilities.includes('knowledge')) {
        // Nem neu sai schema, hoac neu mot dai ly dung chinh sach khong khai trong policies (D28).
        expect(() => loadTenantKnowledge()).not.toThrow();
      } else {
        expect(() => loadTenantKnowledge()).toThrow(/knowledge/i);
      }
      expect(() => loadDemoMessages()).not.toThrow();
    });
  }
});
