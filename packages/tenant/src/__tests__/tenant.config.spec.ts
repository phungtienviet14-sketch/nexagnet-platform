import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadDemoMessages,
  loadTenantConfig,
  loadTenantContentManifest,
  loadTenantKnowledge,
  resetTenantCache,
  tenantBranding,
  tenantBootstrap,
  tenantCampaignConfig,
  tenantCapabilities,
  tenantDir,
  tenantErp,
  tenantExperience,
  tenantHasCapability,
  tenantIdentity,
  tenantIntegrations,
  tenantOrderAutomation,
  tenantPersona,
  tenantReadiness,
  tenantRetailAdvice,
} from '../tenant.config.js';

/**
 * Goi nay KHONG duoc biet khach nao ton tai — moi test o day dung goi khach GIA trong thu muc tam.
 * Cac khang dinh ve du lieu that cua mot khach cu the nam ben apps/api (`tenant-pack.spec.ts`).
 */
const tmpDirs: string[] = [];
const KNOWLEDGE_ONLY_FIXTURE = fileURLToPath(new URL('./fixtures/knowledge-only', import.meta.url));

function useFakePack(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-pack-'));
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

/** Goi khach hop le toi thieu — diem xuat phat, roi sua tung truong de kiem tung nhanh. */
const VALID_CONFIG = {
  schemaVersion: 2,
  slug: 'khach-mau',
  identity: { displayName: 'Cong ty Khach Mau', shortName: 'Khach Mau' },
  branding: {
    productName: 'Khach Mau AI',
    installName: 'Khach Mau — Tro ly don hang AI',
    pageTitle: 'Khach Mau AI — Trung tam dieu hanh',
    pageDescription: 'Console xu ly don hang Zalo cho Khach Mau.',
    themeColor: '#0f62fe',
    backgroundColor: '#f7f4ee',
    monogram: 'K',
    composerPlaceholder: 'vd: @Bot gui 10 mon A ve HN',
  },
  experience: 'operations-console',
  capabilities: [
    'knowledge',
    'messaging',
    'sales-order',
    'campaign',
    'operations',
    'notifications',
  ],
  integrations: {
    channel: { allowedAdapters: ['mock', 'bot', 'zca', 'hybrid'] },
    parser: { allowedAdapters: ['deepseek', 'claude', 'flowise'] },
    erp: { adapter: 'none' },
    contentSource: { adapter: 'local_manifest' },
  },
  policies: {
    salesOrder: {
      supportedDealerPolicies: ['cong_no_30', 'thanh_toan_ngay'],
      automation: { enabled: true, maxAutoConfirmQuantity: 50 },
      retailAdvice: {
        priceField: 'minRetailPrice',
        qualifier: 'Gia toi thieu tham khao.',
      },
    },
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
    readiness: { blockedCapabilities: [] },
  },
  persona: {
    messaging: { botName: 'Khach Mau', mentionName: 'Bot khach mau' },
    salesOrder: {
      parserIntro: 'Ban la bo PHAN LOAI Y DINH + TRICH XUAT don hang cho Khach Mau.',
    },
    knowledge: { productFallbackDescription: 'San pham cua Khach Mau.' },
  },
  bootstrap: {
    knowledge: { path: 'data/knowledge.json' },
    salesOrder: { path: 'data/knowledge.json' },
    content: { path: 'data/content-manifest.json' },
    demoMessages: { path: 'data/demo-messages.json' },
  },
};

afterEach(() => {
  delete process.env.TENANT_DIR;
  delete process.env.TENANT;
  resetTenantCache();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('chon goi khach', () => {
  // CO Y khong co mac dinh: quen dat TENANT tren stack cua khach B ma lang le nap du lieu khach A
  // la su co ro ri du lieu, khong phai bat tien nho.
  it('thieu ca TENANT lan TENANT_DIR -> nem, KHONG doan khach nao', () => {
    // Tu xoa bien thay vi tin vao moi truong goi test: day la test DAU TIEN trong file nen chua
    // co afterEach nao chay, ma CI lai dat TENANT=ultty o muc job cho bo test cua apps/api.
    delete process.env.TENANT;
    delete process.env.TENANT_DIR;
    resetTenantCache();

    expect(() => tenantDir()).toThrow(/Thieu bien TENANT/);
  });

  it('TENANT=<slug> tro vao tenants/<slug> duoi goc repo', () => {
    process.env.TENANT = 'khach-mau';
    resetTenantCache();
    expect(tenantDir().replace(/\\/g, '/')).toMatch(/\/tenants\/khach-mau$/);
  });

  it('TENANT_DIR uu tien hon TENANT (goi khach mount tu ngoai image)', () => {
    const dir = useFakePack({ 'tenant.json': VALID_CONFIG });
    process.env.TENANT = 'mot-slug-khac';
    resetTenantCache();
    expect(tenantDir()).toBe(dir);
    expect(loadTenantConfig().slug).toBe('khach-mau');
  });
});

describe('doc goi khach', () => {
  it('doc duoc danh tinh, persona, branding, experience, capabilities va integrations', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG });

    const cfg = loadTenantConfig();

    expect(tenantIdentity().displayName).toBe('Cong ty Khach Mau');
    expect(tenantExperience()).toBe('operations-console');
    expect(tenantCapabilities()).toContain('sales-order');
    expect(tenantHasCapability('sales-order')).toBe(true);
    expect(tenantIntegrations()).toEqual({
      channel: { allowedAdapters: ['mock', 'bot', 'zca', 'hybrid'] },
      parser: { allowedAdapters: ['deepseek', 'claude', 'flowise'] },
      erp: { adapter: 'none' },
      contentSource: { adapter: 'local_manifest' },
    });
    expect(cfg.persona.messaging?.mentionName).toBe('Bot khach mau');
    expect(tenantPersona()).toEqual({
      parserIntro: 'Ban la bo PHAN LOAI Y DINH + TRICH XUAT don hang cho Khach Mau.',
      botName: 'Khach Mau',
      mentionName: 'Bot khach mau',
      productFallbackDescription: 'San pham cua Khach Mau.',
    });
    expect(tenantBranding().productName).toBe('Khach Mau AI');
    expect(cfg.policies.salesOrder?.automation).toEqual({
      enabled: true,
      maxAutoConfirmQuantity: 50,
    });
    expect(cfg.policies.campaign?.rateLimitPerMinute).toBe(30);
    expect(cfg.policies.salesOrder?.retailAdvice).toEqual({
      priceField: 'minRetailPrice',
      qualifier: 'Gia toi thieu tham khao.',
    });
    expect(cfg.policies.readiness.blockedCapabilities).toEqual([]);
    expect(tenantOrderAutomation()).toEqual({ enabled: true, maxAutoConfirmQuantity: 50 });
    expect(tenantCampaignConfig().rateLimitPerMinute).toBe(30);
    expect(tenantRetailAdvice().priceField).toBe('minRetailPrice');
    expect(tenantReadiness().blockedCapabilities).toEqual([]);
    expect(tenantBootstrap().knowledge?.path).toBe('data/knowledge.json');
  });

  it('cho phep tenant knowledge-only khong dung channel/parser/sales-order', () => {
    process.env.TENANT_DIR = KNOWLEDGE_ONLY_FIXTURE;
    resetTenantCache();

    expect(tenantExperience()).toBe('knowledge-workspace');
    expect(tenantCapabilities()).toEqual(['knowledge']);
    expect(tenantIntegrations().channel).toBeUndefined();
    expect(loadTenantConfig().policies.salesOrder).toBeUndefined();
    expect(loadTenantConfig().persona).toEqual({});
    expect(() => tenantPersona()).toThrow(/Capability sales-order khong duoc bat/);
    expect(loadTenantKnowledge()).toEqual({
      pricePeriod: null,
      products: [],
      prices: [],
      priceOverrides: [],
      dealers: [],
      groups: [],
      glossary: [{ term: 'FAQ', meaning: 'Frequently asked question' }],
    });
  });

  /**
   * Cot loi cua "MOT image chay duoc MOI khach": khong duoc co chuoi thuong hieu nao bi chot luc
   * nap module. Doi goi khach roi doc lai thi phai ra chuoi cua goi MOI.
   * Chung minh o muc artifact (build mot lan, chay hai lan) nam o apps/web/tenant-runtime.contract.mjs.
   */
  it('doi goi khach luc chay -> branding doi theo, khong con dinh goi cu', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG });
    expect(tenantBranding().productName).toBe('Khach Mau AI');

    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        slug: 'khach-hai',
        branding: { ...VALID_CONFIG.branding, productName: 'Khach Hai AI', monogram: 'H' },
      },
    });

    expect(tenantBranding().productName).toBe('Khach Hai AI');
    expect(tenantBranding().monogram).toBe('H');
  });

  it('khong co data/demo-messages.json -> mang rong, khong nem', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG });
    expect(loadDemoMessages()).toEqual([]);
  });

  it('co data/demo-messages.json -> doc theo thu tu trong file', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG, 'data/demo-messages.json': ['tin 1', 'tin 2'] });
    expect(loadDemoMessages()).toEqual(['tin 1', 'tin 2']);
  });
});

describe('loadTenantContentManifest', () => {
  const VALID_MANIFEST = {
    source: { kind: 'local_manifest', sourceId: 'faq-mau' },
    faqs: [
      {
        externalId: 'faq:mau:001',
        productSku: 'SP-MAU',
        question: 'Bao hanh bao lau?',
        answer: '2 nam.',
      },
    ],
  };

  it('khong co data/content-manifest.json -> null, KHONG nem (khach chua nhap noi dung)', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG });
    expect(loadTenantContentManifest()).toBeNull();
  });

  it('co file hop le -> doc duoc FAQ, va default cua schema import duoc ap (assets rong)', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG, 'data/content-manifest.json': VALID_MANIFEST });
    const manifest = loadTenantContentManifest();
    expect(manifest?.faqs).toHaveLength(1);
    expect(manifest?.faqs[0]).toMatchObject({ productSku: 'SP-MAU', status: 'draft' });
    expect(manifest?.assets).toEqual([]);
  });

  it('file sai schema -> NEM luc nap, khong im lang bo qua', () => {
    useFakePack({
      'tenant.json': VALID_CONFIG,
      'data/content-manifest.json': { source: { kind: 'khong-ton-tai', sourceId: 'x' } },
    });
    expect(() => loadTenantContentManifest()).toThrow(/sai schema/i);
  });

  it('doc dia dung mot lan roi giu cache; resetTenantCache() moi doc lai', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG, 'data/content-manifest.json': VALID_MANIFEST });
    expect(loadTenantContentManifest()).toBe(loadTenantContentManifest());
    resetTenantCache();
    expect(loadTenantContentManifest()?.faqs).toHaveLength(1);
  });
});

/**
 * G1-12: nen tang chi biet cong `ErpPort`; DANH TINH nha cung cap ERP la du lieu cua khach.
 * ERP la integration active rieng, khong phai capability hay nhanh theo tenant slug.
 */
describe('he thong ERP cua khach', () => {
  it('goi khach khong khai bao -> none, KHONG gan bua nha cung cap nao', () => {
    const { erp: _bo, ...integrations } = VALID_CONFIG.integrations;
    useFakePack({ 'tenant.json': { ...VALID_CONFIG, integrations } });
    expect(loadTenantConfig().integrations.erp).toBeUndefined();
    expect(tenantErp()).toEqual({ adapter: 'none' });
  });

  it('khai bao adapter -> doc dung gia tri do', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        integrations: { ...VALID_CONFIG.integrations, erp: { adapter: 'kiotviet_mock' } },
      },
    });
    expect(tenantErp().adapter).toBe('kiotviet_mock');
  });

  it('adapter khong co hien thuc -> chan luc boot, khong chay tiep voi cong rong', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        integrations: { ...VALID_CONFIG.integrations, erp: { adapter: 'erp-khong-ton-tai' } },
      },
    });
    expect(() => loadTenantConfig()).toThrow(
      /Goi khach sai schema[\s\S]*integrations\.erp\.adapter/,
    );
  });
});

describe('goi khach hong -> nem ngay, khong chay tiep', () => {
  it.each([1, 3])('schemaVersion=%s -> chan, khong silent migrate/fallback', (schemaVersion) => {
    useFakePack({ 'tenant.json': { ...VALID_CONFIG, schemaVersion } });
    expect(() => loadTenantConfig()).toThrow(/schemaVersion/);
  });

  it('thieu file thi bao ro duong dan', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG });
    expect(() => loadTenantKnowledge()).toThrow(/Goi khach thieu file/);
  });

  it('sai schema thi liet ke truong sai', () => {
    useFakePack({ 'tenant.json': { ...VALID_CONFIG, slug: 'CHU HOA KHONG HOP LE' } });
    expect(() => loadTenantConfig()).toThrow(/Goi khach sai schema[\s\S]*slug/);
  });

  it('thieu branding -> chan (app web se khong con chuoi de hien)', () => {
    const { branding: _bo, ...khongBranding } = VALID_CONFIG;
    useFakePack({ 'tenant.json': khongBranding });
    expect(() => loadTenantConfig()).toThrow(/Goi khach sai schema[\s\S]*branding/);
  });

  it('themeColor sai dinh dang -> chan', () => {
    useFakePack({
      'tenant.json': { ...VALID_CONFIG, branding: { ...VALID_CONFIG.branding, themeColor: 'do' } },
    });
    expect(() => loadTenantConfig()).toThrow(/themeColor/);
  });

  it('monogram dai qua 3 ky tu -> chan (icon se tran ra ngoai o vuong)', () => {
    useFakePack({
      'tenant.json': { ...VALID_CONFIG, branding: { ...VALID_CONFIG.branding, monogram: 'ABCD' } },
    });
    expect(() => loadTenantConfig()).toThrow(/monogram/);
  });

  it.each([0, -1, 1.5])(
    'nguong tu xac nhan %s khong phai so nguyen duong -> chan',
    (maxAutoConfirmQuantity) => {
      useFakePack({
        'tenant.json': {
          ...VALID_CONFIG,
          policies: {
            ...VALID_CONFIG.policies,
            salesOrder: {
              ...VALID_CONFIG.policies.salesOrder,
              automation: { enabled: true, maxAutoConfirmQuantity },
            },
          },
        },
      });
      expect(() => loadTenantConfig()).toThrow(
        /policies\.salesOrder\.automation\.maxAutoConfirmQuantity/,
      );
    },
  );

  it('campaign co cua so nguoc hoac spacing khong duong -> chan luc boot', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        policies: {
          ...VALID_CONFIG.policies,
          campaign: {
            ...VALID_CONFIG.policies.campaign,
            defaultWindow: { start: '12:00', end: '08:00' },
            minSpacingSeconds: 0,
          },
        },
      },
    });
    expect(() => loadTenantConfig()).toThrow(/campaign/);
  });

  it('retailAdvice chi chap nhan price field thuoc domain chung', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        policies: {
          ...VALID_CONFIG.policies,
          salesOrder: {
            ...VALID_CONFIG.policies.salesOrder,
            retailAdvice: { priceField: 'giaRiengUltty', qualifier: 'Khong hop le' },
          },
        },
      },
    });
    expect(() => loadTenantConfig()).toThrow(/retailAdvice\.priceField/);
  });

  it('readiness blocker co schema generic strict, khong chap nhan key tuy tien', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        policies: {
          ...VALID_CONFIG.policies,
          readiness: {
            blockedCapabilities: [{ key: 'VAT Viết Hoa', label: 'VAT', reason: 'Chưa chốt' }],
          },
        },
      },
    });
    expect(() => loadTenantConfig()).toThrow(/readiness\.blockedCapabilities\.0\.key/);
  });

  it('sales-order bat buoc co day du cac truong gia/dai ly/group', () => {
    useFakePack({
      'tenant.json': VALID_CONFIG,
      'data/knowledge.json': { products: [], glossary: [] },
    });
    expect(() => loadTenantKnowledge()).toThrow(/prices/);
  });

  it('experience khong duoc ho tro -> chan luc boot', () => {
    useFakePack({ 'tenant.json': { ...VALID_CONFIG, experience: 'wata-tuong-lai' } });
    expect(() => loadTenantConfig()).toThrow(/experience/);
  });

  it.each(['knowledge', 'messaging', 'sales-order', 'operations'])(
    'operations-console thieu capability %s -> chan theo experience contract',
    (missingCapability) => {
      useFakePack({
        'tenant.json': {
          ...VALID_CONFIG,
          capabilities: VALID_CONFIG.capabilities.filter(
            (capability) => capability !== missingCapability,
          ),
        },
      });
      expect(() => loadTenantConfig()).toThrow(
        new RegExp(`operations-console yeu cau capability ${missingCapability}`),
      );
    },
  );

  it('capability khong duoc registry ho tro -> chan luc boot', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        capabilities: [...VALID_CONFIG.capabilities, 'finance'],
      },
    });
    expect(() => loadTenantConfig()).toThrow(/capabilities/);
  });

  it('sales-order thieu dependency knowledge -> chan luc boot', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        capabilities: VALID_CONFIG.capabilities.filter((capability) => capability !== 'knowledge'),
      },
    });
    expect(() => loadTenantConfig()).toThrow(/sales-order yeu cau capability knowledge/);
  });

  it('messaging thieu channel integration -> chan luc boot', () => {
    const { channel: _bo, ...integrations } = VALID_CONFIG.integrations;
    useFakePack({ 'tenant.json': { ...VALID_CONFIG, integrations } });
    expect(() => loadTenantConfig()).toThrow(/integrations\.channel/);
  });

  it('campaign thieu policy campaign -> chan luc boot', () => {
    const { campaign: _bo, ...policies } = VALID_CONFIG.policies;
    useFakePack({ 'tenant.json': { ...VALID_CONFIG, policies } });
    expect(() => loadTenantConfig()).toThrow(/policies\.campaign/);
  });

  it.each(['../outside.json', 'data/../../outside.json', 'C:\\outside.json', '/outside.json'])(
    'bootstrap path %s khong duoc thoat khoi tenant pack',
    (path) => {
      useFakePack({
        'tenant.json': {
          ...VALID_CONFIG,
          bootstrap: { ...VALID_CONFIG.bootstrap, knowledge: { path } },
        },
      });
      expect(() => loadTenantConfig()).toThrow(/bootstrap\.knowledge\.path/);
    },
  );

  // D28 phuong an B: khach khai bao TAP CON chinh sach ho that su ban. Hai gia tri nam o hai file
  // khac nhau nen khong schema don le nao bat duoc — phai kiem cheo luc nap.
  it('dai ly dung chinh sach khach KHONG khai bao -> chan, chi ro dai ly nao', () => {
    useFakePack({
      'tenant.json': {
        ...VALID_CONFIG,
        policies: {
          ...VALID_CONFIG.policies,
          salesOrder: {
            ...VALID_CONFIG.policies.salesOrder,
            supportedDealerPolicies: ['thanh_toan_ngay'],
          },
        },
      },
      'data/knowledge.json': {
        pricePeriod: null,
        products: [],
        prices: [],
        priceOverrides: [],
        dealers: [
          {
            id: 'dl-mau',
            name: 'DL Mau',
            aliases: [],
            tier: 'dai_ly',
            defaultPolicy: 'cong_no_45',
          },
        ],
        groups: [],
        glossary: [],
      },
    });

    expect(() => loadTenantKnowledge()).toThrow(/dl-mau: cong_no_45/);
  });

  it('chinh sach cong no la tu KHONG co trong POLICY_TYPES -> chan', () => {
    useFakePack({
      'tenant.json': VALID_CONFIG,
      'data/knowledge.json': {
        pricePeriod: null,
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
