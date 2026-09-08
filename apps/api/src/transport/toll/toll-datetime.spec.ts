import { describe, expect, it } from 'vitest';
import { parseTollPassedAt } from './toll-datetime.js';

const HCM = 'Asia/Ho_Chi_Minh';

describe('doc khoanh khac xe qua tram', () => {
  it('doc dang ISO co mui gio, giu nguyen khoanh khac', () => {
    expect(parseTollPassedAt('2026-08-31T16:40:00Z', HCM)?.toISOString()).toBe(
      '2026-08-31T16:40:00.000Z',
    );
    expect(parseTollPassedAt('2026-08-31T23:40:00+07:00', HCM)?.toISOString()).toBe(
      '2026-08-31T16:40:00.000Z',
    );
  });

  /**
   * ===========================================================================
   * GIO KHONG MANG MUI — VA DAY LA CHO SAI TON KEM NHAT CUA CA MIEN NAY.
   *
   * Mot sao ke Viet Nam viet `31/08/2026 23:40` va khong noi mui gio nao. Doc no bang gio UTC se
   * ra `2026-08-31T23:40Z`, tuc 06:40 sang 01/09 gio Viet Nam — sang THANG SAU. `business-date.ts`
   * ton tai vi dung loi do, va no chi lo ra o vai dong quanh nua dem cuoi thang.
   */
  it('gio khong mang mui duoc doc theo mui gio TENANT, khong theo UTC', () => {
    expect(parseTollPassedAt('31/08/2026 23:40', HCM)?.toISOString()).toBe(
      '2026-08-31T16:40:00.000Z',
    );
    expect(parseTollPassedAt('2026-08-31 23:40:15', HCM)?.toISOString()).toBe(
      '2026-08-31T16:40:15.000Z',
    );
  });

  it('cung mot khoanh khac doc o hai mui gio cho ra hai ket qua khac nhau', () => {
    expect(parseTollPassedAt('31/08/2026 23:40', 'UTC')?.toISOString()).toBe(
      '2026-08-31T23:40:00.000Z',
    );
  });

  it('tu choi thay vi doan khi khong doc duoc', () => {
    expect(parseTollPassedAt('', HCM)).toBeNull();
    expect(parseTollPassedAt('hom qua', HCM)).toBeNull();
    expect(parseTollPassedAt('31/02/2026 10:00', HCM)).toBeNull();
    expect(parseTollPassedAt('31/08/2026 25:00', HCM)).toBeNull();
  });

  it('chi co ngay ma khong co gio thi van doc duoc, lay 00:00 gio tenant', () => {
    expect(parseTollPassedAt('31/08/2026', HCM)?.toISOString()).toBe('2026-08-30T17:00:00.000Z');
  });
});
