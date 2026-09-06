import type { AuthRole, AuthUser } from '../../../lib/auth';

/**
 * DANH TINH TAI KHOAN tren hai vo van tai — #222 P1-D.
 *
 * ==============================================================================================
 * CAU HOI MA MAN HINH PHAI TRA LOI DUOC
 *
 * *"Tôi đang đăng nhập bằng tài khoản nào?"* — va truoc ban nay khong be mat van tai nao tra loi
 * duoc. Vo van hanh chi in mot NHAN VAI ("Giám đốc") o chan thanh ben; vo lai xe khong in gi ca.
 * Hai tai khoan Ke toan khac nhau nhin giong het nhau, va khong co duong nao doi tai khoan ngoai
 * xoa cookie bang tay.
 *
 * ==============================================================================================
 * BA MANH THONG TIN, VA MOI MANH TRA LOI MOT CAU KHAC NHAU
 *
 *   `displayName` — *ai* (nguoi doc nhan ra chinh minh);
 *   `username`    — *tai khoan nao* (thu phan biet hai nguoi trung ten, va la thu ho go luc dang
 *                    nhap — nen la thu ho doi chieu duoc);
 *   `roleLabel`   — *voi quyen gi* (giai thich vi sao man hinh nay thieu mot muc nao do).
 *
 * Bo mot manh la de lai mot cau khong tra loi duoc. Nen `AccountIdentity` KHONG co truong tuy chon:
 * hoac co du ba, hoac khong co danh tinh nao ca (`null`).
 *
 * ==============================================================================================
 * TEP NAY LA HAM THUAN, va do la co y
 *
 * `AuthGate` co the o mot trong BA trang thai (`session` co nguoi, `session` chua biet, `none`/
 * `api-key` khong co phien), va man hinh phai xu ly ca ba. Mot bai kiem doc duoc phai chay het ba
 * ma khong dung mot trinh duyet nao — nen phep quyet dinh nam o day, khong nam trong JSX.
 */

/**
 * NHAN VAI — cung bang chu voi `roleLabelOf` o vo, va CO Y giu ban sao o day.
 *
 * `SALE` la CHO GIU TAM cua vai lai xe (`GD-22`): nen tang chua co vai `DRIVER`. In "Bán hàng" cho
 * mot nguoi lai xe se lam ho nghi minh dang nhap nham tai khoan.
 */
export const ACCOUNT_ROLE_LABEL: Readonly<Record<AuthRole, string>> = {
  SALE: 'Lái xe',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  ADMIN: 'Giám đốc',
};

export interface AccountIdentity {
  readonly displayName: string;
  readonly username: string;
  readonly roleLabel: string;
  readonly role: AuthRole;
}

/** Trang thai phien ma vo van tai can biet — dung bon nhanh, khong hon. */
export type TransportAuthMode = 'api-key' | 'session' | 'none' | 'loading';

export interface AccountPanelModel {
  /** `null` khi chua biet danh tinh — dang doi `/auth/me`, hoac tenant khong chay che do phien. */
  readonly identity: AccountIdentity | null;
  /** Co bay nut `Đăng xuất` khong. */
  readonly canSignOut: boolean;
  /**
   * Cau noi that khi khong co danh tinh. `null` khi co danh tinh.
   *
   * KHONG dung mot cau cho ca hai truong hop: "dang doi" va "khong chay che do phien" la hai su
   * that khac nhau, va noi nham se lam nguoi dung ngoi cho mot thu khong bao gio den.
   */
  readonly note: string | null;
}

export const ACCOUNT_LOADING_NOTE = 'Đang đọc thông tin tài khoản…';
export const ACCOUNT_SESSIONLESS_NOTE =
  'Hệ thống đang chạy không qua đăng nhập, nên không có tài khoản để hiển thị.';

/**
 * `user` -> mo hinh o tai khoan.
 *
 * `Đăng xuất` chi hien khi CO phien that (`mode === 'session'` va co `user`). O che do `none`/
 * `api-key`, mot nut dang xuat se la mot nut khong lam duoc gi — va mot nut nhu vay lam nguoi dung
 * mat tin vao ca man hinh.
 */
export const toAccountPanel = (
  mode: TransportAuthMode,
  user: AuthUser | null,
): AccountPanelModel => {
  if (mode === 'loading') {
    return { identity: null, canSignOut: false, note: ACCOUNT_LOADING_NOTE };
  }
  if (mode !== 'session' || user === null) {
    return { identity: null, canSignOut: false, note: ACCOUNT_SESSIONLESS_NOTE };
  }
  return {
    identity: {
      // Ten hien thi rong thi lui ve `username`: mot o trong o cho "ban la ai" te hon mot ma tai
      // khoan xau ma van doc duoc.
      displayName: user.name.trim().length > 0 ? user.name : user.username,
      username: user.username,
      roleLabel: ACCOUNT_ROLE_LABEL[user.role] ?? user.role,
      role: user.role,
    },
    canSignOut: true,
    note: null,
  };
};

/**
 * Mot dong gon cho be mat 390px — `Nguyễn Thu Phương · Kế toán`.
 *
 * `username` KHONG nam trong dong nay: man hinh lai xe rong 390px, va ba manh thong tin tren mot
 * dong se xuong hang hoac bi cat. No van hien day du khi mo o tai khoan ra.
 */
export const accountSummaryLine = (identity: AccountIdentity): string =>
  `${identity.displayName} · ${identity.roleLabel}`;
