import type { AccessViolation, OpenWorkDetail } from './admin-types';

/**
 * LY DO CO KIEU → CAU TIENG VIET CO DAU (`#395`).
 *
 * May chu tra `reason` + `detail` co cau truc; man hinh doi ra mot cau NGHIEP VU, goi TEN thu dang
 * xung dot (tai khoan, dia diem, don vi, quyen) tu `detail`. Khong mot ma liet ke nao duoc lot ra
 * man hinh: bai `admin-reasons.spec.ts` doc bo tu vung cua API tu dia va do rang MOI ma deu co cau.
 *
 * Ma khong co trong bang (loi cu, loi zod, loi ha tang) thi giu NGUYEN VAN cau cua may chu.
 */

type Detail = Readonly<Record<string, unknown>>;
/** Tra nhan tieng Viet cua mot ma quyen — tu danh muc; `undefined` thi dung ma lam duong lui. */
export type PermissionLabelOf = (code: string) => string | undefined;

type Template = string | ((detail: Detail, labelOf: PermissionLabelOf) => string);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/** Dem cac muc CO `id` — mot muc hong trong `detail` khong duoc lam sai con so tren man hinh. */
const count = (value: unknown): number =>
  Array.isArray(value)
    ? value.filter(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { id?: unknown }).id === 'string',
      ).length
    : 0;

const quoted = (value: string): string => `“${value}”`;

const labelOrCode = (labelOf: PermissionLabelOf, code: unknown): string => {
  const raw = text(code);
  if (raw === null) return 'quyền này';
  return quoted(labelOf(raw) ?? raw);
};

const labelList = (labelOf: PermissionLabelOf, codes: unknown): string =>
  Array.isArray(codes) && codes.length > 0
    ? codes.map((code) => labelOrCode(labelOf, code)).join(', ')
    : 'các quyền nhạy cảm đã chọn';

/* ------------------------------------------------------------------ *
 * Tai khoan va dang nhap — `apps/api/src/auth/account-decisions.ts` (+ loi dau vao, mat khau tam)
 * ------------------------------------------------------------------ */

const ACCOUNT_MESSAGES: Readonly<Record<string, Template>> = {
  ACCOUNT_CHANGE_ALLOWED: 'Đã lưu thay đổi tài khoản.',
  SELF_LOCKOUT:
    'Không tự khoá, tự đổi quyền hay tự đặt lại mật khẩu của chính mình ở đây. Muốn đổi mật khẩu của bạn, dùng menu tài khoản.',
  LAST_ACTIVE_ADMIN: (detail) => {
    const who = text(detail.name) ?? text(detail.username);
    return `${who === null ? 'Đây' : `${who} là`} Giám đốc đang hoạt động cuối cùng — thêm hoặc mở khoá một Giám đốc khác trước khi khoá hay đổi vai tài khoản này.`;
  },
  PROTECTED_SERVICE_ACCOUNT:
    'Tài khoản hệ thống — không sửa được ở đây. Tài khoản này do bộ phận triển khai quản lý.',
  USERNAME_RESERVED: (detail) => {
    const name = text(detail.username);
    return `Tên đăng nhập ${name === null ? 'này' : quoted(name)} dành cho hệ thống — chọn tên khác.`;
  },
  ACCOUNT_LINKED_TO_DRIVER: (detail) => {
    const driver = text(detail.driverName) ?? text(detail.name);
    return `Tài khoản đang nối với hồ sơ lái xe${driver === null ? '' : ` ${driver}`} — gỡ nối ở phần “Hồ sơ đã nối” trước khi đổi vai.`;
  },
  ACCESS_INVALID: 'Bộ quyền chưa hợp lệ — xem các dòng cần sửa bên dưới.',
  ESCALATION_CONFIRMATION_REQUIRED: (detail, labelOf) =>
    detail.actions === undefined
      ? 'Cấp vai hoặc quyền nhạy cảm cần xác nhận rõ ràng trước khi lưu.'
      : `Cần xác nhận trước khi cấp quyền nhạy cảm: ${labelList(labelOf, detail.actions)}.`,
  ACCOUNT_NOT_FOUND: 'Không tìm thấy tài khoản này nữa — tải lại danh sách.',
  ACCOUNT_IDENTITY_TAKEN: (detail) => {
    const field = text(detail.field);
    const what =
      field === 'email'
        ? 'Email'
        : field === 'phone'
          ? 'Số điện thoại'
          : field === 'username'
            ? 'Tên đăng nhập'
            : 'Tên đăng nhập, email hoặc số điện thoại';
    const owner = text(detail.ownerName) ?? text(detail.username);
    return `${what} này đã thuộc ${owner === null ? 'một tài khoản khác' : `tài khoản ${owner}`}.`;
  },
  ACCOUNT_INPUT_INVALID: 'Thông tin chưa đúng dạng — kiểm tra lại các ô vừa nhập.',
  TEMPORARY_PASSWORD_EXPIRED: 'Mật khẩu tạm đã hết hạn. Nhờ Giám đốc cấp mật khẩu mới.',
  PASSWORD_CHANGE_REQUIRED: 'Bạn cần đổi mật khẩu tạm trước khi làm việc.',
};

/* ------------------------------------------------------------------ *
 * Tung dong quyen rieng — `TRANSPORT_GRANT_VIOLATION_CODES`
 * ------------------------------------------------------------------ */

const VIOLATION_MESSAGES: Readonly<Record<string, Template>> = {
  ADMIN_PRESET_IS_FULL:
    'Giám đốc đã có toàn quyền vận hành — không thêm hay bớt quyền riêng cho vai này được.',
  DRIVER_PRESET_IS_SELF_SCOPE_ONLY:
    'Lái xe chỉ làm việc của chính mình qua hồ sơ lái xe — không cấp thêm quyền riêng cho vai này.',
  UNKNOWN_PERMISSION: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} không còn trong danh mục quyền — tải lại trang rồi chọn lại.`,
  SCOPE_ACTION_NOT_GRANTABLE: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} đến từ việc nối hồ sơ (lái xe, bên góp vốn), không cấp bằng ô đánh dấu.`,
  DIRECTOR_ONLY_ACTION: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} chỉ Giám đốc làm được — không cấp cho vai khác.`,
  GRANT_REDUNDANT: (detail, labelOf) =>
    detail.effect === 'DENY'
      ? `${labelOrCode(labelOf, detail.permission)} vốn không có trong vai khởi điểm — không cần bớt.`
      : `${labelOrCode(labelOf, detail.permission)} đã có sẵn theo vai khởi điểm — không cần cấp thêm.`,
  GRANT_DUPLICATED: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} bị chọn hai lần.`,
  SOD_CONFLICT: (detail, labelOf) =>
    `Một người không được vừa ${labelOrCode(labelOf, detail.decision)} vừa ${labelOrCode(labelOf, detail.evidence)} — người duyệt tiền không được sửa căn cứ của chính khoản tiền đó. Bỏ một trong hai.`,
  ESCALATION_CONFIRMATION_REQUIRED: ACCOUNT_MESSAGES.ESCALATION_CONFIRMATION_REQUIRED as Template,
};

/* ------------------------------------------------------------------ *
 * Noi tai khoan voi ho so — `transport/fleet/account-link-decisions.ts`
 * ------------------------------------------------------------------ */

const LINK_MESSAGES: Readonly<Record<string, Template>> = {
  ACCOUNT_LINKED: 'Đã nối tài khoản với hồ sơ.',
  ACCOUNT_UNLINKED: 'Đã gỡ tài khoản khỏi hồ sơ.',
  ACCOUNT_LINK_UNCHANGED: 'Liên kết không đổi — hồ sơ đã nối đúng tài khoản này.',
  ACCOUNT_LINK_USER_NOT_FOUND: 'Không tìm thấy tài khoản cần nối — tải lại danh sách.',
  ACCOUNT_LINK_USER_DISABLED: 'Tài khoản đang bị khoá — mở khoá trước rồi nối hồ sơ.',
  ACCOUNT_LINK_ROLE_MISMATCH:
    'Hồ sơ lái xe chỉ nối được với tài khoản vai Lái xe. Đổi vai tài khoản trước, hoặc chọn tài khoản khác.',
  DRIVER_ACCOUNT_TAKEN: (detail) => {
    const other = text(detail.driverName) ?? text(detail.name);
    return `Tài khoản này đã nối với ${other === null ? 'một hồ sơ lái xe khác' : `hồ sơ lái xe ${other}`} — gỡ nối cũ trước.`;
  },
  ACCOUNT_LINK_DRIVER_INACTIVE:
    'Hồ sơ lái xe đã ngừng hoạt động — mở lại hồ sơ ở Đội xe & lái xe trước.',
  ASSET_STAKEHOLDER_ACCOUNT_TAKEN: (detail) => {
    const other = text(detail.stakeholderName) ?? text(detail.name);
    return `Tài khoản này đã nối với ${other === null ? 'một hồ sơ bên góp vốn khác' : `hồ sơ bên góp vốn ${other}`} — gỡ nối cũ trước.`;
  },
  ACTION_NOT_PERMITTED: 'Bạn không có quyền thực hiện thao tác này.',
};

/* ------------------------------------------------------------------ *
 * Dia diem van hanh — `transport/places/place-admin-decisions.ts` + `place-errors.ts`
 * ------------------------------------------------------------------ */

const openWorkSentence = (detail: Detail): string => {
  const runs = count(detail.runs);
  const orders = count(detail.orders);
  const parts = [runs > 0 ? `${runs} vòng xe` : null, orders > 0 ? `${orders} đơn` : null].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? 'việc đang mở' : parts.join(' và ');
};

const PLACE_MESSAGES: Readonly<Record<string, Template>> = {
  PLACE_WRITE_ALLOWED: 'Đã lưu địa điểm.',
  PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED: 'Đã lưu — danh sách việc đang mở đã được ghi vào lịch sử.',
  PLACE_NAME_TAKEN: (detail) => {
    const name = text(detail.conflictName);
    const kind = text(detail.conflictKindLabel);
    const owner = text(detail.ownerName);
    if (name === null)
      return 'Tên này đã dùng cho một địa điểm đang hoạt động khác — đặt tên khác.';
    return `Tên này đã dùng cho ${kind === null ? 'địa điểm' : kind.toLowerCase()} ${quoted(name)}${owner === null ? '' : ` của ${owner}`}. Đặt tên khác để lái xe và điều hành không nhầm hai nơi.`;
  },
  DEPOT_ALREADY_ACTIVE:
    'Đã có một bãi xe đang dùng. Bãi mới được lưu ở dạng dự phòng — dùng “Đặt làm bãi chính” khi muốn đổi.',
  DEPOT_CODE_TAKEN: 'Mã bãi xe sinh từ tên này đã được dùng — đổi tên bãi rồi lưu lại.',
  PLACE_OUTSIDE_SERVICE_AREA:
    'Vị trí này nằm ngoài vùng phục vụ. Kiểm tra lại toạ độ (vĩ độ trước, kinh độ sau).',
  GEOFENCE_RADIUS_OUT_OF_RANGE: (detail) => {
    const min = typeof detail.min === 'number' ? detail.min : null;
    const max = typeof detail.max === 'number' ? detail.max : null;
    return min === null || max === null
      ? 'Bán kính nằm ngoài khoảng cho phép.'
      : `Bán kính phải trong khoảng ${min.toLocaleString('vi-VN')}–${max.toLocaleString('vi-VN')} m.`;
  },
  COUNTERPARTY_TAX_CODE_TAKEN: (detail) => {
    const owner = text(detail.counterpartyName) ?? text(detail.name);
    return `Mã số thuế này đã thuộc ${owner === null ? 'một đơn vị có sẵn' : owner} — chọn đơn vị đó trong danh sách thay vì thêm mới.`;
  },
  DEPOT_CHANGE_AFFECTS_OPEN_WORK: (detail) =>
    `Còn ${openWorkSentence(detail)} đang dùng bãi xe này. Xem danh sách và xác nhận trước khi đổi.`,
  PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE:
    'Thêm, đổi tên hay tắt địa điểm của đơn vị khác cần thêm quyền quản lý khách hàng, đối tác. Nhờ Giám đốc cấp quyền.',
  COUNTERPARTY_SITE_MANAGED_AS_PLACE:
    'Điểm này đang được quản lý ở Địa điểm vận hành — sửa tên hay trạng thái ở đó.',
  PLACE_POINT_INVALID: 'Toạ độ không hợp lệ — chọn lại điểm trên bản đồ.',
  PLACE_NOT_FOUND: 'Không tìm thấy địa điểm này nữa — tải lại danh sách.',
  PLACE_OWNER_REQUIRED:
    'Chọn địa điểm này của ai: một khách hàng, một đơn vị có sẵn, hay đơn vị mới.',
  PLACE_OWNER_INVALID: 'Thông tin chủ của địa điểm chưa đúng — chọn lại “Địa điểm này của ai?”.',
  PLACE_OWNER_INACTIVE:
    'Khách hàng hoặc đơn vị sở hữu địa điểm đã ngừng hoạt động — mở lại đơn vị đó trước.',
  PLACE_SITE_ALREADY_FENCED:
    'Địa điểm có sẵn này đã có vị trí trên bản đồ — sửa ở chính địa điểm đó.',
  PLACE_SITE_OWNER_MISMATCH: 'Địa điểm có sẵn đã chọn không thuộc đơn vị này — chọn lại.',
  PLACE_NOT_A_DEPOT: 'Chỉ bãi xe mới đặt làm bãi chính được.',
};

/** Ma chi co o web: than loi khong phai JSON (route chua gan tren may chu). */
const CLIENT_MESSAGES: Readonly<Record<string, Template>> = {
  ROUTE_NOT_MOUNTED:
    'Máy chủ chưa có chức năng này — có thể đang cập nhật phiên bản. Thử lại sau ít phút.',
};

/** MOT bang cho ca khu quan tri — ma ly do la DUY NHAT tren moi bo tu vung phia API. */
export const ADMIN_REASON_MESSAGES: Readonly<Record<string, Template>> = {
  ...ACCOUNT_MESSAGES,
  ...VIOLATION_MESSAGES,
  ...LINK_MESSAGES,
  ...PLACE_MESSAGES,
  ...CLIENT_MESSAGES,
};

const noLabels: PermissionLabelOf = () => undefined;

const render = (template: Template, detail: Detail, labelOf: PermissionLabelOf): string =>
  typeof template === 'string' ? template : template(detail, labelOf);

/** Cau cho MOT ly do. `null` khi ma khong co trong bang — nguoi goi giu cau cua may chu. */
export function reasonMessage(
  reason: string,
  detail: Detail | null = null,
  labelOf: PermissionLabelOf = noLabels,
): string | null {
  const template = ADMIN_REASON_MESSAGES[reason];
  return template === undefined ? null : render(template, detail ?? {}, labelOf);
}

/** Cau cho MOT dong vi pham quyen. */
export function violationMessage(
  violation: AccessViolation,
  labelOf: PermissionLabelOf = noLabels,
): string {
  const detail: Detail = { ...(violation.detail ?? {}), permission: violation.permission };
  const template = VIOLATION_MESSAGES[violation.code];
  if (template !== undefined) return render(template, detail, labelOf);
  return text(violation.permission) === null
    ? 'Một quyền đã chọn chưa hợp lệ cho vai này.'
    : `Quyền ${labelOrCode(labelOf, violation.permission)} chưa hợp lệ cho vai này.`;
}

interface ApiErrorLike {
  readonly message?: unknown;
  readonly status?: unknown;
  readonly reason?: unknown;
  readonly detail?: unknown;
}

const asError = (error: unknown): ApiErrorLike =>
  typeof error === 'object' && error !== null ? (error as ApiErrorLike) : {};

const detailOf = (error: unknown): Detail | null => {
  const detail = asError(error).detail;
  return typeof detail === 'object' && detail !== null && !Array.isArray(detail)
    ? (detail as Detail)
    : null;
};

export const reasonOf = (error: unknown): string | null => {
  const reason = asError(error).reason;
  return typeof reason === 'string' && reason.length > 0 ? reason : null;
};

/** Cac dong vi pham cua `409 ACCESS_INVALID` — rong khi loi khong phai loai do. */
export function violationsOf(error: unknown): readonly AccessViolation[] {
  if (reasonOf(error) !== 'ACCESS_INVALID') return [];
  const raw = detailOf(error)?.violations;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is AccessViolation =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { code?: unknown }).code === 'string',
  );
}

/** Danh sach viec dang mo cua `409 DEPOT_CHANGE_AFFECTS_OPEN_WORK` — `null` khi khong phai loi do. */
export function openWorkOf(error: unknown): OpenWorkDetail | null {
  if (reasonOf(error) !== 'DEPOT_CHANGE_AFFECTS_OPEN_WORK') return null;
  const detail = detailOf(error) ?? {};
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (item): item is { id: string; code?: string | null } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { id?: unknown }).id === 'string',
        )
      : [];
  return {
    runs: list(detail.runs),
    orders: list(detail.orders),
    idleHours: typeof detail.idleHours === 'number' ? detail.idleHours : null,
  };
}

/**
 * MOT CAU cho mot loi bat ky cua khu quan tri: ly do co kieu → cau cua bang; `ACCESS_INVALID` →
 * cau dau + tung dong vi pham; khong co ly do → cau cua may chu; khong co gi → cau chung.
 */
export function adminErrorMessage(error: unknown, labelOf: PermissionLabelOf = noLabels): string {
  const reason = reasonOf(error);
  if (reason !== null) {
    const violations = violationsOf(error);
    if (violations.length > 0) {
      return [
        reasonMessage('ACCESS_INVALID') ?? '',
        ...violations.map((violation) => `• ${violationMessage(violation, labelOf)}`),
      ].join('\n');
    }
    const message = reasonMessage(reason, detailOf(error), labelOf);
    if (message !== null) return message;
  }
  const raw = asError(error).message;
  return typeof raw === 'string' && raw.trim().length > 0
    ? raw
    : 'Không thực hiện được yêu cầu. Hãy thử lại.';
}
