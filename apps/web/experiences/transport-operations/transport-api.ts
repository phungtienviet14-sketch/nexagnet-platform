import { publicApiBase } from '../../lib/api-base';
import { authFetch } from '../../lib/auth';
import type {
  BusinessDate,
  ClosedFundPeriod,
  ClosedReconciliationResult,
  CorrelatedPosting,
  Driver,
  DriverFuelSlipView,
  DriverFundEntry,
  DriverFundPeriod,
  DriverFundStatement,
  DriverTripView,
  ExpenseFundingSource,
  FuelDiscrepancy,
  FuelDiscrepancyResolution,
  FuelEntry,
  FuelEntryDetail,
  FuelPaymentMethod,
  FuelReceiptEvidence,
  FuelReconciliation,
  FuelReconciliationWorkspace,
  FuelStatementFormat,
  FuelSupplier,
  FundPeriodSnapshot,
  ImportedStatement,
  MatchingRunResult,
  PartnerRoleKind,
  StatementImportPreview,
  TransportCustomer,
  TransportPartner,
  Trip,
  TripAssignment,
  TripCostBreakdown,
  TripKind,
  TripStatus,
  Vehicle,
  VehicleDriverAssignment,
  VehicleStatus,
} from './transport-types';

/**
 * Mot cua duy nhat ra `/transport/*`.
 *
 * BA dieu tep nay phai lam dung, vi khong lam thi khong man hinh nao chay dung duoc:
 *
 *   1. `authFetch` — KHONG dung `fetch` tran. Phien la cookie httpOnly (`credentials: 'include'`)
 *      va moi lenh ghi can `x-csrf-token`; `fetch` tran mat ca hai va se ra 401/403 kho hieu.
 *   2. `TransportApiError` — giu lai `status` va than loi. `lib/api.ts` co mot ham `toJson` lam
 *      viec nay nhung KHONG xuat ra, nen o day phai viet lai; nhan luon dip do de giu them
 *      `status`, thu ma ban cua `lib/api.ts` nem di.
 *   3. Doc phong ve — khi tenant khong bat `transport-core`, `/transport/*` KHONG duoc gan, va sau
 *      Caddy duong khong khop se roi ve Next.js tra ve mot trang HTML 404. `JSON.parse` mot trang
 *      HTML se nem `SyntaxError` chang noi len dieu gi; xem `readBody`.
 *
 * KHONG co ma loi may doc duoc tren duong truyen: `transportErrorToHttp` chi chuyen `error.message`
 * vao ngoai le cua Nest va bo `reason` co kieu lai o server. Nen man hinh phai HIEN NGUYEN VAN cau
 * cua may chu, khong duoc doan y roi viet lai loi thanh cau cua minh.
 */
export class TransportApiError extends Error {
  readonly status: number;
  /** `true` khi than loi khong phai JSON — thuong la nghiep vu chua duoc bat cho khach nay. */
  readonly isTransportRouteMissing: boolean;

  constructor(message: string, status: number, isTransportRouteMissing = false) {
    super(message);
    this.name = 'TransportApiError';
    this.status = status;
    this.isTransportRouteMissing = isTransportRouteMissing;
  }
}

const BASE = publicApiBase();

const NOT_MOUNTED_MESSAGE =
  'Máy chủ không có đường nghiệp vụ vận tải cho doanh nghiệp này. Thường là do nghiệp vụ chưa được bật.';

const readBody = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let parsed: unknown;
  let parsedOk = true;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsedOk = false;
  }

  if (!parsedOk) {
    // Than loi khong phai JSON. Voi 404 day gan nhu chac chan la trang HTML cua Next.js — tuc route
    // khong duoc gan, chu khong phai ban ghi khong ton tai. Hai chuyen do doi hai cau tra loi khac
    // nhau tren man hinh, nen phai phan biet o day.
    if (response.status === 404) throw new TransportApiError(NOT_MOUNTED_MESSAGE, 404, true);
    throw new TransportApiError(
      `Máy chủ trả về nội dung không đọc được (HTTP ${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    const body = parsed as { message?: string | readonly string[] } | null;
    const raw = body?.message;
    // Nest tra `message` la chuoi, hoac MOT MANG chuoi khi zod bat nhieu loi cung luc.
    const message = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(', ') : '';
    throw new TransportApiError(
      message.length > 0 ? message : `Yêu cầu thất bại (HTTP ${response.status}).`,
      response.status,
    );
  }

  return parsed as T;
};

const get = async <T>(path: string): Promise<T> => readBody<T>(await authFetch(`${BASE}${path}`));

const send = async <T>(method: 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> =>
  readBody<T>(
    await authFetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

/**
 * Khoa tuong quan cho MOT lan bam nut, tao mot lan roi giu qua cac lan thu lai.
 *
 * Day la co che chan trung DUY NHAT cua API, va dung lai khoa voi noi dung khac la 409 dut khoat
 * (`FUEL_CORRELATION_KEY_REUSED`). Khong co duong "tra ve ban ghi da co" — nen sinh moi khoa cho
 * moi lan bam, va truyen lai DUNG khoa do khi mang loi va nguoi dung bam lai.
 */
export const newCorrelationKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/* ------------------------------------------------------------------ *
 * Than yeu cau
 * ------------------------------------------------------------------ */

export interface PlanTripInput {
  readonly code: string;
  readonly kind: TripKind;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate?: BusinessDate;
  readonly cargoDescription?: string | null;
  readonly customerId?: string | null;
  readonly carrierPartnerId?: string | null;
  readonly referrerPartnerId?: string | null;
  readonly freightAmount?: number | null;
  readonly distanceKm?: number | null;
}

/** `code`, `kind`, `businessDate` KHONG sua duoc sau khi lap chuyen. */
export type UpdateTripInput = Partial<Omit<PlanTripInput, 'code' | 'kind' | 'businessDate'>>;

/** CA HAI khoa deu BAT BUOC co mat (duoc phep `null`). Than thieu khoa la 400. */
export interface AssignTripInput {
  readonly vehicleId: string | null;
  readonly driverId: string | null;
}

export interface CreateVehicleInput {
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly allowedPayloadKg?: number | null;
  readonly currentOdoKm?: number;
  readonly status?: VehicleStatus;
}

/** Bien so KHONG sua duoc — gui kem la 400 vi schema `.strict()`. */
export type UpdateVehicleInput = Partial<Omit<CreateVehicleInput, 'registrationPlate'>>;

export interface CreateDriverInput {
  readonly fullName: string;
  readonly phone: string;
  readonly licenceClass: string;
  readonly licenceExpiry: BusinessDate;
  readonly status?: 'ACTIVE' | 'INACTIVE';
  readonly authUserId?: string | null;
}

export interface CreateCustomerInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly taxCode?: string | null;
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

export interface CreatePartnerInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly roles: readonly PartnerRoleKind[];
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

/** Luon gui DO LON duong; dau do server quyet theo `kind` (`ADVANCE` +1, `RETURN` −1). */
export interface FundMovementInput {
  readonly driverId: string;
  readonly amount: number;
  readonly businessDate?: BusinessDate;
  readonly tripId?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

/** Rieng dieu chinh nhan gia tri CO DAU, va khac 0. */
export interface AdjustFundInput {
  readonly driverId: string;
  readonly signedAmount: number;
  readonly businessDate?: BusinessDate;
  readonly tripId?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

export interface RecordTripExpenseInput {
  readonly tripId: string;
  readonly categoryCode: string;
  readonly amount: number;
  readonly fundedBy: ExpenseFundingSource;
  /** BAT BUOC khi `fundedBy = 'DRIVER_FUND'` — server cong dieu kien nay. */
  readonly driverId?: string | null;
  readonly businessDate?: BusinessDate;
  readonly evidenceLocator?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

export interface OpenFundPeriodInput {
  readonly driverId: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
}

export interface FuelEntryFields {
  readonly supplierId: string;
  /** So la number hoac chuoi thap phan toi 3 chu so — server nhan ca hai. */
  readonly liters: number | string;
  readonly amount: number;
  readonly odometerKm: number;
  /** ISO-8601 va BAT BUOC co offset mui gio. */
  readonly occurredAt: string;
  readonly businessDate?: BusinessDate;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo?: string | null;
  readonly note?: string | null;
}

export interface SubmitFuelEntryInput extends FuelEntryFields {
  readonly tripId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly correlationKey?: string;
}

/** Duong cua LAI XE: khong co `driverId` — danh tinh den tu phien dang nhap. */
export interface DriverFuelSubmitInput extends FuelEntryFields {
  readonly tripId: string;
  readonly vehicleId: string;
  readonly correlationKey?: string;
}

/**
 * Bang chung la mot CHUOI DINH VI, khong phai mot lan tai tep len.
 * `PG-05` chua co, nen API khong nhan `multipart/form-data` o bat cu dau.
 */
export interface AttachFuelEvidenceInput {
  readonly locator: string;
  readonly contentType?: string | null;
  readonly byteSize?: number | null;
  readonly capturedAt?: string | null;
}

export interface ImportStatementInput {
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly filename: string;
  readonly format: FuelStatementFormat;
  /** Tep di trong than JSON dang base64, toi da ~7.000.000 ky tu. */
  readonly contentBase64: string;
}

/**
 * Voi `AMBIGUOUS_CANDIDATES` + `MATCH_CONFIRMED`, PHAI chi ro ca `statementLineId` va `fuelEntryId`
 * lay tu `candidateLineIds`/`candidateEntryIds`, khong thi 400 `FUEL_MATCH_TARGET_REQUIRED`.
 */
export interface ResolveDiscrepancyInput {
  readonly resolution: FuelDiscrepancyResolution;
  readonly note?: string | null;
  readonly statementLineId?: string;
  readonly fuelEntryId?: string;
}

/* ------------------------------------------------------------------ *
 * Be mat van hanh
 * ------------------------------------------------------------------ */

export const transportApi = {
  trips: {
    /** KHONG phan trang, KHONG bo loc, KHONG tim kiem — tra ve toan bo bang. */
    list: (): Promise<readonly Trip[]> => get('/transport/trips'),
    detail: (id: string): Promise<Trip> => get(`/transport/trips/${encodeURIComponent(id)}`),
    /** Tra `200 []` cho id khong ton tai — KHONG dung lam phep thu ton tai. */
    assignments: (id: string): Promise<readonly TripAssignment[]> =>
      get(`/transport/trips/${encodeURIComponent(id)}/assignments`),
    plan: (input: PlanTripInput): Promise<Trip> => send('POST', '/transport/trips', input),
    update: (id: string, input: UpdateTripInput): Promise<Trip> =>
      send('PATCH', `/transport/trips/${encodeURIComponent(id)}`, input),
    assign: (id: string, input: AssignTripInput): Promise<TripAssignment> =>
      send('POST', `/transport/trips/${encodeURIComponent(id)}/assignment`, input),
    /**
     * KHONG truyen `'CANCELLED'` qua duong nay. May trang thai cho phep, nhung `setStatus` khong
     * ghi `cancelledAt`/`cancellationReason`, nen se sinh ra mot chuyen da huy KHONG CO LY DO — va
     * no di duong vong qua quyen `transport.trip.cancel`. Dung `cancel()`.
     */
    transition: (id: string, to: Exclude<TripStatus, 'CANCELLED'>): Promise<Trip> =>
      send('POST', `/transport/trips/${encodeURIComponent(id)}/transition`, { to }),
    cancel: (id: string, reason: string): Promise<Trip> =>
      send('POST', `/transport/trips/${encodeURIComponent(id)}/cancel`, { reason }),
  },

  fleet: {
    vehicles: (): Promise<readonly Vehicle[]> => get('/transport/vehicles'),
    vehicle: (id: string): Promise<Vehicle> => get(`/transport/vehicles/${encodeURIComponent(id)}`),
    createVehicle: (input: CreateVehicleInput): Promise<Vehicle> =>
      send('POST', '/transport/vehicles', input),
    updateVehicle: (id: string, input: UpdateVehicleInput): Promise<Vehicle> =>
      send('PATCH', `/transport/vehicles/${encodeURIComponent(id)}`, input),
    assignVehicleDriver: (id: string, driverId: string): Promise<VehicleDriverAssignment> =>
      send('POST', `/transport/vehicles/${encodeURIComponent(id)}/driver`, { driverId }),
    vehicleDriverHistory: (id: string): Promise<readonly VehicleDriverAssignment[]> =>
      get(`/transport/vehicles/${encodeURIComponent(id)}/driver-history`),

    drivers: (): Promise<readonly Driver[]> => get('/transport/drivers'),
    driver: (id: string): Promise<Driver> => get(`/transport/drivers/${encodeURIComponent(id)}`),
    createDriver: (input: CreateDriverInput): Promise<Driver> =>
      send('POST', '/transport/drivers', input),
    updateDriver: (id: string, input: Partial<CreateDriverInput>): Promise<Driver> =>
      send('PATCH', `/transport/drivers/${encodeURIComponent(id)}`, input),

    customers: (): Promise<readonly TransportCustomer[]> => get('/transport/customers'),
    createCustomer: (input: CreateCustomerInput): Promise<TransportCustomer> =>
      send('POST', '/transport/customers', input),
    updateCustomer: (id: string, input: Partial<CreateCustomerInput>): Promise<TransportCustomer> =>
      send('PATCH', `/transport/customers/${encodeURIComponent(id)}`, input),

    partners: (): Promise<readonly TransportPartner[]> => get('/transport/partners'),
    createPartner: (input: CreatePartnerInput): Promise<TransportPartner> =>
      send('POST', '/transport/partners', input),
    updatePartner: (id: string, input: Partial<CreatePartnerInput>): Promise<TransportPartner> =>
      send('PATCH', `/transport/partners/${encodeURIComponent(id)}`, input),
  },

  costing: {
    /** Tra ve TOAN BO lich su so quy cua mot lai xe — khong co khoang ngay, khong co phan trang. */
    fundStatement: (driverId: string): Promise<DriverFundStatement> =>
      get(`/transport/costing/driver-fund/accounts/${encodeURIComponent(driverId)}`),
    fundPeriods: (driverId: string): Promise<readonly DriverFundPeriod[]> =>
      get(`/transport/costing/driver-fund/accounts/${encodeURIComponent(driverId)}/periods`),
    advance: (input: FundMovementInput): Promise<DriverFundEntry> =>
      send('POST', '/transport/costing/driver-fund/advances', input),
    returnFund: (input: FundMovementInput): Promise<DriverFundEntry> =>
      send('POST', '/transport/costing/driver-fund/returns', input),
    adjust: (input: AdjustFundInput): Promise<DriverFundEntry> =>
      send('POST', '/transport/costing/driver-fund/adjustments', input),
    /** Sua lich su so quy CHI bang mot but toan dao — khong co `UPDATE`, khong co `DELETE`. */
    reverseFundEntry: (id: string, reason: string): Promise<CorrelatedPosting> =>
      send('POST', `/transport/costing/driver-fund/entries/${encodeURIComponent(id)}/reversal`, {
        reason,
      }),
    openPeriod: (input: OpenFundPeriodInput): Promise<DriverFundPeriod> =>
      send('POST', '/transport/costing/driver-fund/periods', input),
    /**
     * Goi lai tren mot ky dang `CLOSING` la DUONG PHUC HOI chinh thuc, khong phai mot lan bam trung.
     * Dong ky la hai lan commit; chet giua hai lan de ky nam o `CLOSING`.
     */
    closePeriod: (id: string): Promise<ClosedFundPeriod> =>
      send('POST', `/transport/costing/driver-fund/periods/${encodeURIComponent(id)}/close`),
    reopenPeriod: (id: string, reason: string): Promise<DriverFundPeriod> =>
      send('POST', `/transport/costing/driver-fund/periods/${encodeURIComponent(id)}/reopen`, {
        reason,
      }),
    periodSnapshots: (id: string): Promise<readonly FundPeriodSnapshot[]> =>
      get(`/transport/costing/driver-fund/periods/${encodeURIComponent(id)}/snapshots`),

    tripExpenses: (tripId: string): Promise<TripCostBreakdown> =>
      get(`/transport/costing/trips/${encodeURIComponent(tripId)}/expenses`),
    recordExpense: (input: RecordTripExpenseInput): Promise<CorrelatedPosting> =>
      send('POST', '/transport/costing/expenses', input),
    /** "Xoa mot khoan chi" tren man hinh phai anh xa vao DAY. Khong co `DELETE`. */
    reverseExpense: (id: string, reason: string): Promise<CorrelatedPosting> =>
      send('POST', `/transport/costing/expenses/${encodeURIComponent(id)}/reversal`, { reason }),
  },

  fuel: {
    suppliers: (): Promise<readonly FuelSupplier[]> => get('/transport/fuel/suppliers'),
    tripEntries: (tripId: string): Promise<readonly FuelEntry[]> =>
      get(`/transport/fuel/trips/${encodeURIComponent(tripId)}/entries`),
    entry: (id: string): Promise<FuelEntryDetail> =>
      get(`/transport/fuel/entries/${encodeURIComponent(id)}`),
    submitEntry: (input: SubmitFuelEntryInput): Promise<FuelEntry> =>
      send('POST', '/transport/fuel/entries', input),
    amendEntry: (id: string, input: FuelEntryFields): Promise<FuelEntry> =>
      send('PATCH', `/transport/fuel/entries/${encodeURIComponent(id)}`, input),
    attachEvidence: (id: string, input: AttachFuelEvidenceInput): Promise<FuelReceiptEvidence> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/evidence`, input),
    verifyEntry: (id: string): Promise<FuelEntry> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/verify`),
    rejectEntry: (id: string, reason: string): Promise<FuelEntry> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/reject`, { reason }),

    /** Xem truoc KHONG ghi gi — an de chay truoc khi nhap that. */
    previewStatement: (input: ImportStatementInput): Promise<StatementImportPreview> =>
      send('POST', '/transport/fuel/statements/preview', input),
    importStatement: (input: ImportStatementInput): Promise<ImportedStatement> =>
      send('POST', '/transport/fuel/statements', input),

    reconciliations: (): Promise<readonly FuelReconciliation[]> =>
      get('/transport/fuel/reconciliations'),
    reconciliation: (id: string): Promise<FuelReconciliationWorkspace> =>
      get(`/transport/fuel/reconciliations/${encodeURIComponent(id)}`),
    /** KHONG tra ve trang thai moi cua ky — phai doc lai workspace sau khi chay. */
    runMatching: (id: string): Promise<MatchingRunResult> =>
      send('POST', `/transport/fuel/reconciliations/${encodeURIComponent(id)}/match`),
    /** Duong nay nam duoi `/discrepancies/`, KHONG long trong ky doi soat. */
    resolveDiscrepancy: (id: string, input: ResolveDiscrepancyInput): Promise<FuelDiscrepancy> =>
      send('POST', `/transport/fuel/discrepancies/${encodeURIComponent(id)}/resolve`, input),
    /** Bi chan khi con `pendingDiscrepancyCount > 0`. */
    closeReconciliation: (id: string): Promise<ClosedReconciliationResult> =>
      send('POST', `/transport/fuel/reconciliations/${encodeURIComponent(id)}/close`),
    reopenReconciliation: (id: string, reason: string): Promise<FuelReconciliation> =>
      send('POST', `/transport/fuel/reconciliations/${encodeURIComponent(id)}/reopen`, { reason }),
  },

  /**
   * Be mat CUA CHINH MINH. Khong mot duong nao o day nhan `:driverId` — danh tinh den tu phien, va
   * do la cach `INV-09` duoc cuong che bang CAU TRUC chu khong bang bo loc.
   */
  me: {
    trips: (): Promise<readonly DriverTripView[]> => get('/transport/me/trips'),
    trip: (id: string): Promise<DriverTripView> =>
      get(`/transport/me/trips/${encodeURIComponent(id)}`),
    /** Lai xe chi dat duoc `IN_TRANSIT` hoac `DELIVERED`. `RECONCILED` doi mot lan chuyen tay khac. */
    setTripStatus: (id: string, to: 'IN_TRANSIT' | 'DELIVERED'): Promise<DriverTripView> =>
      send('PATCH', `/transport/me/trips/${encodeURIComponent(id)}/status`, { to }),
    fund: (): Promise<DriverFundStatement> => get('/transport/me/fund'),
    fuelSlips: (): Promise<readonly DriverFuelSlipView[]> => get('/transport/me/fuel/slips'),
    fuelSlip: (id: string): Promise<DriverFuelSlipView> =>
      get(`/transport/me/fuel/slips/${encodeURIComponent(id)}`),
    submitFuelSlip: (input: DriverFuelSubmitInput): Promise<DriverFuelSlipView> =>
      send('POST', '/transport/me/fuel/slips', input),
    attachFuelEvidence: (id: string, input: AttachFuelEvidenceInput): Promise<DriverFuelSlipView> =>
      send('POST', `/transport/me/fuel/slips/${encodeURIComponent(id)}/evidence`, input),
  },
} as const;
