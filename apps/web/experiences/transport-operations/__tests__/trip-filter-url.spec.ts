import { describe, expect, it } from 'vitest';
import {
  buildNavigationUrl,
  buildSectionUrl,
  EMPTY_TRIP_FILTER_QUERY,
  parseNavigationFromSearch,
  resolveNavigation,
  type NavigationInput,
} from '../navigation';
import { parseTripFilter, toTripFilterQuery } from '../workspace/trips';

/**
 * #222 P2 — BO LOC CHUYEN PHAI SONG SOT QUA TAI LAI / BACK / FORWARD.
 *
 * ==============================================================================================
 * TRIEU CHUNG DUOC DO O DAY
 *
 * `?section=trips&selected=UAT-VIET-01` giu duoc LUA CHON qua mot lan tai lai, nhung chu
 * `UAT-VIET-01` trong o tim kiem thi bien mat — vi bo loc nam trong `useState` cua man hinh. Khoi
 * chi tiet mo ra canh mot danh sach khong con loc theo gi ca: mot man hinh tu mau thuan voi chinh
 * no.
 *
 * Sau ban nay chi co MOT nguon su that — thanh dia chi — nen ba duong (tai lai, Back/Forward, dan
 * lien ket) deu cho cung mot ket qua.
 */

const FULL_ACCESS: NavigationInput = {
  capabilities: ['transport-core', 'transport-fuel', 'transport-costing'],
  role: 'ADMIN',
};

describe('#222 P2 §1 — tai lai khoi phuc CA bo loc lan lua chon', () => {
  it('dia chi mang `q`/`status`/`kind` doc lai ra dung bo loc do', () => {
    const resolved = parseNavigationFromSearch(
      '?section=trips&selected=UAT-VIET-01&q=UAT-VIET-01&status=IN_TRANSIT&kind=OWN_DIRECT',
      FULL_ACCESS,
    );

    expect(resolved.section).toBe('trips');
    expect(resolved.selection).toBe('UAT-VIET-01');
    expect(resolved.tripFilter).toEqual({
      search: 'UAT-VIET-01',
      status: 'IN_TRANSIT',
      kind: 'OWN_DIRECT',
    });
  });

  it('dia chi CU (chi co `selected`) van doc duoc — khong bo loc nao, khong loi nao', () => {
    const resolved = parseNavigationFromSearch('?section=trips&selected=UAT-VIET-01', FULL_ACCESS);

    expect(resolved.selection).toBe('UAT-VIET-01');
    expect(resolved.tripFilter).toEqual(EMPTY_TRIP_FILTER_QUERY);
  });
});

describe('#222 P2 §6 — dan lai dia chi cho ra DUNG mot man hinh', () => {
  /**
   * Vong tron day la ca hop dong: doc dia chi -> dung dia chi lai -> doc lai, phai ra cung mot ket
   * qua. Neu no khong dong, thi hai nguoi mo cung mot lien ket se thay hai man hinh khac nhau.
   */
  it('doc -> dung lai -> doc lai cho ra cung mot ket qua', () => {
    const search = '?section=trips&selected=UAT-VIET-01&q=UAT-VIET-01&status=IN_TRANSIT';
    const first = parseNavigationFromSearch(search, FULL_ACCESS);

    const rebuilt = buildNavigationUrl(first);
    const second = parseNavigationFromSearch(rebuilt.replace(/^\/\?/, '?'), FULL_ACCESS);

    expect(second).toEqual(first);
  });

  it('khong loc gi thi dia chi KHONG mang tham so rong', () => {
    const url = buildSectionUrl('trips', 'UAT-VIET-01', EMPTY_TRIP_FILTER_QUERY);
    expect(url).toBe('/?section=trips&selected=UAT-VIET-01');
    expect(url).not.toContain('q=');
  });

  it('dia chi mac dinh van la mot dia chi SACH', () => {
    expect(buildSectionUrl('overview', null, EMPTY_TRIP_FILTER_QUERY)).toBe('/');
  });
});

describe('#222 P2 §3 — bo loc chuyen KHONG ro sang man khac', () => {
  it('doi muc thi bo loc bi bo, cung luat voi lua chon', () => {
    const resolved = resolveNavigation(
      {
        surface: null,
        section: 'fuel',
        screen: null,
        selection: 'UAT-VIET-01',
        tripFilter: { search: 'UAT-VIET-01', status: 'IN_TRANSIT', kind: null },
      },
      { section: 'trips', screen: 'home' },
      FULL_ACCESS,
    );

    expect(resolved.section).toBe('fuel');
    expect(resolved.selection).toBeNull();
    expect(resolved.tripFilter).toEqual(EMPTY_TRIP_FILTER_QUERY);
  });

  it('mot dia chi go tay mang bo loc chuyen vao man Nhien lieu bi BO NGAY luc doc', () => {
    const resolved = parseNavigationFromSearch('?section=fuel&q=UAT-VIET-01', FULL_ACCESS);

    expect(resolved.section).toBe('fuel');
    expect(resolved.tripFilter).toEqual(EMPTY_TRIP_FILTER_QUERY);
  });

  it('be mat lai xe khong bao gio mang bo loc chuyen', () => {
    const resolved = parseNavigationFromSearch('?surface=driver&q=UAT-VIET-01', {
      capabilities: ['transport-core', 'transport-fuel'],
      role: 'SALE',
    });

    expect(resolved.surface).toBe('driver');
    expect(resolved.tripFilter).toEqual(EMPTY_TRIP_FILTER_QUERY);
    expect(buildNavigationUrl(resolved)).not.toContain('q=');
  });
});

describe('#222 P2 §4 — gia tri hong roi ve mac dinh, KHONG thanh trang loi', () => {
  it('ma trang thai / loai chuyen khong ton tai -> `ALL`', () => {
    const filter = parseTripFilter({
      search: 'ha noi',
      status: 'BAY-GIO',
      kind: 'KHONG-CO-THAT',
    });

    expect(filter).toEqual({ search: 'ha noi', status: 'ALL', kind: 'ALL' });
  });

  it('thieu han tham so cung ra dung mot ket qua', () => {
    expect(parseTripFilter(EMPTY_TRIP_FILTER_QUERY)).toEqual({
      search: '',
      status: 'ALL',
      kind: 'ALL',
    });
  });

  it('gia tri hop le van di qua nguyen ven', () => {
    expect(
      parseTripFilter({ search: null, status: 'DELIVERED', kind: 'EXTERNAL_CARRIER' }),
    ).toEqual({ search: '', status: 'DELIVERED', kind: 'EXTERNAL_CARRIER' });
  });
});

describe('#222 P2 §5 — dia chi KHONG mang dinh danh ky thuat', () => {
  it('`selected` la MA CHUYEN, va bo loc chi mang chu + ma nghiep vu', () => {
    const url = buildSectionUrl('trips', 'UAT-VIET-01', {
      search: 'UAT-VIET-01',
      status: 'IN_TRANSIT',
      kind: 'OWN_DIRECT',
    });

    // Khong mot chuoi nao trong dia chi co hinh dang cua mot UUID cua CSDL.
    expect(url).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(url).toContain('selected=UAT-VIET-01');
    expect(url).toContain('status=IN_TRANSIT');
  });
});

describe('#222 P2 — vong doi giua hai dang bo loc', () => {
  it('bo loc co kieu -> dia chi -> bo loc co kieu la mot vong dong', () => {
    const original = { search: 'thai nguyen', status: 'PLANNED', kind: 'OWN_DIRECT' } as const;
    expect(toTripFilterQuery(parseTripFilter(original))).toEqual(original);
  });

  it('`ALL` va chuoi rong deu KHONG len dia chi', () => {
    expect(toTripFilterQuery({ search: '   ', status: 'ALL', kind: 'ALL' })).toEqual(
      EMPTY_TRIP_FILTER_QUERY,
    );
  });
});
