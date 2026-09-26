import { readFileSync } from 'node:fs';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * #398 — TAI XE NHAN CHUYEN TRUC TIEP tren PWA (Chromium, man dien thoai), API + Postgres THAT.
 *
 * Bon dieu phai thay tren CHINH ban xuat web ma lai xe cai:
 *
 *   1. khong mang -> "Can mang de nhan chuyen…", KHONG bao thanh cong, KHONG ghi gi o may chu;
 *   2. duong thuong: Viec -> Nhan chuyen -> dia diem -> diem giao -> "Da nhan chuyen" -> ve Viec; Giam
 *      doc thay don trong "Hom nay" va hang viec can quyet KHONG tang;
 *   3. chua biet diem giao -> viec vao "Can xu ly" (hang viec +1) va KHONG co don nao bi bia;
 *   4. bao bat thuong / huy tren chi tiet: ly do bat buoc, may chu noi that ket cuc.
 *
 * Vi tri la GIA LAP (Playwright `geolocation`), dat DUNG nha may co hang rao trong ban gieo — noi ro
 * trong bang chung. The gioi du lieu den tu `tools/mobile-smoke/prepare.mjs` (`E2E_FIXTURE`).
 */

interface Fixture {
  readonly api: string;
  readonly director: string;
  readonly pickup: {
    readonly label: string;
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly intake: {
    readonly driver: { readonly login: string; readonly name: string; readonly plate: string };
    readonly reviewDriver: {
      readonly login: string;
      readonly name: string;
      readonly plate: string;
    };
    readonly pickupSite: string;
    readonly destination: { readonly placeId: string; readonly name: string };
  };
}

const fixture = JSON.parse(readFileSync(process.env.E2E_FIXTURE ?? '', 'utf8')) as Fixture;
const PASSWORD = process.env.E2E_PASSWORD ?? process.env.SMOKE_PASSWORD ?? '';
const API = (process.env.E2E_API_URL ?? fixture.api).replace(/\/+$/, '');

test.describe.configure({ mode: 'serial' });

let office: APIRequestContext;
let baselineQueueTotal = 0;
let autoOrder: { readonly orderId: string; readonly orderCode: string; readonly intakeId: string };

/**
 * `/auth/native/session` chiu gioi han 5 lan/60 giay MOI IP, va `prepare.mjs` vua dang nhap DUNG 5
 * tai khoan tu cung may ngay truoc do. Khi ban xuat web + Chromium xong trong duoi mot phut, lan nay
 * la lan thu 6 -> 429 (run 36225231902). Cho het cua so theo `Retry-After` cua may chu, KHONG noi gioi
 * han dang nhap cua san pham.
 */
const LOGIN_WINDOW_MS = 75_000;

async function nativeSession(probe: APIRequestContext): Promise<APIResponse> {
  const deadline = Date.now() + LOGIN_WINDOW_MS;
  for (;;) {
    const response = await probe.post('/auth/native/session', {
      headers: { 'x-nexagnet-client': 'e2e/pwa-site-intake' },
      data: { username: fixture.director, password: PASSWORD },
    });
    if (response.status() !== 429 || Date.now() >= deadline) return response;
    const retryAfter = Number(response.headers()['retry-after']);
    const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5;
    await new Promise((done) => setTimeout(done, Math.min(waitSeconds, 30) * 1_000));
  }
}

async function officeApi(): Promise<APIRequestContext> {
  const probe = await playwrightRequest.newContext({ baseURL: API });
  const session = await nativeSession(probe);
  expect(session.ok(), `dang nhap Giam doc -> HTTP ${session.status()}`).toBeTruthy();
  const { sessionToken } = (await session.json()) as { sessionToken: string };
  await probe.dispose();
  return playwrightRequest.newContext({
    baseURL: API,
    extraHTTPHeaders: {
      authorization: `Bearer ${sessionToken}`,
      'x-nexagnet-client': 'e2e/pwa-site-intake',
    },
  });
}

async function queueTotal(): Promise<number> {
  const tower = (await (await office.get('/transport/control-tower')).json()) as {
    queueTotal: number;
  };
  return tower.queueTotal;
}

async function driverContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    geolocation: {
      latitude: fixture.pickup.latitude,
      longitude: fixture.pickup.longitude,
      accuracy: 10,
    },
    permissions: ['geolocation'],
  });
}

/**
 * Dat LAI vi tri gia lap ngay truoc khi nhan chuyen. Chromium giu NGUYEN dau thoi gian cua ban dinh
 * vi gia lap tu luc dat, nen tuoi cua no tang theo thoi gian chay bai — va tu `#398` ung dung xin lai
 * vi tri qua 120 giay, may chu tu choi qua 300 giay. Dat lai o day giu ban dinh vi "vua doc" dung
 * nhu tren dien thoai that.
 */
async function freshFix(context: BrowserContext): Promise<void> {
  await context.setGeolocation({
    latitude: fixture.pickup.latitude,
    longitude: fixture.pickup.longitude,
    accuracy: 10,
  });
}

async function signIn(page: Page, username: string): Promise<void> {
  await page.goto('/');
  const server = page.getByTestId('server-address');
  if (await server.isVisible().catch(() => false)) {
    await server.fill(new URL(page.url()).origin);
    await page.getByTestId('server-continue').click();
  }
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-screen')).toHaveCount(0, { timeout: 45_000 });
}

test.beforeAll(async () => {
  expect(PASSWORD.length).toBeGreaterThanOrEqual(12);
  office = await officeApi();
  baselineQueueTotal = await queueTotal();
});

test.afterAll(async () => {
  await office?.dispose();
});

test('khong mang: KHONG bao thanh cong, KHONG tao gi o may chu', async ({ browser }) => {
  const context = await driverContext(browser);
  const page = await context.newPage();
  await signIn(page, fixture.intake.reviewDriver.login);
  await expect(page.getByTestId('driver-site-intake-start')).toBeVisible({ timeout: 45_000 });

  await context.setOffline(true);
  await freshFix(context);
  await page.getByTestId('driver-site-intake-start').click();
  await expect(page.getByTestId('site-intake-offline')).toBeVisible();
  await expect(page.getByText('Cần mạng để nhận chuyến tại địa điểm này')).toBeVisible();
  await expect(page.getByTestId('site-intake-done')).toHaveCount(0);
  await page.screenshot({ path: 'e2e-results/pwa-01-khong-mang.png', fullPage: true });
  await context.setOffline(false);

  // May chu KHONG co viec nao cua lai xe nay.
  const pending = (await (await office.get('/transport/site-intakes?status=PENDING')).json()) as {
    driver: { name: string | null };
  }[];
  expect(
    pending.filter((item) => item.driver.name === fixture.intake.reviewDriver.name),
  ).toHaveLength(0);
  await context.close();
});

test('duong thuong: Viec -> Nhan chuyen -> diem giao -> Da nhan chuyen; hang viec can quyet KHONG tang', async ({
  browser,
}) => {
  const context = await driverContext(browser);
  const page = await context.newPage();
  await signIn(page, fixture.intake.driver.login);

  // Bon tab — khong co tab thu nam.
  for (const tab of ['Việc', 'Bản đồ', 'Nhiên liệu', 'Tiền']) {
    await expect(
      page
        .getByRole('tab', { name: tab })
        .or(page.getByText(tab, { exact: true }))
        .first(),
    ).toBeVisible();
  }
  await expect(page.getByText('tạm thời dùng bản web')).toHaveCount(0);
  await expect(page.getByText('Bạn được gọi đi lấy hàng?')).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: 'e2e-results/pwa-02-viec-chua-co-viec.png', fullPage: true });

  await freshFix(context);
  await page.getByTestId('driver-site-intake-start').click();
  await expect(page.getByTestId('site-intake-confirm')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(fixture.intake.pickupSite).first()).toBeVisible();
  await expect(page.getByText('Nhận chuyến tại đây')).toBeVisible();
  await expect(page.getByText('Tạo chuyến')).toHaveCount(0);
  await page.screenshot({ path: 'e2e-results/pwa-03-de-nghi-dia-diem.png', fullPage: true });
  await page.getByTestId('site-intake-confirm').click();

  await expect(page.getByText('Giao tới đâu?')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('site-intake-destination-choose').click();
  await page
    .getByTestId(`site-intake-destination-option-${fixture.intake.destination.placeId}`)
    .click();
  await page.screenshot({ path: 'e2e-results/pwa-04-chon-diem-giao.png', fullPage: true });
  await page.getByTestId('site-intake-destination-submit').click();

  await expect(page.getByTestId('site-intake-done')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Đã nhận chuyến')).toBeVisible();
  await page.screenshot({ path: 'e2e-results/pwa-05-da-nhan-chuyen.png', fullPage: true });
  await page.getByTestId('site-intake-back-to-work').click();
  await expect(page.getByTestId('driver-work')).toBeVisible();
  await expect(page.getByTestId('driver-site-intake-start')).toHaveCount(0, { timeout: 30_000 });
  await page.screenshot({ path: 'e2e-results/pwa-06-ve-viec.png', fullPage: true });
  await context.close();

  // May chu: DUNG mot don tu tao, nhan dung chang cua lan nhan viec; hang viec KHONG tang.
  const activity = (await (
    await office.get('/transport/site-intakes/activity?hours=24')
  ).json()) as {
    driverName: string;
    orderId: string;
    orderCode: string;
    intakeId: string;
    bindingMode: string;
  }[];
  const mine = activity.filter((item) => item.driverName === fixture.intake.driver.name);
  expect(mine).toHaveLength(1);
  expect(mine[0]?.bindingMode).toBe('AUTO_CREATED');
  autoOrder = {
    orderId: mine[0]!.orderId,
    orderCode: mine[0]!.orderCode,
    intakeId: mine[0]!.intakeId,
  };

  const intake = (await (
    await office.get(`/transport/site-intakes/${autoOrder.intakeId}`)
  ).json()) as {
    leg: { id: string };
    run: { id: string };
  };
  const legs = (await (await office.get(`/transport/orders/${autoOrder.orderId}/legs`)).json()) as {
    id: string;
  }[];
  expect(legs.map((leg) => leg.id)).toEqual([intake.leg.id]);
  const order = (await (await office.get(`/transport/orders/${autoOrder.orderId}`)).json()) as {
    freightAmount: number | null;
    customerId: string | null;
  };
  expect(order.freightAmount).toBeNull();
  expect(order.customerId).toBeNull();
  expect(await queueTotal()).toBe(baselineQueueTotal);
});

test('giam doc: "Don moi tu tai xe" o Hom nay, mo don thay nguon tu tai xe — khong nut duyet', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, fixture.director);
  const news = page.getByTestId('director-driver-orders');
  await expect(news).toBeVisible({ timeout: 45_000 });
  const card = page.getByTestId(`director-driver-order-${autoOrder.orderCode}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText(fixture.intake.driver.name);
  await expect(card).toContainText(fixture.intake.driver.plate);
  await expect(page.getByText(/Duyệt đơn|Phê duyệt/)).toHaveCount(0);
  await page.screenshot({ path: 'e2e-results/pwa-07-giam-doc-hom-nay.png', fullPage: true });

  // Reload van con: ban tin doc tu may chu, khong phai mot thong bao chop tat.
  await page.reload();
  await expect(page.getByTestId(`director-driver-order-${autoOrder.orderCode}`)).toBeVisible({
    timeout: 45_000,
  });

  await card.getByText('Xem đơn').click();
  await expect(page.getByTestId('order-driver-source')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tạo từ xác nhận của tài xế')).toBeVisible();
  await page.screenshot({
    path: 'e2e-results/pwa-08-chi-tiet-don-nguon-tai-xe.png',
    fullPage: true,
  });
  await context.close();
});

test('chua biet diem giao -> Can xu ly (+1), khong don bia; bao bat thuong can ly do va noi that ket cuc', async ({
  browser,
}) => {
  const driverCtx = await driverContext(browser);
  const driverPage = await driverCtx.newPage();
  await signIn(driverPage, fixture.intake.reviewDriver.login);
  await freshFix(driverCtx);
  await driverPage.getByTestId('driver-site-intake-start').click();
  await expect(driverPage.getByTestId('site-intake-confirm')).toBeVisible({ timeout: 45_000 });
  await driverPage.getByTestId('site-intake-confirm').click();
  await driverPage.getByTestId('site-intake-destination-unknown').click();
  await expect(driverPage.getByTestId('site-intake-done')).toBeVisible({ timeout: 30_000 });
  await expect(driverPage.getByText(/văn phòng sẽ bổ sung/i)).toBeVisible();
  await driverPage.screenshot({
    path: 'e2e-results/pwa-09-chua-biet-diem-giao.png',
    fullPage: true,
  });
  await driverCtx.close();

  expect(await queueTotal()).toBe(baselineQueueTotal + 1);

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, fixture.director);
  await page.getByText('Cần xử lý', { exact: true }).first().click();
  const item = page.getByText('Việc tài xế nhận trực tiếp chưa đủ thông tin').first();
  await expect(item).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/điểm giao/).first()).toBeVisible();
  await page.screenshot({ path: 'e2e-results/pwa-10-can-xu-ly.png', fullPage: true });

  await item.click();
  await expect(page.getByTestId('site-intake-review-sheet')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('site-intake-exception-open').click();
  // Ly do BAT BUOC: nut gui khong di khi chua co ly do.
  await expect(page.getByTestId('site-intake-exception-submit')).toBeDisabled();
  await page.getByTestId('site-intake-exception-reason').fill('Sếp không gọi xe này — nhầm việc');
  await page.getByTestId('site-intake-exception-submit').click();
  await expect(page.getByText(/Xe chưa chạy/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'e2e-results/pwa-11-bao-bat-thuong.png', fullPage: true });
  await context.close();

  expect(await queueTotal()).toBe(baselineQueueTotal);
});
