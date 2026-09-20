import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readOtelConfig } from './otel/otel-config.js';
import { formatRelease, resolveReleaseIdentity } from './release-identity.js';

/**
 * DANH TINH RELEASE TREN NEN PaaS — tu bam theo commit, khong ai dat tay.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI (do that 20/09/2026, `nexagnet-transport-preview`):
 *
 * Hai service `api-321`/`web-321` chay tren Railway, tuc KHONG qua tang deploy cua ta. Hai he qua
 * di lien nhau:
 *
 *   · khong co `write-release-manifest.sh` nen khong co `release.json` -> nguon canonical vang;
 *   · khong co `deploy-remote.sh` nen khong ai ghi `RELEASE_GIT_SHA` theo TUNG lan deploy.
 *
 * Nguoi van hanh da lap cho trong bang cach dat TAY `RELEASE_GIT_SHA` mot lan. No dung dung mot
 * lan do. Deployment `4025ea6b…` chay commit `e857a018c1c97d639a46c7f8e474a25498979c04`, con log
 * runtime cua CHINH no van ghi `release: "da19533c10ef"` — va ban deploy truoc cung lech y het,
 * nen day la do lech CO SAN chu khong phai mot lan deploy hong.
 *
 * Hau qua khong nam o mot dong log: moi span va moi `telemetry.decision()` deu mang nhan release
 * SAI, nen khong bang chung runtime nao doi chieu duoc "chay tren ban nao" — dung dieu ma tang
 * danh tinh release ton tai de bao dam.
 *
 * ---------------------------------------------------------------------------------------------
 * BA DIEU DUOC KHOA O DAY:
 *
 *   1. `RAILWAY_GIT_COMMIT_SHA` la DU PHONG CUOI, tu dong. Railway dat bien nay cho moi
 *      deployment bat nguon tu GitHub, dang SHA day du 40 ky tu, va bom vao ca pha build lan pha
 *      chay (docs.railway.com/reference/variables). Doc luc chay nen KHONG can `ARG` Dockerfile.
 *
 *   2. NO KHONG DUOC GIANH CHO cua nguon dang tin hon. Thu tu van la manifest -> env -> platform.
 *      Mot bien dat tay TRUNG voi commit that thi khong co gi xay ra ca.
 *
 *   3. LECH NHAU VAN LA `conflict`, ke ca khi ben lech la bien dat tay con ben kia la nen tang.
 *      Day la diem de bi cam do nhat: nen tang gan nhu chac chan dung hon, nen rat de viet mot
 *      dong "uu tien platform" cho xong. Nhung im lang chon mot ben CHINH LA loi ma tang nay ton
 *      tai de khong lap lai — va lan nay no se che dau dung cai su co dang can nguoi sua: mot
 *      bien dat tay cu. Cach chua la GO BIEN DO DI; go xong, `platform` la nguon duy nhat va cau
 *      tra loi tu dung o moi lan deploy.
 *
 * Bat bien xuyen suot: HAI DUONG DOC, MOT CAU TRA LOI. Telemetry noi bo
 * (`resolveReleaseIdentity`) va OTel preload (`readOtelConfig`) dung chung `resolveReleaseSha`,
 * nen chung khong the tra loi khac nhau — xem `otel/otel-release-identity.spec.ts`.
 * ---------------------------------------------------------------------------------------------
 */

/** Ba SHA 40 ky tu that-dang, khac nhau ngay ky tu dau cho de doc trong bao loi. */
const SHA_MANIFEST = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA_ENV = 'b1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA_PLATFORM = 'c1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

/** Goi khach KHONG duoc doc trong bai nay — ta so sanh rieng truc `gitSha`. */
const NO_TENANT_PACK = () => undefined;

describe('danh tinh release tren PaaS — RAILWAY_GIT_COMMIT_SHA', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'release-platform-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function manifestAt(gitSha: string): string {
    const path = join(scratch, 'release.json');
    writeFileSync(path, JSON.stringify({ tenant: 'acme', environment: 'preview', gitSha }));
    return path;
  }

  function resolve(env: NodeJS.ProcessEnv) {
    return resolveReleaseIdentity({ env, readTenantSlug: NO_TENANT_PACK });
  }

  /**
   * Bat bien trung tam: hai duong doc, mot cau tra loi. Goi o MOI bai chu khong o mot bai rieng —
   * them mot nguon vao chi MOT trong hai duong la dung loi 28/08/2026, va no se khong lo ra neu
   * parity chi duoc kiem o mot ca le.
   */
  function expectParity(env: NodeJS.ProcessEnv): ReturnType<typeof resolve> {
    const canonical = resolve(env);
    const otel = readOtelConfig(env);
    expect(otel.release).toBe(canonical.gitSha);
    expect(otel.releaseSource).toBe(canonical.source);
    return canonical;
  }

  // -------------------------------------------------------- du phong CUOI: khong ai dat gi ca

  it('chi co bien cua nen tang -> dung SHA do, va nguon TU NOI TEN la `platform`', () => {
    const release = expectParity({ RAILWAY_GIT_COMMIT_SHA: SHA_PLATFORM });

    expect(release.gitSha).toBe(SHA_PLATFORM);
    expect(release.source).toBe('platform');
    expect(release.mismatch).toBeUndefined();
  });

  it('`RELEASE_GIT_SHA` KHONG duoc dat -> nen tang tra loi, khong con roi ve `unknown`', () => {
    // Day dung la hinh dang cua `api-321` SAU khi go bien dat tay: khong manifest, khong env.
    const release = expectParity({ RELEASE_GIT_SHA: '', RAILWAY_GIT_COMMIT_SHA: SHA_PLATFORM });

    expect(release.gitSha).toBe(SHA_PLATFORM);
    expect(release.source).toBe('platform');
  });

  it('nguon di kem release trong dong log, nen doc duoc ma khong phai SSH', () => {
    const release = resolveReleaseIdentity({
      env: { RAILWAY_GIT_COMMIT_SHA: SHA_PLATFORM },
      readTenantSlug: () => 'khach-x',
    });

    expect(formatRelease(release)).toBe(
      `khach-x@development#${SHA_PLATFORM.slice(0, 7)} (platform)`,
    );
  });

  // --------------------------------------------- KHONG duoc gianh cho cua nguon dang tin hon

  it('manifest co mat -> manifest thang, nen tang khong duoc chen ngang', () => {
    const release = expectParity({
      RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST),
      RAILWAY_GIT_COMMIT_SHA: SHA_MANIFEST,
    });

    expect(release.gitSha).toBe(SHA_MANIFEST);
    expect(release.source).toBe('manifest');
  });

  it('`RELEASE_GIT_SHA` TRUNG voi nen tang -> van bao nguon `env`, khong co xung dot', () => {
    // Mot bien dat tay DUNG thi khong co gi xay ra ca: cung mot cau tra loi, khong canh bao gia.
    const release = expectParity({
      RELEASE_GIT_SHA: SHA_PLATFORM,
      RAILWAY_GIT_COMMIT_SHA: SHA_PLATFORM,
    });

    expect(release.gitSha).toBe(SHA_PLATFORM);
    expect(release.source).toBe('env');
    expect(release.mismatch).toBeUndefined();
  });

  // --------------------------------------------------------------- lech nhau VAN la xung dot

  it('bien DAT TAY lech khoi commit nen tang vua build -> `conflict`, KHONG doan ben nao', () => {
    // Day chinh la trang thai cua `api-321` ngay 20/09/2026, dung o muc truu tuong cua no.
    const release = expectParity({
      RELEASE_GIT_SHA: SHA_ENV,
      RAILWAY_GIT_COMMIT_SHA: SHA_PLATFORM,
    });

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('conflict');
    // Ca HAI gia tri phai con lai, va manifest KHONG duoc bia ra: nguoi truc doc dong nay de biet
    // phai go bien nao, chu khong phai de di tim mot `release.json` khong ton tai.
    expect(release.mismatch).toEqual({ envGitSha: SHA_ENV, platformGitSha: SHA_PLATFORM });
  });

  it('ba nguon, ba cau tra loi -> `conflict` giu du ca ba, khong chi hai', () => {
    const release = expectParity({
      RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST),
      RELEASE_GIT_SHA: SHA_ENV,
      RAILWAY_GIT_COMMIT_SHA: SHA_PLATFORM,
    });

    expect(release.source).toBe('conflict');
    expect(release.mismatch).toEqual({
      manifestGitSha: SHA_MANIFEST,
      envGitSha: SHA_ENV,
      platformGitSha: SHA_PLATFORM,
    });
  });

  // -------------------------------------------------------- 40 ky tu, ke ca o nguon nen tang

  it('nen tang tra chuoi khong phai SHA 40 ky tu -> coi nhu nguon nay khong biet', () => {
    // Khong phai phong thu suong: cung luat da ap cho manifest va cho `RELEASE_GIT_SHA`, vi mot
    // chuoi cut di thang vao permalink la mot lien ket chet.
    const release = expectParity({ RAILWAY_GIT_COMMIT_SHA: 'e857a01' });

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('none');
  });

  it('SHA chu HOA tu nen tang khong phai mot commit khac — chuan hoa truoc khi so', () => {
    const release = expectParity({
      RELEASE_GIT_SHA: SHA_PLATFORM,
      RAILWAY_GIT_COMMIT_SHA: SHA_PLATFORM.toUpperCase(),
    });

    expect(release.gitSha).toBe(SHA_PLATFORM);
    expect(release.source).toBe('env');
    expect(release.mismatch).toBeUndefined();
  });

  // -------------------------------------------- khong nguon nao: local/CI VAN la binh thuong

  it('khong nguon nao biet -> `unknown` + `none`, va KHONG nem', () => {
    const release = expectParity({});

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('none');
  });
});
