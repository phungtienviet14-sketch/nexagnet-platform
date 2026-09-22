import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * UAT BUG-03/05 (`#333`) — VONG CHAY DA KET THUC KHONG CON O CHON TEP NAO TREN MAN HINH HIEN TRUONG.
 *
 * ==============================================================================================
 * HINH DANG CHU XE GAP TREN `transport-preview`
 *
 * Chang da `Khach da nhan hang`, chua chup bien nhan — nen may chu chao `Chup bien nhan giao hang`
 * cung mot o chon tep. Luot quet (`RunClosureSweepScheduler`) dong vong chay BAT DONG BO, sau lan
 * doc cuoi cua man hinh. Man hinh khong bao gio doc lai: `refetchOnWindowFocus` tat o cap ung
 * dung, khong co nhip lam moi, va mot lan bi tu choi cung khong lam no doc lai. O chon tep va nut
 * nam do mai; bam vao thi may chu moi noi `DOCUMENT_RUN_TERMINAL` — bang mot cau khong dau.
 *
 * ==============================================================================================
 * BAI NAY KIEM DIEU GI
 *
 *   1. May chu noi vong chay da ket thuc thi man hinh KHONG ve o chon tep/nut nao.
 *   2. Man hinh cu bam SAU khi luot quet dong: may chu van tu choi (khong noi cong), cau tu choi co
 *      dau hien NGUYEN VAN, va man hinh DOC LAI mo hinh cua may chu — the cu bien mat.
 *   3. Quay lai man hinh sau khi vong chay dong: the cu tu bien mat, KHONG mot lan tai tep nao.
 *   4. Nhip lam moi moi khong duoc bien mot lan mat song thanh mot man hinh trang loi.
 *
 * May chu o day la GIA. Cong `DOCUMENT_RUN_TERMINAL` that duoc do o
 * `apps/api/src/transport/document/document.service.spec.ts`, va read model o
 * `apps/api/src/transport/field/field-terminal-run.spec.ts`.
 */

const AT = '2026-09-21T03:00:00.000Z';
const TERMINAL_MESSAGE = 'Vòng chạy đã kết thúc — không ghi thêm chứng từ được nữa.';
const RECEIPT_LABEL = 'Chụp biên nhận giao hàng';

interface ServerState {
  /** Luot quet da dong vong chay chua — lan doc `field-work` KE TIEP se thay. */
  closed: boolean;
  /**
   * Khi vong chay da dong, kho CO lo no ra khong. Kho that thi KHONG (`listOpenRunsForDriver` loc
   * `PLANNED`/`ACTIVE`); `true` do lop thu hai — the van den nhung `nextActions` rong.
   */
  leakTerminal: boolean;
  /** Moi lan doc `field-work` tra 503 — mat song giua chung. */
  readsFailing: boolean;
  fieldReads: number;
  uploads: number;
  readonly documents: { readonly clientEventId: string; readonly type: string }[];
}

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

const RECEIPT_ACTION = {
  kind: 'DOCUMENT',
  label: RECEIPT_LABEL,
  documentType: 'DELIVERY_RECEIPT',
  requiresLocation: false,
  required: true,
};

/** Chang da giao xong, chua chup bien nhan — diem xuat phat cua UAT. */
const deliveredLeg = (nextActions: readonly unknown[]) => ({
  legId: 'leg-1',
  sequence: 1,
  kind: 'LOADED',
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  orderCode: 'ORD-1',
  orderId: 'ord-1',
  phase: 'DELIVERED',
  recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED'],
  arrivalCheckpointId: 'cp-arrival',
  waiting: null,
  documents: [],
  missingDocumentTypes: ['DELIVERY_RECEIPT'],
  receiptHandover: null,
  nextActions,
});

async function mockServer(page: Page, initial: Partial<ServerState> = {}): Promise<ServerState> {
  const state: ServerState = {
    closed: false,
    leakTerminal: false,
    readsFailing: false,
    fieldReads: 0,
    uploads: 0,
    documents: [],
    ...initial,
  };

  await page.route('**/auth/me', (route) =>
    json(route, { user: { id: 'u-driver', name: 'Lai xe Binh', role: 'SALE' }, roles: ['SALE'] }),
  );
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/transport/me/trips', (route) => json(route, []));

  await page.route('**/transport/me/field-work', async (route) => {
    state.fieldReads += 1;
    if (state.readsFailing) {
      await json(route, { message: 'Mất kết nối tạm thời' }, 503);
      return;
    }
    const runs = !state.closed
      ? [{ runId: 'run-1', runCode: 'VC-001', legs: [deliveredLeg([RECEIPT_ACTION])] }]
      : state.leakTerminal
        ? [{ runId: 'run-1', runCode: 'VC-001', legs: [deliveredLeg([])] }]
        : [];
    await json(route, { serverNow: AT, runs });
  });

  await page.route('**/files', async (route) => {
    state.uploads += 1;
    await json(
      route,
      {
        id: 'file-1',
        filename: 'bien-nhan.png',
        contentType: 'image/png',
        byteSize: 4,
        state: 'READY',
      },
      201,
    );
  });

  await page.route('**/transport/me/documents', async (route) => {
    const body = route.request().postDataJSON() as { clientEventId: string; type: string };
    state.documents.push({ clientEventId: body.clientEventId, type: body.type });
    // CONG CUA MAY CHU — khong noi long: vong chay da dong thi `DOCUMENT_RUN_TERMINAL`, 409.
    if (state.closed) {
      await json(route, { statusCode: 409, message: TERMINAL_MESSAGE, error: 'Conflict' }, 409);
      return;
    }
    await json(route, { id: 'doc-1' }, 201);
  });

  return state;
}

/** 30 giay: bai dau tien cua cau hinh tra tien bien dich cua `next dev` — xem `field-location-checkpoint.spec.ts`. */
const openField = async (page: Page): Promise<void> => {
  await page.goto('/?surface=driver&screen=field');
  await expect(page.getByTestId('field-headline')).toBeVisible({ timeout: 30_000 });
};

/** Mot lan lai xe quay lai man hinh — dung su kien ma `focusManager` cua react-query nghe. */
const returnToScreen = async (page: Page): Promise<void> => {
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
};

const expectNoDocumentAction = async (page: Page): Promise<void> => {
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByTestId('field-action')).toHaveCount(0);
  await expect(page.getByRole('button', { name: RECEIPT_LABEL })).toHaveCount(0);
};

test.describe('hien truong cua vong chay da ket thuc — #333 BUG-03/05', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const leakTerminal of [false, true]) {
    test(`may chu noi vong chay da ket thuc (${leakTerminal ? 'the van den, nut rong' : 'the khong con'}): khong o chon tep, khong nut chup`, async ({
      page,
    }) => {
      await mockServer(page, { closed: true, leakTerminal });
      await openField(page);

      await expect(page.getByText('Không còn việc nào cần bấm ngay.')).toBeVisible();
      await expectNoDocumentAction(page);
    });
  }

  test('man hinh cu bam SAU khi luot quet dong: may chu van tu choi, cau co dau, va the cu bien mat', async ({
    page,
  }) => {
    const state = await mockServer(page);
    await openField(page);

    const action = page.getByTestId('field-action');
    await expect(action).toHaveText(RECEIPT_LABEL);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'bien-nhan.png',
      mimeType: 'image/png',
      buffer: Buffer.from('png!'),
    });

    // ANH CHUP lam bang chung cho ban soat: ngoai `test-results/` vi Playwright don no moi lan chay.
    await page.screenshot({ path: 'e2e-evidence/field-terminal-run-before.png', fullPage: true });

    // Luot quet dong vong chay SAU lan doc cuoi — man hinh chua biet.
    state.closed = true;
    await action.click();

    /* --- MAY CHU LA LOP CUOI: lan bam cu van den, va bi tu choi DUNG MOT LAN --- */
    await expect.poll(() => state.documents.length).toBe(1);

    /* --- BUG-05: cau tu choi hien NGUYEN VAN, tieng Viet co dau --- */
    const alert = page.locator('.tx-state--error');
    await expect(alert).toContainText(TERMINAL_MESSAGE);
    await expect(alert).not.toContainText('trang thai cuoi');

    /* --- BUG-03: man hinh DOC LAI mo hinh cua may chu, khong giu the cu --- */
    await expectNoDocumentAction(page);
    await expect(page.getByText('Không còn việc nào cần bấm ngay.')).toBeVisible();
    expect(state.documents).toHaveLength(1);
    await page.screenshot({ path: 'e2e-evidence/field-terminal-run-after.png', fullPage: true });
  });

  test('quay lai man hinh sau khi vong chay dong: the cu tu bien mat, KHONG mot lan tai tep nao', async ({
    page,
  }) => {
    const state = await mockServer(page);
    await openField(page);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);

    state.closed = true;
    const readsBefore = state.fieldReads;
    await returnToScreen(page);

    await expect.poll(() => state.fieldReads).toBeGreaterThan(readsBefore);
    await expectNoDocumentAction(page);
    expect(state.uploads).toBe(0);
    expect(state.documents).toHaveLength(0);
  });

  /*
   * Man hinh nay nay tu lam moi (quay lai man hinh, va theo nhip). Mot lan lam moi hong o vung mat
   * song KHONG duoc xoa man hinh thanh mot trang loi: lai xe mat the dang lam va tep vua chon. No
   * giu lan doc truoc, kem mot dong noi ro la chua lam moi duoc.
   */
  test('mot lan lam moi hong khong xoa man hinh: giu lan doc truoc, kem mot dong bao', async ({
    page,
  }) => {
    const state = await mockServer(page);
    await openField(page);
    await expect(page.getByTestId('field-current-leg')).toBeVisible();

    state.readsFailing = true;
    await returnToScreen(page);

    await expect(page.getByTestId('field-refresh-failed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('field-current-leg')).toBeVisible();
    await expect(page.getByTestId('field-action')).toHaveText(RECEIPT_LABEL);

    // Song tro lai: dong bao bien mat o lan lam moi ke tiep.
    state.readsFailing = false;
    await returnToScreen(page);
    await expect(page.getByTestId('field-refresh-failed')).toHaveCount(0);
  });
});
