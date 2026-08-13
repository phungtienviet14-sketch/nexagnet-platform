import { expect, test, type Page, type Route } from '@playwright/test';

const summary = {
  channelMode: 'hybrid',
  zca: { state: 'ready', displayName: 'Tai khoan pilot', allowedGroupIds: ['zca-group-1'] },
  botIdentity: { state: 'ready', id: 'bot-1', name: 'Bot U Ultty' },
  autoSend: { enabled: false },
  orderAutomation: { enabled: true, maxAutoConfirmQuantity: 50 },
  sourceTruth: { productCount: 19, dealerCount: 2 },
  rules: { activeVersion: '1', provisionalKeys: ['A3.shipping', 'D8.codFee', 'D15.thresholds'] },
  groups: [
    {
      groupId: 'group-db-1',
      zcaChatId: 'zca-group-1',
      id: 'zca-group-1',
      name: 'Nhom pilot',
      // Da map dai ly -> moi duoc dong bo thanh vien. Nhom `pending` co nut Dong bo bi tat.
      status: 'mapped',
      allowed: true,
      memberCount: 2,
      activeParticipants: 2,
      inactiveParticipants: 0,
      dealerId: 'dealer-1',
      dealerName: 'Dai ly pilot',
    },
    {
      groupId: 'group-db-2',
      zcaChatId: 'zca-group-2',
      id: 'zca-group-2',
      name: 'Nhom chua map',
      status: 'pending',
      allowed: true,
      memberCount: 0,
      activeParticipants: 0,
      inactiveParticipants: 0,
    },
    {
      // Nhom cu da go: phai nam o khu "Nhom da go", KHONG dem vao bang chinh hay canh bao pending.
      groupId: 'group-db-3',
      zcaChatId: 'zca-group-3',
      id: 'zca-group-3',
      name: 'Nhom cu tu dot test truoc',
      status: 'ignored',
      allowed: false,
      memberCount: 0,
      activeParticipants: 0,
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
  // AuthGate must finish before the settings shell can render. E2E intentionally exercises the
  // unauthenticated local/CI mode; pilot session authentication is covered by API/integration smoke.
  await page.route('**/auth/config', (route) => json(route, { mode: 'none' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: null }));
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
  await page.route('**/settings/source-truth/dealers', (route) =>
    json(route, [{ id: 'dealer-1', name: 'Dai ly pilot', tier: 'dai_ly' }]),
  );
  await page.route('**/settings/groups/*/mapping', (route) =>
    json(route, { chatId: 'zca-group-2', dealerId: 'dealer-1', status: 'mapped' }),
  );
  await page.route('**/settings/groups/*/hidden', (route) =>
    json(route, {
      chatId: 'zca-group-1',
      status: route.request().postDataJSON().hidden ? 'ignored' : 'mapped',
    }),
  );
  await page.route('**/campaigns/policy', (route) =>
    json(route, {
      defaultWindow: { start: '08:00', end: '12:00' },
      minSpacingSeconds: 30,
      maxTargets: 500,
      rateLimitPerMinute: 30,
      claimLeaseSeconds: 60,
      tickIntervalSeconds: 10,
      retry: { maxAttempts: 4, baseBackoffSeconds: 60 },
    }),
  );
  await page.route('**/campaigns', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      return json(route, {
        id: 'campaign-1',
        ...body,
        status: 'draft',
        createdAt: '2026-08-12T00:00:00.000Z',
        targets: body.targets.map((target: { chatId: string }, index: number) => ({
          id: `target-${index}`,
          ...target,
          enabled: true,
        })),
        deliveries: [],
      });
    }
    return json(route, []);
  });
  await page.route('**/settings/content', (route) =>
    json(route, {
      provenance: [
        { id: 'local_manifest:inventory', kind: 'local_manifest', sourceId: 'inventory' },
      ],
      assets: [],
      faqs: [
        {
          id: 'faq-1',
          externalId: 'faq-1',
          productSku: 'ELNI',
          question: 'ELNI vệ sinh thế nào?',
          answer: 'Lau bằng khăn mềm.',
          status: 'draft',
          operatorEdited: false,
          provenanceKey: 'local_manifest:inventory',
        },
      ],
      advice: [],
      links: [],
      readiness: [{ productSku: 'ELNI', ready: false, missing: ['active_image'] }],
    }),
  );
  await page.route('**/settings/content/import/preview', (route) =>
    json(route, { creates: 0, updates: 0, unchanged: 1, conflicts: 0, errors: [] }),
  );
}

test('operator can sync the allowlisted group and log out the personal Zalo account', async ({
  page,
}) => {
  await mockSettings(page);
  const requests: string[] = [];
  page.on('request', (request) =>
    requests.push(`${request.method()} ${new URL(request.url()).pathname}`),
  );
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Cấu hình vận hành' })).toBeVisible();
  await expect(page.getByText('Hybrid hai kênh')).toBeVisible();

  await page.getByRole('button', { name: /Đồng bộ thành viên nhóm Nhom pilot/i }).click();
  await expect.poll(() => requests).toContain('POST /zalo/groups/zca-group-1/members/sync');

  await page.getByRole('button', { name: 'Đăng xuất an toàn' }).click();
  await expect.poll(() => requests).toContain('POST /zalo/logout');
});

test('nhom chua map dai ly: nut Dong bo bi tat, chon dai ly ngay tren bang la xong', async ({
  page,
}) => {
  await mockSettings(page);
  const requests: string[] = [];
  page.on('request', (request) =>
    requests.push(`${request.method()} ${new URL(request.url()).pathname}`),
  );

  await page.goto('/settings');

  // Dong bo nhom chua map chac chan 400 (chua co hang Group de gan thanh vien) -> phai tat truoc.
  await expect(
    page.getByRole('button', { name: /Đồng bộ thành viên nhóm Nhom chua map/i }),
  ).toBeDisabled();
  await expect(page.getByText(/1 nhóm đang nghe nhưng chưa chọn đại lý/)).toBeVisible();

  // Khong con o text bat go chatId 19 chu so — chon thang tren dong.
  await page
    .getByRole('combobox', { name: /Đại lý cho nhóm Nhom chua map/i })
    .selectOption('dealer-1');

  await expect.poll(() => requests).toContain('PUT /settings/groups/zca-group-2/mapping');
  await expect(page.getByText('Đã map nhóm vào đại lý')).toBeVisible();
});

test('nhom cu go duoc khoi bang, va dua lai duoc — khong con ket trong danh sach', async ({
  page,
}) => {
  await mockSettings(page);
  const requests: string[] = [];
  page.on('request', (request) =>
    requests.push(`${request.method()} ${new URL(request.url()).pathname}`),
  );
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/settings');

  // Nhom da go khong duoc lam ban bang chinh, cung khong duoc tinh vao canh bao "chua chon dai ly".
  await expect(page.getByText(/1 nhóm đang nghe nhưng chưa chọn đại lý/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nhóm đã gỡ' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Đưa nhóm Nhom cu tu dot test truoc trở lại/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: /Đại lý cho nhóm Nhom cu tu dot test truoc/i }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: /Gỡ nhóm Nhom pilot khỏi danh sách/i }).click();

  await expect.poll(() => requests).toContain('PUT /settings/groups/zca-group-1/hidden');
  await expect(page.getByText('Đã gỡ nhóm khỏi danh sách')).toBeVisible();
});

test('AUTO_SEND toggles the operational kill switch without asking D4 again', async ({ page }) => {
  await mockSettings(page);
  let requestBody: unknown;
  await page.route('**/settings/automation/auto-send', async (route) => {
    requestBody = route.request().postDataJSON();
    await json(route, { autoSend: 'on' });
  });

  await page.goto('/settings');
  await page.getByRole('tab', { name: /Tự động hóa/ }).click();
  await expect(page.getByText(/ngưỡng ≤ 50 sản phẩm/i)).toBeVisible();
  await page.getByRole('switch', { name: /Bật Tự gửi/ }).click();

  await expect.poll(() => requestBody).toEqual({ enabled: true });
});

test('Sale previews and saves a campaign draft for mapped allowlisted groups', async ({ page }) => {
  await mockSettings(page);
  let requestBody: Record<string, unknown> | undefined;
  await page.route('**/campaigns', async (route) => {
    if (route.request().method() !== 'POST') return json(route, []);
    requestBody = route.request().postDataJSON();
    const body = requestBody as { targets: Array<Record<string, unknown>> };
    return json(route, {
      id: 'campaign-1',
      ...body,
      status: 'draft',
      createdAt: '2026-08-12T00:00:00.000Z',
      targets: body.targets.map((target, index) => ({
        id: `target-${index}`,
        ...target,
        enabled: true,
      })),
      deliveries: [],
    });
  });

  await page.goto('/settings');
  await page.getByRole('tab', { name: /Chiến dịch CSKH/ }).click();
  await page.getByLabel('Tên chiến dịch').fill('Chăm sóc tháng 8');
  await page.getByLabel('Nội dung gửi').fill('Chúc quý đại lý một ngày tốt lành');
  await page.getByRole('checkbox', { name: 'Nhom pilot' }).check();
  await page.getByRole('button', { name: 'Xem trước' }).click();
  await expect(page.getByText('Số nhóm')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();

  await expect
    .poll(() => requestBody)
    .toMatchObject({
      name: 'Chăm sóc tháng 8',
      kind: 'one_off',
      targets: [expect.objectContaining({ chatId: 'zca-group-1' })],
    });
});

test('operator sees content readiness, provenance and previews an idempotent import', async ({
  page,
}) => {
  await mockSettings(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: /Nội dung sản phẩm/ }).click();

  await expect(page.getByRole('heading', { name: 'Kho nội dung sản phẩm' })).toBeVisible();
  await expect(page.getByText(/Thiếu: active_image/)).toBeVisible();
  await expect(page.getByText('local_manifest:inventory')).toBeVisible();

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'không đổi 1' })).toBeVisible();
});
