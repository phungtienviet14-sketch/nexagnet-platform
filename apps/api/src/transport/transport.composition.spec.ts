import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../app-composition.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const TRANSPORT_ARTEFACTS = [
  'FleetController',
  'TripsController',
  'DriverTripsController',
  'TransportModule',
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

describe('composition cua capability transport-core', () => {
  it('bat `transport-core` thi ba be mat van tai co mat', () => {
    const names = compositionNames(['transport-core']);
    for (const artefact of TRANSPORT_ARTEFACTS) expect(names, artefact).toContain(artefact);
  });

  /**
   * Mot khach van tai KHONG phai bat `messaging`/`turn-processing`/`sales-order` de chay duoc.
   *
   * T1 §10.2: van tai la mien BAN GHI VA SO SACH, khong phai mien hoi thoai. Neu goi
   * `transport-core` lang le keo theo duong xu ly luot thi moi khach van tai se phai khai mot
   * integration `parser` — tuc phai chon mot nha cung cap LLM — cho mot nghiep vu khong co cau hoi
   * nao de tra loi.
   */
  it('`transport-core` KHONG keo theo hoi thoai, don hang hay kenh Zalo', () => {
    const names = compositionNames(['transport-core']);
    for (const foreign of [
      'OrdersController',
      'MessagesController',
      'ZaloController',
      'DemoController',
      'CampaignController',
      'KnowledgeController',
    ]) {
      expect(names, foreign).not.toContain(foreign);
    }
  });

  // TENANT-ISOLATION-001
  describe('TENANT-ISOLATION-001: van tai khong ro sang khach khong bat no', () => {
    const SALES_TENANT_CAPABILITIES = [
      'knowledge',
      'messaging',
      'turn-processing',
      'sales-order',
      'campaign',
      'operations',
      'notifications',
    ] as const satisfies readonly CapabilityId[];

    it('khach ban hang day du KHONG nap mot manh van tai nao', () => {
      const names = compositionNames(SALES_TENANT_CAPABILITIES);
      for (const artefact of TRANSPORT_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
    });

    it('khach chi-tri-thuc cung KHONG nap manh van tai nao', () => {
      const names = compositionNames(['knowledge']);
      for (const artefact of TRANSPORT_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
    });

    /**
     * Kiem tren GOI KHACH THAT chu khong chi tren composition: mot capability chi ro ri khi co ai
     * do khai no. Bai test nay se do ngay lan dau tien mot khach dang co duoc bat `transport-core`
     * ma khong ai co y — ke ca khi moi bai test khac van xanh.
     */
    it('khong goi khach nao dang co trong `tenants/` bat transport-core', () => {
      const tenantsDir = join(repoRoot, 'tenants');
      const slugs = readdirSync(tenantsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      expect(slugs.length).toBeGreaterThan(0);
      for (const slug of slugs) {
        const config = JSON.parse(readFileSync(join(tenantsDir, slug, 'tenant.json'), 'utf8')) as {
          capabilities: string[];
          experience: string;
        };
        expect(config.capabilities, slug).not.toContain('transport-core');
        expect(config.experience, slug).not.toBe('transport-operations');
      }
    });
  });
});
