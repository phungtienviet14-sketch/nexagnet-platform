import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tenantConfigSchema, type CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { nonPreviewTenantPacks } from '../__tests__/tenant-packs.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const ASSET_ARTEFACTS = [
  'MaintenanceController',
  'ComplianceController',
  'FleetStatusController',
  'OperationalAlertsController',
  'TransportAssetComplianceModule',
];

function composition(capabilities: readonly CapabilityId[]) {
  const built = buildAppComposition(capabilities);
  const names = [
    ...built.controllers.map((controller) => controller.name),
    ...built.imports.map((entry) =>
      typeof entry === 'function' ? entry.name : String((entry as { name?: string }).name ?? ''),
    ),
    ...built.providers.map((provider) =>
      typeof provider === 'function'
        ? provider.name
        : String(
            (provider as { provide?: { name?: string; description?: string } }).provide?.name ??
              (provider as { provide?: { description?: string } }).provide?.description ??
              '',
          ),
    ),
  ];
  return { built, names };
}

describe('composition cua capability transport-asset-compliance', () => {
  it('bat cung `transport-core` thi bon be mat cua TX-06 co mat', () => {
    const { names } = composition(['transport-core', 'transport-asset-compliance']);
    for (const artefact of ASSET_ARTEFACTS) expect(names, artefact).toContain(artefact);
  });

  /**
   * MOT PHU THUOC, va bai nay la cho chung minh dieu do.
   *
   * T1 §10.1 dat `transport-asset-compliance` canh `transport-core` chu khong noi tiep chuoi
   * costing -> fuel -> settlement. Mot khach chi muon theo doi han dang kiem va lich bao duong
   * KHONG phai bat so quy lai xe, khong phai bat phieu dau, khong phai khai mot dong cong no nao.
   */
  it('bat T6 mot minh (voi core) KHONG keo theo costing, fuel hay settlement', () => {
    const { names } = composition(['transport-core', 'transport-asset-compliance']);

    expect(names).not.toContain('TransportCostingModule');
    expect(names).not.toContain('TransportFuelModule');
    expect(names).not.toContain('TransportSettlementModule');
    expect(names).not.toContain('DriverFundController');
    expect(names).not.toContain('FuelEntriesController');
  });

  it('bat MOT MINH `transport-core` KHONG nap mot bang bao duong hay giay to nao', () => {
    const { names } = composition(['transport-core']);
    for (const artefact of ASSET_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
    expect(names).toContain('TripsController');
  });

  /**
   * PROOF AM VE CO LAP THEO KHACH.
   *
   * Mot khach ban hang day du khong duoc nap mot manh nao cua mien van tai. Day la lop cach ly dau
   * tien va re nhat: hai khach chay hai tien trinh, hai DB, hai bo secret — nhung neu composition
   * nap ca hai the giới thi mot loi cau hinh se lam giao dien cua khach nay hien bang cua khach kia.
   */
  it('khach ban hang day du KHONG nap mot manh nao cua TX-06', () => {
    const { names } = composition([
      'knowledge',
      'messaging',
      'turn-processing',
      'sales-order',
      'campaign',
      'operations',
      'notifications',
    ]);
    for (const artefact of ASSET_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
  });

  /**
   * Cong nay bat viec bat `transport-asset-compliance` cho mot goi khach THAT. Danh sach goi
   * duoc phep nam o `__tests__/tenant-packs.ts`, va co mot bai rieng khoa lai rang khong mot
   * khach that nao lot vao do — xem `transport-tenant-allowlist.spec.ts`.
   */
  it('khong goi khach THAT nao bat transport-asset-compliance', () => {
    const packs = nonPreviewTenantPacks(repoRoot);
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.capabilities, pack.slug).not.toContain('transport-asset-compliance');
    }
  });
});

describe('bang canh bao gom chung — nguon TUY CHON theo capability dang bat', () => {
  const providerCount = (capabilities: readonly CapabilityId[]) =>
    composition(capabilities).built.providers.length;

  /**
   * Hai adapter nguon canh bao XUAT HIEN cung capability so huu chung, khong cung T6.
   *
   * Do la ly do `OperationalAlertsService` duoc dang ky o tang ung dung: no nhan chung qua
   * `@Optional()`, va khi vang mat thi bang canh bao noi ra bang `unavailableSources` thay vi im
   * lang bo mot muc.
   */
  it('bat them `transport-fuel` thi co them dung mot nguon canh bao', () => {
    const withoutFuel = providerCount([
      'transport-core',
      'transport-costing',
      'transport-asset-compliance',
    ]);
    const withFuel = providerCount([
      'transport-core',
      'transport-costing',
      'transport-fuel',
      'transport-asset-compliance',
    ]);

    expect(withFuel).toBe(withoutFuel + 1);
  });

  it('T6 mot minh khong keo theo mot adapter nguon nao', () => {
    const bare = providerCount(['transport-core']);
    const withAssets = providerCount(['transport-core', 'transport-asset-compliance']);

    // Dung mot provider duoc them: `OperationalAlertsService`. Hai adapter kia thuoc capability khac.
    expect(withAssets).toBe(bare + 1);
  });
});

describe('hop dong phu thuoc trong tenant.schema.ts', () => {
  const base = {
    schemaVersion: 2,
    slug: 'kiem-tra',
    identity: { displayName: 'Kiem tra', shortName: 'KT' },
    branding: {
      productName: 'T',
      installName: 'T',
      pageTitle: 'T',
      pageDescription: 'T',
      themeColor: '#123a5f',
      backgroundColor: '#f4f6f9',
      monogram: 'T',
      composerPlaceholder: 'T',
    },
    experience: 'transport-operations',
    policies: { readiness: { blockedCapabilities: [] } },
    integrations: {},
    bootstrap: {},
  };

  it('bat T6 ma tat `transport-core` bi chan ngay luc boot', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      capabilities: ['transport-asset-compliance'],
    });
    expect(parsed.success).toBe(false);
  });

  it('cap `transport-core` + T6 la mot cau hinh HOP LE', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      capabilities: ['transport-core', 'transport-asset-compliance'],
    });
    expect(parsed.success).toBe(true);
  });

  /** Khoi chinh sach HOAN TOAN tuy chon — khong khai van boot duoc (mac dinh `GD-18` = 30 ngay). */
  it('khong khai `transportCompliance` van hop le', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      capabilities: ['transport-core', 'transport-asset-compliance'],
      policies: { readiness: { blockedCapabilities: [] } },
    });
    expect(parsed.success).toBe(true);
  });
});
