import type { PublicTenantDescriptor } from '../../lib/tenant-runtime';
import { hasCapability, hasZaloIntegration } from '../../lib/tenant-runtime';

/**
 * Kien truc thong tin cua man `/settings` — xep theo VIEC KHACH LAM, khong theo he thong con.
 *
 * Ban cu bay 11 the ngang hang cung luc (`Kênh Zalo`, `Nguồn sự thật`, `Rules & công thức`,
 * `Sẵn sàng vận hành`, …). Ten the la ten mo-dun ky thuat, nen de dat mot viec nghiep vu ("thang
 * nay chua co bang gia") khach phai biet truoc no nam trong he thong con nao. Issue #117 doi
 * nguoc lai: bon NHOM viec, moi nhom vai muc, va moi ten muc doc len la mot viec.
 *
 * Module nay CO Y khong chua JSX: bo test web chay moi truong node, nen toan bo phan quyet dinh
 * (muc nao hien, ai duoc sua, deep-link ve dau) phai o day de co bai kiem tra cham toi.
 */

export type SettingsSectionId =
  | 'overview'
  | 'products-pricing'
  | 'dealers-groups'
  | 'sales-policy'
  | 'content'
  | 'campaigns'
  | 'notifications'
  | 'zalo'
  | 'automation'
  | 'system-status'
  | 'users'
  | 'audit';

export type SettingsGroupId = 'start' | 'selling' | 'customer-care' | 'operations';

export interface SettingsGroupDescriptor {
  readonly id: SettingsGroupId;
  readonly label: string;
}

export interface SettingsSectionDescriptor {
  readonly id: SettingsSectionId;
  readonly group: SettingsGroupId;
  readonly label: string;
  readonly description: string;
}

export const SETTINGS_GROUPS: readonly SettingsGroupDescriptor[] = [
  { id: 'start', label: 'Bắt đầu' },
  { id: 'selling', label: 'Bán hàng' },
  { id: 'customer-care', label: 'Chăm sóc khách hàng' },
  { id: 'operations', label: 'Vận hành' },
];

/**
 * Ten muc la NGON NGU NGHIEP VU, khong phai ten mo-dun.
 *
 * `SETTINGS_FORBIDDEN_PRIMARY_TERMS` ben duoi khoa dieu do lai bang mot bai kiem tra: ten/mo ta o
 * day khong duoc chua tu ky thuat. Ma bien moi truong va ma ly do van dung duoc, nhung chi trong
 * phan "Chi tiết kỹ thuật" cua tung man, khong phai o dieu huong.
 */
export const SETTINGS_SECTIONS: readonly SettingsSectionDescriptor[] = [
  {
    id: 'overview',
    group: 'start',
    label: 'Tổng quan',
    description: 'Hệ thống đang chạy thế nào và còn thiếu việc gì',
  },
  {
    id: 'products-pricing',
    group: 'selling',
    label: 'Sản phẩm & bảng giá',
    description: 'Danh mục hàng và bảng giá đang áp dụng',
  },
  {
    id: 'dealers-groups',
    group: 'selling',
    label: 'Đại lý & nhóm Zalo',
    description: 'Ai là đại lý, nhóm nào của ai',
  },
  {
    id: 'sales-policy',
    group: 'selling',
    label: 'Chính sách bán hàng',
    description: 'Công nợ, ngưỡng đơn, phí và thuế',
  },
  {
    id: 'content',
    group: 'customer-care',
    label: 'Nội dung & kiến thức',
    description: 'Câu trả lời sẵn, hình ảnh và tư vấn sản phẩm',
  },
  {
    id: 'campaigns',
    group: 'customer-care',
    label: 'Chiến dịch chăm sóc',
    description: 'Soạn, duyệt và lên lịch gửi cho nhóm',
  },
  {
    id: 'notifications',
    group: 'customer-care',
    label: 'Thông báo',
    description: 'Ai được báo khi có việc cần người xử lý',
  },
  {
    id: 'zalo',
    group: 'operations',
    label: 'Kết nối Zalo',
    description: 'Tài khoản đang nghe tin và nhóm được phép',
  },
  {
    id: 'automation',
    group: 'operations',
    label: 'Tự động hóa',
    description: 'Khi nào máy tự trả lời, khi nào chuyển người',
  },
  {
    id: 'system-status',
    group: 'operations',
    label: 'Trạng thái hệ thống',
    description: 'Việc còn thiếu trước khi chạy thật',
  },
  {
    id: 'users',
    group: 'operations',
    label: 'Người dùng & phân quyền',
    description: 'Tài khoản đăng nhập và quyền của từng người',
  },
  {
    id: 'audit',
    group: 'operations',
    label: 'Lịch sử thay đổi',
    description: 'Ai đã đổi gì, lúc nào',
  },
];

/**
 * Tu KY THUAT khong duoc xuat hien o dieu huong hay tieu de muc.
 *
 * Day khong phai kiem duyet chu nghia: moi tu trong danh sach nay tung la ten mot the tren ban cu,
 * va moi tu deu bat khach phai biet kien truc ben trong truoc khi lam duoc mot viec ban hang.
 */
export const SETTINGS_FORBIDDEN_PRIMARY_TERMS: readonly string[] = [
  'auto_send',
  'kill switch',
  'nguồn sự thật',
  'source truth',
  'rules',
  'adapter',
  'endpoint',
  'webhook',
  'persistence',
  'schema',
  'payload',
  'json',
  'sku',
];

export type SettingsRole = 'SALE' | 'ACCOUNTING' | 'MANAGER' | 'ADMIN';

/**
 * Quyen tren man cau hinh — SUY RA TU RBAC CUA MAY CHU, khong phat minh them.
 *
 * `SettingsController` cho ca bon vai tro DOC (`@Roles('SALE','MANAGER','ACCOUNTING','ADMIN')`),
 * nhung moi thao tac ghi deu `@Roles('MANAGER','ADMIN')`, con controller nguoi dung la
 * `@Roles('ADMIN')`. Ba muc quyen o day la ba muc do, khong hon.
 *
 * `enforced=false` khi chua dang nhap: `RolesGuard` tra `true` ngay khi `AUTH_MODE !== 'session'`,
 * nghia la may chu KHONG chan gi ca. An nut trong truong hop do la bao mat gia — man hinh se cam
 * thay an toan trong khi API van mo. Vi vay che do do duoc coi la du quyen, va man Tong quan noi
 * thang rang viec phan quyen dang tat.
 */
export interface SettingsAccess {
  readonly role: SettingsRole | null;
  readonly canConfigure: boolean;
  readonly canManageUsers: boolean;
  readonly enforced: boolean;
}

export function resolveSettingsAccess(role: SettingsRole | null | undefined): SettingsAccess {
  if (!role) {
    return { role: null, canConfigure: true, canManageUsers: true, enforced: false };
  }
  return {
    role,
    canConfigure: role === 'MANAGER' || role === 'ADMIN',
    canManageUsers: role === 'ADMIN',
    enforced: true,
  };
}

const SECTION_ORDER = SETTINGS_SECTIONS.map((section) => section.id);

/**
 * Muc nao hien — theo NANG LUC cua goi khach truoc, roi moi den vai tro.
 *
 * Khong co nhanh nao theo ten khach: mot goi khach bat `sales-order` thi co man bang gia, khong
 * quan trong khach do ten gi.
 */
export function selectSettingsSectionIds(
  tenant: PublicTenantDescriptor,
  access: SettingsAccess = resolveSettingsAccess(null),
): readonly SettingsSectionId[] {
  if (tenant.experience === 'knowledge-workspace') {
    return hasCapability(tenant, 'knowledge') ? ['content'] : [];
  }

  const visible = new Set<SettingsSectionId>();
  visible.add('overview');
  if (hasCapability(tenant, 'sales-order')) {
    visible.add('products-pricing');
    visible.add('sales-policy');
    visible.add('automation');
  }
  if (hasCapability(tenant, 'sales-order') || hasCapability(tenant, 'messaging')) {
    visible.add('dealers-groups');
  }
  if (hasCapability(tenant, 'knowledge')) visible.add('content');
  if (hasCapability(tenant, 'campaign')) visible.add('campaigns');
  if (hasCapability(tenant, 'notifications')) visible.add('notifications');
  if (hasZaloIntegration(tenant)) visible.add('zalo');
  if (hasCapability(tenant, 'operations')) {
    visible.add('system-status');
    visible.add('users');
    visible.add('audit');
  }
  // Quan ly tai khoan la man DUY NHAT khong con gi de doc khi khong duoc sua — may chu doi ADMIN
  // cho ca `GET`. Cac man khac van co gia tri doc that, nen chung o lai va chi tat nut.
  if (!access.canManageUsers) visible.delete('users');
  return SECTION_ORDER.filter((id) => visible.has(id));
}

/** Deep-link: `?section=…` khong hop le hay khong duoc phep thi ve muc dau tien, khong bao loi. */
export function resolveActiveSettingsSection(
  visibleSections: readonly SettingsSectionId[],
  requested?: string | null,
): SettingsSectionId {
  const requestedSection = visibleSections.find((id) => id === requested);
  const activeSection = requestedSection ?? visibleSections[0];
  if (!activeSection) throw new Error('Experience khong co settings panel nao duoc bat');
  return activeSection;
}

export interface SettingsNavGroup {
  readonly group: SettingsGroupDescriptor;
  readonly sections: readonly SettingsSectionDescriptor[];
}

/** Gom muc theo nhom, bo nhom rong — dieu huong khong bao gio hien mot tieu de trong. */
export function groupSettingsSections(
  visibleSections: readonly SettingsSectionId[],
): readonly SettingsNavGroup[] {
  const visible = new Set(visibleSections);
  return SETTINGS_GROUPS.map((group) => ({
    group,
    sections: SETTINGS_SECTIONS.filter(
      (section) => section.group === group.id && visible.has(section.id),
    ),
  })).filter((entry) => entry.sections.length > 0);
}

export function settingsSection(id: SettingsSectionId): SettingsSectionDescriptor {
  const section = SETTINGS_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Khong co muc cau hinh ${id}`);
  return section;
}

/** Duong dan chia se duoc — deep-link phai song sot qua F5, nen no nam o query chu khong o state. */
export function settingsSectionHref(id: SettingsSectionId): string {
  return `/settings?section=${encodeURIComponent(id)}`;
}
