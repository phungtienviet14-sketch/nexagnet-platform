import { defineConfig, devices } from '@playwright/test';

/**
 * E2E PWA cua ung dung di dong (#398) — Chromium, man hinh dien thoai, API THAT + Postgres THAT.
 *
 * Dieu kien truoc (job `mobile-pwa-e2e` cua .github/workflows/mobile.yml lam dung thu tu nay):
 *   1. API chay o `E2E_API_URL` (mac dinh http://127.0.0.1:3001), `AUTH_MODE=session`, Postgres da gieo
 *      bang `deploy/netviet/seed-transport-demo.mjs`;
 *   2. `tools/mobile-smoke/prepare.mjs` da chay, ghi JSON ra `E2E_FIXTURE`;
 *   3. `pnpm --filter @nexagnet/transport-mobile export:web` da xuat `dist-web`.
 *
 * `webServer` chi dung may chu PWA (tep tinh + chuyen tiep API cung origin, `e2e/pwa-server.mjs`).
 * Service worker bi CHAN: bai nay kiem nghiep vu, khong kiem bo nho dem cua trinh duyet.
 */
const PORT = Number(process.env.E2E_PWA_PORT ?? 8098);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.pwa\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: 'block',
    screenshot: 'on',
    trace: 'retain-on-failure',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
  projects: [{ name: 'pwa-chromium-mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'node e2e/pwa-server.mjs',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 30_000,
    env: {
      PWA_ROOT: 'dist-web',
      API_UPSTREAM: process.env.E2E_API_URL ?? 'http://127.0.0.1:3001',
      PORT: String(PORT),
    },
  },
});
