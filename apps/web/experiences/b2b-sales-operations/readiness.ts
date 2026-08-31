import type { BlockedCapabilityDescriptor } from '../../lib/tenant-runtime';

/**
 * BE MAT "CHUA SAN SANG" huong khach — Issue #107 §7.
 *
 * Hop dong: mot nang luc khach da khai la chua san sang phai doc ra la CHUA SAN SANG, kem LY DO
 * cua chinh khach. Khong duoc lam tron thanh mot dau tich, khong duoc an di, va tuyet doi khong
 * duoc bien thanh mot tinh nang trong nhu dang chay.
 *
 * Vi sao doc tu goi khach chu khong tu API: xem chu thich tren `PublicTenantDescriptor.readiness`.
 */

export type CustomerReadinessStatus = 'chua_san_sang';

export interface CustomerReadinessRow {
  readonly key: string;
  readonly label: string;
  readonly status: CustomerReadinessStatus;
  readonly statusLabel: string;
  readonly reason: string;
  /**
   * Viec nguoi dung co the lam tiep — hoac `null` khi nen tang CHUA co duong nao de lam.
   *
   * `null` la mot cau tra loi that va no phai duoc phep ton tai: bao mot nguoi di "cập nhật nguồn
   * dữ liệu" trong khi khong co man hinh nao de ho lam viec do la mot loi huong dan sai.
   */
  readonly action: string | null;
}

export const READINESS_STATUS_LABEL = 'Chưa sẵn sàng';

const UPDATE_SOURCE_ACTION = 'Cập nhật / hoàn thiện nguồn dữ liệu trong phần Cài đặt';

export interface ReadinessProjectionInput {
  /**
   * Nguoi dang xem co duong vao man hinh nguon du lieu khong.
   *
   * Quyet dinh co goi ra HANH DONG hay khong — chu khong quyet dinh co hien dong do hay khong.
   * Nang luc bi chan phai hien voi MOI vai tro: mot nhan vien Sale khong sua duoc bang phi COD van
   * can biet COD chua dung duoc, neu khong ho se hua voi dai ly mot thu he thong chua lam duoc.
   */
  readonly canUpdateSources: boolean;
}

export function toCustomerReadiness(
  blocked: readonly BlockedCapabilityDescriptor[],
  input: ReadinessProjectionInput,
): readonly CustomerReadinessRow[] {
  return blocked.map((capability) => ({
    key: capability.key,
    label: capability.label,
    status: 'chua_san_sang' as const,
    statusLabel: READINESS_STATUS_LABEL,
    reason: capability.reason,
    action: input.canUpdateSources ? UPDATE_SOURCE_ACTION : null,
  }));
}

/**
 * Cau tom tat o dau trang Tong quan.
 *
 * Khi khong co nang luc nao bi chan, cau nay noi dung mot dieu: khach CHUA KHAI nang luc nao bi
 * chan. No khong noi "moi thu da san sang" — day la hai khang dinh khac nhau, va chi mot trong hai
 * la thu du lieu nay chung minh duoc.
 */
export function readinessHeadline(rows: readonly CustomerReadinessRow[]): string {
  if (rows.length === 0) {
    return 'Doanh nghiệp chưa khai báo nghiệp vụ nào đang tạm khoá.';
  }
  if (rows.length === 1) {
    return `1 nghiệp vụ chưa sẵn sàng: ${rows[0]!.label}.`;
  }
  return `${rows.length} nghiệp vụ chưa sẵn sàng: ${rows.map((row) => row.label).join(', ')}.`;
}
