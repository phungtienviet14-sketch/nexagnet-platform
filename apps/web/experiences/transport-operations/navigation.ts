import type { CapabilityId } from '@netviet/tenant';
import type { AuthRole } from '../../lib/auth';
import { canPerform, type TransportAction } from './transport-actions';

/**
 * KIEN TRUC THONG TIN cua be mat van hanh van tai — mot HOP DONG kiem tra duoc bang ham thuan.
 *
 * Tep nay CO Y khong chua JSX, dung khuon `b2b-sales-operations/navigation.ts:6-11`: co bao nhieu
 * muc, muc nao thuoc nhom nao, muc nao doi nang luc gi, vai nao thay muc nao — do la kien truc, cho
 * khong phai chi tiet trinh bay rai trong component. Nho vay mot thay doi IA lam do test TRUOC khi
 * no kip lam do man hinh cua khach.
 *
 * HAI truc long nhau, va chung KHONG the gop lam mot:
 *
 *   1. `requiredCapabilities` — khach co MUA nghiep vu nay khong (`CapabilityId`, dong kin).
 *   2. `requiredAction`       — vai nay co lam duoc viec do khong (`GD-22`, theo hanh dong).
 *
 * Ca hai deu la CONG LOC, va ca hai deu giu nguyen. Cai da bo di la mot truc thu ba —
 * `dataSource` — von de mot muc CHUA dung duoc van hien ra roi tu giai thich vi sao no trong.
 * Loi giai thich do luon la mot cau ky thuat (thieu route, thieu read model, so hieu issue) va
 * nguoi dung khong lam gi duoc voi no. Nay muc chua dung duoc thi KHONG co mat trong danh sach;
 * khi duong du lieu mo, no quay lai cung khung nhin that cua no. Xem #195.
 */

/* ------------------------------------------------------------------ *
 * Muc va nhom
 * ------------------------------------------------------------------ */

/**
 * Muc CO MAT tren be mat khach hang.
 *
 * Danh sach nay chi giu nhung muc DUNG DUOC hom nay. Mot muc chua co duong du lieu thi khong nam
 * o day: bay no ra roi de no tu giai thich vi sao no trong luon dan den mot cau ky thuat ma nguoi
 * dung khong lam gi duoc. Khi duong du lieu mo, muc quay lai day cung voi khung nhin that cua no.
 *
 * Day la mot quyet dinh TRINH BAY. No KHONG thay the hai cong loc ben duoi
 * (`requiredCapabilities` + `requiredAction`), va cung khong noi long chung.
 */
export type TransportSectionId = 'overview' | 'trips' | 'fleet' | 'driver-fund' | 'fuel';

export type TransportSectionGroupId = 'root' | 'dispatch' | 'cost';

export interface TransportSectionGroup {
  readonly id: TransportSectionGroupId;
  readonly label: string;
}

export const TRANSPORT_SECTION_GROUPS = [
  { id: 'root', label: '' },
  { id: 'dispatch', label: 'ĐIỀU HÀNH' },
  { id: 'cost', label: 'CHI PHÍ & ĐỐI SOÁT' },
] as const satisfies readonly TransportSectionGroup[];

export interface TransportSection {
  readonly id: TransportSectionId;
  readonly label: string;
  readonly group: TransportSectionGroupId;
  readonly summary: string;
  readonly requiredCapabilities: readonly CapabilityId[];
  readonly requiredAction: TransportAction;
}

export const TRANSPORT_SECTIONS = [
  {
    id: 'overview',
    label: 'Tổng quan',
    group: 'root',
    summary: 'Chuyến đang chạy, đội xe, và những việc đang chờ người xử lý.',
    requiredCapabilities: [],
    requiredAction: 'transport.trip.read',
  },
  {
    id: 'trips',
    label: 'Chuyến xe',
    group: 'dispatch',
    summary: 'Lập chuyến, phân công xe và lái xe, theo dõi vòng đời chuyến.',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.trip.read',
  },
  {
    id: 'fleet',
    label: 'Đội xe & lái xe',
    group: 'dispatch',
    summary: 'Hồ sơ xe, hồ sơ lái xe, lịch sử phụ trách và số km đồng hồ.',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.vehicle.read',
  },
  {
    id: 'driver-fund',
    label: 'Quỹ lái xe / Chi phí',
    group: 'cost',
    summary: 'Số dư quỹ từng lái xe, tạm ứng, hoàn quỹ, chi phí chuyến và kỳ quỹ.',
    requiredCapabilities: ['transport-costing'],
    requiredAction: 'transport.costing.driver_fund.read',
  },
  {
    id: 'fuel',
    label: 'Nhiên liệu',
    group: 'cost',
    summary: 'Phiếu đổ dầu, xác thực phiếu, nhập bảng kê cây xăng và đối soát.',
    requiredCapabilities: ['transport-fuel'],
    requiredAction: 'transport.fuel.entry.read',
  },
] as const satisfies readonly TransportSection[];

const DEFAULT_SECTION: TransportSectionId = 'overview';

/* ------------------------------------------------------------------ *
 * Be mat LAI XE — `GD-23`
 * ------------------------------------------------------------------ */

/**
 * Be mat lai xe la mot ROUTE RIENG CO GUARD TRONG CUNG EXPERIENCE, dung nhu `GD-23` chot cho
 * `PG-01`. Khong duoc bien no thanh mot nhanh theo vai o tang dinh tuyen — hop dong mien cam dieu
 * do o §12. No la mot dia chi rieng (`?surface=driver`), va moi payload cua no di qua kieu khung
 * nhin rieng khong co truong doanh thu (`DriverTripView`, `DriverFuelSlipView` — `INV-09`).
 *
 * KHONG co man "Chi phi": as-built khong co route nao cho lai xe tu ghi mot khoan chi thuong. Bo
 * hanh dong `transport.driver.self.*` chi co doc chuyen, doi trang thai chuyen, doc quy, doc va nop
 * PHIEU DAU. De mot man hinh nhap chi phi o day la de mot nut bam khong bao gio gui duoc.
 */
export type DriverScreenId = 'home' | 'trip' | 'fuel' | 'fund' | 'history';

export interface DriverScreen {
  readonly id: DriverScreenId;
  readonly label: string;
  readonly requiredCapabilities: readonly CapabilityId[];
  readonly requiredAction: TransportAction;
}

export const DRIVER_SCREENS = [
  {
    id: 'home',
    label: 'Trang chủ',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.driver.self.trip.read',
  },
  {
    id: 'trip',
    label: 'Chuyến',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.driver.self.trip.read',
  },
  {
    id: 'fuel',
    label: 'Nhiên liệu',
    requiredCapabilities: ['transport-fuel'],
    requiredAction: 'transport.driver.self.fuel.read',
  },
  {
    id: 'fund',
    label: 'Quỹ',
    requiredCapabilities: ['transport-costing'],
    requiredAction: 'transport.driver.self.fund.read',
  },
  {
    id: 'history',
    label: 'Lịch sử',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.driver.self.trip.read',
  },
] as const satisfies readonly DriverScreen[];

const DEFAULT_DRIVER_SCREEN: DriverScreenId = 'home';

/* ------------------------------------------------------------------ *
 * Loc
 * ------------------------------------------------------------------ */

/**
 * `role: null` nghia la CHUA BIET vai — `AuthGate` con dang doi `/auth/me`, hoac tenant chay che do
 * khong phien. Xem `transport-actions.canPerform`: khi do khong duoc an bot gi.
 */
export interface NavigationInput {
  readonly capabilities: readonly CapabilityId[];
  readonly role: AuthRole | null;
}

const capabilitiesSatisfied = (
  required: readonly CapabilityId[],
  capabilities: readonly CapabilityId[],
): boolean => {
  const enabled = new Set<CapabilityId>(capabilities);
  return required.every((capability) => enabled.has(capability));
};

export const isSectionEnabled = (section: TransportSection, input: NavigationInput): boolean =>
  capabilitiesSatisfied(section.requiredCapabilities, input.capabilities) &&
  canPerform(input.role, section.requiredAction);

export const findSection = (id: string): TransportSection | undefined =>
  TRANSPORT_SECTIONS.find((section) => section.id === id);

export const canNavigateTo = (section: string, input: NavigationInput): boolean => {
  const found = findSection(section);
  return found !== undefined && isSectionEnabled(found, input);
};

export const visibleSections = (input: NavigationInput): readonly TransportSection[] =>
  TRANSPORT_SECTIONS.filter((section) => isSectionEnabled(section, input));

export interface TransportNavigationGroup {
  readonly group: TransportSectionGroup;
  readonly sections: readonly TransportSection[];
}

/** Nhom rong bi BO HAN — khong de lai mot tieu de mo coi tren thanh ben. */
export const navigationGroups = (input: NavigationInput): readonly TransportNavigationGroup[] => {
  const sections = visibleSections(input);
  return TRANSPORT_SECTION_GROUPS.map((group) => ({
    group,
    sections: sections.filter((section) => section.group === group.id),
  })).filter((entry) => entry.sections.length > 0);
};

export const isDriverScreenEnabled = (screen: DriverScreen, input: NavigationInput): boolean =>
  capabilitiesSatisfied(screen.requiredCapabilities, input.capabilities) &&
  canPerform(input.role, screen.requiredAction);

export const findDriverScreen = (id: string): DriverScreen | undefined =>
  DRIVER_SCREENS.find((screen) => screen.id === id);

export const visibleDriverScreens = (input: NavigationInput): readonly DriverScreen[] =>
  DRIVER_SCREENS.filter((screen) => isDriverScreenEnabled(screen, input));

/* ------------------------------------------------------------------ *
 * Trang thai tren dia chi
 * ------------------------------------------------------------------ */

export type TransportSurface = 'operations' | 'driver';

export const SURFACE_QUERY_PARAM = 'surface';
export const SECTION_QUERY_PARAM = 'section';
export const SCREEN_QUERY_PARAM = 'screen';
/**
 * Gia tri phai la mot DINH DANH NGHIEP VU — ma chuyen, bien so — khong bao gio la `id` ky thuat hay
 * `traceId`. Do la quy uoc da co cua b2b (`navigation.ts:302-307`), va o day no con thuan tien: API
 * khong co duong tra cuu theo ma chuyen, nen man hinh von da phai tu doi ma → id tren danh sach da
 * tai ve.
 */
export const SELECTION_QUERY_PARAM = 'selected';

/**
 * Mot dia chi da duoc GIAI QUYET: be mat nao, muc/man nao, dang chon gi.
 * Muc khong hop le luon roi ve mac dinh — mot dau trang cu khong bao gio ra trang trang.
 */
export interface ResolvedNavigation {
  readonly surface: TransportSurface;
  readonly section: TransportSectionId;
  readonly screen: DriverScreenId;
  readonly selection: string | null;
}

export const resolveSection = (
  requested: string | null,
  input: NavigationInput,
): TransportSectionId =>
  requested !== null && canNavigateTo(requested, input)
    ? (requested as TransportSectionId)
    : DEFAULT_SECTION;

export const resolveDriverScreen = (
  requested: string | null,
  input: NavigationInput,
): DriverScreenId => {
  if (requested === null) return DEFAULT_DRIVER_SCREEN;
  const screen = findDriverScreen(requested);
  return screen !== undefined && isDriverScreenEnabled(screen, input)
    ? screen.id
    : DEFAULT_DRIVER_SCREEN;
};

const resolveSurface = (requested: string | null, input: NavigationInput): TransportSurface =>
  requested === 'driver' && visibleDriverScreens(input).length > 0 ? 'driver' : 'operations';

/**
 * MOT duong duy nhat de tra loi "dia chi nay nghia la gi". Ca lien ket trong ung dung lan dau trang
 * dan ve day, vi PR #111 cua b2b da chung minh dieu nguoc lai: khi bam trong ung dung di duong khac
 * voi khi mo tu dau trang, mot cau hoi co hai cau tra loi.
 *
 * Doi muc thi BO lua chon: mot ma chuyen khong con nghia gi o man Nhien lieu.
 */
export const resolveNavigation = (
  requested: {
    readonly surface: string | null;
    readonly section: string | null;
    readonly screen: string | null;
    readonly selection: string | null;
  },
  previous: { readonly section: TransportSectionId; readonly screen: DriverScreenId } | null,
  input: NavigationInput,
): ResolvedNavigation => {
  const surface = resolveSurface(requested.surface, input);
  const section = resolveSection(requested.section, input);
  const screen = resolveDriverScreen(requested.screen, input);
  const movedSection = previous !== null && previous.section !== section;
  const movedScreen = previous !== null && previous.screen !== screen;
  const keepSelection = surface === 'driver' ? !movedScreen : !movedSection;
  return { surface, section, screen, selection: keepSelection ? requested.selection : null };
};

const readParam = (search: string, key: string): string | null => {
  const raw = new URLSearchParams(search).get(key);
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

export const parseNavigationFromSearch = (
  search: string,
  input: NavigationInput,
): ResolvedNavigation =>
  resolveNavigation(
    {
      surface: readParam(search, SURFACE_QUERY_PARAM),
      section: readParam(search, SECTION_QUERY_PARAM),
      screen: readParam(search, SCREEN_QUERY_PARAM),
      selection: readParam(search, SELECTION_QUERY_PARAM),
    },
    null,
    input,
  );

/** Muc mac dinh KHONG mang tham so — `/` van la mot dia chi sach de danh dau. */
export const buildSectionUrl = (section: TransportSectionId, selection?: string | null): string => {
  const params = new URLSearchParams();
  if (section !== DEFAULT_SECTION) params.set(SECTION_QUERY_PARAM, section);
  if (selection) params.set(SELECTION_QUERY_PARAM, selection);
  const query = params.toString();
  return query.length > 0 ? `/?${query}` : '/';
};

export const buildDriverUrl = (screen: DriverScreenId, selection?: string | null): string => {
  const params = new URLSearchParams();
  params.set(SURFACE_QUERY_PARAM, 'driver');
  if (screen !== DEFAULT_DRIVER_SCREEN) params.set(SCREEN_QUERY_PARAM, screen);
  if (selection) params.set(SELECTION_QUERY_PARAM, selection);
  return `/?${params.toString()}`;
};

export const buildNavigationUrl = (navigation: ResolvedNavigation): string =>
  navigation.surface === 'driver'
    ? buildDriverUrl(navigation.screen, navigation.selection)
    : buildSectionUrl(navigation.section, navigation.selection);

/**
 * Cau duoi thanh ben — mot cau san pham, khong phai mot loi giai thich ky thuat.
 *
 * No noi dung mot dieu nguoi dung can biet: danh muc thay doi theo nghiep vu da bat va theo quyen
 * cua tai khoan. Cach cuong che (`RolesGuard`, quyen o may chu) la chuyen ben trong; noi ra o day
 * chi lam nguoi doc phai hieu kien truc de dung mot man hinh.
 */
export const NAVIGATION_ENFORCEMENT_NOTE =
  'Danh mục hiển thị theo nghiệp vụ đã bật và quyền của tài khoản.';
