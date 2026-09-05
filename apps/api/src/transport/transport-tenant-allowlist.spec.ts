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
   * TRUOC #195, cau nay duoc kiem bang `readiness.previewNotice`: goi duoc mien tru phai tu khai
   * la ban xem truoc, va loi tu khai do dong thoi bay mot dai bang len man hinh. #195 bo dai bang
   * — no la ngon ngu noi bo tren be mat khach hang — nen CHO NEO cua bai kiem phai doi.
   *
   * Tinh chat can giu KHONG doi: khong the lang le them mot goi vao danh sach mien tru roi tro no
   * vao mot khach that. Cho neo moi la `integrations` + `bootstrap`, va no CHAT HON cho cu vi no
   * khong the thoa man bang mot cau van: mot goi duoc mien tru khong khai mot adapter nao (Zalo,
   * ERP, nguon noi dung) va khong co buoc gieo du lieu nao. Ca ba goi khach that deu khai — nen
   * keo mot goi khach that vao danh sach nay se lam bai nay DO ngay, khong can ai nho viet them
   * mot cau tu khai.
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
   * Chieu nguoc lai: moi goi khach THAT deu phai khai it nhat mot adapter. Day la nua con lai cua
   * bai tren — no la thu lam cho `integrations: {}` co suc phan biet, thay vi chi la mot su that
   * ngau nhien ve mot goi.
   */
  it('moi goi khach that deu khai it nhat mot adapter', () => {
    for (const slug of CUSTOMER_TENANTS) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      expect(Object.keys(loadTenantConfig().integrations).length, slug).toBeGreaterThan(0);
    }
  });

  /**
   * KHONG GOI NAO — mien tru hay khach that — duoc bay dai bang xem truoc.
   *
   * `previewNotice` van con trong schema nhu mot nang luc cua nen tang, nhung khong be mat khach
   * hang nao duoc dung no: mot dai bang noi "BẢN XEM TRƯỚC / khong phai UAT / khong co du lieu
   * khach hang" la ngon ngu noi bo, va #195 bo han no. Bai nay giu cho no khong quay lai bang mot
   * lan sua goi khach.
   */
  it('khong goi nao tu khai dai bang xem truoc', () => {
    for (const slug of [...TRANSPORT_PREVIEW_TENANTS, ...CUSTOMER_TENANTS]) {
      process.env.TENANT = slug;
      delete process.env.TENANT_DIR;
      resetTenantCache();

      expect(loadTenantConfig().policies.readiness.previewNotice, slug).toBeUndefined();
    }
  });
});
