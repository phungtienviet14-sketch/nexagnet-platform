import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NARROW_SECTIONS,
  TARGET_SECTIONS,
  mockSettingsSurfaces,
} from './fixtures/settings-mocks';

/**
 * So anh chup cua `/settings` — bang chung thi giac cho #146/#147, KHONG phai mot cong CI.
 *
 * Bo nay chi chay khi `SETTINGS_SHOTS=1`, va ghi vao `test-results/` (da nam trong `.gitignore`).
 * Ly do khong de no chay mac dinh: cong `e2e` cua CI phai kiem HANH VI, mot bo anh chup se lam cong
 * do cham hon ma khong them mot khang dinh nao. Cac khang dinh that nam o `settings-focus.spec.ts`.
 *
 * `SHOTS_DIR` tach anh TRUOC va SAU khi sua vao hai thu muc, de doi chieu duoc tung muc mot.
 */

const ENABLED = process.env.SETTINGS_SHOTS === '1';
const OUT_DIR = resolve(
  __dirname,
  '..',
  'test-results',
  'shots',
  process.env.SHOTS_DIR ?? 'before',
);

test.describe('So anh chup cac muc cai dat', () => {
  test.skip(!ENABLED, 'Chi chay khi SETTINGS_SHOTS=1 — khong lam cham cong e2e cua CI.');
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
  });

  async function shoot(page: Page, section: string, label: string): Promise<void> {
    await page.goto(`/settings?section=${section}`);
    // Doi tieu de trang thay vi doi mang: `networkidle` khong bao gio den vi React Query co
    // `refetchInterval`, con tieu de thi chi hien khi shell da render xong.
    await page.getByRole('heading', { level: 1, name: /Thiết lập/ }).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(OUT_DIR, `${label}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

  for (const section of TARGET_SECTIONS) {
    test(`desktop · ${section}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mockSettingsSurfaces(page, { role: 'ADMIN' });
      await shoot(page, section, `desktop-${section}`);
    });
  }

  for (const section of NARROW_SECTIONS) {
    test(`hep 768 · ${section}`, async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1000 });
      await mockSettingsSurfaces(page, { role: 'ADMIN' });
      await shoot(page, section, `w768-${section}`);
    });

    test(`hep 375 · ${section}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await mockSettingsSurfaces(page, { role: 'ADMIN' });
      await shoot(page, section, `w375-${section}`);
    });
  }

  test('desktop · products-pricing (chung minh #144 khong bi keo theo)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await shoot(page, 'products-pricing', 'desktop-products-pricing');
  });
});
