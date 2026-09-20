import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * MOC BAT BUOC KEM VI TRI, tren trinh duyet THAT — `#327`.
 *
 * ==============================================================================================
 * BAI NAY DO DIEU GI
 * ==============================================================================================
 *
 * `DELIVERY_ARRIVAL` doi mot ban dinh vi cua CHINH lai xe (`#232` D-08). Truoc ban nay, man hinh
 * hien "(cần vị trí)" roi goi `POST /transport/me/checkpoints` KHONG kem `observationId` — nen nut
 * do luon tra `400`, va UAT dau tien cua chu so huu chet o dung buoc nay.
 *
 * Nen bai duoi day do CA CHUOI tren mot trinh duyet that, o ca ba ket cuc:
 *
 *   1. co vi tri  -> phien -> ban dinh vi -> moc, VA moc mang dung `observationId` vua sinh;
 *   2. TU CHOI quyen -> khong mot yeu cau ghi moc nao, va mot cau loi doc duoc;
 *   3. MAT SONG giua chung -> bam lai KHONG sinh ban dinh vi thu hai, khong sinh moc thu hai.
 *
 * KHONG KIEM: rang may chu tinh dung. Do la viec cua `run-scoped-tracking.int.spec.ts` tren
 * Postgres that. O day may chu la gia; cai duy nhat duoc chung minh la BE MAT di dung chuoi.
 */

const AT = '2026-09-19T05:00:00.000Z';
const HANOI = { latitude: 21.0285, longitude: 105.8542 };

interface Recorded {
  readonly sessions: { readonly runId?: string; readonly tripId?: string }[];
  readonly observations: {
    readonly clientEventId: string;
    readonly source: string;
    readonly latitude: number;
    readonly longitude: number;
  }[];
  readonly checkpoints: {
    readonly clientEventId: string;
    readonly type: string;
    readonly observationId?: string;
  }[];
  /** Cho bai MAT SONG: lan ghi moc dau tien bi cat, lan sau cho qua. */
  failNextCheckpoint: boolean;
}

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

/**
 * MAY CHU GIA, va no giu DUNG hai bat bien ma may chu that giu.
 *
 * `POST /tracking/sessions` la IDEMPOTENT tren cung mot chu the, va ban dinh vi duoc CHAN PHAT LAI
 * theo `clientEventId`. Neu ban gia khong lam dung hai dieu do, bai "mat song" se xanh bang mot
 * ly do gia: no se do dem hai hang trong ban gia, chu khong do hanh vi cua may khach.
 */
async function mockField(page: Page): Promise<Recorded> {
  const state: Recorded = {
    sessions: [],
    observations: [],
    checkpoints: [],
    failNextCheckpoint: false,
  };

  await page.route('**/auth/me', (route) =>
    json(route, { user: { id: 'u-driver', name: 'Lai xe Binh', role: 'SALE' }, roles: ['SALE'] }),
  );
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
              phase: 'IN_TRANSIT',
              recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'],
              arrivalCheckpointId: null,
              waiting: null,
              documents: [],
              missingDocumentTypes: [],
              receiptHandover: null,
              nextActions: [
                {
                  kind: 'CHECKPOINT',
                  label: 'Đã đến nơi giao',
                  checkpointType: 'DELIVERY_ARRIVAL',
                  requiresLocation: true,
                  required: true,
                },
              ],
            },
          ],
        },
      ],
    }),
  );

  await page.route('**/transport/me/tracking/sessions', async (route) => {
    const body = route.request().postDataJSON() as { runId?: string; tripId?: string };
    state.sessions.push(body);
    await json(route, { id: 'sess-1', runId: body.runId ?? null, tripId: null, status: 'ACTIVE' });
  });

  await page.route('**/transport/me/tracking/sessions/*/observations', async (route) => {
    const body = route.request().postDataJSON() as {
      observations: {
        clientEventId: string;
        source: string;
        latitude: number;
        longitude: number;
      }[];
    };
    const accepted = body.observations.map((observation) => {
      const already = state.observations.findIndex(
        (row) => row.clientEventId === observation.clientEventId,
      );
      // CHAN PHAT LAI: cung khoa -> tra ve DUNG hang cu, khong ghi them.
      if (already >= 0) return { id: `obs-${already + 1}`, sessionId: 'sess-1' };
      state.observations.push(observation);
      return { id: `obs-${state.observations.length}`, sessionId: 'sess-1' };
    });
    await json(route, accepted, 201);
  });

  await page.route('**/transport/me/checkpoints', async (route) => {
    const body = route.request().postDataJSON() as {
      clientEventId: string;
      type: string;
      observationId?: string;
    };
    state.checkpoints.push(body);
    if (state.failNextCheckpoint) {
      state.failNextCheckpoint = false;
      // MAT SONG tren duong VE: may chu da nhan, may khach khong bao gio biet.
      await route.abort('connectionreset');
      return;
    }
    await json(route, { id: `cp-${state.checkpoints.length}` }, 201);
  });

  return state;
}

const openField = async (page: Page): Promise<void> => {
  await page.goto('/?surface=driver&screen=field');
  /*
   * 30 giay, khong 5: bai DAU TIEN cua ca cau hinh tra tien bien dich cua `next dev` cho tuyen
   * nay, va man hinh nam o "Đang kiểm tra quyền truy cập…" trong luc do. Mot ngưỡng 5 giay lam
   * bai dau tien do va cac bai sau xanh — mot hinh dang do KHONG noi gi ve san pham, va no se doi
   * cho moi lan them/bot mot tep trong thu muc nay.
   */
  await expect(page.getByTestId('field-current-leg')).toBeVisible({ timeout: 30_000 });
};

/* ================================================================== *
 * 1. CO VI TRI — chuoi day du
 * ================================================================== */

test.describe('moc bat buoc kem vi tri — co quyen dinh vi — #327', () => {
  test.use({ permissions: ['geolocation'], geolocation: HANOI });

  test('mot cham di het chuoi: phien -> ban dinh vi -> moc KEM observationId', async ({ page }) => {
    const state = await mockField(page);
    await openField(page);

    const action = page.getByTestId('field-action').first();
    await expect(action).toHaveText('Đã đến nơi giao (cần vị trí)');
    await action.click();

    await expect.poll(() => state.checkpoints.length).toBe(1);

    /* --- phien mo THEO VONG CHAY, khong theo chuyen --- */
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toEqual({ runId: 'run-1' });
    // Khong mot `driverId`/`vehicleId` nao roi ra tu may khach — may chu se tra 400 neu co.
    expect(Object.keys(state.sessions[0] ?? {})).toEqual(['runId']);

    /* --- ban dinh vi mang DUNG toa do trinh duyet va DUNG nhan nguon --- */
    expect(state.observations).toHaveLength(1);
    expect(state.observations[0]?.latitude).toBeCloseTo(HANOI.latitude, 4);
    expect(state.observations[0]?.longitude).toBeCloseTo(HANOI.longitude, 4);
    // `DEVICE_FUSED`: Geolocation API la mot nguon TRON va khong noi ra minh dung cai gi. Khai
    // `DEVICE_GNSS` la tu nang muc tin cay cua mot thu khong ai do duoc; `TELEMATICS` thi may chu
    // tu choi thang.
    expect(state.observations[0]?.source).toBe('DEVICE_FUSED');

    /* --- VA MOC MANG DUNG `observationId` VUA SINH. Day la ca ly do cua ban nay. --- */
    expect(state.checkpoints[0]?.type).toBe('DELIVERY_ARRIVAL');
    expect(state.checkpoints[0]?.observationId).toBe('obs-1');
  });

  /**
   * `#327`: *"retry must reuse the same observation rather than create a second one"*.
   *
   * Hinh dang do duoc dung o day: may chu DA GHI moc, roi cau tra loi mat tren duong ve. Lai xe
   * thay mot cau loi va bam lai — dung nhu ho se lam ngoai hien truong.
   */
  test('mat song roi bam lai: KHONG ban dinh vi thu hai, KHONG khoa moc thu hai', async ({
    page,
  }) => {
    const state = await mockField(page);
    state.failNextCheckpoint = true;
    await openField(page);

    const action = page.getByTestId('field-action').first();
    await action.click();
    await expect.poll(() => state.checkpoints.length).toBe(1);
    // Lai xe PHAI thay la chua xong, neu khong ho bo di va moc mat that.
    await expect(page.locator('.tx-state--error')).toBeVisible();

    await action.click();
    await expect.poll(() => state.checkpoints.length).toBe(2);

    // MOT ban dinh vi, MOT phien — ca hai lan bam dung chung ket qua cua buoc da xong.
    expect(state.observations).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);

    // Hai lan gui, MOT khoa moc va MOT ban dinh vi — nen may chu that se phat lai, khong ghi them.
    expect(state.checkpoints[1]?.clientEventId).toBe(state.checkpoints[0]?.clientEventId);
    expect(state.checkpoints[1]?.observationId).toBe(state.checkpoints[0]?.observationId);
  });
});

/* ================================================================== *
 * 2. TU CHOI QUYEN — va day la ket cuc quan trong nhat
 * ================================================================== */

test.describe('moc bat buoc kem vi tri — KHONG co quyen dinh vi — #327', () => {
  /*
   * KHONG `grantPermissions`. Chromium duoi Playwright goi callback loi voi `PERMISSION_DENIED`,
   * tuc dung hinh dang ma mot lai xe tat dinh vi gap phai.
   */
  test('khong lay duoc vi tri thi KHONG MOT yeu cau ghi moc nao duoc gui', async ({ page }) => {
    const state = await mockField(page);
    await openField(page);

    await page.getByTestId('field-action').first().click();

    // Cau loi phai NOI RO la moc CHUA duoc ghi — mot "thất bại" chung chung se lam lai xe tuong
    // may chu tu choi va bo di.
    // `.tx-state--error` chu khong `getByRole('alert')`: Next.js cai mot vung thong bao dieu
    // huong cung mang `role="alert"`, va che do strict cua Playwright se do vi HAI phan tu khop —
    // mot that bai khong noi gi ve san pham.
    const alert = page.locator('.tx-state--error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('vị trí');

    /*
     * Va day la phan thuc su duoc do: KHONG co yeu cau ghi moc nao. Mot moc "toi da den noi" ghi
     * ma khong co gi chung minh la dung thu ma `#232` D-08 sinh ra de chan.
     */
    expect(state.checkpoints).toHaveLength(0);
    expect(state.observations).toHaveLength(0);
  });
});
