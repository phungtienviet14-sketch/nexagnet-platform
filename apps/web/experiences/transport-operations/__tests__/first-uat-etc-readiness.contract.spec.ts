import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { visibleSections, type NavigationInput } from '../navigation';

/**
 * HAI GOI KHACH, HAI CAU HOI KHAC NHAU — va bo test nay khoa ca hai dau lai.
 *
 * Lane W dua `transport-toll` vao `readiness.blockedCapabilities` cua `tenants/transport-preview`:
 * dot UAT dau tien cua chu so huu CO Y khong co ETC. Muc dieu huong bi an, va do la dung.
 *
 * Nhung ETC van la mot tinh nang da co, va no van phai duoc chung minh. Nen bo E2E cua ETC chay
 * tren mot goi RIENG — `apps/web/e2e/fixtures/tenant-transport-toll` — khai ro ETC duoc bat va
 * khong bi chan gi.
 *
 * Hai goi do la HAI SU THAT phai giu nguyen huong, va ca hai deu de troi trong im lang:
 *
 *  - Ai do bo `transport-toll` khoi danh sach chan cua ban xem truoc ⇒ ETC hien tro lai trong dot
 *    UAT dau tien, trai voi quyet dinh cua chu. Khong mot bo test nao khac keu, vi mot muc dieu
 *    huong HIEN RA khong lam bai nao do.
 *  - Ai do them mot muc vao danh sach chan cua goi fixture (hoac bo `transport-toll` khoi
 *    `capabilities`) ⇒ bo ETC im lang mat cho dua, dung kieu hong da xay ra that o PR #326.
 *
 * Cho re nhat de bat ca hai la o day: vai giay cua `vitest`, khong phai muoi hai phut cua mot may
 * chu Playwright.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '../../..');
const repoRoot = resolve(webDir, '../..');

interface ReadinessPack {
  readonly slug: string;
  readonly experience: string;
  readonly capabilities: readonly string[];
  readonly policies: {
    readonly transportCore?: { readonly timeZone?: string };
    readonly readiness: {
      readonly blockedCapabilities: readonly { readonly key: string }[];
    };
  };
}

const readPack = (dir: string): ReadinessPack =>
  JSON.parse(readFileSync(join(dir, 'tenant.json'), 'utf8')) as ReadinessPack;

/** Goi khach SE DUOC TRIEN KHAI cho dot UAT dau tien — khong phai mot fixture. */
const OWNER_PREVIEW_DIR = join(repoRoot, 'tenants', 'transport-preview');
/** Goi khach kiem thu ma bo E2E cua ETC boot len (`playwright.transport-toll.config.ts`). */
const ETC_FIXTURE_DIR = join(webDir, 'e2e', 'fixtures', 'tenant-transport-toll');

const blockedKeys = (pack: ReadinessPack): readonly string[] =>
  pack.policies.readiness.blockedCapabilities.map(({ key }) => key);

describe('first UAT: ETC bi an o ban xem truoc cua chu', () => {
  const preview = readPack(OWNER_PREVIEW_DIR);

  it('goi `transport-preview` VAN khai `transport-toll` la bi chan', () => {
    expect(blockedKeys(preview)).toContain('transport-toll');
  });

  it('muc ETC that su BIEN MAT khoi dieu huong cua goi do, khong chi bi lam mo', () => {
    const input: NavigationInput = {
      capabilities: preview.capabilities as NavigationInput['capabilities'],
      role: 'ADMIN',
      blockedCapabilityKeys: blockedKeys(preview),
    };
    const visible = visibleSections(input).map((section) => section.id);
    expect(visible).not.toContain('toll');
  });
});

describe('bo E2E cua ETC chay tren mot goi BAT ETC', () => {
  const preview = readPack(OWNER_PREVIEW_DIR);
  const fixture = readPack(ETC_FIXTURE_DIR);

  it('goi fixture khai `transport-toll` va KHONG chan nghiep vu nao', () => {
    expect(fixture.capabilities).toContain('transport-toll');
    expect(blockedKeys(fixture)).toEqual([]);
  });

  it('muc ETC HIEN RA o goi do — neu khong, `openToll()` se lai chet ma khong ai biet vi sao', () => {
    const input: NavigationInput = {
      capabilities: fixture.capabilities as NavigationInput['capabilities'],
      role: 'ADMIN',
      blockedCapabilityKeys: blockedKeys(fixture),
    };
    const visible = visibleSections(input).map((section) => section.id);
    expect(visible).toContain('toll');
  });

  /**
   * Goi fixture phai bat DU nang luc cua ban xem truoc. Neu khong, bo ETC se chay tren mot be mat
   * NGHEO HON cai chu se thay, va mot muc dieu huong lang gieng bien mat co the lam doi vi tri /
   * y nghia cua chinh man hinh ETC ma khong bai nao keu.
   */
  it('goi fixture bat it nhat moi nang luc ban xem truoc bat', () => {
    expect([...fixture.capabilities].sort()).toEqual(
      expect.arrayContaining([...preview.capabilities].sort()),
    );
  });

  it('cung experience va cung lich nghiep vu voi ban xem truoc', () => {
    expect(fixture.experience).toBe(preview.experience);
    // `transportCore.timeZone` la CHINH SACH DUY NHAT di qua ranh gioi server -> trinh duyet
    // (`toPublicTenantDescriptor`), nen no la thu duy nhat phai trung — khong phai ca khoi
    // `policies`, thu se bat bo ETC di theo moi lan chu doi mot nguong ben API.
    expect(fixture.policies.transportCore?.timeZone).toBe(preview.policies.transportCore?.timeZone);
  });
});
