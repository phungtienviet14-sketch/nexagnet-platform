import { EXPERIENCE_REQUIREMENTS, type CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import {
  buildDriverUrl,
  buildSectionUrl,
  canNavigateTo,
  DRIVER_SCREENS,
  filterNavigationGroups,
  navigationGroups,
  parseNavigationFromSearch,
  resolveNavigation,
  resolveSection,
  SUPERSEDED_HEADING,
  supersededEntries,
  supersededNote,
  TRANSPORT_SECTIONS,
  visibleDriverScreens,
  visibleSections,
  type NavigationInput,
  type TransportSection,
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

const FIRST_UAT: readonly CapabilityId[] = [...FULL, 'transport-toll'];

/**
 * Hai ma cua T6 — CO THAT trong `CapabilityId` tu khi PR #152 vao `main`. Truoc day bo test nay
 * phai `as unknown as` de dien lai mot tinh huong tuong lai; nay khong con phai, va do chinh la
 * y nghia cua §4.2 trong #180: cho tam bang chuoi da duoc thay bang kieu that.
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
    expect(visible).toContain('movement');
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

describe('Lane W — first UAT scope', () => {
  it('keeps ETC outside the owner navigation even when the preview capability remains enabled', () => {
    expect(
      idsOf({
        ...director(FIRST_UAT),
        blockedCapabilityKeys: ['transport-toll'],
      }),
    ).not.toContain('toll');
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
      // #339 — nhom DIEU HANH doc theo mot ngay lam viec, va `trips` KHONG con o day: no da xuong
      // loi phu "Cach lam truoc day". Khoi `#339` ben duoi khoa phan do.
      'movement',
      'control-tower',
      'dispatch',
      'fleet',
      'driver-fund',
      'expense-claims',
      'fuel',
      'settlement',
      // `TX-08` (#242) — so dang ky so huu chi doi `transport-core`, nen no co mat voi MOI khach
      // bat van tai, khong nhu `maintenance`/`payroll` doi them capability rieng. Quyen so huu la
      // mot su that ve chinh chiec xe, khong phai mot lop nghiep vu ban them.
      'asset-ownership',
      'finance',
      'executive',
      'fleet-dashboard',
      'routes',
      'journey',
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
    // `assets` khong con rong tu `TX-08`: so dang ky so huu chi doi `transport-core`, nen ke ca goi
    // toi thieu cung co mot muc trong nhom nay.
    expect(groups.map((entry) => entry.group.id)).toEqual([
      'root',
      'dispatch',
      'assets',
      'reports',
    ]);
    for (const entry of groups) expect(entry.sections.length).toBeGreaterThan(0);
  });

  it('vai khong co pham vi thi khong con nhom nao', () => {
    expect(navigationGroups(manager())).toEqual([]);
  });
});

describe('moi muc phai khai du hai truc', () => {
  /**
   * TRUOC DAY co mot truc thu ba, `dataSource`, phan biet muc DA CO duong du lieu voi muc chua co.
   * T7D (#170) noi het cac duong con thieu, nen truc do khong con phan biet duoc gi — moi muc deu
   * `live`. Mot truc chi con MOT gia tri khong phai mot truc; giu lai se lam nguoi doc tuong con
   * mot muc nao do chua chay.
   */
  it('khong muc nao thieu hanh dong bat buoc hay nhan', () => {
    for (const section of TRANSPORT_SECTIONS) {
      expect(section.requiredAction.startsWith('transport.')).toBe(true);
      expect(section.label.length).toBeGreaterThan(0);
    }
  });

  /**
   * HAI MUC KHONG DUOC TRUNG NHAN — va day la mot loi DA XAY RA, khong phai mot lo xa.
   *
   * `control-tower` va `executive` tung cung mang nhan `Bảng điều hành`. Voi vai Giam doc ca hai
   * deu hien, va chung nam o hai nhom khac nhau tren CUNG mot thanh ben: nguoi dung thay hai dong
   * chu giong het nhau va khong co cach nao doan duoc bam cai nao dan toi dau.
   *
   * Bai nay do TOAN BO danh muc chu khong rieng hai muc do, vi cai can chan la HANH VI them mot
   * muc trung ten — mot viec de lam nham khi danh muc da co 23 muc va nguoi them chi nhin mot nhom.
   */
  it('khong hai muc nao mang cung mot nhan', () => {
    const seen = new Map<string, string>();
    for (const section of TRANSPORT_SECTIONS) {
      const existing = seen.get(section.label);
      expect(
        existing,
        `Nhan "${section.label}" bi dung cho ca "${existing}" lan "${section.id}". Hai muc tren` +
          ' cung mot thanh ben ma cung ten thi nguoi dung khong doan duoc bam cai nao.',
      ).toBeUndefined();
      seen.set(section.label, section.id);
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

/**
 * `#275` K3/K4 — MUC `Ket thuc don` chi mo ra cho dung hai vai, va chi khi khach BAT nang luc do.
 *
 * Hai truc long nhau, va bai nay do CA HAI. Truc quyen la thu quan trong hon: `#275` K8 bai 1 doi
 * *"Driver direct POST => denied"*, va cong that nam o may chu — nhung mot muc hien ra cho lai xe
 * roi bao loi khi bam la mot man hinh noi doi ve dieu ho duoc lam.
 */
describe('#275 K4 — muc Ket thuc don', () => {
  const WITH_ACCEPTANCE: readonly CapabilityId[] = [...FULL, 'transport-acceptance'];

  it('khong hien khi khach CHUA bat transport-acceptance', () => {
    expect(idsOf(director())).not.toContain('order-completion');
  });

  it('Giam doc va Ke toan deu thay khi khach da bat', () => {
    expect(idsOf(director(WITH_ACCEPTANCE))).toContain('order-completion');
    expect(idsOf(accountant(WITH_ACCEPTANCE))).toContain('order-completion');
  });

  it('LAI XE khong thay, ke ca khi khach da bat', () => {
    expect(idsOf(driver(WITH_ACCEPTANCE))).not.toContain('order-completion');
  });

  it('MANAGER khong thay — fail-closed', () => {
    expect(idsOf(manager(WITH_ACCEPTANCE))).not.toContain('order-completion');
  });

  it('nam trong nhom CHI PHI & DOI SOAT, canh duyet chi va quyet toan', () => {
    const section = TRANSPORT_SECTIONS.find((entry) => entry.id === 'order-completion');
    expect(section?.group).toBe('cost');
    expect(section?.requiredAction).toBe('transport.commercial_acceptance.read');
    expect(section?.requiredCapabilities).toEqual(['transport-acceptance']);
  });
});

/**
 * ====================================================================================================
 * O LOC DANH MUC
 * ====================================================================================================
 *
 * Voi vai Giam doc, thanh ben co 23 muc trong bon nhom — mot cot chu cao gan het man hinh 1440px,
 * khong icon, khong so dem. O loc doi viec "doc het 23 dong" thanh "go hai chu".
 *
 * Hai luat duoi la luat AN TOAN chu khong phai luat tien nghi, nen chung nam o day chu khong o mot
 * bai E2E: mot o loc an nham mot muc trong y het mot lan mat quyen, va do la ket luan dat nhat
 * nguoi dung co the rut ra.
 */
describe('loc danh muc theo chu go vao', () => {
  const groups = navigationGroups(director(FULL));

  it('chuoi rong tra ve NGUYEN danh sach — o loc la loi tat, khong phai mot cong', () => {
    expect(filterNavigationGroups(groups, '')).toBe(groups);
    expect(filterNavigationGroups(groups, '   ')).toBe(groups);
  });

  it('go khong dau van tim ra nhan co dau', () => {
    const found = filterNavigationGroups(groups, 'doi xe').flatMap((entry) =>
      entry.sections.map((section) => section.id),
    );
    expect(found).toContain('fleet');
  });

  /**
   * `Đ`/`đ` (U+0110/U+0111) la chu RIENG, khong phai `D` co dau, nen `normalize('NFD')` KHONG tach
   * no ra. Bo qua dieu nay thi go "don hang" khong bao gio tim ra "Đơn hàng & vòng chạy" — va danh
   * muc van tai day chu do: Đơn hàng, Đội xe, Điều xe, Đối soát.
   */
  it('`Đ` la chu rieng, nen "don hang" phai tim ra "Đơn hàng & vòng chạy"', () => {
    const found = filterNavigationGroups(groups, 'don hang').flatMap((entry) =>
      entry.sections.map((section) => section.id),
    );
    expect(found).toContain('movement');
  });

  /**
   * Loc theo NHAN, khong theo `id`. `id` la ma ky thuat (`driver-fund`, `ar-ap`) va nguoi dung
   * khong nhin thay no o dau ca; go dung chu minh DOC DUOC tren man hinh phai ra ket qua.
   */
  it('loc theo nhan chu khong theo ma ky thuat', () => {
    const byLabel = filterNavigationGroups(groups, 'quỹ').flatMap((entry) =>
      entry.sections.map((section) => section.id),
    );
    expect(byLabel).toContain('driver-fund');

    expect(filterNavigationGroups(groups, 'driver-fund')).toEqual([]);
  });

  it('nhom khong con muc nao bi bo han — khong de lai tieu de mo coi', () => {
    for (const entry of filterNavigationGroups(groups, 'nhien lieu')) {
      expect(entry.sections.length).toBeGreaterThan(0);
    }
  });

  it('khong khop gi thi tra ve rong, de vo noi ro thay vi ve mot cot trang', () => {
    expect(filterNavigationGroups(groups, 'khong-co-muc-nao-ten-the-nay')).toEqual([]);
  });
});

/**
 * ====================================================================================================
 * #339 — DON HANG & VONG CHAY LA DUONG CHINH, CHUYEN XE KHONG CON CANH TRANH
 * ====================================================================================================
 *
 * First-UAT cho thay hai muc `Chuyến xe` (TransportTrip, the he truoc) va `Đơn hàng & vòng chạy`
 * (Order → VehicleRun) dung canh nhau lam nguoi dung bat dau sai luong. Bon dieu duoc khoa o day:
 *
 *   1. danh muc chinh khong con HAI duong canh tranh, voi moi vai co pham vi van hanh;
 *   2. dia chi cu toi `Chuyến xe` van mo DUNG man do khi du quyen, va roi co chu dich khi khong;
 *   3. doi nhom danh muc khong cap them, cung khong tuoc mat, mot muc nao;
 *   4. quy tac la mot hop dong tren HAI muc (`supersededBy`), khong phai mot cau so vai.
 */
describe('#339 — danh muc chinh bat dau tu Don hang, Chuyen xe chi con o loi phu', () => {
  const WITH_ACCEPTANCE: readonly CapabilityId[] = [...FULL, 'transport-acceptance'];
  const primaryIds = (input: NavigationInput): readonly string[] => idsOf(input);
  const olderIds = (input: NavigationInput): readonly string[] =>
    supersededEntries(input).map((entry) => entry.section.id);
  const reachableIds = (input: NavigationInput): readonly string[] =>
    TRANSPORT_SECTIONS.filter((section) => canNavigateTo(section.id, input)).map(
      (section) => section.id,
    );

  describe('acceptance 1 — khong con hai duong canh tranh tren danh muc chinh', () => {
    it.each([
      ['ADMIN', director()],
      ['ADMIN + ket thuc don', director(WITH_ACCEPTANCE)],
      ['ACCOUNTING', accountant()],
      ['vai chua biet', unknownRole()],
      ['goi toi thieu', director(MINIMUM)],
    ])('%s: co `Đơn hàng & vòng chạy`, khong co `Chuyến xe`', (_name, input) => {
      expect(primaryIds(input)).toContain('movement');
      expect(primaryIds(input)).not.toContain('trips');
    });

    it('MANAGER van fail-closed: khong muc chinh, khong loi phu — #339 KHONG bia quyen cho MANAGER', () => {
      expect(primaryIds(manager())).toEqual([]);
      expect(olderIds(manager())).toEqual([]);
    });

    it('nhom DIEU HANH doc theo mot ngay lam viec: don → toan canh → chon xe → doi xe', () => {
      const dispatch = navigationGroups(director()).find((entry) => entry.group.id === 'dispatch');
      expect(dispatch?.sections.map((section) => section.id)).toEqual([
        'movement',
        'control-tower',
        'dispatch',
        'fleet',
      ]);
    });

    it('`Chuyến xe` xuong loi phu, kem cau chi duong bang NHAN cua muc moi', () => {
      const entries = supersededEntries(director());
      expect(entries.map((entry) => [entry.section.id, entry.successor.id])).toEqual([
        ['trips', 'movement'],
      ]);
      expect(supersededNote(entries[0]!)).toBe('Việc mới bắt đầu ở “Đơn hàng & vòng chạy”.');
    });

    /**
     * Chu tren man hinh la chu cua nguoi van hanh. `legacy`, `TransportTrip`, `v1` la chu cua kien
     * truc may chu — dung dieu #339 cam dua ra giao dien.
     */
    it('tieu de va cau chi duong khong dung mot chu ky thuat nao', () => {
      const shown = [SUPERSEDED_HEADING, ...supersededEntries(director()).map(supersededNote)]
        .join(' ')
        .toLowerCase();
      for (const jargon of ['legacy', 'transporttrip', 'trip', 'run', 'v1', 'v2', 'deprecated']) {
        expect(shown, jargon).not.toMatch(new RegExp(`\\b${jargon}\\b`));
      }
    });
  });

  describe('acceptance 2 — `Đơn hàng & vòng chạy` van theo dung hai truc quyen', () => {
    it('can `transport-core`: goi khach khong bat thi khong co muc do', () => {
      expect(canNavigateTo('movement', director([]))).toBe(false);
      expect(primaryIds(director([]))).not.toContain('movement');
    });

    it('lai xe va MANAGER khong thay, ke ca khi khach bat du', () => {
      expect(primaryIds(driver(WITH_ACCEPTANCE))).not.toContain('movement');
      expect(primaryIds(manager(WITH_ACCEPTANCE))).not.toContain('movement');
    });

    it('van doi `transport.run.read` — #339 khong doi truc quyen cua muc nay', () => {
      const movement = TRANSPORT_SECTIONS.find((section) => section.id === 'movement');
      expect(movement?.requiredAction).toBe('transport.run.read');
      expect(movement?.requiredCapabilities).toEqual(['transport-core']);
    });
  });

  describe('acceptance 3 — dia chi cu toi Chuyen xe mo co chu dich, khong ra trang trang', () => {
    const LEGACY_LINK = '?section=trips&selected=VT-2026-0912&q=VT-2026-0912&status=IN_TRANSIT';

    it.each([
      ['ADMIN', director()],
      ['ACCOUNTING', accountant()],
      ['vai chua biet', unknownRole()],
    ])('%s: mo DUNG man Chuyen xe, giu ca lua chon lan bo loc', (_name, input) => {
      const parsed = parseNavigationFromSearch(LEGACY_LINK, input);
      expect(parsed.surface).toBe('operations');
      expect(parsed.section).toBe('trips');
      expect(parsed.selection).toBe('VT-2026-0912');
      expect(parsed.tripFilter).toEqual({
        search: 'VT-2026-0912',
        status: 'IN_TRANSIT',
        kind: null,
      });
    });

    it.each([
      ['MANAGER', manager()],
      ['lai xe', driver()],
      ['khach khong bat transport-core', director([])],
    ])('%s: roi ve Tong quan, va bo loc chuyen khong theo sang', (_name, input) => {
      const parsed = parseNavigationFromSearch(LEGACY_LINK, input);
      expect(parsed.surface).toBe('operations');
      expect(parsed.section).toBe('overview');
      expect(parsed.tripFilter).toEqual({ search: null, status: null, kind: null });
    });

    it('dia chi dung lai tu ket qua van la dia chi cu — tai lai/back/forward khong doi nghia', () => {
      const once = parseNavigationFromSearch(LEGACY_LINK, director());
      expect(buildSectionUrl(once.section, once.selection, once.tripFilter)).toBe(
        '/?section=trips&selected=VT-2026-0912&q=VT-2026-0912&status=IN_TRANSIT',
      );
      const rebuilt = buildSectionUrl(once.section, once.selection, once.tripFilter).slice(1);
      expect(parseNavigationFromSearch(rebuilt, director())).toEqual(once);
    });
  });

  describe('acceptance 4 — doi nhom khong cap them, khong tuoc mat', () => {
    it.each([
      ['ADMIN', director()],
      ['ADMIN + T6 + ket thuc don', director([...WITH_ACCEPTANCE, ...T6_CAPABILITIES])],
      ['ACCOUNTING', accountant()],
      ['ACCOUNTING + ket thuc don', accountant(WITH_ACCEPTANCE)],
      ['MANAGER', manager()],
      ['lai xe', driver()],
      ['vai chua biet', unknownRole()],
      ['goi toi thieu', director(MINIMUM)],
      ['First-UAT chan ETC', { ...director(FIRST_UAT), blockedCapabilityKeys: ['transport-toll'] }],
    ])('%s: danh muc chinh + loi phu = DUNG tap muc mo duoc, va khong trung', (_name, input) => {
      const primary = primaryIds(input);
      const older = olderIds(input);
      expect([...primary, ...older].sort()).toEqual([...reachableIds(input)].sort());
      expect(primary.filter((id) => older.includes(id))).toEqual([]);
    });

    it('ACCOUNTING khong regress: van thay dung tap muc cua Giam doc, tren ca hai loi', () => {
      expect(primaryIds(accountant(WITH_ACCEPTANCE))).toEqual(
        primaryIds(director(WITH_ACCEPTANCE)),
      );
      expect(olderIds(accountant())).toEqual(['trips']);
    });
  });

  describe('hop dong `supersededBy` — mot quy tac tren hai muc, khong phai mot cau so vai', () => {
    it('moi `supersededBy` tro vao mot muc CO THAT, khac chinh no, va khong tu no bi thay', () => {
      const sections: readonly TransportSection[] = TRANSPORT_SECTIONS;
      for (const section of sections) {
        if (section.supersededBy === undefined) continue;
        const successor = sections.find((entry) => entry.id === section.supersededBy);
        expect(successor, section.id).toBeDefined();
        expect(successor?.id).not.toBe(section.id);
        // Khong co chuoi thay the: loi phu chi dan mot buoc toi muc chinh, khong dan toi mot muc
        // cu khac.
        expect(successor?.supersededBy, section.id).toBeUndefined();
      }
    });

    it('`Chuyến xe` giu nguyen hai truc quyen — rut khoi danh muc khong doi ai duoc mo no', () => {
      const trips = TRANSPORT_SECTIONS.find((section) => section.id === 'trips');
      expect(trips?.requiredAction).toBe('transport.trip.read');
      expect(trips?.requiredCapabilities).toEqual(['transport-core']);
      expect(canNavigateTo('trips', director())).toBe(true);
      expect(canNavigateTo('trips', accountant())).toBe(true);
    });
  });

  describe('acceptance 5 — o Loc danh muc van chay, va khong keo muc cu len lai', () => {
    const groups = navigationGroups(director());

    it('go "chuyen xe" KHONG dua `Chuyến xe` len canh don hang', () => {
      expect(filterNavigationGroups(groups, 'chuyen xe')).toEqual([]);
    });

    it('go "don hang" van tim ra muc chinh', () => {
      const found = filterNavigationGroups(groups, 'don hang').flatMap((entry) =>
        entry.sections.map((section) => section.id),
      );
      expect(found).toEqual(['movement']);
    });

    it('danh muc Giam doc van du dai de o loc hien ra (nguong 12 cua vo)', () => {
      const total = groups.reduce((sum, entry) => sum + entry.sections.length, 0);
      expect(total).toBeGreaterThanOrEqual(12);
    });
  });
});
