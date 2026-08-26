import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetTenantCache } from '@netviet/tenant';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatRelease, resolveReleaseIdentity } from './release-identity.js';

/**
 * NGUON cua danh tinh ban dang chay — canonical hay du phong, va lam gi khi hai nguon lech nhau.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI (26/08/2026):
 *
 * Tren stack `gd1-test`, `RELEASE_MANIFEST_PATH` RONG. Tien trinh lui ve `RELEASE_GIT_SHA`, va
 * khong ai doc bao cao biet duoc con so do den tu manifest hay tu bien moi truong. Mot
 * `release = abc123` khong noi duoc minh tu dau la mot cau tra loi khong dung duoc de quyet dinh
 * rollback.
 *
 * Ba dieu duoc khoa o day:
 *
 *   1. `source` — CANONICAL (`manifest`) hay DU PHONG (`env`) hay KHONG BIET (`none`). Khong con
 *      duong nao tra ve mot SHA ma khong kem nguon.
 *
 *   2. `gitSha` phai la SHA DAY DU 40 KY TU o MOI nguon. Tang deploy da ep dieu do —
 *      `deploy-remote.sh` va `verify-deployment.mjs` deu kiem 40 ky tu — nhung phia DOC thi
 *      khong, nen mot chuoi bat ky trong manifest van di thang vao permalink.
 *
 *   3. LECH NHAU KHONG DUOC IM LANG. Hai nguon cung noi ve mot ban phat hanh; hai gia tri khac
 *      nhau nghia la MOT TRONG HAI SAI ma khong ai biet cai nao. Chon bua mot cai se tro permalink
 *      toi commit SAI — te hon han viec noi thang "khong biet".
 *      => `source='conflict'`, `gitSha='unknown'`, ca hai gia tri giu lai trong `mismatch`.
 *
 * CONG CUNG NAM O TANG DEPLOY (`ROLLOUT` trong `deploy-stack.sh`), KHONG o day: mot tien trinh
 * khong duoc chet vi no chua biet minh dang chay commit nao. Quan sat khong bao gio duoc la dieu
 * kien de nghiep vu chay (.claude/rules/ecc/common/code-review.md).
 * ---------------------------------------------------------------------------------------------
 */

/** Hai SHA 40 ky tu that-dang, khac nhau ngay ky tu dau cho de doc trong bao loi. */
const SHA_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA_B = 'b1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

describe('resolveReleaseIdentity — gitSha phai noi duoc minh den tu dau', () => {
  const saved = { ...process.env };
  let scratch: string;

  function writeManifest(content: unknown): string {
    const manifestPath = join(scratch, 'release.json');
    writeFileSync(manifestPath, typeof content === 'string' ? content : JSON.stringify(content));
    return manifestPath;
  }

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'release-source-'));
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

  // --------------------------------------------------------------- manifest la nguon CANONICAL

  it('manifest co SHA dung -> nguon canonical la manifest', () => {
    const manifestPath = writeManifest({ gitSha: SHA_A, environment: 'gd1-test' });

    const release = resolveReleaseIdentity({ manifestPath, env: {} });

    expect(release.gitSha).toBe(SHA_A);
    expect(release.source).toBe('manifest');
    expect(release.mismatch).toBeUndefined();
  });

  it('manifest va bien moi truong TRUNG nhau -> van la manifest, khong bao lech', () => {
    const manifestPath = writeManifest({ gitSha: SHA_A });

    const release = resolveReleaseIdentity({ manifestPath, env: { RELEASE_GIT_SHA: SHA_A } });

    expect(release.source).toBe('manifest');
    expect(release.mismatch).toBeUndefined();
  });

  // -------------------------------------------------- khong co manifest -> du phong NOI RO TEN

  it('khong cau hinh manifest -> lui ve bien moi truong, va noi ro day la du phong', () => {
    const release = resolveReleaseIdentity({ env: { RELEASE_GIT_SHA: SHA_B } });

    expect(release.gitSha).toBe(SHA_B);
    expect(release.source).toBe('env');
  });

  it('khong biet gi ca (local/CI) -> `unknown` + nguon `none`, va KHONG nem', () => {
    const release = resolveReleaseIdentity({ env: {}, readTenantSlug: () => undefined });

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('none');
  });

  // ------------------------------------------------------------------------- lech nhau = xung dot

  it('manifest KHAC bien moi truong -> `conflict`, KHONG chon bua ben nao', () => {
    const manifestPath = writeManifest({ gitSha: SHA_A });

    const release = resolveReleaseIdentity({ manifestPath, env: { RELEASE_GIT_SHA: SHA_B } });

    expect(release.source).toBe('conflict');
    // Khong duoc tra ra MOT TRONG HAI: mot permalink tro toi commit sai te hon "khong biet".
    expect(release.gitSha).toBe('unknown');
    expect(release.mismatch).toEqual({ manifestGitSha: SHA_A, envGitSha: SHA_B });
  });

  it('xung dot van giu duoc cac chieu con lai (tenant/environment) de con lan vet', () => {
    const manifestPath = writeManifest({ gitSha: SHA_A, environment: 'gd1-test' });

    const release = resolveReleaseIdentity({
      manifestPath,
      env: { RELEASE_GIT_SHA: SHA_B },
      readTenantSlug: () => 'khach-x',
    });

    expect(release.tenant).toBe('khach-x');
    expect(release.environment).toBe('gd1-test');
  });

  it('formatRelease noi duoc rang danh tinh dang xung dot', () => {
    const manifestPath = writeManifest({ gitSha: SHA_A });

    const release = resolveReleaseIdentity({
      manifestPath,
      env: { RELEASE_GIT_SHA: SHA_B },
      readTenantSlug: () => 'khach-x',
    });

    expect(formatRelease(release)).toContain('conflict');
  });

  // ----------------------------------------------------------------- manifest hong -> lui an toan

  it('manifest KHONG PHAI JSON -> lui ve bien moi truong, khong nem', () => {
    const manifestPath = writeManifest('{ khong phai json');

    const release = resolveReleaseIdentity({ manifestPath, env: { RELEASE_GIT_SHA: SHA_B } });

    expect(release.gitSha).toBe(SHA_B);
    expect(release.source).toBe('env');
  });

  it('duong dan manifest tro vao khoang khong -> lui ve bien moi truong, khong nem', () => {
    const release = resolveReleaseIdentity({
      manifestPath: join(scratch, 'khong-ton-tai.json'),
      env: { RELEASE_GIT_SHA: SHA_B },
    });

    expect(release.source).toBe('env');
    expect(release.gitSha).toBe(SHA_B);
  });

  // ------------------------------------------------------------------------- 40 ky tu, khong hon

  it('SHA cut trong manifest KHONG duoc coi la danh tinh', () => {
    const manifestPath = writeManifest({ gitSha: 'abc1234' });

    const release = resolveReleaseIdentity({ manifestPath, env: {} });

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('none');
  });

  it('SHA cut trong manifest -> bien moi truong hop le van duoc dung', () => {
    const manifestPath = writeManifest({ gitSha: 'abc1234' });

    const release = resolveReleaseIdentity({ manifestPath, env: { RELEASE_GIT_SHA: SHA_B } });

    expect(release.gitSha).toBe(SHA_B);
    expect(release.source).toBe('env');
    // Mot ben khong hop le thi khong phai "lech nhau" — chi co MOT ung vien that.
    expect(release.mismatch).toBeUndefined();
  });

  it('SHA cut trong bien moi truong cung bi tu choi', () => {
    const release = resolveReleaseIdentity({ env: { RELEASE_GIT_SHA: 'DEADBEEF' } });

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('none');
  });

  it('SHA chu HOA khong phai mot SHA khac — chuan hoa ve chu thuong truoc khi so', () => {
    const manifestPath = writeManifest({ gitSha: SHA_A.toUpperCase() });

    const release = resolveReleaseIdentity({ manifestPath, env: { RELEASE_GIT_SHA: SHA_A } });

    expect(release.gitSha).toBe(SHA_A);
    expect(release.source).toBe('manifest');
    expect(release.mismatch).toBeUndefined();
  });

  // ----------------------------------------------------------------------------------- rieng tu

  it('truong la trong manifest KHONG di theo danh tinh ra ngoai', () => {
    // Danh tinh nay di vao bao cao deploy va bi dan len GitHub, nen no chi duoc gom dung cac
    // chieu da khai — khong bao gio la mot ban sao cua ca tep manifest.
    const manifestPath = writeManifest({
      gitSha: SHA_A,
      apiKey: 'ro-ri-1',
      password: 'ro-ri-2',
    });

    const release = resolveReleaseIdentity({ manifestPath, env: {} });

    expect(JSON.stringify(release)).not.toContain('ro-ri-1');
    expect(JSON.stringify(release)).not.toContain('ro-ri-2');
  });
});
