import type { Page, Route } from '@playwright/test';

/**
 * MOT MAY CHU GIA CO TRANG THAI, du de chay HET chuoi nghiep vu cua #196 §3 tren trinh duyet that.
 *
 * ==============================================================================================
 * VI SAO PHAI CO TEP NAY, KHI DA CO `transport-operations.spec.ts`
 *
 * Mock cua bo kia phuc vu cac man DOC: no tra ve nhung bang co san de kiem dieu huong, nhan, va
 * cach ly doanh thu. No khong cho phep chung minh mot dieu ma #196 §3 doi: rang cac LENH thuc su
 * chay duoc noi tiep nhau — lap chuyen xong thi chuyen do phan cong duoc, phan cong xong thi lai
 * xe chay duoc, chay xong thi phieu dau vao duoc so, va so do doi soat duoc.
 *
 * Mot mock KHONG TRANG THAI chi chung minh nut bam duoc. Cai can chung minh la BUOC SAU nhin thay
 * ket qua cua buoc truoc — nen o day moi lenh ghi vao `state`, va moi lan doc ke tiep doc ra chinh
 * cai da ghi.
 *
 * ==============================================================================================
 * THU TU DANG KY ROUTE CO Y NGHIA
 *
 * Playwright thu cac handler theo thu tu NGUOC voi luc dang ky (cai dang ky sau duoc thu truoc).
 * Nen o day duong TONG QUAT dang ky TRUOC, duong CU THE dang ky SAU — nguoc lai thi duong
 * `/transport/trips` se nuot ca `/transport/trips/:id/assignment`.
 */

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

const idFrom = (url: string, pattern: RegExp): string => pattern.exec(url)?.[1] ?? '';

const AT = '2026-09-04T01:00:00.000Z';

export const VEHICLES = [
  {
    id: 'veh-1',
    registrationPlate: '29H-123.45',
    vehicleClass: 'TRUCK_5T',
    allowedPayloadKg: 5000,
    currentOdoKm: 120_450,
    status: 'ACTIVE',
    createdAt: AT,
    updatedAt: AT,
  },
];

export const DRIVERS = [
  {
    id: 'drv-1',
    fullName: 'Trần Văn Bình',
    phone: '0900000001',
    licenceNo: 'B2-123456',
    status: 'ACTIVE',
    authUserId: 'u-driver',
    createdAt: AT,
    updatedAt: AT,
  },
];

export const CUSTOMERS = [
  { id: 'cus-1', name: 'Công ty Hoà Phát', phone: null, note: null, createdAt: AT, updatedAt: AT },
];

export const PARTNERS = [
  {
    id: 'par-1',
    name: 'Nhà xe Đại Phát',
    roles: ['CARRIER'],
    phone: null,
    note: null,
    createdAt: AT,
    updatedAt: AT,
  },
];

export const FUEL_SUPPLIERS = [
  { id: 'sup-1', name: 'Petrolimex Cầu Giấy', taxCode: null, createdAt: AT, updatedAt: AT },
];

interface Trip {
  id: string;
  code: string;
  kind: string;
  status: string;
  businessDate: string;
  originLabel: string;
  destinationLabel: string;
  cargoDescription: string | null;
  customerId: string | null;
  carrierPartnerId: string | null;
  referrerPartnerId: string | null;
  freightAmount: number | null;
  currencyCode: string;
  distanceKm: number | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

interface FuelEntry {
  id: string;
  tripId: string;
  vehicleId: string;
  driverId: string;
  supplierId: string;
  businessDate: string;
  occurredAt: string;
  litersUnits: number;
  amount: number;
  currencyCode: string;
  odometerKm: number;
  previousOdometerKm: number | null;
  consumptionUnits: number | null;
  reviewReasons: string[];
  paymentMethod: string;
  verificationStatus: string;
  reconciliationStatus: string;
  sourceStatementId: string | null;
  invoiceNo: string | null;
  note: string | null;
  reviewNote: string | null;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkOrder {
  id: string;
  vehicleId: string;
  planId: string | null;
  status: string;
  description: string;
  openedDate: string;
  openedOdoKm: number;
  openedAt: string;
  completedDate: string | null;
  completedOdoKm: number | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  costAmount: number | null;
  note: string | null;
}

interface Payslip {
  id: string;
  runId: string;
  driverId: string;
  kind: string;
  status: string;
  grossEarnings: number;
  totalDeductions: number;
  netAmount: number;
  currencyCode: string;
  driverFundBalanceSnapshot: number | null;
  tripCount: number;
  distanceKm: number;
  correctsId: string | null;
  correctionReason: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayrollPeriod {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayrollRun {
  id: string;
  periodId: string;
  sequence: number;
  policySnapshot: unknown;
  policyVersion: string;
  missingInputs: unknown[];
  runAt: string;
}

/** Trang thai cua may chu gia — mot bien duy nhat, de bai test doc lai duoc khi can. */
export interface LifecycleState {
  trips: Map<string, Trip>;
  assignments: Map<string, { vehicleId: string | null; driverId: string | null }>;
  fuelEntries: Map<string, FuelEntry>;
  fuelEvidence: Map<string, { id: string; contentType: string }[]>;
  workOrders: Map<string, WorkOrder>;
  complianceDocuments: unknown[];
  payrollPeriods: Map<string, PayrollPeriod>;
  payrollRuns: Map<string, PayrollRun>;
  payslips: Map<string, Payslip>;
  reconciliations: Map<string, unknown>;
  seq: number;
  /**
   * VAI DANG DANG NHAP — DOI DUOC GIUA CHUNG BAI TEST.
   *
   * Chuoi cua §3 di qua tay hai nguoi: van hanh lap chuyen va phan cong, lai xe chay va nop phieu,
   * roi ke toan xac thuc. Neu moi vai la mot `page` rieng thi moi `page` co mot may chu gia rieng,
   * va "lai xe nop phieu" se khong bao gio den duoc man hinh cua ke toan — bai test se chi chung
   * minh hai the gioi song song. Nen vai nam TRONG trang thai, va bai test doi no roi tai lai.
   */
  role: Role;
}

const newState = (): LifecycleState => ({
  trips: new Map(),
  assignments: new Map(),
  fuelEntries: new Map(),
  fuelEvidence: new Map(),
  workOrders: new Map(),
  complianceDocuments: [],
  payrollPeriods: new Map(),
  payrollRuns: new Map(),
  payslips: new Map(),
  reconciliations: new Map(),
  seq: 0,
  role: 'ADMIN',
});

export type Role = 'SALE' | 'ACCOUNTING' | 'ADMIN';

/**
 * Gan may chu gia vao `page`. Tra ve chinh `state` de bai test khang dinh duoc ve PHIA MAY CHU khi
 * can — vi du "sau khi bam Xac thuc, phieu o may chu that su doi trang thai", chu khong chi "chu
 * tren man hinh doi".
 */
export async function mockLifecycle(page: Page, role: Role = 'ADMIN'): Promise<LifecycleState> {
  const state = newState();
  state.role = role;
  const next = (prefix: string): string => `${prefix}-${(state.seq += 1)}`;

  /* ---------------- danh tinh ---------------- */
  await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/auth/me', (route) =>
    json(route, {
      user: {
        id: state.role === 'SALE' ? 'u-driver' : 'u-1',
        username: 'e2e',
        name: `Người dùng ${state.role}`,
        role: state.role,
      },
      roles: [state.role],
    }),
  );

  /* ---------------- danh muc ---------------- */
  await page.route('**/transport/vehicles', (route) => json(route, VEHICLES));
  await page.route('**/transport/drivers', (route) => json(route, DRIVERS));
  await page.route('**/transport/customers', (route) => json(route, CUSTOMERS));
  await page.route('**/transport/partners', (route) => json(route, PARTNERS));
  await page.route('**/transport/fuel/suppliers', (route) => json(route, FUEL_SUPPLIERS));
  // Duong doc cay xang CUA LAI XE — pham vi cua chinh ho, khong phai duong van hanh.
  await page.route('**/transport/me/fuel/suppliers', (route) =>
    json(
      route,
      FUEL_SUPPLIERS.map((row) => ({ id: row.id, name: row.name })),
    ),
  );
  await page.route('**/transport/me/expense-categories', (route) =>
    json(route, [{ code: 'ROAD_TOLL', label: 'Phí cầu đường', requiresEvidence: false }]),
  );

  /* ---------------- doc tinh, du de man hinh ve ra ---------------- */
  await page.route('**/transport/settlement/**', (route) => json(route, []));
  await page.route('**/transport/fleet-status', (route) => json(route, []));
  await page.route('**/transport/alerts', (route) =>
    json(route, { generatedFor: '2026-09-30', alerts: [], unavailableSources: [] }),
  );
  await page.route('**/transport/maintenance/due', (route) => json(route, []));
  await page.route('**/transport/maintenance/plans', (route) => json(route, []));
  await page.route('**/transport/compliance/alerts', (route) => json(route, []));
  await page.route('**/transport/costing/driver-fund/**', (route) => json(route, []));
  /*
   * `GET /transport/costing/trips/:id/expenses` tra mot DOI TUONG `TripCostBreakdown`, khong phai
   * mot mang. Tra `[]` o day tung lam ca trang trang: `toTripCost` doc `breakdown.expenses` ra
   * `undefined` roi trai no, va React go ca cay xuong. Mot mock sai hinh dang khong bao loi kieu —
   * no chi lam bai test do o mot cho khac han.
   */
  await page.route('**/transport/costing/trips/**', (route) =>
    json(route, {
      tripId: idFrom(route.request().url(), /trips\/([^/]+)\//),
      currencyCode: 'VND',
      directCost: 0,
      expenses: [],
    }),
  );
  await page.route('**/transport/me/fund', (route) =>
    json(route, {
      driverId: 'drv-1',
      openingBalance: 0,
      advanceTotal: 0,
      expenseTotal: 0,
      returnTotal: 0,
      adjustmentTotal: 0,
      closingBalance: 0,
      currencyCode: 'VND',
      entries: [],
    }),
  );

  /* ---------------- CHUYEN: lap · phan cong · doi trang thai ---------------- */
  await page.route('**/transport/trips', async (route) => {
    if (route.request().method() !== 'POST') return json(route, [...state.trips.values()]);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const id = next('trip');
    const trip: Trip = {
      id,
      code: String(body.code),
      kind: String(body.kind),
      status: 'PLANNED',
      businessDate: String(body.businessDate ?? '2026-09-04'),
      originLabel: String(body.originLabel),
      destinationLabel: String(body.destinationLabel),
      cargoDescription: (body.cargoDescription as string | null) ?? null,
      customerId: (body.customerId as string | null) ?? null,
      carrierPartnerId: (body.carrierPartnerId as string | null) ?? null,
      referrerPartnerId: (body.referrerPartnerId as string | null) ?? null,
      freightAmount: (body.freightAmount as number | null) ?? null,
      currencyCode: 'VND',
      distanceKm: (body.distanceKm as number | null) ?? null,
      createdAt: AT,
      updatedAt: AT,
      cancelledAt: null,
      cancellationReason: null,
    };
    state.trips.set(id, trip);
    return json(route, trip, 201);
  });

  await page.route('**/transport/trips/*/assignments', (route) => {
    const tripId = idFrom(route.request().url(), /trips\/([^/]+)\/assignments/);
    const current = state.assignments.get(tripId);
    return json(
      route,
      current === undefined
        ? []
        : [
            {
              id: `asg-${tripId}`,
              tripId,
              vehicleId: current.vehicleId,
              driverId: current.driverId,
              effectiveFrom: AT,
              effectiveTo: null,
              assignedBy: 'u-1',
              createdAt: AT,
            },
          ],
    );
  });

  await page.route('**/transport/trips/*/assignment', async (route) => {
    const tripId = idFrom(route.request().url(), /trips\/([^/]+)\/assignment/);
    const body = route.request().postDataJSON() as {
      vehicleId?: string | null;
      driverId?: string | null;
    };
    // CUONG CHE dung hop dong `.strict()` cua may chu that: thieu mot khoa la 400, khong phai mot
    // truong bi bo qua im lang. Neu man hinh quen gui `driverId`, bai test phai DO o day.
    if (!('vehicleId' in body) || !('driverId' in body)) {
      return json(route, { message: 'assignment can du ca vehicleId lan driverId' }, 400);
    }
    state.assignments.set(tripId, {
      vehicleId: body.vehicleId ?? null,
      driverId: body.driverId ?? null,
    });
    return json(
      route,
      {
        id: `asg-${tripId}`,
        tripId,
        vehicleId: body.vehicleId ?? null,
        driverId: body.driverId ?? null,
        effectiveFrom: AT,
        effectiveTo: null,
        assignedBy: 'u-1',
        createdAt: AT,
      },
      201,
    );
  });

  await page.route('**/transport/trips/*/transition', async (route) => {
    const id = idFrom(route.request().url(), /trips\/([^/]+)\/transition/);
    const trip = state.trips.get(id);
    if (trip === undefined) return json(route, { message: `Khong tim thay chuyen ${id}` }, 404);
    const body = route.request().postDataJSON() as { to: string };
    const updated = { ...trip, status: body.to };
    state.trips.set(id, updated);
    return json(route, updated);
  });

  /* ---------------- BE MAT LAI XE ---------------- */
  await page.route('**/transport/me/trips', (route) =>
    json(
      route,
      [...state.trips.values()]
        .filter((trip) => state.assignments.get(trip.id)?.driverId === 'drv-1')
        .map((trip) => ({
          id: trip.id,
          code: trip.code,
          kind: trip.kind,
          status: trip.status,
          businessDate: trip.businessDate,
          originLabel: trip.originLabel,
          destinationLabel: trip.destinationLabel,
          cargoDescription: trip.cargoDescription,
          customerName: 'Công ty Hoà Phát',
          vehicleId: state.assignments.get(trip.id)?.vehicleId ?? null,
          vehicleRegistrationPlate: '29H-123.45',
          distanceKm: trip.distanceKm,
          isCurrentAssignee: true,
        })),
    ),
  );

  await page.route('**/transport/me/trips/*/status', async (route) => {
    const id = idFrom(route.request().url(), /me\/trips\/([^/]+)\/status/);
    const trip = state.trips.get(id);
    if (trip === undefined) return json(route, { message: 'Khong tim thay chuyen' }, 404);
    const body = route.request().postDataJSON() as { to: string };
    state.trips.set(id, { ...trip, status: body.to });
    return json(route, { ...trip, status: body.to });
  });

  const driverSlipView = (entry: FuelEntry): unknown => ({
    id: entry.id,
    tripId: entry.tripId,
    vehicleId: entry.vehicleId,
    supplierId: entry.supplierId,
    businessDate: entry.businessDate,
    occurredAt: entry.occurredAt,
    litersUnits: entry.litersUnits,
    amount: entry.amount,
    currencyCode: entry.currencyCode,
    odometerKm: entry.odometerKm,
    previousOdometerKm: entry.previousOdometerKm,
    consumptionUnits: entry.consumptionUnits,
    reviewReasons: entry.reviewReasons,
    paymentMethod: entry.paymentMethod,
    verificationStatus: entry.verificationStatus,
    reconciliationStatus: entry.reconciliationStatus,
    invoiceNo: entry.invoiceNo,
    note: entry.note,
    reviewNote: entry.reviewNote,
    evidenceCount: (state.fuelEvidence.get(entry.id) ?? []).length,
    // `locator` va `uploadedBy` CO Y vang mat — xem `driver-fuel.view.ts`.
    evidence: (state.fuelEvidence.get(entry.id) ?? []).map((file) => ({
      id: file.id,
      contentType: file.contentType,
    })),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });

  await page.route('**/transport/me/fuel/slips', async (route) => {
    if (route.request().method() !== 'POST') {
      return json(route, [...state.fuelEntries.values()].map(driverSlipView));
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const id = next('fuel');
    const entry: FuelEntry = {
      id,
      tripId: String(body.tripId),
      vehicleId: String(body.vehicleId),
      driverId: 'drv-1',
      supplierId: String(body.supplierId),
      businessDate: String(body.businessDate ?? '2026-09-04'),
      occurredAt: AT,
      litersUnits: Number(body.litersUnits),
      amount: Number(body.amount),
      currencyCode: 'VND',
      odometerKm: Number(body.odometerKm),
      previousOdometerKm: null,
      consumptionUnits: null,
      reviewReasons: [],
      paymentMethod: String(body.paymentMethod ?? 'DRIVER_CASH'),
      verificationStatus: 'DECLARED',
      reconciliationStatus: 'UNMATCHED',
      sourceStatementId: null,
      invoiceNo: (body.invoiceNo as string | null) ?? null,
      note: (body.note as string | null) ?? null,
      reviewNote: null,
      recordedBy: 'u-driver',
      createdAt: AT,
      updatedAt: AT,
    };
    state.fuelEntries.set(id, entry);
    return json(route, driverSlipView(entry), 201);
  });

  await page.route('**/transport/me/fuel/slips/*/evidence', async (route) => {
    const id = idFrom(route.request().url(), /slips\/([^/]+)\/evidence/);
    const list = state.fuelEvidence.get(id) ?? [];
    const file = { id: next('ev'), contentType: 'image/jpeg' };
    state.fuelEvidence.set(id, [...list, file]);
    return json(route, { ...file, fuelEntryId: id, createdAt: AT }, 201);
  });

  await page.route('**/transport/me/fuel/slips/*/resubmit', async (route) => {
    const id = idFrom(route.request().url(), /slips\/([^/]+)\/resubmit/);
    const entry = state.fuelEntries.get(id);
    if (entry === undefined) return json(route, { message: 'Khong tim thay phieu' }, 404);
    const updated = { ...entry, verificationStatus: 'DECLARED' };
    state.fuelEntries.set(id, updated);
    return json(route, driverSlipView(updated));
  });

  await page.route('**/transport/me/expenses', async (route) =>
    json(route, { id: next('exp'), createdAt: AT }, 201),
  );
  await page.route('**/transport/me/payslips', (route) =>
    json(
      route,
      [...state.payslips.values()]
        .filter((row) => row.status === 'PAID' || row.status === 'APPROVED')
        .map((row) => ({
          id: row.id,
          periodLabel: 'Tháng 9/2026',
          kind: row.kind,
          status: row.status,
          grossEarnings: row.grossEarnings,
          totalDeductions: row.totalDeductions,
          netAmount: row.netAmount,
          currencyCode: 'VND',
          tripCount: row.tripCount,
          distanceKm: row.distanceKm,
          paidAt: row.paidAt,
        })),
    ),
  );

  /* ---------------- PHIEU DO DAU: be mat van hanh ---------------- */
  await page.route('**/transport/fuel/trips/*/entries', (route) => {
    const tripId = idFrom(route.request().url(), /trips\/([^/]+)\/entries/);
    return json(
      route,
      [...state.fuelEntries.values()].filter((entry) => entry.tripId === tripId),
    );
  });

  await page.route('**/transport/fuel/entries/*', (route) => {
    const id = idFrom(route.request().url(), /entries\/([^/?]+)/);
    const entry = state.fuelEntries.get(id);
    if (entry === undefined) return json(route, { message: 'Khong tim thay phieu' }, 404);
    return json(route, {
      entry,
      evidence: (state.fuelEvidence.get(id) ?? []).map((file) => ({
        ...file,
        fuelEntryId: id,
        locator: `mock://${file.id}`,
        byteSize: 1024,
        capturedAt: null,
        uploadedBy: 'u-driver',
        createdAt: AT,
      })),
    });
  });

  const moveEntry = async (route: Route, to: string, note: string | null): Promise<void> => {
    const id = idFrom(route.request().url(), /entries\/([^/]+)\//);
    const entry = state.fuelEntries.get(id);
    if (entry === undefined) return json(route, { message: 'Khong tim thay phieu' }, 404);
    const updated = { ...entry, verificationStatus: to, reviewNote: note ?? entry.reviewNote };
    state.fuelEntries.set(id, updated);
    return json(route, updated);
  };

  await page.route('**/transport/fuel/entries/*/verify', (route) =>
    moveEntry(route, 'VERIFIED', null),
  );
  await page.route('**/transport/fuel/entries/*/reject', (route) => {
    const body = route.request().postDataJSON() as { reason?: string };
    if (typeof body.reason !== 'string' || body.reason.trim() === '') {
      return json(route, { message: 'reason la bat buoc' }, 400);
    }
    return moveEntry(route, 'REJECTED', body.reason);
  });
  await page.route('**/transport/fuel/entries/*/resubmit', (route) =>
    moveEntry(route, 'DECLARED', null),
  );

  /* ---------------- BANG KE + DOI SOAT ---------------- */
  const PREVIEW = {
    headers: ['bien_so', 'ngay', 'so_lit', 'so_tien'],
    rowCount: 2,
    acceptedCount: 1,
    rejectedCount: 1,
    rejectionsByReason: { UNKNOWN_VEHICLE: 1 },
    lines: [
      {
        rowNumber: 1,
        status: 'ACCEPTED',
        rejectReason: null,
        vehiclePlateRaw: '29H-123.45',
        vehicleId: 'veh-1',
        businessDate: '2026-09-04',
        litersUnits: 60_000,
        amount: 1_320_000,
        invoiceNo: 'HD-001',
        note: null,
        rawValues: {},
      },
      {
        rowNumber: 2,
        status: 'REJECTED',
        rejectReason: 'UNKNOWN_VEHICLE',
        vehiclePlateRaw: '99Z-999.99',
        vehicleId: null,
        businessDate: '2026-09-04',
        litersUnits: 10_000,
        amount: 220_000,
        invoiceNo: null,
        note: null,
        rawValues: {},
      },
    ],
    sourceDigest: 'sha256:mock',
  };

  await page.route('**/transport/fuel/reconciliations', (route) =>
    json(route, [...state.reconciliations.values()]),
  );
  await page.route('**/transport/fuel/statements/preview', (route) => json(route, PREVIEW));
  await page.route('**/transport/fuel/statements', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const id = next('rec');
    const reconciliation = {
      id,
      supplierId: String(body.supplierId),
      statementId: `stm-${id}`,
      periodStart: String(body.periodStart),
      periodEnd: String(body.periodEnd),
      state: 'OPEN',
      closedAt: null,
      createdAt: AT,
      updatedAt: AT,
    };
    state.reconciliations.set(id, reconciliation);
    return json(
      route,
      {
        statement: { id: `stm-${id}`, supplierId: body.supplierId, filename: body.filename },
        lines: [{ id: `line-${id}`, rowNumber: 1 }],
        reconciliation,
        preview: PREVIEW,
      },
      201,
    );
  });

  /* ---------------- BAO DUONG + GIAY TO ---------------- */
  await page.route('**/transport/maintenance/work-orders', async (route) => {
    if (route.request().method() !== 'POST') return json(route, [...state.workOrders.values()]);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const id = next('wo');
    const order: WorkOrder = {
      id,
      vehicleId: String(body.vehicleId),
      planId: (body.planId as string | null) ?? null,
      status: 'OPEN',
      description: String(body.description),
      openedDate: String(body.openedDate),
      openedOdoKm: Number(body.openedOdoKm),
      openedAt: AT,
      completedDate: null,
      completedOdoKm: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      costAmount: null,
      note: null,
    };
    state.workOrders.set(id, order);
    return json(route, order, 201);
  });

  await page.route('**/transport/maintenance/work-orders/*/complete', async (route) => {
    const id = idFrom(route.request().url(), /work-orders\/([^/]+)\/complete/);
    const order = state.workOrders.get(id);
    if (order === undefined) return json(route, { message: 'Khong tim thay lenh' }, 404);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const updated: WorkOrder = {
      ...order,
      status: 'COMPLETED',
      completedDate: String(body.completedDate),
      completedOdoKm: Number(body.completedOdoKm),
      completedAt: AT,
      costAmount: (body.costAmount as number | null) ?? null,
    };
    state.workOrders.set(id, updated);
    return json(route, updated);
  });

  await page.route('**/transport/maintenance/work-orders/*/cancel', async (route) => {
    const id = idFrom(route.request().url(), /work-orders\/([^/]+)\/cancel/);
    const order = state.workOrders.get(id);
    if (order === undefined) return json(route, { message: 'Khong tim thay lenh' }, 404);
    const body = route.request().postDataJSON() as { reason?: string };
    if (typeof body.reason !== 'string' || body.reason.trim() === '') {
      return json(route, { message: 'reason la bat buoc' }, 400);
    }
    const updated: WorkOrder = {
      ...order,
      status: 'CANCELLED',
      cancelledAt: AT,
      cancellationReason: body.reason,
    };
    state.workOrders.set(id, updated);
    return json(route, updated);
  });

  await page.route('**/transport/compliance/documents', async (route) => {
    if (route.request().method() !== 'POST') return json(route, state.complianceDocuments);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const doc = { id: next('doc'), ...body, status: 'ACTIVE', createdAt: AT, updatedAt: AT };
    state.complianceDocuments = [...state.complianceDocuments, doc];
    return json(route, doc, 201);
  });

  /* ---------------- LUONG ---------------- */
  await page.route('**/transport/payroll/periods', async (route) => {
    if (route.request().method() !== 'POST') return json(route, [...state.payrollPeriods.values()]);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const id = next('per');
    const period: PayrollPeriod = {
      id,
      label: String(body.label),
      startDate: String(body.startDate),
      endDate: String(body.endDate),
      status: 'OPEN',
      closedAt: null,
      createdAt: AT,
      updatedAt: AT,
    };
    state.payrollPeriods.set(id, period);
    return json(route, period, 201);
  });

  await page.route('**/transport/payroll/periods/*/close', async (route) => {
    const id = idFrom(route.request().url(), /periods\/([^/]+)\/close/);
    const period = state.payrollPeriods.get(id);
    if (period === undefined) return json(route, { message: 'Khong tim thay ky' }, 404);
    const updated = { ...period, status: 'CLOSED', closedAt: AT };
    state.payrollPeriods.set(id, updated);
    return json(route, updated);
  });

  await page.route('**/transport/payroll/periods/*/runs', (route) => {
    const periodId = idFrom(route.request().url(), /periods\/([^/]+)\/runs/);
    return json(
      route,
      [...state.payrollRuns.values()].filter((run) => run.periodId === periodId),
    );
  });

  await page.route('**/transport/payroll/runs', async (route) => {
    const body = route.request().postDataJSON() as { periodId: string };
    const id = next('run');
    const run: PayrollRun = {
      id,
      periodId: body.periodId,
      sequence: 1,
      policySnapshot: { version: 'v1' },
      policyVersion: 'v1',
      missingInputs: [],
      runAt: AT,
    };
    state.payrollRuns.set(id, run);
    const slipId = next('slip');
    state.payslips.set(slipId, {
      id: slipId,
      runId: id,
      driverId: 'drv-1',
      kind: 'REGULAR',
      status: 'DRAFT',
      grossEarnings: 12_000_000,
      totalDeductions: 2_000_000,
      netAmount: 10_000_000,
      currencyCode: 'VND',
      driverFundBalanceSnapshot: 0,
      tripCount: 1,
      distanceKm: 78,
      correctsId: null,
      correctionReason: null,
      approvedAt: null,
      paidAt: null,
      createdAt: AT,
      updatedAt: AT,
    });
    return json(route, run, 201);
  });

  await page.route('**/transport/payroll/runs/*/payslips', (route) => {
    const runId = idFrom(route.request().url(), /runs\/([^/]+)\/payslips/);
    return json(
      route,
      [...state.payslips.values()].filter((row) => row.runId === runId),
    );
  });

  const movePayslip = async (route: Route, to: string): Promise<void> => {
    const id = idFrom(route.request().url(), /payslips\/([^/]+)\//);
    const slip = state.payslips.get(id);
    if (slip === undefined) return json(route, { message: 'Khong tim thay phieu' }, 404);
    const updated: Payslip = {
      ...slip,
      status: to,
      approvedAt: to === 'APPROVED' ? AT : slip.approvedAt,
      paidAt: to === 'PAID' ? AT : slip.paidAt,
    };
    state.payslips.set(id, updated);
    return json(route, updated);
  };

  await page.route('**/transport/payroll/payslips/*', (route) => {
    const id = idFrom(route.request().url(), /payslips\/([^/?]+)/);
    const slip = state.payslips.get(id);
    if (slip === undefined) return json(route, { message: 'Khong tim thay phieu' }, 404);
    return json(route, { payslip: slip, components: [], missingInputs: [] });
  });

  await page.route('**/transport/payroll/payslips/*/approve', (route) =>
    movePayslip(route, 'APPROVED'),
  );
  await page.route('**/transport/payroll/payslips/*/pay', (route) => movePayslip(route, 'PAID'));

  await page.route('**/transport/payroll/payslips/*/corrections', async (route) => {
    const id = idFrom(route.request().url(), /payslips\/([^/]+)\/corrections/);
    const original = state.payslips.get(id);
    if (original === undefined) return json(route, { message: 'Khong tim thay phieu' }, 404);
    const body = route.request().postDataJSON() as { kind: string; reason?: string };
    if (typeof body.reason !== 'string' || body.reason.trim() === '') {
      return json(route, { message: 'reason la bat buoc' }, 400);
    }
    // `INV-20`: phieu goc GIU NGUYEN. Phieu moi duoc GHI THEM.
    const correctionId = next('slip');
    state.payslips.set(correctionId, {
      ...original,
      id: correctionId,
      kind: body.kind,
      status: 'DRAFT',
      correctsId: original.id,
      correctionReason: body.reason,
      approvedAt: null,
      paidAt: null,
    });
    return json(route, state.payslips.get(correctionId), 201);
  });

  return state;
}
