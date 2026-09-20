import { readFileSync } from 'node:fs';
import type {
  ReleaseEnvSource,
  ReleaseIdentityMismatch,
  ReleaseIdentitySource,
} from './trace-context.js';

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
 * TEN BIEN dung sau moi nguon moi truong. Mot bang, mot cho — de dong bao loi luc boot goi dung
 * ten cai bien nguoi truc phai di sua.
 */
export const RELEASE_ENV_VARIABLE: Readonly<Record<ReleaseEnvSource, string>> = {
  railway: 'RAILWAY_GIT_COMMIT_SHA',
  env: 'RELEASE_GIT_SHA',
};

interface EnvGitShaCandidate {
  readonly gitSha: string;
  readonly source: ReleaseEnvSource;
}

/**
 * NEN TANG NOI TRUOC, NGUOI NOI SAU — va day KHONG phai mot phep `??` doi cho.
 *
 * ---------------------------------------------------------------------------
 * SU CO 20/09/2026 (Railway `api-321`, `web-321`):
 *
 * Tien trinh chay dung commit — deployment mang `commitHash=e857a018…` — nhung MOI trace, MOI
 * span va dong `Telemetry:` luc boot deu khai mot SHA khac, cu hon nhieu lan deploy. Ly do:
 * `RELEASE_GIT_SHA` la mot bien DAT BANG TAY tren service. No dung dung MOT lan, roi dung yen
 * trong khi ban phat hanh di tiep. Mot bien nguoi dat khong the tu biet minh da cu.
 *
 * Railway dat `RAILWAY_GIT_COMMIT_SHA` cho TUNG deployment sinh ra tu GitHub — do la commit da
 * kich hoat chinh lan deploy dang chay. Khong go tay duoc, va no doi moi lan.
 *
 * VI SAO KHONG PHAI `RELEASE_GIT_SHA ?? RAILWAY_GIT_COMMIT_SHA`: bien cu DANG CO MAT. `??` chi
 * bat `null`/`undefined`, nen ban cu se tiep tuc thang — dung cai su co nay. Va cung khong phai
 * `conflict`: hai thu nay khong o cung hang. Mot ben la loi khai cua nen tang ve chinh lan deploy
 * nay; ben kia la mot ghi chu nguoi de lai. Khi nen tang da noi, ghi chu do het viec.
 *
 * (Cong don dep di kem nhung KHONG thay cho ban va nay: sau khi ban va nay chay that, bien
 * `RELEASE_GIT_SHA` dat tay tren Railway nen duoc xoa. Neu no quay lai — doi che do deploy, clone
 * service — code van dung, vi luat o day khong phu thuoc vao viec ai do nho xoa mot bien.)
 */
function resolveEnvGitSha(env: NodeJS.ProcessEnv): EnvGitShaCandidate | undefined {
  const fromRailway = asGitSha(env.RAILWAY_GIT_COMMIT_SHA);
  if (fromRailway) return { gitSha: fromRailway, source: 'railway' };

  const fromLegacy = asGitSha(env.RELEASE_GIT_SHA);
  return fromLegacy ? { gitSha: fromLegacy, source: 'env' } : undefined;
}

/**
 * THU TU UU TIEN — ba nguon, mot cau tra loi:
 *
 *   1. `release.json` — do tang deploy ghi, da qua `verify-deployment.mjs`;
 *   2. `RAILWAY_GIT_COMMIT_SHA` — nen tang khai cho chinh deployment dang chay;
 *   3. `RELEASE_GIT_SHA` — bien nguoi dat, cho stack khong co ca hai thu tren;
 *   4. `unknown`.
 *
 * Buoc 2 THAY buoc 3 chu khong tranh voi no: xem `resolveEnvGitSha()` de biet vi sao mot ben la
 * loi khai cua nen tang con ben kia la ghi chu nguoi de lai, va vi sao gop chung thanh `conflict`
 * se bien MOI lan boot tren Railway thanh mot bao dong gia.
 *
 * HAI NGUON LECH NHAU THI KHONG CHON BEN NAO. Day la diem khac ban truoc 26/08/2026: khi do
 * manifest lang le thang, nen mot manifest cu (con lai tu lan deploy truoc) se lam man hinh chan
 * doan tro permalink toi COMMIT SAI — te hon han mot dau "khong biet". Ba tinh huong that co the
 * dan toi lech:
 *   · manifest ghi hong, ban cu con lai tren dia;
 *   · container KHONG duoc tao lai nen giu bien cu, trong khi manifest da la ban moi;
 *   · co nguoi sua tep bang tay tren VM.
 * Ba tinh huong, cung mot ket luan: KHONG BIET, va noi to ra rang co hai gia tri dang tranh nhau.
 *
 * CONG CUNG NAM O TANG DEPLOY (`ROLLOUT` trong `deploy-stack.sh`), khong o day. Mot tien trinh
 * khong duoc chet vi chua biet minh chay commit nao — quan sat khong bao gio duoc tro thanh dieu
 * kien de nghiep vu chay.
 */
export function resolveReleaseSha(
  manifest: ReleaseManifest | null,
  env: NodeJS.ProcessEnv,
): ResolvedReleaseSha {
  const fromManifest = asGitSha(manifest?.gitSha);
  const fromEnv = resolveEnvGitSha(env);

  if (fromManifest && fromEnv && fromManifest !== fromEnv.gitSha) {
    return {
      gitSha: UNKNOWN_RELEASE,
      source: 'conflict',
      mismatch: {
        manifestGitSha: fromManifest,
        envGitSha: fromEnv.gitSha,
        envSource: fromEnv.source,
      },
    };
  }
  if (fromManifest) return { gitSha: fromManifest, source: 'manifest' };
  if (fromEnv) return { gitSha: fromEnv.gitSha, source: fromEnv.source };
  return { gitSha: UNKNOWN_RELEASE, source: 'none' };
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
