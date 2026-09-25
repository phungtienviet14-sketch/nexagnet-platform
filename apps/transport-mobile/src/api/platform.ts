import { ApiError } from './errors';
import type { HttpClient } from './http';

/**
 * CAU HINH DOANH NGHIEP va QUYEN — ca hai DO MAY CHU TRA, ung dung khong tu suy.
 *
 *   `GET /auth/client`      (cong khai) thuong hieu, nang luc bat, mui gio — cung phep chieu
 *                           `toPublicTenantDescriptor` ma web dua cho moi trinh duyet.
 *   `GET /transport/access` (da dang nhap) danh sach thao tac CUA CHINH nguoi dung, tinh bang
 *                           dung ham guard dung de chan — nen khong lech nhau duoc.
 *
 * May chu cu chua co hai route nay tra 404: ung dung van chay, dung thuong hieu mac dinh va
 * CHO MAY CHU QUYET tung thao tac (403 khi bam), thay vi tu dung mot bang quyen o may khach.
 */
export interface TenantBranding {
  readonly productName: string;
  readonly installName?: string;
  readonly shortName?: string;
  readonly themeColor?: string;
  readonly backgroundColor?: string;
  readonly monogram?: string;
  readonly logoPath?: string;
}

export interface TenantDescriptor {
  readonly branding: TenantBranding;
  readonly experience: string;
  readonly capabilities: readonly string[];
  readonly readiness?: {
    readonly blockedCapabilities?: ReadonlyArray<{ key: string; label: string; reason: string }>;
    readonly previewNotice?: { label: string; note: string };
  };
  readonly transport?: { readonly timeZone?: string };
}

export interface ClientDescriptor {
  readonly contract: string;
  readonly authMode: 'session' | 'api-key' | 'none';
  readonly tenant: TenantDescriptor | null;
}

export const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const TRANSPORT_EXPERIENCE = 'transport-operations';

export async function fetchClientDescriptor(http: HttpClient): Promise<ClientDescriptor | null> {
  try {
    return await http.get<ClientDescriptor>('/auth/client', { anonymous: true, timeoutMs: 10_000 });
  } catch (error) {
    if (error instanceof ApiError && (error.kind === 'NOT_MOUNTED' || error.status === 404))
      return null;
    throw error;
  }
}

export interface AccessView {
  readonly role: string | null;
  readonly actions: readonly string[];
}

/**
 * `null` = may chu chua co route nay (khong phai "khong co quyen"). Ban API cu tra 404 JSON mac dinh
 * cua Nest (`Cannot GET /transport/access`, KHONG co `reason`); 404 CO `reason` la phan quyet that.
 */
export async function fetchAccess(http: HttpClient): Promise<AccessView | null> {
  try {
    return await http.get<AccessView>('/transport/access');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.kind === 'NOT_MOUNTED' || (error.status === 404 && error.reason === null)) {
      return null;
    }
    throw error;
  }
}

/**
 * Nang luc co bat khong. Khong biet (may chu cu) -> coi nhu CO: an mot man vi thieu thong tin se
 * giau mot tinh nang dang chay; hien no ra thi may chu van la noi tu choi.
 */
export function hasCapability(descriptor: TenantDescriptor | null, capability: string): boolean {
  if (!descriptor) return true;
  const blocked =
    descriptor.readiness?.blockedCapabilities?.some((item) => item.key === capability) ?? false;
  return descriptor.capabilities.includes(capability) && !blocked;
}

/** Thao tac co duoc phep khong. Khong biet (may chu cu) -> hien, de may chu quyet. */
export function canPerform(access: AccessView | null, action: string): boolean {
  if (!access) return true;
  return access.actions.includes(action);
}
