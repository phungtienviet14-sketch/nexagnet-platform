import { randomUUID } from 'node:crypto';
import { TRANSPORT_CURRENCY } from '../money.js';
import {
  INITIAL_FUEL_RECONCILIATION_STATE,
  INITIAL_FUEL_RECONCILIATION_STATUS,
  INITIAL_FUEL_VERIFICATION_STATUS,
  type FuelReconciliationState,
  type FuelReconciliationStatus,
  type FuelVerificationStatus,
} from './fuel-lifecycle.js';
import {
  FuelRepository,
  type AmendFuelEntryInput,
  type ApplyMatchingRunInput,
  type CloseReconciliationInput,
  type ClosedReconciliation,
  type CreateFuelEntryInput,
  type CreateFuelSupplierInput,
  type CreateReconciliationInput,
  type CreateStatementInput,
  type CreatedStatement,
  type MatchingRunResult,
  type ReopenReconciliationInput,
  type ResolveDiscrepancyInput,
  type ResolvedDiscrepancy,
  type SetFuelVerificationInput,
  type SetReconciliationStateInput,
} from './fuel.repository.js';
import type {
  FuelDiscrepancy,
  FuelEntry,
  FuelMatch,
  FuelReceiptEvidence,
  FuelReconciliation,
  FuelSettlementHandoff,
  FuelStatementLine,
  FuelSupplier,
  FuelSupplierStatement,
} from './fuel.types.js';

/**
 * Kho `TX-04` trong BO NHO — cho `PERSISTENCE=memory` va cho bo test cua service.
 *
 * ===========================================================================
 * TEP NAY KHONG CHUNG MINH DIEU GI VE POSTGRES, va do la mot dieu phai noi ra.
 *
 * Mot nua nhung gi T4 hua song o RANH GIOI voi CSDL: giao dich cua mot lan chay so khop, unique hai
 * chieu cua mot cap khop, `CHECK` dau tien/lit, va trigger `INV-26`. Kho nay theo dinh nghia khong
 * co ranh gioi do — no se XANH ca bon du khong cai nao ton tai. Do la bai hoc T2.1 da tra gia mot
 * lan, va la ly do `transport-fuel.int.spec.ts` chay tren Postgres THAT o job `integration`.
 *
 * Cai kho nay CO chung minh: luat nghiep vu o tang service — cong `INV-04`, hai truc trang thai,
 * `GD-10`, va chuoi thao tac cua mot ky doi soat — ma khong bat ai dung mot CSDL len de chay.
 *
 * ===========================================================================
 * `structuredClone` o moi duong DOC, chu khong tra thang tham chieu.
 *
 * Mot bai test sua ban ghi minh vua doc duoc se lam bai test KE TIEP nhin thay du lieu da bi sua —
 * va loi do hien ra nhu mot loi cua service. Kho Prisma khong bao gio tra ve tham chieu song, nen
 * kho trong bo nho cung khong duoc phep.
 */
export class InMemoryFuelRepository extends FuelRepository {
  private readonly suppliers = new Map<string, FuelSupplier>();
  private readonly entries = new Map<string, FuelEntry>();
  private readonly evidence = new Map<string, FuelReceiptEvidence>();
  private readonly statements = new Map<string, FuelSupplierStatement>();
  private readonly lines = new Map<string, FuelStatementLine>();
  private readonly reconciliations = new Map<string, FuelReconciliation>();
  private readonly matches = new Map<string, FuelMatch>();
  private readonly discrepancies = new Map<string, FuelDiscrepancy>();
  private readonly handoffs = new Map<string, FuelSettlementHandoff>();

  /* --------------------------- Cay xang --------------------------- */

  async createSupplier(input: CreateFuelSupplierInput): Promise<FuelSupplier> {
    const supplier: FuelSupplier = {
      id: randomUUID(),
      name: input.name,
      code: input.code,
      phone: input.phone,
      address: input.address,
      taxCode: input.taxCode,
      status: 'ACTIVE',
      createdAt: input.at.toISOString(),
      updatedAt: input.at.toISOString(),
    };
    this.suppliers.set(supplier.id, supplier);
    return clone(supplier);
  }

  async findSupplier(id: string): Promise<FuelSupplier | null> {
    return cloneOrNull(this.suppliers.get(id));
  }

  async listSuppliers(): Promise<FuelSupplier[]> {
    return sortedById([...this.suppliers.values()]);
  }

  /* ---------------------------- Phieu ----------------------------- */

  async createEntry(input: CreateFuelEntryInput): Promise<FuelEntry> {
    const entry: FuelEntry = {
      id: randomUUID(),
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      supplierId: input.supplierId,
      businessDate: input.businessDate,
      occurredAt: input.occurredAt.toISOString(),
      litersUnits: input.litersUnits,
      amount: input.amount,
      currencyCode: TRANSPORT_CURRENCY,
      odometerKm: input.odometerKm,
      previousOdometerKm: input.previousOdometerKm,
      consumptionUnits: input.consumptionUnits,
      reviewReasons: [...input.reviewReasons],
      paymentMethod: input.paymentMethod,
      verificationStatus: INITIAL_FUEL_VERIFICATION_STATUS,
      reconciliationStatus: INITIAL_FUEL_RECONCILIATION_STATUS,
      sourceStatementId: input.sourceStatementId,
      costExpenseId: null,
      correlationKey: input.correlationKey,
      invoiceNo: input.invoiceNo,
      note: input.note,
      declaredBy: input.declaredBy,
      verifiedAt: null,
      verifiedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      reviewNote: null,
      createdAt: input.at.toISOString(),
      updatedAt: input.at.toISOString(),
    };
    this.entries.set(entry.id, entry);
    return clone(entry);
  }

  async findEntry(id: string): Promise<FuelEntry | null> {
    return cloneOrNull(this.entries.get(id));
  }

  async findEntryByCorrelation(correlationKey: string): Promise<FuelEntry | null> {
    return cloneOrNull(
      [...this.entries.values()].find((entry) => entry.correlationKey === correlationKey),
    );
  }

  async listEntriesByTrip(tripId: string): Promise<FuelEntry[]> {
    return sortedById([...this.entries.values()].filter((entry) => entry.tripId === tripId));
  }

  async listEntriesByDriver(driverId: string): Promise<FuelEntry[]> {
    return sortedById([...this.entries.values()].filter((entry) => entry.driverId === driverId));
  }

  async listEntriesForMatching(input: {
    supplierId: string;
    from: string;
    to: string;
  }): Promise<FuelEntry[]> {
    return sortedById(
      [...this.entries.values()].filter(
        (entry) =>
          entry.supplierId === input.supplierId &&
          entry.businessDate >= input.from &&
          entry.businessDate <= input.to,
      ),
    );
  }

  /**
   * Sap xep theo `(businessDate, occurredAt, id)` roi lay ban CUOI CUNG dung truoc moc.
   *
   * `id` la tie-break TAT DINH: hai phieu cung ngay cung gio la chuyen thuong ngay o mot cay xang,
   * va thu tu khong on dinh se lam bai test do tren may nhanh, xanh tren may cham.
   */
  async findPreviousOdometer(input: {
    vehicleId: string;
    businessDate: string;
    occurredAt: Date;
    excludeEntryId?: string;
  }): Promise<number | null> {
    const occurredAt = input.occurredAt.toISOString();
    const earlier = [...this.entries.values()]
      .filter((entry) => entry.vehicleId === input.vehicleId)
      .filter((entry) => entry.id !== input.excludeEntryId)
      .filter(
        (entry) =>
          entry.businessDate < input.businessDate ||
          (entry.businessDate === input.businessDate && entry.occurredAt < occurredAt),
      )
      .sort(compareEntryChronology);

    return earlier.at(-1)?.odometerKm ?? null;
  }

  async amendEntry(id: string, patch: AmendFuelEntryInput): Promise<FuelEntry | null> {
    const current = this.entries.get(id);
    if (!current) return null;
    const updated: FuelEntry = {
      ...current,
      litersUnits: patch.litersUnits,
      amount: patch.amount,
      odometerKm: patch.odometerKm,
      previousOdometerKm: patch.previousOdometerKm,
      consumptionUnits: patch.consumptionUnits,
      reviewReasons: [...patch.reviewReasons],
      businessDate: patch.businessDate,
      occurredAt: patch.occurredAt.toISOString(),
      supplierId: patch.supplierId,
      paymentMethod: patch.paymentMethod,
      invoiceNo: patch.invoiceNo,
      note: patch.note,
      updatedAt: patch.at.toISOString(),
    };
    this.entries.set(id, updated);
    return clone(updated);
  }

  async setEntryVerification(
    id: string,
    from: FuelVerificationStatus,
    input: SetFuelVerificationInput,
  ): Promise<FuelEntry | null> {
    const current = this.entries.get(id);
    if (!current || current.verificationStatus !== from) return null;

    const verified = input.to === 'VERIFIED';
    const rejected = input.to === 'REJECTED';
    const updated: FuelEntry = {
      ...current,
      verificationStatus: input.to,
      // Ba dong nay giu dung bat bien `TransportFuelEntry_review_lifecycle` cua DB: trang thai va
      // dau vet phai di cung nhau, ke ca khi quay ve `DECLARED` (luc do dau vet phai bi xoa).
      verifiedAt: verified ? input.at.toISOString() : null,
      verifiedBy: verified ? input.actor : null,
      rejectedAt: rejected ? input.at.toISOString() : null,
      rejectedBy: rejected ? input.actor : null,
      reviewNote: input.reviewNote,
      updatedAt: input.at.toISOString(),
    };
    this.entries.set(id, updated);
    return clone(updated);
  }

  async attachCostExpense(id: string, expenseId: string): Promise<FuelEntry | null> {
    const current = this.entries.get(id);
    if (!current || current.costExpenseId !== null) return null;
    const updated: FuelEntry = { ...current, costExpenseId: expenseId };
    this.entries.set(id, updated);
    return clone(updated);
  }

  /* -------------------------- Bang chung -------------------------- */

  async addEvidence(input: {
    fuelEntryId: string;
    locator: string;
    contentType: string | null;
    byteSize: number | null;
    capturedAt: Date | null;
    uploadedBy: string;
    at: Date;
  }): Promise<FuelReceiptEvidence> {
    const record: FuelReceiptEvidence = {
      id: randomUUID(),
      fuelEntryId: input.fuelEntryId,
      locator: input.locator,
      contentType: input.contentType,
      byteSize: input.byteSize,
      capturedAt: input.capturedAt?.toISOString() ?? null,
      uploadedBy: input.uploadedBy,
      createdAt: input.at.toISOString(),
    };
    this.evidence.set(record.id, record);
    return clone(record);
  }

  async listEvidence(fuelEntryId: string): Promise<FuelReceiptEvidence[]> {
    return sortedById([...this.evidence.values()].filter((item) => item.fuelEntryId === fuelEntryId));
  }

  /* --------------------------- Bang ke ---------------------------- */

  async createStatement(input: CreateStatementInput): Promise<CreatedStatement> {
    const accepted = input.lines.filter((line) => line.status === 'ACCEPTED').length;
    const statement: FuelSupplierStatement = {
      id: randomUUID(),
      supplierId: input.supplierId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      format: input.format,
      sourceRef: input.sourceRef,
      sourceDigest: input.sourceDigest,
      rowCount: input.lines.length,
      acceptedCount: accepted,
      rejectedCount: input.lines.length - accepted,
      importedAt: input.at.toISOString(),
      importedBy: input.importedBy,
    };
    this.statements.set(statement.id, statement);

    const lines = input.lines.map((line) => {
      const stored: FuelStatementLine = {
        id: randomUUID(),
        statementId: statement.id,
        rowNumber: line.rowNumber,
        status: line.status,
        rejectReason: line.rejectReason,
        vehiclePlateRaw: line.vehiclePlateRaw,
        vehicleId: line.vehicleId,
        businessDate: line.businessDate,
        litersUnits: line.litersUnits,
        amount: line.amount,
        currencyCode: TRANSPORT_CURRENCY,
        invoiceNo: line.invoiceNo,
        note: line.note,
        rawValues: { ...line.rawValues },
        reconciliationStatus: INITIAL_FUEL_RECONCILIATION_STATUS,
        createdAt: input.at.toISOString(),
      };
      this.lines.set(stored.id, stored);
      return clone(stored);
    });

    return { statement: clone(statement), lines };
  }

  async findStatement(id: string): Promise<FuelSupplierStatement | null> {
    return cloneOrNull(this.statements.get(id));
  }

  async findStatementByPeriod(
    supplierId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<FuelSupplierStatement | null> {
    return cloneOrNull(
      [...this.statements.values()].find(
        (statement) =>
          statement.supplierId === supplierId &&
          statement.periodStart === periodStart &&
          statement.periodEnd === periodEnd,
      ),
    );
  }

  async listStatementLines(statementId: string): Promise<FuelStatementLine[]> {
    return [...this.lines.values()]
      .filter((line) => line.statementId === statementId)
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .map(clone);
  }

  /* -------------------------- Doi soat ---------------------------- */

  async createReconciliation(input: CreateReconciliationInput): Promise<FuelReconciliation> {
    const reconciliation: FuelReconciliation = {
      id: randomUUID(),
      supplierId: input.supplierId,
      statementId: input.statementId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      state: INITIAL_FUEL_RECONCILIATION_STATE,
      lastMatchedAt: null,
      closedAt: null,
      closedBy: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
      createdAt: input.at.toISOString(),
      updatedAt: input.at.toISOString(),
    };
    this.reconciliations.set(reconciliation.id, reconciliation);
    return clone(reconciliation);
  }

  async findReconciliation(id: string): Promise<FuelReconciliation | null> {
    return cloneOrNull(this.reconciliations.get(id));
  }

  async findReconciliationByStatement(statementId: string): Promise<FuelReconciliation | null> {
    return cloneOrNull(
      [...this.reconciliations.values()].find((item) => item.statementId === statementId),
    );
  }

  async listReconciliations(): Promise<FuelReconciliation[]> {
    return sortedById([...this.reconciliations.values()]);
  }

  async setReconciliationState(
    id: string,
    from: FuelReconciliationState,
    to: FuelReconciliationState,
    input: SetReconciliationStateInput,
  ): Promise<FuelReconciliation | null> {
    const current = this.reconciliations.get(id);
    if (!current || current.state !== from) return null;
    const updated: FuelReconciliation = {
      ...current,
      state: to,
      lastMatchedAt: input.markMatched ? input.at.toISOString() : current.lastMatchedAt,
      updatedAt: input.at.toISOString(),
    };
    this.reconciliations.set(id, updated);
    return clone(updated);
  }

  async applyMatchingRun(input: ApplyMatchingRunInput): Promise<MatchingRunResult> {
    // Chi xoa cai MAY vua lam. Xem chu thich cua `ApplyMatchingRunInput` — cap `MANUAL` va chenh
    // lech da co nguoi quyet la cong cua nguoi doi soat, khong phai ket qua cua mot lan chay.
    for (const [id, match] of [...this.matches]) {
      if (match.reconciliationId === input.reconciliationId && match.origin === 'AUTO') {
        this.matches.delete(id);
      }
    }
    for (const [id, discrepancy] of [...this.discrepancies]) {
      if (
        discrepancy.reconciliationId === input.reconciliationId &&
        discrepancy.status === 'PENDING'
      ) {
        this.discrepancies.delete(id);
      }
    }

    const matches = input.matches.map((match) => {
      const stored: FuelMatch = {
        id: randomUUID(),
        reconciliationId: input.reconciliationId,
        statementLineId: match.statementLineId,
        fuelEntryId: match.fuelEntryId,
        amountDeltaVnd: match.amountDeltaVnd,
        businessDateDeltaDays: match.businessDateDeltaDays,
        origin: match.origin,
        matchedAt: input.at.toISOString(),
        matchedBy: input.actor,
      };
      this.matches.set(stored.id, stored);
      return clone(stored);
    });

    const discrepancies = input.discrepancies.map((discrepancy) => {
      const stored: FuelDiscrepancy = {
        id: randomUUID(),
        reconciliationId: input.reconciliationId,
        kind: discrepancy.kind,
        status: 'PENDING',
        statementLineId: discrepancy.statementLineId,
        fuelEntryId: discrepancy.fuelEntryId,
        candidateEntryIds: [...discrepancy.candidateEntryIds],
        candidateLineIds: [...discrepancy.candidateLineIds],
        resolution: null,
        resolutionNote: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: input.at.toISOString(),
      };
      this.discrepancies.set(stored.id, stored);
      return clone(stored);
    });

    for (const [lineId, status] of input.lineStatuses) this.setLineStatus(lineId, status);
    for (const [entryId, status] of input.entryStatuses) this.setEntryStatus(entryId, status);

    return { matches, discrepancies };
  }

  async listMatches(reconciliationId: string): Promise<FuelMatch[]> {
    return sortedById(
      [...this.matches.values()].filter((item) => item.reconciliationId === reconciliationId),
    );
  }

  async listDiscrepancies(reconciliationId: string): Promise<FuelDiscrepancy[]> {
    return sortedById(
      [...this.discrepancies.values()].filter((item) => item.reconciliationId === reconciliationId),
    );
  }

  async findDiscrepancy(id: string): Promise<FuelDiscrepancy | null> {
    return cloneOrNull(this.discrepancies.get(id));
  }

  async countPendingDiscrepancies(reconciliationId: string): Promise<number> {
    return [...this.discrepancies.values()].filter(
      (item) => item.reconciliationId === reconciliationId && item.status === 'PENDING',
    ).length;
  }

  async resolveDiscrepancy(input: ResolveDiscrepancyInput): Promise<ResolvedDiscrepancy | null> {
    const current = this.discrepancies.get(input.discrepancyId);
    if (!current || current.status !== 'PENDING') return null;

    const updated: FuelDiscrepancy = {
      ...current,
      status: 'RESOLVED',
      resolution: input.resolution,
      resolutionNote: input.resolutionNote,
      resolvedAt: input.at.toISOString(),
      resolvedBy: input.actor,
    };
    this.discrepancies.set(updated.id, updated);

    let match: FuelMatch | null = null;
    if (input.confirmedMatch) {
      const stored: FuelMatch = {
        id: randomUUID(),
        reconciliationId: current.reconciliationId,
        statementLineId: input.confirmedMatch.statementLineId,
        fuelEntryId: input.confirmedMatch.fuelEntryId,
        amountDeltaVnd: input.confirmedMatch.amountDeltaVnd,
        businessDateDeltaDays: input.confirmedMatch.businessDateDeltaDays,
        origin: 'MANUAL',
        matchedAt: input.at.toISOString(),
        matchedBy: input.actor,
      };
      this.matches.set(stored.id, stored);
      match = clone(stored);
    }

    if (input.lineStatus) this.setLineStatus(input.lineStatus.id, input.lineStatus.status);
    if (input.entryStatus) this.setEntryStatus(input.entryStatus.id, input.entryStatus.status);

    return { discrepancy: clone(updated), match };
  }

  async closeReconciliation(input: CloseReconciliationInput): Promise<ClosedReconciliation | null> {
    const current = this.reconciliations.get(input.reconciliationId);
    if (!current || current.state !== 'RESOLVED') return null;

    const closed: FuelReconciliation = {
      ...current,
      state: 'CLOSED',
      closedAt: input.at.toISOString(),
      closedBy: input.actor,
      updatedAt: input.at.toISOString(),
    };
    this.reconciliations.set(closed.id, closed);

    // `GD-11` — moi chung tu trong ky chuyen `SETTLED` va khoa lai.
    for (const line of [...this.lines.values()]) {
      if (line.statementId !== current.statementId || line.status !== 'ACCEPTED') continue;
      this.setLineStatus(line.id, 'SETTLED');
    }
    for (const match of [...this.matches.values()]) {
      if (match.reconciliationId !== current.id) continue;
      this.setEntryStatus(match.fuelEntryId, 'SETTLED');
    }

    const existing = this.handoffs.get(current.id);
    if (existing) {
      return { reconciliation: clone(closed), handoff: clone(existing), handoffReplayed: true };
    }

    const handoff: FuelSettlementHandoff = {
      id: randomUUID(),
      reconciliationId: current.id,
      supplierId: current.supplierId,
      periodStart: current.periodStart,
      periodEnd: current.periodEnd,
      acceptedAmount: input.acceptedAmount,
      currencyCode: TRANSPORT_CURRENCY,
      acceptedLineCount: input.acceptedLineCount,
      emittedAt: input.at.toISOString(),
      emittedBy: input.actor,
    };
    this.handoffs.set(current.id, handoff);
    return { reconciliation: clone(closed), handoff: clone(handoff), handoffReplayed: false };
  }

  async reopenReconciliation(input: ReopenReconciliationInput): Promise<FuelReconciliation | null> {
    const current = this.reconciliations.get(input.reconciliationId);
    if (!current || current.state !== 'CLOSED') return null;

    const reopened: FuelReconciliation = {
      ...current,
      state: 'REOPENED',
      reopenedAt: input.at.toISOString(),
      reopenedBy: input.actor,
      reopenReason: input.reason,
      updatedAt: input.at.toISOString(),
    };
    this.reconciliations.set(reopened.id, reopened);

    // Go khoa: dong/phieu `SETTLED` quay ve trang thai doc duoc TU SU TON TAI cua mot cap khop.
    // KHONG dua het ve `UNMATCHED` — lam vay se xoa mat ket qua doi soat cua chinh ky vua mo lai.
    const reconciliationMatches = [...this.matches.values()].filter(
      (match) => match.reconciliationId === current.id,
    );
    const matchedEntryIds = new Set(reconciliationMatches.map((match) => match.fuelEntryId));
    const matchedLineIds = new Set(reconciliationMatches.map((match) => match.statementLineId));

    for (const line of [...this.lines.values()]) {
      if (line.statementId !== current.statementId || line.reconciliationStatus !== 'SETTLED') {
        continue;
      }
      this.setLineStatus(line.id, matchedLineIds.has(line.id) ? 'MATCHED' : 'MISMATCHED');
    }
    for (const entry of [...this.entries.values()]) {
      if (entry.reconciliationStatus !== 'SETTLED' || !matchedEntryIds.has(entry.id)) continue;
      this.setEntryStatus(entry.id, 'MATCHED');
    }

    return clone(reopened);
  }

  async findHandoff(reconciliationId: string): Promise<FuelSettlementHandoff | null> {
    return cloneOrNull(this.handoffs.get(reconciliationId));
  }

  /* --------------------------- Noi bo ----------------------------- */

  private setLineStatus(id: string, status: FuelReconciliationStatus): void {
    const current = this.lines.get(id);
    if (!current) return;
    this.lines.set(id, { ...current, reconciliationStatus: status });
  }

  private setEntryStatus(id: string, status: FuelReconciliationStatus): void {
    const current = this.entries.get(id);
    if (!current) return;
    this.entries.set(id, { ...current, reconciliationStatus: status });
  }
}

const clone = <T>(value: T): T => structuredClone(value);
const cloneOrNull = <T>(value: T | undefined): T | null => (value ? clone(value) : null);

const sortedById = <T extends { id: string }>(items: T[]): T[] =>
  items.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)).map(clone);

const compareEntryChronology = (left: FuelEntry, right: FuelEntry): number => {
  if (left.businessDate !== right.businessDate) {
    return left.businessDate < right.businessDate ? -1 : 1;
  }
  if (left.occurredAt !== right.occurredAt) return left.occurredAt < right.occurredAt ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};
