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
   * MOT GOI DUOC MIEN TRU KHONG DUOC NOI VAO BAT KY DUONG SONG NAO.
   *
   * TRUOC DAY cau nay duoc kiem bang `readiness.previewNotice`: goi duoc mien tru phai tu khai la
   * ban xem truoc, va loi tu khai do dong thoi bay mot DAI BANG SOC VANG len dau moi man hinh. Dai
   * bang da bi bo theo yeu cau van hanh, nen CHO NEO phai doi — nhung tinh chat thi khong.
   *
   * Cho neo moi la `integrations` + `bootstrap`, va no CHAT HON cho cu vi khong the thoa man bang
   * mot cau van: mot goi duoc mien tru khong khai mot adapter nao (Zalo, ERP, nguon noi dung) va
   * khong co buoc gieo du lieu nao. Ca ba goi khach that deu khai adapter, nen keo mot goi khach
   * that vao danh sach nay se lam bai nay DO ngay.
   */
  it('goi duoc phep khong noi vao mot adapter hay buoc gieo du lieu nao', () => {
    for (const slug of TRANSPORT_PREVIEW_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      const config = loadTenantConfig();
      expect(config.slug, slug).toBe(slug);
      expect(Object.keys(config.integrations), slug).toEqual([]);
      expect(Object.keys(config.bootstrap), slug).toEqual([]);
      expect(config.smoke, slug).toBeNull();
    }
  });

  /**
   * Nua con lai cua bai tren — thu lam cho `integrations: {}` co suc phan biet, thay vi chi la mot
   * su that ngau nhien ve mot goi.
   */
  it('moi goi khach that deu khai it nhat mot adapter', () => {
    for (const slug of CUSTOMER_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      expect(Object.keys(loadTenantConfig().integrations).length, slug).toBeGreaterThan(0);
    }
  });

  /** KHONG goi nao — mien tru hay khach that — duoc bay lai dai bang soc vang. */
  it('khong goi nao tu khai dai bang xem truoc', () => {
    for (const slug of [...TRANSPORT_PREVIEW_TENANTS, ...CUSTOMER_TENANTS]) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      expect(loadTenantConfig().policies.readiness.previewNotice, slug).toBeUndefined();
    }
  });
});
