import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SEED } from '../knowledge/seed.js';
import {
  loadTenantConfig,
  loadTenantKnowledge,
  resetTenantCache,
  tenantDir,
} from './tenant.config.js';

/** Dung goi khach gia trong thu muc tam -> test khong dung den tenants/ that. */
function fakePack(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-pack-'));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(body), 'utf8');
  }
  return dir;
}

const tmpDirs: string[] = [];
function useFakePack(files: Record<string, unknown>): string {
  const dir = fakePack(files);
  tmpDirs.push(dir);
  process.env.TENANT_DIR = dir;
  resetTenantCache();
  return dir;
}

afterEach(() => {
  delete process.env.TENANT_DIR;
  delete process.env.TENANT;
  resetTenantCache();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('goi khach ultty (that)', () => {
  it('doc duoc danh tinh + persona tu tenant.json', () => {
    const cfg = loadTenantConfig();
    expect(cfg.slug).toBe('ultty');
    expect(cfg.displayName).toContain('Ultty');
    expect(cfg.persona.parserIntro).toContain('PHAN LOAI Y DINH');
  });

  it('mac dinh tro ve tenants/ultty khi khong dat TENANT/TENANT_DIR', () => {
    expect(tenantDir().replace(/\\/g, '/')).toMatch(/\/tenants\/ultty$/);
  });

  // Chot so luong nguon su that: bat loi neu tach seed.ts -> knowledge.json lam rot du lieu.
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
      glossary: 24,
    });
  });

  it('SEED chinh la goi khach dang dung', () => {
    expect(SEED).toEqual(loadTenantKnowledge());
  });
});

describe('chon goi khach', () => {
  it('TENANT_DIR ghi de duong dan mac dinh', () => {
    const dir = useFakePack({
      'tenant.json': {
        schemaVersion: 1,
        slug: 'khach-thu-hai',
        displayName: 'Khach Thu Hai',
        shortName: 'KTH',
        persona: {
          parserIntro: 'Ban la bo trich xuat don cho Khach Thu Hai.',
          botName: 'KTH',
          productFallbackDescription: 'San pham cua Khach Thu Hai.',
        },
      },
    });
    expect(tenantDir()).toBe(dir);
    expect(loadTenantConfig().slug).toBe('khach-thu-hai');
  });
});

describe('goi khach hong -> nem ngay, khong chay tiep', () => {
  it('thieu file thi bao ro duong dan', () => {
    useFakePack({ 'tenant.json': { schemaVersion: 1 } });
    expect(() => loadTenantKnowledge()).toThrow(/Goi khach thieu file/);
  });

  it('sai schema thi liet ke truong sai', () => {
    useFakePack({
      'tenant.json': {
        schemaVersion: 1,
        slug: 'CHU HOA KHONG HOP LE',
        displayName: 'X',
        shortName: 'X',
        persona: { parserIntro: 'x', botName: 'x', productFallbackDescription: 'x' },
      },
    });
    expect(() => loadTenantConfig()).toThrow(/Goi khach sai schema[\s\S]*slug/);
  });

  it('chinh sach cong no la tu KHONG co trong POLICY_TYPES -> chan', () => {
    useFakePack({
      'data/knowledge.json': {
        products: [],
        prices: [],
        priceOverrides: [],
        dealers: [
          { id: 'd1', name: 'D1', aliases: [], tier: 'dai_ly', defaultPolicy: 'tra_gop_12_thang' },
        ],
        groups: [],
        glossary: [],
      },
    });
    expect(() => loadTenantKnowledge()).toThrow(/dealers\.0\.defaultPolicy/);
  });
});
