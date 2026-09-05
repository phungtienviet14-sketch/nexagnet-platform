import { expect, test, type Page, type Route } from '@playwright/test';
import { MANAGER_HAS_NO_TRANSPORT_SCOPE } from '../../experiences/transport-operations/transport-actions';

/**
 * Be mat VAN HANH VAN TAI tren mot may chu that, voi API duoc chan o tang mang.
 *
 * May chu la THAT (`next dev` voi goi khach van tai), API la GIA. Do la dung khuon cua bo b2b, va
 * no cho phep chung minh hai thu ma test don vi khong voi tot: dia chi/back-forward tren trinh
 * duyet that, va NOI DUNG THAT DI TREN DUONG MANG — thu ma #161 §8 doi cho be mat lai xe.
 *
 * Mock co TRANG THAI: `transition` doi trang thai chuyen trong `Map`, nen lan doc sau tra ve so
 * lieu moi. Mot mock khong trang thai chi chung minh cai nut bam duoc, khong chung minh man hinh
 * da doi.
 */

type Role = 'SALE' | 'ACCOUNTING' | 'MANAGER' | 'ADMIN';

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

/* --- TX-05 / TX-06: so tong hop, du de man hinh ve ra mot bang co noi dung --- */

const AR_AGING = {
  asOf: '2026-09-30',
  rows: [
    {
      documentId: 'doc-1',
      counterpartyId: 'cus-1',
      businessDate: '2026-09-01',
      dueDate: '2026-09-15',
      outstandingAmount: 11_500_000,
      daysOverdue: 15,
      bucket: 'D1_30',
      currencyCode: 'VND',
    },
  ],
  totalsByBucket: { CURRENT: 0, D1_30: 11_500_000, D31_60: 0, D60_PLUS: 0 },
  outstandingTotal: 11_500_000,
  overdueTotal: 11_500_000,
};

const AP_ROWS = [
  {
    counterpartyId: 'par-1',
    flow: 'CARRIER_SERVICE',
    documentCount: 2,
    outstandingAmount: 6_000_000,
    currencyCode: 'VND',
  },
];

const PARTNER_POSITION = {
  partnerId: 'par-1',
  receivableAmount: 3_000_000,
  carrierPayableAmount: 5_000_000,
  commissionPayableAmount: 1_000_000,
  netDisplay: -3_000_000,
  currencyCode: 'VND',
};

const DIRECT_MARGIN = {
  tripId: 'trip-1',
  tripKind: 'OWN_DIRECT',
  revenueAmount: 11_500_000,
  directCostAmount: 6_000_000,
  carrierPayableAmount: 0,
  commissionAmount: 0,
  deductionAmount: 6_000_000,
  marginAmount: 5_500_000,
  marginBasisPoints: 4782,
  currencyCode: 'VND',
  fixedCostsIncluded: false,
  disclosure: 'Chưa gồm chi phí cố định',
  unexpectedInternalCost: false,
};

const MARGIN_ROLLUP = {
  revenueAmount: 23_000_000,
  deductionAmount: 12_000_000,
  marginAmount: 11_000_000,
  marginBasisPoints: 4782,
  tripCount: 2,
  skippedTripCount: 0,
  fixedCostsIncluded: false,
  disclosure: 'Chưa gồm chi phí cố định',
};

const MAINTENANCE_DUE = [
  {
    planId: 'plan-1',
    vehicleId: 'veh-1',
    planName: 'Thay dầu máy',
    triggerKind: 'ODOMETER',
    state: 'OVERDUE',
    dueAtOdoKm: 120_000,
    dueOnDate: null,
    odoRemainingKm: -450,
    daysRemaining: null,
    reachedBy: 'ODOMETER',
    currentOdoKm: 120_450,
    lastServicedDate: '2026-06-01',
    lastServicedOdoKm: 110_000,
  },
];

const COMPLIANCE_ALERTS = [
  {
    documentId: 'doc-insp-1',
    subjectKind: 'VEHICLE',
    subjectId: 'veh-1',
    documentType: 'VEHICLE_INSPECTION',
    validTo: '2026-10-05',
    health: 'DUE_SOON',
    daysUntilExpiry: 5,
    thresholdDays: 30,
  },
];

const ALERT_FEED = {
  generatedFor: '2026-09-30',
  alerts: [
    {
      kind: 'MAINTENANCE_OVERDUE',
      severity: 'CRITICAL',
      subjectKind: 'VEHICLE',
      subjectId: 'veh-1',
      detail: { odoRemainingKm: -450 },
    },
  ],
  unavailableSources: [],
};

interface MockTrip {
  id: string;
  code: string;
  kind: 'OWN_DIRECT' | 'EXTERNAL_CARRIER' | 'PARTNER_REFERRED_INTERNAL_RUN';
  status: 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED' | 'RECONCILED' | 'CANCELLED';
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

const seedTrips = (): Map<string, MockTrip> =>
  new Map<string, MockTrip>([
    [
      'trip-1',
      {
        id: 'trip-1',
        code: 'VT-2026-0912',
        kind: 'OWN_DIRECT',
        status: 'PLANNED',
        businessDate: '2026-09-04',
        originLabel: 'Hà Nội',
        destinationLabel: 'Thái Nguyên',
        cargoDescription: 'Hàng gia dụng',
        customerId: 'cus-1',
        carrierPartnerId: null,
        referrerPartnerId: null,
        freightAmount: 11_500_000,
        currencyCode: 'VND',
        distanceKm: 78,
        createdAt: '2026-09-04T01:00:00.000Z',
        updatedAt: '2026-09-04T01:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    [
      'trip-2',
      {
        id: 'trip-2',
        code: 'VT-2026-0913',
        kind: 'EXTERNAL_CARRIER',
        status: 'DELIVERED',
        businessDate: '2026-09-03',
        originLabel: 'Hà Nội',
        destinationLabel: 'Đà Nẵng',
        cargoDescription: null,
        customerId: 'cus-1',
        carrierPartnerId: 'par-1',
        referrerPartnerId: null,
        freightAmount: 24_000_000,
        currencyCode: 'VND',
        distanceKm: 763,
        createdAt: '2026-09-03T01:00:00.000Z',
        updatedAt: '2026-09-03T01:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    // Dang thu BA — chuyen do NGUON DON gioi thieu nhung xe nha chay. Ba dang deu phai co mat,
    // vi cach doc tien cua ba dang khac nhau (hop dong mien §9).
    [
      'trip-3',
      {
        id: 'trip-3',
        code: 'VT-2026-0914',
        kind: 'PARTNER_REFERRED_INTERNAL_RUN',
        status: 'IN_TRANSIT',
        businessDate: '2026-09-04',
        originLabel: 'Hà Nội',
        destinationLabel: 'Hải Phòng',
        cargoDescription: 'Hàng điện máy',
        customerId: 'cus-1',
        carrierPartnerId: null,
        referrerPartnerId: 'par-2',
        freightAmount: 6_800_000,
        currencyCode: 'VND',
        distanceKm: 120,
        createdAt: '2026-09-04T00:30:00.000Z',
        updatedAt: '2026-09-04T04:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    [
      'trip-4',
      {
        id: 'trip-4',
        code: 'VT-2026-0915',
        kind: 'OWN_DIRECT',
        status: 'RECONCILED',
        businessDate: '2026-09-02',
        originLabel: 'Hà Nội',
        destinationLabel: 'Nam Định',
        cargoDescription: 'Hàng gia dụng',
        customerId: 'cus-1',
        carrierPartnerId: null,
        referrerPartnerId: null,
        freightAmount: 4_200_000,
        currencyCode: 'VND',
        distanceKm: 90,
        createdAt: '2026-09-02T01:00:00.000Z',
        updatedAt: '2026-09-03T09:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    // Mot chuyen DA HUY co ly do — man hinh khong bao gio tao ra trang thai nay, nhung phai chiu
    // duoc no khi noi khac tao ra (khoang cach `G-14`).
    [
      'trip-5',
      {
        id: 'trip-5',
        code: 'VT-2026-0916',
        kind: 'EXTERNAL_CARRIER',
        status: 'CANCELLED',
        businessDate: '2026-09-01',
        originLabel: 'Hà Nội',
        destinationLabel: 'Vinh',
        cargoDescription: null,
        customerId: 'cus-1',
        carrierPartnerId: 'par-1',
        referrerPartnerId: null,
        freightAmount: 15_000_000,
        currencyCode: 'VND',
        distanceKm: 300,
        createdAt: '2026-09-01T01:00:00.000Z',
        updatedAt: '2026-09-01T06:00:00.000Z',
        cancelledAt: '2026-09-01T06:00:00.000Z',
        cancellationReason: 'Khách hoãn giao',
      },
    ],
  ]);

/** Ba xe o BA trang thai khac nhau — mot doi xe mot dong khong cho thay phu hieu nao khac nhau. */
const VEHICLES = [
  {
    id: 'veh-1',
    registrationPlate: '29H-123.45',
    vehicleClass: 'Xe tải 5 tấn',
    allowedPayloadKg: 5000,
    currentOdoKm: 120_450,
    status: 'IDLE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'veh-2',
    registrationPlate: '29H-678.90',
    vehicleClass: 'Xe tải 8 tấn',
    allowedPayloadKg: 8000,
    currentOdoKm: 87_300,
    status: 'ON_TRIP',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  },
  {
    id: 'veh-3',
    registrationPlate: '29H-246.80',
    vehicleClass: 'Xe tải 2 tấn',
    allowedPayloadKg: 2000,
    currentOdoKm: 45_120,
    status: 'UNDER_MAINTENANCE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  },
];

const DRIVERS = [
  {
    id: 'drv-1',
    fullName: 'Nguyễn Văn Bình',
    phone: '0900000001',
    licenceClass: 'FC',
    licenceExpiry: '2027-06-30',
    status: 'ACTIVE',
    authUserId: 'u-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Lai xe THU HAI ton tai de bat duoc mot loai loi ma mot fixture mot nguoi khong bao gio bat duoc:
  // phieu quy bi gui sang NGUOI KHAC vi o chon doi giua luc dang nhap.
  {
    id: 'drv-2',
    fullName: 'Trần Thị Mai',
    phone: '0900000002',
    licenceClass: 'FC',
    licenceExpiry: '2028-01-31',
    status: 'ACTIVE',
    authUserId: 'u-2',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Lai xe NGHI VIEC — de danh sach co it nhat mot dong khong o trang thai ACTIVE.
  {
    id: 'drv-3',
    fullName: 'Lê Quốc Hùng',
    phone: '0900000003',
    licenceClass: 'C',
    licenceExpiry: '2026-11-15',
    status: 'INACTIVE',
    authUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  },
];

const CUSTOMERS = [
  {
    id: 'cus-1',
    name: 'Công ty Đông Anh',
    phone: null,
    address: null,
    taxCode: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const PARTNERS = [
  {
    id: 'par-1',
    name: 'Nhà xe Trường Phát',
    phone: null,
    roles: ['CARRIER'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Doi tac HAI VAI — hop dong mien §9 noi ro khoa phan biet hai dong tien la VAI, khong phai
  // doi tac. Mot doi tac vua la nha xe vua la nguon don la truong hop that, khong phai ngoai le.
  {
    id: 'par-2',
    name: 'Logistics Bắc Hà',
    phone: null,
    roles: ['CARRIER', 'ORDER_REFERRER'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const FUEL_SUPPLIERS = [
  {
    id: 'sup-1',
    code: 'PVO-DA',
    name: 'Cây xăng Đông Anh',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sup-2',
    code: null,
    name: 'Cây xăng Gia Lâm',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Hai ky doi soat o hai trang thai — mot ky dang khop, mot ky da chot. */
const FUEL_RECONCILIATIONS = [
  {
    id: 'rec-1',
    supplierId: 'sup-1',
    statementId: 'stm-1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    state: 'MATCHING',
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    reopenReason: null,
    createdAt: '2026-09-03T02:00:00.000Z',
    updatedAt: '2026-09-04T02:00:00.000Z',
  },
  {
    id: 'rec-2',
    supplierId: 'sup-2',
    statementId: 'stm-2',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    state: 'CLOSED',
    closedAt: '2026-09-01T03:00:00.000Z',
    closedBy: 'accounting',
    reopenedAt: null,
    reopenedBy: null,
    reopenReason: null,
    createdAt: '2026-08-31T02:00:00.000Z',
    updatedAt: '2026-09-01T03:00:00.000Z',
  },
];

const ASSIGNMENT = {
  id: 'asg-1',
  tripId: 'trip-1',
  vehicleId: 'veh-1',
  driverId: 'drv-1',
  effectiveFrom: '2026-09-04T02:00:00.000Z',
  effectiveTo: null,
  assignedBy: 'operator',
  createdAt: '2026-09-04T02:00:00.000Z',
};

/** Khung nhin cua lai xe — KHONG co `freightAmount`. Do la diem cua bai kiem tra cach ly. */
const DRIVER_TRIPS = [
  {
    id: 'trip-1',
    code: 'VT-2026-0912',
    kind: 'OWN_DIRECT',
    status: 'IN_TRANSIT',
    businessDate: '2026-09-04',
    originLabel: 'Hà Nội',
    destinationLabel: 'Thái Nguyên',
    cargoDescription: 'Hàng gia dụng',
    distanceKm: 78,
    customerName: 'Công ty Đông Anh',
    vehicleRegistrationPlate: '29H-123.45',
    assignedAt: '2026-09-04T02:00:00.000Z',
    isCurrentAssignee: true,
  },
];

const DRIVER_FUND = {
  account: {
    id: 'acc-1',
    driverId: 'drv-1',
    currencyCode: 'VND',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-04T03:00:00.000Z',
  },
  driverId: 'drv-1',
  // 10.000.000 tam ung − 1.850.000 chi chuyen − 300.000 nop lai = 7.850.000.
  balance: 7_850_000,
  balanceStance: 'DRIVER_HOLDS_COMPANY_CASH',
  currencyCode: 'VND',
  entries: [
    {
      id: 'fe-1',
      accountId: 'acc-1',
      kind: 'ADVANCE',
      signedAmount: 10_000_000,
      currencyCode: 'VND',
      businessDate: '2026-09-04',
      tripId: null,
      correlationKey: 'corr-00000001',
      reversalOfId: null,
      note: 'Tạm ứng đầu tháng',
      recordedBy: 'accounting',
      createdAt: '2026-09-04T03:00:00.000Z',
    },
    // Mot khoan chi cua chuyen, va mot lan hoan quy — de so du khong phai mot dong duy nhat, va
    // de thay ca hai chieu dau cua `signedAmount`.
    {
      id: 'fe-2',
      accountId: 'acc-1',
      kind: 'TRIP_EXPENSE',
      signedAmount: -1_850_000,
      currencyCode: 'VND',
      businessDate: '2026-09-04',
      tripId: 'trip-1',
      correlationKey: 'corr-00000002',
      reversalOfId: null,
      note: 'Phí cầu đường + bốc xếp',
      recordedBy: 'accounting',
      createdAt: '2026-09-04T05:00:00.000Z',
    },
    {
      id: 'fe-3',
      accountId: 'acc-1',
      kind: 'RETURN',
      signedAmount: -300_000,
      currencyCode: 'VND',
      businessDate: '2026-09-03',
      tripId: null,
      correlationKey: 'corr-00000003',
      reversalOfId: null,
      note: 'Nộp lại tiền thừa',
      recordedBy: 'accounting',
      createdAt: '2026-09-03T10:00:00.000Z',
    },
  ],
};

async function mockTransport(page: Page, role?: Role): Promise<void> {
  const trips = seedTrips();

  await page.route('**/auth/config', (route) => json(route, { mode: role ? 'session' : 'none' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/auth/me', (route) =>
    role
      ? json(route, {
          user: { id: 'u-1', username: 'e2e', name: `Người dùng ${role}`, role },
          roles: [role],
        })
      : json(route, { message: 'Chua dang nhap' }, 401),
  );

  await page.route('**/transport/vehicles', (route) => json(route, VEHICLES));
  await page.route('**/transport/drivers', (route) => json(route, DRIVERS));
  await page.route('**/transport/customers', (route) => json(route, CUSTOMERS));
  await page.route('**/transport/partners', (route) => json(route, PARTNERS));
  await page.route('**/transport/fuel/suppliers', (route) => json(route, FUEL_SUPPLIERS));
  await page.route('**/transport/fuel/reconciliations', (route) =>
    json(route, FUEL_RECONCILIATIONS),
  );
  await page.route('**/transport/me/trips', (route) => json(route, DRIVER_TRIPS));
  await page.route('**/transport/me/fund', (route) => json(route, DRIVER_FUND));
  await page.route('**/transport/me/fuel/slips', (route) => json(route, []));
  await page.route('**/transport/costing/driver-fund/accounts/*', (route) =>
    json(route, DRIVER_FUND),
  );
  await page.route('**/transport/costing/driver-fund/accounts/*/periods', (route) =>
    json(route, []),
  );

  /*
   * TX-05 / TX-06 / TX-07 — sau muc T7D noi vao. Mock o day de bo E2E chung minh man hinh DOC va
   * VE duoc du lieu that; noi dung deu la so tong hop, khong phai cua khach nao.
   */
  await page.route('**/transport/settlement/ar-aging*', (route) => json(route, AR_AGING));
  await page.route('**/transport/settlement/ap*', (route) => json(route, AP_ROWS));
  await page.route('**/transport/settlement/partners/*/position', (route) =>
    json(route, PARTNER_POSITION),
  );
  await page.route('**/transport/settlement/direct-margin/rollup*', (route) =>
    json(route, MARGIN_ROLLUP),
  );
  await page.route('**/transport/settlement/trips/*/direct-margin', (route) =>
    json(route, DIRECT_MARGIN),
  );
  await page.route('**/transport/maintenance/due', (route) => json(route, MAINTENANCE_DUE));
  await page.route('**/transport/maintenance/plans', (route) => json(route, []));
  await page.route('**/transport/maintenance/work-orders', (route) => json(route, []));
  await page.route('**/transport/compliance/documents', (route) => json(route, []));
  await page.route('**/transport/compliance/alerts', (route) => json(route, COMPLIANCE_ALERTS));
  await page.route('**/transport/fleet-status', (route) => json(route, []));
  await page.route('**/transport/alerts', (route) => json(route, ALERT_FEED));
  await page.route('**/transport/payroll/periods', (route) => json(route, []));
  await page.route('**/transport/me/payslips', (route) => json(route, []));
  await page.route('**/transport/me/expense-categories', (route) =>
    json(route, { categories: ['BOT', 'BAI_XE'], unrestricted: false }),
  );

  await page.route('**/transport/trips', (route) => json(route, [...trips.values()]));
  await page.route('**/transport/trips/*/assignments', (route) =>
    json(route, route.request().url().includes('trip-1') ? [ASSIGNMENT] : []),
  );

  // Mock CO TRANG THAI: chuyen trang thai that su doi du lieu, nen lan doc sau thay ket qua moi.
  await page.route('**/transport/trips/*/transition', async (route) => {
    const id = /trips\/([^/]+)\/transition/.exec(route.request().url())?.[1] ?? '';
    const trip = trips.get(id);
    if (trip === undefined) return json(route, { message: `Khong tim thay chuyen ${id}` }, 404);
    const body = route.request().postDataJSON() as { to: MockTrip['status'] };
    // `DELIVERED → RECONCILED` bi tu choi o day de kiem duong LOI: man hinh phai hien NGUYEN VAN
    // cau cua may chu, khong duoc dien dat lai.
    if (trip.status === 'DELIVERED' && body.to === 'RECONCILED') {
      return json(
        route,
        { statusCode: 403, error: 'Forbidden', message: 'Chuyen VT-2026-0913: chua doi soat duoc' },
        403,
      );
    }
    trips.set(id, { ...trip, status: body.to });
    return json(route, trips.get(id));
  });
}

test.describe('vo va kien truc thong tin', () => {
  test('danh muc dung nhom, va HAI muc cua T6 hien theo nang luc goi khach', async ({ page }) => {
    await mockTransport(page);
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });
    await expect(nav.getByRole('link', { name: 'Chuyến xe' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Đội xe & lái xe' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Quỹ lái xe/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Nhiên liệu' })).toBeVisible();

    // Goi `transport-preview` bat ca `transport-asset-compliance` lan `transport-workforce`, nen
    // hai muc cua T6 HIEN — va nhom cua chung khong con mo coi. Chieu nguoc lai (khach khong bat
    // thi an) duoc khoa o `__tests__/navigation.spec.ts`, cho ca hai chieu.
    await expect(nav.getByRole('link', { name: /Bảo dưỡng/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Lương' })).toBeVisible();
    await expect(page.getByText('TÀI SẢN & NHÂN SỰ')).toBeVisible();
  });

  /**
   * BE MAT KHACH KHONG NOI NGON NGU NOI BO — quyet dinh cua chu so huu tren #202 / #196.
   *
   * Bai nay khoa HAI chieu cua cung mot yeu cau, va ca hai deu can:
   *
   *  · CHIEU CHU — `innerText` khong duoc chua mot tu nao trong bo tu vung bi cam. Bo tu vung do
   *    chep tu quyet dinh cua chu so huu, khong phai do bai test tu nghi ra.
   *  · CHIEU CAU TRUC — `.preview-ribbon` va `body[data-preview]` phai vang mat. Giu lai tu
   *    `5f47e12`, va no KHONG thua: mot dai bang ve ra bang icon, bang anh, hay bang chu bi
   *    `visibility:hidden` se lot qua chieu chu ma van con nguyen trong DOM.
   *
   * VA MOT CHIEU THU BA — khong ma so Issue/PR nao duoc ro ra man hinh. Truoc day goi khach mang
   * nhung cau nhu "Xem #168" trong `blockedCapabilities`; do la ghi chu ky thuat noi bo, va no
   * tung chay THAT tren stack cong khai.
   */
  test('KHONG con mot chu nao ve trang thai noi bo tren be mat khach', async ({ page }) => {
    await mockTransport(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Chieu CAU TRUC — mot dai bang khong co chu van la mot dai bang.
    await expect(page.locator('.preview-ribbon')).toHaveCount(0);
    await expect(page.locator('body[data-preview]')).toHaveCount(0);

    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const forbidden of [
      'bản xem trước',
      'xem trước',
      'vt mẫu',
      'preview',
      'uat',
      'synthetic',
      'demo tenant',
      'chờ api',
      'runtime-proven',
      'customer-ready',
      'business-proven',
      'chưa có khách hàng',
      'dữ liệu tổng hợp',
    ]) {
      expect(body, forbidden).not.toContain(forbidden);
    }

    // Ma so Issue/PR — `#168`, `#170`, … Neo bang KHUON chu khong bang danh sach, vi danh sach chi
    // bat duoc nhung so ai do da nho viet vao no.
    expect(body, 'ma so Issue/PR').not.toMatch(/#\d{2,}/);
  });

  /**
   * Muc Bao duong NOI VAO read model that — va bai nay kiem dung cai do, khong kiem "co chu tren
   * man hinh".
   *
   * Ba khang dinh duoi day chon co y: BIEN SO (`29H-123.45`) chung minh man hinh dich `vehicleId`
   * ra nhan nghiep vu thay vi in mot UUID; `Quá hạn` chung minh tinh trang la chu tieng Viet do
   * may chu suy ra chu khong phai mot khoa ky thuat; `Thay dầu máy` chung minh hang thuc su den
   * tu du lieu. Va `not.toContainText('chưa nối')` khoa chieu nguoc lai — cau xin loi cu khong
   * duoc quay lai bang mot lan revert.
   */
  test('muc Bao duong VE RA du lieu that cua may chu, khong phai mot cau xin loi', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=maintenance');

    await expect(page.getByRole('heading', { level: 1, name: /Bảo dưỡng/ })).toBeVisible();
    const main = page.locator('#tx-main');
    // BIEN SO chu khong phai `vehicleId`, va tinh trang doc bang chu tieng Viet.
    await expect(main).toContainText('29H-123.45');
    await expect(main).toContainText('Quá hạn');
    await expect(main).toContainText('Thay dầu máy');
    await expect(main).not.toContainText('chưa nối');
  });

  test('duong nhay ban phim dua tieu diem vao thang noi dung', async ({ page }) => {
    await mockTransport(page);
    await page.goto('/');
    // Khong khang dinh thu tu tab so voi lop phu cua `next dev` (chi co o che do dev) — khang dinh
    // dieu THAT SU quan trong: kich hoat duong nhay thi tieu diem vao khoi noi dung.
    const skip = page.getByRole('link', { name: /Bỏ qua danh mục/ });
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#tx-main')).toBeFocused();
  });

  test('MANAGER khong co thao tac nao, va man hinh noi that dieu do', async ({ page }) => {
    await mockTransport(page, 'MANAGER');
    await page.goto('/');
    /*
     * Bang bridge `GD-22` khai `MANAGER: []` co chu dich. Man hinh khong duoc bia mot anh xa quyen.
     *
     * Doi chieu voi CHINH HANG SO chu khong chep lai cau chu. Ban truoc chep tay "Vai Quan ly chua
     * duoc cap thao tac", roi cau hien thi duoc viet lai cho huong khach ma bai test thi khong —
     * nen bai nay DO vi mot ly do khong lien quan gi den dieu no muon giu. Neo vao hang so thi cau
     * chu sua bao nhieu lan cung duoc, con tinh chat "man hinh noi that voi MANAGER" van duoc khoa.
     */
    await expect(page.locator('#tx-main').getByRole('alert')).toContainText(
      MANAGER_HAS_NO_TRANSPORT_SCOPE,
    );
  });
});

test.describe('trang thai tren dia chi', () => {
  test('deep link mo dung muc, va Back tra ve muc truoc', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    await page.getByRole('link', { name: 'Chuyến xe' }).click();
    await expect(page).toHaveURL(/\?section=trips/);
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();
  });

  test('mo thang mot dia chi sau va tai lai van ra dung man hinh', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=fuel');
    await expect(page.getByRole('heading', { level: 1, name: 'Nhiên liệu' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Nhiên liệu' })).toBeVisible();
  });

  test('muc khong ton tai roi ve Tong quan, khong ra trang trang', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=khong-ton-tai');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
  });
});

test.describe('chuyen xe', () => {
  test('bang chuyen doc ra TEN khach, va chon dong thi ma chuyen len dia chi', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips');

    await expect(page.getByRole('rowheader', { name: 'VT-2026-0912' })).toBeVisible();
    // Ten khach, khong phai `cus-1`.
    await expect(page.getByRole('cell', { name: 'Công ty Đông Anh' }).first()).toBeVisible();

    await page.getByRole('rowheader', { name: 'VT-2026-0912' }).click();
    await expect(page).toHaveURL(/selected=VT-2026-0912/);
    await expect(page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ })).toBeVisible();
  });

  test('loc theo tu khoa khong dau tim ra dia danh co dau', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips');
    await page.getByLabel('Tìm chuyến').fill('da nang');
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0912' })).toHaveCount(0);
  });

  test('cho chay mot chuyen: xac nhan roi bang cap nhat', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips&selected=VT-2026-0912');

    const detail = page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ });
    await detail.getByRole('button', { name: 'Cho chạy' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cho chạy' }).click();

    // Mock co trang thai, nen dong bang phai doi THAT sang "Đang chạy".
    await expect(page.getByRole('cell', { name: 'Đang chạy' }).first()).toBeVisible();
  });

  test('may chu tu choi thi man hinh hien NGUYEN VAN cau cua may chu', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips&selected=VT-2026-0913');

    const detail = page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0913/ });
    await detail.getByRole('button', { name: 'Chốt đối soát' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Chốt đối soát' }).click();

    await expect(detail.getByRole('alert')).toContainText('chua doi soat duoc');
  });

  test('Ke toan khong duoc bay nut huy chuyen', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=trips&selected=VT-2026-0912');
    const detail = page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ });
    await expect(detail.getByRole('button', { name: 'Huỷ chuyến' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Cho chạy' })).toBeVisible();
  });
});

test.describe('quy lai xe — phieu phai giu dung nguoi', () => {
  test('phieu tam ung ghim lai xe cua chinh no va noi ten nguoi do', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=driver-fund');

    const picker = page.getByRole('combobox', { name: /^Lái xe/ });
    await expect(picker).toBeEnabled();
    await picker.selectOption('drv-1');

    await page.getByRole('button', { name: 'Tạm ứng' }).click();

    // Dau phieu phai NEU TEN — de neu o chon co doi thi phieu van noi ro no thuoc ve ai.
    await expect(
      page.getByRole('heading', { name: /Tạm ứng cho lái xe — Nguyễn Văn Bình/ }),
    ).toBeVisible();

    // Va o chon bi KHOA khi phieu dang mo: bo hoan toan duong gui tien sang nguoi khac.
    await expect(picker).toBeDisabled();
  });

  test('dong phieu thi o chon lai xe mo lai', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=driver-fund');

    await page.getByRole('button', { name: 'Tạm ứng' }).click();
    await expect(page.getByRole('combobox', { name: /^Lái xe/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page.getByRole('combobox', { name: /^Lái xe/ })).toBeEnabled();
  });
});

test.describe('be mat lai xe — cach ly doanh thu', () => {
  test('lai xe khong thay muc van hanh nao, va mo duoc man cua chinh minh', async ({ page }) => {
    await mockTransport(page, 'SALE');
    await page.goto('/?surface=driver');

    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Điều hướng lái xe' })).toBeVisible();
    // Khong co duong quay ra van hanh, vi vai nay khong co pham vi do.
    await expect(page.getByRole('button', { name: 'Về vận hành' })).toHaveCount(0);
  });

  test('NOI DUNG DI TREN DUONG MANG cua be mat lai xe khong chua gia cuoc', async ({ page }) => {
    await mockTransport(page, 'SALE');

    const payloads: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/transport/me/')) {
        void response
          .text()
          .then((text) => payloads.push(text))
          .catch(() => undefined);
      }
    });

    await page.goto('/?surface=driver');
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();
    await page.getByRole('link', { name: 'Quỹ' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Quỹ của bạn' })).toBeVisible();

    expect(payloads.length).toBeGreaterThan(0);
    // #161 §8: khong phai "bi CSS che di" — khong co trong payload.
    for (const payload of payloads) {
      expect(payload).not.toContain('freightAmount');
      expect(payload).not.toContain('marginAmount');
      expect(payload).not.toContain('11500000');
    }
  });

  test('lai xe go tay dia chi cua man hinh van hanh thi khong vao duoc', async ({ page }) => {
    await mockTransport(page, 'SALE');
    await page.goto('/?section=driver-fund');
    // Khong co muc van hanh nao hien ra, nen vo bay cau noi that thay vi mot bang trong.
    await expect(page.locator('#tx-main').getByRole('alert')).toContainText('Vai Lái xe');
  });
});

test.describe('be rong man hinh', () => {
  test('o be rong dien thoai, danh muc thanh ngan keo va trang khong tran ngang', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/?section=trips');

    const drawer = page.getByRole('button', { name: 'Danh mục' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-expanded', 'false');
    await drawer.click();
    await expect(page.getByRole('button', { name: 'Đóng danh mục' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // Than trang KHONG duoc tran ngang; tran ngang phai nam trong khung bang.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('anh chup lam bang chung', () => {
  test('chup bo anh o be rong may tinh va dien thoai', async ({ page }, testInfo) => {
    // Muoi anh `fullPage` tren `next dev` (bien dich tung route lan dau) khong vua trong 30 giay
    // mac dinh. Bai nay CHUP chu khong khang dinh toc do, nen noi rong thoi gian la dung viec —
    // moi khang dinh ve hanh vi van nam o cac bai khac, voi thoi gian mac dinh.
    test.setTimeout(300_000);
    await mockTransport(page, 'ADMIN');

    await page.setViewportSize({ width: 1440, height: 900 });
    // `maintenance` va `payroll` nam trong bo anh vi goi xem truoc BAT hai nang luc T6 — nguoi
    // review can thay ca cac muc chua noi vao may chu, dung nhu chung dang hien ra.
    for (const section of [
      '',
      'trips',
      'fleet',
      'driver-fund',
      'fuel',
      'settlement',
      'maintenance',
      'payroll',
    ]) {
      await page.goto(section === '' ? '/' : `/?section=${section}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`desktop-${section === '' ? 'overview' : section}.png`),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/?section=trips');
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-trips.png'), fullPage: true });

    await mockTransport(page, 'SALE');
    await page.goto('/?surface=driver');
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-driver-home.png'), fullPage: true });

    await page.goto('/?surface=driver&screen=trip');
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-driver-trip.png'), fullPage: true });
  });
});
