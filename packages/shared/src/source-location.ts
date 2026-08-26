/**
 * VI TRI MA NGUON cua mot dau vet chay — cau noi tu BANG CHUNG LUC CHAY ve MA NGUON.
 *
 * ---------------------------------------------------------------------------
 * VI SAO `releaseSha` KHONG NAM TRONG `SourceLocation`:
 *
 * Mot vi tri ma nguon tra loi cau "cho nao trong ma nguon". Mot ban phat hanh tra loi cau "ma
 * nguon nao". Hai cau khac nhau, va cau thu hai co DUNG MOT dap an cho ca man hinh: moi ban ghi
 * trong mot luot deu do CUNG MOT tien trinh phat ra, nen chung khong the thuoc hai release.
 *
 * Nhet SHA vao tung vi tri se lap lai 40 ky tu do vai chuc lan mot man hinh, va — nguy hiem hon —
 * tao ra kha nang hai ban ghi mang hai SHA khac nhau, tuc mot trang thai KHONG THE co that ma
 * kieu du lieu lai cho phep bieu dien. `SourceContext` giu no dung mot lan, o dung mot cho.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN: MOI `filePath` DEU LA REPO-RELATIVE.
 *
 * Khong duong dan tuyet doi cua may chu (`/app/apps/api/dist/...`), khong duong dan cua may dev
 * (`C:\Users\...`), khong `node_modules/`, khong `..`. Ba thu do vua ro ri ha tang, vua vo dung
 * voi nguoi doc — vi ca hai dau (GitHub va IDE) deu ghep tu MOT goc rieng cua chinh minh.
 *
 * Cong kiem duy nhat la `normalizeSourceLocation()`. Khong noi nao duoc tu dung mot `SourceLocation`
 * bang cach viet object literal roi tin la no sach.
 */

/** Mot vi tri trong ma nguon cua repo — da qua `normalizeSourceLocation()`. */
export interface SourceLocation {
  /** `OrdersService.sendConfirmation`. Vang mat = biet tep nhung khong biet ham. */
  readonly functionName?: string;
  /** Repo-relative, dung dau `/` (POSIX) — `apps/api/src/orders/orders.service.ts`. */
  readonly filePath: string;
  /** So dong 1-based. Vang mat = KHONG BIET; tuyet doi khong bia mot con so nghe hop ly. */
  readonly line?: number;
}

/**
 * Danh tinh MA NGUON cua ban dang chay — dung mot lan cho ca man hinh.
 *
 * Ca hai truong deu TUY CHON, va vang mat la mot cau tra loi hop le: chay local thi khong co
 * release, va mot ban fork co the chua khai bao repo. Thieu bat ky truong nao thi khong dung
 * duoc permalink — va luc do man hinh phai NOI RA, khong duoc lui ve `main`.
 */
export interface SourceContext {
  /** Da chuan hoa: `https://github.com/<owner>/<repo>`. */
  readonly repositoryUrl?: string;
  /** Git SHA DAY DU cua ban dang chay. `unknown` bi coi la khong co. */
  readonly releaseSha?: string;
}

/** Dau vao THO — moi truong deu co the vang, sai kieu, hoac ban. */
export interface SourceLocationInput {
  readonly functionName?: string | undefined;
  readonly filePath?: string | undefined;
  readonly line?: number | undefined;
}

/** Gia tri `gitSha` khi tang deploy khong biet minh dang chay commit nao. */
const UNKNOWN_SHA = 'unknown';

/** GitHub owner/repo: chu, so, `.`, `_`, `-`. Bat cu thu gi khac deu la dau hieu chen chuoi. */
const OWNER_REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Git SHA rut gon van tra cuu duoc tren GitHub tu 7 ky tu. */
const SHA = /^[0-9a-f]{7,40}$/i;

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * `filePath` co phai mot duong dan repo-relative that khong?
 *
 * DANH SACH TU CHOI, khong phai danh sach cho phep lam sach: mot duong dan sai KHONG duoc "sua"
 * thanh mot duong dan dung. `C:/Users/phung/...` cat bo phan dau se ra mot duong dan trong nhu
 * that nhung tro toi mot tep khac — va mot vi tri ma nguon SAI con te hon khong co vi tri nao.
 */
function isRepoRelativePath(path: string): boolean {
  // `\` la dau phan cach cua Windows. Duong dan repo luon POSIX; con `\` xuat hien nghia la mot
  // duong dan cua may dev da lot toi day.
  if (path.includes('\\')) return false;
  // `:` bat ca o dia (`C:/…`) lan lo trinh (`file://`, `https://`) bang mot phep kiem.
  if (path.includes(':')) return false;
  if (path.startsWith('/')) return false;
  const segments = path.split('/');
  for (const segment of segments) {
    // Doan rong = `//` hoac duoi `/`; `.`/`..` = duong dan chua chuan hoa hoac vuot thu muc.
    if (segment === '' || segment === '.' || segment === '..') return false;
    if (segment === 'node_modules') return false;
  }
  return true;
}

/**
 * CONG KIEM DUY NHAT cho mot vi tri ma nguon.
 *
 * `null` = khong co vi tri dung duoc. `line` hong thi BO RIENG `line` chu khong bo ca vi tri:
 * biet tep ma khong biet dong van mo duoc dung tep, con vut ca hai thi mat luon phan dung duoc.
 */
export function normalizeSourceLocation(input: SourceLocationInput): SourceLocation | null {
  const filePath = trimmed(input.filePath);
  if (!filePath || !isRepoRelativePath(filePath)) return null;

  const functionName = trimmed(input.functionName);
  const line =
    typeof input.line === 'number' && Number.isInteger(input.line) && input.line > 0
      ? input.line
      : undefined;

  return {
    ...(functionName ? { functionName } : {}),
    filePath,
    ...(line !== undefined ? { line } : {}),
  };
}

/**
 * URL repo THO -> `https://github.com/<owner>/<repo>`, hoac `null`.
 *
 * Nhan ca ba dang git hay ghi trong `package.json`: HTTPS, `git@…` SCP, va `ssh://`. Chi
 * `github.com` — day la noi dung duy nhat da xac minh dung duoc dang `/blob/<sha>/<path>#L<n>`,
 * va mot host la se bien nut "Mo ma nguon" thanh mot open redirect (muc 22).
 */
export function normalizeRepositoryUrl(raw: string | undefined): string | null {
  const value = trimmed(raw);
  if (!value) return null;

  const match =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(value) ??
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(value) ??
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(value);
  if (!match) return null;

  const [, owner, repo] = match;
  if (!owner || !repo || !OWNER_REPO.test(owner) || !OWNER_REPO.test(repo)) return null;
  return `https://github.com/${owner}/${repo}`;
}

/**
 * PERMALINK toi DUNG ban phat hanh dang chay.
 *
 * `null` khi thieu repo hoac thieu release. KHONG lui ve `/blob/main/…`: runtime co the dang
 * chay mot commit cu, va mot duong dan tro toi `main` se mo ra mot doan ma KHAC voi doan vua
 * chay — dung kieu sai lam nguoi debug tin la minh da doc dung cho.
 */
export function buildGithubSourceUrl(
  context: SourceContext,
  source: SourceLocation,
): string | null {
  const base = normalizeRepositoryUrl(context.repositoryUrl);
  if (!base) return null;

  const sha = trimmed(context.releaseSha);
  if (!sha || sha === UNKNOWN_SHA || !SHA.test(sha)) return null;

  // Kiem LAI duong dan o day: ham nay dung URL cho nguoi bam vao, nen no khong duoc tin mot
  // `SourceLocation` chi vi kieu cua no dung.
  const normalized = normalizeSourceLocation(source);
  if (!normalized) return null;

  const path = normalized.filePath.split('/').map(encodeURIComponent).join('/');
  const fragment = normalized.line !== undefined ? `#L${normalized.line}` : '';
  return `${base}/blob/${sha}/${path}${fragment}`;
}
