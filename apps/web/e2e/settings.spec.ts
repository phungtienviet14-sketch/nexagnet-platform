import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * `/settings` — Trung tam thiet lap & van hanh (#117), gom ca phan phuc hoi cua #116.
 *
 * Bo test nay chay tren du lieu gia dinh, khong can Zalo that va khong can co so du lieu: cai can
 * chung minh la KHACH LAM DUOC VIEC, chu khong phai ha tang co song hay khong.
 */

const CURRENT_MONTH = '2026-09';

type MockPrice = { sku: string; wholesale: number };
type MockPeriod = {
  id: string;
  validMonth: string;
  status: 'draft' | 'active' | 'archived';
  source?: string;
  prices: MockPrice[];
};

/** Trang thai gia lap — moi bai tu dung lai de mot bai khong keo theo bai khac. */
let periods: MockPeriod[] = [];
let nextId = 0;

function resetPricePeriods(seed: MockPeriod[]): void {
  periods = seed.map((period) => ({ ...period, prices: period.prices.map((row) => ({ ...row })) }));
  nextId = 0;
}

const nineteenSkus: MockPrice[] = Array.from({ length: 19 }, (_, index) => ({
  sku: `SP${String(index + 1).padStart(2, '0')}`,
  wholesale: 1_000_000 + index * 1000,
}));

const summary = {
  channelMode: 'hybrid',
  dataClassification: 'test',
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

const readiness = {
  codeComplete: true,
  goLiveReady: false,
  checkedAt: '2026-09-02T00:00:00.000Z',
  reasons: ['missing_current_price_period'],
  checks: [
    {
      key: 'price.current_period',
      label: 'Bảng giá tháng hiện hành',
      status: 'missing',
      blocking: true,
      detail: 'missing_current_price_period',
    },
    {
      key: 'groups.mapped',
      label: 'Nhóm đã map đại lý',
      status: 'missing',
      blocking: true,
      detail: 'missing_group_mappings',
    },
    {
      key: 'dealers.configured',
      label: 'Đại lý đã cấu hình',
      status: 'ready',
      blocking: true,
      detail: 'ok',
    },
  ],
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function pricePeriodsPayload() {
  const official = periods.find(
    (period) =>
      period.validMonth === CURRENT_MONTH &&
      period.status === 'active' &&
      period.source !== 'test_only',
  );
  return {
    currentMonth: CURRENT_MONTH,
    currentPeriodId: official?.id ?? null,
    missingCurrentPeriod: !official,
    periods,
  };
}

async function mockSettings(page: Page): Promise<void> {
  await page.route('**/auth/config', (route) => json(route, { mode: 'none' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: null }));
  await page.route('**/settings/summary', (route) => json(route, summary));
  await page.route('**/settings/readiness', (route) => json(route, readiness));
  // Hai man chi doc nay khong phai chu de cua bo test, nhung phai tra JSON hop le: mot phan hoi
  // khong parse duoc lam vo ca trang va bien mot loi vat thanh "moi bai deu do".
  await page.route('**/settings/rules', (route) => json(route, []));
  await page.route('**/settings/audit**', (route) =>
    json(route, { entries: [], total: 0, page: 1, pageSize: 20 }),
  );

  // Dang ky tu chung den rieng: Playwright uu tien route dang ky SAU.
  await page.route('**/settings/source-truth/*', (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').pop();
    if (resource === 'dealers') {
      return json(route, [{ id: 'dealer-1', name: 'Dai ly pilot', tier: 'dai_ly' }]);
    }
    if (resource === 'products') {
      return json(
        route,
        nineteenSkus.map((row) => ({ sku: row.sku, name: `San pham ${row.sku}` })),
      );
    }
    return json(route, []);
  });

  await page.route('**/settings/price-periods', async (route) => {
    if (route.request().method() !== 'POST') return json(route, pricePeriodsPayload());
    const body = route.request().postDataJSON() as { validMonth: string; testOnly?: boolean };
    const created: MockPeriod = {
      id: `new-${(nextId += 1)}`,
      validMonth: body.validMonth,
      status: 'draft',
      source: body.testOnly ? 'test_only' : 'operator',
      prices: [],
    };
    periods = [created, ...periods];
    return json(route, created);
  });

  await page.route('**/settings/price-periods/*/copy', async (route) => {
    const sourceId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const body = route.request().postDataJSON() as { validMonth: string };
    const source = periods.find((period) => period.id === sourceId);
    const created: MockPeriod = {
      id: `new-${(nextId += 1)}`,
      validMonth: body.validMonth,
      status: 'draft',
      source: `copy:${sourceId}`,
      prices: (source?.prices ?? []).map((row) => ({ ...row })),
    };
    periods = [created, ...periods];
    return json(route, created);
  });

  await page.route('**/settings/price-periods/*/archive', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    periods = periods.map((period) =>
      period.id === id ? { ...period, status: 'archived' as const } : period,
    );
    return json(
      route,
      periods.find((period) => period.id === id),
    );
  });

  await page.route('**/settings/price-periods/*/activate', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    periods = periods.map((period) =>
      period.id === id ? { ...period, status: 'active' as const } : period,
    );
    return json(
      route,
      periods.find((period) => period.id === id),
    );
  });

  await page.route('**/settings/price-periods/*/validate', (route) =>
    json(route, { valid: true, errors: [], warnings: [], productCount: 19, priceCount: 1 }),
  );

  await page.route('**/settings/price-periods/*/import/apply', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-3)!;
    const body = route.request().postDataJSON() as { rows: MockPrice[] };
    periods = periods.map((period) =>
      period.id === id ? { ...period, prices: body.rows.map((row) => ({ ...row })) } : period,
    );
    return json(route, {
      periodId: id,
      preview: { valid: true, created: 0, updated: 0, unchanged: 0, errors: [], warnings: [] },
    });
  });

  // Xoa THAT: bo dong khoi trang thai gia lap, de lan doc lai chung minh no khong quay ve.
  await page.route('**/settings/price-periods/*/prices/*/remove', async (route) => {
    const segments = new URL(route.request().url()).pathname.split('/');
    const sku = segments.at(-2)!;
    const periodId = segments.at(-4)!;
    const period = periods.find((entry) => entry.id === periodId);
    if (!period || period.status !== 'draft') {
      return json(route, { message: 'Chỉ được xóa dòng giá khỏi kỳ nháp' }, 409);
    }
    if (!period.prices.some((row) => row.sku === sku)) {
      return json(route, { message: 'Không có dòng giá' }, 404);
    }
    period.prices = period.prices.filter((row) => row.sku !== sku);
    return json(route, { periodId, sku, removed: true, remaining: period.prices.length });
  });

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

/** Bam mot muc trong dieu huong bang dung CAI TEN VIEC, khong bang ten he thong con. */
async function openSection(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('link', { name }).click();
}

test.beforeEach(() => {
  resetPricePeriods([{ id: 'aug', validMonth: '2026-08', status: 'active', prices: nineteenSkus }]);
});

test.describe('Tổng quan — trả lời ba câu trong mười giây', () => {
  test('mở /settings là thấy ngay việc đang chặn bán hàng, kèm nút đi thẳng tới chỗ sửa', async ({
    page,
  }) => {
    await mockSettings(page);
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Thiết lập & vận hành' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tổng quan', level: 2 })).toBeVisible();

    // Cau 1 + 2: he thong the nao, cai gi dang chan.
    await expect(page.getByText(/việc đang chặn bán hàng/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Việc cần hoàn thiện' })).toBeVisible();
    await expect(page.getByText(`Bảng giá tháng 09/2026`)).toBeVisible();

    // Cau 3: phai lam gi tiep — mot nut, khong phai mot ma loi.
    await expect(page.getByRole('button', { name: 'Thiết lập bảng giá' })).toBeVisible();
    await expect(page.getByText('missing_current_price_period')).toHaveCount(0);
  });

  test('nút trên thẻ cảnh báo dẫn thẳng tới đúng màn sửa được nó', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Thiết lập bảng giá' }).click();

    await expect(page.getByRole('heading', { name: 'Bảng giá', level: 2 })).toBeVisible();
    await expect(page).toHaveURL(/section=products-pricing/);
  });

  test('mã lý do của máy chỉ nằm trong phần chi tiết kỹ thuật', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings');

    const disclosure = page.getByText('Chi tiết kỹ thuật').first();
    await expect(disclosure).toBeVisible();
    await expect(page.getByText('missing_group_mappings')).toBeHidden();
    await disclosure.click();
    await expect(page.getByText('missing_group_mappings')).toBeVisible();
  });
});

test.describe('Điều hướng theo việc, không theo hệ thống con', () => {
  test('bốn nhóm việc thay cho 11 thẻ ngang hàng', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings');

    for (const group of ['Bắt đầu', 'Bán hàng', 'Chăm sóc khách hàng', 'Vận hành']) {
      await expect(page.getByRole('heading', { name: group, exact: true })).toBeVisible();
    }
    // Nhan cu khong con o dieu huong.
    await expect(page.getByRole('link', { name: /Rules & công thức/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Nguồn sự thật/ })).toHaveCount(0);
  });

  test('vào được màn bảng giá mà không cần biết tên kỹ thuật nào', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings');

    await openSection(page, /Sản phẩm & bảng giá/);

    await expect(page.getByRole('heading', { name: 'Bảng giá', level: 2 })).toBeVisible();
    await expect(page.getByText('Bảng giá chính thức · tháng 09/2026')).toBeVisible();
  });

  test('deep-link sống sót qua F5', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings?section=sales-policy');

    await expect(page.getByRole('link', { name: /Chính sách bán hàng/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goto('/settings?section=audit');
    await expect(page.getByRole('link', { name: /Lịch sử thay đổi/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('deep-link tới mục không có thật rơi về Tổng quan, không vỡ màn hình', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings?section=khong-co-that');

    await expect(page.getByRole('link', { name: /Tổng quan/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('Bảng giá — ba khái niệm tách rời', () => {
  test('thiếu bảng giá chính thức được nói thẳng, không giấu trong một danh sách', async ({
    page,
  }) => {
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await expect(page.getByText('Bảng giá chính thức · tháng 09/2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bảng giá', level: 2 })).toBeVisible();
    await expect(page.getByText('Chưa có', { exact: true })).toBeVisible();
  });

  test('kỳ chỉ để chạy thử hiện tách riêng và nói rõ là không phải bảng giá chính thức', async ({
    page,
  }) => {
    resetPricePeriods([
      {
        id: 'test-1',
        validMonth: CURRENT_MONTH,
        status: 'active',
        source: 'test_only',
        prices: [{ sku: 'SP01', wholesale: 1_250_000 }],
      },
    ]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await expect(page.getByText('Chỉ để chạy thử (UAT)').first()).toBeVisible();
    await expect(page.getByText(/không.*phải bảng giá chính thức/i).first()).toBeVisible();
    // Van bao thieu bang gia chinh thuc — dung y #114/#116.
    await expect(page.getByText('Chưa có', { exact: true })).toBeVisible();
  });
});

test.describe('Luồng tạo có dẫn đường (#117 §4.2)', () => {
  test('tạo bảng giá CHẠY THỬ đi đúng API tạo kỳ trống, không bao giờ đi đường sao chép', async ({
    page,
  }) => {
    await mockSettings(page);
    const posted: Array<{ path: string; body: unknown }> = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      const path = new URL(request.url()).pathname;
      if (!path.includes('price-periods')) return;
      posted.push({ path, body: request.postDataJSON() });
    });

    await page.goto('/settings?section=products-pricing');
    await page.getByRole('button', { name: 'Tạo bảng giá' }).click();

    await expect(page.getByText(/KHÔNG phải bảng giá chính thức/)).toBeVisible();
    await page.getByRole('radio', { name: /Tạo bảng giá chỉ để chạy thử/ }).check();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page.getByRole('button', { name: 'Tạo bản nháp' }).click();

    await expect.poll(() => posted).toHaveLength(1);
    expect(posted[0]?.path).toMatch(/\/settings\/price-periods$/);
    expect(posted[0]?.path).not.toContain('/copy');
    expect(posted[0]?.body).toEqual({
      validMonth: CURRENT_MONTH,
      note: `UAT_TEST_ONLY_${CURRENT_MONTH}`,
      testOnly: true,
    });
  });

  test('không có kỳ nào để chép thì lựa chọn đó bị tắt kèm lý do', async ({ page }) => {
    resetPricePeriods([]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await page.getByRole('button', { name: 'Tạo bảng giá' }).click();

    await expect(page.getByRole('radio', { name: /Tạo bản nháp từ một kỳ trước/ })).toBeDisabled();
    await expect(page.getByText('Chưa có kỳ giá nào để chép lại.')).toBeVisible();
  });

  test('chép từ kỳ trước nói rõ giá cũ không tự nhiên đúng cho tháng mới', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await page.getByRole('button', { name: 'Tạo bảng giá' }).click();
    await page.getByRole('radio', { name: /Tạo bản nháp từ một kỳ trước/ }).check();

    await expect(page.getByText(/không tự nhiên đúng cho tháng mới/)).toBeVisible();
  });
});

test.describe('#116 — phục hồi khi làm sai', () => {
  test('lưu trữ được kỳ ĐANG ÁP DỤNG, kèm cảnh báo nói rõ hậu quả', async ({ page }) => {
    resetPricePeriods([
      {
        id: 'wrong-active',
        validMonth: CURRENT_MONTH,
        status: 'active',
        source: 'copy:aug',
        prices: nineteenSkus,
      },
    ]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await expect(page.getByText('Đang áp dụng')).toBeVisible();
    await page
      .locator('.settings-price-card--official')
      .getByRole('button', { name: 'Lưu trữ' })
      .click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/chuyển về cho Sale/i)).toBeVisible();
    await expect(dialog.getByText(/không có thao tác nào xóa hẳn/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Lưu trữ bảng giá' }).click();

    await expect(page.getByText(/Đã lưu trữ bảng giá tháng 09\/2026/)).toBeVisible();
    await expect(page.getByText('Chưa có', { exact: true })).toBeVisible();
  });

  test('lưu trữ được BẢN NHÁP — cảnh báo khác hẳn, vì hậu quả khác hẳn', async ({ page }) => {
    resetPricePeriods([
      {
        id: 'wrong-draft',
        validMonth: CURRENT_MONTH,
        status: 'draft',
        source: 'copy:aug',
        prices: nineteenSkus,
      },
    ]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await page.getByRole('button', { name: 'Lưu trữ bản nháp 2026-09' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(/Không đơn nào bị ảnh hưởng/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Lưu trữ bản nháp' }).click();

    await expect(page.getByText(/Đã lưu trữ bản nháp tháng 09\/2026/)).toBeVisible();
    await expect(page.getByText('Không có bản nháp')).toBeVisible();
  });

  test('xóa mặt hàng khỏi bản nháp và tải lại — nó KHÔNG quay về', async ({ page }) => {
    resetPricePeriods([
      {
        id: 'draft-19',
        validMonth: CURRENT_MONTH,
        status: 'draft',
        source: 'copy:aug',
        prices: nineteenSkus,
      },
    ]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await expect(page.getByText('Hiển thị 19 / 19 mặt hàng')).toBeVisible();

    await page.getByRole('button', { name: 'Xóa SP02 khỏi bản nháp' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(/Còn lại 18 mặt hàng/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Xóa khỏi bản nháp' }).click();

    await expect(page.getByText('Đã xóa SP02 khỏi bản nháp.')).toBeVisible();
    await expect(page.getByText('Hiển thị 18 / 18 mặt hàng')).toBeVisible();

    // Bang chung that su: tai lai trang, doc lai tu may chu.
    await page.reload();
    await expect(page.getByText('Hiển thị 18 / 18 mặt hàng')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xóa SP02 khỏi bản nháp' })).toHaveCount(0);
  });

  test('kỳ đang áp dụng và kỳ đã lưu trữ là bảng CHỈ ĐỌC — không có nút xóa dòng', async ({
    page,
  }) => {
    resetPricePeriods([
      {
        id: 'active-now',
        validMonth: CURRENT_MONTH,
        status: 'active',
        source: 'operator',
        prices: nineteenSkus,
      },
    ]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await expect(page.getByText(/Kỳ đang áp dụng — chỉ xem/)).toBeVisible();
    await expect(page.getByRole('button', { name: /khỏi bản nháp/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thêm vào bảng' })).toHaveCount(0);
  });
});

test.describe('Khách bình thường không phải chạm vào JSON (#117 §4.4)', () => {
  test('thêm mặt hàng và nhập giá bằng bảng, kích hoạt xong không cần dán gì', async ({ page }) => {
    resetPricePeriods([
      {
        id: 'empty-draft',
        validMonth: CURRENT_MONTH,
        status: 'draft',
        source: 'operator',
        prices: [],
      },
    ]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await page.getByLabel('Thêm mặt hàng vào bảng giá').fill('SP01');
    await page.getByRole('button', { name: 'Thêm vào bảng' }).click();
    await page.getByLabel('Đơn giá CTV của SP01').fill('1250000');

    await page.getByRole('button', { name: /^Kích hoạt bảng giá/ }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByText('Đơn đã chốt trước đó giữ nguyên giá cũ. Chỉ đơn mới dùng giá này.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Kích hoạt bảng giá chính thức' }).click();

    await expect(page.getByText(/Đã kích hoạt bảng giá tháng 09\/2026/)).toBeVisible();
  });

  test('nhập hàng loạt vẫn còn nhưng nằm sau mục Nâng cao', async ({ page }) => {
    resetPricePeriods([
      {
        id: 'draft-1',
        validMonth: CURRENT_MONTH,
        status: 'draft',
        source: 'operator',
        prices: [{ sku: 'SP01', wholesale: 1 }],
      },
    ]);
    await mockSettings(page);
    await page.goto('/settings?section=products-pricing');

    await expect(page.getByRole('textbox', { name: /Dán dữ liệu bảng giá/ })).toBeHidden();
    await page.getByText('Nâng cao · Nhập hàng loạt').click();
    await expect(page.getByRole('textbox', { name: /Dán dữ liệu bảng giá/ })).toBeVisible();
  });
});

test.describe('Phân quyền lấy theo máy chủ, không tự bịa', () => {
  test('vai trò chỉ đọc không thấy nút sửa, và deep-link quản lý tài khoản rơi về Tổng quan', async ({
    page,
  }) => {
    await mockSettings(page);
    await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
    await page.route('**/auth/me', (route) =>
      json(route, {
        user: { id: 'u1', username: 'sale1', name: 'Sale Một', role: 'SALE' },
        roles: ['SALE'],
      }),
    );

    await page.goto('/settings?section=users');

    await expect(page.getByText('Bạn đang xem ở chế độ chỉ đọc')).toBeVisible();
    await expect(page.getByRole('link', { name: /Người dùng & phân quyền/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Tổng quan/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await openSection(page, /Sản phẩm & bảng giá/);
    await expect(page.getByRole('button', { name: 'Tạo bảng giá' })).toHaveCount(0);
  });

  test('Quản trị viên thấy đủ mục và sửa được', async ({ page }) => {
    await mockSettings(page);
    await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
    await page.route('**/auth/me', (route) =>
      json(route, {
        user: { id: 'u2', username: 'admin', name: 'Quan Tri', role: 'ADMIN' },
        roles: ['ADMIN'],
      }),
    );
    await page.route('**/settings/users', (route) => json(route, []));

    await page.goto('/settings?section=products-pricing');

    await expect(page.getByText('Bạn đang xem ở chế độ chỉ đọc')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Người dùng & phân quyền/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo bảng giá' })).toBeVisible();
  });
});

test.describe('Các màn cũ vẫn chạy trong kiến trúc mới', () => {
  test('đồng bộ thành viên và đăng xuất Zalo vẫn làm được', async ({ page }) => {
    await mockSettings(page);
    const requests: string[] = [];
    page.on('request', (request) =>
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`),
    );
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/settings?section=dealers-groups');
    await page.getByRole('button', { name: /Đồng bộ thành viên nhóm Nhom pilot/i }).click();
    await expect.poll(() => requests).toContain('POST /zalo/groups/zca-group-1/members/sync');

    await openSection(page, /Kết nối Zalo/);
    await expect(page.getByRole('heading', { name: 'Kết nối Zalo', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Đăng xuất an toàn' }).click();
    await expect.poll(() => requests).toContain('POST /zalo/logout');
  });

  test('nhóm chưa map đại lý: nút Đồng bộ bị tắt, chọn đại lý ngay trên bảng là xong', async ({
    page,
  }) => {
    await mockSettings(page);
    const requests: string[] = [];
    page.on('request', (request) =>
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`),
    );

    await page.goto('/settings?section=dealers-groups');

    await expect(
      page.getByRole('button', { name: /Đồng bộ thành viên nhóm Nhom chua map/i }),
    ).toBeDisabled();
    await expect(page.getByText(/1 nhóm đang nghe nhưng chưa chọn đại lý/)).toBeVisible();

    await page
      .getByRole('combobox', { name: /Đại lý cho nhóm Nhom chua map/i })
      .selectOption('dealer-1');

    await expect.poll(() => requests).toContain('PUT /settings/groups/zca-group-2/mapping');
    await expect(page.getByText('Đã map nhóm vào đại lý')).toBeVisible();
  });

  test('nhóm cũ gỡ được khỏi bảng, và đưa lại được', async ({ page }) => {
    await mockSettings(page);
    const requests: string[] = [];
    page.on('request', (request) =>
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`),
    );
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/settings?section=dealers-groups');

    await expect(page.getByRole('heading', { name: 'Nhóm đã gỡ' })).toBeVisible();
    await page.getByRole('button', { name: /Gỡ nhóm Nhom pilot khỏi danh sách/i }).click();

    await expect.poll(() => requests).toContain('PUT /settings/groups/zca-group-1/hidden');
    await expect(page.getByText('Đã gỡ nhóm khỏi danh sách')).toBeVisible();
  });

  test('công tắc tự động gửi vẫn bật/tắt được từ mục Tự động hóa', async ({ page }) => {
    await mockSettings(page);
    let requestBody: unknown;
    await page.route('**/settings/automation/auto-send', async (route) => {
      requestBody = route.request().postDataJSON();
      await json(route, { autoSend: 'on' });
    });

    await page.goto('/settings?section=automation');
    await expect(page.getByText(/ngưỡng ≤ 50 sản phẩm/i)).toBeVisible();
    await page.getByRole('switch', { name: /Bật Tự gửi/ }).click();

    await expect.poll(() => requestBody).toEqual({ enabled: true });
  });

  test('Sale xem trước và lưu bản nháp chiến dịch', async ({ page }) => {
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

    await page.goto('/settings?section=campaigns');
    await page.getByLabel('Tên chiến dịch').fill('Chăm sóc tháng 9');
    await page.getByLabel('Nội dung gửi').fill('Chúc quý đại lý một ngày tốt lành');
    await page.getByRole('checkbox', { name: 'Nhom pilot' }).check();
    await page.getByRole('button', { name: 'Xem trước' }).click();
    await expect(page.getByText('Số nhóm')).toBeVisible();
    await page.getByRole('button', { name: 'Lưu bản nháp' }).click();

    await expect
      .poll(() => requestBody)
      .toMatchObject({
        name: 'Chăm sóc tháng 9',
        kind: 'one_off',
        targets: [expect.objectContaining({ chatId: 'zca-group-1' })],
      });
  });

  test('kho nội dung và xem trước import vẫn nguyên', async ({ page }) => {
    await mockSettings(page);
    await page.goto('/settings?section=content');

    await expect(page.getByRole('heading', { name: 'Kho nội dung sản phẩm' })).toBeVisible();
    await expect(page.getByText(/Thiếu: active_image/)).toBeVisible();

    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'không đổi 1' })).toBeVisible();
  });
});

test.describe('Dùng được trên máy tính bảng và điện thoại', () => {
  test('điều hướng và bảng giá không tràn ngang ở 768 và 375', async ({ page }) => {
    await mockSettings(page);
    for (const width of [768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/settings?section=products-pricing');

      await expect(page.getByRole('link', { name: /Sản phẩm & bảng giá/ })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
});
