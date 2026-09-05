import { resetTenantCache } from '@netviet/tenant';
import { afterEach, describe, expect, it } from 'vitest';
import { CUSTOMER_TENANTS, TRANSPORT_PREVIEW_TENANTS } from '../__tests__/tenant-packs.js';
import {
  DEMO_RESET_ENV,
  DEMO_RESET_TOKEN,
  DemoTenantGuardError,
  assertDemoResetAllowed,
  assertTransportDemoTenant,
  isTransportDemoTenant,
} from './demo-guard.js';

/**
 * CONG BAO VE cua duong gieo/xoa du lieu mau.
 *
 * Bai nay khong kiem "ham co chay khong" — no kiem DIEU DUY NHAT dang gia: khong mot goi khach
 * THAT nao di qua duoc cong. Nen no chay tren CHINH danh sach goi khach tren dia, khong tren mot
 * cau hinh gia: mot bai test dung `TENANT_DIR` tro vao thu muc tam se van xanh sau ngay ai do go
 * `demoTenant: true` vao goi cua mot khach that.
 */

const useTenant = (slug: string): void => {
  process.env.TENANT = slug;
  delete process.env.TENANT_DIR;
  resetTenantCache();
};

afterEach(() => {
  delete process.env.TENANT;
  delete process.env.TENANT_DIR;
  resetTenantCache();
});

describe('cong bao ve cua du lieu van tai mau', () => {
  it('goi mau di qua duoc', () => {
    for (const slug of TRANSPORT_PREVIEW_TENANTS) {
      useTenant(slug);
      expect(isTransportDemoTenant(), slug).toBe(true);
      expect(() => assertTransportDemoTenant('gieo'), slug).not.toThrow();
    }
  });

  /** NUA QUAN TRONG CUA CAP. Bai tren mot minh khong ngan duoc gi. */
  it('KHONG goi khach that nao di qua duoc — ke ca duong gieo', () => {
    for (const slug of CUSTOMER_TENANTS) {
      useTenant(slug);
      expect(isTransportDemoTenant(), slug).toBe(false);
      expect(() => assertTransportDemoTenant('gieo'), slug).toThrow(DemoTenantGuardError);
    }
  });

  it('loi bao ra goi TEN goi khach bi tu choi — nguoi truc khong phai doan', () => {
    const slug = CUSTOMER_TENANTS[0] as string;
    useTenant(slug);
    expect(() => assertTransportDemoTenant('gieo du lieu van tai mau')).toThrow(new RegExp(slug));
  });

  describe('duong XOA doi hai dieu doc lap', () => {
    it('goi mau + dung chuoi xac nhan thi cho qua', () => {
      useTenant(TRANSPORT_PREVIEW_TENANTS[0] as string);
      expect(() => assertDemoResetAllowed({ [DEMO_RESET_ENV]: DEMO_RESET_TOKEN })).not.toThrow();
    });

    it('goi mau nhung THIEU chuoi xac nhan thi tu choi', () => {
      useTenant(TRANSPORT_PREVIEW_TENANTS[0] as string);
      expect(() => assertDemoResetAllowed({})).toThrow(DemoTenantGuardError);
    });

    /**
     * `=1` / `=true` KHONG duoc coi la xac nhan.
     *
     * Mot bien bat/tat de bi dat nham trong mot tep env dung chung, va no khong doc len thanh mot
     * cau nao — nguoi dat no khong buoc phai nghi xem minh dang bat cai gi.
     */
    it('mot co bat/tat chung chung KHONG phai xac nhan', () => {
      useTenant(TRANSPORT_PREVIEW_TENANTS[0] as string);
      for (const value of ['1', 'true', 'yes', 'on', '']) {
        expect(() => assertDemoResetAllowed({ [DEMO_RESET_ENV]: value }), value).toThrow(
          DemoTenantGuardError,
        );
      }
    });

    /** Va cong thu nhat van chan, ke ca khi nguoi chay da go dung chuoi xac nhan. */
    it('goi khach that + dung chuoi xac nhan VAN bi tu choi', () => {
      for (const slug of CUSTOMER_TENANTS) {
        useTenant(slug);
        expect(() => assertDemoResetAllowed({ [DEMO_RESET_ENV]: DEMO_RESET_TOKEN }), slug).toThrow(
          DemoTenantGuardError,
        );
      }
    });
  });
});
