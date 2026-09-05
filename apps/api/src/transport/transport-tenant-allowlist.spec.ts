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
   * BAI NAY DA DOI CHO DUA. Ban truoc doi moi goi duoc mien tru phai khai `previewNotice` — tuc mot
   * DAI BANG KHACH NHIN THAY. #195 cam dai bang do tren be mat huong khach, va luc do hai yeu cau
   * danh nhau: khong go duoc dai bang ma khong pha cong bao ve.
   *
   * Cai cong THUC SU muon biet la mot su that KY THUAT: "goi nay co phai khach that khong". Nen no
   * doc `demoTenant` — mot co NOI BO khong bao gio ra man hinh. Nho vay mot goi mau trong y het mot
   * san pham binh thuong ma cong van dung, va #195 khong con phai danh doi voi bao mat.
   */
  it('moi goi duoc phep deu tu khai la GOI MAU — bang mot co NOI BO', () => {
    for (const slug of TRANSPORT_PREVIEW_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      const config = loadTenantConfig();
      expect(config.slug, slug).toBe(slug);
      expect(config.policies.readiness.demoTenant, slug).toBe(true);
    }
  });

  /**
   * Va goi mau KHONG con khai mot dai bang huong khach nao — #195.
   *
   * Bai nay la luoi chan cho mot buoc lui de xay ra: ai do thay man hinh "trong qua" roi them lai
   * `previewNotice` de noi ro day la ban demo. Cau do dung o GitHub va trong tai lieu, khong dung
   * tren man hinh cua nguoi dang xem san pham.
   */
  it('goi mau KHONG con khai mot dai bang huong khach nao', () => {
    for (const slug of TRANSPORT_PREVIEW_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();
      expect(loadTenantConfig().policies.readiness.previewNotice, slug).toBeUndefined();
    }
  });

  /**
   * Chieu nguoc lai, va la chieu quan trong hon: khach THAT khong duoc tu khai la goi mau. Mot goi
   * khach that mang co do se tu mo cho minh mot duong vao danh sach mien tru o lan sua sau.
   */
  it('khong goi khach that nao tu khai la goi mau', () => {
    for (const slug of CUSTOMER_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      expect(loadTenantConfig().policies.readiness.demoTenant ?? false, slug).toBe(false);
    }
  });
});
