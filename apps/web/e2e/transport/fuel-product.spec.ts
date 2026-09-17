import { expect, test, type Page, type Route } from '@playwright/test';
import { mockLifecycle, type LifecycleState } from './lifecycle-server';

/**
 * BE MAT SAN PHAM NHIEN LIEU — `#313`, tren trinh duyet that voi may chu gia co trang thai.
 *
 * ==============================================================================================
 * KIEM DIEU GI
 *
 *   1. Ke toan chon mot anh DA LUU bang `evidenceId`, cho may doc qua ROUTE MAY CHU
 *      `.../evidence/:evidenceId/extract` (`#317`) — khong than yeu cau, khong byte/base64 qua trinh
 *      duyet, khong dinh vi kho — va thay ung vien + muc tin + diem lech; phieu KHONG bi sua.
 *   2. Byte anh khong con trong kho (404 cua route) hien thanh mot cau noi that, khong gia vo da doc.
 *   3. PDF khong bi gui di doc.
 *   4. Drill-down tieu hao: odo khong tang -> KHONG co L/100km; canh bao noi ro khong tru tien.
 *   5. Lai xe bam gui lai sau mat mang -> CUNG than yeu cau -> MOT phieu, anh dinh dung phieu; to
 *      khai MOI mac dinh ghi no cay xang va mang tram da chon (`#317` G1).
 *   6. Vai lai xe khong ban mot yeu cau nao toi be mat ke toan nhien lieu.
 *   7. `#317` G0 — ke toan DOI quyet dinh sau khi mo lai ky: nut chi o quyet dinh hieu luc, ly do bat
 *      buoc, than yeu cau dung hop dong, va lich su hien ro quyet dinh cu da bi thay the.
 *
 * KHONG KIEM: may chu that tinh dung — do la viec cua bo `apps/api`
 * (`fuel-consumption-drilldown.spec.ts`, `fuel-consumption.controller.spec.ts`, ...).
 * ==============================================================================================
 */

const AT = '2026-09-10T01:00:00.000Z';
/** Mot dinh vi kho GIA nhung dung hinh dang that — may chu gia tra no nhu `main` dang tra. */
const STORAGE_LOCATOR = 'media/transport-evidence/2026/09/bi-mat-ev-1.jpg';
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

interface SeenRequest {
  readonly method: string;
  readonly url: string;
  readonly body: string | null;
}

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function seedEntry(
  state: LifecycleState,
  evidence: readonly { id: string; contentType: string }[] = [
    { id: 'ev-1', contentType: 'image/jpeg' },
  ],
): void {
  state.fuelEntries.set('fuel-1', {
    id: 'fuel-1',
    tripId: 'trip-1',
    vehicleId: 'veh-1',
    driverId: 'drv-1',
    supplierId: 'sup-1',
    businessDate: '2026-09-10',
    occurredAt: AT,
    litersUnits: 62_500,
    amount: 1_437_500,
    currencyCode: 'VND',
    odometerKm: 120_450,
    previousOdometerKm: 120_050,
    consumptionUnits: 15_625,
    reviewReasons: [],
    paymentMethod: 'DRIVER_CASH',
    verificationStatus: 'DECLARED',
    reconciliationStatus: 'UNMATCHED',
    sourceStatementId: null,
    invoiceNo: '1234',
    note: null,
    reviewNote: null,
    recordedBy: 'u-driver',
    createdAt: AT,
    updatedAt: AT,
  });
  state.fuelEvidence.set('fuel-1', [...evidence]);
}

const DOCUMENT = {
  id: 'doc-1',
  kind: 'RECEIPT_IMAGE',
  sourceRef: 'fuel-evidence:ev-1',
  contentDigest: 'c'.repeat(64),
  byteSize: JPEG_BYTES.length,
  sellerTaxCodeRaw: '0100100100',
  supplierId: 'sup-1',
  status: 'PARSED',
  rejectReason: null,
  duplicateOfId: null,
  candidateCount: 1,
  receivedAt: AT,
  receivedBy: 'u-1',
};

const CANDIDATE = {
  id: 'cand-1',
  documentId: 'doc-1',
  lineNumber: 1,
  sellerTaxCode: '0100100100',
  invoiceSymbol: '1C26TAA',
  invoiceNo: '0009999',
  invoiceTemplate: null,
  sellerName: 'Petrolimex Cầu Giấy',
  stationLabelRaw: 'CHXD số 12',
  stationId: null,
  stationMatch: 'AMBIGUOUS',
  issuedDate: '2026-09-10',
  issuedTimeRaw: '08:00',
  litersUnits: 62_500,
  unitPriceUnits: 23_000_000,
  amount: 1_437_500,
  currencyCode: 'VND',
  itemName: 'Dầu DO 0,05S',
  unitRaw: 'Lít',
  plateHintRaw: null,
  plateHintSource: null,
  odometerHintKm: null,
  confidence: {
    invoiceNo: 980,
    invoiceSymbol: 970,
    sellerTaxCode: 990,
    issuedAt: 960,
    'line.1.litersMilli': 950,
    'line.1.unitPriceMilli': 899,
    'line.1.amountVnd': 940,
  },
  createdAt: AT,
};

const REVIEW = {
  document: DOCUMENT,
  candidates: [
    {
      candidate: CANDIDATE,
      assessment: {
        outcome: 'HAS_FINDINGS',
        findings: [
          { finding: 'STATION_UNRESOLVED', detail: { stationMatch: 'AMBIGUOUS' } },
          { finding: 'PLATE_HINT_ABSENT' },
          {
            finding: 'FIELD_CONFIDENCE_BELOW_FLOOR',
            detail: { fields: 'line.1.unitPriceMilli', floor: 900 },
          },
        ],
      },
    },
  ],
};

const link = (overrides: Record<string, unknown>) => ({
  entryId: 'fuel-0',
  tripId: 'trip-1',
  businessDate: '2026-09-03',
  occurredAt: AT,
  verificationStatus: 'VERIFIED',
  litersUnits: 120_000,
  odometerKm: 119_650,
  previousEntryId: 'fuel-lead',
  previousOdometerKm: 119_250,
  distanceKm: 400,
  consumptionUnits: 30_000,
  state: 'COMPUTED',
  insights: [],
  recorded: { previousOdometerKm: 119_250, consumptionUnits: 30_000, reviewReasons: [] },
  ...overrides,
});

const CONSUMPTION = {
  vehicle: { id: 'veh-1', registrationPlate: '29H-123.45', vehicleClass: 'TRUCK_5T' },
  period: { from: '2026-09-01', to: '2026-09-30' },
  norm: { normL100km: 30, tolerancePercent: 10 },
  leadIn: { entryId: 'fuel-lead', businessDate: '2026-08-29', occurredAt: AT, odometerKm: 119_250 },
  links: [
    link({}),
    link({
      entryId: 'fuel-2',
      businessDate: '2026-09-06',
      odometerKm: 119_600,
      previousEntryId: 'fuel-0',
      previousOdometerKm: 119_650,
      distanceKm: -50,
      consumptionUnits: null,
      state: 'ODOMETER_NOT_ADVANCED',
    }),
    link({
      entryId: 'fuel-1',
      businessDate: '2026-09-10',
      odometerKm: 120_450,
      litersUnits: 320_000,
      previousEntryId: 'fuel-0',
      previousOdometerKm: 119_650,
      distanceKm: 800,
      consumptionUnits: null,
      state: 'PREVIOUS_FILL_UNANCHORED',
    }),
    link({
      entryId: 'fuel-3',
      businessDate: '2026-09-14',
      odometerKm: 120_850,
      litersUnits: 160_000,
      previousEntryId: 'fuel-1',
      previousOdometerKm: 120_450,
      distanceKm: 400,
      consumptionUnits: 40_000,
      insights: ['CONSUMPTION_ABOVE_NORM'],
    }),
  ],
  summary: {
    entryCount: 4,
    computedCount: 2,
    reviewCount: 2,
    excludedCount: 0,
    unverifiedCount: 0,
    aboveNormCount: 1,
    totalLitersUnits: 280_000,
    totalDistanceKm: 800,
    consumptionUnits: 35_000,
    stateCounts: {
      COMPUTED: 2,
      NO_PREVIOUS_ODOMETER: 0,
      ODOMETER_NOT_ADVANCED: 1,
      PREVIOUS_FILL_UNANCHORED: 1,
      EXCLUDED_REJECTED: 0,
    },
  },
  isTruncated: false,
};

/**
 * Cac duong cua san pham nhien lieu, dang ky SAU `mockLifecycle` nen duoc thu TRUOC. Moi yeu cau
 * `/transport/*` duoc ghi lai de bai kiem khang dinh duoc ca nhung gi KHONG duoc gui.
 */
async function mockFuelProduct(
  page: Page,
  state: LifecycleState,
  options: { readonly extractStatus?: number } = {},
): Promise<SeenRequest[]> {
  const seen: SeenRequest[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/transport/')) return;
    seen.push({ method: request.method(), url: request.url(), body: request.postData() });
  });

  await page.route(/\/transport\/fuel\/entries(\?[^/]*)?$/, (route) => {
    const rows = [...state.fuelEntries.values()].map((entry) => ({
      id: entry.id,
      tripId: entry.tripId,
      tripCode: 'VT-FUEL-01',
      driverId: entry.driverId,
      driverName: 'Trần Văn Bình',
      vehicleId: entry.vehicleId,
      vehiclePlate: '29H-123.45',
      supplierId: entry.supplierId,
      supplierName: 'Petrolimex Cầu Giấy',
      businessDate: entry.businessDate,
      occurredAt: entry.occurredAt,
      litersUnits: entry.litersUnits,
      amount: entry.amount,
      currencyCode: entry.currencyCode,
      invoiceNo: entry.invoiceNo,
      paymentMethod: entry.paymentMethod,
      verificationStatus: entry.verificationStatus,
      reconciliationStatus: entry.reconciliationStatus,
      reviewReasons: entry.reviewReasons,
      reviewNote: entry.reviewNote,
      evidenceCount: (state.fuelEvidence.get(entry.id) ?? []).length,
      evidence: state.fuelEvidence.get(entry.id) ?? [],
    }));
    return json(route, {
      rows,
      total: rows.length,
      pendingVerificationCount: rows.filter((row) => row.verificationStatus === 'DECLARED').length,
      limit: 50,
      offset: 0,
    });
  });

  // Chi tiet phieu tra `locator` — DUNG nhu `GET entries/:id` tren `main` hom nay.
  await page.route(/\/transport\/fuel\/entries\/[^/?]+$/, (route) => {
    const entry = state.fuelEntries.get('fuel-1');
    return json(route, {
      entry,
      evidence: (state.fuelEvidence.get('fuel-1') ?? []).map((file) => ({
        ...file,
        fuelEntryId: 'fuel-1',
        locator: STORAGE_LOCATOR,
        byteSize: JPEG_BYTES.length,
        capturedAt: null,
        uploadedBy: 'u-driver',
        createdAt: AT,
        withdrawnAt: null,
        withdrawnBy: null,
      })),
    });
  });

  await page.route(/\/transport\/fuel\/entries\/[^/]+\/evidence\/[^/?]+$/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPEG_BYTES }),
  );

  /*
   * ROUTE MAY CHU doc anh da luu (`#308`, noi o `#317`): KHONG than yeu cau, may chu tu doc byte.
   * `documents/image` (duong base64) van duoc ghi lai qua `seen` de bai kiem khang dinh no KHONG bi goi.
   */
  await page.route(/\/transport\/fuel\/entries\/[^/]+\/evidence\/[^/]+\/extract$/, (route) => {
    if (options.extractStatus === 404) {
      // Than loi DUNG khuon `transportErrorBody` cua may chu that (`fuel-evidence.controller.ts`).
      return json(
        route,
        {
          statusCode: 404,
          message: 'Byte cua bang chung ev-1 khong con trong kho anh',
          error: 'Not Found',
          reason: 'FUEL_EVIDENCE_NOT_FOUND',
        },
        404,
      );
    }
    return json(route, { document: DOCUMENT, candidates: [CANDIDATE] });
  });
  await page.route(/\/transport\/fuel\/documents\/image$/, (route) =>
    json(route, { message: 'Duong base64 khong duoc dung cho anh da luu' }, 500),
  );
  await page.route(/\/transport\/fuel\/documents\/doc-1\/review$/, (route) => json(route, REVIEW));
  await page.route(/\/transport\/fuel\/documents(\?[^/]*)?$/, (route) => json(route, [DOCUMENT]));
  await page.route(/\/transport\/fuel\/vehicles\/[^/]+\/consumption(\?[^/]*)?$/, (route) =>
    json(route, CONSUMPTION),
  );

  return seen;
}

const leaksLocator = (seen: readonly SeenRequest[]): boolean =>
  seen.some(
    (row) =>
      row.url.includes('media/transport-evidence') ||
      (row.body ?? '').includes('media/transport-evidence'),
  );

test.describe('ke toan — anh da luu, may doc, soat ung vien', () => {
  test('doc anh bang evidenceId: ung vien + muc tin + diem lech; khong lo dinh vi, khong sua phieu', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'ACCOUNTING');
    seedEntry(state);
    const seen = await mockFuelProduct(page, state);

    await page.goto('/?section=fuel');
    await page.getByRole('rowheader', { name: 'VT-FUEL-01' }).click();
    const detail = page.getByRole('region', { name: /Phiếu đổ dầu VT-FUEL-01/ });

    // To khai hien du truong nghiep vu, ke ca odo lay tu chi tiet phieu.
    await expect(detail).toContainText('120.450 km');
    await expect(detail).toContainText('1234');

    await detail.getByRole('button', { name: 'Đọc ảnh này' }).click();
    const review = detail.getByRole('group', { name: 'Kết quả máy đọc' });
    await expect(review.getByRole('note')).toContainText('chỉ là đề xuất');
    await expect(review.getByRole('note')).toContainText('không tạo công nợ');
    await expect(review).toContainText('Ô cần nhìn lại: Đơn giá');
    await expect(review).toContainText('Nhiều cây xăng có thể khớp — người soát chọn');
    const comparison = review.getByRole('table', { name: 'Đối chiếu với tờ khai' });
    await expect(comparison.getByRole('row', { name: /Số hoá đơn/ })).toContainText('Lệch');
    await expect(comparison.getByRole('row', { name: /Số lít/ })).toContainText('Khớp');

    // PHIA MAY CHU: cua vao la HAI id tren duong dan cua route extract — khong than, khong byte.
    const extract = seen.filter(
      (row) =>
        row.method === 'POST' &&
        row.url.endsWith('/transport/fuel/entries/fuel-1/evidence/ev-1/extract'),
    );
    expect(extract).toHaveLength(1);
    expect(extract[0]?.body ?? null).toBeNull();
    // Duong base64 cu KHONG con duoc dung — anh lon khong con vuong tran than JSON cua API.
    expect(
      seen.filter((row) => row.url.includes('/transport/fuel/documents/image')),
    ).toEqual([]);
    expect(leaksLocator(seen)).toBe(false);
    await expect(page.locator('body')).not.toContainText('media/transport-evidence');

    // AI chi la ung vien: khong mot lenh ghi nao toi phieu, phieu van cho nguoi xac thuc.
    expect(
      seen.filter((row) => row.method !== 'GET' && row.url.includes('/transport/fuel/entries')),
    ).toEqual([]);
    expect(state.fuelEntries.get('fuel-1')?.verificationStatus).toBe('DECLARED');
  });

  test('byte anh khong con trong kho (404 cua route): noi ro, khong gia vo da doc', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'ACCOUNTING');
    seedEntry(state);
    const seen = await mockFuelProduct(page, state, { extractStatus: 404 });

    await page.goto('/?section=fuel');
    await page.getByRole('rowheader', { name: 'VT-FUEL-01' }).click();
    const detail = page.getByRole('region', { name: /Phiếu đổ dầu VT-FUEL-01/ });
    await detail.getByRole('button', { name: 'Đọc ảnh này' }).click();

    // Cau cua may chu hien NGUYEN VAN — khong bi viet lai thanh "tinh nang chua bat".
    await expect(detail.getByRole('alert')).toContainText('khong con trong kho anh');
    await expect(detail.getByRole('alert')).not.toContainText('chưa được bật');
    await expect(detail.getByRole('group', { name: 'Kết quả máy đọc' })).toHaveCount(0);
    // Khong co duong lui ve base64: 404 KHONG kich hoat tai byte ve roi gui lai.
    expect(seen.filter((row) => row.url.includes('/transport/fuel/documents/image'))).toEqual([]);
  });

  test('chung tu PDF: noi ro khong doc duoc, va khong tai byte ve', async ({ page }) => {
    const state = await mockLifecycle(page, 'ACCOUNTING');
    seedEntry(state, [{ id: 'pdf-1', contentType: 'application/pdf' }]);
    const seen = await mockFuelProduct(page, state);

    await page.goto('/?section=fuel');
    await page.getByRole('rowheader', { name: 'VT-FUEL-01' }).click();
    const detail = page.getByRole('region', { name: /Phiếu đổ dầu VT-FUEL-01/ });

    await expect(detail).toContainText('Chỉ đọc được ảnh JPEG, PNG hoặc WebP');
    await expect(detail.getByRole('button', { name: 'Đọc ảnh này' })).toHaveCount(0);
    expect(seen.some((row) => row.url.includes('/evidence/pdf-1'))).toBe(false);
  });
});

test.describe('drill-down tieu hao — chi la insight', () => {
  test('mo tu phieu: chuoi km dung xe dung thang, odo khong tang thi khong co L/100km', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'ACCOUNTING');
    seedEntry(state);
    const seen = await mockFuelProduct(page, state);

    await page.goto('/?section=fuel');
    await page.getByRole('rowheader', { name: 'VT-FUEL-01' }).click();
    await page.getByRole('button', { name: 'Xem chuỗi km của xe' }).click();

    const drilldown = page.getByRole('region', { name: 'Chuỗi tiêu hao nhiên liệu' });
    await expect(drilldown.getByRole('heading', { name: /29H-123\.45/ })).toBeVisible();
    expect(
      seen.some((row) =>
        row.url.includes(
          '/transport/fuel/vehicles/veh-1/consumption?from=2026-09-01&to=2026-09-30',
        ),
      ),
    ).toBe(true);

    const table = drilldown.getByRole('table', { name: 'Chuỗi km và tiêu hao từng lần đổ' });
    const notAdvanced = table.getByRole('row', { name: /06\/09\/2026/ });
    await expect(notAdvanced).toContainText('Số km không tăng — không tính, cần soát');
    await expect(notAdvanced).not.toContainText('L/100km');

    const unanchored = table.getByRole('row', { name: /10\/09\/2026/ });
    await expect(unanchored).toContainText('Lần đổ xen giữa thiếu mốc km hợp lệ — không tính');
    await expect(unanchored).not.toContainText('L/100km');

    const aboveNorm = table.getByRole('row', { name: /14\/09\/2026/ });
    await expect(aboveNorm).toContainText('40,000 L/100km');
    await expect(aboveNorm).toContainText('không trừ tiền lái xe');

    await expect(drilldown.getByRole('note')).toContainText('không khấu trừ lương');
    // Drill-down la duong DOC: khong mot lenh ghi nao duoc ban ra.
    expect(seen.filter((row) => row.method !== 'GET')).toEqual([]);
  });
});

test.describe('lai xe — to khai nhien lieu', () => {
  test('bam gui lai sau khi mat mang: CUNG than yeu cau, MOT phieu, anh dinh dung phieu', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'SALE');
    state.trips.set('trip-1', {
      id: 'trip-1',
      code: 'VT-FUEL-01',
      kind: 'OWN_DIRECT',
      status: 'IN_TRANSIT',
      businessDate: '2026-09-10',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      cargoDescription: null,
      customerId: 'cus-1',
      carrierPartnerId: null,
      referrerPartnerId: null,
      freightAmount: null,
      currencyCode: 'VND',
      distanceKm: null,
      createdAt: AT,
      updatedAt: AT,
      cancelledAt: null,
      cancellationReason: null,
    });
    state.assignments.set('trip-1', { vehicleId: 'veh-1', driverId: 'drv-1' });

    /*
     * MAY CHU GIA CO CHONG GHI TRUNG, theo dung luat cua may chu that: cung khoa + cung than ->
     * phat lai; cung khoa + than khac -> 409. Lan dau GHI roi CAT KET NOI — dung tinh huong "may
     * chu da nhan nhung dien thoai khong nhan duoc tra loi".
     */
    const bodies: string[] = [];
    const byKey = new Map<string, { raw: string; id: string }>();
    await page.route('**/transport/me/fuel/slips', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const raw = route.request().postData() ?? '';
      bodies.push(raw);
      const body = JSON.parse(raw) as Record<string, unknown>;
      const key = String(body.correlationKey);
      const known = byKey.get(key);
      if (known !== undefined) {
        if (known.raw !== raw) return json(route, { message: 'FUEL_CORRELATION_KEY_REUSED' }, 409);
        const entry = state.fuelEntries.get(known.id);
        return json(route, { ...entry, evidenceCount: 0, evidence: [] });
      }
      const id = 'fuel-new';
      byKey.set(key, { raw, id });
      state.fuelEntries.set(id, {
        id,
        tripId: String(body.tripId),
        vehicleId: String(body.vehicleId),
        driverId: 'drv-1',
        supplierId: String(body.supplierId),
        stationId: (body.stationId as string | null | undefined) ?? null,
        businessDate: String(body.businessDate),
        occurredAt: String(body.occurredAt),
        litersUnits: 60_000,
        amount: Number(body.amount),
        currencyCode: 'VND',
        odometerKm: Number(body.odometerKm),
        previousOdometerKm: null,
        consumptionUnits: null,
        reviewReasons: [],
        paymentMethod: String(body.paymentMethod),
        verificationStatus: 'DECLARED',
        reconciliationStatus: 'UNMATCHED',
        sourceStatementId: null,
        invoiceNo: (body.invoiceNo as string | null) ?? null,
        note: null,
        reviewNote: null,
        recordedBy: 'u-driver',
        createdAt: AT,
        updatedAt: AT,
      });
      return route.abort('connectionreset');
    });

    await page.goto('/?surface=driver&screen=fuel');
    const slipForm = page.getByRole('region', { name: 'Ghi phiếu đổ nhiên liệu' });
    await expect(slipForm.getByRole('button', { name: 'Gửi phiếu' })).toBeVisible();

    await slipForm.getByLabel('Cây xăng').selectOption({ label: 'Petrolimex Cầu Giấy' });
    // `#317` G1 — tram lay tu danh muc cua DUNG cay xang vua chon (`GET /transport/me/fuel/stations`).
    await slipForm.getByLabel('Trạm đổ').selectOption({ label: 'CHXD số 12 — Km 12 QL5' });
    await slipForm.getByLabel('Số lít').fill('60');
    await slipForm.getByLabel('Số tiền (đồng)').fill('1320000');
    await slipForm.getByLabel('Số km trên đồng hồ').fill('120450');
    await slipForm.getByLabel('Số hoá đơn (nếu có)').fill('0001234');
    await expect(slipForm.getByLabel('Thời điểm đổ')).not.toHaveValue('');
    // `#317` — KHONG chon gi: to khai moi mac dinh ghi no cay xang; tien mat lai xe phai chu dong chon.
    await expect(slipForm.getByLabel('Thanh toán')).toHaveValue('SUPPLIER_ACCOUNT');
    await slipForm.getByLabel('Ảnh phiếu (nếu có)').setInputFiles({
      name: 'phieu.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_BYTES,
    });

    await slipForm.getByRole('button', { name: 'Gửi phiếu' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    expect(state.fuelEvidence.get('fuel-new') ?? []).toHaveLength(0);

    await slipForm.getByRole('button', { name: 'Gửi phiếu' }).click();
    await expect(page.getByText('Đã gửi phiếu đổ dầu kèm ảnh.')).toBeVisible();

    // PHIA MAY CHU: hai lan gui la MOT than yeu cau, va chi co MOT phieu.
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(state.fuelEntries.size).toBe(1);
    expect(JSON.parse(bodies[0] ?? '{}')).toMatchObject({
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      supplierId: 'sup-1',
      stationId: 'sta-12',
      paymentMethod: 'SUPPLIER_ACCOUNT',
      invoiceNo: '0001234',
    });
    const sent = JSON.parse(bodies[0] ?? '{}') as { businessDate?: string; driverId?: string };
    expect(sent.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent.driverId).toBeUndefined();
    await expect.poll(() => (state.fuelEvidence.get('fuel-new') ?? []).length).toBe(1);
  });
});

test.describe('ke toan — doi quyet dinh sau khi mo lai ky (#317 G0)', () => {
  const RECONCILIATION = {
    id: 'rec-317',
    supplierId: 'sup-1',
    statementId: 'stm-317',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    state: 'REOPENED',
    closedAt: null,
    closedBy: null,
    reopenedAt: AT,
    reopenedBy: 'u-admin',
    reopenReason: 'Cây xăng gửi lại bảng kê',
    createdAt: AT,
    updatedAt: AT,
  };

  const ACCEPTED = {
    id: 'dis-1',
    reconciliationId: 'rec-317',
    kind: 'OUT_OF_TOLERANCE',
    status: 'RESOLVED',
    statementLineId: 'line-1',
    fuelEntryId: 'fuel-1',
    candidateEntryIds: [],
    candidateLineIds: [],
    resolution: 'ACCEPT_SUPPLIER_AMOUNT',
    resolutionNote: 'Lệch do làm tròn',
    resolvedAt: AT,
    resolvedBy: 'u-acc',
    supersedesId: null,
    createdAt: AT,
  };

  test('nut doi y chi o quyet dinh hieu luc; than yeu cau dung hop dong; quyet dinh cu van nam trong lich su', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'ACCOUNTING');
    state.reconciliations.set('rec-317', RECONCILIATION);
    const seen = await mockFuelProduct(page, state);

    /*
     * MAY CHU GIA theo DUNG luat cua may chu that: doi y la THEM mot hang tro ve hang cu
     * (`supersedesId`), hang cu KHONG bi sua hay xoa, va ban lam viec tra ve danh sach id da bi thay.
     */
    const discrepancies: Record<string, unknown>[] = [ACCEPTED];
    const supersededIds: string[] = [];
    await page.route(/\/transport\/fuel\/reconciliations\/rec-317$/, (route) =>
      json(route, {
        reconciliation: RECONCILIATION,
        statement: {
          id: 'stm-317',
          supplierId: 'sup-1',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-15',
          filename: 'bang-ke-thang-9.csv',
          format: 'CSV',
          sourceDigest: 'sha256:mock',
          importedAt: AT,
          importedBy: 'u-acc',
        },
        lines: [
          {
            id: 'line-1',
            statementId: 'stm-317',
            rowNumber: 1,
            status: 'ACCEPTED',
            rejectReason: null,
            vehiclePlateRaw: '29H-123.45',
            vehicleId: 'veh-1',
            businessDate: '2026-09-04',
            litersUnits: 10_000,
            amount: 230_000,
            currencyCode: 'VND',
            reconciliationStatus: 'MISMATCHED',
            invoiceNo: null,
            note: null,
            createdAt: AT,
          },
        ],
        matches: [],
        discrepancies: [...discrepancies],
        pendingDiscrepancyCount: 0,
        supersededDiscrepancyIds: [...supersededIds],
        handoff: null,
      }),
    );
    await page.route(/\/transport\/fuel\/discrepancies\/[^/]+\/revise$/, (route) => {
      const body = route.request().postDataJSON() as { resolution: string; reason: string };
      const revision = {
        ...ACCEPTED,
        id: 'dis-2',
        resolution: body.resolution,
        resolutionNote: body.reason,
        supersedesId: 'dis-1',
        createdAt: '2026-09-16T01:00:00.000Z',
      };
      discrepancies.push(revision);
      supersededIds.push('dis-1');
      return json(route, { revision, superseded: ACCEPTED, replayed: false }, 201);
    });

    await page.goto('/?section=fuel');
    await page
      .getByRole('table', { name: 'Các kỳ đối soát bảng kê' })
      .getByRole('rowheader', { name: 'Petrolimex Cầu Giấy' })
      .click();
    const desk = page.getByRole('region', { name: /Bàn đối soát/ });
    const table = desk.getByRole('table', { name: 'Chênh lệch của kỳ đối soát' });
    await expect(table.getByRole('row', { name: /Chấp nhận số của cây xăng/ })).toBeVisible();

    await table.getByRole('button', { name: 'Đổi quyết định' }).click();
    const form = desk.getByRole('form', { name: 'Đổi quyết định: Lệch quá dung sai' });
    await expect(form.getByRole('note')).toContainText('Quyết định cũ vẫn giữ trong lịch sử');
    await expect(form.getByRole('note')).toContainText('chứng từ điều chỉnh');
    await form.getByLabel('Quyết định mới').selectOption({ label: 'Bỏ qua có lý do' });

    // Ly do BAT BUOC: bam gui khi o ly do con trong thi trinh duyet chan, khong mot yeu cau nao di.
    await form.getByRole('button', { name: 'Ghi quyết định mới' }).click();
    await expect(form).toBeVisible();

    await form.getByLabel('Lý do đổi quyết định').fill('Cây xăng ghi trùng dòng này');
    await form.getByRole('button', { name: 'Ghi quyết định mới' }).click();

    // Doi tin hieu CHI co sau `onSuccess` + doc lai ban lam viec, roi moi doc than yeu cau.
    await expect(form).toHaveCount(0);
    const history = table.getByRole('row', { name: /đã thay bằng quyết định mới/ });
    await expect(history).toContainText('Chấp nhận số của cây xăng');
    await expect(history.getByRole('button')).toHaveCount(0);
    const current = table.getByRole('row', { name: /Bỏ qua có lý do/ });
    await expect(current).toContainText('Cây xăng ghi trùng dòng này');
    await expect(current.getByRole('button', { name: 'Đổi quyết định' })).toBeVisible();

    // PHIA MAY CHU: DUNG MOT lenh doi y, dung hai truong, va khong mot lenh ghi nao khac.
    const writes = seen.filter((row) => row.method !== 'GET');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.url).toMatch(/\/transport\/fuel\/discrepancies\/dis-1\/revise$/);
    expect(JSON.parse(writes[0]?.body ?? '{}')).toEqual({
      resolution: 'IGNORE_WITH_REASON',
      reason: 'Cây xăng ghi trùng dòng này',
    });
  });
});

test.describe('ranh gioi vai', () => {
  test('lai xe mo muc Nhien lieu cua ke toan: khong mot yeu cau nao toi be mat soat/tieu hao', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'SALE');
    seedEntry(state);
    const seen = await mockFuelProduct(page, state);

    await page.goto('/?section=fuel');
    await expect(page.locator('body')).not.toContainText('Chứng từ máy đọc');
    await expect(page.locator('body')).not.toContainText('Tiêu hao theo xe');

    for (const forbidden of [
      '/transport/fuel/documents',
      '/transport/fuel/vehicles/',
      '/transport/fuel/entries',
    ]) {
      expect(
        seen.filter((row) => row.url.includes(forbidden)),
        forbidden,
      ).toEqual([]);
    }
  });
});
