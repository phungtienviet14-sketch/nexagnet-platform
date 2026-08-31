import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * BE MAT BAN HANG B2B huong khach — Issue #107 §9.
 *
 * Moi lan goi API deu duoc chan lai: bai kiem tra nay hoi ve VO, DIEU HUONG va RANH GIOI NGON NGU,
 * khong hoi ve API. Du lieu gia CO Y mang theo `traceId` va `ruleConfigVersion` — neu vo de lot
 * mot trong hai len trang, bai kiem tra ranh gioi ben duoi phai do.
 */

const ORDERS = [
  {
    id: 'ord-cho-duyet',
    status: 'pending_review',
    createdAt: '2026-09-01T02:10:00.000Z',
    chatId: 'chat-1',
    groupName: 'Nhóm đại lý mẫu',
    dealerName: 'Đại lý mẫu',
    rawText: 'gui 2 ghe ve TN cho c',
    intent: 'dat_don',
    parsed: null,
    confidence: {},
    priced: {
      orderType: 'TH1',
      dealerName: 'Đại lý mẫu',
      branch: 'TN',
      lines: [
        {
          skuRaw: 'ghe',
          sku: 'GHE',
          productName: 'Ghế mẫu',
          quantity: 2,
          unitPrice: 1_000_000,
          lineTotal: 2_000_000,
          matched: true,
        },
      ],
      itemsSubtotal: 2_000_000,
      shippingFee: 0,
      policy: 'thanh_toan_ngay',
      codCollect: false,
      codFee: 0,
      vat: false,
      vatAmount: 0,
      grandTotal: 2_000_000,
      warnings: [],
      confirmationText: 'Xác nhận đơn',
    },
    traceId: '0af7651916cd43dd8448eb211c80319c',
    ruleConfigVersion: 3,
  },
];

const READINESS = {
  codeComplete: true,
  goLiveReady: false,
  checkedAt: '2026-09-01T00:00:00.000Z',
  reasons: [],
  checks: [
    {
      key: 'price.current_period',
      label: 'Bảng giá tháng hiện tại',
      status: 'missing',
      blocking: true,
      detail: 'Chưa nhập bảng giá.',
    },
  ],
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockCustomerShell(page: Page): Promise<void> {
  await page.route('**/auth/config', (route) => json(route, { mode: 'none' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: null }));
  await page.route('**/messages', (route) => json(route, ORDERS));
  await page.route('**/settings/readiness', (route) => json(route, READINESS));
  await page.route('**/knowledge/summary', (route) =>
    json(route, {
      productCount: 19,
      glossaryCount: 7,
      groupCount: 3,
      products: [],
      glossary: [],
      groups: [],
    }),
  );
  await page.route('**/settings/price-periods', (route) =>
    json(route, {
      currentMonth: '2026-09',
      currentPeriodId: null,
      missingCurrentPeriod: true,
      periods: [],
    }),
  );
}

test('vo khach hien thuong hieu doanh nghiep va TOAN BO thong tin kien truc da thoa thuan', async ({
  page,
}) => {
  await mockCustomerShell(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
  // Thuong hieu den tu GOI KHACH, khong hardcode trong app.
  await expect(page.getByText('Trợ lý đơn hàng E2E')).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  for (const group of ['BÁN HÀNG', 'CHĂM SÓC', 'VẬN HÀNH AI', 'QUẢN TRỊ']) {
    await expect(nav.getByText(group, { exact: true })).toBeVisible();
  }
  for (const label of [
    'Tổng quan',
    'Hội thoại',
    'Duyệt & gửi',
    'Đơn hàng',
    'Đại lý & khách hàng',
    'Chăm sóc khách hàng',
    'Lịch & chiến dịch',
    'Cảnh báo',
    'Dữ liệu & kiến thức',
    'Chính sách & bảng giá',
    'Người dùng & phân quyền',
    'Nhật ký hoạt động',
    'Cài đặt',
  ]) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
});

test('nghiep vu chua san sang doc ra dung ly do cua doanh nghiep, khong bi lam tron', async ({
  page,
}) => {
  await mockCustomerShell(page);
  await page.goto('/');

  // `exact` co chu y: ten nang luc xuat hien HAI lan tren trang — mot lan trong cau tom tat va mot
  // lan o dong chi tiet. Do la dung y do thiet ke; bai kiem tra phai bat dung dong chi tiet.
  await expect(page.getByText('COD và cước vận chuyển', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có bảng phí COD chính thức.')).toBeVisible();
  await expect(page.getByText('Chưa chốt cách xuất hoá đơn.')).toBeVisible();
  await expect(page.getByText('Chưa sẵn sàng', { exact: true }).first()).toBeVisible();
});

test('dieu huong xac dinh, luu lai duoc va nut Back tra ve dung muc truoc', async ({ page }) => {
  await mockCustomerShell(page);
  await page.goto('/');

  await page.getByRole('link', { name: 'Duyệt & gửi', exact: true }).click();
  await expect(page).toHaveURL(/\?section=approvals$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Duyệt & gửi' })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

  // Mo THANG bang duong dan luu san — khong phai bam tu trang chu.
  await page.goto('/?section=orders');
  await expect(page.getByRole('heading', { level: 1, name: 'Đơn hàng' })).toBeVisible();

  // Duong dan la thi roi ve Tong quan chu khong render trang trong.
  await page.goto('/?section=khong-ton-tai');
  await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
});

test('khong mot khai niem ky thuat nao lot len be mat khach', async ({ page }) => {
  await mockCustomerShell(page);

  for (const section of ['', '?section=conversations', '?section=approvals', '?section=orders']) {
    await page.goto(`/${section}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const forbidden of ['traceid', 'spanid', 'workflowrun', 'ruleconfigversion', 'auto_send']) {
      expect(body, `muc "${section || 'overview'}" khong duoc chua ${forbidden}`).not.toContain(
        forbidden,
      );
    }
    expect(body).not.toMatch(/\b[0-9a-f]{32}\b/);
  }
});

test('trang co du trang thai: co du lieu va rong', async ({ page }) => {
  await mockCustomerShell(page);

  // Co du lieu — don cho duyet hien ra kem nhom va dai ly.
  await page.goto('/?section=approvals');
  await expect(page.getByText('1 phản hồi đang chờ người kiểm tra.')).toBeVisible();
  await expect(page.getByText('Nhóm đại lý mẫu')).toBeVisible();

  // Rong — khong con gi cho duyet thi noi ro la khong con, khong de trang trang.
  await page.route('**/messages', (route) => json(route, []));
  await page.goto('/?section=approvals');
  await expect(page.getByText('Không còn gì chờ duyệt')).toBeVisible();
});

test('loi ket noi duoc noi bang tieng nguoi, khong phoi ma loi', async ({ page }) => {
  await mockCustomerShell(page);
  await page.route('**/messages', (route) => json(route, { message: 'boom' }, 500));

  await page.goto('/?section=orders');
  // Gioi han trong vung noi dung: Next tu chen mot <div role="alert"> thong bao chuyen route o
  // ngoai, va no khong phai thu bai kiem tra nay hoi den.
  const alert = page.locator('#b2b-main').getByRole('alert');
  await expect(alert).toContainText('Chưa tải được danh sách đơn hàng');
  await expect(alert).not.toContainText('500');
});

test('man hinh hep van dieu huong duoc — thanh dieu huong mo bang nut', async ({ page }) => {
  await mockCustomerShell(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(nav).toBeHidden();

  const toggle = page.getByRole('button', { name: 'Mở điều hướng' });
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Đơn hàng', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Đơn hàng' })).toBeVisible();
});

test('muc chua mo noi thang la chua mo, khong bay so lieu minh hoa', async ({ page }) => {
  await mockCustomerShell(page);
  await page.goto('/?section=campaigns');

  await expect(page.getByText('Lịch & chiến dịch chưa mở trong bản này')).toBeVisible();
  await expect(page.getByRole('link', { name: /trang quản trị/ })).toBeVisible();
});
