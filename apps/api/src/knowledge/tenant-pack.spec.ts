import { loadTenantConfig, loadTenantKnowledge } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { SEED } from './seed.js';

/**
 * Moi noi giua NHAN va GOI KHACH. Co che nap goi da co test rieng (trung tinh, dung goi gia) o
 * `packages/tenant`; file nay giu cac khang dinh ve DU LIEU THAT cua goi dang chay — thu ma goi
 * trung tinh khong duoc phep biet.
 *
 * Goi dung o day do `vitest.setup.ts` chot (`TENANT=ultty`).
 */
describe('goi khach dang chay <-> nhan', () => {
  it('SEED chinh la goi khach dang dung (khong con hat giong nao trong code)', () => {
    expect(SEED).toEqual(loadTenantKnowledge());
  });

  // Chot so luong nguon su that: bat loi neu mot lan sua goi khach lam ROT du lieu ma khong ai thay.
  it('giu DU nguon su that sau khi tach khoi code', () => {
    const k = loadTenantKnowledge();

    expect({
      products: k.products.length,
      prices: k.prices.length,
      priceOverrides: k.priceOverrides.length,
      dealers: k.dealers.length,
      groups: k.groups.length,
      glossary: k.glossary.length,
    }).toEqual({
      products: 19,
      prices: 19,
      priceOverrides: 0,
      dealers: 3,
      groups: 2,
      // 24 muc goc + 27 cap viet tat nhap tu ho so khach (`Viet tat_.docx`, 13/08/2026);
      // 2 cap con lai trong file da co san trong 24 muc goc nen khong nhap lai.
      glossary: 51,
    });
  });

  it('danh tinh + persona + branding doc duoc tu goi khach', () => {
    const cfg = loadTenantConfig();

    expect(cfg.slug).toBe('ultty');
    expect(cfg.persona.parserIntro).toContain('PHAN LOAI Y DINH');
    expect(cfg.persona.mentionName).toBe('Bot ultty AI orders');
    expect(cfg.branding.productName).toBe('Ultty AI');
    expect(cfg.orderAutomation).toEqual({ enabled: true, maxAutoConfirmQuantity: 50 });
    expect(cfg.retailAdvice.priceField).toBe('minRetailPrice');
    expect(cfg.readiness.blockedCapabilities.map((item) => item.key)).toEqual([
      'vat',
      'cod_ship',
      'debt_7_days',
      'promotions',
    ]);
  });
});
