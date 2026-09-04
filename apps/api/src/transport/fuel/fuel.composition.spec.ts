import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tenantConfigSchema, type CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { nonPreviewTenantPacks } from '../__tests__/tenant-packs.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const FUEL_ARTEFACTS = [
  'FuelEntriesController',
  'FuelReconciliationController',
  'DriverFuelController',
  'TransportFuelModule',
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

describe('composition cua capability transport-fuel', () => {
  it('bat du ca ba capability van tai thi ba be mat nhien lieu co mat', () => {
    const names = compositionNames(['transport-core', 'transport-costing', 'transport-fuel']);
    for (const artefact of FUEL_ARTEFACTS) expect(names, artefact).toContain(artefact);
  });

  /**
   * MOT KHACH THEO DOI GIA THANH MA CHUA DOI SOAT BANG KE khong duoc nap tam bang nao cua `TX-04`.
   *
   * Day khong phai chuyen tham my: `transport-fuel` mang theo tam bang, mot may so khop va mot
   * duong phat ban giao cong no. Mot khach chua co nghiep vu do ma van thay man hinh doi soat se
   * hoac nhap vao do, hoac hoi vi sao no o day — ca hai deu la chi phi cua mot ranh gioi capability
   * khong noi that.
   */
  it('bat core + costing (khong fuel) KHONG keo theo mot manh nao cua nhien lieu', () => {
    const names = compositionNames(['transport-core', 'transport-costing']);
    for (const artefact of FUEL_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
    // ...nhung cac be mat cua T2/T3 van phai con day du.
    expect(names).toContain('TripsController');
    expect(names).toContain('TripExpensesController');
    expect(names).toContain('DriverFundSelfController');
  });

  it('khach ban hang day du KHONG nap mot manh nao cua nhien lieu', () => {
    const names = compositionNames([
      'knowledge',
      'messaging',
      'turn-processing',
      'sales-order',
      'campaign',
      'operations',
      'notifications',
    ]);
    for (const artefact of FUEL_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
  });

  /**
   * Cong nay bat viec bat `transport-fuel` cho mot goi khach THAT. Danh sach goi
   * duoc phep nam o `__tests__/tenant-packs.ts`, va co mot bai rieng khoa lai rang khong mot
   * khach that nao lot vao do — xem `transport-tenant-allowlist.spec.ts`.
   */
  it('khong goi khach THAT nao bat transport-fuel', () => {
    const packs = nonPreviewTenantPacks(repoRoot);
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.capabilities, pack.slug).not.toContain('transport-fuel');
    }
  });
});

describe('chieu phu thuoc fuel -> costing -> core duoc chan tu luc DOC GOI KHACH', () => {
  const baseConfig = {
    schemaVersion: 2 as const,
    slug: 'kiem-thu-fuel',
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

  const parse = (capabilities: string[]) =>
    tenantConfigSchema.safeParse({ ...baseConfig, capabilities });

  /**
   * Mot khach bat nhien lieu ma quen gia thanh se co phieu dau KHONG DI DAU CA: lai xe nhap moi
   * ngay, ke toan duyet moi tuan, va khong con so nao vao gia thanh chuyen. Hong o BIEN GIOI DOC
   * CAU HINH la cau tra loi trung thuc; boot xong roi hong o lan duyet dau tien thi khong.
   */
  it('khai `transport-fuel` ma khong khai `transport-costing` bi tu choi', () => {
    expect(parse(['transport-core', 'transport-fuel']).success).toBe(false);
  });

  it('khai `transport-fuel` mot minh cung bi tu choi', () => {
    expect(parse(['transport-fuel']).success).toBe(false);
  });

  it('khai du ca ba thi hop le', () => {
    const parsed = parse(['transport-core', 'transport-costing', 'transport-fuel']);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('chieu nguoc lai van hop le: core + costing dung duoc ma khong co fuel', () => {
    const parsed = parse(['transport-core', 'transport-costing']);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  /**
   * Khoi `policies.transportFuel` HOAN TOAN TUY CHON — cung ly le voi hai capability van tai truoc
   * no. Bat mot khach phai go mot khoi rong chi de he thong khoi chet la mot yeu cau khong phuc vu
   * ai; dung sai va anh xa cot deu co mac dinh dung duoc.
   */
  it('bat fuel KHONG doi hoi khai policies.transportFuel', () => {
    const parsed = parse(['transport-core', 'transport-costing', 'transport-fuel']);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.policies.transportFuel).toBeUndefined();
  });
});
