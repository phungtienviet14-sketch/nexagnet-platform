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

/**
 * MOT VONG CHAY HAI CHANG: mot co hang, mot RONG. Day la hinh dang ma `#274` §4 mo ta.
 *
 * `plannedDistanceKm` lech `distanceKm` o chang dau de bai kiem doc duoc do lech ke hoach/thuc te.
 */
const JOURNEY = {
  run: {
    runId: 'r-1',
    runCode: 'RUN-E2E-1',
    vehicleId: 'v-1',
    vehiclePlate: '29H-111.11',
    status: 'COMPLETED',
    businessDate: '2026-09-08',
    startedAt: '2026-09-08T01:00:00.000Z',
    completedAt: '2026-09-08T12:00:00.000Z',
    driverId: 'd-1',
  },
  distance: {
    loadedKm: 105,
    emptyKm: 105,
    totalKm: 210,
    emptyRatio: 0.5,
    complete: true,
    legsMissingDistance: { loaded: 0, empty: 0 },
    countedLegs: 2,
  },
  orderCodes: ['ORD-E2E-1'],
  legs: [
    {
      legId: 'l-1',
      sequence: 1,
      kind: 'LOADED',
      status: 'COMPLETED',
      orderCode: 'ORD-E2E-1',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      businessDate: '2026-09-08',
      distanceKm: 105,
      plannedDistanceKm: 100,
      startedAt: '2026-09-08T02:00:00.000Z',
      completedAt: '2026-09-08T06:00:00.000Z',
      phase: 'DELIVERED',
    },
    {
      legId: 'l-2',
      sequence: 2,
      kind: 'EMPTY',
      status: 'COMPLETED',
      orderCode: null,
      originLabel: 'Hải Phòng',
      destinationLabel: 'Hà Nội',
      businessDate: '2026-09-08',
      distanceKm: 105,
      plannedDistanceKm: null,
      startedAt: '2026-09-08T07:00:00.000Z',
      completedAt: '2026-09-08T11:00:00.000Z',
      phase: null,
    },
  ],
  timeline: [
    {
      kind: 'CHECKPOINT',
      code: 'DELIVERY_ACCEPTED',
      at: '2026-09-08T06:00:00.000Z',
      legId: 'l-1',
      hasLocationProof: true,
      subjectId: 'cp-1',
    },
  ],
  unavailableSources: [],
};

const JOURNEY_MAP = {
  runId: 'r-1',
  runCode: 'RUN-E2E-1',
  legs: [
    {
      legId: 'l-1',
      sequence: 1,
      kind: 'LOADED',
      origin: {
        point: { latitude: 21.0278, longitude: 105.8342 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-08T02:00:00.000Z',
      },
      originGap: null,
      destination: {
        point: { latitude: 20.8449, longitude: 106.6881 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-08T06:00:00.000Z',
      },
      destinationGap: null,
      paths: [
        { kind: 'PLANNED', points: [], gap: 'NO_ROUTE_PROVIDER', sampledFrom: 0 },
        {
          kind: 'CHECKPOINT_ANCHORED',
          points: [
            { latitude: 21.0278, longitude: 105.8342 },
            { latitude: 20.8449, longitude: 106.6881 },
          ],
          gap: null,
          sampledFrom: 2,
        },
      ],
    },
  ],
  unavailableSources: [],
};

const FLEET_INSIGHT = {
  range: { from: '2026-08-10', to: '2026-09-08', businessDays: 30 },
  utilisationFormula: 'ngayCoChangKhongHuy / ngayLichTrongKhoang',
  vehicles: [
    {
      vehicleId: 'v-1',
      registrationPlate: '29H-111.11',
      status: 'IDLE',
      runCount: 3,
      activeBusinessDays: 6,
      utilisation: 0.2,
      loadedKm: 300,
      emptyKm: 150,
      totalKm: 450,
      emptyRatio: 1 / 3,
      legsMissingDistance: 0,
    },
  ],
  presence: { total: 1, idle: 1, onTrip: 0, underMaintenance: 0 },
  totals: { loadedKm: 300, emptyKm: 150, totalKm: 450, emptyRatio: 1 / 3, legsMissingDistance: 0 },
};

const CORRIDOR_INSIGHT = {
  range: { from: '2026-08-10', to: '2026-09-08', businessDays: 30 },
  grouping: 'FREE_TEXT_LABEL_COMPATIBILITY',
  emptyAttribution: 'PRECEDING_LOADED_LEG_IN_SAME_RUN',
  corridors: [
    {
      corridorKey: 'hà nội → hải phòng',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      legCount: 3,
      orderCodes: ['ORD-E2E-1'],
      runCodes: ['RUN-E2E-1'],
      loadedKm: 315,
      medianLoadedKm: 105,
      attributedEmptyKm: 210,
      legsMissingDistance: 0,
    },
  ],
};

/**
 * THAP DIEU HANH sau Lane N: ba cot giai doan MO (khong con `AWAITING_CHECKPOINT_SOURCE`), va
 * `WAITING` van dong nhung bang mot ma RIENG.
 */
const CONTROL_TOWER = {
  generatedFor: '2026-09-08',
  board: [
    { column: 'PLANNED', cards: [], total: 0, unavailableReason: null },
    { column: 'PICKUP', cards: [], total: 0, unavailableReason: null },
    { column: 'LOADING', cards: [], total: 0, unavailableReason: null },
    {
      column: 'IN_TRANSIT',
      total: 1,
      unavailableReason: null,
      cards: [
        {
          runId: 'r-1',
          runCode: 'RUN-E2E-1',
          vehicleId: 'v-1',
          businessDate: '2026-09-08',
          driverId: 'd-1',
          loadedLegs: 1,
          emptyLegs: 1,
          totalKm: 210,
          emptyKm: 105,
          currentLeg: {
            legId: 'l-2',
            sequence: 2,
            kind: 'EMPTY',
            orderCode: null,
            phase: 'IN_TRANSIT',
          },
        },
      ],
    },
    { column: 'ARRIVED', cards: [], total: 0, unavailableReason: null },
    {
      column: 'WAITING',
      cards: [],
      total: 0,
      unavailableReason: 'AWAITING_WAITING_SESSION_SOURCE',
    },
    { column: 'DELIVERED', cards: [], total: 0, unavailableReason: null },
  ],
  fleet: { total: 1, idle: 0, onTrip: 1, underMaintenance: 0, activeDrivers: 1 },
  queue: [
    {
      kind: 'RUN_LEG_MISSING_DISTANCE',
      severity: 'WARNING',
      subject: { kind: 'RUN_LEG', id: 'l-9', reference: 'RUN-E2E-1' },
      detail: {},
    },
  ],
  queueTotal: 1,
  unavailableSources: [],
  pendingWork: [
    { kind: 'RECEIVER_WAITING_ABOVE_THRESHOLD', reason: 'AWAITING_WAITING_SESSION_SOURCE' },
  ],
};

const FINANCE_SUMMARY = {
  generatedFor: '2026-09-08',
  buckets: {
    flows: {
      CUSTOMER_FREIGHT: 11_500_000,
      FUEL_SUPPLIER: 2_000_000,
      CARRIER_SERVICE: 6_000_000,
      PARTNER_COMMISSION: 1_000_000,
    },
    driverReimbursementOutstanding: 0,
    driverSettlementRemaining: 3_000_000,
  },
  directMargin: MARGIN_ROLLUP,
  receivable: { outstandingTotal: 11_500_000, overdueTotal: 11_500_000 },
  currency: { codes: ['VND'], isSingle: true },
  unavailableSources: [],
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
  /**
   * `TX-08` (#242) — be mat "Xe toi co co phan".
   *
   * `403` la cau tra loi THAT cua may chu cho moi nhan vat trong bo mock nay: pham vi ben huu quan
   * den tu mot hang `TransportAssetStakeholder.authUserId`, va khong nhan vat mau nao o day co hang
   * do. Mot vai khong co pham vi van hanh (`MANAGER`) roi vao chinh man nay, nen neu khong khai
   * route, yeu cau se roi ve trang 404 cua Next.js va man hinh se noi "nghiep vu chua duoc bat" —
   * mot cau SAI, va sai theo kieu lam bai test ben duoi do vi mot ly do no khong dinh do.
   */
  await page.route('**/transport/me/vehicles', (route) =>
    json(route, { message: 'Tài khoản này không có quyền xem xe đã yêu cầu' }, 403),
  );
  /*
   * `#278` N9 — duong HOAT DONG cua chinh be mat do. Cung mot `403`, va vi cung mot ly do: khong
   * nhan vat mau nao trong bo mock nay co hang `TransportAssetStakeholder.authUserId`. Khai rieng
   * vi day la mot duong dan SAU HON, khong khop voi mau tren.
   */
  await page.route('**/transport/me/vehicles/activity*', (route) =>
    json(route, { message: 'Tài khoản này không có quyền xem xe đã yêu cầu' }, 403),
  );
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
  // PHONG BI, khong mang tran. May chu that goi `{ due }`, `{ plans }`, `{ workOrders }`,
  // `{ documents }`, `{ alerts, gaps }`, `{ vehicles, conflicts }`. Cac may chu gia o day tung tra
  // ve mang tran, nen bo e2e xanh trong khi hai muc "Bao duong & giay to" va "Luong" TRANG MAN
  // tren ban that (`N.map is not a function`, do o T10 tren `e4fbf95`).
  await page.route('**/transport/maintenance/due', (route) =>
    json(route, { due: MAINTENANCE_DUE }),
  );
  await page.route('**/transport/maintenance/plans', (route) => json(route, { plans: [] }));
  await page.route('**/transport/maintenance/work-orders', (route) =>
    json(route, { workOrders: [] }),
  );
  await page.route('**/transport/compliance/documents', (route) => json(route, { documents: [] }));
  await page.route('**/transport/compliance/alerts', (route) =>
    json(route, { alerts: COMPLIANCE_ALERTS, gaps: [] }),
  );
  await page.route('**/transport/fleet-status', (route) =>
    json(route, { vehicles: [], conflicts: [] }),
  );
  await page.route('**/transport/alerts', (route) => json(route, ALERT_FEED));
  await page.route('**/transport/payroll/periods', (route) => json(route, { periods: [] }));
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

  /*
   * Lane N (#278 N5) — BAO CAO va BAN DO la HAI tuyen, va do la ca diem cua bo mock nay.
   *
   * Tuyen ban do tra `403` cho ke toan y het may chu that (`transport.location.history.read` nam
   * trong `ACCOUNTING_DENIED`). Neu mock tra `200` cho moi vai thi bai kiem ranh gioi quyen ben
   * duoi se XANH ma khong chung minh gi ca.
   */
  await page.route('**/transport/journey/runs/*/map', (route) =>
    role === 'ADMIN'
      ? json(route, JOURNEY_MAP)
      : json(route, { message: 'Tài khoản không được xem lịch sử vị trí' }, 403),
  );
  await page.route('**/transport/journey/runs/*', (route) => json(route, JOURNEY));
  await page.route('**/transport/insight/fleet*', (route) => json(route, FLEET_INSIGHT));
  await page.route('**/transport/insight/corridors*', (route) => json(route, CORRIDOR_INSIGHT));
  /*
   * Hai nguon ma BANG DIEU HANH ghep lai. Chung phai co mat o day chinh vi man do KHONG co lan goi
   * API rieng nao — bo chung ra thi man hinh xuong che do loi, va do la hanh vi DUNG nhung khong
   * phai cai bai kiem ben duoi dang do.
   */
  await page.route('**/transport/control-tower', (route) => json(route, CONTROL_TOWER));
  await page.route('**/transport/finance/summary', (route) => json(route, FINANCE_SUMMARY));
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

    // ETC hien vi goi khach nay CO bat `transport-toll`. Muc nay nam canh Nhien lieu trong cung
    // nhom CHI PHI, nhung KHONG dung chung kieu hay bang nao voi no: phieu dau la tien lai xe ung
    // truoc, con ETC la tien cong ty tra thang cho nha cung cap.
    await expect(nav.getByRole('link', { name: /Phí đường bộ/ })).toBeVisible();

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

  /**
   * KHOI CHI TIET KHONG DUOC NAM O CUOI MOT DANH SACH DAI.
   *
   * Trieu chung nguoi dung bao cao: *"ô chi tiết lại hiện ra ở cuối và tôi phải cuộn mãi xuống
   * cuối để xem"*. Khoi chi tiet duoc ve SAU bang, nen bang cang dai thi no cang xa — voi 45
   * chuyen tren goi khach that thi bam dong dau roi phai cuon qua 44 dong nua.
   *
   * Ban sua: bam mot dong thi ma chuyen di vao O TIM KIEM, nen bang co lai dung mot dong va khoi
   * chi tiet nam ngay duoi no. Bai nay do CHINH dieu do — mot dong khac PHAI bien mat — chu khong
   * do vi tri pixel, vi vi tri pixel doi theo do phan giai con luat nay thi khong.
   */
  test('bam mot dong thi ma chuyen vao o tim kiem va danh sach co lai dung dong do', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips');
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toBeVisible();

    await page.getByRole('rowheader', { name: 'VT-2026-0912' }).click();

    await expect(page.getByLabel('Tìm chuyến')).toHaveValue('VT-2026-0912');
    await expect(page).toHaveURL(/q=VT-2026-0912/);
    // Danh sach da co lai: chuyen khac khong con tren bang, nen khoi chi tiet o ngay duoi dong.
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ })).toBeVisible();

    // Dong lai thi tra lai CA danh sach — o tim kiem khong duoc giu chu do chinh man hinh go vao.
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByLabel('Tìm chuyến')).toHaveValue('');
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toBeVisible();
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

/**
 * CUNG MOT LUAT CHO CAC MAN KHONG CO O TIM KIEM.
 *
 * Man Chuyen xe co o tim kiem nen ma chuyen vao do la du. Cac man con lai khong co, va them mot o
 * tim kiem vao mot bang ba dong thi lam giao dien te di — nen chung co lai bang chinh dong dang
 * chon, kem duong `Xem tất cả` de mo lai.
 */
test.describe('chon mot dong thi bang co lai ve dong do', () => {
  test('ky doi soat: bang con mot dong, noi ro con bao nhieu, va mo lai duoc', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=fuel');

    const dongAnh = page.getByRole('rowheader', { name: 'Cây xăng Đông Anh' });
    const giaLam = page.getByRole('rowheader', { name: 'Cây xăng Gia Lâm' });
    await expect(dongAnh).toBeVisible();
    await expect(giaLam).toBeVisible();

    await dongAnh.click();

    await expect(giaLam).toHaveCount(0);
    // Bang KHONG duoc lang le bot dong: phai noi ro no dang thu hep, va noi bang mot con so.
    await expect(page.getByText('Đang xem 1 / 2 dòng')).toBeVisible();

    await page.getByRole('button', { name: 'Xem tất cả' }).click();
    await expect(giaLam).toBeVisible();
    await expect(dongAnh).toBeVisible();
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

  /**
   * O TAI KHOAN PHAI DONG DUOC — va truoc ban nay thi khong.
   *
   * `AccountMenu` dat `hidden={!isOpen}`, nhung `.tx-account__panel { display: flex }` GHI DE luat
   * `[hidden] { display: none }` cua trinh duyet. Hau qua o 390px: khoi nay la `position: absolute`
   * nen nut `Đăng xuất` ghim de len noi dung ngay tu luc mo trang va khong cach nao cat di. Nguoi
   * dung bao cao dung cau *"dang xuat cua tk lai xe dang bi ghim giua man hinh giao dien dien
   * thoai"*.
   *
   * Bai nay do `Đăng xuất` chu khong do mot lop CSS: mot ban viet lai vo o tai khoan van phai giu
   * dung tinh chat nay.
   */
  test('o tai khoan tren dien thoai DONG cho toi khi bam, va dong lai duoc', async ({ page }) => {
    await mockTransport(page, 'SALE');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/?surface=driver');
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();

    const signOut = page.getByRole('button', { name: 'Đăng xuất' });
    const trigger = page.getByRole('button', { name: /Người dùng SALE/ });

    await expect(signOut).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(signOut).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await trigger.click();
    await expect(signOut).toBeHidden();
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

/**
 * ===========================================================================
 * LANE N (#278 N5/N12) — BAN DO VONG CHAY TREN TRINH DUYET THAT.
 *
 * `#278` N12 doi bang chung o muc TRINH DUYET, khong phai o muc kieu: *"Add browser/build tests
 * that actually load the map/chart bundle; TypeScript-only proof is insufficient."*
 *
 * Ba dieu duoc do o day ma khong bai `.ts` nao do duoc:
 *
 *   1. goi ban do nap duoc that (`dynamic(ssr:false)` + MapLibre + deck.gl khoi tao trong DOM);
 *   2. chang RONG doc ra duoc bang CHU, khong chi bang mau;
 *   3. ranh gioi quyen: ke toan mo dung man hinh do va KHONG thay ban do, nhung van thay bao cao.
 */
test.describe('ban do vong chay (Lane N)', () => {
  test('ban do nap that, va chang RONG doc ra duoc bang chu', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(page.getByRole('heading', { level: 1, name: 'Bản đồ vòng chạy' })).toBeVisible();

    /* Goi ban do NAP THAT: the `img` chi xuat hien sau khi component dong nap da chay. */
    const map = page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' });
    await expect(map).toBeVisible({ timeout: 30_000 });
    /* Nen cuc bo — khong mot lan goi tile nao ra ngoai. */
    await expect(map).toHaveAttribute('data-basemap', 'LOCAL_FALLBACK');

    /*
     * `#278` N13 bai 4 — chang RONG phai phan biet duoc ma KHONG can den mau. Neu mot ngay co
     * nguoi bo chu "RỖNG" di va chi de lai mot lop CSS, bai nay do.
     */
    await expect(page.getByText('RỖNG', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Chặng RỖNG (chạy không hàng)')).toBeVisible();

    /* Tuyen ke hoach chua co nha cung cap dan duong — man hinh NOI RA thay vi ve mot doan thang. */
    await expect(page.getByText(/nhà cung cấp dẫn đường/)).toBeVisible();

    /* Ke hoach vs thuc te: 100 -> 105 la lech +5 km. */
    await expect(page.getByText('+5 km')).toBeVisible();
  });

  test('bieu do km co hang vs km rong nap that', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(
      page.getByRole('img', {
        name: 'Biểu đồ km có hàng và km rỗng theo chặng của vòng chạy RUN-E2E-1',
      }),
    ).toBeVisible({ timeout: 30_000 });
  });

  /*
   * `#278` N13 bai 6/8 tinh than: mot vai khong duoc nhin thay thu ma ma tran vai da tu choi ho.
   * `transport.location.history.read` nam trong `ACCOUNTING_DENIED`, nen ke toan mo dung man hinh
   * nay phai thay BAO CAO ma KHONG thay ban do.
   */
  test('ke toan khong thay ban do, nhung van thay bao cao day du', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(page.getByText(/không được xem lịch sử vị trí/)).toBeVisible();
    await expect(page.getByRole('img', { name: /^Bản đồ vòng chạy/ })).toHaveCount(0);

    /* Bao cao VAN day du: chang, km, ma don. */
    await expect(page.getByText('ORD-E2E-1').first()).toBeVisible();
    await expect(page.getByText('RỖNG', { exact: true }).first()).toBeVisible();
  });

  test('bang doi xe va bao cao tuyen mo duoc, va noi ro cach doc so lieu', async ({ page }) => {
    await mockTransport(page, 'ADMIN');

    await page.goto('/?section=fleet-dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Bảng đội xe' })).toBeVisible();
    /* Cong thuc ty le su dung di CUNG con so — `#278` N7 cam mot ty le khong noi tu so/mau so. */
    await expect(page.getByText(/số NGÀY xe có chặng chưa huỷ/)).toBeVisible();

    await page.goto('/?section=routes');
    await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo tuyến' })).toBeVisible();
    await expect(page.getByText(/gom theo NHÃN địa điểm/)).toBeVisible();
    /* Moi tuyen mo thang sang ban do cua mot vong chay CO THAT. */
    await expect(page.getByRole('link', { name: 'RUN-E2E-1' })).toBeVisible();
  });

  test('bang dieu hanh ghep ba nguon, va khong goi lai mot ma quyen nao moi', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=executive');

    await expect(page.getByRole('heading', { level: 1, name: 'Bảng điều hành' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Vận hành' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Hiệu quả chạy xe' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Việc cần xử lý' })).toBeVisible();
  });

  /* `#278` N12 — 390px la be mat lai xe/dien thoai; ban do phai thap lai chu khong bien mat. */
  test('tren man 390px ban do van ve duoc va trang khong tran ngang', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' })).toBeVisible({
      timeout: 30_000,
    });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/*
 * `#278` N9 — BE MAT BEN HUU QUAN, PHAN HOAT DONG.
 *
 * Hai route duoi day duoc khai SAU `mockTransport`, nen chung DE LEN cap `403` mac dinh cua bo
 * mock: Playwright uu tien route dang ky sau cung. O day nguoi dang xem THAT SU la mot ben huu
 * quan, va do la trang thai duy nhat ma bang hoat dong hien ra.
 */
test.describe('hoat dong cua xe toi co co phan (Lane N)', () => {
  const MY_VEHICLES = [
    {
      vehicleId: 'veh-n9-1',
      registrationPlate: '29H-111.11',
      vehicleClass: 'Dau keo',
      status: 'IDLE',
      operationalControl: 'INTERNAL_OPERATED',
      currentOdoKm: 120000,
      myBasisPoints: 3000,
      myEffectiveFrom: '2026-01-01',
      myHistory: [{ ownershipBasisPoints: 3000, effectiveFrom: '2026-01-01', effectiveTo: null }],
      driverName: 'Nguyen Van A',
    },
  ];

  const ACTIVITY = {
    range: { from: '2026-08-10', to: '2026-09-08', businessDays: 30 },
    utilisationFormula: 'ngayCoChangKhongHuy / ngayLichTrongKhoang',
    vehicles: [
      {
        vehicleId: 'veh-n9-1',
        registrationPlate: '29H-111.11',
        status: 'IDLE',
        runCount: 6,
        activeBusinessDays: 12,
        utilisation: 0.4,
        loadedKm: 1200,
        emptyKm: 300,
        totalKm: 1500,
        emptyRatio: 0.2,
        legsMissingDistance: 0,
        downtime: { workOrderDays: 3, openWorkOrderCount: 1 },
      },
    ],
    unavailableSources: [],
  };

  test('bang hoat dong hien ra kem cong thuc, va bieu do nap that', async ({ page }) => {
    await mockTransport(page, 'MANAGER');
    await page.route('**/transport/me/vehicles', (route) => json(route, MY_VEHICLES));
    await page.route('**/transport/me/vehicles/activity*', (route) => json(route, ACTIVITY));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Xe của tôi chạy thế nào' })).toBeVisible();

    /* Cong thuc di CUNG con so — mot ty le khong kem dinh nghia la mot con so khong kiem duoc. */
    await expect(page.getByText(/ngayCoChangKhongHuy \/ ngayLichTrongKhoang/)).toBeVisible();

    /*
     * Cau canh bao ve cach dem "ngay-lenh". Neu ai do doi ten cot thanh "So ngay xe nghi" ma quen
     * cau nay, bai do — va do dung la luc con so bat dau bi doc sai.
     */
    await expect(page.getByText(/không phải số ngày xe vắng mặt/)).toBeVisible();

    await expect(
      page.getByRole('img', { name: 'Biểu đồ km có hàng và km rỗng của xe tôi có cổ phần' }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('khach chua bat bao duong: o ngay nghi la dau gach VA co cau giai thich', async ({
    page,
  }) => {
    await mockTransport(page, 'MANAGER');
    await page.route('**/transport/me/vehicles', (route) => json(route, MY_VEHICLES));
    await page.route('**/transport/me/vehicles/activity*', (route) =>
      json(route, {
        ...ACTIVITY,
        vehicles: [{ ...ACTIVITY.vehicles[0], downtime: null }],
        unavailableSources: ['MAINTENANCE_CAPABILITY_OFF'],
      }),
    );

    await page.goto('/');

    /*
     * `#278` N13 tinh than: mot o trong phai NOI duoc vi sao no trong. Khong co cau nay, nguoi doc
     * se ket luan xe chay du thang — mot ket luan sai rut ra tu mot dau gach.
     */
    await expect(page.getByText(/phần Bảo dưỡng chưa được bật/)).toBeVisible();
  });
});
