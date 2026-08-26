import { readFileSync } from 'node:fs';
import { loadTenantConfig } from '@netviet/tenant';
import type {
  ReleaseIdentity,
  ReleaseIdentityMismatch,
  ReleaseIdentitySource,
} from './trace-context.js';

/**
 * DOC danh tinh ban dang chay. KHONG sinh ra mot he metadata release thu hai (muc 23).
 *
 * Nguon su that da ton tai: `write-release-manifest.sh` ghi
 * `/srv/netviet/apps/<stack>/.runtime/release.json`, va `verify-deployment.mjs` da validate du
 * chin truong cua no. File nay doc no khi co, va lui ve bien moi truong khi khong — nhung LUON
 * noi ro minh dang doc nguon nao (`source`).
 *
 * TU 26/08/2026 manifest THUC SU toi duoc container: no duoc ghi TRUOC `deploy-stack.sh` (tuc
 * truoc `docker compose up`) roi mount `:ro` vao `api` va cac worker. Truoc do no duoc ghi SAU,
 * nen mount la bat kha thi — Docker gap mot duong dan chua ton tai thi tao ra mot THU MUC trung
 * ten, hong ca mount lan lan ghi ke tiep. Do la ly do that su khien `RELEASE_MANIFEST_PATH` rong
 * suot tren `gd1-test`, va no la mot van de THU TU chu khong phai mot van de thieu cau hinh.
 *
 * VI SAO DIEU NAY QUAN TRONG: khong co no, cau hoi "bug nay xay ra tren commit nao" phai tra loi
 * bang cach SSH len VM, doc `release.json`, roi doi chieu thu cong theo moc thoi gian.
 *
 * BAY DA CAN MOT LAN: bien moi truong phai co mat o CA HAI noi — `render-secrets.sh` VA khoi
 * `environment:` cua service `api` trong `compose.yaml` (khoi do liet ke tuong minh). Thieu noi
 * thu hai thi bien khong bao gio toi container — dung loi da lam `ADVICE_COMPOSER` rong suot
 * 19/08 -> 21/08/2026.
 */

/** Khuon `release.json` do tang deploy ghi ra. Moi truong deu co the vang o ban cu. */
interface ReleaseManifest {
  readonly tenant?: unknown;
  readonly environment?: unknown;
  readonly gitSha?: unknown;
  readonly appDigest?: unknown;
  readonly deployedAt?: unknown;
}

const UNKNOWN = 'unknown';

/**
 * SHA DAY DU, 40 ky tu hex. Tang deploy da ep dieu nay o phia GHI (`deploy-remote.sh` va
 * `verify-deployment.mjs` deu kiem), nhung phia DOC thi khong — nen truoc 26/08/2026 mot chuoi
 * bat ky trong manifest di thang vao permalink cua man hinh chan doan.
 *
 * Chap nhan chu HOA roi chuan hoa ve chu thuong: cung mot commit viet hai kieu KHONG duoc bi doc
 * thanh hai ban phat hanh khac nhau (do se bien thanh mot "xung dot" gia).
 */
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** SHA hop le -> dang chuan (chu thuong). Moi thu khac -> `undefined`, tuc "nguon nay khong biet". */
function asGitSha(value: unknown): string | undefined {
  const text = asString(value);
  return text && GIT_SHA_PATTERN.test(text) ? text.toLowerCase() : undefined;
}

/**
 * Doc manifest. Moi that bai deu tra `null` — thieu file la trang thai BINH THUONG (chay local,
 * chay test, chay CI), khong phai loi. Mot API khong duoc chet vi khong biet git SHA cua chinh no.
 */
function readManifest(path: string | undefined): ReleaseManifest | null {
  if (!path) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as ReleaseManifest) : null;
  } catch {
    return null;
  }
}

/**
 * Doc slug tu GOI KHACH dang mount (`TENANT_DIR`/`TENANT`).
 *
 * NUOT MOI LOI. Khong doc duoc goi khach la trang thai BINH THUONG o local/CI/script, va mot
 * tien trinh khong duoc chet chi vi no chua biet minh phuc vu ai. Khong biet -> `undefined`,
 * roi cac nguon con lai o duoi tra loi.
 */
function tenantSlugFromPack(): string | undefined {
  try {
    return asString(loadTenantConfig().slug);
  } catch {
    return undefined;
  }
}

export interface ResolveReleaseInput {
  /** Duong dan `release.json` — `RELEASE_MANIFEST_PATH`. */
  readonly manifestPath?: string | undefined;
  /** Slug khach doc tu goi khach (`tenantConfig().slug`) — nguon dang tin nhat. */
  readonly tenantSlug?: string | undefined;
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Cach doc goi khach. Tiem vao de test khong phai dung mot thu muc that; ban chay that dung
   * mac dinh nen KHONG noi goi nao phai nho tu truyen slug vao.
   */
  readonly readTenantSlug?: () => string | undefined;
}

/**
 * Thu tu uu tien co chu y:
 *  1. `release.json` — do CI ghi, da qua `verify-deployment.mjs`, dang tin nhat;
 *  2. bien moi truong — duong cho stack chua mount manifest;
 *  3. goi khach / `unknown` — local va test.
 *
 * Rieng `tenant` DAO nguoc thu tu: goi khach (`TENANT_DIR`) la thu quyet dinh app dang phuc vu ai
 * luc CHAY. Manifest chi ghi lai y dinh cua lan deploy. Hai thu lech nhau la mot su co cau hinh,
 * va luc do ta muon thay ten khach ma app THUC SU dang phuc vu.
 *
 * GOI KHACH DUOC DOC O NGAY DAY, khong phai o noi goi. Truoc 25/08/2026 phep doc do nam trong
 * `observability.module.ts`, va `workflow.module.ts` — noi goi thu hai — khong biet minh phai
 * lam viec do. Ket qua: stack chay `TENANT_DIR=/srv/tenant` khong dat `TENANT`, khong mount
 * `release.json`, nen MOI khoa thao tac va MOI metadata workflow deu mang `tenant=unknown`.
 * Hai ban trien khai da chia lam hai chinh vi thu tu uu tien song o phia NOI GOI; nay no song
 * o day, va mot noi goi thu ba khong the lap lai loi do.
 */
export function resolveReleaseIdentity(input: ResolveReleaseInput = {}): ReleaseIdentity {
  const env = input.env ?? process.env;
  const manifest = readManifest(input.manifestPath ?? env.RELEASE_MANIFEST_PATH);
  const readTenantSlug = input.readTenantSlug ?? tenantSlugFromPack;

  const tenant =
    input.tenantSlug ??
    readTenantSlug() ??
    asString(manifest?.tenant) ??
    asString(env.TENANT) ??
    UNKNOWN;

  const environment =
    asString(manifest?.environment) ??
    asString(env.DEPLOYMENT_ENVIRONMENT) ??
    asString(env.NODE_ENV) ??
    'development';

  const { gitSha, source, mismatch } = resolveGitSha(manifest, env);
  const appDigest = asString(manifest?.appDigest) ?? asString(env.RELEASE_APP_DIGEST);
  const deployedAt = asString(manifest?.deployedAt) ?? asString(env.RELEASE_DEPLOYED_AT);

  return {
    tenant,
    environment,
    gitSha,
    source,
    ...(mismatch ? { mismatch } : {}),
    ...(appDigest ? { appDigest } : {}),
    ...(deployedAt ? { deployedAt } : {}),
  };
}

interface ResolvedGitSha {
  readonly gitSha: string;
  readonly source: ReleaseIdentitySource;
  readonly mismatch?: ReleaseIdentityMismatch;
}

/**
 * "CODE NAO DANG CHAY TRONG TIEN TRINH NAY" — mot cau hoi, mot cau tra loi, va cau tra loi luon
 * kem TEN NGUON.
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
function resolveGitSha(manifest: ReleaseManifest | null, env: NodeJS.ProcessEnv): ResolvedGitSha {
  const fromManifest = asGitSha(manifest?.gitSha);
  const fromEnv = asGitSha(env.RELEASE_GIT_SHA);

  if (fromManifest && fromEnv && fromManifest !== fromEnv) {
    return {
      gitSha: UNKNOWN,
      source: 'conflict',
      mismatch: { manifestGitSha: fromManifest, envGitSha: fromEnv },
    };
  }
  if (fromManifest) return { gitSha: fromManifest, source: 'manifest' };
  if (fromEnv) return { gitSha: fromEnv, source: 'env' };
  return { gitSha: UNKNOWN, source: 'none' };
}

/**
 * Dang ngan de in ra log/health: `ultty@gd1-test#c37ee04 (manifest)`.
 *
 * NGUON DI KEM, khong phai mot chi tiet trang tri: mot dong log noi `#c37ee04` ma khong noi no
 * doc tu dau la mot dong log khong dung duoc de quyet dinh rollback.
 */
export function formatRelease(release: ReleaseIdentity): string {
  const sha = release.gitSha === UNKNOWN ? UNKNOWN : release.gitSha.slice(0, 7);
  return `${release.tenant}@${release.environment}#${sha} (${release.source})`;
}
