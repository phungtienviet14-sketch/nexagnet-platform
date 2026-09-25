/**
 * TIN HIEU PHIEN (`#395`) — ham THUAN, khong React, de bai kiem giu duoc luat ma khong can DOM.
 *
 * Quyen va mat khau gio doi TRONG KHI nguoi dung dang mo trang: Giam doc cap/bot quyen, dat lai mat
 * khau hay khoa tai khoan. May chu ap thay doi o YEU CAU KE TIEP; man hinh phai theo kip thay vi doi
 * nguoi dung tu tai lai trang:
 *
 *   · `401` — phien da chet (mat khau vua duoc dat lai, tai khoan bi khoa): ve trang dang nhap, kem
 *     mot cau noi VI SAO, thay vi moi muc hien mot o loi;
 *   · `403` — quyen da doi (hoac may chu doi doi mat khau truoc): doc lai `/auth/me` de danh muc va
 *     nut bam khop voi quyen moi.
 *
 * Moi loi khac (409, 422, 500…) la chuyen cua man hinh dang lam, khong phai cua phien.
 */

export type SessionSignal = 'SESSION_ENDED' | 'ACCESS_CHANGED';

export const SESSION_ENDED_NOTICE =
  'Phiên đăng nhập đã kết thúc (mật khẩu vừa được đặt lại hoặc tài khoản bị khoá). Hãy đăng nhập lại.';

/** Ly do may chu gan khi tai khoan phai doi mat khau truoc khi lam bat cu viec gi. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

const statusOf = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
};

/** Mot loi cua lan goi API → tin hieu cho phien, hoac `null` khi loi khong noi gi ve phien. */
export function sessionSignalOf(error: unknown): SessionSignal | null {
  const status = statusOf(error);
  if (status === 401) return 'SESSION_ENDED';
  if (status === 403) return 'ACCESS_CHANGED';
  return null;
}

/**
 * CHAN DOC LAI DON DAP. Mot trang co muoi query cung nhan `403` trong mot nhip se ban muoi lan
 * `/auth/me` neu khong chan — va mot man hinh ma chinh may chu tu choi (vd be mat ben huu quan cua
 * nguoi khong phai ben huu quan) se doc lai lien tuc. Moi khoang `minIntervalMs` chi MOT lan.
 */
export function createRefreshGate(
  minIntervalMs: number,
  now: () => number = () => Date.now(),
): () => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const current = now();
    if (current - last < minIntervalMs) return false;
    last = current;
    return true;
  };
}

/**
 * Tap quyen tu `/auth/me` → mot khoa on dinh. Hai lan doc cung noi dung phai cho CUNG mot tap (cung
 * danh tinh doi tuong), neu khong moi lan lam tuoi `/auth/me` pha memo cua moi man hinh.
 */
export const permissionsKey = (permissions: readonly string[] | undefined | null): string | null =>
  permissions === undefined || permissions === null ? null : [...permissions].sort().join('\n');

/* ------------------------------------------------------------------ *
 * Man doi mat khau bat buoc
 * ------------------------------------------------------------------ */

/** Trung voi `passwordSchema` phia may chu (`min(12).max(128)`). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordChangeDraft {
  readonly current: string;
  readonly next: string;
  readonly confirm: string;
}

/** Nhung dieu con sai, theo thu tu o nhap tren man hinh. Rong = gui duoc. */
export function passwordChangeProblems(draft: PasswordChangeDraft): readonly string[] {
  const problems: string[] = [];
  if (draft.current.length === 0) problems.push('Nhập mật khẩu tạm đang dùng.');
  if (draft.next.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Mật khẩu mới cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`);
  } else if (draft.next.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Mật khẩu mới dài quá ${PASSWORD_MAX_LENGTH} ký tự.`);
  } else if (draft.next === draft.current) {
    problems.push('Mật khẩu mới phải khác mật khẩu tạm.');
  }
  if (draft.confirm !== draft.next) problems.push('Hai lần nhập mật khẩu mới chưa khớp nhau.');
  return problems;
}
