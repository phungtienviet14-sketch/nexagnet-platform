/**
 * Kieu du lieu PHIEN — thuan, khong phu thuoc nen tang, de test chay tren Node.
 *
 * Vai tro la cua MAY CHU (`AuthenticatedUser.role`). Ung dung chi dung no de CHON trai nghiem
 * (lai xe / giam doc / ke toan); quyen tung thao tac van do may chu quyet o moi yeu cau.
 */
export type PlatformRole = 'SALE' | 'MANAGER' | 'ACCOUNTING' | 'ADMIN';

export interface SessionUser {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly role: PlatformRole;
  readonly credentialVersion: number;
  /**
   * #395: tai khoan do Giam doc tao/dat lai phai doi mat khau truoc khi dung. Truong TUY CHON —
   * may chu chua co #395 khong gui, va app van chay dung.
   */
  readonly mustChangePassword?: boolean;
}

export interface StoredSession {
  readonly serverUrl: string;
  readonly token: string;
  readonly user: SessionUser;
  readonly idleTimeoutMs: number;
  /** Lan cuoi may chu xac nhan phien con song (`/auth/me` thanh cong). */
  readonly verifiedAt: string;
}

/**
 * Trai nghiem — suy tu vai tro may chu, KHONG phai mot bang quyen o may khach. Bang anh xa nay la
 * cau noi hien hanh cua nen tang (`transport-actions.ts`: Giam doc->ADMIN, Ke toan->ACCOUNTING,
 * Lai xe->SALE tam giu; MANAGER khong co pham vi van tai). Khi #395 dua ra quyen theo nguoi, man
 * hinh doi theo danh sach thao tac may chu tra ve, khong doi bang nay.
 */
export type Experience = 'driver' | 'director' | 'accounting' | 'none';

export function experienceForRole(role: PlatformRole): Experience {
  switch (role) {
    case 'SALE':
      return 'driver';
    case 'ADMIN':
      return 'director';
    case 'ACCOUNTING':
      return 'accounting';
    case 'MANAGER':
      return 'none';
  }
}

export const ROLE_LABEL: Record<PlatformRole, string> = {
  SALE: 'Lái xe',
  ADMIN: 'Giám đốc',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
};

const ROLES: readonly PlatformRole[] = ['SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN'];

/** Doc nguoi dung tu phan hoi may chu — tu choi hinh dang la thay vi doan. */
export function parseSessionUser(raw: unknown): SessionUser {
  const value = (raw ?? {}) as Record<string, unknown>;
  const role = value.role;
  if (
    typeof value.id !== 'string' ||
    typeof value.username !== 'string' ||
    typeof role !== 'string' ||
    !ROLES.includes(role as PlatformRole)
  ) {
    throw new Error('Máy chủ trả thông tin tài khoản không đúng dạng');
  }
  return {
    id: value.id,
    username: value.username,
    name: typeof value.name === 'string' && value.name.trim() !== '' ? value.name : value.username,
    role: role as PlatformRole,
    credentialVersion: typeof value.credentialVersion === 'number' ? value.credentialVersion : 0,
    ...(value.mustChangePassword === true ? { mustChangePassword: true } : {}),
  };
}

/** Pham vi hang doi ngoai tuyen: CUNG may chu + CUNG nguoi dung (xem sqlite-outbox-store.ts). */
export function outboxScope(session: Pick<StoredSession, 'serverUrl' | 'user'>): string {
  return `${session.serverUrl}|${session.user.id}`;
}
