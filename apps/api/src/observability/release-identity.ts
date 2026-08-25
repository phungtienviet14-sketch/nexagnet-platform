import { readFileSync } from 'node:fs';
import { loadTenantConfig } from '@netviet/tenant';
import type { ReleaseIdentity } from './trace-context.js';

/**
 * DOC danh tinh ban dang chay. KHONG sinh ra mot he metadata release thu hai (muc 23).
 *
 * Nguon su that da ton tai: `deploy-remote.sh:write_release_json()` ghi
 * `/srv/netviet/apps/<stack>/.runtime/release.json`, va `verify-deployment.mjs` da validate du
 * chin truong cua no. Cai thieu duy nhat la file do CHUA BAO GIO toi duoc container — no khong
 * nam trong danh sach `volumes:` cua service `api`. File nay doc no khi co, va lui ve bien moi
 * truong khi khong.
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
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

  const gitSha = asString(manifest?.gitSha) ?? asString(env.RELEASE_GIT_SHA) ?? UNKNOWN;
  const appDigest = asString(manifest?.appDigest) ?? asString(env.RELEASE_APP_DIGEST);
  const deployedAt = asString(manifest?.deployedAt) ?? asString(env.RELEASE_DEPLOYED_AT);

  return {
    tenant,
    environment,
    gitSha,
    ...(appDigest ? { appDigest } : {}),
    ...(deployedAt ? { deployedAt } : {}),
  };
}

/** Dang ngan de in ra log/health: `ultty@gd1-test#c37ee04`. */
export function formatRelease(release: ReleaseIdentity): string {
  const sha = release.gitSha === UNKNOWN ? UNKNOWN : release.gitSha.slice(0, 7);
  return `${release.tenant}@${release.environment}#${sha}`;
}
