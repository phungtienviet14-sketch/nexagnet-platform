import type {
  AccessActionBreakdown,
  AccessActionState,
  AccessBreakdown,
  AccessGroupBreakdown,
  AccessGroupSummary,
  AccountView,
  PlatformPermissionBreakdown,
} from '../account.types.js';
import type { UserRole } from '../auth.types.js';
import type {
  AccessScopeNote,
  PermissionDomain,
  PermissionGrant,
  PermissionGroupView,
} from './permission-domain.js';
import { platformPermissionCatalog, platformPermissionsFor } from './platform-permissions.js';

/**
 * "NGUOI NAY LAM DUOC GI?" (`#395`) — tu danh muc cua tung mien, tap hieu luc va cac pham vi lien
 * ket. Ham THUAN: moi thu can biet duoc truyen vao.
 *
 * Nen tang khong biet mot ma quyen nghiep vu nao nghia la gi — cau chu den tu NHAN cua mien (nhom,
 * viec, vai khoi diem) va tu cau mo ta pham vi (`AccessScopeNote.sentence`). Nen tang chi noi cac
 * cau DUNG CHO MOI MIEN: "Làm được mọi việc", "Chỉ xem", "Không duyệt được tiền" (loai `DUYET` la
 * khai niem cua nen tang — `PermissionKind`).
 */

/** Nhan vai khoi diem khi khong mien nao dat ten cho vai do. */
const PLATFORM_PRESET_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: 'Quản trị',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  SALE: 'Nhân viên',
};

const USABLE: ReadonlySet<AccessActionState> = new Set(['PRESET', 'GRANTED', 'SCOPE_ACTIVE']);
const LISTED_ACTIONS = 3;

interface BreakdownInput {
  readonly account: AccountView;
  readonly domains: readonly PermissionDomain[];
  readonly scopes: readonly AccessScopeNote[];
  /** Vai va quyen rieng dem ra xem — mac dinh la cua chinh tai khoan (xem truoc dung cai nay). */
  readonly role?: UserRole;
  readonly grants?: readonly PermissionGrant[];
}

export function buildAccessBreakdown(input: BreakdownInput): AccessBreakdown {
  const role = input.role ?? input.account.role;
  const grants = input.grants ?? input.account.permissionGrants;
  const groups = input.domains.flatMap((domain) =>
    domainGroups(domain, role, grants, input.scopes),
  );
  const platform = platformBreakdown(role);
  return {
    account: input.account,
    preset: { role, label: presetLabel(input.domains, role) },
    grants,
    platform,
    groups,
    scopes: input.scopes,
    sentences: accessSentences(groups, platform, input.scopes),
  };
}

function presetLabel(domains: readonly PermissionDomain[], role: UserRole): string {
  for (const domain of domains) {
    const preset = domain.catalog().presets.find((candidate) => candidate.role === role);
    if (preset) return preset.label;
  }
  return PLATFORM_PRESET_LABELS[role];
}

function platformBreakdown(role: UserRole): PlatformPermissionBreakdown[] {
  const held = new Set<string>(platformPermissionsFor(role));
  return platformPermissionCatalog().map((entry) => ({
    code: entry.code,
    label: entry.label,
    state: held.has(entry.code) ? 'PRESET' : 'NONE',
  }));
}

function domainGroups(
  domain: PermissionDomain,
  role: UserRole,
  grants: readonly PermissionGrant[],
  scopes: readonly AccessScopeNote[],
): AccessGroupBreakdown[] {
  const preset = new Set(domain.effective({ role }));
  const effective = new Set(domain.effective({ role, permissionGrants: grants }));
  return domain.catalog().groups.map((group) => {
    const actions = group.actions.map(
      (action): AccessActionBreakdown => ({
        code: action.code,
        label: action.label,
        kind: action.kind,
        state: group.grantable
          ? grantableState(action.code, action.directorOnly, preset, effective)
          : scopeState(group, action.code, preset, scopes),
      }),
    );
    return {
      domain: domain.id,
      id: group.id,
      label: group.label,
      grantable: group.grantable,
      actions,
      summary: summarize(actions),
    };
  });
}

function grantableState(
  code: string,
  directorOnly: boolean,
  preset: ReadonlySet<string>,
  effective: ReadonlySet<string>,
): AccessActionState {
  const held = effective.has(code);
  const fromPreset = preset.has(code);
  if (held) return fromPreset ? 'PRESET' : 'GRANTED';
  if (fromPreset) return 'DENIED';
  return directorOnly ? 'DIRECTOR_ONLY' : 'NONE';
}

/**
 * Nhom den tu LIEN KET: viec cua nhom chi lam duoc khi pham vi gan voi nhom dang hieu luc. Vai co
 * viec do ma lien ket chua co (lai xe chua noi ho so) → `SCOPE_INACTIVE`, khong phai "lam duoc".
 */
function scopeState(
  group: PermissionGroupView,
  code: string,
  preset: ReadonlySet<string>,
  scopes: readonly AccessScopeNote[],
): AccessActionState {
  const scope = scopes.find((note) => note.groupId === group.id);
  if (scope?.active) return 'SCOPE_ACTIVE';
  return preset.has(code) ? 'SCOPE_INACTIVE' : 'NONE';
}

function summarize(actions: readonly AccessActionBreakdown[]): AccessGroupSummary {
  const usable = actions.filter((action) => USABLE.has(action.state)).length;
  if (usable === 0) return 'NONE';
  return usable === actions.length ? 'FULL' : 'PARTIAL';
}

/* ------------------------------------------------------------------ *
 * CAU TRA LOI
 * ------------------------------------------------------------------ */

function accessSentences(
  groups: readonly AccessGroupBreakdown[],
  platform: readonly PlatformPermissionBreakdown[],
  scopes: readonly AccessScopeNote[],
): string[] {
  const canDoAnything =
    platform.some((entry) => entry.state === 'PRESET') ||
    groups.some((group) => group.summary !== 'NONE');
  if (!canDoAnything) {
    // Khong lam duoc gi: cau cua pham vi (vd "Chưa nối hồ sơ lái xe — chưa làm được gì") la
    // cau tra loi dung nhat; khong co thi noi thang.
    const scopeLines = scopeSentences(groups, scopes);
    return scopeLines.length > 0 ? scopeLines : ['Chưa làm được gì — chưa được cấp nhóm quyền nào'];
  }

  const sentences: string[] = platform
    .filter((entry) => entry.state === 'PRESET')
    .map((entry) => entry.label);
  const grantable = groups.filter((group) => group.grantable);

  const full = grantable.filter((group) => group.summary === 'FULL');
  if (full.length > 0) {
    sentences.push(`Làm được mọi việc: ${full.map((group) => group.label).join('; ')}`);
  }
  const partial = grantable.filter((group) => group.summary === 'PARTIAL');
  const readOnly = partial.filter((group) => usableActions(group).every(isReadOnly));
  if (readOnly.length > 0) {
    sentences.push(`Chỉ xem: ${readOnly.map((group) => group.label).join('; ')}`);
  }
  for (const group of partial.filter((candidate) => !readOnly.includes(candidate))) {
    sentences.push(`${group.label}: ${listActions(usableActions(group))}`);
  }

  const denied = grantable.flatMap((group) =>
    group.actions.filter((action) => action.state === 'DENIED'),
  );
  if (denied.length > 0) sentences.push(`Đã bỏ bớt: ${listActions(denied)}`);

  sentences.push(...scopeSentences(groups, scopes));

  const decisions = grantable.flatMap((group) =>
    group.actions.filter((action) => action.kind === 'DUYET'),
  );
  if (decisions.length > 0 && !decisions.some((action) => USABLE.has(action.state))) {
    sentences.push('Không duyệt được tiền');
  }
  return sentences;
}

/**
 * Cau cua pham vi: cau cua mien khi co (`AccessScopeNote.sentence`), va voi nhom lien ket vai co
 * ma KHONG pham vi nao mo ta, mot cau chung lay tu mo ta cua nhom.
 */
function scopeSentences(
  groups: readonly AccessGroupBreakdown[],
  scopes: readonly AccessScopeNote[],
): string[] {
  const sentences = scopes.map((scope) => scope.sentence);
  for (const group of groups) {
    if (group.grantable) continue;
    if (scopes.some((scope) => scope.groupId === group.id)) continue;
    if (!group.actions.some((action) => action.state === 'SCOPE_INACTIVE')) continue;
    sentences.push(`${group.label} — chưa có hiệu lực: cần liên kết hồ sơ trước`);
  }
  return [...new Set(sentences)];
}

function usableActions(group: AccessGroupBreakdown): AccessActionBreakdown[] {
  return group.actions.filter((action) => USABLE.has(action.state));
}

function isReadOnly(action: AccessActionBreakdown): boolean {
  return action.kind === 'XEM';
}

function listActions(actions: readonly AccessActionBreakdown[]): string {
  const shown = actions.slice(0, LISTED_ACTIONS).map((action) => action.label);
  const rest = actions.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} và ${rest} việc khác` : shown.join(', ');
}
