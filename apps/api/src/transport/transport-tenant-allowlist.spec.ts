import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTenantConfig, resetTenantCache } from '@netviet/tenant';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CUSTOMER_TENANTS,
  TRANSPORT_PREVIEW_TENANTS,
  readTenantPacks,
} from './__tests__/tenant-packs.js';

/**
 * AI DUOC PHEP BAT NGHIEP VU VAN TAI — va bang chung rang cai quyen do khong lan sang khach that.
 *
 * Nam cong `*.composition.spec.ts` tra loi cau "khach nay co bat `transport-*` khong". Chung deu
 * bo qua cac slug trong `TRANSPORT_PREVIEW_TENANTS`. Neu chi co the thi danh sach do la mot lo
 * hong: them mot dong vao no la mo duong cho bat ky khach nao, va khong bai nao keu.
 *
 * Tep nay dong lo hong do. No khong kiem cac goi khach — no kiem CHINH DANH SACH.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

afterEach(() => {
  delete process.env.TENANT;
  delete process.env.TENANT_DIR;
  resetTenantCache();
});

describe('danh sach goi khach duoc phep bat nghiep vu van tai', () => {
  it('KHONG mot goi khach that nao nam trong danh sach cho phep', () => {
    for (const slug of CUSTOMER_TENANTS) {
      expect(TRANSPORT_PREVIEW_TENANTS, slug).not.toContain(slug);
    }
  });

  /**
   * Danh sach khach that phai bam vao thuc te tren dia. Neu khong, xoa mot goi khach di la lang le
   * lam bai tren day thanh mot cau dung mot cach vo nghia.
   */
  it('moi goi khach that trong danh sach van con tren dia', () => {
    const onDisk = readTenantPacks(repoRoot).map((pack) => pack.slug);
    for (const slug of CUSTOMER_TENANTS) expect(onDisk, slug).toContain(slug);
  });

  it('moi slug duoc phep phai la mot goi co that', () => {
    const onDisk = readTenantPacks(repoRoot).map((pack) => pack.slug);
    for (const slug of TRANSPORT_PREVIEW_TENANTS) expect(onDisk, slug).toContain(slug);
  });

  /**
   * MOT GOI DUOC MIEN TRU PHAI TU NHAN LA BAN XEM TRUOC.
   *
   * Day la cho hai muc dich gap nhau: `readiness.previewNotice` vua la thu bay dai bang tren man
   * hinh, vua la loi tu khai bang van ban rang goi nay khong phai ban cho khach dung. Bat buoc no
   * o day nghia la khong the lang le them mot goi vao danh sach mien tru ma khong dong thoi noi
   * that dieu do voi bat ky ai mo man hinh len.
   */
  it('moi goi duoc phep deu tu khai la ban xem truoc', () => {
    for (const slug of TRANSPORT_PREVIEW_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      const config = loadTenantConfig();
      expect(config.slug, slug).toBe(slug);
      expect(config.policies.readiness.previewNotice, slug).toBeDefined();
      expect(config.policies.readiness.previewNotice?.label.length, slug).toBeGreaterThan(0);
      expect(config.policies.readiness.previewNotice?.note.length, slug).toBeGreaterThan(0);
    }
  });

  /**
   * Chieu nguoc lai, va la chieu quan trong hon: khach THAT khong duoc co dai bang xem truoc.
   * Mot goi khach that tu nhan la "ban xem truoc" se vua lam sai ky vong cua khach, vua tu mo cho
   * minh mot duong vao danh sach mien tru o lan sua sau.
   */
  it('khong goi khach that nao tu khai la ban xem truoc', () => {
    for (const slug of CUSTOMER_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      expect(loadTenantConfig().policies.readiness.previewNotice, slug).toBeUndefined();
    }
  });
});
