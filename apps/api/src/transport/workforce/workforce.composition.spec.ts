import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tenantConfigSchema, type CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { nonPreviewTenantPacks } from '../__tests__/tenant-packs.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const WORKFORCE_ARTEFACTS = ['PayrollController', 'TransportWorkforceModule'];

function compositionNames(capabilities: readonly CapabilityId[]): string[] {
  const built = buildAppComposition(capabilities);
  return [
    ...built.controllers.map((controller) => controller.name),
    ...built.imports.map((entry) =>
      typeof entry === 'function' ? entry.name : String((entry as { name?: string }).name ?? ''),
    ),
  ];
}

describe('composition cua capability transport-workforce', () => {
  it('bat cung core + costing thi be mat luong co mat', () => {
    const names = compositionNames(['transport-core', 'transport-costing', 'transport-workforce']);
    for (const artefact of WORKFORCE_ARTEFACTS) expect(names, artefact).toContain(artefact);
  });

  /**
   * `transport-fuel` KHONG phai phu thuoc cua T7.
   *
   * Thuong tiet kiem dau can du lieu cua `TX-04`, nhung bat fuel thanh phu thuoc se lam mot khach
   * chi tra luong co ban phai dung ca doi soat bang ke cay xang. Nguon do la TUY CHON, va lan chay
   * ghi `FUEL_SAVING_UNAVAILABLE` khi no vang mat.
   */
  it('bat luong KHONG keo theo `transport-fuel`', () => {
    const names = compositionNames(['transport-core', 'transport-costing', 'transport-workforce']);
    expect(names).not.toContain('TransportFuelModule');
    expect(names).not.toContain('FuelEntriesController');
  });

  it('bat core + costing ma KHONG bat luong thi khong nap be mat luong nao', () => {
    const names = compositionNames(['transport-core', 'transport-costing']);
    for (const artefact of WORKFORCE_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
    expect(names).toContain('DriverFundController');
  });

  it('khach ban hang day du KHONG nap mot manh nao cua TX-07', () => {
    const names = compositionNames([
      'knowledge',
      'messaging',
      'turn-processing',
      'sales-order',
      'campaign',
      'operations',
      'notifications',
    ]);
    for (const artefact of WORKFORCE_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
  });

  /**
   * Cong nay bat viec bat `transport-workforce` cho mot goi khach THAT. Danh sach goi
   * duoc phep nam o `__tests__/tenant-packs.ts`, va co mot bai rieng khoa lai rang khong mot
   * khach that nao lot vao do — xem `transport-tenant-allowlist.spec.ts`.
   */
  it('khong goi khach THAT nao bat transport-workforce', () => {
    const packs = nonPreviewTenantPacks(repoRoot);
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.capabilities, pack.slug).not.toContain('transport-workforce');
    }
  });
});

describe('hop dong phu thuoc cua transport-workforce', () => {
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

  it('bat luong ma thieu `transport-costing` bi chan luc boot', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      capabilities: ['transport-core', 'transport-workforce'],
    });
    expect(parsed.success).toBe(false);
  });

  it('bo ba core + costing + workforce la mot cau hinh HOP LE', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      capabilities: ['transport-core', 'transport-costing', 'transport-workforce'],
    });
    expect(parsed.success).toBe(true);
  });

  /**
   * Tham so luong KHONG duoc la dieu kien boot.
   *
   * Muc luong that nam trong danh sach du lieu con thieu cua T0, nen mot khach chua nhap quy che
   * luong van phai boot duoc — phieu ra `0` dong la mot cau hoi de thay, con mot he thong khong
   * khoi dong duoc thi khong ai biet vi sao.
   */
  it('khong khai `transportPayroll` van hop le', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      capabilities: ['transport-core', 'transport-costing', 'transport-workforce'],
      policies: { readiness: { blockedCapabilities: [] } },
    });
    expect(parsed.success).toBe(true);
  });

  it('mot khoi `transportPayroll` co truong la bi tu choi (.strict)', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      capabilities: ['transport-core', 'transport-costing', 'transport-workforce'],
      policies: {
        readiness: { blockedCapabilities: [] },
        transportPayroll: { autoDeductFromFund: true },
      },
    });
    expect(parsed.success).toBe(false);
  });
});
