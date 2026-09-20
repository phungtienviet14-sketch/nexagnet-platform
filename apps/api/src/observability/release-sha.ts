import { readFileSync } from 'node:fs';
import type { ReleaseIdentityMismatch, ReleaseIdentitySource } from './trace-context.js';

/**
 * "CODE NAO DANG CHAY TRONG TIEN TRINH NAY" — mot cau hoi, mot cau tra loi, va cau tra loi luon
 * kem TEN NGUON.
 *
 * ---------------------------------------------------------------------------
 * VI SAO DOAN NAY LA MOT MODULE LA RIENG (28/08/2026):
 *
 * Luat duoi day tung song trong `release-identity.ts`. Nhung `release-identity.ts` import
 * `@netviet/tenant` de doc goi khach, va OTel duoc nap bang `node --import otel-preload.js` —
 * TRUOC moi import nghiep vu, vi instrumentation phai va lai `node:http` truoc khi Nest cham
 * vao no. Keo do thi module nghiep vu vao preload la pha hong chinh viec preload ton tai de lam.
 *
 * Nen luat nay nam o day: PHU THUOC DUY NHAT LA `node:fs`. Ca hai duong doc — telemetry noi bo
 * va OTel preload — deu goi cung mot ham, nen chung khong the tra loi khac nhau. Neu thay vi vay
 * ta viet lai luat lan thu hai trong `otel-config.ts`, hai ban se giong nhau dung mot ngay.
 *
 * (Ban sao thu hai do da ton tai va da sai theo BA cach cung luc — xem
 * `otel/otel-release-identity.spec.ts`.)
 */

/** Khuon `release.json` do tang deploy ghi ra. Moi truong deu co the vang o ban cu. */
export interface ReleaseManifest {
  readonly tenant?: unknown;
  readonly environment?: unknown;
  readonly gitSha?: unknown;
  readonly appDigest?: unknown;
  readonly deployedAt?: unknown;
}

export const UNKNOWN_RELEASE = 'unknown';

/**
 * SHA DAY DU, 40 ky tu hex. Tang deploy da ep dieu nay o phia GHI (`deploy-remote.sh` va
 * `verify-deployment.mjs` deu kiem), nhung phia DOC thi khong — nen truoc 26/08/2026 mot chuoi
 * bat ky trong manifest di thang vao permalink cua man hinh chan doan.
 *
 * Chap nhan chu HOA roi chuan hoa ve chu thuong: cung mot commit viet hai kieu KHONG duoc bi doc
 * thanh hai ban phat hanh khac nhau (do se bien thanh mot "xung dot" gia).
 */
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** SHA hop le -> dang chuan (chu thuong). Moi thu khac -> `undefined`, tuc "nguon nay khong biet". */
export function asGitSha(value: unknown): string | undefined {
  const text = asString(value);
  return text && GIT_SHA_PATTERN.test(text) ? text.toLowerCase() : undefined;
}

/**
 * Doc manifest. Moi that bai deu tra `null` — thieu file la trang thai BINH THUONG (chay local,
 * chay test, chay CI), khong phai loi. Mot API khong duoc chet vi khong biet git SHA cua chinh no.
 */
export function readReleaseManifest(path: string | undefined): ReleaseManifest | null {
  if (!path) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as ReleaseManifest) : null;
  } catch {
    return null;
  }
}

export interface ResolvedReleaseSha {
  readonly gitSha: string;
  readonly source: ReleaseIdentitySource;
  readonly mismatch?: ReleaseIdentityMismatch;
}

/**
 * BIEN NEN TANG TU KHAI COMMIT NO VUA BUILD.
 *
 * Railway dat bien nay cho MOI deployment bat nguon tu GitHub, dang SHA DAY DU 40 ky tu, va theo
 * tai lieu cua ho bien duoc bom vao CA hai pha — "the build process for each service deployment"
 * VA "the running service deployment". Nen doc no LUC CHAY la du: khong can `ARG` trong
 * Dockerfile (`ARG` chi bat buoc khi muon dung bien trong LUC BUILD).
 *
 * VI SAO PHAI CO NGUON NAY (do that 20/09/2026, `nexagnet-transport-preview`):
 * Tren PaaS khong co tang deploy cua ta, nen khong co `release.json`, va cung khong co ai ghi
 * `RELEASE_GIT_SHA` theo TUNG lan deploy. Bien do bi dat TAY mot lan roi nam yen trong khi code
 * chay tiep: deployment chay commit `e857a01…` van bao `release: "da19533c10ef"`. Mot nhan sai
 * im lang nhu vay lam moi span/decision het dung duoc de tra loi "chay tren ban nao" — tuc pha
 * dung dieu ma tang danh tinh release ton tai de bao dam.
 *
 * @see https://docs.railway.com/reference/variables
 */
const PLATFORM_GIT_SHA_ENV = 'RAILWAY_GIT_COMMIT_SHA';

/**
 * Thu tu tin cay khi nhieu nguon cung tra loi. Nguon dung TRUOC duoc lay ten cho `source` khi tat
 * ca dong y, nen mot dong log `(manifest)` van co nghia ke ca luc bien moi truong tinh co trung.
 */
const CLAIM_ORDER = ['manifest', 'env', 'platform'] as const;

type ClaimSource = (typeof CLAIM_ORDER)[number];

/** Nguon -> ten truong trong `mismatch`. Khai MOT lan, de hai cho khong troi khoi nhau. */
const MISMATCH_FIELD: Readonly<Record<ClaimSource, keyof ReleaseIdentityMismatch>> = {
  manifest: 'manifestGitSha',
  env: 'envGitSha',
  platform: 'platformGitSha',
};

/**
 * NHIEU NGUON LECH NHAU THI KHONG CHON BEN NAO. Day la diem khac ban truoc 26/08/2026: khi do
 * manifest lang le thang, nen mot manifest cu (con lai tu lan deploy truoc) se lam man hinh chan
 * doan tro permalink toi COMMIT SAI — te hon han mot dau "khong biet". Bon tinh huong that dan
 * toi lech:
 *   · manifest ghi hong, ban cu con lai tren dia;
 *   · container KHONG duoc tao lai nen giu bien cu, trong khi manifest da la ban moi;
 *   · co nguoi sua tep bang tay tren VM;
 *   · tren PaaS, `RELEASE_GIT_SHA` dat TAY mot lan roi nam yen trong khi nen tang van build
 *     commit moi o moi lan deploy (do that 20/09/2026, `nexagnet-transport-preview`).
 *
 * Bon tinh huong, cung mot ket luan: KHONG BIET, va noi to ra rang co nhieu gia tri dang tranh
 * nhau.
 *
 * VI SAO KHONG LANG LE UU TIEN NEN TANG — ke ca khi no gan nhu chac chan dung hon mot bien dat
 * tay: im lang chon mot ben CHINH LA loi ma doan nay ton tai de khong lap lai. Mot bien dat tay
 * lech khoi commit that la MOT SU CO CAU HINH, va cach chua no la GO BIEN DO DI, khong phai de
 * code doan sau lung nguoi van hanh. Go xong thi `platform` la nguon duy nhat, va cau tra loi
 * tu dung o MOI lan deploy ma khong ai phai nho dong vao gi.
 *
 * CONG CUNG NAM O TANG DEPLOY (`ROLLOUT` trong `deploy-stack.sh`), khong o day. Mot tien trinh
 * khong duoc chet vi chua biet minh chay commit nao — quan sat khong bao gio duoc tro thanh dieu
 * kien de nghiep vu chay.
 */
export function resolveReleaseSha(
  manifest: ReleaseManifest | null,
  env: NodeJS.ProcessEnv,
): ResolvedReleaseSha {
  const answers: Readonly<Record<ClaimSource, string | undefined>> = {
    manifest: asGitSha(manifest?.gitSha),
    env: asGitSha(env.RELEASE_GIT_SHA),
    platform: asGitSha(env[PLATFORM_GIT_SHA_ENV]),
  };

  const claims = CLAIM_ORDER.flatMap((source) => {
    const gitSha = answers[source];
    return gitSha ? [{ source, gitSha }] : [];
  });

  const first = claims[0];
  if (!first) return { gitSha: UNKNOWN_RELEASE, source: 'none' };

  if (new Set(claims.map((claim) => claim.gitSha)).size > 1) {
    const mismatch: { -readonly [K in keyof ReleaseIdentityMismatch]: string } = {};
    for (const claim of claims) mismatch[MISMATCH_FIELD[claim.source]] = claim.gitSha;
    return { gitSha: UNKNOWN_RELEASE, source: 'conflict', mismatch };
  }

  return { gitSha: first.gitSha, source: first.source };
}

/**
 * KHACH NAO DANG DUOC PHUC VU — phien ban cho PRELOAD.
 *
 * ---------------------------------------------------------------------------
 * VI SAO NO KHAC `resolveReleaseIdentity()`, va khac CO Y:
 *
 * Ham canonical DAO NGUOC thu tu cho `tenant`: no doc GOI KHACH truoc, vi goi khach la thu quyet
 * dinh app dang phuc vu ai LUC CHAY, con manifest chi ghi lai y dinh cua lan deploy.
 *
 * Preload KHONG doc duoc goi khach: `loadTenantConfig()` den tu `@netviet/tenant`, tuc chinh do
 * thi nghiep vu ma preload phai vao truoc. Nen o day thu tu la manifest -> bien moi truong, va
 * hai nguon lech nhau la mot SU CO CAU HINH ma duong canonical se bao — khong phai viec cua doan
 * code chay som nhat trong tien trinh.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG `env.TENANT` MOT MINH (do that tren gd1-test 28/08/2026):
 *
 * `compose.yaml` dat `TENANT_DIR=/srv/tenant` va KHONG dat `TENANT` — trong image khong co thu
 * muc `tenants/` de tra slug. Nen `env.TENANT ?? 'unknown'` cho ra `unknown` tren MOI span cua
 * lan deploy dau tien co OTel. Mot span khong noi duoc no thuoc khach nao lam ca cau chuyen "kho
 * quan sat cach ly theo tenant" mat nghia: du lieu nam dung kho, nhung chinh no khong khai duoc.
 *
 * `release.json` da duoc mount va DA co truong `tenant`, nen loi giai khong can them nguon nao.
 */
export function resolveTenant(manifest: ReleaseManifest | null, env: NodeJS.ProcessEnv): string {
  return asString(manifest?.tenant) ?? asString(env.TENANT) ?? UNKNOWN_RELEASE;
}
