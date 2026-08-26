import { normalizeSourceLocation, type SourceLocation } from '@netviet/shared';

/**
 * CAU NOI TU MAN HINH SANG IDE TREN MAY NGUOI DUNG.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN SO MOT: MAY CHU KHONG BAO GIO BIET DUONG DAN MAY DEV (muc 12).
 *
 * `C:\Users\phung\Documents\vietpt\source\…` la thong tin cua MOT CAI MAY, khong phai cua he
 * thong. No khong duoc di vao DB nghiep vu, khong vao cau hinh tenant, khong vao telemetry,
 * khong vao log may chu. May chu tra ve DUONG DAN REPO-RELATIVE; goc thu muc do trinh duyet
 * giu, va URI duoc GHEP O DAY — phia client (muc 15).
 *
 * Vi vay khong co ham nao trong tep nay duoc goi tu server, va khong co gia tri nao trong tep
 * nay duoc gui di dau.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN SO HAI: KHONG GHEP MOT DUONG DAN MA TA KHONG KIEM DUOC.
 *
 * `workspaceRoot` do nguoi dung go, `filePath` do may chu tra ve. Ghep hai chuoi lai roi giao
 * cho he dieu hanh mo la mot duong di tu "o nhap tren trang web" toi "mo tep bat ky tren may".
 * `../../` trong `filePath` se vuot ra ngoai repo; mot duong dan tuyet doi se bo qua goc han.
 *
 * Nen `filePath` phai qua `normalizeSourceLocation()` — CUNG cong kiem ma may chu dung — truoc
 * khi cham vao `workspaceRoot`.
 */

/** Cac trinh soan thao dung chung mot lo trinh `<scheme>://file/<duong dan>[:<dong>]`. */
export const IDE_CHOICES = [
  { id: 'vscode', label: 'VS Code', scheme: 'vscode' },
  { id: 'vscode-insiders', label: 'VS Code Insiders', scheme: 'vscode-insiders' },
  { id: 'cursor', label: 'Cursor', scheme: 'cursor' },
] as const;

export type IdeId = (typeof IDE_CHOICES)[number]['id'];

const DEFAULT_IDE: IdeId = 'vscode';

function schemeOf(ide: IdeId | undefined): string {
  return IDE_CHOICES.find((choice) => choice.id === ide)?.scheme ?? 'vscode';
}

/**
 * Goc thu muc hop le: mot duong dan TUYET DOI.
 *
 * Windows (`C:\repo\…` hoac `C:/repo/…`) va POSIX (`/home/…`). Mot goc tuong doi khong ghep ra
 * duoc thu gi he dieu hanh mo duoc, nen no bi tu choi o day thay vi tao ra mot URI hong.
 */
const WINDOWS_ROOT = /^[A-Za-z]:[\\/]/;
const DRIVE_SEGMENT = /^[A-Za-z]:$/;

export type IdeSourceRejection = 'missing_root' | 'invalid_root' | 'invalid_source_path';

export type IdeSourceCheck = { ok: true } | { ok: false; reason: IdeSourceRejection };

export interface IdeSourceInput {
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly line?: number | undefined;
  readonly ide?: IdeId | undefined;
}

/**
 * Mo duoc khong, va NEU KHONG THI VI SAO.
 *
 * Ba ly do, ba cau tra loi khac nhau tren giao dien — do la ca ly do ham nay tra ve `reason`
 * chu khong tra ve `boolean`:
 *
 *   `missing_root`        nguoi dung chua khai bao thu muc repo -> chi ho di cau hinh;
 *   `invalid_root`        da khai bao nhung khong phai duong dan tuyet doi -> chi ho sua;
 *   `invalid_source_path` may chu tra ve mot duong dan khong dung duoc -> KHONG phai loi cua ho.
 *
 * Gop ba thu nay thanh mot nut xam se de nguoi dung ngoi doan xem minh lam sai o dau.
 */
export function validateIdeSourceInput(input: {
  readonly workspaceRoot: string;
  readonly filePath: string;
}): IdeSourceCheck {
  const root = input.workspaceRoot.trim();
  if (root === '') return { ok: false, reason: 'missing_root' };
  if (!WINDOWS_ROOT.test(root) && !root.startsWith('/')) {
    return { ok: false, reason: 'invalid_root' };
  }
  if (!normalizeSourceLocation({ filePath: input.filePath })) {
    return { ok: false, reason: 'invalid_source_path' };
  }
  return { ok: true };
}

/**
 * Ma hoa mot doan duong dan.
 *
 * O DIA GIU NGUYEN DAU HAI CHAM. Tai lieu chinh thuc cua VS Code viet dang nay:
 *
 *   vscode://file/c:/myProject/package.json:5:10
 *
 * Khong phai `c%3A`. Hai cham cua o dia khong duoc ma hoa; con MOI thu khac thi co — khoang
 * trang thanh `%20`, chu co dau thanh chuoi UTF-8 phan tram. Do la ly do ham nay ma hoa TUNG
 * DOAN chu khong ma hoa ca chuoi: `encodeURIComponent` tren ca duong dan se an luon dau `/`
 * phan cach.
 */
function encodeSegment(segment: string): string {
  return DRIVE_SEGMENT.test(segment) ? segment : encodeURIComponent(segment);
}

/**
 * URI mo DUNG TEP, va dung DONG neu biet dong.
 *
 * `null` khi dau vao khong qua duoc `validateIdeSourceInput` — mot URI hong khong duoc phep roi
 * khoi ham nay va tro thanh mot lan bam khong co gi xay ra.
 *
 * KHONG BIA SO DONG. Khong co `line` thi URI dung o tep; them `:1` se dua nguoi dung len dau
 * tep va lam ho tuong day la cho can xem.
 */
export function buildEditorFileUri(input: IdeSourceInput): string | null {
  const check = validateIdeSourceInput(input);
  if (!check.ok) return null;

  const source = normalizeSourceLocation({ filePath: input.filePath, line: input.line });
  if (!source) return null;

  // `\` -> `/` ngay tu dau: phan con lai cua ham chi con phai biet mot dau phan cach.
  const root = input.workspaceRoot.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = [...root.split('/'), ...source.filePath.split('/')];
  const path = segments.map(encodeSegment).join('/');

  const scheme = schemeOf(input.ide);
  const position = source.line !== undefined ? `:${source.line}` : '';
  // Goc POSIX bat dau bang `/` nen doan dau la chuoi rong, va phep noi tu sinh ra
  // `file//home/…` — dung dang ma tai lieu mo ta.
  return `${scheme}://file/${path}${position}`;
}

/* --------------------------------------------------------------------------
 * CAU HINH PHIA TRINH DUYET
 *
 * `localStorage`, khong dong bo len may chu (muc 13). Moi phep doc/ghi deu boc `try/catch`: che
 * do rieng tu, thiet lap chan du lieu trang, hoac render phia may chu deu lam `localStorage`
 * nem hoac vang mat — va mot man hinh chan doan khong duoc chet vi khong doc duoc mot tuy chon.
 * ------------------------------------------------------------------------ */

const STORAGE_KEY = 'nexagnet.ide-debug';

export interface IdePreferences {
  readonly ide: IdeId;
  /** Thu muc repo TREN MAY NGUOI DUNG. Rong = chua cau hinh; nut "Mo trong IDE" tat. */
  readonly workspaceRoot: string;
}

export const EMPTY_IDE_PREFERENCES: IdePreferences = { ide: DEFAULT_IDE, workspaceRoot: '' };

function isIdeId(value: unknown): value is IdeId {
  return IDE_CHOICES.some((choice) => choice.id === value);
}

export function loadIdePreferences(): IdePreferences {
  try {
    if (typeof window === 'undefined') return EMPTY_IDE_PREFERENCES;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_IDE_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_IDE_PREFERENCES;
    const { ide, workspaceRoot } = parsed as Partial<IdePreferences>;
    return {
      ide: isIdeId(ide) ? ide : DEFAULT_IDE,
      workspaceRoot: typeof workspaceRoot === 'string' ? workspaceRoot : '',
    };
  } catch {
    return EMPTY_IDE_PREFERENCES;
  }
}

export function saveIdePreferences(preferences: IdePreferences): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ide: preferences.ide, workspaceRoot: preferences.workspaceRoot.trim() }),
    );
  } catch {
    /* khong luu duoc thi thoi — lan sau nguoi dung go lai */
  }
}

/**
 * Cau giai thich khi khong mo duoc — TIENG VIET, va noi ro AI phai lam gi.
 *
 * `invalid_source_path` co y KHONG do loi nguoi dung: do la loi cua du lieu may chu tra ve, va
 * bao ho di sua cau hinh se lam ho mat thoi gian o dung cho khong co van de.
 */
export function ideRejectionMessage(reason: IdeSourceRejection): string {
  switch (reason) {
    case 'missing_root':
      return 'Chưa khai báo thư mục repo trên máy. Mở phần cài đặt IDE để nhập đường dẫn.';
    case 'invalid_root':
      return 'Thư mục repo phải là đường dẫn tuyệt đối, ví dụ C:\\repo\\nexagnet-platform.';
    case 'invalid_source_path':
      return 'Máy chủ không trả về đường dẫn mã nguồn dùng được cho bước này.';
  }
}

/**
 * Cau canh bao LECH BAN PHAT HANH (muc 16).
 *
 * Runtime co the dang chay commit A trong khi thu muc tren may dang o commit B. GitHub mo dung
 * ban A; IDE mo ban B. Neu B khac A thi so dong co the tro toi mot doan ma khac han.
 *
 * Man hinh KHONG duoc gia vo la hai ban giong nhau — va cung khong the tu kiem, vi trinh duyet
 * khong doc duoc `git` cua may nguoi dung. Nen no NOI RA, va de nguoi dung tu doi chieu.
 */
export function releaseMismatchWarning(
  source: SourceLocation | undefined,
  releaseSha?: string,
): string {
  const where = source?.line !== undefined ? 'dòng' : 'tệp';
  const release = releaseSha
    ? `bản phát hành ${releaseSha.slice(0, 12)}`
    : 'bản phát hành đang chạy';
  return (
    `“Mở mã nguồn” mở đúng ${release} trên GitHub. ` +
    `“Mở trong IDE” mở bản đang có trên máy bạn — nếu máy bạn ở commit khác, ${where} có thể không khớp.`
  );
}
