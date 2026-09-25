import { describe, expect, it } from 'vitest';
import {
  actionRows,
  buildCreateInput,
  changeRole,
  countAccounts,
  credentialMessage,
  draftEffective,
  driverCandidates,
  emptyAccessWarning,
  escalatedAllows,
  filterAccounts,
  findPresetChoice,
  formatTemporaryPassword,
  grantDeltaLabel,
  groupCheckbox,
  groupCheckState,
  identityProblems,
  isDirectorConfirmed,
  localUsernameSuggestion,
  permissionLabelLookup,
  relativeLastLogin,
  sameAccess,
  setAction,
  toggleGroup,
  triStateOf,
  usernameAfterPresetChange,
  EMPTY_IDENTITY,
  type AccessDraft,
} from '../accounts-model';
import type { AccountView, CatalogAction, CatalogGroup, PermissionCatalog } from '../admin-types';
import type { Driver } from '../../transport-types';

const action = (
  code: string,
  label: string,
  extra: Partial<CatalogAction> = {},
): CatalogAction => ({
  code,
  label,
  kind: code.endsWith('.read') ? 'XEM' : 'THAO_TAC',
  directorOnly: false,
  escalation: false,
  sod: null,
  ...extra,
});

const FLEET: CatalogGroup = {
  id: 'doi-xe',
  label: 'Đội xe & lái xe',
  summary: 'Hồ sơ xe, lái xe',
  grantable: true,
  actions: [
    action('transport.vehicle.read', 'Xem danh sách xe'),
    action('transport.vehicle.manage', 'Thêm và sửa hồ sơ xe'),
  ],
};

const FIELD: CatalogGroup = {
  id: 'hien-truong',
  label: 'Hiện trường & bằng chứng',
  summary: 'Mốc hiện trường',
  grantable: true,
  actions: [
    action('transport.checkpoint.read', 'Xem mốc'),
    action('transport.checkpoint.record', 'Ghi bù mốc', {
      kind: 'NHAY_CAM',
      escalation: true,
      sod: 'EVIDENCE',
    }),
  ],
};

const ADMINISTRATION: CatalogGroup = {
  id: 'quan-tri',
  label: 'Quản trị',
  summary: 'Nối tài khoản',
  grantable: true,
  actions: [
    action('transport.account_link.manage', 'Nối tài khoản', {
      kind: 'NHAY_CAM',
      directorOnly: true,
    }),
  ],
};

const DRIVER_SELF: CatalogGroup = {
  id: 'lai-xe',
  label: 'Việc của chính lái xe',
  summary: 'Qua hồ sơ lái xe',
  grantable: false,
  actions: [action('transport.driver.self.trip.read', 'Xem chuyến của mình')],
};

const GROUPS = [FLEET, FIELD, ADMINISTRATION, DRIVER_SELF];

const account = (overrides: Partial<AccountView> & { id: string; name: string }): AccountView => ({
  username: overrides.id,
  role: 'MANAGER',
  disabledAt: null,
  mustChangePassword: false,
  permissionGrants: [],
  ...overrides,
});

describe('bo quyen rieng toi gian tu tung lan bam (#395)', () => {
  const manager: AccessDraft = changeRole('MANAGER');

  it('MANAGER bat dau trong; bat nhom Doi xe → hai dong ALLOW, nhom thanh "on"', () => {
    expect(groupCheckState(FLEET, draftEffective(manager))).toBe('off');
    const next = toggleGroup(manager, FLEET);
    expect(next.grants).toEqual([
      { permission: 'transport.vehicle.read', effect: 'ALLOW' },
      { permission: 'transport.vehicle.manage', effect: 'ALLOW' },
    ]);
    expect(groupCheckState(FLEET, draftEffective(next))).toBe('on');
    expect(groupCheckState(FLEET, draftEffective(toggleGroup(next, FLEET)))).toBe('off');
    expect(toggleGroup(next, FLEET).grants).toEqual([]);
  });

  it('mot o bat → nhom "mixed" (aria-checked=mixed); bam nhom mixed thi bat du', () => {
    const one = setAction(manager, 'transport.vehicle.read', true);
    expect(groupCheckState(FLEET, draftEffective(one))).toBe('mixed');
    expect(groupCheckState(FLEET, draftEffective(toggleGroup(one, FLEET)))).toBe('on');
  });

  it('bam nhom KHONG cap quyen nhay cam; o nhay cam phai bat rieng va duoc liet ke de xac nhan', () => {
    const withField = toggleGroup(manager, FIELD);
    expect(draftEffective(withField).has('transport.checkpoint.record')).toBe(false);
    expect(groupCheckState(FIELD, draftEffective(withField))).toBe('on');
    const escalated = setAction(withField, 'transport.checkpoint.record', true);
    expect(escalatedAllows(escalated, GROUPS).map((entry) => entry.code)).toEqual([
      'transport.checkpoint.record',
    ]);
    const row = actionRows(FIELD, escalated).find(
      (entry) => entry.code === 'transport.checkpoint.record',
    );
    expect(row).toMatchObject({ isOn: true, origin: 'GRANTED', needsConfirmation: true });
    expect(row?.sodLabel).toContain('Sửa căn cứ');
  });

  it('o nhom KHOA van noi DUNG trang thai: Giam doc du quyen thi "on", khong phai o trong', () => {
    const director = changeRole('ADMIN');
    expect(groupCheckbox(FLEET, director)).toEqual({
      checked: 'on',
      isLocked: true,
      held: 2,
      total: 2,
    });
    expect(groupCheckbox(FIELD, director)).toMatchObject({ checked: 'on', isLocked: true });
    // MANAGER: nhom chi-Giam-doc khoa VA trong; nhom thuong bam duoc.
    expect(groupCheckbox(ADMINISTRATION, manager)).toMatchObject({
      checked: 'off',
      isLocked: true,
      held: 0,
    });
    expect(groupCheckbox(FLEET, manager)).toMatchObject({ checked: 'off', isLocked: false });
    const one = setAction(manager, 'transport.vehicle.read', true);
    expect(groupCheckbox(FLEET, one)).toMatchObject({ checked: 'mixed', isLocked: false, held: 1 });
  });

  it('du / do dang / trong theo so viec dang co', () => {
    expect(triStateOf(0, 12)).toBe('off');
    expect(triStateOf(5, 12)).toBe('mixed');
    expect(triStateOf(12, 12)).toBe('on');
    expect(triStateOf(0, 0)).toBe('off');
  });

  it('nhom chi-Giam-doc (quan-tri) va nhom lien ket (lai-xe) la KHOA', () => {
    expect(groupCheckState(ADMINISTRATION, new Set())).toBe('locked');
    expect(groupCheckState(DRIVER_SELF, new Set())).toBe('locked');
    expect(toggleGroup(manager, ADMINISTRATION)).toBe(manager);
    expect(actionRows(ADMINISTRATION, manager)[0]?.lockedReason).toBe('Chỉ Giám đốc');
    expect(actionRows(DRIVER_SELF, manager)[0]?.lockedReason).toBe('Đến từ hồ sơ đã nối');
  });

  it('Ke toan: tat mot quyen vai khoi diem → MOT dong DENY; bat lai → khong dong nao', () => {
    const accounting = changeRole('ACCOUNTING');
    expect(draftEffective(accounting).has('transport.vehicle.read')).toBe(true);
    const denied = setAction(accounting, 'transport.vehicle.read', false);
    expect(denied.grants).toEqual([{ permission: 'transport.vehicle.read', effect: 'DENY' }]);
    expect(actionRows(FLEET, denied)[0]).toMatchObject({ isOn: false, origin: 'DENIED' });
    expect(setAction(denied, 'transport.vehicle.read', true).grants).toEqual([]);
    // Ghi bu moc: Ke toan KHONG co theo vai → bat la leo thang.
    expect(actionRows(FIELD, accounting)[1]).toMatchObject({
      isOn: false,
      needsConfirmation: true,
    });
  });

  it('Giam doc va Lai xe khong nhan quyen rieng: o bi khoa, doi vai thi bo quyen rieng', () => {
    expect(actionRows(FLEET, changeRole('ADMIN'))[0]?.lockedReason).toBe('Giám đốc có sẵn');
    expect(actionRows(FLEET, changeRole('SALE'))[0]?.lockedReason).toBe('Không cấp cho vai này');
    expect(changeRole('SALE').grants).toEqual([]);
  });

  it('so sanh hai ban nhap khong phu thuoc thu tu dong', () => {
    const left: AccessDraft = {
      role: 'MANAGER',
      grants: [
        { permission: 'a', effect: 'ALLOW' },
        { permission: 'b', effect: 'ALLOW' },
      ],
    };
    const right: AccessDraft = { role: 'MANAGER', grants: [...left.grants].reverse() };
    expect(sameAccess(left, right)).toBe(true);
    expect(sameAccess(left, { ...right, role: 'ACCOUNTING' })).toBe(false);
  });

  it('Dieu hanh khong nhom nao va khong noi ben gop von → canh bao "khong thay gi"', () => {
    expect(emptyAccessWarning(manager, GROUPS, false)).toContain('không thấy gì');
    expect(emptyAccessWarning(manager, GROUPS, true)).toBeNull();
    expect(emptyAccessWarning(toggleGroup(manager, FLEET), GROUPS, false)).toBeNull();
    expect(emptyAccessWarning(changeRole('ACCOUNTING'), GROUPS, false)).toBeNull();
  });

  it('nhan quyen lay tu danh muc cho cau loi', () => {
    const catalog: PermissionCatalog = {
      domains: [{ id: 'transport', groups: GROUPS, presets: [] }],
      platform: [{ code: 'platform.accounts.manage', label: 'Quản trị tài khoản & phân quyền' }],
    };
    const labelOf = permissionLabelLookup(catalog);
    expect(labelOf('transport.vehicle.read')).toBe('Xem danh sách xe');
    expect(labelOf('platform.accounts.manage')).toBe('Quản trị tài khoản & phân quyền');
    expect(labelOf('khong-co')).toBeUndefined();
  });
});

describe('danh sach tai khoan', () => {
  const list = [
    account({ id: 'gd', name: 'Nguyễn Văn Giám', role: 'ADMIN' }),
    account({ id: 'lx.an', name: 'Trần Văn An', role: 'SALE', mustChangePassword: true }),
    account({ id: 'kt', name: 'Lê Thị Đào', role: 'ACCOUNTING', jobTitle: 'Kế toán trưởng' }),
    account({ id: 'cu', name: 'Phạm Cũ', role: 'MANAGER', disabledAt: '2026-09-01T00:00:00.000Z' }),
  ];

  it('loc khong dau theo ten / ten dang nhap / chuc danh; chờ đổi mật khẩu len dau', () => {
    expect(
      filterAccounts(list, { query: 'dao', status: 'all', role: 'all' }).map((a) => a.id),
    ).toEqual(['kt']);
    expect(
      filterAccounts(list, { query: 'truong', status: 'all', role: 'all' }).map((a) => a.id),
    ).toEqual(['kt']);
    expect(
      filterAccounts(list, { query: '', status: 'all', role: 'all' }).map((a) => a.id),
    ).toEqual(['lx.an', 'kt', 'gd', 'cu']);
    expect(
      filterAccounts(list, { query: '', status: 'disabled', role: 'all' }).map((a) => a.id),
    ).toEqual(['cu']);
    expect(
      filterAccounts(list, { query: '', status: 'all', role: 'SALE' }).map((a) => a.id),
    ).toEqual(['lx.an']);
  });

  it('dem theo trang thai va theo vai', () => {
    expect(countAccounts(list)).toEqual({
      all: 4,
      active: 2,
      pending: 1,
      disabled: 1,
      byRole: { ADMIN: 1, ACCOUNTING: 1, MANAGER: 1, SALE: 1 },
    });
  });

  it('"+n quyền / −m quyền" va lan dang nhap cuoi dang tuong doi', () => {
    expect(grantDeltaLabel([])).toBeNull();
    expect(
      grantDeltaLabel([
        { permission: 'a', effect: 'ALLOW' },
        { permission: 'b', effect: 'ALLOW' },
        { permission: 'c', effect: 'DENY' },
      ]),
    ).toBe('+2 quyền / −1 quyền');
    const now = new Date('2026-09-25T10:00:00.000Z');
    expect(relativeLastLogin(null, now)).toBe('Chưa đăng nhập');
    expect(relativeLastLogin('2026-09-25T09:59:30.000Z', now)).toBe('Vừa xong');
    expect(relativeLastLogin('2026-09-25T09:15:00.000Z', now)).toBe('45 phút trước');
    expect(relativeLastLogin('2026-09-25T04:00:00.000Z', now)).toBe('6 giờ trước');
    expect(relativeLastLogin('2026-09-24T08:00:00.000Z', now)).toBe('Hôm qua');
    expect(relativeLastLogin('2026-09-20T10:00:00.000Z', now)).toBe('5 ngày trước');
  });
});

describe('tao tai khoan', () => {
  it('buoc danh tinh noi dung tung dieu sai', () => {
    expect(
      identityProblems({ name: '', username: 'Lá', phone: '12', email: 'x', jobTitle: '' }),
    ).toEqual([
      'Nhập họ tên.',
      'Tên đăng nhập cần từ 3 đến 64 ký tự.',
      'Số điện thoại cần từ 8 đến 24 ký tự.',
      'Email chưa đúng dạng.',
    ]);
    expect(
      identityProblems({ name: 'An', username: 'lx.tran-an', phone: '', email: '', jobTitle: '' }),
    ).toEqual([]);
  });

  it('than yeu cau: KHONG mat khau, quyen rieng chi cho vai chon nhom, o trong thanh null', () => {
    const identity = {
      name: ' An ',
      username: 'dh.an',
      phone: ' ',
      email: '',
      jobTitle: 'Điều phối',
    };
    const access = toggleGroup(changeRole('MANAGER'), FLEET);
    const input = buildCreateInput(findPresetChoice('OPERATIONS'), identity, access, false);
    expect(input).toEqual({
      username: 'dh.an',
      name: 'An',
      role: 'MANAGER',
      phone: null,
      email: null,
      jobTitle: 'Điều phối',
      grants: access.grants,
    });
    expect('password' in input).toBe(false);
    // Chu xe: vai MANAGER nhung KHONG quyen rieng — pham vi den tu lien ket ben gop von.
    expect(
      buildCreateInput(findPresetChoice('OWNER'), identity, access, false).grants,
    ).toBeUndefined();
    expect(
      buildCreateInput(findPresetChoice('DIRECTOR'), identity, changeRole('ADMIN'), true),
    ).toMatchObject({
      role: 'ADMIN',
      confirmEscalation: true,
    });
  });

  it('cau xac nhan cap vai Giam doc phai go dung (khong phan biet hoa thuong, khoang trang)', () => {
    expect(isDirectorConfirmed('  tôi hiểu   Giám đốc có toàn quyền ')).toBe(true);
    expect(isDirectorConfirmed('toi hieu')).toBe(false);
  });

  it('chi ho so lai xe dang hoat dong va CHUA co tai khoan moi noi duoc', () => {
    const driver = (id: string, extra: Partial<Driver>): Driver => ({
      id,
      fullName: id,
      phone: '0900000000',
      licenceClass: 'C',
      licenceExpiry: '2030-01-01',
      status: 'ACTIVE',
      authUserId: null,
      createdAt: '',
      updatedAt: '',
      ...extra,
    });
    expect(
      driverCandidates([
        driver('Bình', {}),
        driver('An', {}),
        driver('Có tài khoản', { authUserId: 'u1' }),
        driver('Nghỉ', { status: 'INACTIVE' }),
      ]).map((entry) => entry.id),
    ).toEqual(['An', 'Bình']);
  });

  it('loi nhan gui mat khau tam: du dia chi, ten dang nhap, mat khau, han', () => {
    const temporary = 'abcdefghjkmnpqrs';
    expect(formatTemporaryPassword(temporary)).toBe('abcd-efgh-jkmn-pqrs');
    const message = credentialMessage({
      productName: 'Vận hành vận tải',
      name: 'An',
      username: 'lx.an',
      credential: { temporaryPassword: temporary, expiresAt: '2026-09-28T03:00:00.000Z' },
      loginUrl: 'https://vt.example/login',
    });
    expect(message).toContain('https://vt.example/login');
    expect(message).toContain('Tên đăng nhập: lx.an');
    expect(message).toContain('Mật khẩu tạm: abcd-efgh-jkmn-pqrs');
    expect(message).toContain('10:00 28/09/2026');
  });
});

describe('ten dang nhap goi y tai cho', () => {
  it('ten goi truoc, khong dau, noi bang dau cham, tien to lai xe', () => {
    expect(localUsernameSuggestion('Trần Văn An', 'lx.')).toBe('lx.an.tran.van');
    expect(localUsernameSuggestion('Đỗ Thị Đào')).toBe('dao.do.thi');
    expect(localUsernameSuggestion('  ', 'lx.')).toBe('lx.');
  });
});

describe('doi the vai khong lam mat ten dang nhap goi y (#395)', () => {
  const operations = findPresetChoice('OPERATIONS');
  const accounting = findPresetChoice('ACCOUNTING');
  const driver = findPresetChoice('DRIVER');
  // Goi y cua MAY CHU (co hau to chong trung) — khong phai thu man hinh tu tinh lai duoc.
  const suggested = { ...EMPTY_IDENTITY, name: 'Trần Văn An', username: 'an.van.tran2' };

  it('Điều hành ↔ Kế toán (cung tien to): GIU goi y, buoc danh tinh khong bao loi 3–64', () => {
    const afterAccounting = usernameAfterPresetChange(suggested, false, operations, accounting);
    expect(afterAccounting).toBe('an.van.tran2');
    const back = usernameAfterPresetChange(
      { ...suggested, username: afterAccounting },
      false,
      accounting,
      operations,
    );
    expect(back).toBe('an.van.tran2');
    expect(identityProblems({ ...suggested, username: back })).toEqual([]);
  });

  it('doi tien to (sang Lái xe va nguoc lai): goi y lai NGAY theo tien to moi', () => {
    const toDriver = usernameAfterPresetChange(suggested, false, operations, driver);
    expect(toDriver).toBe('lx.an.tran.van');
    expect(
      usernameAfterPresetChange({ ...suggested, username: toDriver }, false, driver, accounting),
    ).toBe('an.tran.van');
  });

  it('ten nguoi dung tu go thi khong bao gio bi thay; chua co ho ten thi de trong', () => {
    const typed = { ...suggested, username: 'an.dieuhanh' };
    expect(usernameAfterPresetChange(typed, true, operations, driver)).toBe('an.dieuhanh');
    expect(usernameAfterPresetChange(EMPTY_IDENTITY, false, operations, driver)).toBe('');
    // O trong (goi y truoc bi hong) + cung tien to: dien goi y tai cho thay vi de trong.
    expect(
      usernameAfterPresetChange({ ...suggested, username: '' }, false, operations, accounting),
    ).toBe('an.tran.van');
  });
});
