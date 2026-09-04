import { EXPERIENCE_REQUIREMENTS, type CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import {
  buildDriverUrl,
  buildSectionUrl,
  canNavigateTo,
  DRIVER_SCREENS,
  navigationGroups,
  parseNavigationFromSearch,
  PENDING_CAPABILITIES,
  resolveNavigation,
  resolveSection,
  TRANSPORT_SECTIONS,
  visibleDriverScreens,
  visibleSections,
  type NavigationInput,
} from '../navigation';

/**
 * Kien truc thong tin la mot HOP DONG. Bo test nay giu no dung ba dieu ma #161 doi:
 * loc theo nang luc + vai, che `TX-06`/`TX-07`, va dia chi song sot qua tai lai/back/forward.
 */

/** Nang luc TOI THIEU cua experience nay — ghim thang vao hop dong cua `packages/tenant`. */
const MINIMUM: readonly CapabilityId[] = EXPERIENCE_REQUIREMENTS['transport-operations'];
const FULL: readonly CapabilityId[] = [
  ...MINIMUM,
  'transport-costing',
  'transport-fuel',
  'transport-settlement',
];

/**
 * Hai ma cua T6 — CO THAT trong `CapabilityId` tu khi PR #152 vao `main`. Truoc day bo test nay
 * phai `as unknown as` de dien lai mot tinh huong tuong lai; nay khong con phai, va do chinh la
 * y nghia cua §4.2 trong #180: cho tam bang chuoi da duoc thay bang kieu that.
 */
const T6_CAPABILITIES: readonly CapabilityId[] = [
  'transport-asset-compliance',
  'transport-workforce',
];

/**
 * Hai ma cua T6 — CO THAT trong `CapabilityId` tu khi PR #152 vao `main`. Truoc do bo test nay
 * phai `as unknown as` de dien lai tinh huong tuong lai; nay khong con phai, va do la ca y nghia
 * cua §4.2 trong #180: cho tam bang chuoi da duoc thay bang kieu that.
 */
const T6_CAPABILITIES: readonly CapabilityId[] = [
  'transport-asset-compliance',
  'transport-workforce',
];

const director = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'ADMIN',
});
const accountant = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'ACCOUNTING',
});
const driver = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'SALE',
});
const manager = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'MANAGER',
});
const unknownRole = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: null,
});

const idsOf = (input: NavigationInput): readonly string[] =>
  visibleSections(input).map((section) => section.id);

describe('nang luc toi thieu — chi bat transport-core', () => {
  it('experience nay chi doi transport-core, nen moi muc khac phai tu khai nang luc rieng', () => {
    expect(MINIMUM).toEqual(['transport-core']);
  });

  it('khach chi bat transport-core khong thay muc chi phi, nhien lieu hay quyet toan', () => {
    const visible = idsOf(director(MINIMUM));
    expect(visible).toContain('trips');
    expect(visible).toContain('fleet');
    expect(visible).not.toContain('driver-fund');
    expect(visible).not.toContain('fuel');
    expect(visible).not.toContain('settlement');
  });

  it('bat them costing va fuel thi dung hai muc do hien ra', () => {
    const visible = idsOf(director(['transport-core', 'transport-costing', 'transport-fuel']));
    expect(visible).toContain('driver-fund');
    expect(visible).toContain('fuel');
    expect(visible).not.toContain('settlement');
  });
});

describe('TX-06 / TX-07 — theo dung nang luc khach da bat, khong phai mot cho trong chet', () => {
  it('hai muc bao duong va luong an khi khach KHONG bat hai nang luc do', () => {
    // `FULL` co du bon nang luc van tai cu nhung KHONG co hai ma cua T6. Muc bi an — dung yeu cau
    // cua #161 §2: khong hien mot cho trong chet cho khach.
    for (const input of [director(), accountant(), unknownRole()]) {
      expect(idsOf(input)).not.toContain('maintenance');
      expect(idsOf(input)).not.toContain('payroll');
    }
    expect(canNavigateTo('maintenance', director())).toBe(false);
    expect(canNavigateTo('payroll', director())).toBe(false);
  });

  it('hai muc do hien khi khach bat ma nang luc T6 — khong phai sua dieu huong', () => {
    const visible = idsOf(director([...FULL, ...T6_CAPABILITIES]));
    expect(visible).toContain('maintenance');
    expect(visible).toContain('payroll');
  });

  it('moi muc doi DU bo nang luc cua no, khong chi mot ma', () => {
    // Bao duong doi `transport-core` + `transport-asset-compliance`. Bat mot minh ma T6 ma thieu
    // loi thi van phai an — neu khong, mot goi khach khai thieu se ra mot man hinh goi API 403.
    const onlyCompliance = idsOf(director(['transport-asset-compliance']));
    expect(onlyCompliance).not.toContain('maintenance');
    // Luong doi `transport-costing` + `transport-workforce`.
    const workforceWithoutCosting = idsOf(director(['transport-core', 'transport-workforce']));
    expect(workforceWithoutCosting).not.toContain('payroll');
  });

  it('man phieu luong cua lai xe cung theo dung mot cong do', () => {
    expect(visibleDriverScreens(driver()).map((screen) => screen.id)).not.toContain('payslip');
    expect(
      visibleDriverScreens({
        capabilities: [...FULL, ...T6_CAPABILITIES],
        role: 'SALE',
      }).map((screen) => screen.id),
    ).toContain('payslip');
  });
});

describe('loc theo vai — hau qua that cua cau bridge GD-22', () => {
  it('Giam doc thay moi muc van hanh khach da bat', () => {
    expect(idsOf(director())).toEqual([
      'overview',
      'trips',
      'fleet',
      'driver-fund',
      'fuel',
      'settlement',
      'margin',
      'ar-ap',
      'exports',
    ]);
  });

  it('Ke toan thay dung nhung muc do — ba quyen bi cat khong phai quyen DOC', () => {
    expect(idsOf(accountant())).toEqual(idsOf(director()));
  });

  it('Lai xe KHONG thay mot muc van hanh nao', () => {
    // `SALE` khong he co `transport.trip.read`; cat hanh dong la cong thu nhat, va quyen so huu
    // phan cong o may chu la cong thu hai.
    expect(idsOf(driver())).toEqual([]);
  });

  it('MANAGER khong thay gi — fail-closed, va man hinh phai noi that dieu do', () => {
    expect(idsOf(manager())).toEqual([]);
  });

  it('chua biet vai thi hien moi muc khach da bat, khong an bot', () => {
    expect(idsOf(unknownRole())).toEqual(idsOf(director()));
  });
});

describe('nhom tren thanh ben', () => {
  it('nhom rong bi bo han, khong de lai tieu de mo coi', () => {
    const groups = navigationGroups(director(MINIMUM));
    expect(groups.map((entry) => entry.group.id)).toEqual(['root', 'dispatch', 'reports']);
    for (const entry of groups) expect(entry.sections.length).toBeGreaterThan(0);
  });

  it('vai khong co pham vi thi khong con nhom nao', () => {
    expect(navigationGroups(manager())).toEqual([]);
  });
});

describe('moi muc phai khai du ba truc', () => {
  it('khong muc nao thieu hanh dong bat buoc hay nguon du lieu', () => {
    for (const section of TRANSPORT_SECTIONS) {
      expect(section.requiredAction.startsWith('transport.')).toBe(true);
      expect(['live', 'awaiting-api']).toContain(section.dataSource);
      expect(section.label.length).toBeGreaterThan(0);
    }
  });

  it('moi man cua lai xe deu doi mot hanh dong thuoc pham vi CUA CHINH MINH', () => {
    for (const screen of DRIVER_SCREENS) {
      expect(screen.requiredAction.startsWith('transport.driver.self.')).toBe(true);
    }
  });
});

describe('trang thai tren dia chi', () => {
  it('muc mac dinh giu dia chi sach', () => {
    expect(buildSectionUrl('overview')).toBe('/');
    expect(buildSectionUrl('trips')).toBe('/?section=trips');
    expect(buildSectionUrl('trips', 'VT-2026-0912')).toBe('/?section=trips&selected=VT-2026-0912');
  });

  it('be mat lai xe la mot dia chi rieng, khong phai mot nhanh theo vai', () => {
    expect(buildDriverUrl('home')).toBe('/?surface=driver');
    expect(buildDriverUrl('fuel')).toBe('/?surface=driver&screen=fuel');
  });

  it('dau trang cu hoac muc bi cam luon roi ve mac dinh, khong ra trang trang', () => {
    expect(resolveSection('khong-ton-tai', director())).toBe('overview');
    expect(resolveSection('settlement', director(MINIMUM))).toBe('overview');
    expect(resolveSection(null, director())).toBe('overview');
  });

  it('doc lai dung dia chi da dung — deep link song sot qua tai lai', () => {
    const parsed = parseNavigationFromSearch('?section=fuel&selected=VT-2026-0912', director());
    expect(parsed.surface).toBe('operations');
    expect(parsed.section).toBe('fuel');
    expect(parsed.selection).toBe('VT-2026-0912');
  });

  it('be mat lai xe khong mo duoc bang tay khi vai khong co pham vi do', () => {
    // Go tay `?surface=driver` voi mot vai van hanh phai roi ve be mat van hanh — #161 §8.
    expect(parseNavigationFromSearch('?surface=driver', director()).surface).toBe('operations');
    expect(parseNavigationFromSearch('?surface=driver', driver()).surface).toBe('driver');
  });

  it('tham so rong duoc coi la khong co', () => {
    const parsed = parseNavigationFromSearch('?section=trips&selected=', director());
    expect(parsed.selection).toBeNull();
  });

  it('doi muc thi BO lua chon — mot ma chuyen khong con nghia o man Nhien lieu', () => {
    const moved = resolveNavigation(
      { surface: null, section: 'fuel', screen: null, selection: 'VT-2026-0912' },
      { section: 'trips', screen: 'home' },
      director(),
    );
    expect(moved.section).toBe('fuel');
    expect(moved.selection).toBeNull();
  });

  it('o lai trong cung mot muc thi GIU lua chon', () => {
    const stayed = resolveNavigation(
      { surface: null, section: 'trips', screen: null, selection: 'VT-2026-0912' },
      { section: 'trips', screen: 'home' },
      director(),
    );
    expect(stayed.selection).toBe('VT-2026-0912');
  });

  it('giai quyet dia chi la TAT DINH — back/forward khong bao gio ra hai ket qua', () => {
    const once = parseNavigationFromSearch('?section=trips&selected=VT-2026-0912', director());
    const twice = parseNavigationFromSearch('?section=trips&selected=VT-2026-0912', director());
    expect(twice).toEqual(once);
    // Va dung ket qua do dung lai duoc chinh dia chi ban dau.
    const rebuilt = buildSectionUrl(once.section, once.selection).slice(1);
    expect(parseNavigationFromSearch(rebuilt, director())).toEqual(once);
  });
});
