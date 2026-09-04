import type {
  Driver,
  DriverFuelSlipView,
  DriverFundEntry,
  DriverFundPeriod,
  DriverFundStatement,
  DriverTripView,
  FuelDiscrepancy,
  FuelEntry,
  FuelReconciliation,
  FuelReconciliationWorkspace,
  FuelStatementLine,
  FuelSupplierStatement,
  TransportCustomer,
  TransportPartner,
  Trip,
  TripAssignment,
  TripExpense,
  Vehicle,
} from '../../transport-types';

/**
 * Hat giong cho test — CO Y "ban": moi ban ghi mang du truong ky thuat (`id` dang uuid, khoa ngoai
 * khong co ten kem theo) de bo test bat duoc viec man hinh dan `id` len lam nhan, hoac cong hai so
 * khong duoc cong.
 *
 * Ngay nghiep vu deu la `2026-09-*` va TIEN deu la SO NGUYEN DONG.
 */

export const TODAY = '2026-09-04';

export const trip = (over: Partial<Trip> = {}): Trip => ({
  id: '11111111-1111-4111-8111-111111111111',
  code: 'VT-2026-0912',
  kind: 'OWN_DIRECT',
  status: 'PLANNED',
  businessDate: TODAY,
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
  ...over,
});

export const assignment = (over: Partial<TripAssignment> = {}): TripAssignment => ({
  id: 'asg-1',
  tripId: '11111111-1111-4111-8111-111111111111',
  vehicleId: 'veh-1',
  driverId: 'drv-1',
  effectiveFrom: '2026-09-04T02:00:00.000Z',
  effectiveTo: null,
  assignedBy: 'operator',
  createdAt: '2026-09-04T02:00:00.000Z',
  ...over,
});

export const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: 'veh-1',
  registrationPlate: '29H-123.45',
  vehicleClass: 'Xe tải 5 tấn',
  allowedPayloadKg: 5000,
  currentOdoKm: 120_450,
  status: 'IDLE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

export const driver = (over: Partial<Driver> = {}): Driver => ({
  id: 'drv-1',
  fullName: 'Nguyễn Văn Bình',
  phone: '0900000001',
  licenceClass: 'FC',
  licenceExpiry: '2027-06-30',
  status: 'ACTIVE',
  authUserId: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

export const customer = (over: Partial<TransportCustomer> = {}): TransportCustomer => ({
  id: 'cus-1',
  name: 'Công ty Đông Anh',
  phone: null,
  address: null,
  taxCode: null,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

export const partner = (over: Partial<TransportPartner> = {}): TransportPartner => ({
  id: 'par-1',
  name: 'Nhà xe Trường Phát',
  phone: null,
  roles: ['CARRIER'],
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

export const fundEntry = (over: Partial<DriverFundEntry> = {}): DriverFundEntry => ({
  id: 'fe-1',
  accountId: 'acc-1',
  kind: 'ADVANCE',
  signedAmount: 10_000_000,
  currencyCode: 'VND',
  businessDate: TODAY,
  tripId: null,
  correlationKey: 'corr-00000001',
  reversalOfId: null,
  note: null,
  recordedBy: 'accounting',
  createdAt: '2026-09-04T03:00:00.000Z',
  ...over,
});

export const fundStatement = (over: Partial<DriverFundStatement> = {}): DriverFundStatement => ({
  account: {
    id: 'acc-1',
    driverId: 'drv-1',
    currencyCode: 'VND',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-04T03:00:00.000Z',
  },
  driverId: 'drv-1',
  balance: 9_850_000,
  balanceStance: 'DRIVER_HOLDS_COMPANY_CASH',
  currencyCode: 'VND',
  entries: [fundEntry()],
  ...over,
});

export const fundPeriod = (over: Partial<DriverFundPeriod> = {}): DriverFundPeriod => ({
  id: 'fp-1',
  accountId: 'acc-1',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  status: 'OPEN',
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  reopenedBy: null,
  reopenReason: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

export const tripExpense = (over: Partial<TripExpense> = {}): TripExpense => ({
  id: 'te-1',
  tripId: '11111111-1111-4111-8111-111111111111',
  kind: 'EXPENSE',
  categoryCode: 'BOT',
  signedAmount: 150_000,
  currencyCode: 'VND',
  businessDate: TODAY,
  fundedBy: 'DRIVER_FUND',
  driverFundEntryId: 'fe-2',
  driverId: 'drv-1',
  correlationKey: 'corr-00000002',
  reversalOfId: null,
  evidenceLocator: 'media/receipt-1.jpg',
  note: null,
  recordedBy: 'accounting',
  createdAt: '2026-09-04T04:00:00.000Z',
  ...over,
});

export const fuelEntry = (over: Partial<FuelEntry> = {}): FuelEntry => ({
  id: 'fu-1',
  tripId: '11111111-1111-4111-8111-111111111111',
  vehicleId: 'veh-1',
  driverId: 'drv-1',
  supplierId: 'sup-1',
  businessDate: TODAY,
  occurredAt: '2026-09-04T06:30:00.000Z',
  // 200 lit = 200_000 mililit. Day la cho de doc sai gap mot nghin lan.
  litersUnits: 200_000,
  amount: 4_200_000,
  currencyCode: 'VND',
  odometerKm: 120_450,
  previousOdometerKm: 119_950,
  // 40 L/100km = 40_000 mili-L/100km.
  consumptionUnits: 40_000,
  reviewReasons: [],
  paymentMethod: 'DRIVER_CASH',
  verificationStatus: 'DECLARED',
  reconciliationStatus: 'UNMATCHED',
  sourceStatementId: null,
  costExpenseId: null,
  correlationKey: 'corr-00000003',
  invoiceNo: 'HD-001',
  note: null,
  declaredBy: 'drv-1',
  verifiedAt: null,
  verifiedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  reviewNote: null,
  createdAt: '2026-09-04T06:35:00.000Z',
  updatedAt: '2026-09-04T06:35:00.000Z',
  ...over,
});

export const statement = (over: Partial<FuelSupplierStatement> = {}): FuelSupplierStatement => ({
  id: 'st-1',
  supplierId: 'sup-1',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  filename: 'bang-ke-thang-9.csv',
  format: 'CSV',
  sourceDigest: 'sha256:abc',
  importedAt: '2026-10-01T02:00:00.000Z',
  importedBy: 'accounting',
  ...over,
});

export const statementLine = (over: Partial<FuelStatementLine> = {}): FuelStatementLine => ({
  id: 'sl-1',
  statementId: 'st-1',
  rowNumber: 1,
  status: 'ACCEPTED',
  rejectReason: null,
  vehiclePlateRaw: '29H-123.45',
  vehicleId: 'veh-1',
  businessDate: TODAY,
  litersUnits: 200_000,
  amount: 4_200_000,
  currencyCode: 'VND',
  reconciliationStatus: 'UNMATCHED',
  invoiceNo: 'HD-001',
  note: null,
  createdAt: '2026-10-01T02:00:00.000Z',
  ...over,
});

export const discrepancy = (over: Partial<FuelDiscrepancy> = {}): FuelDiscrepancy => ({
  id: 'dc-1',
  reconciliationId: 'rc-1',
  kind: 'OUT_OF_TOLERANCE',
  status: 'PENDING',
  statementLineId: 'sl-1',
  fuelEntryId: 'fu-1',
  candidateEntryIds: [],
  candidateLineIds: [],
  resolution: null,
  resolutionNote: null,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: '2026-10-01T02:05:00.000Z',
  ...over,
});

export const reconciliation = (over: Partial<FuelReconciliation> = {}): FuelReconciliation => ({
  id: 'rc-1',
  supplierId: 'sup-1',
  statementId: 'st-1',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  state: 'MATCHING',
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  reopenedBy: null,
  reopenReason: null,
  createdAt: '2026-10-01T02:00:00.000Z',
  updatedAt: '2026-10-01T02:05:00.000Z',
  ...over,
});

export const workspace = (
  over: Partial<FuelReconciliationWorkspace> = {},
): FuelReconciliationWorkspace => ({
  reconciliation: reconciliation(),
  statement: statement(),
  lines: [statementLine()],
  matches: [],
  discrepancies: [discrepancy()],
  pendingDiscrepancyCount: 1,
  handoff: null,
  ...over,
});

/** Khung nhin cua lai xe — KHONG co truong doanh thu, va do la diem cua bo test. */
export const driverTrip = (over: Partial<DriverTripView> = {}): DriverTripView => ({
  id: '11111111-1111-4111-8111-111111111111',
  code: 'VT-2026-0912',
  kind: 'OWN_DIRECT',
  status: 'PLANNED',
  businessDate: TODAY,
  originLabel: 'Hà Nội',
  destinationLabel: 'Thái Nguyên',
  cargoDescription: 'Hàng gia dụng',
  distanceKm: 78,
  customerName: 'Công ty Đông Anh',
  vehicleRegistrationPlate: '29H-123.45',
  assignedAt: '2026-09-04T02:00:00.000Z',
  isCurrentAssignee: true,
  ...over,
});

export const driverFuelSlip = (over: Partial<DriverFuelSlipView> = {}): DriverFuelSlipView => ({
  id: 'fu-1',
  tripId: '11111111-1111-4111-8111-111111111111',
  vehicleId: 'veh-1',
  supplierId: 'sup-1',
  businessDate: TODAY,
  occurredAt: '2026-09-04T06:30:00.000Z',
  litersUnits: 200_000,
  amount: 4_200_000,
  currencyCode: 'VND',
  odometerKm: 120_450,
  previousOdometerKm: 119_950,
  consumptionUnits: 40_000,
  reviewReasons: [],
  paymentMethod: 'DRIVER_CASH',
  verificationStatus: 'DECLARED',
  reconciliationStatus: 'UNMATCHED',
  invoiceNo: 'HD-001',
  note: null,
  reviewNote: null,
  evidenceCount: 1,
  createdAt: '2026-09-04T06:35:00.000Z',
  ...over,
});
