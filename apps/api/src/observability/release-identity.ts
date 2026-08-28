import { loadTenantConfig } from '@netviet/tenant';
import {
  UNKNOWN_RELEASE,
  asString,
  readReleaseManifest,
  resolveReleaseSha,
  type ReleaseManifest,
} from './release-sha.js';
import type { ReleaseIdentity } from './trace-context.js';

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
  const manifest: ReleaseManifest | null = readReleaseManifest(
    input.manifestPath ?? env.RELEASE_MANIFEST_PATH,
  );
  const readTenantSlug = input.readTenantSlug ?? tenantSlugFromPack;

  const tenant =
    input.tenantSlug ??
    readTenantSlug() ??
    asString(manifest?.tenant) ??
    asString(env.TENANT) ??
    UNKNOWN_RELEASE;

  const environment =
    asString(manifest?.environment) ??
    asString(env.DEPLOYMENT_ENVIRONMENT) ??
    asString(env.NODE_ENV) ??
    'development';

  const { gitSha, source, mismatch } = resolveReleaseSha(manifest, env);
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

/**
 * Dang ngan de in ra log/health: `ultty@gd1-test#c37ee04 (manifest)`.
 *
 * NGUON DI KEM, khong phai mot chi tiet trang tri: mot dong log noi `#c37ee04` ma khong noi no
 * doc tu dau la mot dong log khong dung duoc de quyet dinh rollback.
 */
export function formatRelease(release: ReleaseIdentity): string {
  const sha = release.gitSha === UNKNOWN_RELEASE ? UNKNOWN_RELEASE : release.gitSha.slice(0, 7);
  return `${release.tenant}@${release.environment}#${sha} (${release.source})`;
}
