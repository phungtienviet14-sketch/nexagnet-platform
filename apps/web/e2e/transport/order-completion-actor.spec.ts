import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * `#334` (UAT BUG-04) — NGUOI QUYET tren man "Ket thuc don" la mot CON NGUOI, khong phai mot ma.
 *
 * ================================================================================================
 * DIEU BO BAI NAY DO
 * ================================================================================================
 *
 * UAT 20–21/09/2026 thay cot "Người quyết" in nguyen van `cmu6cius10000p91cob6nwivs` — ma tai khoan
 * THO cua ke toan. Ma do la su that kiem toan va PHAI di nguyen ve man hinh (trong `decidedBy`),
 * nhung nhan con nguoi doc la `decidedByActor.label` ma may chu da phan giai tu nguon tai khoan.
 *
 * Nen ban gia lap duoi day tra ve CA HAI, dung hinh dang may chu tra: neu man hinh lai doc nham
 * truong tho, ma tho se hien ra va bai do. Ma dung lam neo la CHINH ma UAT quan sat duoc.
 *
 * Ba danh tinh, ba nhanh cua phep phan giai:
 *
 *   · tai khoan con ton tai          → ten nguoi dung;
 *   · tai khoan da xoa / khong thay   → cau du phong, KHONG phai ma;
 *   · tac nhan gieo du lieu mau       → "Dữ liệu khởi tạo", khong phai chu `demo-seed`.
 *
 * Ten ke toan CO Y khong phai ten persona mau nao: man hinh phai in DUNG cai may chu tra, khong
 * duoc tu dien mot ten quen thuoc.
 */

/** Ma UAT quan sat duoc — tai khoan ke toan con hoat dong. */
const KNOWN_ACTOR_ID = 'cmu6cius10000p91cob6nwivs';
/** Mot tai khoan da bi xoa khoi nguon tai khoan. */
const MISSING_ACTOR_ID = 'cmu6d0ld80003p91cxk2mzq7h';
const SEED_ACTOR_ID = 'demo-seed';

const KNOWN_LABEL = 'Nguyễn Thu Hà';
const MISSING_LABEL = 'Tài khoản không còn hoạt động';
const SEED_LABEL = 'Dữ liệu khởi tạo';

/** Hinh dang ma cuid (25 ky tu, bat dau bang `c`) — khong mot o nao duoc in mot ma nhu vay. */
const CUID_SHAPE = /\bc[a-z0-9]{24}\b/;

const actor = (id: string, label: string, kind: string) => ({ id, label, kind });
const KNOWN = actor(KNOWN_ACTOR_ID, KNOWN_LABEL, 'USER');
const MISSING = actor(MISSING_ACTOR_ID, MISSING_LABEL, 'UNRESOLVED');
const SEED = actor(SEED_ACTOR_ID, SEED_LABEL, 'SEED_DATA');

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

const queueRow = (
  orderId: string,
  orderCode: string,
  decided: { readonly id: string; readonly label: string; readonly kind: string },
) => ({
  acceptanceId: `acc-${orderId}`,
  orderId,
  orderCode,
  orderStatus: 'FULFILLED',
  customerId: null,
  originLabel: 'Kho Hải Phòng',
  destinationLabel: 'Ninh Bình',
  state: 'APPROVED',
  counterpartyId: null,
  businessDate: '2026-09-20',
  evidenceCount: 0,
  settlementEligible: true,
  runCode: null,
  vehicleId: null,
  latestDecidedAt: '2026-09-20T09:30:00.000Z',
  latestDecidedBy: decided.id,
  latestDecidedByActor: decided,
});

const decision = (
  orderId: string,
  sequence: number,
  outcome: string,
  decided: { readonly id: string; readonly label: string; readonly kind: string },
) => ({
  id: `dec-${orderId}-${sequence}`,
  acceptanceId: `acc-${orderId}`,
  sequence,
  outcome,
  reasonCode: outcome === 'APPROVED' ? 'DOCUMENT_RECEIVED' : 'DOCUMENT_INCOMPLETE',
  basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
  evidenceRefs: [],
  externalNote: 'Đã nhận biên bản giao hàng có chữ ký',
  supersedesId: sequence === 1 ? null : `dec-${orderId}-${sequence - 1}`,
  idempotencyKey: `idem-${orderId}-${sequence}`,
  decidedBy: decided.id,
  decidedByActor: decided,
  decidedAt: `2026-09-20T0${sequence + 7}:00:00.000Z`,
});

/**
 * Lich su cua don `ORD-A`: tai khoan da xoa ghi lan dau, ke toan con hoat dong sua lai. Hai danh
 * tinh khac nhau trong CUNG mot bang — mot man hinh in nham truong se lo ca hai ma.
 */
const HISTORY: Readonly<Record<string, unknown>> = {
  'ord-a': {
    acceptance: {
      id: 'acc-ord-a',
      orderId: 'ord-a',
      state: 'APPROVED',
      counterpartyId: null,
      businessDate: '2026-09-20',
      latestDecisionId: 'dec-ord-a-2',
      openedBy: MISSING_ACTOR_ID,
      createdAt: '2026-09-20T08:00:00.000Z',
      updatedAt: '2026-09-20T09:00:00.000Z',
    },
    decisions: [
      decision('ord-a', 1, 'NEEDS_CORRECTION', MISSING),
      decision('ord-a', 2, 'APPROVED', KNOWN),
    ],
  },
};

async function mockOrderCompletion(page: Page): Promise<void> {
  await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'bug-04-csrf' }));
  await page.route('**/auth/me', (route) =>
    json(route, {
      user: { id: 'phien-ke-toan', username: 'ke-toan-ha', name: KNOWN_LABEL, role: 'ACCOUNTING' },
      roles: ['ACCOUNTING'],
    }),
  );
  await page.route('**/transport/commercial-acceptance', (route) =>
    json(route, {
      acceptances: [
        queueRow('ord-a', 'BUG04-A', KNOWN),
        queueRow('ord-b', 'BUG04-B', MISSING),
        queueRow('ord-c', 'BUG04-C', SEED),
      ],
    }),
  );
  await page.route('**/transport/commercial-acceptance/orders/*', (route) => {
    const orderId = /orders\/([^/?]+)/.exec(route.request().url())?.[1] ?? '';
    return json(route, HISTORY[orderId] ?? { acceptance: null, decisions: [] });
  });
  await page.route('**/transport/orders/*/documents', (route) => json(route, []));
}

const decidedCell = (page: Page, orderCode: string) =>
  page.getByRole('row').filter({ hasText: orderCode }).getByRole('cell').nth(7);

test.describe('#334 — nguoi quyet la mot ten, khong phai mot ma', () => {
  test('hang cho va lich su in ten nguoi quyet; khong o nao in ma tai khoan tho', async ({
    page,
  }) => {
    await mockOrderCompletion(page);
    await page.goto('/?section=order-completion');

    const queue = page.getByRole('table', { name: 'Đơn chờ kết thúc' });
    await expect(queue).toBeVisible();
    await expect(queue.getByRole('columnheader', { name: 'Người quyết / lúc' })).toBeVisible();

    /* --- 1. Cot "Người quyết / lúc" cua hang cho --- */
    await expect(decidedCell(page, 'BUG04-A')).toContainText(KNOWN_LABEL);
    await expect(decidedCell(page, 'BUG04-B')).toContainText(MISSING_LABEL);
    await expect(decidedCell(page, 'BUG04-C')).toContainText(SEED_LABEL);

    /* --- 2. Lich su quyet dinh cua mot don --- */
    await page
      .getByRole('row')
      .filter({ hasText: 'BUG04-A' })
      .getByRole('button', { name: 'Cần bổ sung' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Cần bổ sung đơn BUG04-A?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Quay lại' }).click();
    await expect(dialog).toHaveCount(0);

    const history = page.getByRole('table', { name: 'Lịch sử quyết định của đơn vừa mở' });
    await expect(history).toBeVisible();
    const historyRows = history.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(historyRows).toHaveCount(2);
    await expect(historyRows.nth(0)).toContainText(MISSING_LABEL);
    await expect(historyRows.nth(1)).toContainText(KNOWN_LABEL);

    /* --- 3. Khong o nao tren trang in mot ma tai khoan tho --- */
    const body = await page.locator('body').innerText();
    expect(body, 'ma tai khoan con hoat dong').not.toContain(KNOWN_ACTOR_ID);
    expect(body, 'ma tai khoan da xoa').not.toContain(MISSING_ACTOR_ID);
    expect(body, 'tac nhan gieo du lieu').not.toContain(SEED_ACTOR_ID);
    expect(body, 'mot ma co hinh dang cuid').not.toMatch(CUID_SHAPE);
  });
});
