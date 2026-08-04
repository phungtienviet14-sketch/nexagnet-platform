import { expect, test, type Page, type Route } from '@playwright/test';

const summary = {
  channelMode: 'hybrid',
  zca: { state: 'ready', displayName: 'Tai khoan pilot', allowedGroupIds: ['zca-group-1'] },
  botIdentity: { state: 'ready', id: 'bot-1', name: 'Bot U Ultty' },
  autoSend: { enabled: false },
  sourceTruth: { productCount: 19, dealerCount: 2 },
  rules: { activeVersion: '1', provisionalKeys: ['A3.shipping', 'D8.codFee', 'D15.thresholds'] },
  groups: [
    {
      groupId: 'group-db-1',
      zcaChatId: 'zca-group-1',
      id: 'zca-group-1',
      name: 'Nhom pilot',
      allowed: true,
      memberCount: 2,
      activeParticipants: 2,
      inactiveParticipants: 0,
      dealerId: 'dealer-1',
      dealerName: 'Dai ly pilot',
    },
  ],
  warnings: ['Rank thanh vien khong thay doi don gia.'],
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockSettings(page: Page): Promise<void> {
  await page.route('**/settings/summary', (route) => json(route, summary));
  await page.route('**/zalo/logout', (route) =>
    json(route, { state: 'logged_out', allowedGroupIds: [], botIdentity: summary.botIdentity }),
  );
  await page.route('**/zalo/groups/*/members/sync', (route) =>
    json(route, {
      groupId: 'zca-group-1',
      complete: true,
      expectedCount: 2,
      fetchedCount: 2,
      failedCount: 0,
      upsertedCount: 2,
      deactivatedCount: 0,
    }),
  );
  await page.route('**/settings/automation/auto-send', (route) =>
    json(route, { autoSend: route.request().postDataJSON().enabled ? 'on' : 'off' }),
  );
}

test('operator can sync the allowlisted group and log out the personal Zalo account', async ({ page }) => {
  await mockSettings(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Cấu hình vận hành' })).toBeVisible();
  await expect(page.getByText('Hybrid hai kênh')).toBeVisible();

  await page.getByRole('button', { name: /Đồng bộ thành viên nhóm Nhom pilot/i }).click();
  await expect.poll(() => requests).toContain('POST /zalo/groups/zca-group-1/members/sync');

  await page.getByRole('button', { name: 'Đăng xuất an toàn' }).click();
  await expect.poll(() => requests).toContain('POST /zalo/logout');
});

test('AUTO_SEND requires the explicit second confirmation and uses the shared settings endpoint', async ({
  page,
}) => {
  await mockSettings(page);
  let requestBody: unknown;
  await page.route('**/settings/automation/auto-send', async (route) => {
    requestBody = route.request().postDataJSON();
    await json(route, { autoSend: 'on' });
  });

  await page.goto('/settings');
  await page.getByRole('tab', { name: /Tự động hóa/ }).click();
  await page.getByRole('switch', { name: /Bắt đầu quy trình bật/ }).click();
  await expect(page.getByText('Bước 2 / 2')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Bật Tự gửi có kiểm soát/ }).click();

  await expect.poll(() => requestBody).toEqual({ enabled: true, acknowledged: true });
});
