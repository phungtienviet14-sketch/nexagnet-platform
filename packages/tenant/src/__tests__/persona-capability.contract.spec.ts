import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetTenantCache,
  tenantKnowledgePersona,
  tenantMessagingPersona,
  tenantPersona,
  tenantTurnProcessingPersona,
} from '../tenant.config.js';

/**
 * PERSONA THEO CAPABILITY — mot khach chi phai khai cai ma no THAT SU bat.
 *
 * Truoc ban nay `tenantPersona()` la mot shape GOP: doc no doi tenant phai co du ca ba
 * (`messaging` + `turnProcessing` + `knowledge`) va phai bat `turn-processing`. Nhung ba trong
 * bon truong cua no duoc doc tu nhung mien khac han:
 *
 *   `channels/auto-label.ts`  -> botName      (messaging)
 *   `channels/bot-name.ts`    -> mentionName  (messaging)
 *   `agents/risk-rules.ts`    -> productFallbackDescription (knowledge)
 *
 * `campaign` phu thuoc DUNG MOT capability — `messaging` — va `CampaignService` goi `autoLabel()`.
 * Nghia la mot khach `[messaging, campaign]` hop le theo hop dong nhung NEM luc gui tin, chi vi
 * mot ham persona doi mot capability ma khach do khong bat va khong can.
 */
const tmpDirs: string[] = [];

function useFakePack(config: unknown): void {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-persona-'));
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'tenant.json'), JSON.stringify(config), 'utf8');
  writeFileSync(join(dir, 'data/knowledge.json'), JSON.stringify(KNOWLEDGE), 'utf8');
  tmpDirs.push(dir);
  process.env.TENANT_DIR = dir;
  resetTenantCache();
}

/** Khong san pham, khong dai ly, khong gia — khach nay chi phat thong bao. */
const KNOWLEDGE = {
  products: [],
  glossary: [],
  groups: [{ chatId: 'group-loa-phuong', name: 'Nhom thong bao', branch: 'HN' }],
};

const BRANDING = {
  productName: 'Loa Phuong',
  installName: 'Loa Phuong',
  pageTitle: 'Loa Phuong',
  pageDescription: 'Khach chi gui tin, khong doc, khong ban.',
  themeColor: '#0f62fe',
  backgroundColor: '#f7f4ee',
  monogram: 'L',
  composerPlaceholder: 'vd: thong bao lich nghi le',
};

/**
 * Khach CHI GUI TIN: mot chien dich CSKH mot chieu. Khong doc tin, khong AI, khong ban hang.
 * Do thi capability nay hop le — `campaign` chi phu thuoc `messaging`.
 */
const BROADCAST_ONLY = {
  schemaVersion: 2,
  slug: 'loa-phuong',
  identity: { displayName: 'Loa Phuong', shortName: 'Loa' },
  branding: BRANDING,
  experience: 'knowledge-workspace',
  capabilities: ['knowledge', 'messaging', 'campaign'],
  integrations: { channel: { allowedAdapters: ['mock'] } },
  policies: {
    readiness: { blockedCapabilities: [] },
    campaign: {
      defaultWindow: { start: '08:00', end: '12:00' },
      minSpacingSeconds: 30,
      maxTargets: 500,
      rateLimitPerMinute: 30,
      claimLeaseSeconds: 60,
      tickIntervalSeconds: 10,
      retry: { maxAttempts: 4, baseBackoffSeconds: 60 },
      features: { lunarCalendarEnabled: false },
    },
  },
  persona: {
    messaging: { botName: 'Loa Phuong', mentionName: 'Bot Loa Phuong' },
    knowledge: { productFallbackDescription: 'Dich vu cua Loa Phuong.' },
  },
  bootstrap: { knowledge: { path: 'data/knowledge.json' } },
};

afterEach(() => {
  delete process.env.TENANT_DIR;
  delete process.env.TENANT;
  resetTenantCache();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('persona doc theo capability so huu no', () => {
  it('khach KHONG co turn-processing van lay duoc ten bot de gan nhan tin tu dong', () => {
    useFakePack(BROADCAST_ONLY);

    // Day chinh la duong `autoLabel()` va `resolveBotName()` di. Truoc ban nay ca hai nem
    // `Capability turn-processing khong duoc bat` — mot khach chi phat thanh bi chan boi mot
    // nang luc no khong dung.
    expect(tenantMessagingPersona().botName).toBe('Loa Phuong');
    expect(tenantMessagingPersona().mentionName).toBe('Bot Loa Phuong');
  });

  it('khach KHONG co turn-processing van lay duoc cau mo ta san pham thay the', () => {
    useFakePack(BROADCAST_ONLY);

    expect(tenantKnowledgePersona().productFallbackDescription).toBe('Dich vu cua Loa Phuong.');
  });

  it('doc persona cua capability KHONG bat thi fail-fast — khong tra chuoi rong', () => {
    useFakePack(BROADCAST_ONLY);

    // Fail-fast dung cho khach thieu cai no CAN, khong phai cho khach thieu cai no khong dung.
    expect(() => tenantTurnProcessingPersona()).toThrow(
      /Capability turn-processing khong duoc bat/,
    );
    expect(() => tenantPersona()).toThrow(/Capability turn-processing khong duoc bat/);
  });

  it('bat capability nhung THIEU khoi persona cua no van fail-fast, va noi ro thieu khoi nao', () => {
    useFakePack({
      ...BROADCAST_ONLY,
      capabilities: ['knowledge', 'messaging'],
      policies: { readiness: { blockedCapabilities: [] } },
      persona: { messaging: { botName: 'Loa', mentionName: 'Bot Loa' } },
    });

    expect(() => tenantKnowledgePersona()).toThrow(/persona\.knowledge/);
  });
});
