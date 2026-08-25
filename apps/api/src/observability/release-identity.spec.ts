import { resetTenantCache } from '@netviet/tenant';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatRelease, resolveReleaseIdentity } from './release-identity.js';

/**
 * DANH TINH BAN DANG CHAY — va cu the la: app nay dang phuc vu AI.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI (25/08/2026):
 *
 * Stack that chay `TENANT_DIR=/srv/tenant`, KHONG dat `TENANT`, va `release.json` chua bao gio
 * duoc mount vao container. Voi ba dieu do, phien ban truoc cua ham nay tra ve `tenant='unknown'`
 * cho MOI khach — tru duy nhat mot loi goi (`observability.module.ts`) tu doc goi khach roi
 * truyen slug vao. Loi goi thu hai (`workflow.module.ts`) khong biet phai lam vay.
 *
 * `tenant` khong phai mot cai nhan: no la MOT CHIEU CUA KHOA THAO TAC (`buildOperationKey`). Moi
 * khach cung ghi `unknown` nghia la hai khach sinh ra CUNG mot khoa cho cung mot ma don.
 *
 * Nen thu tu uu tien duoi day duoc khoa bang test, khong de trong chu thich.
 */

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/tenant/src/__tests__/fixtures',
);

/** Hai goi khach TRUNG TINH — co y khong dung ten khach that (base khong duoc nhac ten khach). */
const TENANT_A = resolve(FIXTURES, 'workflow-enabled');
const TENANT_B = resolve(FIXTURES, 'neutral-turn');

/** `loadTenantConfig()` co bo nho dem, nen doi `TENANT_DIR` ma khong xoa dem la doc lai goi cu. */
function useTenantDir(dir: string | undefined): void {
  if (dir === undefined) delete process.env.TENANT_DIR;
  else process.env.TENANT_DIR = dir;
  resetTenantCache();
}

describe('resolveReleaseIdentity — tenant den tu GOI KHACH dang mount', () => {
  const saved = { ...process.env };
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'release-identity-'));
    delete process.env.TENANT;
    delete process.env.TENANT_DIR;
    delete process.env.RELEASE_MANIFEST_PATH;
    resetTenantCache();
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
    process.env = { ...saved };
    resetTenantCache();
  });

  // ------------------------------------------------------------ hai khach, hai danh tinh

  it('TENANT_DIR tro toi goi khach A -> danh tinh mang slug cua A', () => {
    useTenantDir(TENANT_A);

    expect(resolveReleaseIdentity().tenant).toBe('workflow-enabled');
  });

  it('TENANT_DIR tro toi goi khach B -> danh tinh mang slug cua B', () => {
    useTenantDir(TENANT_B);

    expect(resolveReleaseIdentity().tenant).toBe('neutral-turn');
  });

  it('doi TENANT_DIR trong cung mot tien trinh -> danh tinh doi theo, khong dinh goi cu', () => {
    // Day la ca that su chung minh "khong hard-code theo ten khach": MOT ban code, hai goi khach,
    // hai danh tinh. Neu ai do ghim mot slug o dau do thi mot trong hai ve nay se do.
    useTenantDir(TENANT_A);
    const first = resolveReleaseIdentity().tenant;
    useTenantDir(TENANT_B);
    const second = resolveReleaseIdentity().tenant;

    expect([first, second]).toEqual(['workflow-enabled', 'neutral-turn']);
  });

  it('cau hinh THAT cua stack (chi co TENANT_DIR) KHONG con ra `unknown`', () => {
    // Dung bo ba ma container that mang: co TENANT_DIR, khong TENANT, khong release.json.
    useTenantDir(TENANT_A);

    const release = resolveReleaseIdentity();

    expect(release.tenant).not.toBe('unknown');
    expect(formatRelease(release)).toMatch(/^workflow-enabled@/);
  });

  // ------------------------------------------------------------------------ thu tu uu tien

  it('goi khach THANG manifest khi hai ben lech nhau', () => {
    // Manifest ghi lai Y DINH cua lan deploy; goi khach la thu app THUC SU dang phuc vu. Lech
    // nhau la mot su co cau hinh, va luc do ta muon thay ten khach dang duoc phuc vu that.
    useTenantDir(TENANT_B);
    const manifestPath = join(scratch, 'release.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({ tenant: 'ghi-trong-manifest', environment: 'gd1-test', gitSha: 'abc1234' }),
    );

    const release = resolveReleaseIdentity({ manifestPath });

    expect(release.tenant).toBe('neutral-turn');
    // CHONG XANH GIA: cac truong con lai VAN phai den tu manifest — bai nay khong duoc "dung"
    // chi vi manifest bi bo qua hoan toan.
    expect(release.environment).toBe('gd1-test');
    expect(release.gitSha).toBe('abc1234');
  });

  it('khong co goi khach -> manifest van la nguon tiep theo (khong pha duong hien tai)', () => {
    useTenantDir(undefined);
    const manifestPath = join(scratch, 'release.json');
    writeFileSync(manifestPath, JSON.stringify({ tenant: 'tu-manifest', gitSha: 'def5678' }));

    expect(resolveReleaseIdentity({ manifestPath }).tenant).toBe('tu-manifest');
  });

  it('khong goi khach, khong manifest -> bien TENANT', () => {
    useTenantDir(undefined);

    expect(resolveReleaseIdentity({ env: { TENANT: 'tu-bien-moi-truong' } }).tenant).toBe(
      'tu-bien-moi-truong',
    );
  });

  it('khong biet gi ca -> `unknown`, va van boot duoc', () => {
    // Khong biet ten khach KHONG duoc lam sap tien trinh: local, CI va script deu chay o day.
    useTenantDir(undefined);

    expect(resolveReleaseIdentity({ env: {}, readTenantSlug: () => undefined }).tenant).toBe(
      'unknown',
    );
  });

  it('goi khach hong/thieu -> nuot loi, lui ve nguon sau, KHONG nem', () => {
    // Mot thu muc rong la goi khach hong. `loadTenantConfig()` nem; ham nay khong duoc nem theo.
    useTenantDir(scratch);

    expect(() => resolveReleaseIdentity({ env: { TENANT: 'du-phong' } })).not.toThrow();
    expect(resolveReleaseIdentity({ env: { TENANT: 'du-phong' } }).tenant).toBe('du-phong');
  });

  it('slug truyen thang van thang tat ca — duong cho noi goi da biet minh phuc vu ai', () => {
    useTenantDir(TENANT_A);

    expect(resolveReleaseIdentity({ tenantSlug: 'goi-thang' }).tenant).toBe('goi-thang');
  });
});
