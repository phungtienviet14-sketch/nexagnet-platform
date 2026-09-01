import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import { TransportDomainError } from '../transport.errors.js';
import type { CommissionCalcKind } from './commission-rules.js';
import { canAdjust, outstandingOf } from './settlement-documents.js';
import type { SettlementFlow } from './settlement-flows.js';
import {
  SettlementRepository,
  type AllocateCommand,
  type CommissionCandidateRow,
  type CorrectDocumentCommand,
  type DocumentQuery,
  type RecogniseDocumentCommand,
  type RecordCommissionCommand,
} from './settlement.repository.js';
import type {
  CommissionCalculation,
  CommissionRule,
  CommissionRuleVersion,
  CustomerSettlementTerms,
  SettlementAllocation,
  SettlementDocument,
  SettlementDocumentChain,
  SettlementPeriod,
  SettlementPeriodStatus,
  SettlementRecognition,
} from './settlement.types.js';

/*
 * Xem chu thich cung ten trong `prisma-costing.repository.ts`: ranh gioi kieu that su nam o cac ham
 * `to*` co kieu ben duoi, khong o delegate cua Prisma. Tang nay CO Y khong phu thuoc vao ban sinh
 * cua client — mot ban sinh doi hinh dang khong duoc lam tep nay ngung bien dich.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (client: unknown, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (client as unknown as Record<string, any>)[name];

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value ? iso(value) : null);
const amount = (stored: bigint): number => fromStoredAmount(stored) ?? 0;

/* eslint-disable @typescript-eslint/no-explicit-any */

const toDocument = (row: any): SettlementDocument => ({
  id: row.id,
  direction: row.direction,
  flow: row.flow,
  counterpartyKind: row.counterpartyKind,
  counterpartyId: row.counterpartyId,
  kind: row.kind,
  status: row.status,
  signedAmount: amount(row.signedAmount),
  currencyCode: row.currencyCode,
  businessDate: row.businessDate,
  dueDate: row.dueDate,
  tripId: row.tripId,
  sourceContext: row.sourceContext,
  sourceId: row.sourceId,
  sourceFingerprint: row.sourceFingerprint,
  adjustsId: row.adjustsId,
  invoiceRef: row.invoiceRef,
  note: row.note,
  recordedBy: row.recordedBy,
  createdAt: iso(row.createdAt),
});

const toAllocation = (row: any): SettlementAllocation => ({
  id: row.id,
  documentId: row.documentId,
  amount: amount(row.amount),
  businessDate: row.businessDate,
  method: row.method,
  sourceContext: row.sourceContext,
  sourceId: row.sourceId,
  note: row.note,
  recordedBy: row.recordedBy,
  createdAt: iso(row.createdAt),
});

const toPeriod = (row: any): SettlementPeriod => ({
  id: row.id,
  flow: row.flow,
  startDate: row.startDate,
  endDate: row.endDate,
  status: row.status,
  closedAt: isoOrNull(row.closedAt),
  closedBy: row.closedBy,
  reopenedAt: isoOrNull(row.reopenedAt),
  reopenedBy: row.reopenedBy,
  reopenReason: row.reopenReason,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toTerms = (row: any): CustomerSettlementTerms => ({
  customerId: row.customerId,
  paymentTermDays: row.paymentTermDays,
  creditLimit: row.creditLimit === null ? null : amount(row.creditLimit),
  currencyCode: row.currencyCode,
  updatedBy: row.updatedBy,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toRule = (row: any): CommissionRule => ({
  id: row.id,
  partnerId: row.partnerId,
  routeKey: row.routeKey,
  status: row.status,
  createdBy: row.createdBy,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toRuleVersion = (row: any): CommissionRuleVersion => ({
  id: row.id,
  ruleId: row.ruleId,
  version: row.version,
  calcKind: row.calcKind,
  rateBasisPoints: row.rateBasisPoints,
  fixedAmount: row.fixedAmount === null ? null : amount(row.fixedAmount),
  effectiveFrom: row.effectiveFrom,
  effectiveTo: row.effectiveTo,
  publishedAt: iso(row.publishedAt),
  publishedBy: row.publishedBy,
});

const toCommission = (row: any): CommissionCalculation => ({
  id: row.id,
  tripId: row.tripId,
  ruleVersionId: row.ruleVersionId,
  ruleScopeSnapshot: row.ruleScopeSnapshot,
  calcKindSnapshot: row.calcKindSnapshot,
  rateBasisPointsSnapshot: row.rateBasisPointsSnapshot,
  fixedAmountSnapshot: row.fixedAmountSnapshot === null ? null : amount(row.fixedAmountSnapshot),
  basisAmount: amount(row.basisAmount),
  rawAmount: row.rawAmount,
  resultAmount: amount(row.resultAmount),
  documentId: row.documentId,
  partnerId: row.partnerId,
  businessDate: row.businessDate,
  createdAt: iso(row.createdAt),
});

/**
 * KHO POSTGRES cua `transport-settlement`.
 *
 * ===========================================================================
 * GIAO THUC NOI TIEP HOA — mot ban sao cua bai hoc T4R §1 va §4, ap TU DAU thay vi vá sau.
 *
 * Ba lenh ghi cua tang nay (`recogniseDocument`, `correctDocument`, `allocate`) deu doc mot trang
 * thai roi quyet dinh dua tren no. Neu lan doc va lan ghi nam ngoai mot giao dich co khoa, mot
 * lenh khac chen vao giua se lam quyet dinh do sai TAI THOI DIEM GHI:
 *
 *   · A doc: chung tu con `POSTED`, sua duoc
 *   · B ghi mot ban DAO, dat ban goc thanh `REVERSED`
 *   · A ghi ban dieu chinh vao mot chuoi da dao => tong chuoi khac 0, mot khoan no song lai
 *
 * Nen moi lenh ghi o day deu:
 *
 *     mo giao dich
 *       -> SELECT ... FOR UPDATE tren hang chu
 *       -> doc lai trang thai TU HANG DA KHOA
 *       -> ghi
 *
 * Hang chu la thu moi lenh cung tranh: voi sua/phan bo do la BAN GOC cua chuoi. Voi mot lan ghi
 * nhan MOI thi khong co hang chung nao ton tai truoc, va vai tro do thuoc ve
 * `@@unique([sourceContext, sourceId])` — hai lan ghi dong thoi cung khoa se co dung mot lan
 * thang, con lan kia nhan `P2002`.
 */
@Injectable()
export class PrismaSettlementRepository extends SettlementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Ky DONG BANG chan moi lan ghi co ngay nghiep vu roi vao no.
   *
   * Doc TRONG giao dich dang chay (`tx`) chu khong qua `this.prisma`: doc ngoai giao dich se thay
   * mot anh chup cu hon, va mot ky vua chuyen sang `CLOSING` o giao dich khac se van doc ra `OPEN`.
   */
  private async assertPeriodWritable(
    tx: unknown,
    flow: SettlementFlow,
    businessDate: BusinessDate,
  ): Promise<void> {
    const period = await model(tx, 'transportSettlementPeriod').findFirst({
      where: { flow, startDate: { lte: businessDate }, endDate: { gte: businessDate } },
    });
    if (!period) return;
    if (period.status === 'CLOSING' || period.status === 'CLOSED') {
      throw TransportDomainError.denied(
        'SETTLEMENT_PERIOD_FROZEN',
        `Ky quyet toan ${period.startDate}..${period.endDate} cua dong ${flow} dang ${period.status}`,
      );
    }
  }

  /* ----------------------------- Chung tu ----------------------------- */

  async recogniseDocument(command: RecogniseDocumentCommand): Promise<SettlementRecognition> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await model(tx, 'transportSettlementDocument').findUnique({
        where: {
          sourceContext_sourceId: {
            sourceContext: command.sourceContext,
            sourceId: command.sourceId,
          },
        },
      });

      if (existing) {
        if (existing.sourceFingerprint !== command.sourceFingerprint) {
          throw TransportDomainError.denied(
            'SETTLEMENT_SOURCE_FINGERPRINT_CONFLICT',
            `Khoa ${command.sourceContext}/${command.sourceId} da ghi voi noi dung khac. ` +
              `Da ghi: ${existing.sourceFingerprint}; dua vao: ${command.sourceFingerprint}`,
          );
        }
        return { document: toDocument(existing), replayed: true };
      }

      await this.assertPeriodWritable(tx, command.flow, command.businessDate);

      const created = await model(tx, 'transportSettlementDocument').create({
        data: {
          direction: command.direction,
          flow: command.flow,
          counterpartyKind: command.counterpartyKind,
          counterpartyId: command.counterpartyId,
          kind: 'ORIGINAL',
          status: 'POSTED',
          signedAmount: toStoredAmount(command.signedAmount),
          currencyCode: command.currencyCode,
          businessDate: command.businessDate,
          dueDate: command.dueDate,
          tripId: command.tripId,
          sourceContext: command.sourceContext,
          sourceId: command.sourceId,
          sourceFingerprint: command.sourceFingerprint,
          adjustsId: null,
          invoiceRef: command.invoiceRef,
          note: command.note,
          recordedBy: command.recordedBy,
        },
      });
      return { document: toDocument(created), replayed: false };
    });
  }

  async correctDocument(
    command: CorrectDocumentCommand,
  ): Promise<{ readonly document: SettlementDocument; readonly replayed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      /*
       * CHONG GHI TRUNG cho ca duong SUA, khong chi duong ghi nhan.
       *
       * Bo qua doan nay se lam mot lan nap lai ban giao cua `TX-04` do o `@@unique` thay vi phat
       * lai — tuc mot duong tich hop chay lai binh thuong bien thanh mot loi 500. Chinh bai `P5`
       * cua bo IT tim ra dieu nay: `recogniseDocument()` co kiem khoa, con `correctDocument()`
       * thi khong, va su khong doi xung do khong co ly do nao bien ho duoc.
       */
      const replay = await model(tx, 'transportSettlementDocument').findUnique({
        where: {
          sourceContext_sourceId: {
            sourceContext: command.sourceContext,
            sourceId: command.sourceId,
          },
        },
      });
      if (replay) {
        if (replay.sourceFingerprint !== command.sourceFingerprint) {
          throw TransportDomainError.denied(
            'SETTLEMENT_SOURCE_FINGERPRINT_CONFLICT',
            `Khoa ${command.sourceContext}/${command.sourceId} da ghi voi noi dung khac. ` +
              `Da ghi: ${replay.sourceFingerprint}; dua vao: ${command.sourceFingerprint}`,
          );
        }
        return { document: toDocument(replay), replayed: true };
      }

      /*
       * KHOA HANG BAN GOC truoc khi doc trang thai cua no. Day la thu giu cho hai lenh sua dong
       * thoi khong the cung thay `POSTED` roi cung ghi.
       */
      await (tx as any)
        .$executeRaw`SELECT "id" FROM "TransportSettlementDocument" WHERE "id" = ${command.targetId} FOR UPDATE`;

      const target = await model(tx, 'transportSettlementDocument').findUnique({
        where: { id: command.targetId },
      });
      if (!target) {
        throw TransportDomainError.notFound(
          'SETTLEMENT_DOCUMENT_NOT_FOUND',
          `Khong thay chung tu ${command.targetId}`,
        );
      }

      if (target.status === 'REVERSED') {
        throw TransportDomainError.denied(
          'SETTLEMENT_TARGET_ALREADY_REVERSED',
          `Chung tu ${target.id} da bi dao`,
        );
      }
      if (!canAdjust({ kind: target.kind, status: target.status })) {
        throw TransportDomainError.denied(
          'SETTLEMENT_TARGET_NOT_ORIGINAL',
          `Chi ban goc moi la dich cua mot ban sua; ${target.id} la ${target.kind}`,
        );
      }

      await this.assertPeriodWritable(tx, target.flow, command.businessDate);

      if (command.kind === 'REVERSAL') {
        const reversed = await model(tx, 'transportSettlementDocument').findFirst({
          where: { adjustsId: target.id, kind: 'REVERSAL' },
        });
        if (reversed) {
          throw TransportDomainError.denied(
            'SETTLEMENT_ALREADY_REVERSED',
            `Chung tu ${target.id} da co mot ban dao`,
          );
        }
      }

      const correction = await model(tx, 'transportSettlementDocument').create({
        data: {
          direction: target.direction,
          flow: target.flow,
          counterpartyKind: target.counterpartyKind,
          counterpartyId: target.counterpartyId,
          kind: command.kind,
          status: 'POSTED',
          signedAmount: toStoredAmount(command.signedAmount),
          currencyCode: target.currencyCode,
          businessDate: command.businessDate,
          dueDate: target.dueDate,
          tripId: target.tripId,
          sourceContext: command.sourceContext,
          sourceId: command.sourceId,
          sourceFingerprint: command.sourceFingerprint,
          adjustsId: target.id,
          invoiceRef: target.invoiceRef,
          note: command.note,
          recordedBy: command.recordedBy,
        },
      });

      // Ban goc GIU NGUYEN moi truong; chi `status` doi, va chi khi bi dao.
      if (command.kind === 'REVERSAL') {
        await model(tx, 'transportSettlementDocument').update({
          where: { id: target.id },
          data: { status: 'REVERSED' },
        });
      }

      return { document: toDocument(correction), replayed: false };
    });
  }

  async allocate(
    command: AllocateCommand,
  ): Promise<{ readonly allocation: SettlementAllocation; readonly replayed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await model(tx, 'transportSettlementAllocation').findUnique({
        where: {
          sourceContext_sourceId: {
            sourceContext: command.sourceContext,
            sourceId: command.sourceId,
          },
        },
      });
      if (existing) return { allocation: toAllocation(existing), replayed: true };

      /*
       * Khoa BAN GOC chu khong khoa hang phan bo: hai lan phan bo dong thoi deu doc so du cua CUNG
       * mot chuoi, va so du do la thu chung tranh. Khoa o hang phan bo se cho ca hai di qua.
       */
      await (tx as any)
        .$executeRaw`SELECT "id" FROM "TransportSettlementDocument" WHERE "id" = ${command.documentId} FOR UPDATE`;

      const original = await model(tx, 'transportSettlementDocument').findUnique({
        where: { id: command.documentId },
      });
      if (!original || original.kind !== 'ORIGINAL') {
        throw TransportDomainError.notFound(
          'SETTLEMENT_DOCUMENT_NOT_FOUND',
          `Khong thay chung tu goc ${command.documentId}`,
        );
      }

      await this.assertPeriodWritable(tx, original.flow, command.businessDate);

      const corrections = await model(tx, 'transportSettlementDocument').findMany({
        where: { adjustsId: original.id },
      });
      const allocations = await model(tx, 'transportSettlementAllocation').findMany({
        where: { documentId: original.id },
      });

      const outstanding = outstandingOf(
        [original, ...corrections].map((doc: any) => ({ signedAmount: amount(doc.signedAmount) })),
        allocations.map((alloc: any) => ({ amount: amount(alloc.amount) })),
      );

      if (command.amount > Math.abs(outstanding)) {
        throw TransportDomainError.denied(
          'SETTLEMENT_ALLOCATION_EXCEEDS_OUTSTANDING',
          `Phan bo ${command.amount} vuot so du con lai ${Math.abs(outstanding)}`,
        );
      }

      const created = await model(tx, 'transportSettlementAllocation').create({
        data: {
          documentId: command.documentId,
          amount: toStoredAmount(command.amount),
          businessDate: command.businessDate,
          method: command.method,
          sourceContext: command.sourceContext,
          sourceId: command.sourceId,
          note: command.note,
          recordedBy: command.recordedBy,
        },
      });
      return { allocation: toAllocation(created), replayed: false };
    });
  }

  async findDocument(id: string): Promise<SettlementDocument | null> {
    const row = await model(this.prisma, 'transportSettlementDocument').findUnique({
      where: { id },
    });
    return row ? toDocument(row) : null;
  }

  async findChain(originalId: string): Promise<SettlementDocumentChain | null> {
    const original = await model(this.prisma, 'transportSettlementDocument').findUnique({
      where: { id: originalId },
    });
    if (!original || original.kind !== 'ORIGINAL') return null;

    const corrections = await model(this.prisma, 'transportSettlementDocument').findMany({
      where: { adjustsId: originalId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const allocations = await model(this.prisma, 'transportSettlementAllocation').findMany({
      where: { documentId: originalId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const documents = [original, ...corrections].map(toDocument);
    const allocated = allocations.map(toAllocation);

    return {
      original: documents[0]!,
      corrections: documents.slice(1),
      allocations: allocated,
      grossAmount: documents.reduce((total, doc) => total + doc.signedAmount, 0),
      outstandingAmount: outstandingOf(documents, allocated),
    };
  }

  private whereFrom(query: DocumentQuery): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (query.direction) where.direction = query.direction;
    if (query.flow) where.flow = query.flow;
    if (query.counterpartyId) where.counterpartyId = query.counterpartyId;
    if (query.tripId) where.tripId = query.tripId;
    if (query.originalsOnly) where.kind = 'ORIGINAL';
    return where;
  }

  async listDocuments(query: DocumentQuery): Promise<SettlementDocument[]> {
    const rows = await model(this.prisma, 'transportSettlementDocument').findMany({
      where: this.whereFrom(query),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDocument);
  }

  /**
   * Doc nhieu chuoi bang BA truy van, khong phai `2N+1`.
   *
   * Voi mot khach ~10 xe thi N nho, nhung bao cao tuoi no chay tren MOI chung tu chua tat toan cua
   * moi khach — va do la tap lon dan theo thoi gian chu khong theo so xe.
   */
  async listChains(query: DocumentQuery): Promise<SettlementDocumentChain[]> {
    const originals = await this.listDocuments({ ...query, originalsOnly: true });
    if (originals.length === 0) return [];

    const ids = originals.map((doc) => doc.id);

    const correctionRows = await model(this.prisma, 'transportSettlementDocument').findMany({
      where: { adjustsId: { in: ids } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const allocationRows = await model(this.prisma, 'transportSettlementAllocation').findMany({
      where: { documentId: { in: ids } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const correctionsBy = new Map<string, SettlementDocument[]>();
    for (const row of correctionRows) {
      const doc = toDocument(row);
      const bucket = correctionsBy.get(doc.adjustsId!) ?? [];
      bucket.push(doc);
      correctionsBy.set(doc.adjustsId!, bucket);
    }

    const allocationsBy = new Map<string, SettlementAllocation[]>();
    for (const row of allocationRows) {
      const alloc = toAllocation(row);
      const bucket = allocationsBy.get(alloc.documentId) ?? [];
      bucket.push(alloc);
      allocationsBy.set(alloc.documentId, bucket);
    }

    return originals.map((original) => {
      const corrections = correctionsBy.get(original.id) ?? [];
      const allocations = allocationsBy.get(original.id) ?? [];
      const documents = [original, ...corrections];
      return {
        original,
        corrections,
        allocations,
        grossAmount: documents.reduce((total, doc) => total + doc.signedAmount, 0),
        outstandingAmount: outstandingOf(documents, allocations),
      };
    });
  }

  /* ------------------------------- Ky ------------------------------- */

  async openPeriod(input: {
    readonly flow: SettlementFlow;
    readonly startDate: BusinessDate;
    readonly endDate: BusinessDate;
  }): Promise<SettlementPeriod> {
    try {
      const row = await model(this.prisma, 'transportSettlementPeriod').create({
        data: { flow: input.flow, startDate: input.startDate, endDate: input.endDate },
      });
      return toPeriod(row);
    } catch (error) {
      /*
       * EXCLUDE constraint cua Postgres la thu DUY NHAT dung khi hai nguoi mo ky cung luc. Prisma
       * khong co ma rieng cho no nen bat theo ten rang buoc trong thong diep — kem hon `P2002`,
       * nhung day la kenh duy nhat Postgres phoi ra cho EXCLUDE.
       */
      if (String(error).includes('TransportSettlementPeriod_no_overlap')) {
        throw TransportDomainError.denied(
          'SETTLEMENT_PERIOD_OVERLAP',
          `Ky ${input.startDate}..${input.endDate} chong lap mot ky da co cua dong ${input.flow}`,
        );
      }
      throw error;
    }
  }

  private static readonly EDGES: Readonly<
    Record<SettlementPeriodStatus, readonly SettlementPeriodStatus[]>
  > = {
    OPEN: ['CLOSING'],
    CLOSING: ['CLOSED', 'OPEN'],
    CLOSED: ['REOPENED'],
    REOPENED: ['CLOSING'],
  };

  async transitionPeriod(input: {
    readonly periodId: string;
    readonly to: SettlementPeriodStatus;
    readonly actor: string;
    readonly reason: string | null;
  }): Promise<SettlementPeriod> {
    return this.prisma.$transaction(async (tx) => {
      await (tx as any)
        .$executeRaw`SELECT "id" FROM "TransportSettlementPeriod" WHERE "id" = ${input.periodId} FOR UPDATE`;

      const period = await model(tx, 'transportSettlementPeriod').findUnique({
        where: { id: input.periodId },
      });
      if (!period) {
        throw TransportDomainError.notFound(
          'SETTLEMENT_PERIOD_NOT_FOUND',
          `Khong thay ky ${input.periodId}`,
        );
      }
      if (period.status === input.to) {
        throw TransportDomainError.denied(
          'SETTLEMENT_PERIOD_ALREADY_IN_STATE',
          `Ky da o trang thai ${input.to}`,
        );
      }
      const edges = PrismaSettlementRepository.EDGES[period.status as SettlementPeriodStatus];
      if (!edges.includes(input.to)) {
        throw TransportDomainError.denied(
          'SETTLEMENT_PERIOD_TRANSITION_NOT_PERMITTED',
          `Khong co canh ${period.status} -> ${input.to}`,
        );
      }

      const now = new Date();
      const updated = await model(tx, 'transportSettlementPeriod').update({
        where: { id: input.periodId },
        data: {
          status: input.to,
          ...(input.to === 'CLOSED' ? { closedAt: now, closedBy: input.actor } : {}),
          ...(input.to === 'REOPENED'
            ? { reopenedAt: now, reopenedBy: input.actor, reopenReason: input.reason }
            : {}),
        },
      });
      return toPeriod(updated);
    });
  }

  async findPeriod(id: string): Promise<SettlementPeriod | null> {
    const row = await model(this.prisma, 'transportSettlementPeriod').findUnique({ where: { id } });
    return row ? toPeriod(row) : null;
  }

  async findPeriodCovering(
    flow: SettlementFlow,
    businessDate: BusinessDate,
  ): Promise<SettlementPeriod | null> {
    const row = await model(this.prisma, 'transportSettlementPeriod').findFirst({
      where: { flow, startDate: { lte: businessDate }, endDate: { gte: businessDate } },
    });
    return row ? toPeriod(row) : null;
  }

  async listPeriods(flow?: SettlementFlow): Promise<SettlementPeriod[]> {
    const rows = await model(this.prisma, 'transportSettlementPeriod').findMany({
      where: flow ? { flow } : {},
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toPeriod);
  }

  /* ---------------------------- Dieu khoan ---------------------------- */

  async upsertCustomerTerms(input: {
    readonly customerId: string;
    readonly paymentTermDays: number;
    readonly creditLimit: number | null;
    readonly currencyCode: string;
    readonly updatedBy: string;
  }): Promise<CustomerSettlementTerms> {
    const data = {
      paymentTermDays: input.paymentTermDays,
      creditLimit: toStoredAmount(input.creditLimit),
      currencyCode: input.currencyCode,
      updatedBy: input.updatedBy,
    };
    const row = await model(this.prisma, 'transportCustomerTerms').upsert({
      where: { customerId: input.customerId },
      create: { customerId: input.customerId, ...data },
      update: data,
    });
    return toTerms(row);
  }

  async findCustomerTerms(customerId: string): Promise<CustomerSettlementTerms | null> {
    const row = await model(this.prisma, 'transportCustomerTerms').findUnique({
      where: { customerId },
    });
    return row ? toTerms(row) : null;
  }

  /* ----------------------------- Hoa hong ----------------------------- */

  async createCommissionRule(input: {
    readonly partnerId: string | null;
    readonly routeKey: string | null;
    readonly createdBy: string;
  }): Promise<CommissionRule> {
    const taken = await this.findCommissionRuleByScope(input.partnerId, input.routeKey);
    if (taken) {
      throw TransportDomainError.denied(
        'COMMISSION_RULE_SCOPE_TAKEN',
        `Pham vi (doi tac=${input.partnerId ?? '*'}, tuyen=${input.routeKey ?? '*'}) da co luat ${taken.id}`,
      );
    }
    const row = await model(this.prisma, 'transportCommissionRule').create({
      data: { partnerId: input.partnerId, routeKey: input.routeKey, createdBy: input.createdBy },
    });
    return toRule(row);
  }

  async publishCommissionRuleVersion(input: {
    readonly ruleId: string;
    readonly calcKind: CommissionCalcKind;
    readonly rateBasisPoints: number | null;
    readonly fixedAmount: number | null;
    readonly effectiveFrom: BusinessDate;
    readonly effectiveTo: BusinessDate | null;
    readonly publishedBy: string;
  }): Promise<CommissionRuleVersion> {
    return this.prisma.$transaction(async (tx) => {
      /*
       * Khoa hang LUAT truoc khi dem so ban. Hai lan cong bo dong thoi cung doc `max(version)` se
       * cung nham toi mot so, va mot trong hai do o `@@unique([ruleId, version])` — tuc mot lan
       * cong bo hop le that bai vi mot ly do khong lien quan gi den noi dung cua no.
       */
      await (tx as any)
        .$executeRaw`SELECT "id" FROM "TransportCommissionRule" WHERE "id" = ${input.ruleId} FOR UPDATE`;

      const rule = await model(tx, 'transportCommissionRule').findUnique({
        where: { id: input.ruleId },
      });
      if (!rule) {
        throw TransportDomainError.notFound(
          'COMMISSION_RULE_NOT_FOUND',
          `Khong thay luat ${input.ruleId}`,
        );
      }

      const latest = await model(tx, 'transportCommissionRuleVersion').findFirst({
        where: { ruleId: input.ruleId },
        orderBy: { version: 'desc' },
      });

      const row = await model(tx, 'transportCommissionRuleVersion').create({
        data: {
          ruleId: input.ruleId,
          version: (latest?.version ?? 0) + 1,
          calcKind: input.calcKind,
          rateBasisPoints: input.rateBasisPoints,
          fixedAmount: toStoredAmount(input.fixedAmount),
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          publishedBy: input.publishedBy,
        },
      });
      return toRuleVersion(row);
    });
  }

  async findCommissionRule(id: string): Promise<CommissionRule | null> {
    const row = await model(this.prisma, 'transportCommissionRule').findUnique({ where: { id } });
    return row ? toRule(row) : null;
  }

  async findCommissionRuleByScope(
    partnerId: string | null,
    routeKey: string | null,
  ): Promise<CommissionRule | null> {
    const row = await model(this.prisma, 'transportCommissionRule').findFirst({
      where: { partnerId, routeKey },
    });
    return row ? toRule(row) : null;
  }

  async listCommissionCandidates(
    partnerId: string,
    routeKey: string,
  ): Promise<CommissionCandidateRow[]> {
    const rules = await model(this.prisma, 'transportCommissionRule').findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ partnerId }, { partnerId: null }],
        AND: [{ OR: [{ routeKey }, { routeKey: null }] }],
      },
      include: { versions: true },
    });

    return rules.flatMap((rule: any) =>
      rule.versions.map((version: any) => ({
        ...toRuleVersion(version),
        partnerId: rule.partnerId,
        routeKey: rule.routeKey,
      })),
    );
  }

  async recordCommission(command: RecordCommissionCommand): Promise<{
    readonly calculation: CommissionCalculation;
    readonly document: SettlementDocument;
    readonly replayed: boolean;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await model(tx, 'transportCommissionCalculation').findUnique({
        where: { tripId: command.tripId },
        include: { document: true },
      });
      if (existing) {
        if (!existing.document) {
          throw TransportDomainError.notFound(
            'SETTLEMENT_DOCUMENT_NOT_FOUND',
            `Anh chup hoa hong cua chuyen ${command.tripId} tro toi mot chung tu khong con`,
          );
        }
        return {
          calculation: toCommission(existing),
          document: toDocument(existing.document),
          replayed: true,
        };
      }

      const doc = command.document;
      const already = await model(tx, 'transportSettlementDocument').findUnique({
        where: {
          sourceContext_sourceId: { sourceContext: doc.sourceContext, sourceId: doc.sourceId },
        },
      });
      if (already && already.sourceFingerprint !== doc.sourceFingerprint) {
        throw TransportDomainError.denied(
          'SETTLEMENT_SOURCE_FINGERPRINT_CONFLICT',
          `Khoa ${doc.sourceContext}/${doc.sourceId} da ghi voi noi dung khac`,
        );
      }

      await this.assertPeriodWritable(tx, doc.flow, doc.businessDate);

      const document =
        already ??
        (await model(tx, 'transportSettlementDocument').create({
          data: {
            direction: doc.direction,
            flow: doc.flow,
            counterpartyKind: doc.counterpartyKind,
            counterpartyId: doc.counterpartyId,
            kind: 'ORIGINAL',
            status: 'POSTED',
            signedAmount: toStoredAmount(doc.signedAmount),
            currencyCode: doc.currencyCode,
            businessDate: doc.businessDate,
            dueDate: doc.dueDate,
            tripId: doc.tripId,
            sourceContext: doc.sourceContext,
            sourceId: doc.sourceId,
            sourceFingerprint: doc.sourceFingerprint,
            adjustsId: null,
            invoiceRef: doc.invoiceRef,
            note: doc.note,
            recordedBy: doc.recordedBy,
          },
        }));

      const calculation = await model(tx, 'transportCommissionCalculation').create({
        data: {
          tripId: command.tripId,
          ruleVersionId: command.ruleVersionId,
          ruleScopeSnapshot: command.ruleScopeSnapshot,
          calcKindSnapshot: command.calcKindSnapshot,
          rateBasisPointsSnapshot: command.rateBasisPointsSnapshot,
          fixedAmountSnapshot: toStoredAmount(command.fixedAmountSnapshot),
          basisAmount: toStoredAmount(command.basisAmount),
          rawAmount: command.rawAmount,
          resultAmount: toStoredAmount(command.resultAmount),
          documentId: document.id,
          partnerId: command.partnerId,
          businessDate: command.businessDate,
        },
      });

      return {
        calculation: toCommission(calculation),
        document: toDocument(document),
        replayed: Boolean(already),
      };
    });
  }

  async findCommissionByTrip(tripId: string): Promise<CommissionCalculation | null> {
    const row = await model(this.prisma, 'transportCommissionCalculation').findUnique({
      where: { tripId },
    });
    return row ? toCommission(row) : null;
  }
}
