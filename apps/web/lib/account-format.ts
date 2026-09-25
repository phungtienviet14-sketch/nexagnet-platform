import type { TemporaryCredential } from './auth';

/**
 * CAU CHU dung chung cho moi man quan tri tai khoan (`#395`) — `/settings` (khach van hanh) va
 * "Tài khoản & quyền" (khach van tai). Ham THUAN: mot mat khau tam phai duoc doc ra, dan vao Zalo
 * va dang nhap duoc giong nhau o ca hai noi.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatDateTime(iso: string | null | undefined): string {
  if (iso == null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

/** "Lần cuối đăng nhập" dang tuong doi — cau nguoi ta noi, khong phai dau thoi gian. */
export function relativeLastLogin(iso: string | null | undefined, now: Date): string {
  if (iso == null) return 'Chưa đăng nhập';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'Chưa đăng nhập';
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < MINUTE) return 'Vừa xong';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} phút trước`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} giờ trước`;
  if (elapsed < 2 * DAY) return 'Hôm qua';
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)} ngày trước`;
  return formatDateTime(iso);
}

/** `abcdefghjkmnpqrs` → `abcd-efgh-jkmn-pqrs`; chuoi da co gach thi giu nguyen. */
export function formatTemporaryPassword(value: string): string {
  if (value.includes('-')) return value;
  return value.match(/.{1,4}/g)?.join('-') ?? value;
}

/**
 * LOI NHAN de nguoi cap sao chep gui qua Zalo/SMS: du de nguoi nhan tu dang nhap ma khong phai hoi
 * lai — dia chi, ten dang nhap, mat khau tam, han, va viec se xay ra lan dau.
 */
export function credentialMessage(input: {
  readonly productName: string;
  readonly name: string;
  readonly username: string;
  readonly credential: TemporaryCredential;
  readonly loginUrl: string;
}): string {
  return [
    `Chào ${input.name}, đây là tài khoản ${input.productName} của bạn.`,
    `Địa chỉ đăng nhập: ${input.loginUrl}`,
    `Tên đăng nhập: ${input.username}`,
    `Mật khẩu tạm: ${formatTemporaryPassword(input.credential.temporaryPassword)}`,
    `Mật khẩu tạm hết hạn lúc ${formatDateTime(input.credential.expiresAt)}. Lần đầu đăng nhập, hệ thống sẽ yêu cầu bạn đặt mật khẩu riêng.`,
  ].join('\n');
}

/** Dia chi trang dang nhap cua CHINH trang dang mo — loi nhan tro dung may chu nguoi nhan dung. */
export const loginUrlOf = (): string =>
  typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`;
