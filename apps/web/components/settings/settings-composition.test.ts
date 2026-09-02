import { describe, expect, it } from 'vitest';
import type { PublicTenantDescriptor } from '../../lib/tenant-runtime';
import {
  SETTINGS_FORBIDDEN_PRIMARY_TERMS,
  SETTINGS_SECTIONS,
  groupSettingsSections,
  resolveActiveSettingsSection,
  resolveSettingsAccess,
  selectSettingsSectionIds,
  settingsSectionHref,
  type SettingsSectionId,
} from './settings-composition';

const FULL_CAPABILITIES = [
  'knowledge',
  'messaging',
  'turn-processing',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
] as const;

function tenant(overrides: Partial<PublicTenantDescriptor> = {}): PublicTenantDescriptor {
  return {
    branding: {} as PublicTenantDescriptor['branding'],
    experience: 'b2b-sales-operations',
    capabilities: [...FULL_CAPABILITIES],
    integrationAdapters: { channel: ['zca'], parser: ['claude'] },
    readiness: { blockedCapabilities: [] },
    ...overrides,
  };
}

describe('kien truc thong tin theo viec nghiep vu', () => {
  it('xep muc theo bon nhom viec, khong phai mot hang the ngang hang', () => {
    const groups = groupSettingsSections(selectSettingsSectionIds(tenant()));

    expect(groups.map((entry) => entry.group.label)).toEqual([
      'Bắt đầu',
      'Bán hàng',
      'Chăm sóc khách hàng',
      'Vận hành',
    ]);
    expect(groups[1]?.sections.map((section) => section.label)).toEqual([
      'Sản phẩm & bảng giá',
      'Đại lý & nhóm Zalo',
      'Chính sách bán hàng',
    ]);
  });

  it('mo man cai dat la vao Tong quan, khong phai vao mot he thong con', () => {
    const sections = selectSettingsSectionIds(tenant());

    expect(sections[0]).toBe('overview');
    expect(resolveActiveSettingsSection(sections)).toBe('overview');
  });

  it('khong nhom nao hien ra khi rong', () => {
    const sections = selectSettingsSectionIds(
      tenant({ capabilities: ['knowledge', 'operations'], experience: 'agent-workforce' }),
    );

    expect(groupSettingsSections(sections).map((entry) => entry.group.id)).toEqual([
      'start',
      'customer-care',
      'operations',
    ]);
  });
});

describe('hien muc theo nang luc goi khach', () => {
  it('goi khach day du thay ca 12 muc, dung thu tu', () => {
    expect(selectSettingsSectionIds(tenant())).toEqual([
      'overview',
      'products-pricing',
      'dealers-groups',
      'sales-policy',
      'content',
      'campaigns',
      'notifications',
      'zalo',
      'automation',
      'system-status',
      'users',
      'audit',
    ]);
  });

  it('khach khong ban hang thi khong co man bang gia hay chinh sach ban hang', () => {
    const sections = selectSettingsSectionIds(
      tenant({ capabilities: ['knowledge', 'operations'], experience: 'agent-workforce' }),
    );

    expect(sections).toEqual(['overview', 'content', 'system-status', 'users', 'audit']);
    expect(sections).not.toContain('products-pricing');
    expect(sections).not.toContain('sales-policy');
    expect(sections).not.toContain('automation');
  });

  it('khong co kenh Zalo that thi khong hien muc Ket noi Zalo', () => {
    const sections = selectSettingsSectionIds(
      tenant({ integrationAdapters: { channel: ['mock'], parser: ['claude'] } }),
    );

    expect(sections).not.toContain('zalo');
    // Van con "Đại lý & nhóm Zalo" vi dai ly la du lieu ban hang, khong phu thuoc kenh.
    expect(sections).toContain('dealers-groups');
  });

  it('khong gan nhanh nao theo ten khach — cung nang luc thi cung bo muc', () => {
    expect(selectSettingsSectionIds(tenant({ experience: 'operations-console' }))).toEqual(
      selectSettingsSectionIds(tenant({ experience: 'b2b-sales-operations' })),
    );
  });

  it('goi khach chi co tri thuc giu nguyen mot muc noi dung nhu cu', () => {
    expect(
      selectSettingsSectionIds(
        tenant({ experience: 'knowledge-workspace', capabilities: ['knowledge'] }),
      ),
    ).toEqual(['content']);
  });
});

describe('quyen suy ra tu RBAC cua may chu', () => {
  it('Quan ly va Quan tri vien duoc sua; Sale va Ke toan chi doc', () => {
    expect(resolveSettingsAccess('MANAGER').canConfigure).toBe(true);
    expect(resolveSettingsAccess('ADMIN').canConfigure).toBe(true);
    expect(resolveSettingsAccess('SALE').canConfigure).toBe(false);
    expect(resolveSettingsAccess('ACCOUNTING').canConfigure).toBe(false);
  });

  it('chi Quan tri vien thay muc quan ly tai khoan — dung nhu @Roles(ADMIN) phia may chu', () => {
    expect(resolveSettingsAccess('ADMIN').canManageUsers).toBe(true);
    expect(resolveSettingsAccess('MANAGER').canManageUsers).toBe(false);
    expect(selectSettingsSectionIds(tenant(), resolveSettingsAccess('MANAGER'))).not.toContain(
      'users',
    );
    expect(selectSettingsSectionIds(tenant(), resolveSettingsAccess('ADMIN'))).toContain('users');
  });

  it('vai tro chi doc van giu duoc cac man con doc that — khong an het cho "an toan"', () => {
    const sections = selectSettingsSectionIds(tenant(), resolveSettingsAccess('SALE'));

    expect(sections).toContain('products-pricing');
    expect(sections).toContain('system-status');
    expect(sections).not.toContain('users');
  });

  it('chua dang nhap thi may chu KHONG chan gi — UI khong duoc gia vo la co chan', () => {
    const access = resolveSettingsAccess(null);

    expect(access).toEqual({
      role: null,
      canConfigure: true,
      canManageUsers: true,
      enforced: false,
    });
  });
});

describe('deep-link', () => {
  it('duong dan nam o query nen chia se va F5 deu ve dung muc', () => {
    const sections = selectSettingsSectionIds(tenant());

    expect(settingsSectionHref('products-pricing')).toBe('/settings?section=products-pricing');
    expect(resolveActiveSettingsSection(sections, 'products-pricing')).toBe('products-pricing');
  });

  it('deep-link toi muc khong duoc phep thi ve muc dau, khong vo man hinh', () => {
    const managerSections = selectSettingsSectionIds(tenant(), resolveSettingsAccess('MANAGER'));

    expect(resolveActiveSettingsSection(managerSections, 'users')).toBe('overview');
    expect(resolveActiveSettingsSection(managerSections, 'khong-co-that')).toBe('overview');
    expect(resolveActiveSettingsSection(managerSections, null)).toBe('overview');
  });

  it('bao loi ro rang khi goi khach khong bat muc nao', () => {
    expect(() => resolveActiveSettingsSection([])).toThrow(/settings panel/i);
  });
});

describe('ngon ngu nghiep vu o dieu huong', () => {
  it('khong ten muc nao bat khach phai biet kien truc ben trong', () => {
    const offenders: string[] = [];
    for (const section of SETTINGS_SECTIONS) {
      const text = `${section.label} ${section.description}`.toLowerCase();
      for (const term of SETTINGS_FORBIDDEN_PRIMARY_TERMS) {
        if (text.includes(term)) offenders.push(`${section.id}: "${term}"`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('cac nhan tung gay hieu nham da duoc thay bang cau viec', () => {
    const byId = new Map<SettingsSectionId, string>(
      SETTINGS_SECTIONS.map((section) => [section.id, section.label]),
    );

    expect(byId.get('sales-policy')).toBe('Chính sách bán hàng');
    expect(byId.get('system-status')).toBe('Trạng thái hệ thống');
    expect(byId.get('products-pricing')).toBe('Sản phẩm & bảng giá');
    expect(byId.get('zalo')).toBe('Kết nối Zalo');
  });

  it('moi muc co mot cau mo ta viec, khong de trong', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.description.length).toBeGreaterThan(10);
    }
  });
});
