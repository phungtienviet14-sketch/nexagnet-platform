import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * Be mat VAN HANH VAN TAI — mot cau hinh rieng, va do la HE QUA cua rang buoc mot-khach-mot-may-chu
 * da ghi o `playwright.config.ts`.
 *
 * Mot khach chi khai duoc MOT experience (`PG-01`), nen khong the vua boot `b2b-sales-operations`
 * vua boot `transport-operations` tren cung mot may chu. Va hai `next dev` trong cung thu muc du an
 * ghi de len nhau o `.next`. Nen: hai cau hinh, hai cong, chay TUAN TU — `test:e2e` noi hai lenh
 * bang `&&`, khong bao gio chay chung cung luc.
 *
 * Cong 3011 de khong dung vao 3010 (b2b), 3002 (`dev-transport.mjs`) hay 3000 (`dev`).
 */
const TRANSPORT_TENANT_DIR = resolve(__dirname, 'e2e/fixtures/tenant-transport');

export default defineConfig({
  testDir: './e2e/transport',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3011',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm exec next dev -p 3011',
    url: 'http://127.0.0.1:3011/',
    reuseExistingServer: false,
    timeout: 120_000,
    // `NEXT_PUBLIC_API_URL=''` lam moi loi goi API thanh duong TUONG DOI, nen `page.route` chan duoc.
    env: { ...process.env, TENANT_DIR: TRANSPORT_TENANT_DIR, NEXT_PUBLIC_API_URL: '' },
  },
});
