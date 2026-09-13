import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * MAN HINH HIEN TRUONG o 390px — `#279` O9/O10, chay tren trinh duyet that.
 *
 * ==============================================================================================
 * BAI NAY KIEM DIEU GI, VA KHONG KIEM DIEU GI
 *
 * KIEM: rang mot lai xe o mot chiec dien thoai 390px NHIN THAY viec ke tiep, bam duoc no bang MOT
 * cham, va rang lan bam do gui len may chu DUNG hop dong — ke ca khi ho bam hai lan.
 *
 * KHONG KIEM: rang may chu tinh dung. Do la viec cua bo integration o `apps/api` (17 bai tren
 * Postgres that). O day may chu la gia; cai duy nhat duoc chung minh la BE MAT co du duong di.
 *
 * ==============================================================================================
 * 390px LA MOT KHANG DINH, KHONG PHAI MOT CON SO TUY TIEN
 *
 * `#279` O9 doi *"390px usable"*. Do la chieu rong cua mot chiec iPhone doi moi va cua phan lon
 * may Android tam trung — tuc chieu rong ma lai xe THAT SU cam. Mot nut tran ra ngoai o do la mot
 * nut khong bam duoc khi dang deo gang tay.
 */

const AT = '2026-09-09T05:00:00.000Z';

interface FieldState {
  /** Moi lan bam duoc ghi lai — de khang dinh CA PHIA MAY CHU, khong chi phia man hinh. */
  readonly checkpoints: { readonly clientEventId: string; readonly type: string }[];
  readonly waiting: { readonly clientEventId: string }[];
  readonly documents: { readonly clientEventId: string; readonly type: string }[];
  readonly handovers: { readonly clientEventId: string }[];
  /** Da bam `Da toi diem lay hang` chua — lan doc ke tiep phai thay ket qua cua lan bam truoc. */
  arrived: boolean;
}

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

/**
 * MAY CHU GIA CO TRANG THAI cho man hinh hien truong.
 *
 * `nextActions` do MAY CHU tinh — man hinh khong suy ra tu mot enum. Nen mock nay phai lam dung
 * viec do: sau khi bam `Da toi diem lay hang`, lan doc ke tiep tra ve mot danh sach nut KHAC.
 */
async function mockField(page: Page): Promise<FieldState> {
  const state: FieldState = {
    checkpoints: [],
    waiting: [],
    documents: [],
    handovers: [],
    arrived: false,
  };

  await page.route('**/auth/me', (route) =>
    json(route, {
      user: { id: 'u-driver', name: 'Lai xe Binh', role: 'SALE' },
      roles: ['SALE'],
    }),
  );
  /*
   * Duong `auth/csrf` la BAT BUOC. `authFetch` xin mot the CSRF truoc MOI lenh ghi; thieu no thi lan
   * bam khong bao gio thanh mot yeu cau `POST`, va bai test se do voi mot thong bao noi ve so luong
   * ban ghi — khong noi gi ve nguyen nhan that.
   */
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/transport/me/trips', (route) => json(route, []));

  await page.route('**/transport/me/field-work', (route) =>
    json(route, {
      serverNow: AT,
      runs: [
        {
          runId: 'run-1',
          runCode: 'VC-001',
          legs: [
            {
              legId: 'leg-1',
              sequence: 1,
              kind: 'LOADED',
              originLabel: 'Hà Nội',
              destinationLabel: 'Hải Phòng',
              orderCode: 'ORD-1',
              orderId: 'ord-1',
              phase: state.arrived ? 'AT_PICKUP' : 'PLANNED',
              recordedTypes: state.arrived ? ['PICKUP_ARRIVAL'] : [],
              arrivalCheckpointId: null,
              waiting: null,
              documents: [],
              missingDocumentTypes: ['DELIVERY_RECEIPT'],
              receiptHandover: null,
              nextActions: state.arrived
                ? [
                    {
                      kind: 'CHECKPOINT',
                      label: 'Đã vào cổng',
                      checkpointType: 'GATE_ENTRY',
                      requiresLocation: false,
                      required: true,
                    },
                    {
                      kind: 'CHECKPOINT',
                      label: 'Đang xếp hàng',
                      checkpointType: 'LOADING',
                      requiresLocation: false,
                      required: true,
                    },
                  ]
                : [
                    {
                      kind: 'CHECKPOINT',
                      label: 'Đã tới điểm lấy hàng',
                      checkpointType: 'PICKUP_ARRIVAL',
                      requiresLocation: false,
                      required: true,
                    },
                  ],
            },
          ],
        },
      ],
    }),
  );

  await page.route('**/transport/me/checkpoints', async (route) => {
    const body = route.request().postDataJSON() as { clientEventId: string; type: string };
    state.checkpoints.push({ clientEventId: body.clientEventId, type: body.type });
    if (body.type === 'PICKUP_ARRIVAL') state.arrived = true;
    await json(route, { id: `cp-${state.checkpoints.length}` }, 201);
  });

  return state;
}

test.describe('man hinh hien truong o 390px — #279 O9', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('lai xe thay viec ke tiep, bam MOT cham, va man hinh doc ra ket qua cua lan bam do', async ({
    page,
  }) => {
    const state = await mockField(page);
    await page.goto('/?surface=driver&screen=field');

    /* --- 1. MAN HINH NOI VIEC KE TIEP, KHONG NOI TEN ENUM --- */
    const currentLeg = page.getByTestId('field-current-leg');
    await expect(currentLeg).toBeVisible();
    await expect(page.getByTestId('field-route')).toHaveText('Hà Nội → Hải Phòng');
    await expect(page.getByTestId('field-phase')).toHaveText('Chưa bắt đầu');

    const actions = page.getByTestId('field-action');
    await expect(actions).toHaveCount(1);
    await expect(actions.first()).toHaveText('Đã tới điểm lấy hàng');

    /*
     * KHONG mot chuoi tu vung noi bo nao lot ra man hinh. `#279` O9:
     * *"not internal state-machine jargon"*.
     */
    const screen = await page.locator('#tx-driver-main').innerText();
    for (const jargon of ['PICKUP_ARRIVAL', 'GATE_ENTRY', 'DELIVERY_ACCEPTED', 'LOADED']) {
      expect(screen, jargon).not.toContain(jargon);
    }

    /* --- 2. NUT PHAI DUNG DUOC O 390px --- */
    const box = await actions.first().boundingBox();
    expect(box).not.toBeNull();
    // Khong tran ra ngoai khung nhin, va du cao de mot ngon tay cham trung.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(36);

    // Va ca trang khong cuon NGANG — mot man hinh cuon ngang o 390px la mot man hinh hong.
    /*
     * ANH CHUP lam bang chung cho `LANE_O_FINAL`. Ghi ra ngoai `test-results/` vi Playwright DON
     * SACH thu muc do o moi lan chay — mot anh nam trong do la mot anh se bien mat truoc khi ai kip
     * doc bao cao.
     */
    await page.screenshot({ path: 'e2e-evidence/field-work-390px.png', fullPage: true });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    /* --- 3. MOT CHAM, VA MAY CHU NHAN DUNG HOP DONG --- */
    await actions.first().click();

    await expect.poll(() => state.checkpoints.length).toBe(1);
    expect(state.checkpoints[0]?.type).toBe('PICKUP_ARRIVAL');
    expect(state.checkpoints[0]?.clientEventId).toBeTruthy();

    /* --- 4. BUOC SAU NHIN THAY KET QUA CUA BUOC TRUOC --- */
    await expect(page.getByTestId('field-phase')).toHaveText('Đang ở điểm lấy hàng');
    await expect(actions).toHaveCount(2);
    await expect(actions.first()).toHaveText('Đã vào cổng');
  });

  /**
   * `#279` O10 — *"safe resubmit/idempotency"*.
   *
   * Hai cham lien tiep tren CUNG mot nut phai mang CUNG mot `clientEventId`. Sinh moi o lan thu hai
   * se bien mot lan bam nhieu thanh hai moc — va mot moc thua tren dong thoi gian la mot con so sai
   * trong ho so ma ke toan doc de duyet phu cap cho.
   */
  test('bam hai lan cung mot nut van la MOT su kien', async ({ page }) => {
    const state = await mockField(page);
    await page.goto('/?surface=driver&screen=field');

    const action = page.getByTestId('field-action').first();
    await expect(action).toBeVisible();

    /*
     * Chan duong ghi lai de nut khong doi nhan giua hai cham: o day dieu can do la KHOA, khong phai
     * lan ghi. Mot lan tu choi cua may chu van de lai `clientEventId` trong `state`.
     */
    await page.route('**/transport/me/checkpoints', async (route) => {
      const body = route.request().postDataJSON() as { clientEventId: string; type: string };
      state.checkpoints.push({ clientEventId: body.clientEventId, type: body.type });
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Da ghi roi' }),
      });
    });

    await action.click();
    await expect.poll(() => state.checkpoints.length).toBe(1);
    await action.click();
    await expect.poll(() => state.checkpoints.length).toBe(2);

    // HAI lan gui, MOT khoa — do la ca diem.
    expect(state.checkpoints[1]?.clientEventId).toBe(state.checkpoints[0]?.clientEventId);
  });

  /**
   * `#279` O9 — *"driver payload still excludes freight/revenue"*.
   *
   * Do tren CHINH man hinh dang chay, khong tren mot kieu: mot con so cuoc lot ra day la mot con so
   * lai xe nhin thay khi ho dua dien thoai cho khach hang xem chu ky.
   */
  test('khong mot con so tien nao tren man hinh hien truong', async ({ page }) => {
    await mockField(page);
    await page.goto('/?surface=driver&screen=field');

    await expect(page.getByTestId('field-current-leg')).toBeVisible();
    const screen = await page.locator('#tx-driver-main').innerText();
    for (const money of ['₫', 'VND', 'Cước', 'Doanh thu', 'Phụ cấp']) {
      expect(screen, money).not.toContain(money);
    }
  });
});
