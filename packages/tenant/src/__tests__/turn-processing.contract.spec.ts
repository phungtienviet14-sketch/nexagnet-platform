import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CAPABILITY_IDS } from '../tenant.schema.js';
import {
  loadTenantConfig,
  loadTenantKnowledge,
  resetTenantCache,
  tenantHasCapability,
  tenantPersona,
} from '../tenant.config.js';

/**
 * XU LY MOT LUOT la nang luc RIENG, khong phai mot phan cua ban hang.
 *
 * Truoc ban nay, mot khach muon AI doc/tra loi tin nhan phai bat `sales-order` — tuc phai khai
 * bang gia, dai ly, chinh sach ban hang va ERP cho mot viec khong lien quan gi den ban hang.
 * Bo test nay khoa lai ranh gioi do o muc HOP DONG, truoc khi dong nao cua apps/api doi.
 */
const tmpDirs: string[] = [];

function useFakePack(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-turn-'));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(body), 'utf8');
  }
  tmpDirs.push(dir);
  process.env.TENANT_DIR = dir;
  resetTenantCache();
  return dir;
}

/** Khach TRUNG TINH: nhan tin, hieu tin, tra loi — va KHONG ban gi ca. */
const NEUTRAL_CONFIG = {
  schemaVersion: 2,
  slug: 'khach-trung-tinh',
  identity: { displayName: 'Khach Trung Tinh', shortName: 'Trung Tinh' },
  branding: {
    productName: 'Trung Tinh AI',
    installName: 'Trung Tinh — Tro ly hoi thoai',
    pageTitle: 'Trung Tinh AI',
    pageDescription: 'Khach dung hoi thoai AI ma khong ban hang.',
    themeColor: '#0f62fe',
    backgroundColor: '#f7f4ee',
    monogram: 'T',
    composerPlaceholder: 'vd: cho hoi bao hanh bao lau',
  },
  experience: 'knowledge-workspace',
  capabilities: ['knowledge', 'messaging', 'turn-processing'],
  integrations: {
    channel: { allowedAdapters: ['mock'] },
    parser: { allowedAdapters: ['deepseek'] },
  },
  policies: { readiness: { blockedCapabilities: [] } },
  persona: {
    messaging: { botName: 'Trung Tinh', mentionName: 'Bot trung tinh' },
    turnProcessing: { parserIntro: 'Ban la bo PHAN LOAI Y DINH cho Trung Tinh.' },
    knowledge: { productFallbackDescription: 'Dich vu cua Trung Tinh.' },
  },
  bootstrap: { knowledge: { path: 'data/knowledge.json' } },
};

const NEUTRAL_KNOWLEDGE = {
  products: [{ sku: 'DV-01', name: 'Goi bao tri', aliases: ['bao tri'], unit: 'goi' }],
  glossary: [{ term: 'BH', meaning: 'Bao hanh' }],
  groups: [{ chatId: 'group-trung-tinh', name: 'Nhom CSKH', branch: 'HN' }],
};

afterEach(() => {
  delete process.env.TENANT_DIR;
  delete process.env.TENANT;
  resetTenantCache();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('capability turn-processing', () => {
  it('la mot capability co that trong hop dong', () => {
    expect(CAPABILITY_IDS).toContain('turn-processing');
  });

  it('khach co turn-processing ma KHONG co sales-order van hop le', () => {
    useFakePack({ 'tenant.json': NEUTRAL_CONFIG, 'data/knowledge.json': NEUTRAL_KNOWLEDGE });

    const config = loadTenantConfig();
    expect(config.capabilities).toContain('turn-processing');
    expect(tenantHasCapability('sales-order')).toBe(false);
  });

  it('persona cua parser thuoc turn-processing, khong con nam duoi sales-order', () => {
    useFakePack({ 'tenant.json': NEUTRAL_CONFIG, 'data/knowledge.json': NEUTRAL_KNOWLEDGE });

    // `tenantPersona()` la shape legacy ma prompt parser dang dung; no phai doc duoc o khach
    // KHONG ban hang, neu khong thi parser van bi khoa duoi sales-order.
    expect(tenantPersona().parserIntro).toContain('PHAN LOAI Y DINH');
    expect(tenantPersona().botName).toBe('Trung Tinh');
  });

  it('nhom duoc phep xu ly KHONG can dai ly — dai ly la thu cua sales-order', () => {
    useFakePack({ 'tenant.json': NEUTRAL_CONFIG, 'data/knowledge.json': NEUTRAL_KNOWLEDGE });

    const knowledge = loadTenantKnowledge();
    expect(knowledge.groups.map((group) => group.chatId)).toEqual(['group-trung-tinh']);
    expect(knowledge.groups[0]?.dealerId).toBeUndefined();
    expect(knowledge.dealers).toEqual([]);
    expect(knowledge.prices).toEqual([]);
  });

  it('turn-processing yeu cau messaging + knowledge — thieu thi fail-fast', () => {
    useFakePack({
      'tenant.json': { ...NEUTRAL_CONFIG, capabilities: ['knowledge', 'turn-processing'] },
      'data/knowledge.json': NEUTRAL_KNOWLEDGE,
    });

    expect(() => loadTenantConfig()).toThrow(/turn-processing yeu cau capability messaging/);
  });

  it('turn-processing yeu cau integration parser — thieu thi fail-fast', () => {
    useFakePack({
      'tenant.json': {
        ...NEUTRAL_CONFIG,
        integrations: { channel: { allowedAdapters: ['mock'] } },
      },
      'data/knowledge.json': NEUTRAL_KNOWLEDGE,
    });

    expect(() => loadTenantConfig()).toThrow(/turn-processing yeu cau integration parser/);
  });

  it('sales-order KHONG con tu so huu duong xu ly luot: no PHU THUOC turn-processing', () => {
    useFakePack({
      'tenant.json': {
        ...NEUTRAL_CONFIG,
        capabilities: ['knowledge', 'messaging', 'sales-order'],
      },
      'data/knowledge.json': NEUTRAL_KNOWLEDGE,
    });

    expect(() => loadTenantConfig()).toThrow(/sales-order yeu cau capability turn-processing/);
  });
});
