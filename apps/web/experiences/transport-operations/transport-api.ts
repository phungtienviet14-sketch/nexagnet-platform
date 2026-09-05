import { publicApiBase } from '../../lib/api-base';
import { authFetch } from '../../lib/auth';
import type {
  ApByCounterpartyRow,
  ArAgingReport,
  BusinessDate,
  ClosedFundPeriod,
  ClosedReconciliationResult,
  ComplianceAlert,
  ComplianceDocument,
  ComplianceDocumentStatus,
  ComplianceDocumentType,
  ComplianceSubjectKind,
  CorrelatedPosting,
  DirectMargin,
  DirectMarginRollup,
  Driver,
  DriverPayslipView,
  EffectiveVehicleState,
  ExpenseCatalogue,
  MaintenanceDue,
  MaintenancePlan,
  MaintenancePlanStatus,
  MaintenanceTriggerKind,
  MaintenanceWorkOrder,
  OperationalAlertFeed,
  PartnerPosition,
  PayrollPeriod,
  PayrollRun,
  Payslip,
  PayslipComponentKind,
  PayslipDetail,
  SettlementDocumentChain,
  SettlementFlow,
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

const NOT_MOUNTED_MESSAGE = 'Nghiệp vụ vận tải chưa được bật cho doanh nghiệp này.';

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
      'Không đọc được phản hồi của hệ thống. Hãy thử lại.',
      response.status,
    );
  }

  if (!response.ok) {
    const body = parsed as { message?: string | readonly string[] } | null;
    const raw = body?.message;
    // Nest tra `message` la chuoi, hoac MOT MANG chuoi khi zod bat nhieu loi cung luc.
    const message = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(', ') : '';
    throw new TransportApiError(
      message.length > 0 ? message : 'Không thực hiện được yêu cầu. Hãy thử lại.',
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
 * MULTIPART — cho duong tai anh bang chung (#169).
 *
 * KHONG dat `content-type`: trinh duyet phai tu dat `multipart/form-data; boundary=...`, va mot
 * `content-type` viet tay se thieu boundary, lam may chu doc ra mot than rong. `authFetch` van gan
 * cookie phien + `x-csrf-token` nhu moi lenh ghi khac.
 */
const sendForm = async <T>(path: string, form: FormData): Promise<T> =>
  readBody<T>(await authFetch(`${BASE}${path}`, { method: 'POST', body: form }));

/**
 * DIA CHI ANH de dat vao `<img src>`.
 *
 * Byte di qua mot route CO XAC THUC chu khong phai URL ky (xem #169): kho anh la bucket PRIVATE
 * chua PII, va mot URL ky la mot manh giay uy quyen roi khoi he thong — no con song sau khi phien
 * het han va di duoc vao lich su duyet, log proxy hay mot tin nhan chuyen tiep.
 *
 * Vi vay day tra ve duong dan THUONG; cookie phien di kem theo `credentials` cua chinh the `<img>`
 * khi cung goc. Do la ly do khong co ham `fetch` o day.
 */
export const evidenceUrls = {
  driverFuelSlip: (slipId: string, evidenceId: string): string =>
    `${BASE}/transport/me/fuel/slips/${encodeURIComponent(slipId)}/evidence/${encodeURIComponent(evidenceId)}`,
  fuelEntry: (entryId: string, evidenceId: string): string =>
    `${BASE}/transport/fuel/entries/${encodeURIComponent(entryId)}/evidence/${encodeURIComponent(evidenceId)}`,
  driverExpense: (expenseId: string): string =>
    `${BASE}/transport/me/expenses/${encodeURIComponent(expenseId)}/evidence`,
} as const;

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

/**
 * KHOAN CHI CUA CHINH LAI XE (`#168 B3`).
 *
 * `driverId` va `fundedBy` CO Y vang mat: ca hai la 400 tuong minh o may chu (`.strict()`), khong
 * phai truong bi bo qua im lang. Danh tinh den tu phien, va nguon tien luon la quy cua chinh nguoi
 * dang dang nhap.
 */
export interface DriverSelfExpenseInput {
  readonly tripId: string;
  readonly categoryCode: string;
  /** DO LON, so nguyen DONG. Khong bao gio am — dau do may chu quyet theo loai but toan. */
  readonly amount: number;
  readonly businessDate?: BusinessDate;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

export interface CreateMaintenancePlanInput {
  readonly vehicleId: string;
  readonly name: string;
  readonly triggerKind: MaintenanceTriggerKind;
  readonly intervalKm?: number | null;
  readonly intervalDays?: number | null;
  readonly baselineOdoKm: number;
  readonly baselineDate: BusinessDate;
}

export type UpdateMaintenancePlanInput = Partial<
  Pick<CreateMaintenancePlanInput, 'name' | 'triggerKind' | 'intervalKm' | 'intervalDays'>
> & { readonly status?: MaintenancePlanStatus };

/**
 * `planId` la BAT BUOC CO MAT nhung duoc phep `null` — schema may chu la `nonEmpty.nullable()`,
 * khong phai `.optional()`. Kieu o day phai noi dung dieu do, neu khong mot lan bo quen truong se
 * ra 400 luc chay thay vi do luc bien dich. Cung the voi `subjectId` cua giay to.
 */
export interface OpenWorkOrderInput {
  readonly vehicleId: string;
  readonly planId: string | null;
  readonly description: string;
  readonly openedDate: BusinessDate;
  readonly openedOdoKm: number;
  readonly note?: string | null;
}

export interface CompleteWorkOrderInput {
  readonly completedDate: BusinessDate;
  readonly completedOdoKm: number;
  readonly costAmount?: number | null;
  readonly costingExpenseRef?: string | null;
  readonly note?: string | null;
}

export interface RegisterComplianceDocumentInput {
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly documentType: ComplianceDocumentType;
  readonly documentNo?: string | null;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate;
  readonly evidenceRef?: string | null;
  readonly note?: string | null;
}

export interface OpenPayrollPeriodInput {
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
}

/** Mot khoan cong/tru NHAP TAY cho mot lai xe trong lan chay. Man hinh KHONG tu tinh khoan nao. */
export interface ManualPayrollComponentInput {
  readonly kind: PayslipComponentKind;
  readonly label: string;
  /** DO LON, so nguyen DONG. Dau do `kind` quyet, khong phai dau cua so nay. */
  readonly amount: number;
  readonly note?: string | null;
}

/**
 * CHAY LUONG cho ca ky. KHONG co `driverIds`: may chu chay cho moi lai xe co phat sinh trong ky,
 * va mot bo loc o client se lam hai lan chay cung mot ky cho ra hai bang luong khac nhau.
 */
export interface RunPayrollInput {
  readonly periodId: string;
  /** Khoa la `driverId`. Vang mat = khong co khoan nhap tay nao. */
  readonly manualComponents?: Readonly<Record<string, readonly ManualPayrollComponentInput[]>>;
}

/** Phat mot phieu BU/DAO. Ly do BAT BUOC — mot lan sua tien phai noi duoc vi sao. */
export interface CorrectPayslipInput {
  readonly kind: 'SUPPLEMENTAL' | 'REVERSAL';
  readonly reason: string;
  readonly components?: readonly ManualPayrollComponentInput[];
}

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
    /** `REJECTED -> DECLARED` qua dung vong doi da co (`#168 B5`), be mat VAN HANH. */
    resubmitEntry: (id: string): Promise<FuelEntry> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/resubmit`),

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
    /** TAI ANH THAT (#169). Mot lan goi: byte vao kho roi gan vao phieu, khong de object mo coi. */
    uploadFuelEvidence: (id: string, file: File): Promise<DriverFuelSlipView> => {
      const form = new FormData();
      form.append('file', file);
      return sendForm(`/transport/me/fuel/slips/${encodeURIComponent(id)}/evidence`, form);
    },
    /** `REJECTED -> DECLARED` qua dung vong doi da co (`#168 B5`). */
    resubmitFuelSlip: (id: string): Promise<DriverFuelSlipView> =>
      send('POST', `/transport/me/fuel/slips/${encodeURIComponent(id)}/resubmit`),

    /** `#168 B4` — danh muc de CHON, khong de go thu roi doi may chu bao sai. */
    expenseCategories: (): Promise<ExpenseCatalogue> => get('/transport/me/expense-categories'),
    /** `#168 B3`. Than KHONG nhan `driverId`/`fundedBy` — ca hai la 400 tuong minh. */
    recordExpense: (input: DriverSelfExpenseInput): Promise<CorrelatedPosting> =>
      send('POST', '/transport/me/expenses', input),
    /**
     * `#169` acceptance 4 — khoan chi KEM ANH, MOT lan goi.
     *
     * Khong co duong "gan anh sau": `TripExpense.evidenceLocator` la mot COT duoc dat luc `INSERT`,
     * va so cai append-only khong cho sua mot hang da ghi (`INV-22`).
     */
    recordExpenseWithEvidence: (
      input: DriverSelfExpenseInput,
      file: File,
    ): Promise<CorrelatedPosting> => {
      const form = new FormData();
      form.append('tripId', input.tripId);
      form.append('categoryCode', input.categoryCode);
      form.append('amount', String(input.amount));
      if (input.businessDate) form.append('businessDate', input.businessDate);
      if (input.note) form.append('note', input.note);
      if (input.correlationKey) form.append('correlationKey', input.correlationKey);
      form.append('file', file);
      return sendForm('/transport/me/expenses/with-evidence', form);
    },

    /** `#168 B8` — CHI DOC, chi phieu DA CONG BO. Khong tham so, khong `:driverId`. */
    payslips: (): Promise<readonly DriverPayslipView[]> => get('/transport/me/payslips'),
    payslip: (id: string): Promise<DriverPayslipView> =>
      get(`/transport/me/payslips/${encodeURIComponent(id)}`),
  },

  /**
   * `TX-05` — BAO CAO quyet toan. CHI DOC, khong mot lenh ghi nao (`#168 B1`).
   *
   * `SettlementService` co du lenh ghi tai chinh nhung khong lenh nao duoc phoi ra hay gan quyen.
   * Neu mot ham o day doc len nhu mot lenh ghi, do la mot loi — khong phai mot tinh nang thieu.
   */
  settlement: {
    /** `asOf` BAT BUOC: mot mac dinh im lang lam hai nguoi mo cung man qua nua dem doc hai bang. */
    arAging: (asOf: BusinessDate, customerId?: string | null): Promise<ArAgingReport> => {
      const params = new URLSearchParams({ asOf });
      if (customerId) params.set('customerId', customerId);
      return get(`/transport/settlement/ar-aging?${params.toString()}`);
    },
    /** `flow` BAT BUOC — `GD-15` o tang HTTP: khong co ban "tat ca cac dong". */
    apByFlow: (flow: SettlementFlow): Promise<readonly ApByCounterpartyRow[]> =>
      get(`/transport/settlement/ap?flow=${encodeURIComponent(flow)}`),
    partnerPosition: (partnerId: string): Promise<PartnerPosition> =>
      get(`/transport/settlement/partners/${encodeURIComponent(partnerId)}/position`),
    /** 404 khi chuyen khong co du lieu bien — man hinh phai chiu duoc, khong coi la su co. */
    tripDirectMargin: (tripId: string): Promise<DirectMargin> =>
      get(`/transport/settlement/trips/${encodeURIComponent(tripId)}/direct-margin`),
    /** Tran 200 chuyen/lan o may chu. Man hinh chia lo truoc khi goi. */
    directMarginRollup: (tripIds: readonly string[]): Promise<DirectMarginRollup> =>
      get(
        `/transport/settlement/direct-margin/rollup?tripIds=${encodeURIComponent(tripIds.join(','))}`,
      ),
    documentChain: (originalId: string): Promise<SettlementDocumentChain> =>
      get(`/transport/settlement/documents/${encodeURIComponent(originalId)}/chain`),
  },

  /** `TX-06` — bao duong, giay to, trang thai hieu luc, bang canh bao. */
  assets: {
    plans: (): Promise<readonly MaintenancePlan[]> => get('/transport/maintenance/plans'),
    createPlan: (input: CreateMaintenancePlanInput): Promise<MaintenancePlan> =>
      send('POST', '/transport/maintenance/plans', input),
    updatePlan: (id: string, input: UpdateMaintenancePlanInput): Promise<MaintenancePlan> =>
      send('PATCH', `/transport/maintenance/plans/${encodeURIComponent(id)}`, input),
    /** MAY CHU tinh den han. Man hinh khong duoc tinh lai — xem `#170 §4.B`. */
    due: (): Promise<readonly MaintenanceDue[]> => get('/transport/maintenance/due'),
    workOrders: (): Promise<readonly MaintenanceWorkOrder[]> =>
      get('/transport/maintenance/work-orders'),
    openWorkOrder: (input: OpenWorkOrderInput): Promise<MaintenanceWorkOrder> =>
      send('POST', '/transport/maintenance/work-orders', input),
    completeWorkOrder: (id: string, input: CompleteWorkOrderInput): Promise<MaintenanceWorkOrder> =>
      send('POST', `/transport/maintenance/work-orders/${encodeURIComponent(id)}/complete`, input),
    cancelWorkOrder: (id: string, reason: string): Promise<MaintenanceWorkOrder> =>
      send('POST', `/transport/maintenance/work-orders/${encodeURIComponent(id)}/cancel`, {
        reason,
      }),

    complianceDocuments: (): Promise<readonly ComplianceDocument[]> =>
      get('/transport/compliance/documents'),
    registerComplianceDocument: (
      input: RegisterComplianceDocumentInput,
    ): Promise<ComplianceDocument> => send('POST', '/transport/compliance/documents', input),
    setComplianceDocumentStatus: (
      id: string,
      status: ComplianceDocumentStatus,
    ): Promise<ComplianceDocument> =>
      send('PATCH', `/transport/compliance/documents/${encodeURIComponent(id)}/status`, { status }),
    complianceAlerts: (): Promise<readonly ComplianceAlert[]> =>
      get('/transport/compliance/alerts'),

    fleetStatus: (): Promise<readonly EffectiveVehicleState[]> => get('/transport/fleet-status'),
    /** BANG CANH BAO GOM CHUNG — `unavailableSources` phai duoc hien, khong duoc bo. */
    operationalAlerts: (): Promise<OperationalAlertFeed> => get('/transport/alerts'),
  },

  /** `TX-07` — ky luong va phieu luong. Man hinh KHONG BAO GIO tu tinh mot khoan luong nao. */
  payroll: {
    periods: (): Promise<readonly PayrollPeriod[]> => get('/transport/payroll/periods'),
    openPeriod: (input: OpenPayrollPeriodInput): Promise<PayrollPeriod> =>
      send('POST', '/transport/payroll/periods', input),
    closePeriod: (id: string): Promise<PayrollPeriod> =>
      send('POST', `/transport/payroll/periods/${encodeURIComponent(id)}/close`),
    runs: (periodId: string): Promise<readonly PayrollRun[]> =>
      get(`/transport/payroll/periods/${encodeURIComponent(periodId)}/runs`),
    run: (input: RunPayrollInput): Promise<PayrollRun> =>
      send('POST', '/transport/payroll/runs', input),
    payslipsOfRun: (runId: string): Promise<readonly Payslip[]> =>
      get(`/transport/payroll/runs/${encodeURIComponent(runId)}/payslips`),
    payslip: (id: string): Promise<PayslipDetail> =>
      get(`/transport/payroll/payslips/${encodeURIComponent(id)}`),
    approvePayslip: (id: string): Promise<Payslip> =>
      send('POST', `/transport/payroll/payslips/${encodeURIComponent(id)}/approve`),
    payPayslip: (id: string): Promise<Payslip> =>
      send('POST', `/transport/payroll/payslips/${encodeURIComponent(id)}/pay`),
    /** SUA mot phieu DA CHOT = phat mot phieu bu/dao, KHONG sua so cu (`INV-20`). */
    correctPayslip: (id: string, input: CorrectPayslipInput): Promise<Payslip> =>
      send('POST', `/transport/payroll/payslips/${encodeURIComponent(id)}/corrections`, input),
  },
} as const;
