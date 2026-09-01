import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
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

/**
 * KHO TRONG BO NHO cua `transport-settlement` — duong chay mac dinh (`PERSISTENCE=memory`).
 *
 * ===========================================================================
 * BAN NAY PHAI TRA LOI GIONG BAN PRISMA, KE CA O DUONG TU CHOI.
 *
 * Neu hai ban lech nhau thi bo test chay o `PERSISTENCE=memory` se xanh trong khi he that do — va
 * cai lech do luon lo ra o dung cho dat nhat: mot cong nghiep vu dong o mot ban, mo o ban kia.
 *
 * MOT DIEU KHONG THE MO PHONG: tinh nguyen tu THAT. O day chi co mot tien trinh Node va cac buoc
 * "doc roi ghi" duoi day khong co `await` chen giua, nen chung nguyen tu MOT CACH TINH CO. Ban
 * Prisma phai dat duoc dieu do bang giao dich va khoa hang. Do la ly do cac bai chung minh tranh
 * chap cua `TX-05` chay tren Postgres THAT chu khong tren ban nay.
 */
@Injectable()
export class InMemorySettlementRepository extends SettlementRepository {
  private readonly documents = new Map<string, SettlementDocument>();
  private readonly allocations = new Map<string, SettlementAllocation>();
  private readonly periods = new Map<string, SettlementPeriod>();
  private readonly terms = new Map<string, CustomerSettlementTerms>();
  private readonly rules = new Map<string, CommissionRule>();
  private readonly ruleVersions = new Map<string, CommissionRuleVersion>();
  private readonly commissions = new Map<string, CommissionCalculation>();

  private now(): string {
    return new Date().toISOString();
  }

  /* ----------------------------- Chung tu ----------------------------- */

  /**
   * Ky DONG BANG chan moi lan ghi co ngay nghiep vu roi vao no.
   *
   * `CLOSING` chan giong `CLOSED`: mot ky dang chot ma van nhan chung tu moi se lam con so vua
   * chup khac con so luc bao cao — dung bai hoc `fund-period` cua `TX-03`.
   */
  private assertPeriodWritable(flow: SettlementFlow, businessDate: BusinessDate): void {
    const period = [...this.periods.values()].find(
      (candidate) =>
        candidate.flow === flow &&
        candidate.startDate <= businessDate &&
        businessDate <= candidate.endDate,
    );
    if (!period) return;
    if (period.status === 'CLOSING' || period.status === 'CLOSED') {
      throw TransportDomainError.denied(
        'SETTLEMENT_PERIOD_FROZEN',
        `Ky quyet toan ${period.startDate}..${period.endDate} cua dong ${flow} dang ${period.status}`,
      );
    }
  }

  async recogniseDocument(command: RecogniseDocumentCommand): Promise<SettlementRecognition> {
    const existing = [...this.documents.values()].find(
      (doc) => doc.sourceContext === command.sourceContext && doc.sourceId === command.sourceId,
    );

    if (existing) {
      if (existing.sourceFingerprint !== command.sourceFingerprint) {
        throw TransportDomainError.denied(
          'SETTLEMENT_SOURCE_FINGERPRINT_CONFLICT',
          `Khoa ${command.sourceContext}/${command.sourceId} da ghi voi noi dung khac. ` +
            `Da ghi: ${existing.sourceFingerprint}; dua vao: ${command.sourceFingerprint}`,
        );
      }
      return { document: existing, replayed: true };
    }

    this.assertPeriodWritable(command.flow, command.businessDate);

    const document: SettlementDocument = {
      id: randomUUID(),
      direction: command.direction,
      flow: command.flow,
      counterpartyKind: command.counterpartyKind,
      counterpartyId: command.counterpartyId,
      kind: 'ORIGINAL',
      status: 'POSTED',
      signedAmount: command.signedAmount,
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
      createdAt: this.now(),
    };
    this.documents.set(document.id, document);
    return { document, replayed: false };
  }

  async correctDocument(
    command: CorrectDocumentCommand,
  ): Promise<{ readonly document: SettlementDocument; readonly replayed: boolean }> {
    /*
     * CHONG GHI TRUNG cho ca duong SUA — xem chu thich cung cho o ban Prisma. Hai ban phai tra loi
     * giong nhau, ke ca o duong phat lai.
     */
    const replay = [...this.documents.values()].find(
      (doc) => doc.sourceContext === command.sourceContext && doc.sourceId === command.sourceId,
    );
    if (replay) {
      if (replay.sourceFingerprint !== command.sourceFingerprint) {
        throw TransportDomainError.denied(
          'SETTLEMENT_SOURCE_FINGERPRINT_CONFLICT',
          `Khoa ${command.sourceContext}/${command.sourceId} da ghi voi noi dung khac. ` +
            `Da ghi: ${replay.sourceFingerprint}; dua vao: ${command.sourceFingerprint}`,
        );
      }
      return { document: replay, replayed: true };
    }

    const target = this.documents.get(command.targetId);
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
    if (!canAdjust(target)) {
      throw TransportDomainError.denied(
        'SETTLEMENT_TARGET_NOT_ORIGINAL',
        `Chi ban goc moi la dich cua mot ban sua; ${target.id} la ${target.kind}`,
      );
    }

    this.assertPeriodWritable(target.flow, command.businessDate);

    if (command.kind === 'REVERSAL') {
      const alreadyReversed = [...this.documents.values()].some(
        (doc) => doc.adjustsId === target.id && doc.kind === 'REVERSAL',
      );
      if (alreadyReversed) {
        throw TransportDomainError.denied(
          'SETTLEMENT_ALREADY_REVERSED',
          `Chung tu ${target.id} da co mot ban dao`,
        );
      }
    }

    const correction: SettlementDocument = {
      ...target,
      id: randomUUID(),
      kind: command.kind,
      status: 'POSTED',
      signedAmount: command.signedAmount,
      businessDate: command.businessDate,
      sourceContext: command.sourceContext,
      sourceId: command.sourceId,
      sourceFingerprint: command.sourceFingerprint,
      adjustsId: target.id,
      note: command.note,
      recordedBy: command.recordedBy,
      createdAt: this.now(),
    };
    this.documents.set(correction.id, correction);

    // Ban goc GIU NGUYEN moi truong; chi `status` doi, va chi khi bi dao.
    if (command.kind === 'REVERSAL') {
      this.documents.set(target.id, { ...target, status: 'REVERSED' });
    }

    return { document: correction, replayed: false };
  }

  async allocate(
    command: AllocateCommand,
  ): Promise<{ readonly allocation: SettlementAllocation; readonly replayed: boolean }> {
    const existing = [...this.allocations.values()].find(
      (alloc) =>
        alloc.sourceContext === command.sourceContext && alloc.sourceId === command.sourceId,
    );
    if (existing) return { allocation: existing, replayed: true };

    const chain = await this.findChain(command.documentId);
    if (!chain) {
      throw TransportDomainError.notFound(
        'SETTLEMENT_DOCUMENT_NOT_FOUND',
        `Khong thay chung tu ${command.documentId}`,
      );
    }

    this.assertPeriodWritable(chain.original.flow, command.businessDate);

    if (command.amount > Math.abs(chain.outstandingAmount)) {
      throw TransportDomainError.denied(
        'SETTLEMENT_ALLOCATION_EXCEEDS_OUTSTANDING',
        `Phan bo ${command.amount} vuot so du con lai ${Math.abs(chain.outstandingAmount)}`,
      );
    }

    const allocation: SettlementAllocation = {
      id: randomUUID(),
      documentId: command.documentId,
      amount: command.amount,
      businessDate: command.businessDate,
      method: command.method,
      sourceContext: command.sourceContext,
      sourceId: command.sourceId,
      note: command.note,
      recordedBy: command.recordedBy,
      createdAt: this.now(),
    };
    this.allocations.set(allocation.id, allocation);
    return { allocation, replayed: false };
  }

  async findDocument(id: string): Promise<SettlementDocument | null> {
    return this.documents.get(id) ?? null;
  }

  async findChain(originalId: string): Promise<SettlementDocumentChain | null> {
    const original = this.documents.get(originalId);
    if (!original || original.kind !== 'ORIGINAL') return null;

    const corrections = [...this.documents.values()]
      .filter((doc) => doc.adjustsId === originalId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const allocations = [...this.allocations.values()]
      .filter((alloc) => alloc.documentId === originalId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const all = [original, ...corrections];
    return {
      original,
      corrections,
      allocations,
      grossAmount: all.reduce((total, doc) => total + doc.signedAmount, 0),
      outstandingAmount: outstandingOf(all, allocations),
    };
  }

  private matches(doc: SettlementDocument, query: DocumentQuery): boolean {
    if (query.direction && doc.direction !== query.direction) return false;
    if (query.flow && doc.flow !== query.flow) return false;
    if (query.counterpartyId && doc.counterpartyId !== query.counterpartyId) return false;
    if (query.tripId && doc.tripId !== query.tripId) return false;
    if (query.originalsOnly && doc.kind !== 'ORIGINAL') return false;
    return true;
  }

  async listDocuments(query: DocumentQuery): Promise<SettlementDocument[]> {
    return [...this.documents.values()]
      .filter((doc) => this.matches(doc, query))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listChains(query: DocumentQuery): Promise<SettlementDocumentChain[]> {
    const originals = await this.listDocuments({ ...query, originalsOnly: true });
    const chains: SettlementDocumentChain[] = [];
    for (const original of originals) {
      const chain = await this.findChain(original.id);
      if (chain) chains.push(chain);
    }
    return chains;
  }

  /* ------------------------------- Ky ------------------------------- */

  async openPeriod(input: {
    readonly flow: SettlementFlow;
    readonly startDate: BusinessDate;
    readonly endDate: BusinessDate;
  }): Promise<SettlementPeriod> {
    const overlap = [...this.periods.values()].find(
      (period) =>
        period.flow === input.flow &&
        period.startDate <= input.endDate &&
        input.startDate <= period.endDate,
    );
    if (overlap) {
      throw TransportDomainError.denied(
        'SETTLEMENT_PERIOD_OVERLAP',
        `Ky moi chong lap ky ${overlap.startDate}..${overlap.endDate} cua dong ${input.flow}`,
      );
    }

    const period: SettlementPeriod = {
      id: randomUUID(),
      flow: input.flow,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.periods.set(period.id, period);
    return period;
  }

  /**
   * MAY TRANG THAI ky quyet toan — cung hinh dang voi `fund-period.ts` cua `TX-03`.
   *
   * `REOPENED` KHONG quay ve `OPEN`: hai trang thai do noi hai dieu khac nhau, va mot ky
   * `REOPENED` la ky DA TUNG duoc bao cao ra ngoai.
   */
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
    const period = this.periods.get(input.periodId);
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
    if (!InMemorySettlementRepository.EDGES[period.status].includes(input.to)) {
      throw TransportDomainError.denied(
        'SETTLEMENT_PERIOD_TRANSITION_NOT_PERMITTED',
        `Khong co canh ${period.status} -> ${input.to}`,
      );
    }

    const next: SettlementPeriod = {
      ...period,
      status: input.to,
      closedAt: input.to === 'CLOSED' ? this.now() : period.closedAt,
      closedBy: input.to === 'CLOSED' ? input.actor : period.closedBy,
      reopenedAt: input.to === 'REOPENED' ? this.now() : period.reopenedAt,
      reopenedBy: input.to === 'REOPENED' ? input.actor : period.reopenedBy,
      reopenReason: input.to === 'REOPENED' ? input.reason : period.reopenReason,
      updatedAt: this.now(),
    };
    this.periods.set(next.id, next);
    return next;
  }

  async findPeriod(id: string): Promise<SettlementPeriod | null> {
    return this.periods.get(id) ?? null;
  }

  async findPeriodCovering(
    flow: SettlementFlow,
    businessDate: BusinessDate,
  ): Promise<SettlementPeriod | null> {
    return (
      [...this.periods.values()].find(
        (period) =>
          period.flow === flow && period.startDate <= businessDate && businessDate <= period.endDate,
      ) ?? null
    );
  }

  async listPeriods(flow?: SettlementFlow): Promise<SettlementPeriod[]> {
    return [...this.periods.values()]
      .filter((period) => !flow || period.flow === flow)
      .sort((left, right) => left.startDate.localeCompare(right.startDate));
  }

  /* ---------------------------- Dieu khoan ---------------------------- */

  async upsertCustomerTerms(input: {
    readonly customerId: string;
    readonly paymentTermDays: number;
    readonly creditLimit: number | null;
    readonly currencyCode: string;
    readonly updatedBy: string;
  }): Promise<CustomerSettlementTerms> {
    const existing = this.terms.get(input.customerId);
    const next: CustomerSettlementTerms = {
      customerId: input.customerId,
      paymentTermDays: input.paymentTermDays,
      creditLimit: input.creditLimit,
      currencyCode: input.currencyCode,
      updatedBy: input.updatedBy,
      createdAt: existing?.createdAt ?? this.now(),
      updatedAt: this.now(),
    };
    this.terms.set(next.customerId, next);
    return next;
  }

  async findCustomerTerms(customerId: string): Promise<CustomerSettlementTerms | null> {
    return this.terms.get(customerId) ?? null;
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

    const rule: CommissionRule = {
      id: randomUUID(),
      partnerId: input.partnerId,
      routeKey: input.routeKey,
      status: 'ACTIVE',
      createdBy: input.createdBy,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.rules.set(rule.id, rule);
    return rule;
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
    if (!this.rules.has(input.ruleId)) {
      throw TransportDomainError.notFound(
        'COMMISSION_RULE_NOT_FOUND',
        `Khong thay luat ${input.ruleId}`,
      );
    }

    const nextVersion =
      [...this.ruleVersions.values()]
        .filter((version) => version.ruleId === input.ruleId)
        .reduce((max, version) => Math.max(max, version.version), 0) + 1;

    const version: CommissionRuleVersion = {
      id: randomUUID(),
      ruleId: input.ruleId,
      version: nextVersion,
      calcKind: input.calcKind,
      rateBasisPoints: input.rateBasisPoints,
      fixedAmount: input.fixedAmount,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      publishedAt: this.now(),
      publishedBy: input.publishedBy,
    };
    this.ruleVersions.set(version.id, version);
    return version;
  }

  async findCommissionRule(id: string): Promise<CommissionRule | null> {
    return this.rules.get(id) ?? null;
  }

  async findCommissionRuleByScope(
    partnerId: string | null,
    routeKey: string | null,
  ): Promise<CommissionRule | null> {
    return (
      [...this.rules.values()].find(
        (rule) => rule.partnerId === partnerId && rule.routeKey === routeKey,
      ) ?? null
    );
  }

  async listCommissionCandidates(
    partnerId: string,
    routeKey: string,
  ): Promise<CommissionCandidateRow[]> {
    const scoped = [...this.rules.values()].filter(
      (rule) =>
        rule.status === 'ACTIVE' &&
        (rule.partnerId === null || rule.partnerId === partnerId) &&
        (rule.routeKey === null || rule.routeKey === routeKey),
    );

    return scoped.flatMap((rule) =>
      [...this.ruleVersions.values()]
        .filter((version) => version.ruleId === rule.id)
        .map((version) => ({ ...version, partnerId: rule.partnerId, routeKey: rule.routeKey })),
    );
  }

  async recordCommission(command: RecordCommissionCommand): Promise<{
    readonly calculation: CommissionCalculation;
    readonly document: SettlementDocument;
    readonly replayed: boolean;
  }> {
    const existing = this.commissions.get(command.tripId);
    if (existing) {
      const document = existing.documentId ? this.documents.get(existing.documentId) : undefined;
      if (!document) {
        throw TransportDomainError.notFound(
          'SETTLEMENT_DOCUMENT_NOT_FOUND',
          `Anh chup hoa hong cua chuyen ${command.tripId} tro toi mot chung tu khong con`,
        );
      }
      return { calculation: existing, document, replayed: true };
    }

    const { document, replayed } = await this.recogniseDocument(command.document);

    const calculation: CommissionCalculation = {
      id: randomUUID(),
      tripId: command.tripId,
      ruleVersionId: command.ruleVersionId,
      ruleScopeSnapshot: command.ruleScopeSnapshot,
      calcKindSnapshot: command.calcKindSnapshot,
      rateBasisPointsSnapshot: command.rateBasisPointsSnapshot,
      fixedAmountSnapshot: command.fixedAmountSnapshot,
      basisAmount: command.basisAmount,
      rawAmount: command.rawAmount,
      resultAmount: command.resultAmount,
      documentId: document.id,
      partnerId: command.partnerId,
      businessDate: command.businessDate,
      createdAt: this.now(),
    };
    this.commissions.set(calculation.tripId, calculation);
    return { calculation, document, replayed };
  }

  async findCommissionByTrip(tripId: string): Promise<CommissionCalculation | null> {
    return this.commissions.get(tripId) ?? null;
  }
}
