import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readOtelConfig } from './otel/otel-config.js';
import { formatRelease, resolveReleaseIdentity } from './release-identity.js';

/**
 * MOT BIEN NGUOI DAT KHONG THE TU BIET MINH DA CU.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI (su co 20/09/2026, Railway `api-321` va `web-321`):
 *
 * Tien trinh chay DUNG commit — deployment mang `commitHash=e857a018…` — nhung moi trace, moi
 * span va dong `Telemetry:` luc boot deu khai mot SHA khac, cu hon nhieu lan phat hanh.
 *
 * Nguyen nhan khong phai mot loi tinh toan. `RELEASE_GIT_SHA` la mot bien DAT BANG TAY tren
 * service: no dung dung MOT lan, roi dung yen trong khi ban phat hanh di tiep. Con Railway dat
 * `RAILWAY_GIT_COMMIT_SHA` cho TUNG deployment sinh ra tu GitHub, tuc commit da kich hoat chinh
 * lan deploy dang chay.
 *
 * Ba dieu duoc khoa o day:
 *
 *   1. NEN TANG THANG NGUOI. `RAILWAY_GIT_COMMIT_SHA` hop le thi `RELEASE_GIT_SHA` het viec —
 *      KHONG phai `RELEASE_GIT_SHA ?? RAILWAY_GIT_COMMIT_SHA`, vi bien cu DANG CO MAT va `??`
 *      chi bat `null`/`undefined`. Chinh cai bay do la su co nay.
 *
 *   2. VA CUNG KHONG PHAI `conflict`. Hai bien nay khong o cung hang: mot ben la loi khai cua
 *      nen tang ve chinh lan deploy nay, ben kia la ghi chu nguoi de lai. Goi do la "xung dot"
 *      se bien MOI lan boot tren Railway thanh mot bao dong gia, va bao dong gia thi khong ai doc.
 *
 *   3. MANIFEST VAN LA CANONICAL. `release.json` (duong VM netviet) van dung truoc, va manifest
 *      lech SHA cua Railway van la `conflict` + `unknown` — bat bien "khong doan" khong duoc noi
 *      long chi vi co them mot nguon.
 *
 * Kem theo: `source` phai NOI THAT (`railway`), khong gia vo rang gia tri den tu `RELEASE_GIT_SHA`
 * — nguoi truc doc `(env)` se di sua dung cai bien khong lien quan.
 *
 * VA CA HAI DUONG PHAI TRA LOI GIONG NHAU. Telemetry noi bo va OTel dung chung
 * `resolveReleaseSha()`; bai nay do lai dieu do o TUNG tinh huong, vi do la thu duy nhat khong tu
 * troi di khi mot trong hai ben duoc sua sau nay.
 * ---------------------------------------------------------------------------------------------
 */

/** Ba SHA 40 ky tu that-dang, khac nhau ngay ky tu dau cho de doc trong bao loi. */
const SHA_MANIFEST = 'e857a018c1c97d639a46c7f8e474a25498979c04';
const SHA_RAILWAY = 'da19533cb8d1e5f6072a3b4c5d6e7f8091a2b3c4';
const SHA_STALE = '0fcedcba9876543210fedcba9876543210fedcba';

/** Goi khach KHONG duoc doc o day — ta so sanh rieng truc `gitSha`. */
const NO_TENANT_PACK = () => undefined;

describe('release identity — SHA cua nen tang deploy thang bien dat bang tay', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'release-railway-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function manifestAt(gitSha: string): string {
    const path = join(scratch, 'release.json');
    writeFileSync(path, JSON.stringify({ tenant: 'acme', environment: 'gd1-test', gitSha }));
    return path;
  }

  /**
   * BAT BIEN TRUNG TAM: hai duong doc, mot cau tra loi. Tra ve chinh danh tinh canonical de moi
   * bai con khang dinh tiep tren do.
   */
  function resolveBothWays(env: NodeJS.ProcessEnv) {
    const canonical = resolveReleaseIdentity({ env, readTenantSlug: NO_TENANT_PACK });
    const otel = readOtelConfig(env);

    expect(otel.release).toBe(canonical.gitSha);
    expect(otel.releaseSource).toBe(canonical.source);

    return canonical;
  }

  // ------------------------------------------------- Railway mot minh = danh tinh cua deployment

  it('chi co `RAILWAY_GIT_COMMIT_SHA` -> dung SHA do, va nguon khai la `railway`', () => {
    const release = resolveBothWays({ RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY });

    expect(release.gitSha).toBe(SHA_RAILWAY);
    expect(release.source).toBe('railway');
    expect(release.mismatch).toBeUndefined();
  });

  it('nguon `railway` doc duoc tren mot dong log, khong phai doan tu gia tri', () => {
    const release = resolveReleaseIdentity({
      env: { RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY },
      readTenantSlug: () => 'khach-x',
    });

    expect(formatRelease(release)).toContain('railway');
  });

  // ------------------------------------------------------------------- CHINH SU CO 20/09/2026

  it('Railway SHA + `RELEASE_GIT_SHA` CU -> Railway thang, KHONG phai bien dat tay', () => {
    // Day la cai da xay ra that: bien dat tay con nguyen tu mot lan phat hanh truoc, va no thang
    // suot vi loi giai cu chi biet doc mot minh no.
    const release = resolveBothWays({
      RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY,
      RELEASE_GIT_SHA: SHA_STALE,
    });

    expect(release.gitSha).toBe(SHA_RAILWAY);
    expect(release.source).toBe('railway');
  });

  it('Railway SHA + `RELEASE_GIT_SHA` cu KHONG duoc goi la `conflict`', () => {
    // Hai bien nay khong o cung hang, nen lech nhau khong phai mot su co. Goi la `conflict` thi
    // MOI lan boot tren Railway keu mot lan — va mot bao dong keu moi lan la mot bao dong chet.
    const release = resolveBothWays({
      RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY,
      RELEASE_GIT_SHA: SHA_STALE,
    });

    expect(release.source).not.toBe('conflict');
    expect(release.gitSha).not.toBe('unknown');
  });

  it('Railway SHA TRUNG bien dat tay -> van la `railway`, khong co gi de bao', () => {
    const release = resolveBothWays({
      RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY,
      RELEASE_GIT_SHA: SHA_RAILWAY,
    });

    expect(release.gitSha).toBe(SHA_RAILWAY);
    expect(release.source).toBe('railway');
  });

  // --------------------------------------------- Railway khong tra loi -> du phong cu VAN CHAY

  it('khong co bien Railway -> `RELEASE_GIT_SHA` van la du phong hop le (stack cu)', () => {
    const release = resolveBothWays({ RELEASE_GIT_SHA: SHA_STALE });

    expect(release.gitSha).toBe(SHA_STALE);
    expect(release.source).toBe('env');
  });

  it('bien Railway la CHUOI RONG -> lui ve `RELEASE_GIT_SHA`, khong nuot cau tra loi', () => {
    // Cung cai bay da lam `nexagnet.release` di ra ngoai la `''`: `??` khong bat chuoi rong.
    const release = resolveBothWays({ RAILWAY_GIT_COMMIT_SHA: '', RELEASE_GIT_SHA: SHA_STALE });

    expect(release.gitSha).toBe(SHA_STALE);
    expect(release.source).toBe('env');
  });

  it('bien Railway khong phai SHA 40 ky tu -> lui ve `RELEASE_GIT_SHA`, khong day rac ra ngoai', () => {
    const release = resolveBothWays({
      RAILWAY_GIT_COMMIT_SHA: 'main',
      RELEASE_GIT_SHA: SHA_STALE,
    });

    expect(release.gitSha).toBe(SHA_STALE);
    expect(release.source).toBe('env');
  });

  it('SHA cut cua Railway KHONG duoc coi la danh tinh, du no la SHA that rut gon', () => {
    const release = resolveBothWays({ RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY.slice(0, 7) });

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('none');
  });

  it('SHA chu HOA cua Railway la CUNG mot commit — chuan hoa ve chu thuong', () => {
    const release = resolveBothWays({ RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY.toUpperCase() });

    expect(release.gitSha).toBe(SHA_RAILWAY);
    expect(release.source).toBe('railway');
  });

  // ----------------------------------------------------------- manifest van la nguon CANONICAL

  it('manifest TRUNG Railway SHA -> manifest van la nguon duoc khai', () => {
    const release = resolveBothWays({
      RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST),
      RAILWAY_GIT_COMMIT_SHA: SHA_MANIFEST,
    });

    expect(release.gitSha).toBe(SHA_MANIFEST);
    expect(release.source).toBe('manifest');
    expect(release.mismatch).toBeUndefined();
  });

  it('manifest LECH Railway SHA -> `conflict` + `unknown`, KHONG doan ben nao', () => {
    const release = resolveBothWays({
      RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST),
      RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY,
    });

    expect(release.source).toBe('conflict');
    expect(release.gitSha).toBe('unknown');
    expect(release.mismatch).toEqual({
      manifestGitSha: SHA_MANIFEST,
      envGitSha: SHA_RAILWAY,
      // Bao loi phai goi dung TEN BIEN: chi `RAILWAY_GIT_COMMIT_SHA` moi dang tranh voi manifest,
      // con `RELEASE_GIT_SHA` thi khong — cu nguoi truc di sua no la cu sai cho.
      envSource: 'railway',
    });
  });

  it('manifest lech Railway, va bien dat tay cu cung co mat -> van doi chieu voi Railway', () => {
    const release = resolveBothWays({
      RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST),
      RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY,
      RELEASE_GIT_SHA: SHA_STALE,
    });

    expect(release.source).toBe('conflict');
    expect(release.mismatch?.envGitSha).toBe(SHA_RAILWAY);
    expect(release.mismatch?.envSource).toBe('railway');
  });

  it('manifest TRUNG Railway nhung bien dat tay cu lech -> KHONG phai xung dot', () => {
    // Bien dat tay da bi thay the han khi nen tang len tieng, nen no khong con quyen bao dong.
    const release = resolveBothWays({
      RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST),
      RAILWAY_GIT_COMMIT_SHA: SHA_MANIFEST,
      RELEASE_GIT_SHA: SHA_STALE,
    });

    expect(release.gitSha).toBe(SHA_MANIFEST);
    expect(release.source).toBe('manifest');
    expect(release.mismatch).toBeUndefined();
  });

  it('manifest hong -> lui ve Railway SHA, khong nem', () => {
    const path = join(scratch, 'release.json');
    writeFileSync(path, '{ khong phai json');

    const release = resolveBothWays({
      RELEASE_MANIFEST_PATH: path,
      RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY,
    });

    expect(release.gitSha).toBe(SHA_RAILWAY);
    expect(release.source).toBe('railway');
  });

  // ----------------------------------------------------------------------- khong nguon nao biet

  it('khong nguon nao (local/CI) -> `unknown` + `none`, va KHONG nem', () => {
    const release = resolveBothWays({});

    expect(release.gitSha).toBe('unknown');
    expect(release.source).toBe('none');
  });

  // ------------------------------------------------------ hai duong doc phai KHONG THE lech nhau

  it('OTel va telemetry noi bo tra cung mot danh tinh o MOI to hop nguon', () => {
    const manifestPath = manifestAt(SHA_MANIFEST);

    const combinations: NodeJS.ProcessEnv[] = [
      {},
      { RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY },
      { RELEASE_GIT_SHA: SHA_STALE },
      { RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY, RELEASE_GIT_SHA: SHA_STALE },
      { RELEASE_MANIFEST_PATH: manifestPath },
      { RELEASE_MANIFEST_PATH: manifestPath, RAILWAY_GIT_COMMIT_SHA: SHA_MANIFEST },
      { RELEASE_MANIFEST_PATH: manifestPath, RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY },
      { RELEASE_MANIFEST_PATH: manifestPath, RELEASE_GIT_SHA: SHA_STALE },
      {
        RELEASE_MANIFEST_PATH: manifestPath,
        RAILWAY_GIT_COMMIT_SHA: SHA_RAILWAY,
        RELEASE_GIT_SHA: SHA_STALE,
      },
    ];

    for (const env of combinations) {
      // `resolveBothWays` tu no la phep khang dinh — no nem neu hai duong lech nhau.
      expect(resolveBothWays(env).gitSha).toBeTypeOf('string');
    }
  });
});
