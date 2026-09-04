import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { TRANSPORT_CURRENCY, fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  isFrozenFuelReconciliation,
  planFuelReconciliationPath,
  type FuelReconciliationState,
  type FuelReconciliationStatus,
  type FuelVerificationStatus,
} from './fuel-lifecycle.js';
import { settlementResultFingerprint, sumAcceptedSettlement } from './fuel-settlement.js';
import {
  consumptionFromStored,
  formatConsumption,
  formatLiters,
  litersFromStored,
} from './fuel-quantity.js';
import {
  FUEL_ENTRY_CORRELATION,
  FUEL_MATCH_ENTRY_ONCE,
  FUEL_MATCH_LINE_ONCE,
  FUEL_STATEMENT_PERIOD,
  isSelfSourcedMatchViolation,
} from './fuel-storage-conflict.js';
import {
  FuelRepository,
  type AmendFuelEntryGuard,
  type AmendFuelEntryInput,
  type ApplyMatchingRunInput,
  type ApplyMatchingRunOutcome,
  type CloseReconciliationInput,
  type CloseReconciliationOutcome,
  type CreateFuelEntryInput,
  type CreateFuelSupplierInput,
  type CreateStatementInput,
  type CreatedStatement,
  type ReopenReconciliationInput,
  type ResolveDiscrepancyInput,
  type ResolveDiscrepancyOutcome,
  type SetFuelVerificationInput,
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

/*
 * Xem chu thich cung ten trong `prisma-costing.repository.ts`: ranh gioi kieu that su nam o cac ham
 * `to*` co kieu ben duoi, khong o delegate cua Prisma. Tang nay CO Y khong phu thuoc vao ban sinh
 * cua client — mot ban sinh doi hinh dang khong duoc lam tep nay ngung bien dich.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value ? iso(value) : null);
const amount = (stored: bigint): number => fromStoredAmount(stored) ?? 0;

/* eslint-disable @typescript-eslint/no-explicit-any */
const toSupplier = (row: any): FuelSupplier => ({
  id: row.id,
  name: row.name,
  code: row.code,
  phone: row.phone,
  address: row.address,
  taxCode: row.taxCode,
  status: row.status,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toEntry = (row: any): FuelEntry => ({
  id: row.id,
  tripId: row.tripId,
  vehicleId: row.vehicleId,
  driverId: row.driverId,
  supplierId: row.supplierId,
  businessDate: row.businessDate,
  occurredAt: iso(row.occurredAt),
  litersUnits: litersFromStored(row.liters) ?? 0,
  amount: amount(row.amount),
  currencyCode: row.currencyCode,
  odometerKm: row.odometerKm,
  previousOdometerKm: row.previousOdometerKm,
  consumptionUnits: consumptionFromStored(row.consumptionL100km),
  reviewReasons: row.reviewReasons,
  paymentMethod: row.paymentMethod,
  verificationStatus: row.verificationStatus,
  reconciliationStatus: row.reconciliationStatus,
  sourceStatementId: row.sourceStatementId,
  costExpenseId: row.costExpenseId,
  correlationKey: row.correlationKey,
  invoiceNo: row.invoiceNo,
  note: row.note,
  declaredBy: row.declaredBy,
  verifiedAt: isoOrNull(row.verifiedAt),
  verifiedBy: row.verifiedBy,
  rejectedAt: isoOrNull(row.rejectedAt),
  rejectedBy: row.rejectedBy,
  reviewNote: row.reviewNote,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toEvidence = (row: any): FuelReceiptEvidence => ({
  id: row.id,
  fuelEntryId: row.fuelEntryId,
  locator: row.locator,
  contentType: row.contentType,
  byteSize: row.byteSize,
  capturedAt: isoOrNull(row.capturedAt),
  uploadedBy: row.uploadedBy,
  createdAt: iso(row.createdAt),
});

const toStatement = (row: any): FuelSupplierStatement => ({
  id: row.id,
  supplierId: row.supplierId,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  format: row.format,
  sourceRef: row.sourceRef,
  sourceDigest: row.sourceDigest,
  rowCount: row.rowCount,
  acceptedCount: row.acceptedCount,
  rejectedCount: row.rejectedCount,
  importedAt: iso(row.importedAt),
  importedBy: row.importedBy,
});

const toLine = (row: any): FuelStatementLine => ({
  id: row.id,
  statementId: row.statementId,
  rowNumber: row.rowNumber,
  status: row.status,
  rejectReason: row.rejectReason,
  vehiclePlateRaw: row.vehiclePlateRaw,
  vehicleId: row.vehicleId,
  businessDate: row.businessDate,
  litersUnits: litersFromStored(row.liters),
  amount: row.amount === null ? null : amount(row.amount),
  currencyCode: row.currencyCode,
  invoiceNo: row.invoiceNo,
  note: row.note,
  rawValues: row.rawValues as Record<string, string>,
  reconciliationStatus: row.reconciliationStatus,
  createdAt: iso(row.createdAt),
});

const toReconciliation = (row: any): FuelReconciliation => ({
  id: row.id,
  supplierId: row.supplierId,
  statementId: row.statementId,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  state: row.state,
  lastMatchedAt: isoOrNull(row.lastMatchedAt),
  closedAt: isoOrNull(row.closedAt),
  closedBy: row.closedBy,
  reopenedAt: isoOrNull(row.reopenedAt),
  reopenedBy: row.reopenedBy,
  reopenReason: row.reopenReason,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toMatch = (row: any): FuelMatch => ({
  id: row.id,
  reconciliationId: row.reconciliationId,
  statementLineId: row.statementLineId,
  fuelEntryId: row.fuelEntryId,
  amountDeltaVnd: amount(row.amountDeltaVnd),
  businessDateDeltaDays: row.businessDateDeltaDays,
  origin: row.origin,
  matchedAt: iso(row.matchedAt),
  matchedBy: row.matchedBy,
});

const toDiscrepancy = (row: any): FuelDiscrepancy => ({
  id: row.id,
  reconciliationId: row.reconciliationId,
  kind: row.kind,
  status: row.status,
  statementLineId: row.statementLineId,
  fuelEntryId: row.fuelEntryId,
  candidateEntryIds: row.candidateEntryIds,
  candidateLineIds: row.candidateLineIds,
  resolution: row.resolution,
  resolutionNote: row.resolutionNote,
  resolvedAt: isoOrNull(row.resolvedAt),
  resolvedBy: row.resolvedBy,
  createdAt: iso(row.createdAt),
});

const toHandoff = (row: any): FuelSettlementHandoff => ({
  id: row.id,
  reconciliationId: row.reconciliationId,
  revision: row.revision,
  supersedesId: row.supersedesId,
  acceptedLineIds: row.acceptedLineIds,
  supplierId: row.supplierId,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  acceptedAmount: amount(row.acceptedAmount),
  currencyCode: row.currencyCode,
  acceptedLineCount: row.acceptedLineCount,
  emittedAt: iso(row.emittedAt),
  emittedBy: row.emittedBy,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Dau van tay cua mot ban giao DA PHAT — de so voi ket qua vua tinh (T4R §2). */
const handoffFingerprint = (handoff: FuelSettlementHandoff): string =>
  settlementResultFingerprint({
    amount: handoff.acceptedAmount,
    lineCount: handoff.acceptedLineCount,
    lineIds: handoff.acceptedLineIds,
  });

/**
 * Kho `TX-04` tren PostgreSQL.
 *
 * ===========================================================================
 * BON THAO TAC O DAY LA NGUYEN TU, va moi cai vi mot ly do da tra gia o T3R (Issue #94):
 *
 *   `createStatement`      dau bang ke + moi dong — mot dau bang ke khong dong nao la mot ky khong
 *                          lam gi duoc, va lan nhap lai bi unique `(cay xang, ky)` chan;
 *   `applyMatchingRun`     xoa ket qua tu dong cu + ghi ket qua moi + doi trang thai — nua chung
 *                          la mot bang doi soat mau thuan voi chinh no;
 *   `resolveDiscrepancy`   quyet dinh + cap khop tay + trang thai hai ve;
 *   `closeReconciliation`  dong ky + khoa chung tu + phat ban giao T5 — nua chung la mot ban giao
 *                          da phat cho mot ky chua dong, hoac mot ky dong ma chung tu chua khoa.
 *
 * MOI thao tac doi trang thai deu doi `from`: `updateMany` co dieu kien roi doc lai, chu khong
 * `update` theo `id`. Do la cong chong HAI NGUOI cung bam, va Prisma khong cho `update` theo mot
 * dieu kien khong-unique — nen hinh dang nay la co y, khong phai mot cach viet vong.
 */
@Injectable()
export class PrismaFuelRepository extends FuelRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /* --------------------------- Cay xang --------------------------- */

  async createSupplier(input: CreateFuelSupplierInput): Promise<FuelSupplier> {
    return toSupplier(
      await model(this.prisma, 'transportFuelSupplier').create({
        data: {
          name: input.name,
          code: input.code,
          phone: input.phone,
          address: input.address,
          taxCode: input.taxCode,
          createdAt: input.at,
          updatedAt: input.at,
        },
      }),
    );
  }

  async findSupplier(id: string): Promise<FuelSupplier | null> {
    const row = await model(this.prisma, 'transportFuelSupplier').findUnique({ where: { id } });
    return row ? toSupplier(row) : null;
  }

  async listSuppliers(): Promise<FuelSupplier[]> {
    const rows = await model(this.prisma, 'transportFuelSupplier').findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toSupplier);
  }

  /* ---------------------------- Phieu ----------------------------- */

  async createEntry(input: CreateFuelEntryInput): Promise<FuelEntry> {
    try {
      return toEntry(
        await model(this.prisma, 'transportFuelEntry').create({
          data: {
            tripId: input.tripId,
            vehicleId: input.vehicleId,
            driverId: input.driverId,
            supplierId: input.supplierId,
            businessDate: input.businessDate,
            occurredAt: input.occurredAt,
            liters: formatLiters(input.litersUnits),
            amount: toStoredAmount(input.amount),
            currencyCode: TRANSPORT_CURRENCY,
            odometerKm: input.odometerKm,
            previousOdometerKm: input.previousOdometerKm,
            consumptionL100km:
              input.consumptionUnits === null ? null : formatConsumption(input.consumptionUnits),
            reviewReasons: input.reviewReasons,
            paymentMethod: input.paymentMethod,
            sourceStatementId: input.sourceStatementId,
            correlationKey: input.correlationKey,
            invoiceNo: input.invoiceNo,
            note: input.note,
            declaredBy: input.declaredBy,
            createdAt: input.at,
            updatedAt: input.at,
          },
        }),
      );
    } catch (error) {
      if (isUniqueViolationOn(error, FUEL_ENTRY_CORRELATION)) {
        throw TransportDomainError.conflict(
          'FUEL_CORRELATION_KEY_REUSED',
          `Khoa chong ghi trung ${input.correlationKey} vua duoc dung boi mot lan ghi khac`,
        );
      }
      throw error;
    }
  }

  async findEntry(id: string): Promise<FuelEntry | null> {
    const row = await model(this.prisma, 'transportFuelEntry').findUnique({ where: { id } });
    return row ? toEntry(row) : null;
  }

  async findEntryByCorrelation(correlationKey: string): Promise<FuelEntry | null> {
    const row = await model(this.prisma, 'transportFuelEntry').findUnique({
      where: { correlationKey },
    });
    return row ? toEntry(row) : null;
  }

  async listEntriesByTrip(tripId: string): Promise<FuelEntry[]> {
    const rows = await model(this.prisma, 'transportFuelEntry').findMany({
      where: { tripId },
      orderBy: [{ businessDate: 'asc' }, { occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toEntry);
  }

  async listEntriesByDriver(driverId: string): Promise<FuelEntry[]> {
    const rows = await model(this.prisma, 'transportFuelEntry').findMany({
      where: { driverId },
      orderBy: [{ businessDate: 'desc' }, { occurredAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toEntry);
  }

  async listEntriesNeedingReview(): Promise<FuelEntry[]> {
    const rows = await model(this.prisma, 'transportFuelEntry').findMany({
      where: { NOT: { reviewReasons: { isEmpty: true } } },
      orderBy: [{ businessDate: 'desc' }, { occurredAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toEntry);
  }
  async listEntriesForMatching(input: {
    supplierId: string;
    from: string;
    to: string;
  }): Promise<FuelEntry[]> {
    const rows = await model(this.prisma, 'transportFuelEntry').findMany({
      where: {
        supplierId: input.supplierId,
        businessDate: { gte: input.from, lte: input.to },
      },
      orderBy: [{ businessDate: 'asc' }, { occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toEntry);
  }

  /**
   * Odo cua lan do dau GAN NHAT TRUOC moc — mau so cua `INV-06`.
   *
   * `OR` hai nhanh chu khong mot phep so sanh ghep: Postgres khong so sanh duoc mot cap
   * `(chuoi, thoi diem)` bang mot toan tu, va viet `businessDate <= X AND occurredAt < Y` se BO SOT
   * moi phieu cua nhung ngay TRUOC do co gio muon hon — tuc mot lan do dau 22h ngay 30 se khong
   * duoc thay boi mot lan do dau 06h ngay 31.
   */
  async findPreviousOdometer(input: {
    vehicleId: string;
    businessDate: string;
    occurredAt: Date;
    excludeEntryId?: string;
  }): Promise<number | null> {
    const row = await model(this.prisma, 'transportFuelEntry').findFirst({
      where: {
        vehicleId: input.vehicleId,
        ...(input.excludeEntryId ? { id: { not: input.excludeEntryId } } : {}),
        OR: [
          { businessDate: { lt: input.businessDate } },
          { businessDate: input.businessDate, occurredAt: { lt: input.occurredAt } },
        ],
      },
      orderBy: [{ businessDate: 'desc' }, { occurredAt: 'desc' }, { id: 'desc' }],
    });
    return row ? row.odometerKm : null;
  }

  /**
   * SUA mot phieu — DIEU KIEN NAM TRONG `WHERE`, khong o mot lan doc truoc do (T4R §4).
   *
   * Doc chu thich cua `AmendFuelEntryGuard`: mot lan doc "dang `DECLARED`" roi mot lan ghi
   * `WHERE id` la mot cua so ma mot lenh duyet chen vao duoc, va ket cuc la mot phieu `VERIFIED`
   * lech voi khoan chi da nam trong gia thanh chuyen. `updateMany` voi du dieu kien dong cua so do
   * lai: Postgres kiem chinh cac cot ay tai thoi diem ghi, tren hang da khoa.
   */
  async amendEntry(
    id: string,
    guard: AmendFuelEntryGuard,
    patch: AmendFuelEntryInput,
  ): Promise<FuelEntry | null> {
    const updated = await model(this.prisma, 'transportFuelEntry').updateMany({
      where: {
        id,
        verificationStatus: guard.verification,
        reconciliationStatus: { notIn: [...guard.lockedReconciliation] },
      },
      data: {
        liters: formatLiters(patch.litersUnits),
        amount: toStoredAmount(patch.amount),
        odometerKm: patch.odometerKm,
        previousOdometerKm: patch.previousOdometerKm,
        consumptionL100km:
          patch.consumptionUnits === null ? null : formatConsumption(patch.consumptionUnits),
        reviewReasons: patch.reviewReasons,
        businessDate: patch.businessDate,
        occurredAt: patch.occurredAt,
        supplierId: patch.supplierId,
        paymentMethod: patch.paymentMethod,
        invoiceNo: patch.invoiceNo,
        note: patch.note,
        updatedAt: patch.at,
      },
    });
    return updated.count === 0 ? null : this.findEntry(id);
  }

  async setEntryVerification(
    id: string,
    from: FuelVerificationStatus,
    input: SetFuelVerificationInput,
  ): Promise<FuelEntry | null> {
    const verified = input.to === 'VERIFIED';
    const rejected = input.to === 'REJECTED';
    const updated = await model(this.prisma, 'transportFuelEntry').updateMany({
      where: { id, verificationStatus: from },
      data: {
        verificationStatus: input.to,
        // Ba cap cot nay giu dung `CHECK TransportFuelEntry_review_lifecycle`: trang thai va dau vet
        // di cung nhau, va quay ve `DECLARED` thi dau vet phai bi xoa.
        verifiedAt: verified ? input.at : null,
        verifiedBy: verified ? input.actor : null,
        rejectedAt: rejected ? input.at : null,
        rejectedBy: rejected ? input.actor : null,
        reviewNote: input.reviewNote,
        updatedAt: input.at,
      },
    });
    return updated.count === 0 ? null : this.findEntry(id);
  }

  async attachCostExpense(id: string, expenseId: string): Promise<FuelEntry | null> {
    const updated = await model(this.prisma, 'transportFuelEntry').updateMany({
      where: { id, costExpenseId: null },
      data: { costExpenseId: expenseId },
    });
    return updated.count === 0 ? null : this.findEntry(id);
  }

  /* -------------------------- Bang chung -------------------------- */

  /**
   * GAN BANG CHUNG — kiem trang thai TREN HANG DA KHOA, trong chinh giao dich ghi (T4R §4).
   *
   * `create` cua mot bang con khong co cho de dat dieu kien, nen dieu kien phai duoc dat bang mot
   * khoa: `SELECT ... FOR UPDATE` tren hang phieu. Lenh dong ky cung ghi vao hang do
   * (`reconciliationStatus -> SETTLED`), nen hai ben xep hang voi nhau va chi mot ben thay du lieu
   * cu.
   *
   * `null` = phieu dang o mot trang thai bi cam, HOAC phieu khong con. Tang mien da doc phieu ngay
   * truoc do nen o duong goi that, `null` chi co mot nghia: co nguoi vua dong ky.
   */
  async addEvidence(input: {
    fuelEntryId: string;
    locator: string;
    contentType: string | null;
    byteSize: number | null;
    capturedAt: Date | null;
    uploadedBy: string;
    at: Date;
    forbiddenReconciliationStatuses: readonly FuelReconciliationStatus[];
  }): Promise<FuelReceiptEvidence | null> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;
      await scoped.$executeRaw`SELECT "id" FROM "TransportFuelEntry" WHERE "id" = ${input.fuelEntryId} FOR UPDATE`;

      const entry = await model(scoped, 'transportFuelEntry').findUnique({
        where: { id: input.fuelEntryId },
        select: { reconciliationStatus: true },
      });
      if (!entry) return null;
      if (input.forbiddenReconciliationStatuses.includes(entry.reconciliationStatus)) return null;

      return toEvidence(
        await model(scoped, 'transportFuelReceiptEvidence').create({
          data: {
            fuelEntryId: input.fuelEntryId,
            locator: input.locator,
            contentType: input.contentType,
            byteSize: input.byteSize,
            capturedAt: input.capturedAt,
            uploadedBy: input.uploadedBy,
            createdAt: input.at,
          },
        }),
      );
    });
  }

  async listEvidence(fuelEntryId: string): Promise<FuelReceiptEvidence[]> {
    const rows = await model(this.prisma, 'transportFuelReceiptEvidence').findMany({
      where: { fuelEntryId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toEvidence);
  }

  /* --------------------------- Bang ke ---------------------------- */

  /**
   * BANG KE + CAC DONG + KY DOI SOAT — MOT giao dich (T4R §3).
   *
   * Ky doi soat duoc tao o BUOC CUOI CUNG cua chinh giao dich nay, khong phai o mot lan ghi thu hai
   * sau do. Xem chu thich cua `CreatedStatement`: mot lan hong giua hai lan ghi de lai mot bang ke
   * khong so khop duoc, khong dong duoc, va khong nhap lai duoc.
   */
  async createStatementWithReconciliation(input: CreateStatementInput): Promise<CreatedStatement> {
    const accepted = input.lines.filter((line) => line.status === 'ACCEPTED').length;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scoped = tx as unknown as PrismaService;
        const statement = toStatement(
          await model(scoped, 'transportFuelSupplierStatement').create({
            data: {
              supplierId: input.supplierId,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              format: input.format,
              sourceRef: input.sourceRef,
              sourceDigest: input.sourceDigest,
              rowCount: input.lines.length,
              acceptedCount: accepted,
              rejectedCount: input.lines.length - accepted,
              importedAt: input.at,
              importedBy: input.importedBy,
            },
          }),
        );

        await model(scoped, 'transportFuelStatementLine').createMany({
          data: input.lines.map((line) => ({
            statementId: statement.id,
            rowNumber: line.rowNumber,
            status: line.status,
            rejectReason: line.rejectReason,
            vehiclePlateRaw: line.vehiclePlateRaw,
            vehicleId: line.vehicleId,
            businessDate: line.businessDate,
            liters: line.litersUnits === null ? null : formatLiters(line.litersUnits),
            amount: toStoredAmount(line.amount),
            currencyCode: TRANSPORT_CURRENCY,
            invoiceNo: line.invoiceNo,
            note: line.note,
            rawValues: line.rawValues,
            createdAt: input.at,
          })),
        });

        const rows = await model(scoped, 'transportFuelStatementLine').findMany({
          where: { statementId: statement.id },
          orderBy: { rowNumber: 'asc' },
        });

        const reconciliation = toReconciliation(
          await model(scoped, 'transportFuelReconciliation').create({
            data: {
              supplierId: input.supplierId,
              statementId: statement.id,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              createdAt: input.at,
              updatedAt: input.at,
            },
          }),
        );

        return { statement, lines: rows.map(toLine), reconciliation };
      });
    } catch (error) {
      if (isUniqueViolationOn(error, FUEL_STATEMENT_PERIOD)) {
        throw TransportDomainError.conflict(
          'FUEL_STATEMENT_PERIOD_TAKEN',
          `Da co bang ke cua cay xang nay cho ky ${input.periodStart}..${input.periodEnd}`,
        );
      }
      throw error;
    }
  }

  async findStatement(id: string): Promise<FuelSupplierStatement | null> {
    const row = await model(this.prisma, 'transportFuelSupplierStatement').findUnique({
      where: { id },
    });
    return row ? toStatement(row) : null;
  }

  async findStatementByPeriod(
    supplierId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<FuelSupplierStatement | null> {
    const row = await model(this.prisma, 'transportFuelSupplierStatement').findFirst({
      where: { supplierId, periodStart, periodEnd },
    });
    return row ? toStatement(row) : null;
  }

  async listStatementLines(statementId: string): Promise<FuelStatementLine[]> {
    const rows = await model(this.prisma, 'transportFuelStatementLine').findMany({
      where: { statementId },
      orderBy: { rowNumber: 'asc' },
    });
    return rows.map(toLine);
  }

  /* -------------------------- Doi soat ---------------------------- */

  async findReconciliation(id: string): Promise<FuelReconciliation | null> {
    const row = await model(this.prisma, 'transportFuelReconciliation').findUnique({
      where: { id },
    });
    return row ? toReconciliation(row) : null;
  }

  async findReconciliationByStatement(statementId: string): Promise<FuelReconciliation | null> {
    const row = await model(this.prisma, 'transportFuelReconciliation').findUnique({
      where: { statementId },
    });
    return row ? toReconciliation(row) : null;
  }

  async listReconciliations(): Promise<FuelReconciliation[]> {
    const rows = await model(this.prisma, 'transportFuelReconciliation').findMany({
      orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toReconciliation);
  }

  async applyMatchingRun(input: ApplyMatchingRunInput): Promise<ApplyMatchingRunOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scoped = tx as unknown as PrismaService;

        // BUOC 0 CUA GIAO THUC NOI TIEP HOA (T4R §1) — khoa truoc, doc lai, roi moi ghi.
        const locked = await this.lockReconciliation(scoped, input.reconciliationId);
        if (!locked) return { kind: 'REJECTED', state: null };
        if (isFrozenFuelReconciliation(locked.state)) {
          return { kind: 'REJECTED', state: locked.state };
        }

        // Chi xoa cai MAY vua lam — xem chu thich cua `ApplyMatchingRunInput`.
        await model(scoped, 'transportFuelMatch').deleteMany({
          where: { reconciliationId: input.reconciliationId, origin: 'AUTO' },
        });
        await model(scoped, 'transportFuelDiscrepancy').deleteMany({
          where: { reconciliationId: input.reconciliationId, status: 'PENDING' },
        });

        for (const match of input.matches) {
          await model(scoped, 'transportFuelMatch').create({
            data: {
              reconciliationId: input.reconciliationId,
              statementLineId: match.statementLineId,
              fuelEntryId: match.fuelEntryId,
              amountDeltaVnd: toStoredAmount(match.amountDeltaVnd),
              businessDateDeltaDays: match.businessDateDeltaDays,
              origin: match.origin,
              matchedAt: input.at,
              matchedBy: input.actor,
            },
          });
        }

        for (const discrepancy of input.discrepancies) {
          await model(scoped, 'transportFuelDiscrepancy').create({
            data: {
              reconciliationId: input.reconciliationId,
              kind: discrepancy.kind,
              statementLineId: discrepancy.statementLineId,
              fuelEntryId: discrepancy.fuelEntryId,
              candidateEntryIds: [...discrepancy.candidateEntryIds],
              candidateLineIds: [...discrepancy.candidateLineIds],
              createdAt: input.at,
            },
          });
        }

        await this.applyStatuses(scoped, input.lineStatuses, input.entryStatuses);

        const pending = await this.countPending(scoped, input.reconciliationId);
        const target =
          pending > 0 ? input.stateAfterRun.whenPending : input.stateAfterRun.whenSettled;
        const state = await this.walkToState(scoped, locked, target, {
          at: input.at,
          markMatched: true,
        });
        if (state === null) return { kind: 'REJECTED', state: locked.state };

        return {
          kind: 'APPLIED',
          state,
          result: {
            matches: await this.readMatches(scoped, input.reconciliationId),
            discrepancies: await this.readDiscrepancies(scoped, input.reconciliationId),
          },
        };
      });
    } catch (error) {
      throw this.translateMatchError(error);
    }
  }

  async listMatches(reconciliationId: string): Promise<FuelMatch[]> {
    return this.readMatches(this.prisma, reconciliationId);
  }

  async listDiscrepancies(reconciliationId: string): Promise<FuelDiscrepancy[]> {
    return this.readDiscrepancies(this.prisma, reconciliationId);
  }

  async findDiscrepancy(id: string): Promise<FuelDiscrepancy | null> {
    const row = await model(this.prisma, 'transportFuelDiscrepancy').findUnique({ where: { id } });
    return row ? toDiscrepancy(row) : null;
  }

  async resolveDiscrepancy(input: ResolveDiscrepancyInput): Promise<ResolveDiscrepancyOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scoped = tx as unknown as PrismaService;

        const locked = await this.lockReconciliation(scoped, input.reconciliationId);
        if (!locked) return { kind: 'RECONCILIATION_REJECTED', state: null };
        if (isFrozenFuelReconciliation(locked.state)) {
          return { kind: 'RECONCILIATION_REJECTED', state: locked.state };
        }

        // `reconciliationId` nam trong `WHERE`: mot chenh lech cua ky KHAC khong duoc quyet duoi
        // khoa cua ky nay — do se la mot lan ghi khong ai noi tiep hoa.
        const updated = await model(scoped, 'transportFuelDiscrepancy').updateMany({
          where: {
            id: input.discrepancyId,
            reconciliationId: input.reconciliationId,
            status: 'PENDING',
          },
          data: {
            status: 'RESOLVED',
            resolution: input.resolution,
            resolutionNote: input.resolutionNote,
            resolvedAt: input.at,
            resolvedBy: input.actor,
          },
        });
        if (updated.count === 0) return { kind: 'DISCREPANCY_RACE' };

        const discrepancy = toDiscrepancy(
          await model(scoped, 'transportFuelDiscrepancy').findUnique({
            where: { id: input.discrepancyId },
          }),
        );

        let match: FuelMatch | null = null;
        if (input.confirmedMatch) {
          match = toMatch(
            await model(scoped, 'transportFuelMatch').create({
              data: {
                reconciliationId: discrepancy.reconciliationId,
                statementLineId: input.confirmedMatch.statementLineId,
                fuelEntryId: input.confirmedMatch.fuelEntryId,
                amountDeltaVnd: toStoredAmount(input.confirmedMatch.amountDeltaVnd),
                businessDateDeltaDays: input.confirmedMatch.businessDateDeltaDays,
                origin: 'MANUAL',
                matchedAt: input.at,
                matchedBy: input.actor,
              },
            }),
          );
        }

        await this.applyStatuses(
          scoped,
          input.lineStatus ? new Map([[input.lineStatus.id, input.lineStatus.status]]) : new Map(),
          input.entryStatus
            ? new Map([[input.entryStatus.id, input.entryStatus.status]])
            : new Map(),
        );

        /*
         * CAU HOI TREO CUOI CUNG DUOC TRA LOI thi ky chuyen trang thai — TRONG CHINH GIAO DICH NAY.
         *
         * Truoc T4R day la mot lan doc + mot lan ghi rieng sau do (`settleStateIfResolved`). Mot
         * lenh dong ky chen vao giua se dem duoc `pending = 0` roi dong, trong khi lan quyet nay
         * chua kip ghi trang thai — va ky da dong mang mot trang thai khong con dung.
         */
        const pending = await this.countPending(scoped, input.reconciliationId);
        const state =
          pending > 0
            ? locked.state
            : ((await this.walkToState(scoped, locked, input.stateWhenSettled, {
                at: input.at,
                markMatched: false,
              })) ?? locked.state);

        return { kind: 'RESOLVED', state, resolved: { discrepancy, match } };
      });
    } catch (error) {
      throw this.translateMatchError(error);
    }
  }

  async closeReconciliation(input: CloseReconciliationInput): Promise<CloseReconciliationOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;

      const locked = await this.lockReconciliation(scoped, input.reconciliationId);
      if (!locked) return { kind: 'REJECTED', state: null };

      /*
       * DEM LAI DUOI KHOA — day la nua con thieu cua `FUEL-RECON-004` (T4R §1).
       *
       * Phep dem cu chay o tang mien TRUOC giao dich, nen mot lan chay so khop chen vao giua sinh
       * ra mot chenh lech `PENDING` moi ma lenh dong khong bao gio thay. Ket cuc: mot ky da dong
       * mang mot cau hoi chua ai tra loi — va mot ban giao cong no da phat cho no.
       */
      const pending = await this.countPending(scoped, input.reconciliationId);
      if (pending > 0) return { kind: 'PENDING_DISCREPANCIES', pending };

      /*
       * Mang RONG chi xay ra khi ky DA dong. Do la mot VA CHAM chu khong phai mot lan dong lai
       * idempotent: duong dong lai hop le di qua `reopenReconciliation` (`GD-11` — quyen rieng +
       * dau vet), va lam ngo cho mot lenh dong thu hai se bo qua dung cai cong do.
       */
      const path = planFuelReconciliationPath(locked.state, 'CLOSED');
      if (path === null || path.length === 0) return { kind: 'REJECTED', state: locked.state };

      const reconciliation = toReconciliation(
        await model(scoped, 'transportFuelReconciliation').update({
          where: { id: input.reconciliationId },
          data: {
            state: 'CLOSED',
            closedAt: input.at,
            closedBy: input.actor,
            updatedAt: input.at,
          },
        }),
      );

      const matches = await this.readMatches(scoped, reconciliation.id);

      // `GD-11` — moi chung tu trong ky chuyen `SETTLED` va khoa lai.
      await model(scoped, 'transportFuelStatementLine').updateMany({
        where: { statementId: reconciliation.statementId, status: 'ACCEPTED' },
        data: { reconciliationStatus: 'SETTLED' },
      });
      await model(scoped, 'transportFuelEntry').updateMany({
        where: { id: { in: matches.map((match) => match.fuelEntryId) } },
        data: { reconciliationStatus: 'SETTLED' },
      });

      /*
       * TONG DUOC CHAP NHAN duoc CONG O DAY, duoi khoa, tren du lieu vua chot — khong phai o tang
       * mien truoc giao dich. Luat (`INV-07`) van song mot ban duy nhat trong `fuel-settlement.ts`;
       * cai chuyen vao trong la PHEP DOC.
       */
      const accepted = sumAcceptedSettlement({
        // Doc QUA `toLine`, khong doc tho: cot `amount` la `BIGINT` o Postgres, va mot phep cong
        // tren `bigint` chua qua `fromStoredAmount` se nem ngay khi gap so dau tien. Ranh gioi kieu
        // cua tep nay nam o cac ham `to*`, khong o delegate cua Prisma — xem chu thich dau tep.
        lines: (
          await model(scoped, 'transportFuelStatementLine').findMany({
            where: { statementId: reconciliation.statementId },
            orderBy: { rowNumber: 'asc' },
          })
        ).map(toLine),
        matches,
        discrepancies: await this.readDiscrepancies(scoped, reconciliation.id),
      });
      const fingerprint = settlementResultFingerprint(accepted);

      const latestRow = await model(scoped, 'transportFuelSettlementHandoff').findFirst({
        where: { reconciliationId: reconciliation.id },
        orderBy: { revision: 'desc' },
      });
      const latest = latestRow ? toHandoff(latestRow) : null;

      if (latest && handoffFingerprint(latest) === fingerprint) {
        return {
          kind: 'CLOSED',
          closed: { reconciliation, handoff: latest, handoffReplayed: true },
        };
      }

      const handoff = toHandoff(
        await model(scoped, 'transportFuelSettlementHandoff').create({
          data: {
            reconciliationId: reconciliation.id,
            revision: (latest?.revision ?? 0) + 1,
            supersedesId: latest?.id ?? null,
            supplierId: reconciliation.supplierId,
            periodStart: reconciliation.periodStart,
            periodEnd: reconciliation.periodEnd,
            acceptedAmount: toStoredAmount(accepted.amount),
            currencyCode: TRANSPORT_CURRENCY,
            acceptedLineCount: accepted.lineCount,
            acceptedLineIds: [...accepted.lineIds],
            emittedAt: input.at,
            emittedBy: input.actor,
          },
        }),
      );
      return { kind: 'CLOSED', closed: { reconciliation, handoff, handoffReplayed: false } };
    });
  }

  async reopenReconciliation(input: ReopenReconciliationInput): Promise<FuelReconciliation | null> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;

      // Lenh thu tu cua giao thuc noi tiep hoa (T4R §1): mo lai mot ky trong luc mot lan so khop
      // dang ghi vao chinh ky do se go khoa cac chung tu ma lan ghi kia van dang doi tren.
      await this.lockReconciliation(scoped, input.reconciliationId);

      const moved = await model(scoped, 'transportFuelReconciliation').updateMany({
        where: { id: input.reconciliationId, state: 'CLOSED' },
        data: {
          state: 'REOPENED',
          reopenedAt: input.at,
          reopenedBy: input.actor,
          reopenReason: input.reason,
          updatedAt: input.at,
        },
      });
      if (moved.count === 0) return null;

      const reconciliation = toReconciliation(
        await model(scoped, 'transportFuelReconciliation').findUnique({
          where: { id: input.reconciliationId },
        }),
      );

      // Go khoa: `SETTLED` quay ve trang thai doc duoc TU SU TON TAI cua mot cap khop — khong dua
      // het ve `UNMATCHED`, vi lam vay se xoa mat ket qua doi soat cua chinh ky vua mo lai.
      const matches = await this.readMatches(scoped, reconciliation.id);
      const matchedLineIds = matches.map((match) => match.statementLineId);
      const matchedEntryIds = matches.map((match) => match.fuelEntryId);

      await model(scoped, 'transportFuelStatementLine').updateMany({
        where: {
          statementId: reconciliation.statementId,
          reconciliationStatus: 'SETTLED',
          id: { in: matchedLineIds },
        },
        data: { reconciliationStatus: 'MATCHED' },
      });
      await model(scoped, 'transportFuelStatementLine').updateMany({
        where: {
          statementId: reconciliation.statementId,
          reconciliationStatus: 'SETTLED',
          id: { notIn: matchedLineIds },
        },
        data: { reconciliationStatus: 'MISMATCHED' },
      });
      await model(scoped, 'transportFuelEntry').updateMany({
        where: { id: { in: matchedEntryIds }, reconciliationStatus: 'SETTLED' },
        data: { reconciliationStatus: 'MATCHED' },
      });

      return reconciliation;
    });
  }

  async findHandoff(reconciliationId: string): Promise<FuelSettlementHandoff | null> {
    const row = await model(this.prisma, 'transportFuelSettlementHandoff').findFirst({
      where: { reconciliationId },
      orderBy: { revision: 'desc' },
    });
    return row ? toHandoff(row) : null;
  }

  async listHandoffRevisions(reconciliationId: string): Promise<FuelSettlementHandoff[]> {
    const rows = await model(this.prisma, 'transportFuelSettlementHandoff').findMany({
      where: { reconciliationId },
      orderBy: { revision: 'asc' },
    });
    return rows.map(toHandoff);
  }

  /* --------------------------- Noi bo ----------------------------- */

  /**
   * KHOA GHI CUA MOT KY DOI SOAT — `SELECT ... FOR UPDATE` tren dung mot hang (T4R §1).
   *
   * ===========================================================================
   * VI SAO HANG DOI SOAT, va vi sao MOI LENH deu phai di qua no.
   *
   * Bon lenh cham vao ket qua cua mot ky — chay so khop, quyet chenh lech, dong, mo lai — deu ghi
   * vao NHUNG BANG KHAC NHAU: `TransportFuelMatch`, `TransportFuelDiscrepancy`,
   * `TransportFuelStatementLine`, `TransportFuelEntry`, `TransportFuelSettlementHandoff`. Khong co
   * mot hang nao trong so do ma ca bon deu cham, nen khoa o bat ky bang nao trong so do cung de hai
   * lenh di qua nhau ma khong bao gio gap.
   *
   * Hang `TransportFuelReconciliation` la thu duy nhat CA BON deu thuoc ve. Bat moi lenh xin no
   * TRUOC, va bon lenh xep thanh mot hang doi. Do la toan bo co che.
   *
   * Tra ve trang thai DOC TU HANG DA KHOA. Gia tri ma tang mien doc truoc giao dich KHONG duoc
   * dung de quyet dinh gi — do dung la cai da sai truoc T4R.
   *
   * Tham so noi bang mot bieu thuc trong `$executeRaw` cua Prisma la truy van CO THAM SO (`$1`),
   * khong phai noi chuoi — khong co duong tiem SQL nao o day.
   */
  private async lockReconciliation(
    scoped: PrismaService,
    reconciliationId: string,
  ): Promise<FuelReconciliation | null> {
    const locked =
      await scoped.$executeRaw`SELECT "id" FROM "TransportFuelReconciliation" WHERE "id" = ${reconciliationId} FOR UPDATE`;
    if (locked === 0) return null;

    const row = await model(scoped, 'transportFuelReconciliation').findUnique({
      where: { id: reconciliationId },
    });
    return row ? toReconciliation(row) : null;
  }

  private async countPending(scoped: PrismaService, reconciliationId: string): Promise<number> {
    return model(scoped, 'transportFuelDiscrepancy').count({
      where: { reconciliationId, status: 'PENDING' },
    });
  }

  /**
   * AP mot buoc chuyen trang thai ma TANG MIEN da duyet — `null` khi khong co duong nao.
   *
   * Tang kho KHONG duoc tu nghi ra canh nao: no hoi `planFuelReconciliationPath` bang trang thai
   * doc tu hang DA KHOA, roi ghi. Chi diem CUOI cua duong duoc ghi that — cac trang thai trung
   * gian nam gon trong mot giao dich va khong mot phien nao ben ngoai nhin thay chung, nen ghi
   * chung chi ton them mot vong I/O ma khong them mot su that nao.
   */
  private async walkToState(
    scoped: PrismaService,
    from: FuelReconciliation,
    to: FuelReconciliationState,
    options: { readonly at: Date; readonly markMatched: boolean },
  ): Promise<FuelReconciliationState | null> {
    const path = planFuelReconciliationPath(from.state, to);
    if (path === null) return null;

    const destination = path.length === 0 ? from.state : path[path.length - 1]!;
    await model(scoped, 'transportFuelReconciliation').update({
      where: { id: from.id },
      data: {
        state: destination,
        ...(options.markMatched ? { lastMatchedAt: options.at } : {}),
        updatedAt: options.at,
      },
    });
    return destination;
  }

  private async applyStatuses(
    scoped: PrismaService,
    lineStatuses: ReadonlyMap<string, FuelReconciliationStatus>,
    entryStatuses: ReadonlyMap<string, FuelReconciliationStatus>,
  ): Promise<void> {
    for (const [id, status] of lineStatuses) {
      await model(scoped, 'transportFuelStatementLine').updateMany({
        where: { id },
        data: { reconciliationStatus: status },
      });
    }
    for (const [id, status] of entryStatuses) {
      await model(scoped, 'transportFuelEntry').updateMany({
        where: { id },
        data: { reconciliationStatus: status },
      });
    }
  }

  private async readMatches(scoped: PrismaService, reconciliationId: string): Promise<FuelMatch[]> {
    const rows = await model(scoped, 'transportFuelMatch').findMany({
      where: { reconciliationId },
      orderBy: [{ matchedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMatch);
  }

  private async readDiscrepancies(
    scoped: PrismaService,
    reconciliationId: string,
  ): Promise<FuelDiscrepancy[]> {
    const rows = await model(scoped, 'transportFuelDiscrepancy').findMany({
      where: { reconciliationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDiscrepancy);
  }

  /**
   * Ba va cham co the xay ra khi ghi mot cap khop, va chung phai ra BA cau tra loi khac nhau.
   *
   * `INV-26` den tu mot TRIGGER, khong phai mot unique — nen no khong mang ma `P2002` va phai duoc
   * nhan bang chinh ten rang buoc trong thong diep. Xem `fuel-storage-conflict.ts`.
   */
  private translateMatchError(error: unknown): unknown {
    if (isSelfSourcedMatchViolation(error)) {
      return TransportDomainError.conflict(
        'FUEL_MATCH_SELF_SOURCED',
        'Phieu nay duoc de ra tu chinh bang ke dang doi soat — khong khop voi chinh no (INV-26)',
      );
    }
    if (isUniqueViolationOn(error, FUEL_MATCH_LINE_ONCE)) {
      return TransportDomainError.conflict(
        'FUEL_STATEMENT_LINE_ALREADY_MATCHED',
        'Dong bang ke nay vua duoc nguoi khac khop voi mot phieu khac — tai lai roi thu lai',
      );
    }
    if (isUniqueViolationOn(error, FUEL_MATCH_ENTRY_ONCE)) {
      return TransportDomainError.conflict(
        'FUEL_ENTRY_ALREADY_MATCHED',
        'Phieu nay vua duoc nguoi khac khop voi mot dong khac — tai lai roi thu lai',
      );
    }
    return error;
  }
}
