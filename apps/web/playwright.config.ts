import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * MOT may chu, MOT goi khach — va do la mot rang buoc, khong phai mot lua chon.
 *
 * Hai `next dev` trong cung mot thu muc du an cung bien dich vao `apps/web/.next` va ghi de len
 * nhau; ep chung ra hai `distDir` rieng thi Next lai VIET LAI `tsconfig.json` va `next-env.d.ts`
 * (hai tep duoc theo doi trong git) va do them thu muc sinh ra vao tam quet cua ESLint. Ca hai gia
 * do deu dat hon thu thu duoc.
 *
 * Nen goi khach o day khai `b2b-sales-operations`: do la be mat U-UI0 phai chung minh. Bo
 * `settings.spec.ts` van chay dung nhu cu tren cung goi nay — man hinh `/settings` dung theo NANG
 * LUC chu khong theo experience, va `lib/experience-registry.test.ts` khoa dieu do lai bang mot
 * bai kiem tra rieng.
 *
 * Con `operations-console` VAN duoc chung minh la render doc lap: goi A trong
 * `tenant-runtime.contract.mjs` boot no bang `next start` that va doc `data-experience` tra ve.
 */
const TEST_TENANT_DIR = resolve(__dirname, 'e2e/fixtures/tenant');

export default defineConfig({
  testDir: './e2e',
  /**
   * Be mat van tai doi mot GOI KHACH KHAC, nen no khong chay duoc duoi may chu nay — mot khach chi
   * khai mot experience. Bo bai do nam o `e2e/transport/` va chay bang
   * `playwright.transport.config.ts`, TUAN TU sau bo nay (xem script `test:e2e`): chay song song
   * hai `next dev` trong cung thu muc se dung vao nhau o `.next`, dung nhu ghi chu tren.
   */
  testIgnore: 'transport/**',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3010',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm exec next dev -p 3010',
    url: 'http://127.0.0.1:3010/settings',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, TENANT_DIR: TEST_TENANT_DIR, NEXT_PUBLIC_API_URL: '' },
  },
});
