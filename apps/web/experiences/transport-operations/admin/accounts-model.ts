import type { AuthRole, CreateUserInput } from '../../../lib/auth';
import { actionsForRole } from '../transport-actions';
import type { StatusTone } from '../customer-view';
import type { AssetStakeholder, Driver } from '../transport-types';
import type {
  AccountStatusFilter,
  AccountView,
  CatalogAction,
  CatalogGroup,
  CatalogPreset,
  PermissionCatalog,
  PermissionGrant,
} from './admin-types';

/**
 * MO HINH MAN "Tài khoản & quyền" (`#395`) — ham THUAN, khong React, khong mang.
 *
 * Man hinh KHONG tinh quyen: "Người này làm được gì?" la cau cua MAY CHU. Tep nay chi lo ba viec
 * trinh bay: (1) loc/dem danh sach tai khoan, (2) bien mot lan bam o dau vao mot BO QUYEN RIENG toi
 * gian (khong mot dong thua) de gui may chu xem truoc, (3) cau chu cho the mat khau tam.
 *
 * Tap vai khoi diem lay tu ban guong `transport-actions.ts` — ban do da co bai drift so tung ma voi
 * API, nen no la nguon dung de biet "o nay bat san theo vai".
 */

/* ------------------------------------------------------------------ *
 * Vai khoi diem — ten nghiep vu
 * ------------------------------------------------------------------ */

export const ROLE_LABEL: Readonly<Record<AuthRole, string>> = {
  ADMIN: 'Giám đốc',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Điều hành / Quản lý',
  SALE: 'Lái xe',
};

/** Loai tai khoan tren the "Người này là ai?" — `OWNER` la `MANAGER` KHONG quyen + noi ben gop von. */
export type PresetChoiceId = 'DRIVER' | 'OPERATIONS' | 'ACCOUNTING' | 'OWNER' | 'DIRECTOR';

export interface PresetChoice {
  readonly id: PresetChoiceId;
  readonly role: AuthRole;
  readonly label: string;
  readonly summary: string;
  /** Buoc chon nhom quyen chi co nghia voi vai CHO quyen rieng. */
  readonly choosesGroups: boolean;
  /** Tien to ten dang nhap goi y — lai xe `lx.` de nhin la biet. */
  readonly usernamePrefix?: string;
}

export const PRESET_CHOICES: readonly PresetChoice[] = [
  {
    id: 'DRIVER',
    role: 'SALE',
    label: 'Lái xe',
    summary: 'Chỉ việc của chính mình: chuyến, hiện trường, nhiên liệu, quỹ. Cần nối hồ sơ lái xe.',
    choosesGroups: false,
    usernamePrefix: 'lx.',
  },
  {
    id: 'OPERATIONS',
    role: 'MANAGER',
    label: 'Điều hành / Quản lý',
    summary: 'Bắt đầu trống — chọn đúng những nhóm việc người này cần.',
    choosesGroups: true,
  },
  {
    id: 'ACCOUNTING',
    role: 'ACCOUNTING',
    label: 'Kế toán',
    summary: 'Sổ sách, công nợ, quỹ và lương. Không sửa bằng chứng hiện trường.',
    choosesGroups: true,
  },
  {
    id: 'OWNER',
    role: 'MANAGER',
    label: 'Chủ xe / bên góp vốn',
    summary: 'Chỉ xem xe mình có cổ phần. Cần nối hồ sơ bên góp vốn.',
    choosesGroups: false,
  },
  {
    id: 'DIRECTOR',
    role: 'ADMIN',
    label: 'Giám đốc',
    summary: 'Toàn quyền vận hành, duyệt tiền và quản trị tài khoản.',
    choosesGroups: false,
  },
];

export const findPresetChoice = (id: PresetChoiceId): PresetChoice =>
  PRESET_CHOICES.find((choice) => choice.id === id) ?? (PRESET_CHOICES[1] as PresetChoice);

/** Cau Giam doc phai GO lai truoc khi cap vai Giam doc — mot o danh dau la qua re cho toan quyen. */
export const DIRECTOR_CONFIRMATION_PHRASE = 'Tôi hiểu Giám đốc có toàn quyền';

export const isDirectorConfirmed = (typed: string): boolean =>
  typed.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase() ===
  DIRECTOR_CONFIRMATION_PHRASE.toLowerCase();

/** Nhan cua vai: uu tien nhan MAY CHU tra trong danh muc, roi toi nhan cua man hinh. */
export const presetLabelOf = (role: AuthRole, presets: readonly CatalogPreset[] = []): string =>
  presets.find((preset) => preset.role === role)?.label ?? ROLE_LABEL[role];

/* ------------------------------------------------------------------ *
 * Danh sach tai khoan
 * ------------------------------------------------------------------ */

export type AccountStatus = 'ACTIVE' | 'PENDING' | 'DISABLED';

export const ACCOUNT_STATUS_LABEL: Readonly<Record<AccountStatus, string>> = {
  ACTIVE: 'Đang hoạt động',
  PENDING: 'Chờ đổi mật khẩu',
  DISABLED: 'Đã khoá',
};

export const ACCOUNT_STATUS_TONE: Readonly<Record<AccountStatus, StatusTone>> = {
  ACTIVE: 'go',
  PENDING: 'wait',
  DISABLED: 'stop',
};

export const accountStatusOf = (account: AccountView): AccountStatus =>
  account.disabledAt != null
    ? 'DISABLED'
    : account.mustChangePassword === true
      ? 'PENDING'
      : 'ACTIVE';

const STATUS_OF_FILTER: Readonly<Record<AccountStatusFilter, AccountStatus>> = {
  active: 'ACTIVE',
  pending: 'PENDING',
  disabled: 'DISABLED',
};

const COMBINING_MARKS = /[̀-ͯ]/g;
export const foldText = (value: string): string =>
  value.normalize('NFD').replace(COMBINING_MARKS, '').replace(/[Đđ]/g, 'd').toLowerCase().trim();

export interface AccountFilter {
  readonly query: string;
  readonly status: AccountStatusFilter | 'all';
  readonly role: AuthRole | 'all';
}

export const EMPTY_ACCOUNT_FILTER: AccountFilter = { query: '', status: 'all', role: 'all' };

/**
 * Loc TAI CHO: danh sach tai khoan cua mot doanh nghiep van tai la vai chuc dong, doc mot lan roi loc
 * theo tung phim. Tim theo ten, ten dang nhap, chuc danh, so dien thoai, email — khong dau.
 */
export function filterAccounts(
  accounts: readonly AccountView[],
  filter: AccountFilter,
): readonly AccountView[] {
  const needle = foldText(filter.query);
  return accounts
    .filter(
      (account) =>
        filter.status === 'all' || accountStatusOf(account) === STATUS_OF_FILTER[filter.status],
    )
    .filter((account) => filter.role === 'all' || account.role === filter.role)
    .filter((account) => {
      if (needle.length === 0) return true;
      return [account.name, account.username, account.jobTitle, account.phone, account.email]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => foldText(value).includes(needle));
    })
    .sort((left, right) => {
      const byStatus = statusRank(left) - statusRank(right);
      return byStatus !== 0 ? byStatus : left.name.localeCompare(right.name, 'vi');
    });
}

/** Chờ đổi mật khẩu len dau (viec dang do dang), da khoa xuong cuoi. */
const statusRank = (account: AccountView): number =>
  ({ PENDING: 0, ACTIVE: 1, DISABLED: 2 })[accountStatusOf(account)];

export interface AccountCounts {
  readonly all: number;
  readonly active: number;
  readonly pending: number;
  readonly disabled: number;
  readonly byRole: Readonly<Record<AuthRole, number>>;
}

export function countAccounts(accounts: readonly AccountView[]): AccountCounts {
  const byRole: Record<AuthRole, number> = { ADMIN: 0, ACCOUNTING: 0, MANAGER: 0, SALE: 0 };
  let active = 0;
  let pending = 0;
  let disabled = 0;
  for (const account of accounts) {
    byRole[account.role] += 1;
    const status = accountStatusOf(account);
    if (status === 'ACTIVE') active += 1;
    else if (status === 'PENDING') pending += 1;
    else disabled += 1;
  }
  return { all: accounts.length, active, pending, disabled, byRole };
}

/** "+3 quyền / −1 quyền" — rong khi tai khoan dung dung vai khoi diem. */
export function grantDeltaLabel(grants: readonly PermissionGrant[] | undefined): string | null {
  const allow = (grants ?? []).filter((grant) => grant.effect === 'ALLOW').length;
  const deny = (grants ?? []).filter((grant) => grant.effect === 'DENY').length;
  const parts = [allow > 0 ? `+${allow} quyền` : null, deny > 0 ? `−${deny} quyền` : null].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? null : parts.join(' / ');
}

/*
 * Thoi gian dang nhap va the mat khau tam dung CHUNG voi `/settings` — xem `lib/account-format.ts`.
 * Xuat lai o day de man quan tri van tai chi import mot mo hinh.
 */
export { formatDateTime, relativeLastLogin } from '../../../lib/account-format';

/* ------------------------------------------------------------------ *
 * Bo quyen rieng — tu mot lan bam den mot bo TOI GIAN
 * ------------------------------------------------------------------ */

export interface AccessDraft {
  readonly role: AuthRole;
  readonly grants: readonly PermissionGrant[];
}

/** Vai CHO quyen rieng — dung bang `GRANT_POLICY` phia API. */
export const roleAcceptsGrants = (role: AuthRole): boolean =>
  role === 'MANAGER' || role === 'ACCOUNTING';

const presetSet = (role: AuthRole): ReadonlySet<string> => new Set<string>(actionsForRole(role));

/** Tap HIEU LUC du kien cua ban nhap = vai khoi diem − BOT + THEM. May chu van la noi quyet dinh. */
export function draftEffective(draft: AccessDraft): ReadonlySet<string> {
  const effective = new Set(presetSet(draft.role));
  if (!roleAcceptsGrants(draft.role)) return effective;
  for (const grant of draft.grants) {
    if (grant.effect === 'DENY') effective.delete(grant.permission);
    else effective.add(grant.permission);
  }
  return effective;
}

/**
 * Dat MOT o ve bat/tat. Bo quyen ket qua la TOI GIAN: o trung vai khoi diem thi KHONG co dong nao
 * (may chu tu choi dong thua bang `GRANT_REDUNDANT`), o khac vai khoi diem thi dung MOT dong.
 */
export function setAction(draft: AccessDraft, code: string, isOn: boolean): AccessDraft {
  const preset = presetSet(draft.role);
  const others = draft.grants.filter((grant) => grant.permission !== code);
  if (preset.has(code) === isOn) return { ...draft, grants: others };
  return {
    ...draft,
    grants: [...others, { permission: code, effect: isOn ? 'ALLOW' : 'DENY' }],
  };
}

/** Doi vai khoi diem: bo quyen rieng cua vai cu KHONG mang sang (no noi ve mot vai khac). */
export const changeRole = (role: AuthRole): AccessDraft => ({ role, grants: [] });

/**
 * O do bat tat duoc bang o NHOM: khong chi-Giam-doc, khong leo thang. Quyen nhay cam phai bat
 * TUNG DONG kem xac nhan — mot lan bam nhom khong duoc lang le cap quyen do.
 */
export const isGroupToggleable = (action: CatalogAction): boolean =>
  !action.directorOnly && !action.escalation;

export type GroupCheckState = 'on' | 'off' | 'mixed' | 'locked';

export function groupCheckState(
  group: CatalogGroup,
  effective: ReadonlySet<string>,
): GroupCheckState {
  const toggleable = group.actions.filter(isGroupToggleable);
  if (!group.grantable || toggleable.length === 0) return 'locked';
  const held = toggleable.filter((action) => effective.has(action.code)).length;
  if (held === 0) return 'off';
  return held === toggleable.length ? 'on' : 'mixed';
}

/** Bam o nhom: dang du → tat het; con lai (trong hoac do dang) → bat het cac o bat tat duoc. */
export function toggleGroup(draft: AccessDraft, group: CatalogGroup): AccessDraft {
  const state = groupCheckState(group, draftEffective(draft));
  if (state === 'locked') return draft;
  const turnOn = state !== 'on';
  return group.actions
    .filter(isGroupToggleable)
    .reduce((next, action) => setAction(next, action.code, turnOn), draft);
}

export type ActionOrigin = 'PRESET' | 'GRANTED' | 'DENIED' | 'NONE';

export interface ActionRowView {
  readonly code: string;
  readonly label: string;
  readonly kind: CatalogAction['kind'];
  readonly kindLabel: string;
  readonly isOn: boolean;
  readonly origin: ActionOrigin;
  /** Khong bat tat duoc tren man nay: chi Giam doc, hoac vai khong cho quyen rieng. */
  readonly lockedReason: string | null;
  /** Bat o nay phai xac nhan leo thang. */
  readonly needsConfirmation: boolean;
  readonly sodLabel: string | null;
}

export const KIND_LABEL: Readonly<Record<CatalogAction['kind'], string>> = {
  XEM: 'Xem',
  THAO_TAC: 'Thao tác',
  DUYET: 'Duyệt tiền',
  NHAY_CAM: 'Nhạy cảm',
};

const SOD_LABEL: Readonly<Record<'DECISION' | 'EVIDENCE', string>> = {
  DECISION: 'Duyệt tiền — không đi cùng quyền sửa căn cứ',
  EVIDENCE: 'Sửa căn cứ — không đi cùng quyền duyệt tiền',
};

export function actionRows(group: CatalogGroup, draft: AccessDraft): readonly ActionRowView[] {
  const preset = presetSet(draft.role);
  const effective = draftEffective(draft);
  const acceptsGrants = roleAcceptsGrants(draft.role);
  return group.actions.map((action) => {
    const grant = draft.grants.find((entry) => entry.permission === action.code);
    const origin: ActionOrigin =
      grant?.effect === 'ALLOW'
        ? 'GRANTED'
        : grant?.effect === 'DENY'
          ? 'DENIED'
          : preset.has(action.code)
            ? 'PRESET'
            : 'NONE';
    const lockedReason = action.directorOnly
      ? 'Chỉ Giám đốc'
      : !group.grantable
        ? 'Đến từ hồ sơ đã nối'
        : !acceptsGrants
          ? draft.role === 'ADMIN'
            ? 'Giám đốc có sẵn'
            : 'Không cấp cho vai này'
          : null;
    return {
      code: action.code,
      label: action.label,
      kind: action.kind,
      kindLabel: KIND_LABEL[action.kind],
      isOn: effective.has(action.code),
      origin,
      lockedReason,
      needsConfirmation: action.escalation && !preset.has(action.code),
      sodLabel: action.sod === null ? null : SOD_LABEL[action.sod],
    };
  });
}

/** Nhom van tai co the chinh (co it nhat mot o); nhom lien ket va nhom khoa van hien, chi doc. */
export const transportGroupsOf = (
  catalog: PermissionCatalog | undefined,
): readonly CatalogGroup[] =>
  catalog?.domains.find((domain) => domain.id === 'transport')?.groups ?? [];

export const presetsOf = (catalog: PermissionCatalog | undefined): readonly CatalogPreset[] =>
  catalog?.domains.find((domain) => domain.id === 'transport')?.presets ?? [];

/** Nhan tieng Viet cua mot ma quyen — tu danh muc; cho `adminErrorMessage`. */
export function permissionLabelLookup(
  catalog: PermissionCatalog | undefined,
): (code: string) => string | undefined {
  const labels = new Map<string, string>();
  for (const group of transportGroupsOf(catalog)) {
    for (const action of group.actions) labels.set(action.code, action.label);
  }
  for (const entry of catalog?.platform ?? []) labels.set(entry.code, entry.label);
  return (code) => labels.get(code);
}

/** Quyen NHAY CAM dang duoc THEM trong ban nhap — Giam doc phai xac nhan tung cai truoc khi luu. */
export function escalatedAllows(
  draft: AccessDraft,
  groups: readonly CatalogGroup[],
): readonly CatalogAction[] {
  const allowed = new Set(
    draft.grants.filter((grant) => grant.effect === 'ALLOW').map((grant) => grant.permission),
  );
  return groups.flatMap((group) =>
    group.actions.filter((action) => action.escalation && allowed.has(action.code)),
  );
}

/** Hai ban nhap co cung vai va cung bo quyen khong (thu tu dong khong quan trong). */
export function sameAccess(left: AccessDraft, right: AccessDraft): boolean {
  if (left.role !== right.role) return false;
  const key = (draft: AccessDraft) =>
    draft.grants
      .map((grant) => `${grant.effect}:${grant.permission}`)
      .sort()
      .join('|');
  return key(left) === key(right);
}

/** Dem o dang bat cua mot vai + bo quyen, tren cac nhom CAP DUOC. */
export function grantedGroupSummary(
  draft: AccessDraft,
  groups: readonly CatalogGroup[],
): { readonly groups: number; readonly actions: number } {
  const effective = draftEffective(draft);
  let groupCount = 0;
  let actionCount = 0;
  for (const group of groups.filter((entry) => entry.grantable)) {
    const held = group.actions.filter((action) => effective.has(action.code)).length;
    if (held > 0) groupCount += 1;
    actionCount += held;
  }
  return { groups: groupCount, actions: actionCount };
}

/**
 * Canh bao KHONG CHAN: mot tai khoan Dieu hanh khong nhom nao va khong noi ben gop von thi dang nhap
 * duoc nhung khong thay gi — thuong la Giam doc quen buoc chon nhom.
 */
export function emptyAccessWarning(
  draft: AccessDraft,
  groups: readonly CatalogGroup[],
  hasStakeholderLink: boolean,
): string | null {
  if (draft.role !== 'MANAGER' || hasStakeholderLink) return null;
  return grantedGroupSummary(draft, groups).actions === 0
    ? 'Tài khoản này đăng nhập được nhưng không thấy gì — chọn ít nhất một nhóm việc, hoặc nối hồ sơ bên góp vốn.'
    : null;
}

/* ------------------------------------------------------------------ *
 * Tao tai khoan
 * ------------------------------------------------------------------ */

export interface IdentityDraft {
  readonly name: string;
  readonly username: string;
  readonly phone: string;
  readonly email: string;
  readonly jobTitle: string;
}

export const EMPTY_IDENTITY: IdentityDraft = {
  name: '',
  username: '',
  phone: '',
  email: '',
  jobTitle: '',
};

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Nhung dieu con thieu/sai o buoc danh tinh — trung luat `createUserSchema` phia API. */
export function identityProblems(identity: IdentityDraft): readonly string[] {
  const problems: string[] = [];
  const name = identity.name.trim();
  const username = identity.username.trim();
  if (name.length === 0) problems.push('Nhập họ tên.');
  if (name.length > 120) problems.push('Họ tên dài quá 120 ký tự.');
  if (username.length < 3 || username.length > 64) {
    problems.push('Tên đăng nhập cần từ 3 đến 64 ký tự.');
  } else if (!USERNAME_PATTERN.test(username)) {
    problems.push('Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới.');
  }
  const phone = identity.phone.trim();
  if (phone.length > 0 && (phone.length < 8 || phone.length > 24)) {
    problems.push('Số điện thoại cần từ 8 đến 24 ký tự.');
  }
  const email = identity.email.trim();
  if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.push('Email chưa đúng dạng.');
  }
  return problems;
}

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/** Than yeu cau tao — KHONG mat khau: may chu tao mat khau tam va tra trong `credential`. */
export function buildCreateInput(
  choice: PresetChoice,
  identity: IdentityDraft,
  access: AccessDraft,
  confirmEscalation: boolean,
): CreateUserInput {
  const grants = roleAcceptsGrants(choice.role) && choice.choosesGroups ? access.grants : [];
  return {
    username: identity.username.trim(),
    name: identity.name.trim(),
    role: choice.role,
    phone: blankToNull(identity.phone),
    email: blankToNull(identity.email),
    jobTitle: blankToNull(identity.jobTitle),
    ...(grants.length > 0 ? { grants } : {}),
    ...(confirmEscalation ? { confirmEscalation: true } : {}),
  };
}

/** Ho so lai xe CHUA co tai khoan va dang hoat dong — thu duy nhat noi duoc voi tai khoan moi. */
export const driverCandidates = (drivers: readonly Driver[]): readonly Driver[] =>
  drivers
    .filter((driver) => driver.status === 'ACTIVE' && driver.authUserId === null)
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'vi'));

export const stakeholderCandidates = (
  stakeholders: readonly AssetStakeholder[],
): readonly AssetStakeholder[] =>
  stakeholders
    .filter((stakeholder) => stakeholder.status === 'ACTIVE' && !stakeholder.hasAccount)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'vi'));

/* ------------------------------------------------------------------ *
 * The mat khau tam — cau chu dung chung, xem `lib/account-format.ts`
 * ------------------------------------------------------------------ */

export { credentialMessage, formatTemporaryPassword } from '../../../lib/account-format';

/**
 * Ten dang nhap goi y TAI CHO — duong lui khi may chu chua co `suggest-username`. May chu van la noi
 * kiem trung; day chi la mot cho bat dau hop le: khong dau, `đ`→`d`, noi bang dau cham, toi da 64.
 * "Trần Văn An" → `an.tv` khong: nguoi Viet goi nhau bang TEN, nen ten dung truoc — `an.tran.van`.
 */
export function localUsernameSuggestion(name: string, prefix = ''): string {
  const words = foldText(name)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return prefix;
  const given = words[words.length - 1] as string;
  const rest = words.slice(0, -1);
  return `${prefix}${[given, ...rest].join('.')}`.slice(0, 64);
}
