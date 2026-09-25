/**
 * DIA CHI MAY CHU CUA DOANH NGHIEP.
 *
 * Moi khach chay mot stack rieng (may chu rieng, CSDL rieng, ten mien rieng) — nen MOT ung dung tren
 * cua hang phai hoi "doanh nghiep cua ban o dau" mot lan, roi nho. Token dang nhap chi co gia tri
 * voi dung may chu da cap no, nen dia chi nay la mot phan cua danh tinh phien.
 *
 * Chi nhan HTTPS. Ngoai le duy nhat la mang cuc bo/may ao cho ban dung phat trien (`EXPO_PUBLIC_
 * APP_VARIANT=development`): gui mat khau qua HTTP tran tren mang di dong la mot loi, khong phai
 * mot tuy chon.
 */

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/;

export type ServerUrlResult =
  { readonly ok: true; readonly url: string } | { readonly ok: false; readonly message: string };

export function normalizeServerUrl(input: string, allowInsecureLocal: boolean): ServerUrlResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, message: 'Nhập địa chỉ máy chủ của doanh nghiệp.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, message: 'Địa chỉ không hợp lệ. Ví dụ: van-tai.example.vn' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Địa chỉ không được chứa tên đăng nhập hay mật khẩu.' };
  }
  const isLocal = LOCAL_HOST.test(parsed.hostname);
  if (parsed.protocol === 'http:' && !(allowInsecureLocal && isLocal)) {
    return { ok: false, message: 'Chỉ kết nối qua HTTPS để bảo vệ mật khẩu và dữ liệu.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, message: 'Chỉ hỗ trợ địa chỉ https://' };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, message: 'Chỉ nhập địa chỉ gốc, không kèm ? hay #.' };
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${parsed.protocol}//${parsed.host}${path}` };
}
