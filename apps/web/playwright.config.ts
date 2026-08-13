import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const TEST_TENANT_DIR = resolve(__dirname, 'e2e/fixtures/tenant');

export default defineConfig({
  testDir: './e2e',
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
