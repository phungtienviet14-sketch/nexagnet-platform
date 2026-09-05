import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tenantConfigSchema, type CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { nonPreviewTenantPacks } from '../__tests__/tenant-packs.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const COSTING_ARTEFACTS = [
  'TripExpensesController',
  'DriverFundController',
  'DriverFundSelfController',
  'TransportCostingModule',
];

function compositionNames(capabilities: readonly CapabilityId[]): string[] {
  const composition = buildAppComposition(capabilities);
  return [
    ...composition.controllers.map((controller) => controller.name),
    ...composition.imports.map((entry) =>
      typeof entry === 'function' ? entry.name : String((entry as { name?: string }).name ?? ''),
    ),
  ];
}

describe('composition cua capability transport-costing', () => {
  it('bat costing (cung core) thi ba be mat gia thanh/so quy co mat', () => {
    const names = compositionNames(['transport-core', 'transport-costing']);
    for (const artefact of COSTING_ARTEFACTS) expect(names, artefact).toContain(artefact);
  });

  /**
   * MOT KHACH VAN TAI CHI THEO DOI DOI XE VA CHUYEN khong duoc nap mot bang so cai nao.
   *
   * Day khong phai chuyen tham my: `transport-costing` mang theo nam bang tai chinh va mot tang bat
   * bien ke toan. Mot khach chua co nghiep vu do ma van thay giao dien so quy se hoac nhap vao do,
   * hoac hoi vi sao no o day — ca hai deu la chi phi cua mot ranh gioi capability khong noi that.
   */
  it('bat MOT MINH `transport-core` KHONG keo theo gia thanh hay so quy', () => {
    const names = compositionNames(['transport-core']);
    for (const artefact of COSTING_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
    // ...nhung ba be mat cua T2 van phai con day du.
    expect(names).toContain('TripsController');
    expect(names).toContain('DriverTripsController');
  });

  it('khach ban hang day du KHONG nap mot manh nao cua costing', () => {
    const names = compositionNames([
      'knowledge',
      'messaging',
      'turn-processing',
      'sales-order',
      'campaign',
      'operations',
      'notifications',
    ]);
    for (const artefact of COSTING_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
  });

  /**
   * Cong nay bat viec bat `transport-costing` cho mot goi khach THAT. Danh sach goi
   * duoc phep nam o `__tests__/tenant-packs.ts`, va co mot bai rieng khoa lai rang khong mot
   * khach that nao lot vao do — xem `transport-tenant-allowlist.spec.ts`.
   */
  it('khong goi khach THAT nao bat transport-costing', () => {
    const packs = nonPreviewTenantPacks(repoRoot);
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.capabilities, pack.slug).not.toContain('transport-costing');
    }
  });
});

describe('chieu phu thuoc costing -> core duoc chan tu luc DOC GOI KHACH', () => {
  const baseConfig = {
    schemaVersion: 2 as const,
    slug: 'kiem-thu-costing',
    identity: { displayName: 'Kiem thu', shortName: 'KT' },
    branding: {
      productName: 'Kiem thu',
      installName: 'Kiem thu',
      pageTitle: 'Kiem thu',
      pageDescription: 'Goi khach dung cho bai test phu thuoc capability.',
      themeColor: '#123a5f',
      backgroundColor: '#f4f6f9',
      monogram: 'K',
      composerPlaceholder: 'Tim chuyen',
    },
    experience: 'transport-operations' as const,
    policies: { readiness: { blockedCapabilities: [] } },
    integrations: {},
    bootstrap: {},
  };

  /**
   * Bat costing ma quen core phai hong o BIEN GIOI DOC CAU HINH, khong phai o lan ghi khoan chi dau
   * tien. T1 §10.1 dat core o goc cay van tai; mot goi khach tu mau thuan ma boot duoc se de lai
   * mot he thong "chay binh thuong" cho toi luc co nguoi bam nut.
   */
  it('khai `transport-costing` ma khong khai `transport-core` bi tu choi', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...baseConfig,
      capabilities: ['transport-costing'],
    });
    expect(parsed.success).toBe(false);
  });

  it('khai ca hai thi hop le', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...baseConfig,
      capabilities: ['transport-core', 'transport-costing'],
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('chieu nguoc lai van hop le: core dung duoc mot minh', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...baseConfig,
      capabilities: ['transport-core'],
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});
