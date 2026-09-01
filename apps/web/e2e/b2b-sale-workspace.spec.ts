import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * KHONG GIAN LAM VIEC CUA SALE — hanh trinh nghiem thu cua Issue #110.
 *
 * Bai kiem tra nay di DUNG chuoi ma hop dong doi mot nguoi duyet phai di duoc, KHONG mo be mat
 * ky thuat mot lan nao:
 *
 *   Tong quan -> Hoi thoai -> hieu he thong dinh lam gi -> Duyệt & gửi / Từ chối -> Đơn hàng
 *   -> Cảnh báo
 *
 * May chu duoc gia lap va CO TRANG THAI: bam duyet lam doi ket qua cua `GET /messages` o lan goi
 * sau, dung nhu may chu that. Mot ban gia khong trang thai chi chung minh duoc nut co bam duoc,
 * khong chung minh duoc man hinh CO CAP NHAT — ma do moi la thu hop dong doi.
 *
 * Du lieu gia CO Y ban: no mang `traceId`, `chatId`, `senderExternalId`, `ruleConfigVersion` va
 * ca mot vet 6 vai agent. Neu be mat de lot bat ky thu nao trong so do, bai ranh gioi o cuoi phai
 * do.
 */

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';

type MockOrder = Record<string, unknown>;

function pricedOrder(overrides: MockOrder = {}): MockOrder {
  return {
    id: 'ord-1',
    status: 'pending_review',
    createdAt: '2026-09-01T02:10:00.000Z',
    chatId: 'chat-e2e-0001',
    groupName: 'Đại lý Thái Nguyên',
    dealerName: 'Chị Hạnh',
    rawText: 'gui 2 ghe felix ve TN cho c',
    intent: 'dat_don',
    parsed: null,
    confidence: {},
    senderExternalId: 'uid-e2e-0001',
    traceId: TRACE_ID,
    ruleConfigVersion: 3,
    trace: {
      steps: [],
      primaryRole: 'sales',
      senderType: 'dai_ly',
      llmCalls: 1,
      brainMode: 'deepseek',
      supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
    },
    priced: {
      orderType: 'TH1',
      dealerName: 'Chị Hạnh',
      branch: 'TN',
      lines: [
        {
          skuRaw: 'ghe felix',
          sku: 'GHE-FELIX',
          productName: 'Ghế Felix',
          quantity: 2,
          unitPrice: 1_150_000,
          lineTotal: 2_300_000,
          matched: true,
        },
      ],
      itemsSubtotal: 2_300_000,
      shippingFee: 0,
      policy: 'cong_no_30',
      codCollect: false,
      codFee: 0,
      vat: false,
      vatAmount: 0,
      grandTotal: 2_300_000,
      warnings: [],
      confirmationText: 'Xác nhận đơn TN: 2 x Ghế Felix — tổng 2.300.000đ',
    },
    ...overrides,
  };
}

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
      detail: 'Chưa nhập bảng giá tháng này.',
    },
  ],
};

const SUMMARY = {
  availability: 'available',
  channelMode: 'mock',
  adminUi: 'off',
  zcaState: 'unavailable',
  botIdentity: { state: 'disabled' },
  autoSend: { enabled: false },
  orderAutomation: { enabled: true, maxAutoConfirmQuantity: 50 },
  businessBlockers: [],
  sourceTruth: { status: 'available', productCount: 19, dealerCount: 4 },
  rules: { status: 'available' },
  groups: [],
  warnings: [],
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * MAY CHU GIA CO TRANG THAI.
 *
 * `approve` doi don sang da gui + tao viec nhap don; `reject` doi sang da huy. Lan `GET /messages`
 * ke tiep doc ket qua moi — dung nhu `OrdersService` that lam. Nho vay bai kiem tra hoi duoc cau
 * "man hinh co cap nhat sau khi bam khong", chu khong chi "nut co bam duoc khong".
 */
type Role = 'SALE' | 'ACCOUNTING' | 'MANAGER' | 'ADMIN';

/**
 * `role` = chay o CHE DO PHIEN voi dung vai tro do; bo trong = che do khong dang nhap (nhu cu).
 *
 * Can che do phien that vi thanh dieu huong chi loc theo vai tro KHI biet vai tro — o che do
 * khong phien `role` la `null` va he thong co y khong giau muc nao (xem `NavigationInput`).
 */
async function mockWorkspace(page: Page, role?: Role): Promise<void> {
  const orders = new Map<string, MockOrder>([
    ['ord-1', pricedOrder()],
    [
      'ord-2',
      pricedOrder({
        id: 'ord-2',
        createdAt: '2026-09-01T02:30:00.000Z',
        groupName: 'Đại lý Ocean Park',
        dealerName: 'Anh Dũng',
        rawText: 'lay 60 ghe felix nhe',
        // 60 > nguong 50 cua goi khach: don nay la truong hop "vuot nguong tu dong gui" cua GĐ1.
        priced: {
          ...(pricedOrder().priced as MockOrder),
          lines: [
            {
              skuRaw: 'ghe felix',
              sku: 'GHE-FELIX',
              productName: 'Ghế Felix',
              quantity: 60,
              unitPrice: 1_150_000,
              lineTotal: 69_000_000,
              matched: true,
            },
          ],
          itemsSubtotal: 69_000_000,
          grandTotal: 69_000_000,
          confirmationText: 'Xác nhận đơn OCP: 60 x Ghế Felix — tổng 69.000.000đ',
        },
      }),
    ],
    [
      'ord-3',
      pricedOrder({
        id: 'ord-3',
        createdAt: '2026-09-01T01:00:00.000Z',
        status: 'sent',
        groupName: 'Đại lý Hà Nội',
        dealerName: 'Chị Mai',
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'pending',
          createdAt: '2026-09-01T01:05:00.000Z',
        },
      }),
    ],
  ]);

  await page.route('**/auth/config', (route) =>
    json(route, { mode: role ? 'session' : 'none' }),
  );
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/auth/me', (route) =>
    role
      ? json(route, {
          user: { id: 'u-1', username: 'e2e', name: `Người dùng ${role}`, role },
          roles: [role],
        })
      : json(route, { message: 'Chua dang nhap' }, 401),
  );
  await page.route('**/settings/readiness', (route) => json(route, READINESS));
  await page.route('**/settings/summary', (route) => json(route, SUMMARY));
  await page.route('**/messages', (route) => json(route, [...orders.values()]));

  await page.route('**/orders/*/approve', (route) => {
    const id = route.request().url().split('/orders/')[1]!.split('/')[0]!;
    const current = orders.get(id)!;
    const sent = {
      ...current,
      status: 'sent',
      salesHandoff: {
        action: 'manual_erp_entry',
        status: 'pending',
        createdAt: '2026-09-01T06:00:00.000Z',
      },
    };
    orders.set(id, sent);
    return json(route, sent);
  });

  await page.route('**/orders/*/reject', (route) => {
    const id = route.request().url().split('/orders/')[1]!.split('/')[0]!;
    const rejected = { ...orders.get(id)!, status: 'rejected', cancelReason: 'Sale từ chối' };
    orders.set(id, rejected);
    return json(route, rejected);
  });

  await page.route('**/orders/*/sales-handoff/complete', (route) => {
    const id = route.request().url().split('/orders/')[1]!.split('/')[0]!;
    const current = orders.get(id)!;
    const done = {
      ...current,
      salesHandoff: { ...(current.salesHandoff as MockOrder), status: 'completed' },
    };
    orders.set(id, done);
    return json(route, done);
  });
}

test('Tong quan la mot bang viec: doc duoc hom nay phai lam gi, va bam thang toi do', async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 2, name: 'Cần xử lý ngay' })).toBeVisible();
  // Ba viec: hai don cho duyet + mot don cho nhap. Con so den tu chinh bo canh bao.
  await expect(page.getByText('3 việc cần xử lý ngay')).toBeVisible();

  // Con so cua hang cho la con so THAT, va no bam duoc.
  const workload = page.getByRole('region', { name: 'Việc hôm nay' });
  await expect(workload.getByText('Chờ duyệt & gửi')).toBeVisible();

  // Mot dong viec dan THANG toi don cua no o muc Duyệt & gửi.
  await page.getByRole('region', { name: 'Cần xử lý ngay' }).getByRole('link', { name: 'Mở để duyệt' }).first().click();
  await expect(page).toHaveURL(/section=approvals&selected=ord-1/);
  await expect(page.getByRole('heading', { level: 1, name: 'Duyệt & gửi' })).toBeVisible();
});

test('Hoi thoai mo duoc tung nhom, va duong dan cua no luu lai duoc', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/?section=conversations');

  const list = page.getByRole('region', { name: 'Danh sách hội thoại' });
  await expect(list.getByRole('link', { name: /Đại lý Thái Nguyên/ })).toBeVisible();

  // Chon mot cuoc KHAC: thanh dia chi phai doi theo.
  await list.getByRole('link', { name: /Đại lý Ocean Park/ }).click();
  await expect(page).toHaveURL(/selected=%C4%90%E1%BA%A1i\+l%C3%BD\+Ocean\+Park/);

  const detail = page.getByRole('region', { name: /^Chi tiết/ });
  await expect(detail.getByRole('heading', { level: 3, name: 'Đại lý Ocean Park' })).toBeVisible();
  // Ngu canh AN TOAN: nhom, dai ly, tin goc, viec con lai cua nguoi.
  // `.first()`: ten dai ly hien o CA dau cuoc hoi thoai lan tren tung tin — dung y do.
  await expect(detail.getByText('Anh Dũng').first()).toBeVisible();
  await expect(detail.getByText('lay 60 ghe felix nhe')).toBeVisible();
  await expect(detail.getByText('Chờ người duyệt & gửi').first()).toBeVisible();

  // Mo THANG bang duong dan luu san.
  await page.goto('/?section=conversations&selected=' + encodeURIComponent('Đại lý Hà Nội'));
  await expect(
    page.getByRole('region', { name: /^Chi tiết/ }).getByRole('heading', {
      level: 3,
      name: 'Đại lý Hà Nội',
    }),
  ).toBeVisible();
});

test('Duyệt & gửi: hieu he thong dinh gui gi va vi sao can minh, roi bam gui', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/?section=approvals&selected=ord-1');

  await expect(page.getByText('2 phản hồi đang chờ người kiểm tra.')).toBeVisible();

  // 1. HE THONG DINH GUI GI — nguyen van cau se vao nhom.
  const proposal = page.getByRole('region', { name: 'Hệ thống đề xuất' });
  await expect(proposal.getByText('Bản xác nhận đơn sẽ gửi vào nhóm')).toBeVisible();
  await expect(
    proposal.getByText('Xác nhận đơn TN: 2 x Ghế Felix — tổng 2.300.000đ'),
  ).toBeVisible();

  // 2. VI SAO CAN NGUOI — bang tieng nghiep vu, khong phai mot ma trang thai.
  const reasons = page.getByRole('region', { name: 'Vì sao cần người xử lý' });
  await expect(reasons).toContainText('đang chờ người xác nhận');

  // 3. CHO AI + GOM NHUNG GI.
  await expect(page.getByRole('rowheader', { name: 'Ghế Felix' })).toBeVisible();

  // 4. Bam gui — va man hinh phai CAP NHAT theo.
  await page.getByRole('button', { name: 'Duyệt & gửi' }).click();
  await expect(page.getByText('1 phản hồi đang chờ người kiểm tra.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duyệt & gửi' })).toBeVisible();
});

test('Duyệt & gửi: don vuot nguong noi ro CA hai con so', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/?section=approvals&selected=ord-2');

  // Ly do phai noi CA hai con so. "Vượt ngưỡng" khong kem con so la mot cau nguoi duyet khong
  // kiem chung duoc, va ho se phai di tim cau hinh o mot man hinh khac de biet minh dang duyet gi.
  const reasons = page.getByRole('region', { name: 'Vì sao cần người xử lý' });
  await expect(reasons).toContainText('60');
  await expect(reasons).toContainText('50');
});

test('Từ chối: don roi khoi hang cho va doc ra la da huy o so don', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/?section=approvals&selected=ord-2');

  await page.getByRole('button', { name: 'Từ chối' }).click();
  await expect(page.getByText('1 phản hồi đang chờ người kiểm tra.')).toBeVisible();

  await page.goto('/?section=orders&selected=ord-2');
  const detail = page.getByRole('region', { name: /^Chi tiết/ });
  await expect(detail.getByText('Đã huỷ').first()).toBeVisible();
  await expect(detail.getByText('Sale từ chối')).toBeVisible();
});

test('Đơn hàng: tim duoc, loc duoc, mo ra xem duoc va danh dau da nhap don', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/?section=orders');

  await expect(page.getByText('3 đơn đã ghi nhận')).toBeVisible();

  // Tim KHONG DAU van ra nhom co dau.
  await page.getByLabel('Tìm đơn').fill('ha noi');
  await expect(page.getByText('1 / 3 đơn khớp bộ lọc đang chọn.')).toBeVisible();
  await page.getByLabel('Tìm đơn').fill('');

  // Loc theo trang thai nghiep vu.
  await page.getByRole('button', { name: 'Đã gửi · chờ nhập đơn' }).click();
  await expect(page.getByText('1 / 3 đơn khớp bộ lọc đang chọn.')).toBeVisible();

  const detail = page.getByRole('region', { name: /^Chi tiết/ });
  await expect(detail.getByRole('heading', { level: 3, name: 'Chị Mai' })).toBeVisible();
  // Dien bien nghiep vu doc duoc, va lay dau thoi gian THAT cua viec gui.
  await expect(detail.getByText('Đã gửi xác nhận vào nhóm')).toBeVisible();

  await page.getByRole('button', { name: 'Đã nhập vào phần mềm bán hàng' }).click();
  await expect(page.getByText('0 / 3 đơn khớp bộ lọc đang chọn.')).toBeVisible();
});

test('that bai KHONG bien mat: loi o lai tren man hinh cho den khi nguoi dung xu ly', async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route('**/orders/*/approve', (route) =>
    json(route, { message: 'Gửi xác nhận vào nhóm Zalo thất bại — đơn giữ nguyên' }, 503),
  );
  await page.goto('/?section=approvals&selected=ord-1');

  await page.getByRole('button', { name: 'Duyệt & gửi' }).click();

  const alert = page.locator('#b2b-main').getByRole('alert');
  await expect(alert).toContainText('Gửi xác nhận vào nhóm Zalo thất bại');
  // Don VAN nam trong hang cho — khong bien mat nhu the da gui xong.
  await expect(page.getByText('2 phản hồi đang chờ người kiểm tra.')).toBeVisible();
  // Va nut duoc mo lai de thu lai.
  await expect(page.getByRole('button', { name: 'Duyệt & gửi' })).toBeEnabled();

  await page.getByRole('button', { name: 'Ẩn thông báo' }).click();
  await expect(alert).toBeHidden();
});

test('Cảnh báo: gom du viec cua nguoi, du lieu chua san sang va tinh trang kenh', async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto('/?section=alerts');

  await expect(page.getByText(/việc cần người xử lý ngay/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cần duyệt' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cần nhập đơn' })).toBeVisible();

  const dataGroup = page.getByRole('region', { name: 'Dữ liệu / chính sách chưa sẵn sàng' });
  await expect(dataGroup.getByText('Bảng giá tháng hiện tại')).toBeVisible();
  await expect(dataGroup.getByText('COD và cước vận chuyển')).toBeVisible();

  // Che do mock KHONG bi bao dong — mot canh bao luon bat thi khong con la canh bao.
  await expect(page.getByRole('region', { name: 'Kết nối / kênh cần chú ý' })).toBeHidden();

  // Mot dong canh bao dan THANG toi don cua no.
  await page.getByRole('region', { name: 'Cần nhập đơn' }).getByRole('link', { name: 'Mở đơn' }).click();
  await expect(page).toHaveURL(/section=orders&selected=ord-3/);
});

test('mot khoi chet KHONG lam trong khoi khac — nghiep vu chua san sang van doc duoc', async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route('**/messages', (route) => json(route, { message: 'boom' }, 500));
  await page.goto('/');

  // Khoi doc tu goi khach van nguyen ven, kem LY DO cua chinh doanh nghiep.
  await expect(page.getByText('COD và cước vận chuyển', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có bảng phí COD chính thức.')).toBeVisible();
  // Cong go-live doc tu mot nguon khac cung van con.
  await expect(page.getByText('Còn 1 điều kiện bắt buộc chưa đạt trước khi chạy thật.')).toBeVisible();
  // Va khoi hong thi noi ro la hong, bang tieng nguoi.
  await expect(
    page.getByRole('region', { name: 'Cần xử lý ngay' }).getByRole('alert'),
  ).toContainText('Chưa tải được việc cần xử lý');

  // Muc Cảnh báo cung phai noi RO nguon nao chua doc duoc, roi van hien phan con lai.
  await page.goto('/?section=alerts');
  await expect(page.getByText(/Chưa đọc được việc đang chờ người xử lý/)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Dữ liệu / chính sách chưa sẵn sàng' }),
  ).toBeVisible();
});

test('KHONG mot khai niem ky thuat nao lot len hanh trinh chinh', async ({ page }) => {
  await mockWorkspace(page);

  const journey = [
    '',
    '?section=conversations',
    '?section=conversations&selected=' + encodeURIComponent('Đại lý Thái Nguyên'),
    '?section=approvals',
    '?section=approvals&selected=ord-1',
    '?section=orders',
    '?section=orders&selected=ord-3',
    '?section=alerts',
  ];

  for (const step of journey) {
    await page.goto(`/${step}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const forbidden of [
      'traceid',
      'spanid',
      'workflowrun',
      'ruleconfigversion',
      'auto_send',
      'chatid',
      'chat-e2e',
      'uid-e2e',
      'senderexternalid',
      'deepseek',
      'llmcalls',
      'brainmode',
      'orchestrator',
      'prompt',
      'pending_review',
      'needs_edit',
    ]) {
      expect(body, `buoc "${step || 'overview'}" khong duoc chua ${forbidden}`).not.toContain(
        forbidden,
      );
    }
    expect(body, `buoc "${step || 'overview'}" khong duoc chua dinh danh luot xu ly`).not.toMatch(
      /\b[0-9a-f]{32}\b/,
    );
  }
});

test('man hinh hep van bam duyet duoc — hang viec khong bi cat mat', async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/?section=approvals&selected=ord-1');

  await expect(page.getByRole('button', { name: 'Duyệt & gửi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Từ chối' })).toBeVisible();
  await page.getByRole('button', { name: 'Duyệt & gửi' }).click();
  await expect(page.getByText('1 phản hồi đang chờ người kiểm tra.')).toBeVisible();
});

test('ban phim di het duoc hang cho, va o dang chon doc ra duoc', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/?section=approvals&selected=ord-1');

  const list = page.getByRole('region', { name: 'Danh sách chờ duyệt' });
  const second = list.getByRole('link').nth(1);
  await second.focus();
  await expect(second).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(list.getByRole('link').nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Duyệt & gửi' })).toBeVisible();
});

/**
 * BAT BIEN DIEU HUONG THEO VAI TRO — bo chan hoi quy cua review chan PR #111.
 *
 * Khiem khuyet goc: `Cảnh báo` mo cho `ACCOUNTING`, nhung canh bao "Cần duyệt" van deo mot duong
 * dan toi `approvals`, va `goTo()` ghi thang muc duoc yeu cau ma khong qua phep giai theo vai
 * tro. Ke toan bam vao la vao thang mot luong viec khong phai cua ho — trong khi cung nguoi do
 * mo bang bookmark thi bi chan. Hai duong vao, hai cau tra loi.
 *
 * Bo nay do CA HAI duong vao, cho CA hai phia cua ranh gioi.
 */

test('KE TOAN mo duoc muc Cảnh báo', async ({ page }) => {
  await mockWorkspace(page, 'ACCOUNTING');
  await page.goto('/?section=alerts');

  await expect(page.getByRole('heading', { level: 1, name: 'Cảnh báo' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cần duyệt' })).toBeVisible();
  // Thanh dieu huong xac nhan dung vai tro dang duoc ap.
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(nav.getByRole('link', { name: 'Cảnh báo', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Duyệt & gửi', exact: true })).toBeHidden();
});

test('KE TOAN khong the di tu canh bao "Cần duyệt" vao Duyệt & gửi', async ({ page }) => {
  await mockWorkspace(page, 'ACCOUNTING');
  await page.goto('/?section=alerts');

  // Dong canh bao VAN hien — do la boi canh doi soat cua ke toan.
  const approvals = page.getByRole('region', { name: 'Cần duyệt' });
  await expect(approvals.getByText('Chị Hạnh')).toBeVisible();
  // Nhung khong co cai nut nao dua ho vao do.
  await expect(approvals.getByRole('link', { name: 'Mở để duyệt' })).toHaveCount(0);

  // Va viec cua chinh ho thi VAN co duong di.
  await expect(
    page.getByRole('region', { name: 'Cần nhập đơn' }).getByRole('link', { name: 'Mở đơn' }),
  ).toBeVisible();
});

test('KE TOAN mo deep-link thang toi Duyệt & gửi van bi chan', async ({ page }) => {
  await mockWorkspace(page, 'ACCOUNTING');
  await page.goto('/?section=approvals&selected=ord-1');

  // Roi ve Tong quan, khong render mot trang trong va khong lo mot cai nut nao.
  await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duyệt & gửi' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Từ chối' })).toHaveCount(0);
});

test('KE TOAN: con so "Chờ duyệt & gửi" tren Tong quan doc duoc nhung khong bam duoc', async ({
  page,
}) => {
  await mockWorkspace(page, 'ACCOUNTING');
  await page.goto('/');

  const workload = page.getByRole('region', { name: 'Việc hôm nay' });
  await expect(workload.getByText('Chờ duyệt & gửi')).toBeVisible();
  await expect(workload.getByRole('link', { name: /Chờ duyệt & gửi/ })).toHaveCount(0);
  // Con so cua chinh ho thi van bam duoc.
  await expect(workload.getByRole('link', { name: /Chờ nhập đơn/ })).toBeVisible();

  // Va hang viec khong giao viec duyet cho ho.
  const urgent = page.getByRole('region', { name: 'Cần xử lý ngay' });
  await expect(urgent.getByRole('link', { name: 'Mở để duyệt' })).toHaveCount(0);
  await expect(urgent.getByRole('link', { name: 'Mở đơn' })).toBeVisible();
});

for (const role of ['SALE', 'MANAGER', 'ADMIN'] as const) {
  test(`${role} van di tu canh bao vao Duyệt & gửi va thao tac binh thuong`, async ({ page }) => {
    await mockWorkspace(page, role);
    await page.goto('/?section=alerts');

    await page
      .getByRole('region', { name: 'Cần duyệt' })
      .getByRole('link', { name: 'Mở để duyệt' })
      .first()
      .click();

    await expect(page).toHaveURL(/section=approvals&selected=ord-1/);
    await expect(page.getByRole('heading', { level: 1, name: 'Duyệt & gửi' })).toBeVisible();

    // Va luong viec chay tron ven, khong chi mo duoc man hinh.
    await page.getByRole('button', { name: 'Duyệt & gửi' }).click();
    await expect(page.getByText('1 phản hồi đang chờ người kiểm tra.')).toBeVisible();
  });
}

/**
 * BAT BIEN TONG QUAT: khong mot duong dan NAO tren man hinh tro toi muc ma vai tro dang xem khong
 * mo duoc.
 *
 * Bai o tren do dung mot duong dan cu the (nut "Mở để duyệt"). Bai nay quet TOAN BO cac thẻ liên
 * kết dieu huong dang render, nen no con do duoc mot be mat duong dan CHUA TON TAI hom nay: ai
 * them mot nut moi ma quen di qua phep kiem theo vai tro se lam bai nay do, khong can ai nho ra
 * de viet them mot bai rieng.
 *
 * Day la thu duy nhat ngan khiem khuyet cua PR #111 quay lai duoi mot cai ten khac.
 */
test('KHONG duong dan nao tren man hinh tro toi muc ke toan khong mo duoc', async ({ page }) => {
  await mockWorkspace(page, 'ACCOUNTING');

  // `approvals` + `conversations` la hai muc `ACCOUNTING` khong co trong luong viec.
  const forbidden = ['approvals', 'conversations'];

  for (const step of ['', '?section=alerts', '?section=orders', '?section=policies']) {
    await page.goto(`/${step}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const targets = await page.locator('a[href*="section="]').evaluateAll((nodes) =>
      nodes.map((node) => new URL((node as HTMLAnchorElement).href).searchParams.get('section')),
    );
    for (const target of targets) {
      expect(
        forbidden,
        `buoc "${step || 'overview'}" de lot mot duong dan toi "${target}"`,
      ).not.toContain(target);
    }
  }
});

test('SALE thi chinh nhung duong dan do PHAI co — bai tren khong xanh nho man hinh trong', async ({
  page,
}) => {
  await mockWorkspace(page, 'SALE');
  await page.goto('/?section=alerts');

  const targets = await page.locator('a[href*="section="]').evaluateAll((nodes) =>
    nodes.map((node) => new URL((node as HTMLAnchorElement).href).searchParams.get('section')),
  );
  expect(targets).toContain('approvals');
  expect(targets).toContain('conversations');
});
