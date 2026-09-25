import { describe, expect, it } from 'vitest';
import type { AccessBreakdown } from '../account.types.js';
import { toAccountView } from '../account-view.js';
import type { UserRole } from '../auth.types.js';
import { KHO_GROUPS, fakeKhoDomain, grant, userRecord } from '../__tests__/account-fixtures.js';
import { buildAccessBreakdown } from './access-breakdown.js';
import type { AccessScopeNote, PermissionGrant } from './permission-domain.js';

/**
 * "NGUOI NAY LAM DUOC GI?" (`#395`) — trang thai tung viec va cau tra loi tieng Viet, tu danh muc
 * cua mien + tap hieu luc + pham vi lien ket. Mien gia `kho` (xem `account-fixtures.ts`).
 */

function breakdown(
  role: UserRole,
  grants: readonly PermissionGrant[] = [],
  scopes: readonly AccessScopeNote[] = [],
): AccessBreakdown {
  return buildAccessBreakdown({
    account: toAccountView(userRecord('u-1', 'nguoi.a', role, { permissionGrants: grants })),
    domains: [fakeKhoDomain()],
    scopes,
  });
}

const stateOf = (result: AccessBreakdown, code: string): string | undefined =>
  result.groups.flatMap((group) => group.actions).find((action) => action.code === code)?.state;

const UNLINKED: AccessScopeNote = {
  id: 'kho.ho_so',
  groupId: 'kho-rieng',
  label: 'Hồ sơ lái xe',
  active: false,
  sentence: 'Chưa nối hồ sơ lái xe — chưa làm được gì',
};

describe('buildAccessBreakdown', () => {
  it('lai xe CHUA noi ho so: dung mot cau "chưa làm được gì", viec cua minh SCOPE_INACTIVE', () => {
    const result = breakdown('SALE', [], [UNLINKED]);
    expect(result.sentences).toEqual(['Chưa nối hồ sơ lái xe — chưa làm được gì']);
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('SCOPE_INACTIVE');
    expect(result.preset).toEqual({ role: 'SALE', label: 'Thủ kho' });
  });

  it('lai xe DA noi ho so: viec cua minh SCOPE_ACTIVE, nhom FULL, khong duyet duoc tien', () => {
    const result = breakdown('SALE', [], [{ ...UNLINKED, active: true, sentence: 'Đã nối hồ sơ' }]);
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('SCOPE_ACTIVE');
    expect(result.groups.find((group) => group.id === 'kho-rieng')?.summary).toBe('FULL');
    expect(result.sentences).toEqual(['Đã nối hồ sơ', 'Không duyệt được tiền']);
  });

  it('mien chua mo ta pham vi: nhom lien ket van noi ro la chua co hieu luc', () => {
    const result = breakdown('SALE');
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('SCOPE_INACTIVE');
    expect(result.sentences).toEqual([
      'Việc của chính thủ kho — chưa có hiệu lực: cần liên kết hồ sơ trước',
    ]);
  });

  it('Dieu hanh trong: chua lam duoc gi', () => {
    expect(breakdown('MANAGER').sentences).toEqual([
      'Chưa làm được gì — chưa được cấp nhóm quyền nào',
    ]);
  });

  it('Dieu hanh chi duoc xem: "Chỉ xem", GRANTED, khong duyet duoc tien', () => {
    const result = breakdown('MANAGER', [grant(KHO_GROUPS.xem)]);
    expect(stateOf(result, KHO_GROUPS.xem)).toBe('GRANTED');
    expect(stateOf(result, KHO_GROUPS.sua)).toBe('NONE');
    expect(stateOf(result, KHO_GROUPS.giamDoc)).toBe('DIRECTOR_ONLY');
    expect(result.sentences).toEqual(['Chỉ xem: Phiếu kho', 'Không duyệt được tiền']);
  });

  it('Ke toan bi bo bot mot quyen: DENIED va cau "Đã bỏ bớt"', () => {
    const result = breakdown('ACCOUNTING', [grant(KHO_GROUPS.xem, 'DENY')]);
    expect(stateOf(result, KHO_GROUPS.xem)).toBe('DENIED');
    expect(stateOf(result, KHO_GROUPS.duyet)).toBe('PRESET');
    expect(result.sentences).toContain('Đã bỏ bớt: Xem phiếu kho');
    expect(result.sentences).not.toContain('Không duyệt được tiền');
  });

  it('Giam doc: quyen nen tang + moi nhom cap duoc FULL', () => {
    const result = breakdown('ADMIN');
    expect(result.platform).toEqual([
      { code: 'platform.accounts.manage', label: 'Quản trị tài khoản & phân quyền', state: 'PRESET' },
    ]);
    expect(result.sentences[0]).toBe('Quản trị tài khoản & phân quyền');
    expect(result.sentences[1]).toBe('Làm được mọi việc: Phiếu kho; Tiền kho');
    expect(stateOf(result, KHO_GROUPS.giamDoc)).toBe('PRESET');
  });

  it('xem truoc mot bo khac voi bo dang luu (dryRun)', () => {
    const result = buildAccessBreakdown({
      account: toAccountView(userRecord('u-1', 'nguoi.a', 'MANAGER')),
      domains: [fakeKhoDomain()],
      scopes: [],
      role: 'ACCOUNTING',
      grants: [grant(KHO_GROUPS.sua)],
    });
    expect(result.preset.role).toBe('ACCOUNTING');
    expect(stateOf(result, KHO_GROUPS.sua)).toBe('GRANTED');
    expect(result.groups.find((group) => group.id === 'kho-phieu')?.summary).toBe('FULL');
  });
});
