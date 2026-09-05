import type { AuthRole } from '../../../lib/auth';
import {
  FUEL_DISCREPANCY_KIND_LABEL,
  FUEL_DISCREPANCY_RESOLUTION_LABEL,
  FUEL_PAYMENT_METHOD_LABEL,
  FUEL_RECONCILIATION_STATE_LABEL,
  FUEL_RECONCILIATION_STATUS_LABEL,
  FUEL_VERIFICATION_LABEL,
  formatBusinessDate,
  formatBusinessDateRange,
  formatConsumption,
  formatCount,
  formatInstant,
  formatLiters,
  formatMoney,
  formatOdometer,
  fuelReconciliationStateTone,
  fuelReconciliationStatusTone,
  fuelVerificationTone,
  rejectReasonLabel,
  type StatusTone,
} from '../customer-view';
import { canPerform } from '../transport-actions';
import type {
  FuelDiscrepancy,
  FuelDiscrepancyKind,
  FuelDiscrepancyResolution,
  FuelEntry,
  FuelReconciliation,
  FuelReconciliationStatus,
  FuelReconciliationWorkspace,
  FuelStatementLine,
  FuelSupplier,
  StatementImportPreview,
} from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man Nhien lieu.
 *
 * HAI TRUC DOC LAP, va gop chung tren man hinh la lam mat dung cai gia tri ma chung duoc tach ra de
 * giu (hop dong mien §7.4):
 *
 *   · `verificationStatus`   — *ke toan da tin so lieu tren phieu nay chua?* Tra loi duoc NGAY khi
 *     anh ve.
 *   · `reconciliationStatus` — *phieu nay co tren bang ke cay xang chua?* Chi tra loi duoc CUOI KY.
 *
 * Nen mot phieu co the vua `VERIFIED` vua `UNMATCHED`, va do la trang thai binh thuong chu khong
 * phai mau thuan. Man hinh phai bay HAI phu hieu, khong phai mot.
 */

/* ------------------------------------------------------------------ *
 * Phieu dau
 * ------------------------------------------------------------------ */

export interface FuelEntryRow {
  readonly id: string;
  readonly businessDateLabel: string;
  readonly occurredAtLabel: string;
  readonly supplierLabel: string;
  readonly litersLabel: string;
  readonly amountLabel: string;
  readonly odometerLabel: string;
  readonly consumptionLabel: string;
  readonly paymentLabel: string;
  readonly verificationLabel: string;
  readonly verificationTone: StatusTone;
  readonly reconciliationLabel: string;
  readonly reconciliationTone: StatusTone;
  readonly reviewReasons: readonly string[];
  readonly invoiceNo: string | null;
  readonly canVerify: boolean;
  readonly canReject: boolean;
  readonly canAmend: boolean;
  /** Ly do khong sua duoc — HAI ly do khac nhau, doi hai viec khac nhau cua nguoi dung. */
  readonly amendBlockedReason: string | null;
  /**
   * Phieu bi tu choi NOP LAI duoc — `#168 B5` mo `POST /transport/fuel/entries/:id/resubmit`.
   *
   * Truoc do o day co mot `deadEndNote` noi "Máy chủ chưa mở đường nộp lại". Cau do nay SAI ve
   * nghiep vu, va con vi pham #195 o cho no ke ve may chu thay vi noi viec can lam.
   */
  readonly canResubmit: boolean;
  readonly rejectedNote: string | null;
}

const LOCKED_RECONCILIATION: readonly FuelReconciliationStatus[] = ['SETTLED', 'IGNORED'];

/**
 * Cong sua phieu kiem CA HAI truc va tra ve HAI ma khac nhau co chu dich
 * (`fuel-lifecycle.ts:230-233`): *"nguoi dung o hai tinh huong nay phai lam hai viec KHAC NHAU"*.
 * Nen man hinh cung phai noi hai cau khac nhau, khong duoc gop thanh "khong sua duoc".
 */
const amendBlockedReason = (entry: FuelEntry): string | null => {
  if (entry.verificationStatus !== 'DECLARED') {
    return 'Phiếu đã được xác thực hoặc từ chối nên số liệu không sửa trực tiếp được nữa.';
  }
  if (LOCKED_RECONCILIATION.includes(entry.reconciliationStatus)) {
    return 'Phiếu đã đi vào một kỳ đối soát đã chốt nên không sửa được ở đây.';
  }
  return null;
};

export const toFuelEntryRow = (
  entry: FuelEntry,
  suppliers: ReadonlyMap<string, string>,
  role: AuthRole | null,
): FuelEntryRow => {
  const blocked = amendBlockedReason(entry);
  const mayVerify = canPerform(role, 'transport.fuel.entry.verify');
  return {
    id: entry.id,
    businessDateLabel: formatBusinessDate(entry.businessDate),
    occurredAtLabel: formatInstant(entry.occurredAt),
    supplierLabel: suppliers.get(entry.supplierId) ?? 'Cây xăng chưa đọc được tên',
    litersLabel: formatLiters(entry.litersUnits),
    amountLabel: formatMoney(entry.amount),
    odometerLabel: formatOdometer(entry.odometerKm),
    consumptionLabel: formatConsumption(entry.consumptionUnits),
    paymentLabel: FUEL_PAYMENT_METHOD_LABEL[entry.paymentMethod],
    verificationLabel: FUEL_VERIFICATION_LABEL[entry.verificationStatus],
    verificationTone: fuelVerificationTone(entry.verificationStatus),
    reconciliationLabel: FUEL_RECONCILIATION_STATUS_LABEL[entry.reconciliationStatus],
    reconciliationTone: fuelReconciliationStatusTone(entry.reconciliationStatus),
    reviewReasons: [...entry.reviewReasons],
    invoiceNo: entry.invoiceNo,
    // `verify` goi lai duoc nhieu lan theo thiet ke, nhung chi co nghia khi con `DECLARED`.
    canVerify: mayVerify && entry.verificationStatus === 'DECLARED',
    canReject: mayVerify && entry.verificationStatus === 'DECLARED',
    canAmend: mayVerify && blocked === null,
    amendBlockedReason: blocked,
    canResubmit: mayVerify && entry.verificationStatus === 'REJECTED',
    // Giu NGUYEN VAN ghi chu cua nguoi tu choi khi co: no la thu duy nhat noi ro phai sua cai gi.
    rejectedNote:
      entry.verificationStatus === 'REJECTED'
        ? (entry.reviewNote ?? 'Phiếu bị từ chối. Sửa lại theo ghi chú rồi nộp lại.')
        : null,
  };
};

export const toFuelEntryRows = (
  entries: readonly FuelEntry[],
  suppliers: readonly FuelSupplier[],
  role: AuthRole | null,
): readonly FuelEntryRow[] => {
  const index = new Map(suppliers.map((row) => [row.id, row.name]));
  return entries.map((entry) => toFuelEntryRow(entry, index, role));
};

/* ------------------------------------------------------------------ *
 * Ky doi soat
 * ------------------------------------------------------------------ */

export interface ReconciliationRow {
  readonly id: string;
  readonly supplierLabel: string;
  readonly periodLabel: string;
  readonly stateLabel: string;
  readonly tone: StatusTone;
  readonly closedAtLabel: string | null;
  /**
   * CO Y de `null`: `GET /transport/fuel/reconciliations` tra `FuelReconciliation[]` KHONG kem
   * `pendingDiscrepancyCount`. Bia mot con so o day la noi doi; muon biet phai mo tung ky.
   */
  readonly pendingCount: number | null;
}

export const toReconciliationRows = (
  reconciliations: readonly FuelReconciliation[],
  suppliers: readonly FuelSupplier[],
): readonly ReconciliationRow[] => {
  const index = new Map(suppliers.map((row) => [row.id, row.name]));
  return reconciliations.map((row) => ({
    id: row.id,
    supplierLabel: index.get(row.supplierId) ?? 'Cây xăng chưa đọc được tên',
    periodLabel: formatBusinessDateRange(row.periodStart, row.periodEnd),
    stateLabel: FUEL_RECONCILIATION_STATE_LABEL[row.state],
    tone: fuelReconciliationStateTone(row.state),
    closedAtLabel: row.closedAt === null ? null : formatInstant(row.closedAt),
    pendingCount: null,
  }));
};

export interface StatementLineRow {
  readonly id: string;
  readonly rowNumber: number;
  readonly plateRaw: string;
  readonly businessDateLabel: string;
  readonly litersLabel: string;
  readonly amountLabel: string;
  readonly invoiceNo: string | null;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly rejectLabel: string | null;
  readonly isAccepted: boolean;
}

export const toStatementLineRows = (
  lines: readonly FuelStatementLine[],
): readonly StatementLineRow[] =>
  lines.map((line) => ({
    id: line.id,
    rowNumber: line.rowNumber,
    plateRaw: line.vehiclePlateRaw,
    businessDateLabel: formatBusinessDate(line.businessDate),
    litersLabel: formatLiters(line.litersUnits),
    amountLabel: formatMoney(line.amount),
    invoiceNo: line.invoiceNo,
    statusLabel: FUEL_RECONCILIATION_STATUS_LABEL[line.reconciliationStatus],
    tone: fuelReconciliationStatusTone(line.reconciliationStatus),
    rejectLabel: line.status === 'REJECTED' ? rejectReasonLabel(line.rejectReason) : null,
    isAccepted: line.status === 'ACCEPTED',
  }));

/* ------------------------------------------------------------------ *
 * Chenh lech
 * ------------------------------------------------------------------ */

/**
 * Nhung cach xu ly HOP LY cho tung loai chenh lech.
 *
 * `requiresTargets` la diem de sai nhieu nhat: voi `AMBIGUOUS_CANDIDATES`, chon `MATCH_CONFIRMED`
 * ma khong chi ro CAP nao la 400 `FUEL_MATCH_TARGET_REQUIRED`. Nen o day noi thang cho man hinh
 * biet phai bat nguoi dung chon mot cap truoc khi cho bam.
 */
export interface DiscrepancyResolutionOption {
  readonly resolution: FuelDiscrepancyResolution;
  readonly label: string;
  readonly requiresTargets: boolean;
}

const RESOLUTIONS_BY_KIND: Readonly<
  Record<FuelDiscrepancyKind, readonly FuelDiscrepancyResolution[]>
> = {
  AMBIGUOUS_CANDIDATES: ['MATCH_CONFIRMED', 'IGNORE_WITH_REASON'],
  STATEMENT_LINE_ONLY: ['ACCEPT_SUPPLIER_AMOUNT', 'REJECT_SUPPLIER_LINE', 'IGNORE_WITH_REASON'],
  FUEL_ENTRY_ONLY: ['ENTRY_CORRECTION_REQUIRED', 'IGNORE_WITH_REASON'],
  OUT_OF_TOLERANCE: ['ACCEPT_SUPPLIER_AMOUNT', 'ENTRY_CORRECTION_REQUIRED', 'IGNORE_WITH_REASON'],
  SELF_SOURCED_BLOCKED: ['IGNORE_WITH_REASON', 'REJECT_SUPPLIER_LINE'],
};

export const discrepancyResolutionOptions = (
  kind: FuelDiscrepancyKind,
): readonly DiscrepancyResolutionOption[] =>
  RESOLUTIONS_BY_KIND[kind].map((resolution) => ({
    resolution,
    label: FUEL_DISCREPANCY_RESOLUTION_LABEL[resolution],
    requiresTargets: kind === 'AMBIGUOUS_CANDIDATES' && resolution === 'MATCH_CONFIRMED',
  }));

export interface DiscrepancyRow {
  readonly id: string;
  readonly kind: FuelDiscrepancyKind;
  readonly kindLabel: string;
  readonly isPending: boolean;
  readonly statementLineId: string | null;
  readonly fuelEntryId: string | null;
  readonly candidateEntryIds: readonly string[];
  readonly candidateLineIds: readonly string[];
  readonly resolutionLabel: string | null;
  readonly resolutionNote: string | null;
  readonly resolvedAtLabel: string | null;
  readonly options: readonly DiscrepancyResolutionOption[];
  readonly canResolve: boolean;
}

export const toDiscrepancyRows = (
  discrepancies: readonly FuelDiscrepancy[],
  role: AuthRole | null,
  isFrozen: boolean,
): readonly DiscrepancyRow[] => {
  const mayResolve = canPerform(role, 'transport.fuel.reconciliation.resolve');
  return discrepancies.map((row) => ({
    id: row.id,
    kind: row.kind,
    kindLabel: FUEL_DISCREPANCY_KIND_LABEL[row.kind],
    isPending: row.status === 'PENDING',
    statementLineId: row.statementLineId,
    fuelEntryId: row.fuelEntryId,
    candidateEntryIds: [...row.candidateEntryIds],
    candidateLineIds: [...row.candidateLineIds],
    resolutionLabel:
      row.resolution === null ? null : FUEL_DISCREPANCY_RESOLUTION_LABEL[row.resolution],
    resolutionNote: row.resolutionNote,
    resolvedAtLabel: row.resolvedAt === null ? null : formatInstant(row.resolvedAt),
    options: discrepancyResolutionOptions(row.kind),
    canResolve: mayResolve && row.status === 'PENDING' && !isFrozen,
  }));
};

/* ------------------------------------------------------------------ *
 * Ban lam viec doi soat
 * ------------------------------------------------------------------ */

export interface ReconciliationWorkspaceModel {
  readonly id: string;
  readonly supplierId: string;
  readonly stateLabel: string;
  readonly tone: StatusTone;
  readonly periodLabel: string;
  readonly statementFilename: string;
  readonly lineRows: readonly StatementLineRow[];
  readonly discrepancyRows: readonly DiscrepancyRow[];
  readonly matchedCountLabel: string;
  readonly pendingCountLabel: string;
  readonly isFrozen: boolean;
  readonly canRunMatching: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
  /** Vi sao chua dong duoc — cau noi that, doc tu `pendingDiscrepancyCount`. */
  readonly closeBlockedReason: string | null;
  readonly handoffSummary: string | null;
}

/**
 * `CLOSED` la trang thai DONG BANG duy nhat cua ky doi soat (`isFrozenFuelReconciliation`).
 * Va dong ky bi chan khi con bat ky chenh lech `PENDING` nao — dieu kien doc duoc ngay tu
 * `pendingDiscrepancyCount`, nen man hinh noi truoc thay vi de nguoi dung bam roi nhan 403.
 */
export const toReconciliationWorkspace = (
  workspace: FuelReconciliationWorkspace,
  role: AuthRole | null,
): ReconciliationWorkspaceModel => {
  const isFrozen = workspace.reconciliation.state === 'CLOSED';
  const pending = workspace.pendingDiscrepancyCount;
  return {
    id: workspace.reconciliation.id,
    supplierId: workspace.reconciliation.supplierId,
    stateLabel: FUEL_RECONCILIATION_STATE_LABEL[workspace.reconciliation.state],
    tone: fuelReconciliationStateTone(workspace.reconciliation.state),
    periodLabel: formatBusinessDateRange(
      workspace.reconciliation.periodStart,
      workspace.reconciliation.periodEnd,
    ),
    statementFilename: workspace.statement.filename,
    lineRows: toStatementLineRows(workspace.lines),
    discrepancyRows: toDiscrepancyRows(workspace.discrepancies, role, isFrozen),
    matchedCountLabel: formatCount(workspace.matches.length),
    pendingCountLabel: formatCount(pending),
    isFrozen,
    canRunMatching: canPerform(role, 'transport.fuel.reconciliation.match') && !isFrozen,
    canClose: canPerform(role, 'transport.fuel.reconciliation.close') && !isFrozen && pending === 0,
    canReopen: canPerform(role, 'transport.fuel.reconciliation.reopen') && isFrozen,
    closeBlockedReason:
      pending > 0
        ? `Còn ${formatCount(pending)} chênh lệch chưa có quyết định. Đóng kỳ chỉ được khi mọi chênh lệch đã xử lý.`
        : null,
    handoffSummary:
      workspace.handoff === null
        ? null
        : `Đã bàn giao bản ${formatCount(workspace.handoff.revision)}: ` +
          `${formatCount(workspace.handoff.acceptedLineCount)} dòng, ` +
          `${formatMoney(workspace.handoff.acceptedAmount)}.`,
  };
};

/**
 * Sau khi chay so khop, `POST .../match` KHONG tra ve trang thai moi cua ky — nen man hinh PHAI doc
 * lai ban lam viec. Cau nay de nhac dung mot cho, va de test khoa duoc y do.
 */
export const MATCHING_REQUIRES_REFETCH =
  'Chạy so khớp không trả về trạng thái mới của kỳ, nên bảng được đọc lại sau khi chạy.';

/* ------------------------------------------------------------------ *
 * Xem truoc bang ke
 * ------------------------------------------------------------------ */

export interface StatementPreviewModel {
  readonly headers: readonly string[];
  readonly rowCountLabel: string;
  readonly acceptedCountLabel: string;
  readonly rejectedCountLabel: string;
  readonly rejections: readonly { readonly label: string; readonly countLabel: string }[];
  readonly lines: readonly {
    readonly rowNumber: number;
    readonly plateRaw: string;
    readonly businessDateLabel: string;
    readonly litersLabel: string;
    readonly amountLabel: string;
    readonly rejectLabel: string | null;
  }[];
  readonly isClean: boolean;
}

/** Xem truoc KHONG ghi gi — nen day la buoc an de chay truoc khi nhap that. */
export const toStatementPreview = (preview: StatementImportPreview): StatementPreviewModel => ({
  headers: [...preview.headers],
  rowCountLabel: formatCount(preview.rowCount),
  acceptedCountLabel: formatCount(preview.acceptedCount),
  rejectedCountLabel: formatCount(preview.rejectedCount),
  rejections: Object.entries(preview.rejectionsByReason).map(([reason, count]) => ({
    label: rejectReasonLabel(reason),
    countLabel: formatCount(count),
  })),
  lines: preview.lines.map((line) => ({
    // Dong xem truoc CHUA co `id`, chi co `rowNumber` — do la khoa duy nhat dung duoc o day.
    rowNumber: line.rowNumber,
    plateRaw: line.vehiclePlateRaw,
    businessDateLabel: formatBusinessDate(line.businessDate),
    litersLabel: formatLiters(line.litersUnits),
    amountLabel: formatMoney(line.amount),
    rejectLabel: line.status === 'REJECTED' ? rejectReasonLabel(line.rejectReason) : null,
  })),
  isClean: preview.rejectedCount === 0,
});
