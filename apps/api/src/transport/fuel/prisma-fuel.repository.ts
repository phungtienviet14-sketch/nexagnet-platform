import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { TRANSPORT_CURRENCY, fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  AMENDABLE_FUEL_RECONCILIATION_STATUSES,
  AMENDABLE_FUEL_VERIFICATION,
  ATTACHABLE_EVIDENCE_RECONCILIATION_STATUSES,
  isFrozenFuelReconciliation,
  type FuelReconciliationState,
  type FuelReconciliationStatus,
  type FuelVerificationStatus,
} from './fuel-lifecycle.js';
import {
  consumptionFromStored,
  formatConsumption,
  formatLiters,
  litersFromStored,
} from './fuel-quantity.js';
import { sameSettlementResult, sumAcceptedSettlement } from './fuel-settlement.js';
import {
  FUEL_ENTRY_CORRELATION,
  FUEL_ENTRY_TABLE,
  FUEL_MATCH_ENTRY_ONCE,
  FUEL_MATCH_LINE_ONCE,
  FUEL_RECONCILIATION_TABLE,
  FUEL_STATEMENT_PERIOD,
  isSelfSourcedMatchViolation,
} from './fuel-storage-conflict.js';
import {
  FuelRepository,
  type AmendFuelEntryInput,
  type ApplyMatchingRunInput,
  type CloseReconciliationInput,
  type CloseReconciliationOutcome,
  type CreateFuelEntryInput,
  type CreateFuelSupplierInput,
  type CreateStatementInput,
  type CreatedStatement,
  type MatchingRunOutcome,
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
  supersedesHandoffId: row.supersedesHandoffId,
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

/**
 * KHOA MOT HANG BANG SQL THO — `SELECT ... FOR UPDATE`.
 *
 * Prisma Client khong mo ra khoa hang o muc API, nen day la duong duy nhat. Doi lai, day cung la
 * cho DUY NHAT trong tep viet SQL tay: hai ham duoi chi lay ve mot cot, va moi phep doc/ghi khac
 * van di qua delegate.
 *
 * Tham so di bang `$1` chu khong noi chuoi — mot `id` den tu HTTP, va noi chuoi o day la mot lo
 * tiem SQL trong dung mot ham co nhiem vu bao ve tinh toan ven.
 *
 * `FOR UPDATE` o muc co lap READ COMMITTED (mac dinh cua Postgres) lam dung viec can lam: neu mot
 * giao dich khac dang giu hang, lenh nay CHO, roi khi ben kia commit no doc lai PHIEN BAN MOI. Nho
 * vay phep kiem trang thai ngay sau do nhin thay su that sau cung, khong phai ban chup luc bat dau.
 */
const lockRowState = async <T>(
  scoped: PrismaService,
  table: string,
  column: string,
  id: string,
): Promise<T | null> => {
  const rows = (await (
    scoped as unknown as {
      $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown[]>;
    }
  ).$queryRawUnsafe(
    `SELECT "${column}" FROM "${table}" WHERE "id" = $1 FOR UPDATE`,
    id,
  )) as Array<Record<string, T>>;
  return rows.length === 0 ? null : (rows[0]?.[column] ?? null);
};

const lockReconciliationState = (
  scoped: PrismaService,
  reconciliationId: string,
): Promise<FuelReconciliationState | null> =>
  lockRowState<FuelReconciliationState>(
    scoped,
    FUEL_RECONCILIATION_TABLE,
    'state',
    reconciliationId,
  );

const lockEntryReconciliationStatus = (
  scoped: PrismaService,
  entryId: string,
): Promise<FuelReconciliationStatus | null> =>
  lockRowState<FuelReconciliationStatus>(
    scoped,
    FUEL_ENTRY_TABLE,
    'reconciliationStatus',
    entryId,
  );

/**
 * Kho `TX-04` tren PostgreSQL.
 *
 * ===========================================================================
 * SAU THAO TAC O DAY LA NGUYEN TU, va moi cai vi mot ly do da tra gia o T3R (Issue #94) hoac o
 * ra soat T4 (Issue #103):
 *
 *   `createStatementWithReconciliation`
 *                          dau bang ke + moi dong + KY DOI SOAT — nua chung la mot bang ke khong
 *                          ky nao, ma lan nhap lai bi unique `(cay xang, ky)` chan (#103 §3);
 *   `applyMatchingRun`     khoa ky + xoa ket qua tu dong cu + ghi ket qua moi + doi trang thai —
 *                          nua chung la mot bang doi soat mau thuan voi chinh no (#103 §1);
 *   `resolveDiscrepancy`   khoa ky + quyet dinh + cap khop tay + trang thai hai ve;
 *   `closeReconciliation`  khoa ky + dem lai chenh lech + tinh lai tong + dong ky + khoa chung tu
 *                          + phat mot ban sua doi ban giao T5 (#103 §1, §2);
 *   `reopenReconciliation` khoa ky + mo lai + go khoa chung tu;
 *   `addEvidence`          khoa phieu + kiem ky da dong chua + chen anh (#103 §4).
 *
 * MOI thao tac doi trang thai deu doi `from`: `updateMany` co dieu kien roi doc lai, chu khong
 * `update` theo `id`. Do la cong chong HAI NGUOI cung bam, va Prisma khong cho `update` theo mot
 * dieu kien khong-unique — nen hinh dang nay la co y, khong phai mot cach viet vong.
 *
 * ===========================================================================
 * HAI TANG CHONG VA CHAM, va chung khong thay the nhau:
 *
 *   · `WHERE` CO DIEU KIEN (`updateMany`) — du cho mot lan ghi DON LE. Lan ghi thang hay thua duoc
 *     quyet ngay trong cau lenh, nen khong co khe ho giua doc va ghi;
 *   · `SELECT ... FOR UPDATE` — bat buoc khi mot thao tac ghi NHIEU BANG va phai thay ca nhom o
 *     mot trang thai dong nhat. Menh de `WHERE` cua tung lenh khong noi gi ve cac lenh con lai.
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
   * SUA PHIEU — dieu kien sua duoc nam TRONG menh de `WHERE` (Issue #103 §4).
   *
   * Truoc day la `where: { id }`, va phep kiem `GD-10` chi song o service. Giua luc service doc va
   * luc lenh nay chay, mot lan duyet co the da bien phieu thanh `VERIFIED` va da day chi phi sang
   * `TX-03` — lenh ghi van thanh cong, va con so tren phieu tach khoi con so trong gia thanh
   * chuyen. Hai truc deu phai co mat: chi kiem truc duyet thi mot phieu `DECLARED` DA KHOP van bi
   * sua, va cap khop lap tuc noi doi ve chenh lech no da do.
   */
  async amendEntry(id: string, patch: AmendFuelEntryInput): Promise<FuelEntry | null> {
    const updated = await model(this.prisma, 'transportFuelEntry').updateMany({
      where: {
        id,
        verificationStatus: AMENDABLE_FUEL_VERIFICATION,
        reconciliationStatus: { in: [...AMENDABLE_FUEL_RECONCILIATION_STATUSES] },
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
   * GAN ANH — mot lan CHEN, nen dieu kien khong nhet vao `WHERE` duoc (Issue #103 §4).
   *
   * `INSERT` khong co menh de "chi khi hang kia dang o trang thai X", nen o day phai la khoa hang
   * that: khoa phieu, doc `reconciliationStatus` da khoa, roi moi chen. Khong co buoc khoa thi mot
   * lenh dong ky chay xen giua doc va chen se de lai mot tam anh gan vao mot ky DA BAO CAO RA
   * NGOAI — dung dieu `GD-11` cam.
   */
  async addEvidence(input: {
    fuelEntryId: string;
    locator: string;
    contentType: string | null;
    byteSize: number | null;
    capturedAt: Date | null;
    uploadedBy: string;
    at: Date;
  }): Promise<FuelReceiptEvidence | null> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;
      const status = await lockEntryReconciliationStatus(scoped, input.fuelEntryId);
      if (status === null) return null;
      if (!ATTACHABLE_EVIDENCE_RECONCILIATION_STATUSES.includes(status)) return null;

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

        // Ky doi soat mo TRONG CHINH giao dich nay — xem `CreateStatementInput`. Mot lan hong o
        // bat cu diem nao tu day tro len cuon lai ca ba, va lan nhap lai thanh cong.
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

  async applyMatchingRun(input: ApplyMatchingRunInput): Promise<MatchingRunOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scoped = tx as unknown as PrismaService;

        /*
         * KHOA KY TRUOC KHI CHAM VAO BAT CU THU GI (Issue #103 §1).
         *
         * Ket qua so khop duoc tinh NGOAI giao dich nay — do la co y, phep so khop la mot ham thuan
         * va no khong nen giu khoa trong luc chay. Nhung ket qua do duoc tinh tren mot ban chup, va
         * ban chup co the da cu: giua luc doc va luc ghi, mot nguoi khac co the da dong ky.
         *
         * Khoa hang roi doc lai trang thai la cho DUY NHAT nhan ra dieu do kip thoi. Sau dong nay,
         * khong mot lenh dong/mo lai nao chen vao duoc nua cho toi khi giao dich ket thuc.
         */
        const state = await lockReconciliationState(scoped, input.reconciliationId);
        if (state === null) {
          throw TransportDomainError.notFound(
            'FUEL_RECONCILIATION_NOT_FOUND',
            `Khong tim thay ky doi soat ${input.reconciliationId}`,
          );
        }
        if (isFrozenFuelReconciliation(state)) {
          return { status: 'RECONCILIATION_FROZEN' as const, state };
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

        /*
         * DOI TRANG THAI KY TRONG CUNG GIAO DICH — khong phai mot lenh thu hai sau do.
         *
         * `MATCHING` la dich hop le tu MOI trang thai khong dong bang (`DRAFT`, `RESOLVED`,
         * `REOPENED`, va chinh no). Canh duy nhat bi cam la tu `CLOSED`, ma nhanh o tren da loai.
         * `fuel-lifecycle.spec.ts` khoa lai dung menh de do, nen mot trang thai moi them vao sau nay
         * khong the lang le lam cau nay sai.
         */
        await model(scoped, 'transportFuelReconciliation').update({
          where: { id: input.reconciliationId },
          data: { state: 'MATCHING', lastMatchedAt: input.at, updatedAt: input.at },
        });
        const moved = await this.settleIfNothingPending(scoped, input.reconciliationId, input.at);

        return {
          status: 'APPLIED' as const,
          result: {
            matches: await this.readMatches(scoped, input.reconciliationId),
            discrepancies: await this.readDiscrepancies(scoped, input.reconciliationId),
            reconciliation: moved,
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

  async countPendingDiscrepancies(reconciliationId: string): Promise<number> {
    return model(this.prisma, 'transportFuelDiscrepancy').count({
      where: { reconciliationId, status: 'PENDING' },
    });
  }

  async resolveDiscrepancy(input: ResolveDiscrepancyInput): Promise<ResolveDiscrepancyOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scoped = tx as unknown as PrismaService;

        // Cung khoa, cung ly do voi `applyMatchingRun`: mot quyet dinh ghi vao BA bang, va ca ba
        // phai thuoc ve mot ky con dang mo tai DUNG thoi diem ghi.
        const state = await lockReconciliationState(scoped, input.reconciliationId);
        if (state === null) {
          throw TransportDomainError.notFound(
            'FUEL_RECONCILIATION_NOT_FOUND',
            `Khong tim thay ky doi soat ${input.reconciliationId}`,
          );
        }
        if (isFrozenFuelReconciliation(state)) {
          return { status: 'RECONCILIATION_FROZEN' as const, state };
        }

        const updated = await model(scoped, 'transportFuelDiscrepancy').updateMany({
          where: { id: input.discrepancyId, status: 'PENDING' },
          data: {
            status: 'RESOLVED',
            resolution: input.resolution,
            resolutionNote: input.resolutionNote,
            resolvedAt: input.at,
            resolvedBy: input.actor,
          },
        });
        if (updated.count === 0) return { status: 'DISCREPANCY_NOT_PENDING' as const };

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

        return {
          status: 'RESOLVED' as const,
          resolved: {
            discrepancy,
            match,
            reconciliation: await this.settleIfNothingPending(
              scoped,
              input.reconciliationId,
              input.at,
            ),
          },
        };
      });
    } catch (error) {
      throw this.translateMatchError(error);
    }
  }

  async closeReconciliation(input: CloseReconciliationInput): Promise<CloseReconciliationOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;

      const locked = await lockReconciliationState(scoped, input.reconciliationId);
      if (locked === null) {
        throw TransportDomainError.notFound(
          'FUEL_RECONCILIATION_NOT_FOUND',
          `Khong tim thay ky doi soat ${input.reconciliationId}`,
        );
      }

      /*
       * DEM LAI CHENH LECH — sau khi khoa, khong phai truoc (Issue #103 §1).
       *
       * Phep dem cu nam o service, tach khoi lenh dong bang mot khoang thoi gian. Trong khoang do
       * mot lan chay so khop co the de ra mot chenh lech `PENDING` moi, va ky van dong — mang theo
       * mot cau hoi chua ai tra loi, dung dieu `FUEL-RECON-004` cam.
       */
      const pending = await model(scoped, 'transportFuelDiscrepancy').count({
        where: { reconciliationId: input.reconciliationId, status: 'PENDING' },
      });
      if (pending > 0) return { status: 'PENDING_DISCREPANCIES' as const, pending };

      /*
       * DUA KY VE `RESOLVED` TRONG CUNG GIAO DICH.
       *
       * Buoc nay tung o service (`moveTo(..., 'RESOLVED')`) ngay truoc loi goi nay — mot lan ghi
       * KHONG duoc khoa bao ve. `MATCHING` va `REOPENED` deu co canh sang `RESOLVED`; `DRAFT` thi
       * khong, va mot ky chua tung so khop lan nao khong co gi de dong.
       */
      if (locked !== 'RESOLVED') {
        if (locked !== 'MATCHING' && locked !== 'REOPENED') {
          return { status: 'STATE_RACE' as const, state: locked };
        }
        await model(scoped, 'transportFuelReconciliation').update({
          where: { id: input.reconciliationId },
          data: { state: 'RESOLVED', updatedAt: input.at },
        });
      }

      const reconciliation = toReconciliation(
        await model(scoped, 'transportFuelReconciliation').update({
          where: { id: input.reconciliationId },
          data: { state: 'CLOSED', closedAt: input.at, closedBy: input.actor, updatedAt: input.at },
        }),
      );

      /*
       * TINH LAI TONG DUOC CHAP NHAN — tu du lieu VUA BI KHOA, khong tu con so nguoi goi mang toi.
       *
       * Luat cong nam o `fuel-settlement.ts` (ham thuan, `INV-07`); o day chi la phep DOC. Doc ba
       * bang o day thay vi o service la toan bo khac biet: con so di sang T5 ung voi dung mot trang
       * thai da ton tai, chu khong phai mot ban chup ghep tu ba thoi diem khac nhau.
       */
      const [lines, matches, discrepancies] = await Promise.all([
        model(scoped, 'transportFuelStatementLine').findMany({
          where: { statementId: reconciliation.statementId },
          orderBy: { rowNumber: 'asc' },
        }),
        this.readMatches(scoped, reconciliation.id),
        this.readDiscrepancies(scoped, reconciliation.id),
      ]);
      const totals = sumAcceptedSettlement({
        lines: lines.map(toLine),
        matches,
        discrepancies,
      });

      // `GD-11` — moi chung tu trong ky chuyen `SETTLED` va khoa lai.
      await model(scoped, 'transportFuelStatementLine').updateMany({
        where: { statementId: reconciliation.statementId, status: 'ACCEPTED' },
        data: { reconciliationStatus: 'SETTLED' },
      });
      await model(scoped, 'transportFuelEntry').updateMany({
        where: { id: { in: matches.map((match) => match.fuelEntryId) } },
        data: { reconciliationStatus: 'SETTLED' },
      });

      return {
        status: 'CLOSED' as const,
        closed: {
          reconciliation,
          ...(await this.emitHandoffRevision(scoped, reconciliation, totals, input)),
        },
      };
    });
  }

  /**
   * PHAT MOT BAN SUA DOI BAN GIAO — hoac phat lai ban gan nhat (Issue #103 §2).
   *
   * ===========================================================================
   * BA DUONG, VA CHUNG PHAI KHAC NHAU:
   *
   * ```text
   * chua co ban nao          -> revision 1
   * ket qua GIONG ban cuoi   -> phat lai chinh no, khong hang moi
   * ket qua KHAC ban cuoi    -> revision N+1, tro nguoc ve ban cuoi
   * ```
   *
   * Duong thu hai la thu giu cho "dong lai hai lan khong tao hai cong no" van dung. Duong thu ba la
   * thu ma ban cu — mot hang UNIQUE theo `reconciliationId` — KHONG the lam: no tra lai con so
   * 10.000.000d cho mot ky da duoc sua thanh 12.000.000d, va T5 khong co cach nao biet.
   *
   * KHONG ghi de ban cu o duong thu ba: ban giao la thu DA PHAT RA NGOAI. Sua lang le mot con so da
   * di ra ngoai la dung dieu `GD-11` cam, va no cung xoa mat bang chung ve viec da tung bao cao
   * nham. Chi them, va noi ro ban moi thay the ban nao.
   */
  private async emitHandoffRevision(
    scoped: PrismaService,
    reconciliation: FuelReconciliation,
    totals: { amount: number; lineCount: number },
    input: CloseReconciliationInput,
  ): Promise<{ handoff: FuelSettlementHandoff; handoffReplayed: boolean }> {
    const latestRow = await model(scoped, 'transportFuelSettlementHandoff').findFirst({
      where: { reconciliationId: reconciliation.id },
      orderBy: { revision: 'desc' },
    });
    const latest = latestRow ? toHandoff(latestRow) : null;

    if (
      latest &&
      sameSettlementResult(
        { amount: latest.acceptedAmount, lineCount: latest.acceptedLineCount },
        totals,
      )
    ) {
      return { handoff: latest, handoffReplayed: true };
    }

    const handoff = toHandoff(
      await model(scoped, 'transportFuelSettlementHandoff').create({
        data: {
          reconciliationId: reconciliation.id,
          revision: (latest?.revision ?? 0) + 1,
          supersedesHandoffId: latest?.id ?? null,
          supplierId: reconciliation.supplierId,
          periodStart: reconciliation.periodStart,
          periodEnd: reconciliation.periodEnd,
          acceptedAmount: toStoredAmount(totals.amount),
          currencyCode: TRANSPORT_CURRENCY,
          acceptedLineCount: totals.lineCount,
          emittedAt: input.at,
          emittedBy: input.actor,
        },
      }),
    );
    return { handoff, handoffReplayed: false };
  }

  async reopenReconciliation(input: ReopenReconciliationInput): Promise<FuelReconciliation | null> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;

      // Cung mot hang khoa voi ba lenh kia — mo lai la lenh DUY NHAT go duoc trang thai dong bang,
      // nen no phai xep hang cung cho voi chung chu khong chay song song.
      await lockReconciliationState(scoped, input.reconciliationId);

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

  /** Ban GAN NHAT — `revision` cao nhat, tuc con so dang co hieu luc voi T5. */
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
   * "HET CHENH LECH TREO THI KY DA XONG" — mot buoc, TRONG giao dich da khoa (Issue #103 §1).
   *
   * Buoc nay tung song o service duoi ten `settleStateIfResolved`: dem chenh lech, doc trang thai,
   * roi ghi — ba lan cham CSDL, khong lan nao duoc khoa bao ve. No la duong ghi THU NAM vao hang
   * doi soat, va la duong duy nhat con nam ngoai giao thuc tuan tu hoa.
   *
   * Khoang trong do nho nhung that: mot lenh dong ky xen vao giua se lam lenh CAS o cuoi truot, va
   * nguoi vua chay so khop nhan mot loi va cham cho mot lan chay DA THANH CONG.
   *
   * O day thi khong con khoang trong nao: khoa da nam trong tay tu dau giao dich.
   */
  private async settleIfNothingPending(
    scoped: PrismaService,
    reconciliationId: string,
    at: Date,
  ): Promise<FuelReconciliation> {
    const pending = await model(scoped, 'transportFuelDiscrepancy').count({
      where: { reconciliationId, status: 'PENDING' },
    });

    // `updateMany` co dieu kien `state: 'MATCHING'` chu khong `update` theo `id`: canh duy nhat
    // dan sang `RESOLVED` o buoc nay la tu `MATCHING`, va may trang thai van la ben giu luat.
    if (pending === 0) {
      await model(scoped, 'transportFuelReconciliation').updateMany({
        where: { id: reconciliationId, state: 'MATCHING' },
        data: { state: 'RESOLVED', updatedAt: at },
      });
    }

    return toReconciliation(
      await model(scoped, 'transportFuelReconciliation').findUnique({ where: { id: reconciliationId } }),
    );
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
