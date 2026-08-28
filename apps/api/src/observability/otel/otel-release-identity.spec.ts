import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveReleaseIdentity } from '../release-identity.js';
import { readOtelConfig } from './otel-config.js';

/**
 * MOT TIEN TRINH, MOT DANH TINH BAN PHAT HANH.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI (28/08/2026):
 *
 * Telemetry NOI BO (`TelemetryService` -> Debug View) phan giai release bang
 * `resolveReleaseIdentity()`: `release.json` TRUOC, bien moi truong SAU, va hai nguon lech nhau
 * thi tra `unknown` kem `source: 'conflict'`.
 *
 * Telemetry BEN (OTel -> ClickStack) thi khong. `otel-config.ts` doc DUY NHAT:
 *
 *     release: env.RELEASE_GIT_SHA ?? 'unknown'
 *
 * Ba he qua, khong phai mot:
 *
 *   1. `compose.yaml` truyen `RELEASE_GIT_SHA: ${RELEASE_GIT_SHA:-}` — thieu o host thi container
 *      nhan CHUOI RONG, khong phai `undefined`. `??` khong bat chuoi rong, nen thuoc tinh tai
 *      nguyen `nexagnet.release` di ra ngoai la `''`. Mot trace khong the tra loi "commit nao".
 *   2. Manifest la nguon CHINH tren gd1-test (`identitySource: "manifest"` trong bang chung deploy
 *      run 33039065904). OTel khong doc no. Manifest doi ma env khong doi -> hai kho telemetry
 *      cua CUNG mot tien trinh mang hai SHA khac nhau.
 *   3. Nang nhat: khi hai nguon LECH NHAU, canonical noi `unknown` co chu y — vi mot SHA sai dan
 *      permalink toi commit sai, te hon han mot dau "khong biet". OTel thi IM LANG CHON `env`.
 *
 * Bai nay khong kiem `otel-config.ts` tu no dung; no kiem hai duong PHAN GIAI RA CUNG MOT CAU
 * TRA LOI. Do la bat bien duy nhat khong the tu troi di khi mot trong hai ben duoc sua sau nay.
 *
 * Rang buoc kem theo: preload chay bang `node --import`, TRUOC moi import nghiep vu — nen loi
 * giai khong duoc keo do thi module nghiep vu vao. Bai `otel-preload-isolation` giu cho do.
 */

const SHA_MANIFEST = '7a6cc63904d18be49c653ee1315e65046607bda5';
const SHA_ENV = '8b0f6ad603495fc90235d350b13550afd36a982d';

/** Goi khach KHONG duoc doc trong bai nay — ta so sanh rieng truc `gitSha`. */
const NO_TENANT_PACK = () => undefined;

describe('OTel va telemetry noi bo phan giai CUNG mot release', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'otel-release-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function manifestAt(gitSha: string | undefined, tenant: string | undefined = 'acme'): string {
    const path = join(scratch, 'release.json');
    writeFileSync(path, JSON.stringify({ tenant, environment: 'gd1-test', gitSha }));
    return path;
  }

  /** Bat bien trung tam: hai duong doc, mot cau tra loi. */
  function expectParity(env: NodeJS.ProcessEnv): string {
    const canonical = resolveReleaseIdentity({ env, readTenantSlug: NO_TENANT_PACK });
    expect(readOtelConfig(env).release).toBe(canonical.gitSha);
    return canonical.gitSha;
  }

  // -------------------------------------------------------- manifest la nguon chinh tren gd1

  it('chi co manifest (bien moi truong RONG, dung nhu compose truyen) -> lay SHA cua manifest', () => {
    // `${RELEASE_GIT_SHA:-}` khong dat o host => container thay chuoi rong, khong phai undefined.
    const env = { RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST), RELEASE_GIT_SHA: '' };

    expect(expectParity(env)).toBe(SHA_MANIFEST);
  });

  it('manifest va bien moi truong TRUNG nhau -> chinh SHA do, khong co mau thuan', () => {
    const env = { RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST), RELEASE_GIT_SHA: SHA_MANIFEST };

    expect(expectParity(env)).toBe(SHA_MANIFEST);
    expect(readOtelConfig(env).releaseSource).toBe('manifest');
  });

  // -------------------------------------------------------- lech nhau thi KHONG chon ben nao

  it('manifest LECH bien moi truong -> `unknown`, khong im lang chon mot SHA', () => {
    const env = { RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST), RELEASE_GIT_SHA: SHA_ENV };

    // Cai sai o day khong phai "kem chinh xac" — mot permalink tro toi commit SAI dat hon nhieu
    // mot man hinh noi "khong biet".
    expect(expectParity(env)).toBe('unknown');
    expect(readOtelConfig(env).releaseSource).toBe('conflict');
  });

  // -------------------------------------------------------- gia tri rac khong duoc di tiep

  it('bien moi truong khong phai SHA 40 ky tu -> `unknown`, khong day rac ra ngoai', () => {
    const env = { RELEASE_GIT_SHA: 'main' };

    expect(expectParity(env)).toBe('unknown');
    expect(readOtelConfig(env).releaseSource).toBe('none');
  });

  it('manifest hong/thieu truong -> lui ve bien moi truong hop le', () => {
    const env = { RELEASE_MANIFEST_PATH: manifestAt(undefined), RELEASE_GIT_SHA: SHA_ENV };

    expect(expectParity(env)).toBe(SHA_ENV);
    expect(readOtelConfig(env).releaseSource).toBe('env');
  });

  it('khong nguon nao -> `unknown` (chay local/CI la trang thai BINH THUONG)', () => {
    expect(expectParity({})).toBe('unknown');
    expect(readOtelConfig({}).releaseSource).toBe('none');
  });

  it('duong dan manifest tro toi tep khong ton tai -> lui ve env, khong nem', () => {
    const env = { RELEASE_MANIFEST_PATH: join(scratch, 'khong-co.json'), RELEASE_GIT_SHA: SHA_ENV };

    expect(expectParity(env)).toBe(SHA_ENV);
  });

  // ------------------------------------------------------- span phai noi duoc no cua KHACH NAO

  /**
   * DO TREN gd1-test 28/08/2026, sau lan deploy dau tien co OTel: MOI span mang
   * `nexagnet.tenant = unknown`.
   *
   * Cung mot lop loi voi release SHA, va cung mot nguyen nhan: `otel-config.ts` doc THANG
   * `env.TENANT`, trong khi `compose.yaml` chi dat `TENANT_DIR=/srv/tenant` — chua bao gio dat
   * `TENANT`. Chinh cai bay ma chu thich cua `release-identity.ts` da canh bao, va la ly do phep
   * doc goi khach duoc chuyen vao trong ham do tu 25/08.
   *
   * Span khong noi duoc no thuoc khach nao thi ca cau chuyen "kho quan sat cach ly theo tenant"
   * mat nghia: du lieu nam dung kho, nhung chinh no khong khai duoc chu.
   *
   * `release.json` DA MOUNT va DA co truong `tenant` — nen loi giai khong can them mot nguon nao.
   */
  it('TENANT khong duoc dat (dung nhu compose) -> lay tenant tu manifest, khong phai `unknown`', () => {
    const env = { RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST, 'acme') };

    expect(readOtelConfig(env).tenant).toBe('acme');
  });

  it('khong manifest, chi co bien moi truong -> lay tu bien moi truong', () => {
    expect(readOtelConfig({ TENANT: 'globex' }).tenant).toBe('globex');
  });

  it('manifest thang bien moi truong — manifest la thu tang deploy vua ghi ra', () => {
    const env = { RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST, 'acme'), TENANT: 'globex' };

    expect(readOtelConfig(env).tenant).toBe('acme');
  });

  it('khong nguon nao -> `unknown` (chay local/CI la trang thai BINH THUONG)', () => {
    expect(readOtelConfig({}).tenant).toBe('unknown');
  });

  it('chuoi rong khong duoc coi la mot cau tra loi', () => {
    // Cung cai bay da lam `nexagnet.release` di ra ngoai la `''`: `??` khong bat chuoi rong.
    const env = { RELEASE_MANIFEST_PATH: manifestAt(SHA_MANIFEST, ''), TENANT: '' };

    expect(readOtelConfig(env).tenant).toBe('unknown');
  });
});
