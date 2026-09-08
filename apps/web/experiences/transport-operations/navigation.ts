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
 * TRUOC DAY co mot truc thu tu — `pendingCapability` — so bang CHUOI voi danh sach nang luc luc
 * chay, vi `TX-06`/`TX-07` chua co ma trong `CapabilityId` khi T7A duoc viet. T6 da vao `main`
 * (PR #152, #88 dong), va `CAPABILITY_IDS` nay da co `transport-asset-compliance` +
 * `transport-workforce` (`packages/tenant/src/tenant.schema.ts:189,197`). Nen cho tam do da duoc
 * GO HAN: hai muc do gio dung `requiredCapabilities` co kieu nhu moi muc khac, va `tsc` kiem duoc
 * chung — dung §4.2 cua #180.
 */

/* ------------------------------------------------------------------ *
 * Muc va nhom
 * ------------------------------------------------------------------ */

export type TransportSectionId =
  | 'overview'
  | 'control-tower'
  | 'trips'
  | 'movement'
  | 'fleet'
  | 'driver-fund'
  | 'expense-claims'
  | 'order-completion'
  | 'fuel'
  | 'settlement'
  | 'maintenance'
  | 'payroll'
  | 'driver-settlement'
  | 'asset-ownership'
  | 'finance'
  | 'margin'
  | 'ar-ap'
  | 'dispatch'
  | 'journey'
  | 'routes'
  | 'fleet-dashboard'
  | 'executive'
  | 'exports';

export type TransportSectionGroupId = 'root' | 'dispatch' | 'cost' | 'assets' | 'reports';

export interface TransportSectionGroup {
  readonly id: TransportSectionGroupId;
  readonly label: string;
}

export const TRANSPORT_SECTION_GROUPS = [
  { id: 'root', label: '' },
  { id: 'dispatch', label: 'ĐIỀU HÀNH' },
  { id: 'cost', label: 'CHI PHÍ & ĐỐI SOÁT' },
  { id: 'assets', label: 'TÀI SẢN & NHÂN SỰ' },
  { id: 'reports', label: 'BÁO CÁO' },
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
    id: 'control-tower',
    label: 'Bảng điều hành',
    group: 'dispatch',
    summary:
      'Vòng chạy theo bảy cột của quy trình, đội xe đang ở đâu, và hàng việc đang chờ người xử lý.',
    /**
     * CHI `transport-core`. Ba nguồn còn lại (duyệt chi, nhiên liệu, cảnh báo) là TUỲ CHỌN ở tầng
     * đọc: khách tắt thì bảng công bố `unavailableSources` chứ không biến mất. Khai thêm capability
     * ở đây sẽ giấu cả bảng khỏi một khách vẫn dùng được phần lớn nó.
     */
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.control_tower.read',
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
    id: 'movement',
    /**
     * DON dung truoc VONG CHAY trong ca ten man hinh — `#274`: sep/ke toan lam viec voi don, con
     * vong chay la su that van hanh he thong tu lap va tu dong.
     */
    label: 'Đơn hàng & vòng chạy',
    group: 'dispatch',
    summary:
      'Đơn hàng là trục chính; vòng chạy và chặng chạy rỗng do hệ thống lập và tự đóng theo sự thật vận hành.',
    requiredCapabilities: ['transport-core'],
    /**
     * Van la `transport.run.read` chu khong `transport.order.read`, va do la co y: man hinh doc CA
     * hai truc, nen quyen hep hon phai la quyen quyet dinh. Doi sang quyen doc don se cho mot
     * nguoi khong duoc phep xem vong chay nhin thay bang vong chay o nua duoi.
     */
    requiredAction: 'transport.run.read',
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
    id: 'dispatch',
    label: 'Điều xe',
    group: 'dispatch',
    summary: 'Xe nào gần điểm lấy hàng, sẽ rảnh lúc nào, chạy rỗng thêm bao nhiêu — người chọn.',
    /**
     * `transport.dispatch.suggest.read` — ma cua Lane M (#277), khong phai mot ma moi cua Lane N.
     *
     * Muc nam o nhom DIEU HANH chu khong o nhom BAO CAO: day la mot man hinh nguoi truc dung de
     * LAM VIEC, khong phai mot bao cao de doc. Lenh gan xe di sau `transport.run.manage` va duoc
     * kiem lai o may chu.
     */
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.dispatch.suggest.read',
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
    id: 'expense-claims',
    label: 'Duyệt chi lái xe',
    group: 'cost',
    summary: 'Đề nghị chi lái xe gửi lên — chỉ khoản được duyệt mới vào giá thành và sổ quỹ.',
    requiredCapabilities: ['transport-costing'],
    requiredAction: 'transport.expense.claim.read',
  },
  {
    id: 'order-completion',
    label: 'Kết thúc đơn',
    group: 'cost',
    summary:
      'Đơn đã giao xong, chờ kế toán xác nhận chứng từ. Chỉ đơn đã kết thúc mới vào kỳ đối soát mới.',
    requiredCapabilities: ['transport-acceptance'],
    requiredAction: 'transport.commercial_acceptance.read',
  },
  {
    id: 'fuel',
    label: 'Nhiên liệu',
    group: 'cost',
    summary: 'Phiếu đổ dầu, xác thực phiếu, nhập bảng kê cây xăng và đối soát.',
    requiredCapabilities: ['transport-fuel'],
    requiredAction: 'transport.fuel.entry.read',
  },
  {
    id: 'settlement',
    label: 'Công nợ & quyết toán',
    group: 'cost',
    summary: 'Năm dòng tiền giữ riêng: khách hàng, nhà xe, nguồn đơn, cây xăng, lái xe.',
    requiredCapabilities: ['transport-settlement'],
    requiredAction: 'transport.costing.period.read',
  },
  {
    id: 'maintenance',
    label: 'Bảo dưỡng & giấy tờ',
    group: 'assets',
    summary: 'Lịch bảo dưỡng đến hạn, lệnh sửa chữa, giấy tờ sắp hết hạn.',
    requiredCapabilities: ['transport-core', 'transport-asset-compliance'],
    requiredAction: 'transport.vehicle.read',
  },
  {
    /**
     * `TX-08` — so dang ky so huu. MUC RIENG, khong phai mot tab trong "Doi xe & lai xe".
     *
     * Hai man tra loi hai cau hoi khac nhau cho hai nguoi khac nhau: "Doi xe" tra loi *xe nay chay
     * duoc khong* (dieu do vien), con man nay tra loi *ai la chu chiec xe nay* (giam doc/ke toan).
     * Va chung co hai ma quyen rieng, nen gop lam mot tab se lam mot nguoi chi duoc xem ho so xe
     * nhin thay ca so dang ky so huu.
     */
    id: 'asset-ownership',
    label: 'Sở hữu tài sản',
    group: 'assets',
    summary: 'Quyền điều hành, sổ đăng ký sở hữu từng xe, hồ sơ bên hữu quan và lịch sử.',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.asset_ownership.read',
  },
  {
    id: 'payroll',
    label: 'Lương',
    group: 'assets',
    summary: 'Kỳ lương, bảng tính thử, phiếu lương và các khoản cấu thành.',
    requiredCapabilities: ['transport-costing', 'transport-workforce'],
    requiredAction: 'transport.costing.period.read',
  },
  {
    id: 'driver-settlement',
    label: 'Quyết toán lái xe',
    group: 'assets',
    summary: 'Lương đã ghi nhận theo tháng, các lần chi và phân bổ, hoàn ứng công ty còn nợ.',
    /**
     * HAI capability, cung bo voi man Luong: nguon cua moi khoan da ghi nhan la phieu luong
     * (`transport-workforce`), va hoan ung doc tu so quy (`transport-costing`).
     *
     * `requiredAction` la ma DOC rieng cua `TX-07b`, khong phai `transport.payroll.period.read`:
     * bang nay noi tien da RA KHOI cong ty luc nao va bang duong nao, va do la mot cau hoi khac
     * voi "thang nay lai xe duoc bao nhieu".
     */
    requiredCapabilities: ['transport-costing', 'transport-workforce'],
    requiredAction: 'transport.driver_settlement.read',
  },
  {
    id: 'finance',
    label: 'Bảng tài chính',
    group: 'reports',
    summary: 'Doanh thu, biên trực tiếp, và sáu dòng tiền giữ riêng — không cộng chung.',
    /**
     * KHONG mot ma quyen moi: bang doc chinh `arAging`/`apByCounterparty`/`directMarginRollup` cua
     * bao cao quyet toan, roi bay chung canh nhau. Xem `FinanceController`.
     *
     * Cong `TX-07b` la TUY CHON o tang doc, nen o day chi khai `transport-settlement`: mot khach
     * khong tinh luong van co bang, chi thieu hai o cuoi va bang noi ra dieu do.
     */
    requiredCapabilities: ['transport-settlement'],
    requiredAction: 'transport.settlement.report.read',
  },
  {
    id: 'executive',
    label: 'Bảng điều hành',
    group: 'reports',
    summary: 'Xe đang chạy thế nào, tiền đang ở đâu, việc gì cần người xử lý — trong 5 phút.',
    /**
     * `transport.control_tower.read` chu KHONG mot ma moi.
     *
     * Man nay khong co lan goi API rieng nao: no ghep ba read model da nghiem thu. Ma quyen o day
     * la ma cua PHAN LOI (thap dieu hanh); hai phan con lai — tien va doi xe — tu tat o may chu neu
     * nguoi dung khong co quyen doc chung, va man hinh chi thieu mot khoi thay vi tu choi ca trang.
     */
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.control_tower.read',
  },
  {
    id: 'fleet-dashboard',
    label: 'Bảng đội xe',
    group: 'reports',
    summary: 'Km có hàng, km rỗng, tỷ lệ sử dụng và xe chạy rỗng nhiều nhất.',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.analytics.read',
  },
  {
    id: 'routes',
    label: 'Báo cáo tuyến',
    group: 'reports',
    summary: 'Mỗi tuyến chạy bao nhiêu chuyến, dài bao nhiêu, kéo theo bao nhiêu km rỗng.',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.analytics.read',
  },
  {
    id: 'journey',
    label: 'Bản đồ vòng chạy',
    group: 'reports',
    summary: 'Chặng có hàng và chặng rỗng của một vòng chạy, trên bản đồ và trên dòng thời gian.',
    /**
     * CHI `transport-core`, va do la co y — cung khuon thap dieu hanh.
     *
     * Ban do can toa do cua `transport-proof` va moc cua `transport-checkpoint`, nhung mot khach
     * chua bat hai capability do VAN doc duoc bao cao: chang, km co hang/rong, ma don. Khai ca ba o
     * day se lam muc bien mat khoi menu thay vi hien ra kem mot cau noi ro thieu gi.
     *
     * `requiredAction` la `transport.run.read` — quyen cua BAO CAO. Toa do di sau mot ma khac
     * (`transport.location.history.read`) va duoc kiem o may chu, khong o menu: ke toan van mo duoc
     * muc nay, chi khong thay ban do. Xem `JourneyController`.
     */
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.run.read',
  },
  {
    id: 'margin',
    label: 'Biên trực tiếp',
    group: 'reports',
    summary: 'Doanh thu trừ chi phí trực tiếp của từng chuyến — chưa gồm chi phí cố định.',
    requiredCapabilities: ['transport-settlement'],
    requiredAction: 'transport.trip.read',
  },
  {
    id: 'ar-ap',
    label: 'AR/AP',
    group: 'reports',
    summary: 'Tuổi nợ phải thu và phải trả theo từng đối tác.',
    requiredCapabilities: ['transport-settlement'],
    requiredAction: 'transport.costing.period.read',
  },
  {
    id: 'exports',
    label: 'Xuất dữ liệu',
    group: 'reports',
    summary: 'Kết xuất sổ sách để đối chiếu ngoài hệ thống.',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.trip.read',
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
 * Man "Chi phi" CO tu T7B: `#168 B3` mo `POST /transport/me/expenses`, va `#169` acceptance 4
 * cho phep dinh anh chung tu ngay trong cung lan goi do.
 */
export type DriverScreenId =
  'home' | 'site-intake' | 'trip' | 'fuel' | 'expense' | 'fund' | 'history' | 'payslip';

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
    /**
     * NHAN VIEC TAI DIA DIEM A (`#267` H6). Dung SAU `home`, va do la thu tu cua mot ngay lam viec:
     * lai xe mo app o cong nha may, truoc khi co chuyen nao de mo.
     *
     * `requiredAction` la ma DOC (`.propose`), khong phai ma tao. Man hinh phai hien ra duoc ca voi
     * mot khach chi cap quyen xem de nghi — luc do nut `Tao chuyen` khong hien, va do la mot cau
     * hinh hop le chu khong phai mot man hinh hong.
     */
    id: 'site-intake',
    label: 'Nhận việc',
    requiredCapabilities: ['transport-site-intake'],
    requiredAction: 'transport.driver.self.site_intake.propose',
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
    id: 'expense',
    label: 'Chi phí',
    requiredCapabilities: ['transport-costing'],
    requiredAction: 'transport.driver.self.expense.record',
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
  {
    id: 'payslip',
    label: 'Phiếu lương',
    requiredCapabilities: ['transport-workforce'],
    requiredAction: 'transport.driver.self.payslip.read',
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

/* ------------------------------------------------------------------ *
 * BO LOC CHUYEN NAM TREN DIA CHI — #222 P2
 * ------------------------------------------------------------------ */

/**
 * BA THAM SO DOC DUOC, khong phai mot khoi trang thai ma hoa.
 *
 * ==============================================================================================
 * LOI DUOC SUA O DAY
 *
 * Truoc ban nay, `?section=trips&selected=UAT-VIET-01` giu duoc LUA CHON nhung khong giu BO LOC:
 * o tim kiem nam trong `useState` cua `TripsView`. Chu so huu go `UAT-VIET-01`, tai lai trang, va
 * chu vua go bien mat trong khi khoi chi tiet van mo — mot man hinh tu mau thuan voi chinh no.
 *
 * ==============================================================================================
 * `q` chu khong `search`, `status`/`kind` chu khong `s`/`k`
 *
 * Dia chi la thu nguoi ta DAN CHO NHAU. `q` la quy uoc pho quat cua mot o tim kiem; mot chu cai
 * viet tat tiet kiem duoc sau ky tu va tra gia bang viec khong ai doc duoc dia chi do nua.
 *
 * Va KHONG mot `id` ky thuat nao o day: `status`/`kind` la ma nghiep vu dong (`TRIP_STATUSES`,
 * `TRIP_KINDS`), `q` la chu nguoi dung go. Dung quy uoc da co cua `SELECTION_QUERY_PARAM`.
 */
export const SEARCH_QUERY_PARAM = 'q';
export const STATUS_QUERY_PARAM = 'status';
export const KIND_QUERY_PARAM = 'kind';

/**
 * Bo loc chuyen o dang DIA CHI — ba chuoi, khong hon.
 *
 * Tang dieu huong CO Y khong biet `TripStatus`/`TripKind` la nhung gia tri nao: no chi cho chuoi
 * di qua, con viec doi chuoi -> ma hop le do `workspace/trips.ts` lam (`parseTripFilter`). Nho vay
 * mot ma trang thai moi cua mien khong bat tep nay phai sua theo.
 */
export interface TripFilterQuery {
  readonly search: string | null;
  readonly status: string | null;
  readonly kind: string | null;
}

export const EMPTY_TRIP_FILTER_QUERY: TripFilterQuery = {
  search: null,
  status: null,
  kind: null,
};

export const isTripFilterQueryEmpty = (filter: TripFilterQuery): boolean =>
  filter.search === null && filter.status === null && filter.kind === null;

/**
 * Mot dia chi da duoc GIAI QUYET: be mat nao, muc/man nao, dang chon gi.
 * Muc khong hop le luon roi ve mac dinh — mot dau trang cu khong bao gio ra trang trang.
 */
export interface ResolvedNavigation {
  readonly surface: TransportSurface;
  readonly section: TransportSectionId;
  readonly screen: DriverScreenId;
  readonly selection: string | null;
  /**
   * BO LOC CHUYEN — di CUNG lua chon, va bien mat cung no khi doi muc (#222 P2 §3).
   *
   * Mot ma trang thai chuyen khong co nghia gi o man Nhien lieu, y het mot ma chuyen. Nen hai thu
   * nay theo cung mot luat: giu khi con o trong muc, bo khi ra khoi.
   */
  readonly tripFilter: TripFilterQuery;
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
    readonly tripFilter?: TripFilterQuery;
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
  /*
   * BO LOC CHUYEN CHI SONG O MUC `trips`, tren BE MAT VAN HANH — #222 P2 §3.
   *
   * Hai cong, khong mot: (a) doi muc thi bo, cung luat voi lua chon; (b) muc dang xem phai DUNG la
   * `trips`. Cong (b) la thu chan mot dia chi go tay kieu `?section=fuel&q=UAT-VIET-01` mang mot bo
   * loc chuyen di lac vao man Nhien lieu roi nam do cho toi khi nguoi dung quay lai muc Chuyen xe.
   */
  const tripFilter =
    keepSelection && surface === 'operations' && section === 'trips'
      ? (requested.tripFilter ?? EMPTY_TRIP_FILTER_QUERY)
      : EMPTY_TRIP_FILTER_QUERY;
  return {
    surface,
    section,
    screen,
    selection: keepSelection ? requested.selection : null,
    tripFilter,
  };
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
      tripFilter: {
        search: readParam(search, SEARCH_QUERY_PARAM),
        status: readParam(search, STATUS_QUERY_PARAM),
        kind: readParam(search, KIND_QUERY_PARAM),
      },
    },
    null,
    input,
  );

/**
 * Muc mac dinh KHONG mang tham so — `/` van la mot dia chi sach de danh dau.
 *
 * Bo loc CHI di kem khi co gia tri that: mot dia chi `?section=trips&q=&status=&kind=` dai them 24
 * ky tu de noi dung mot dieu — "khong loc gi" — ma mot dia chi khong co chung da noi roi.
 */
export const buildSectionUrl = (
  section: TransportSectionId,
  selection?: string | null,
  tripFilter?: TripFilterQuery,
): string => {
  const params = new URLSearchParams();
  if (section !== DEFAULT_SECTION) params.set(SECTION_QUERY_PARAM, section);
  if (selection) params.set(SELECTION_QUERY_PARAM, selection);
  if (tripFilter && !isTripFilterQueryEmpty(tripFilter)) {
    if (tripFilter.search) params.set(SEARCH_QUERY_PARAM, tripFilter.search);
    if (tripFilter.status) params.set(STATUS_QUERY_PARAM, tripFilter.status);
    if (tripFilter.kind) params.set(KIND_QUERY_PARAM, tripFilter.kind);
  }
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
    : buildSectionUrl(navigation.section, navigation.selection, navigation.tripFilter);

/**
 * Cau duoi thanh ben. Noi that ve gioi han cua tang cuong che hom nay thay vi de khach suy ra rang
 * man hinh la hang rao — `RolesGuard` mo hoan toan khi tenant khong chay che do phien dang nhap.
 */
export const NAVIGATION_ENFORCEMENT_NOTE =
  'Danh mục hiển thị theo nghiệp vụ doanh nghiệp đã bật và quyền của tài khoản. Quyền thực thi do ' +
  'máy chủ quyết định, không phải do màn hình ẩn bớt.';
