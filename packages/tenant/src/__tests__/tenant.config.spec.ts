import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadDemoMessages,
  loadTenantConfig,
  loadTenantKnowledge,
  resetTenantCache,
  tenantBranding,
  tenantDir,
} from '../tenant.config.js';

/**
 * Goi nay KHONG duoc biet khach nao ton tai — moi test o day dung goi khach GIA trong thu muc tam.
 * Cac khang dinh ve du lieu that cua mot khach cu the nam ben apps/api (`tenant-pack.spec.ts`).
 */
const tmpDirs: string[] = [];

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
  schemaVersion: 1,
  slug: 'khach-mau',
  displayName: 'Cong ty Khach Mau',
  shortName: 'Khach Mau',
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
  policies: ['cong_no_30', 'thanh_toan_ngay'],
  persona: {
    parserIntro: 'Ban la bo PHAN LOAI Y DINH + TRICH XUAT don hang cho Khach Mau.',
    botName: 'Khach Mau',
    mentionName: 'Bot khach mau',
    productFallbackDescription: 'San pham cua Khach Mau.',
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
  it('doc duoc danh tinh, persona va branding', () => {
    useFakePack({ 'tenant.json': VALID_CONFIG });

    const cfg = loadTenantConfig();

    expect(cfg.displayName).toBe('Cong ty Khach Mau');
    expect(cfg.persona.mentionName).toBe('Bot khach mau');
    expect(tenantBranding().productName).toBe('Khach Mau AI');
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

describe('goi khach hong -> nem ngay, khong chay tiep', () => {
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

  // D28 phuong an B: khach khai bao TAP CON chinh sach ho that su ban. Hai gia tri nam o hai file
  // khac nhau nen khong schema don le nao bat duoc — phai kiem cheo luc nap.
  it('dai ly dung chinh sach khach KHONG khai bao -> chan, chi ro dai ly nao', () => {
    useFakePack({
      'tenant.json': { ...VALID_CONFIG, policies: ['thanh_toan_ngay'] },
      'data/knowledge.json': {
        products: [],
        prices: [],
        priceOverrides: [],
        dealers: [
          { id: 'dl-mau', name: 'DL Mau', aliases: [], tier: 'dai_ly', defaultPolicy: 'cong_no_45' },
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
