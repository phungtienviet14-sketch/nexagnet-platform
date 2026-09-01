import type { CapabilityId } from '@netviet/tenant';
import type { AuthRole } from '../../lib/auth';

/**
 * HOP DONG DIEU HUONG cua be mat ban hang B2B — Issue #107 §3 va §8.
 *
 * Tep nay CO Y khong chua JSX: thong tin kien truc (co bao nhieu muc, muc nao thuoc nhom nao, muc
 * nao doi nang luc gi, vai tro nao thay muc nao) la mot HOP DONG kiem tra duoc bang ham thuan, chu
 * khong phai mot chi tiet trinh bay nam rai trong component. Nho vay mot thay doi IA lam do test
 * truoc khi no kip lam do man hinh cua khach.
 */

export type B2bSectionId =
  | 'overview'
  | 'conversations'
  | 'approvals'
  | 'orders'
  | 'dealers'
  | 'customer-care'
  | 'campaigns'
  | 'alerts'
  | 'knowledge'
  | 'policies'
  | 'users'
  | 'activity-log'
  | 'settings';

export type B2bSectionGroupId = 'root' | 'sales' | 'care' | 'ai-operations' | 'administration';

export interface B2bSectionGroup {
  readonly id: B2bSectionGroupId;
  /** Rong voi nhom goc: muc Tong quan dung mot minh, khong can tieu de nhom o tren. */
  readonly label: string;
}

export const B2B_SECTION_GROUPS = [
  { id: 'root', label: '' },
  { id: 'sales', label: 'BÁN HÀNG' },
  { id: 'care', label: 'CHĂM SÓC' },
  { id: 'ai-operations', label: 'VẬN HÀNH AI' },
  { id: 'administration', label: 'QUẢN TRỊ' },
] as const satisfies readonly B2bSectionGroup[];

export interface B2bSection {
  readonly id: B2bSectionId;
  readonly label: string;
  readonly group: B2bSectionGroupId;
  /** Cau mo ta huong khach — dung lam phu de trang, khong phai chu thich ky thuat. */
  readonly summary: string;
  /**
   * Nang luc goi khach phai bat thi muc nay moi co nghia. RONG = luon hien.
   *
   * Khong phai mot bo loc trang tri: mot khach khong mua goi cham soc ma van thay muc "Lịch &
   * chiến dịch" se bam vao mot trang khong bao gio co du lieu, roi bao he thong hong.
   */
  readonly requiredCapabilities: readonly CapabilityId[];
  /**
   * Vai tro duoc DIEU HUONG toi muc nay.
   *
   * DAY KHONG PHAI MOT RANH GIOI BAO MAT — xem `NAVIGATION_ENFORCEMENT_NOTE`. Cuong che that nam o
   * `RolesGuard` phia API va chi co hieu luc khi `AUTH_MODE=session`. Bang nay chi tra loi "vai tro
   * nay co viec gi o day khong", de mot ke toan khong phai loi qua bay muc khong lien quan.
   */
  readonly roles: readonly AuthRole[];
}

const EVERY_ROLE: readonly AuthRole[] = ['SALE', 'ACCOUNTING', 'MANAGER', 'ADMIN'];
/** Doc duoc so sach nhung khong dieu hanh hoi thoai — theo dung `@Roles` dang co o API. */
const READ_HEAVY: readonly AuthRole[] = ['SALE', 'ACCOUNTING', 'MANAGER', 'ADMIN'];
const SALES_FLOOR: readonly AuthRole[] = ['SALE', 'MANAGER', 'ADMIN'];
const OVERSIGHT: readonly AuthRole[] = ['MANAGER', 'ADMIN'];

export const B2B_SECTIONS = [
  {
    id: 'overview',
    label: 'Tổng quan',
    group: 'root',
    summary: 'Tình hình hôm nay và những nghiệp vụ chưa sẵn sàng.',
    requiredCapabilities: [],
    roles: EVERY_ROLE,
  },
  {
    id: 'conversations',
    label: 'Hội thoại',
    group: 'sales',
    summary: 'Tin nhắn từ các nhóm đại lý và cách hệ thống đã hiểu từng tin.',
    requiredCapabilities: ['messaging'],
    roles: SALES_FLOOR,
  },
  {
    id: 'approvals',
    label: 'Duyệt & gửi',
    group: 'sales',
    summary: 'Những phản hồi đang chờ người kiểm tra trước khi gửi lại nhóm.',
    requiredCapabilities: ['sales-order'],
    roles: SALES_FLOOR,
  },
  {
    id: 'orders',
    label: 'Đơn hàng',
    group: 'sales',
    summary: 'Đơn đã chốt, đơn chờ nhập phần mềm bán hàng và đơn đã huỷ.',
    requiredCapabilities: ['sales-order'],
    roles: READ_HEAVY,
  },
  {
    id: 'dealers',
    label: 'Đại lý & khách hàng',
    group: 'sales',
    summary: 'Đại lý, cộng tác viên và nhóm chat được gán cho từng bên.',
    requiredCapabilities: ['sales-order'],
    roles: READ_HEAVY,
  },
  {
    id: 'customer-care',
    label: 'Chăm sóc khách hàng',
    group: 'care',
    summary: 'Việc chăm sóc sau bán và các đầu mối cần liên hệ lại.',
    requiredCapabilities: ['campaign'],
    roles: SALES_FLOOR,
  },
  {
    id: 'campaigns',
    label: 'Lịch & chiến dịch',
    group: 'care',
    summary: 'Chiến dịch nhắn tin đã lên lịch và kết quả từng đợt gửi.',
    requiredCapabilities: ['campaign'],
    roles: SALES_FLOOR,
  },
  {
    id: 'alerts',
    label: 'Cảnh báo',
    group: 'ai-operations',
    summary: 'Việc cần người xử lý: đơn vượt ngưỡng, dữ liệu thiếu, kênh gián đoạn.',
    requiredCapabilities: ['notifications'],
    roles: OVERSIGHT,
  },
  {
    id: 'knowledge',
    label: 'Dữ liệu & kiến thức',
    group: 'ai-operations',
    summary: 'Nguồn sự thật trợ lý dựa vào: sản phẩm, nội dung tư vấn, từ viết tắt.',
    requiredCapabilities: ['knowledge'],
    roles: READ_HEAVY,
  },
  {
    id: 'policies',
    label: 'Chính sách & bảng giá',
    group: 'ai-operations',
    summary: 'Bảng giá đang áp dụng và chính sách công nợ, ký gửi, thanh toán.',
    requiredCapabilities: ['sales-order'],
    roles: READ_HEAVY,
  },
  {
    id: 'users',
    label: 'Người dùng & phân quyền',
    group: 'administration',
    summary: 'Tài khoản trong hệ thống và quyền của từng người.',
    requiredCapabilities: ['operations'],
    roles: ['ADMIN'],
  },
  {
    id: 'activity-log',
    label: 'Nhật ký hoạt động',
    group: 'administration',
    summary: 'Ai đã thay đổi gì, lúc nào — dùng khi cần đối chiếu lại.',
    requiredCapabilities: ['operations'],
    roles: OVERSIGHT,
  },
  {
    id: 'settings',
    label: 'Cài đặt',
    group: 'administration',
    summary: 'Cấu hình vận hành của doanh nghiệp trên nền tảng.',
    requiredCapabilities: ['operations'],
    roles: EVERY_ROLE,
  },
] as const satisfies readonly B2bSection[];

export const DEFAULT_SECTION: B2bSectionId = 'overview';

/**
 * CAU PHAI NOI RA khi be mat nay ve mot thanh dieu huong theo vai tro.
 *
 * Issue #107 §8 cam "invent a fake security boundary". Su that o repo nay: `RolesGuard`
 * (apps/api/src/auth/roles.guard.ts) tra `true` NGAY LAP TUC khi `AUTH_MODE !== 'session'` — o che
 * do khong phien, khong co cuong che vai tro nao ca, o dau. Vay nen thanh dieu huong duoc mo ta
 * dung nhu no la: mot cach SAP XEP CONG VIEC, khong phai mot o khoa.
 */
export const NAVIGATION_ENFORCEMENT_NOTE =
  'Thanh điều hướng sắp xếp công việc theo vai trò. Quyền thật do máy chủ quyết định khi hệ ' +
  'thống chạy ở chế độ đăng nhập; ở chế độ khác, máy chủ không kiểm tra vai trò.';

export interface NavigationInput {
  readonly capabilities: readonly CapabilityId[];
  /**
   * Vai tro nguoi dang xem, hoac `null` khi CHUA BIET (che do khong phien: trinh duyet khong co
   * danh tinh nao). `null` cho hien MOI muc goi khach da bat — giau bot di se ngu y mot quyen han
   * khong ton tai, va do cung la mot cau noi doi.
   */
  readonly role: AuthRole | null;
}

export function isSectionEnabled(section: B2bSection, input: NavigationInput): boolean {
  const enabled = new Set(input.capabilities);
  if (!section.requiredCapabilities.every((capability) => enabled.has(capability))) return false;
  return input.role === null || section.roles.includes(input.role);
}

export function visibleSections(input: NavigationInput): readonly B2bSection[] {
  return B2B_SECTIONS.filter((section) => isSectionEnabled(section, input));
}

export interface B2bNavigationGroup {
  readonly group: B2bSectionGroup;
  readonly sections: readonly B2bSection[];
}

/** Thanh dieu huong da dung: nhom rong bi bo han, khong de lai mot tieu de treo lo lung. */
export function navigationGroups(input: NavigationInput): readonly B2bNavigationGroup[] {
  const visible = visibleSections(input);
  return B2B_SECTION_GROUPS.map((group) => ({
    group,
    sections: visible.filter((section) => section.group === group.id),
  })).filter((entry) => entry.sections.length > 0);
}

export function findSection(id: string): B2bSection | undefined {
  return B2B_SECTIONS.find((section) => section.id === id);
}

/**
 * Muc duoc chon sau khi da doi chieu voi nang luc va vai tro.
 *
 * Mot duong dan luu (bookmark) toi muc khong con dung nua — vi khach tat mot nang luc, hoac vi
 * nguoi mo link co vai tro khac — phai roi ve `overview` CHU KHONG duoc render mot trang trong.
 */
export function resolveSection(requested: string | null, input: NavigationInput): B2bSectionId {
  const section = requested ? findSection(requested) : undefined;
  if (section && isSectionEnabled(section, input)) return section.id;
  return DEFAULT_SECTION;
}

export const SECTION_QUERY_PARAM = 'section';

export function parseSectionFromSearch(search: string, input: NavigationInput): B2bSectionId {
  return resolveSection(new URLSearchParams(search).get(SECTION_QUERY_PARAM), input);
}

/** Muc mac dinh khong deo tham so: `/` phai la mot duong dan sach, luu lai duoc. */
export function buildSectionUrl(section: B2bSectionId): string {
  if (section === DEFAULT_SECTION) return '/';
  return `/?${SECTION_QUERY_PARAM}=${encodeURIComponent(section)}`;
}
