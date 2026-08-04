import { defineConfig, devices } from '@playwright/test';

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
    env: { ...process.env, NEXT_PUBLIC_API_URL: '' },
  },
});
