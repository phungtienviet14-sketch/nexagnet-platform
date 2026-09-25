import type { SessionStatus } from './SessionProvider';

export type GateTarget = '/' | '/(auth)/server' | '/(auth)/login';

/**
 * CONG DIEU HUONG DUY NHAT — trang thai phien quyet dinh nguoi dung dung o dau.
 *
 * Cua vao (`app/index.tsx`) chi chon man LUC MO ung dung. Sau do phien doi trang thai ngay tren
 * mot man khac: dang nhap xong khi dang o man dang nhap, chon may chu xong o man may chu, het phien
 * (401) giua ca lam viec. Khong co ham nay thi man dang nhap dung yen du dang nhap da thanh cong
 * (smoke Maestro tren may ao bat duoc dung loi nay).
 *
 * Tra `null` khi khong can di dau: dang khoi dong, dang o cua vao (index tu dieu huong), hoac dang
 * o dung man. Da dang nhap thi ve `/` de cua vao chon trai nghiem theo vai — ham nay khong tu
 * quyet vai.
 */
export function gateTarget(status: SessionStatus, segments: readonly string[]): GateTarget | null {
  if (status === 'booting' || segments.length === 0) return null;
  const [group, screen] = segments;
  const inAuth = group === '(auth)';
  if (status === 'signedIn') {
    return inAuth && screen !== 'no-access' ? '/' : null;
  }
  const target = status === 'needsServer' ? 'server' : 'login';
  if (inAuth && screen === target) return null;
  return target === 'server' ? '/(auth)/server' : '/(auth)/login';
}
