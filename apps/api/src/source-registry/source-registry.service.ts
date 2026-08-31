import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TelemetryService } from '../observability/telemetry.service.js';
import {
  CommittedStateChanges,
  type StateChangeEvent,
} from './committed-state-changes.js';
import { SourceRegistryError } from './source-registry.error.js';
import { SOURCE_REGISTRY_DECISIONS } from './source-registry-decisions.js';
import {
  evaluateApproval,
  evaluateSourceSupersession,
  evaluateSourceTransition,
  INITIAL_SOURCE_STATUS,
  type ApprovalLevel,
  type DataClassification,
  type SourceAuthority,
  type SourceOrigin,
  type SourceStatus,
} from './source-lifecycle.js';
import {
  evaluateFactSupersession,
  evaluateFactTransition,
  type FactStatus,
  type WorkingAssumptionEvidence,
} from './fact-lifecycle.js';
import {
  evaluateConflictResolution,
  INITIAL_CONFLICT_STATUS,
  type ConflictImpact,
} from './conflict-lifecycle.js';
import { SourceRegistryRepository } from './source-registry.repository.js';
import { assertWithinScope, type TenantScope } from './tenant-scope.js';
import type {
  BusinessConflictRecord,
  BusinessFactRecord,
  BusinessSourceRecord,
} from './source-registry.types.js';

/**
 * DICH VU NGUON SU THAT — API CHUNG cho moi khach, moi vertical.
 *
 * Bat bien lon nhat cua tep nay: KHONG mot nhanh nao re theo ten khach hay ten mien. Ban chung
 * minh cua Ultty (bang gia thang 07 bi thang 08 thay the) va ban chung minh cua van tai (hai dieu
 * khoan doi soat mau thuan) goi DUNG nhung ham duoi day, voi dung nhung tham so kieu do. Neu mot
 * ngay nao do o day xuat hien `if (tenant === ...)`, thi tang nay da thoi la nen tang.
 *
 * Ranh gioi voi tang quyet dinh: MOI cong o day deu uy quyen cho mot ham THUAN trong
 * `*-lifecycle.ts` roi ghi lai ket qua bang `telemetry.decision()`. Dich vu nay khong tu nghi ra
 * luat nao ca — no noi cac luat lai voi kho va voi so nhat ky.
 */
@Injectable()
export class SourceRegistryService {
  constructor(
    private readonly repository: SourceRegistryRepository,
    @Optional() private readonly telemetry?: TelemetryService,
    /** Co mat = dang chay TRONG mot giao dich. Chi `atomic()` dat no, Nest khong tiem. */
    @Optional() private readonly pendingStateChanges?: CommittedStateChanges,
  ) {}

  /**
   * Chay mot THAO TAC NGHIEP VU nhu mot don vi: mo giao dich o kho, roi dung mot ban sao cua
   * chinh dich vu nay noi vao kho giao dich do.
   *
   * Vi sao phai tao mot `SourceRegistryService` moi thay vi truyen kho xuong tung loi goi: mot
   * thao tac nghiep vu o day khong phai vai cau ghi roi rac, no goi lai chinh cac cong cua tang
   * nay (`transitionSource`, `makeSourceEffective`). Neu chi doi rieng cac loi goi `repository.*`
   * thi nhung cong do van chay tren kho NGOAI giao dich, va ta co mot giao dich chi bao ve duoc
   * mot nua so ghi — te hon la khong co giao dich, vi no trong nhu da an toan.
   */
  private async atomic<T>(operation: (tx: SourceRegistryService) => Promise<T>): Promise<T> {
    // TAI NHAP: da o trong mot giao dich thi dung CHINH bo dem cua no va de lop ngoai cung day
    // ra. Lop trong tu day = mot thao tac long nhau ghi nhat ky truoc khi giao dich dong lai.
    if (this.pendingStateChanges) {
      return this.repository.runInTransaction((repository) =>
        operation(new SourceRegistryService(repository, this.telemetry, this.pendingStateChanges)),
      );
    }

    const committed = new CommittedStateChanges();
    const result = await this.repository.runInTransaction((repository) =>
      operation(new SourceRegistryService(repository, this.telemetry, committed)),
    );
    // Chi toi day. `runInTransaction` nem ra thi dong nay khong chay va bo dem di theo rac —
    // khong bat loi de "don dep", vi khong day ra chinh la hanh vi dung.
    committed.flush(this.telemetry);
    return result;
  }

  /** Chuyen trang thai: phat ngay neu ngoai giao dich, cho commit neu dang trong. */
  private emitStateChange(event: StateChangeEvent): void {
    if (this.pendingStateChanges) {
      this.pendingStateChanges.record(event);
      return;
    }
    this.telemetry?.stateChange(event);
  }

  /**
   * SHA-256 cua noi dung. La cach duy nhat chung minh "van la ban do" ma KHONG giu ban sao trong
   * repo — nen no la ham nen mong cua ca giao thuc kho rieng.
   */
  static hashContent(bytes: Buffer | string): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  /* ---------------------------------------------------------------- *
   * Nguon
   * ---------------------------------------------------------------- */

  /**
   * Dang ky mot ban nguon.
   *
   * CUNG TEN + KHAC HASH = BAN KHAC. Ham nay khong bao gio ghi de ban da co: neu hash trung thi
   * tra lai chinh ban do (dang ky lai la thao tac vo hai), neu hash khac thi sinh mot ban MOI.
   * Do la ly do `sourceKey` va `contentHash` cung nam trong khoa duy nhat.
   */
  async registerSource(
    scope: TenantScope,
    input: {
      readonly sourceKey: string;
      readonly title: string;
      readonly kind: string;
      readonly version: string;
      readonly origin: SourceOrigin;
      readonly authority: SourceAuthority;
      readonly classification: DataClassification;
      readonly locator?: string | null;
      readonly contentHash?: string | null;
      readonly byteSize?: number | null;
      readonly receivedAt?: Date;
      readonly note?: string | null;
    },
  ): Promise<BusinessSourceRecord> {
    if (input.contentHash) {
      const existing = await this.repository.findSourceByHash(
        scope,
        input.sourceKey,
        input.contentHash,
      );
      if (existing) return existing;
    }

    const created = await this.repository.createSource(scope, {
      sourceKey: input.sourceKey,
      title: input.title,
      kind: input.kind,
      version: input.version,
      origin: input.origin,
      authority: input.authority,
      classification: input.classification,
      status: INITIAL_SOURCE_STATUS,
      locator: input.locator ?? null,
      contentHash: input.contentHash ?? null,
      byteSize: input.byteSize ?? null,
      receivedAt: input.receivedAt ?? new Date(),
      effectiveFrom: null,
      effectiveTo: null,
      supersedesId: null,
      note: input.note ?? null,
    });

    this.emitStateChange({
      entity: 'business_source',
      entityId: created.id,
      from: null,
      to: created.status,
      reason: 'SOURCE_REGISTERED',
    });
    return created;
  }

  /**
   * Ghi mot lan PHE DUYET va, neu duoc, day nguon sang `APPROVED`.
   *
   * Day la cho "ban test noi bo ≠ khach xac nhan" duoc thi hanh o runtime. Mot nguon
   * `INTERNAL_TEST` van di qua duoc ham nay — nhung chi voi `level = INTERNAL_ACCEPTED`, va ban
   * ghi phe duyet mang mai nhan do.
   */
  async approveSource(
    scope: TenantScope,
    sourceId: string,
    input: {
      readonly level: ApprovalLevel;
      readonly actor: string;
      readonly evidenceRef: string;
      readonly note?: string | null;
    },
  ): Promise<{ readonly source: BusinessSourceRecord; readonly approvalId: string }> {
    // MOT DON VI: ban ghi phe duyet va lan chuyen trang thai cung song hoac cung khong. Neu tach
    // hai, mot lan duyet THAT BAI van de lai ban ghi phe duyet, va lan sau `transitionSource` doc
    // `listApprovals()` khong rong nen ket luan da co nguoi duyet.
    return this.atomic(async (tx) => {
      const source = await tx.requireSource(scope, sourceId);

      const approval = evaluateApproval({
        level: input.level,
        origin: source.origin,
        actor: input.actor,
        evidenceRef: input.evidenceRef,
      });
      tx.telemetry?.decision({
        vocabulary: SOURCE_REGISTRY_DECISIONS,
        point: 'source.approval',
        outcome: approval.allowed ? 'allowed' : 'denied',
        reason: approval.reason,
        detail: { sourceId, level: input.level, origin: source.origin },
      });
      if (!approval.allowed) {
        throw new SourceRegistryError(approval.reason, `Khong ghi duoc phe duyet cho ${sourceId}.`);
      }

      const record = await tx.repository.createApproval(scope, {
        level: input.level,
        actor: input.actor,
        evidenceRef: input.evidenceRef,
        note: input.note ?? null,
        sourceId,
        factId: null,
      });

      const moved = await tx.transitionSource(scope, sourceId, 'APPROVED');
      return { source: moved, approvalId: record.id };
    });
  }

  /**
   * Dua mot nguon DA DUYET vao hieu luc.
   *
   * Ba dieu kien (hash, locator, moc hieu luc) duoc kiem o `evaluateSourceTransition`, khong o
   * day — de mot bai test don vi khong dung DB van khang dinh duoc chung.
   */
  async makeSourceEffective(
    scope: TenantScope,
    sourceId: string,
    effectiveFrom: Date,
  ): Promise<BusinessSourceRecord> {
    // Moc hieu luc duoc ghi TRUOC vi chinh `evaluateSourceTransition` doi doc no. Neu lan chuyen
    // bi tu choi thi moc do khong duoc phep o lai: mot nguon `APPROVED` mang `effectiveFrom` la
    // mot nguon trong nhu da kich hoat ma chua.
    return this.atomic(async (tx) => {
      await tx.repository.updateSource(scope, sourceId, { effectiveFrom });
      return tx.transitionSource(scope, sourceId, 'EFFECTIVE');
    });
  }

  /**
   * Ban MOI thay the ban CU.
   *
   * Ban cu KHONG bi xoa, KHONG bi ghi de: no chuyen `SUPERSEDED`, duoc dong `effectiveTo`, va van
   * doc duoc mai mai. Do la toan bo diem cua ham nay — "lich su van con" phai la mot hanh vi cua
   * he thong chu khong phai mot loi hua trong tai lieu.
   */
  async supersedeSource(
    scope: TenantScope,
    input: {
      readonly previousSourceId: string;
      readonly nextSourceId: string;
      readonly effectiveFrom: Date;
    },
  ): Promise<{ readonly previous: BusinessSourceRecord; readonly next: BusinessSourceRecord }> {
    return this.atomic(async (tx) => {
      const previous = await tx.requireSource(scope, input.previousSourceId);
      const incoming = await tx.requireSource(scope, input.nextSourceId);

      // DONG HO TRUOC MOI GHI. Khong co cong nay thi mot "phu luc hop dong" dong duoc mot "bang
      // gia thang" lai: bang gia chuyen `SUPERSEDED` va bi dong `effectiveTo` du khong ban nao
      // thay no, con phu luc thi tro toi mot to tien khong lien quan.
      const lineage = evaluateSourceSupersession(previous, incoming);
      tx.telemetry?.decision({
        vocabulary: SOURCE_REGISTRY_DECISIONS,
        point: 'source.supersession',
        outcome: lineage.allowed ? 'allowed' : 'denied',
        reason: lineage.reason,
        detail: {
          previousSourceId: previous.id,
          nextSourceId: incoming.id,
          previousSourceKey: previous.sourceKey,
          nextSourceKey: incoming.sourceKey,
        },
      });
      if (!lineage.allowed) {
        throw new SourceRegistryError(
          lineage.reason,
          `Nguon ${incoming.id} khong thay the duoc nguon ${previous.id}.`,
        );
      }

      await tx.repository.updateSource(scope, input.nextSourceId, {
        supersedesId: previous.id,
      });
    // Ban thay the co the DA duoc kich hoat truoc do — mot thu tu hoan toan hop le: kich hoat ban
    // moi roi moi dong ban cu. Goi `makeSourceEffective` lan nua trong truong hop do se do voi
    // `SOURCE_ALREADY_IN_STATE`, tuc mot thao tac dung bi tu choi vi ly do ky thuat. Bo test tren
    // Postgres that bat duoc ca nay; bo in-memory thi khong, vi no tinh co luon kich hoat sau.
      const next =
        incoming.status === 'EFFECTIVE'
          ? await tx.repository.updateSource(scope, input.nextSourceId, {
              effectiveFrom: incoming.effectiveFrom ?? input.effectiveFrom,
            })
          : await tx.makeSourceEffective(scope, input.nextSourceId, input.effectiveFrom);
      await tx.repository.updateSource(scope, previous.id, { effectiveTo: input.effectiveFrom });
      const closed = await tx.transitionSource(scope, previous.id, 'SUPERSEDED');

      return { previous: closed, next };
    });
  }

  /** Chuyen trang thai nguon — cong DUY NHAT ghi `BusinessSource.status`. */
  async transitionSource(
    scope: TenantScope,
    sourceId: string,
    to: SourceStatus,
  ): Promise<BusinessSourceRecord> {
    const source = await this.requireSource(scope, sourceId);
    const approvals = await this.repository.listApprovals(scope, { sourceId });
    const supersededBy = (await this.repository.listSources(scope)).some(
      (row) => row.supersedesId === sourceId,
    );

    const decision = evaluateSourceTransition(source.status, to, {
      origin: source.origin,
      hasExplicitApproval: approvals.length > 0,
      hasContentHash: Boolean(source.contentHash),
      hasLocator: Boolean(source.locator),
      hasEffectiveFrom: Boolean(source.effectiveFrom),
      hasSupersedingSource: supersededBy,
    });
    this.telemetry?.decision({
      vocabulary: SOURCE_REGISTRY_DECISIONS,
      point: 'source.transition',
      outcome: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      detail: { sourceId, from: source.status, to },
    });
    if (!decision.allowed) {
      throw new SourceRegistryError(
        decision.reason,
        `Khong chuyen duoc nguon ${sourceId} tu ${source.status} sang ${to}.`,
      );
    }

    const updated = await this.repository.updateSource(scope, sourceId, { status: to });
    this.emitStateChange({
      entity: 'business_source',
      entityId: sourceId,
      from: source.status,
      to,
      reason: decision.reason,
    });
    return updated;
  }

  /* ---------------------------------------------------------------- *
   * Su that
   * ---------------------------------------------------------------- */

  /**
   * Nop mot su that DE XUAT. Luon vao o `PROPOSED` — khong co tham so nao cho phep nhay thang.
   *
   * Do la cho "LLM trich xuat ≠ da duyet" duoc thi hanh: duong trich xuat tu dong goi dung ham
   * nay, va khong co cua nao khac de tao mot su that.
   */
  async submitFact(
    scope: TenantScope,
    input: {
      readonly domain: string;
      readonly key: string;
      readonly value: unknown;
      readonly sourceId: string;
      readonly classification: DataClassification;
      readonly sourceLocus?: string | null;
      readonly effectiveFrom?: Date | null;
      readonly effectiveTo?: Date | null;
    },
  ): Promise<BusinessFactRecord> {
    await this.requireSource(scope, input.sourceId);
    const fact = await this.repository.createFact(scope, {
      domain: input.domain,
      key: input.key,
      value: input.value,
      status: 'PROPOSED',
      classification: input.classification,
      sourceId: input.sourceId,
      sourceLocus: input.sourceLocus ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
      assumptionRationale: null,
      assumptionRisk: null,
      assumptionReversibility: null,
      assumptionOwner: null,
      supersedesId: null,
    });
    this.emitStateChange({
      entity: 'business_fact',
      entityId: fact.id,
      from: null,
      to: fact.status,
      reason: 'FACT_CREATED',
    });
    return fact;
  }

  /**
   * Danh dau mot su that la GIA DINH LAM VIEC dang chay.
   *
   * Doi du bon truong. Mot gia dinh khong ghi duoc cach dao nguoc la mot quyet dinh vinh vien ma
   * khong ai ky — nen thieu truong nao thi cong dong, khong phai canh bao.
   */
  async markWorkingAssumption(
    scope: TenantScope,
    factId: string,
    evidence: WorkingAssumptionEvidence,
  ): Promise<BusinessFactRecord> {
    const complete = Boolean(
      evidence.rationale?.trim() &&
        evidence.risk?.trim() &&
        evidence.reversibility?.trim() &&
        evidence.owner?.trim(),
    );

    // Bon truong duoc ghi TRUOC lan chuyen, va ca hai nam trong mot don vi. Thu tu nay quan trong
    // hon no trong: mot ban ghi o `WORKING_ASSUMPTION` ma chua co ly do/rui ro/cach dao nguoc la
    // dung cai thu tang nay sinh ra de cam, va no khong duoc phep ton tai KE CA trong mot khoanh
    // khac giua hai cau ghi.
    return this.atomic(async (tx) => {
      await tx.requireFact(scope, factId);
      if (complete) {
        await tx.repository.updateFact(scope, factId, {
          assumptionRationale: evidence.rationale,
          assumptionRisk: evidence.risk,
          assumptionReversibility: evidence.reversibility,
          assumptionOwner: evidence.owner,
        });
      }
      return tx.transitionFact(scope, factId, 'WORKING_ASSUMPTION', {
        hasAssumptionEvidence: complete,
      });
    });
  }

  /**
   * Xac nhan mot su that, kem phe duyet tuong minh.
   *
   * Neu ban ghi dang la `WORKING_ASSUMPTION` thi phe duyet BAT BUOC phai la `CUSTOMER_CONFIRMED`:
   * mot gia dinh cua chung ta khong tu troi thanh su that cua khach bang mot lan duyet noi bo.
   */
  async confirmFact(
    scope: TenantScope,
    factId: string,
    input: {
      readonly level: ApprovalLevel;
      readonly actor: string;
      readonly evidenceRef: string;
      readonly note?: string | null;
    },
  ): Promise<BusinessFactRecord> {
    // Cung ly do voi `approveSource`: mot lan xac nhan THAT BAI khong duoc de lai ban ghi phe
    // duyet, vi lan sau `transitionFact` chi hoi "co phe duyet nao khong" chu khong hoi "lan
    // duyet do co di den noi khong".
    return this.atomic(async (tx) => {
      const fact = await tx.requireFact(scope, factId);
      const source = await tx.requireSource(scope, fact.sourceId);

      const approval = evaluateApproval({
        level: input.level,
        origin: source.origin,
        actor: input.actor,
        evidenceRef: input.evidenceRef,
      });
      tx.telemetry?.decision({
        vocabulary: SOURCE_REGISTRY_DECISIONS,
        point: 'source.approval',
        outcome: approval.allowed ? 'allowed' : 'denied',
        reason: approval.reason,
        detail: { factId, level: input.level, origin: source.origin },
      });
      if (!approval.allowed) {
        throw new SourceRegistryError(approval.reason, `Khong ghi duoc phe duyet cho ${factId}.`);
      }

      await tx.repository.createApproval(scope, {
        level: input.level,
        actor: input.actor,
        evidenceRef: input.evidenceRef,
        note: input.note ?? null,
        sourceId: null,
        factId,
      });
      return tx.transitionFact(scope, factId, 'CONFIRMED', {
        approvalIsCustomerConfirmed: input.level === 'CUSTOMER_CONFIRMED',
      });
    });
  }

  /**
   * Ban su that MOI thay the ban CU tai cung dia chi `(domain, key)`.
   *
   * Ban cu KHONG bi UPDATE tai cho. `listFactHistory()` sau lan goi nay tra ve CA HAI, theo thu tu
   * thoi gian — do la dinh nghia van hanh cua "lich su duoc giu".
   */
  async supersedeFact(
    scope: TenantScope,
    input: { readonly previousFactId: string; readonly nextFactId: string; readonly at: Date },
  ): Promise<{ readonly previous: BusinessFactRecord; readonly next: BusinessFactRecord }> {
    return this.atomic(async (tx) => {
      const previous = await tx.requireFact(scope, input.previousFactId);
      const next = await tx.requireFact(scope, input.nextFactId);

      // "Cung dia chi `(domain, key)`" tung chi la mot cau trong chu thich cua ham nay. Gio no la
      // mot cong: goi nham id se lam hong lich su cua CA HAI dia chi — mot ben mat ban dang hieu
      // luc ma khong ai bam nut, mot ben tro toi mot to tien khong lien quan.
      const lineage = evaluateFactSupersession(previous, next);
      tx.telemetry?.decision({
        vocabulary: SOURCE_REGISTRY_DECISIONS,
        point: 'fact.supersession',
        outcome: lineage.allowed ? 'allowed' : 'denied',
        reason: lineage.reason,
        detail: {
          previousFactId: previous.id,
          nextFactId: next.id,
          previousAddress: `${previous.domain}/${previous.key}`,
          nextAddress: `${next.domain}/${next.key}`,
        },
      });
      if (!lineage.allowed) {
        throw new SourceRegistryError(
          lineage.reason,
          `Su that ${next.id} khong thay the duoc su that ${previous.id}.`,
        );
      }

      await tx.repository.updateFact(scope, next.id, { supersedesId: previous.id });
      await tx.repository.updateFact(scope, previous.id, { effectiveTo: input.at });
      const closed = await tx.transitionFact(scope, previous.id, 'SUPERSEDED', {
        hasSupersedingFact: true,
      });
      return { previous: closed, next: (await tx.findFactById(scope, next.id)) ?? next };
    });
  }

  /** Chuyen trang thai su that — cong DUY NHAT ghi `BusinessFact.status`. */
  async transitionFact(
    scope: TenantScope,
    factId: string,
    to: FactStatus,
    overrides: {
      readonly hasAssumptionEvidence?: boolean;
      readonly approvalIsCustomerConfirmed?: boolean;
      readonly hasSupersedingFact?: boolean;
    } = {},
  ): Promise<BusinessFactRecord> {
    const fact = await this.requireFact(scope, factId);
    const source = await this.requireSource(scope, fact.sourceId);
    const approvals = await this.repository.listApprovals(scope, { factId });

    const decision = evaluateFactTransition(fact.status, to, {
      sourceEffective: source.status === 'EFFECTIVE',
      hasExplicitApproval: approvals.length > 0,
      approvalIsCustomerConfirmed:
        overrides.approvalIsCustomerConfirmed ??
        approvals.some((row) => row.level === 'CUSTOMER_CONFIRMED'),
      hasAssumptionEvidence:
        overrides.hasAssumptionEvidence ??
        Boolean(
          fact.assumptionRationale &&
            fact.assumptionRisk &&
            fact.assumptionReversibility &&
            fact.assumptionOwner,
        ),
      hasSupersedingFact: overrides.hasSupersedingFact ?? Boolean(fact.supersedesId),
    });
    this.telemetry?.decision({
      vocabulary: SOURCE_REGISTRY_DECISIONS,
      point: 'fact.transition',
      outcome: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      detail: { factId, from: fact.status, to, domain: fact.domain, key: fact.key },
    });
    if (!decision.allowed) {
      throw new SourceRegistryError(
        decision.reason,
        `Khong chuyen duoc su that ${factId} tu ${fact.status} sang ${to}.`,
      );
    }

    const updated = await this.repository.updateFact(scope, factId, { status: to });
    this.emitStateChange({
      entity: 'business_fact',
      entityId: factId,
      from: fact.status,
      to,
      reason: decision.reason,
    });
    return updated;
  }

  /* ---------------------------------------------------------------- *
   * Xung dot
   * ---------------------------------------------------------------- */

  /**
   * Mo mot xung dot giua nhung su that canh tranh.
   *
   * `recommendation` la TUY CHON va KHONG BAO GIO tu dong dong xung dot. No duoc luu de nguoi
   * quyet dinh khong phai dung lai lap luan — day dung la hinh dang cua van tai `C-02`, noi mot
   * lap luan tot da ton tai va van khong duoc quyen tu chot vi day la quyet dinh cua khach.
   */
  async openConflict(
    scope: TenantScope,
    input: {
      readonly conflictKey: string;
      readonly domain: string;
      readonly subjectKey?: string | null;
      readonly summary: string;
      readonly impact?: ConflictImpact;
      readonly factIds: readonly string[];
      readonly recommendedFactId?: string | null;
      readonly recommendationReason?: string | null;
    },
  ): Promise<BusinessConflictRecord> {
    for (const factId of input.factIds) await this.requireFact(scope, factId);

    const existing = await this.repository.findConflictByKey(scope, input.conflictKey);
    if (existing) return existing;

    const conflict = await this.repository.createConflict(scope, {
      conflictKey: input.conflictKey,
      domain: input.domain,
      subjectKey: input.subjectKey ?? null,
      summary: input.summary,
      impact: input.impact ?? 'BLOCKING',
      status: INITIAL_CONFLICT_STATUS,
      recommendedFactId: input.recommendedFactId ?? null,
      recommendationReason: input.recommendationReason ?? null,
      resolvedFactId: null,
      resolutionActor: null,
      resolutionRef: null,
      resolutionNote: null,
      resolvedAt: null,
      factIds: [...input.factIds],
    });

    this.telemetry?.decision({
      vocabulary: SOURCE_REGISTRY_DECISIONS,
      point: 'conflict.resolution',
      outcome: 'denied',
      reason: 'CONFLICT_OPENED',
      detail: { conflictKey: input.conflictKey, competing: input.factIds.length },
    });
    return conflict;
  }

  /**
   * Dong mot xung dot — chi bang bang chung tuong minh.
   *
   * Ham nay khong nhan ngay thang, khong nhan tham quyen, khong doc `recommendedFactId`. Ke goi
   * PHAI noi ro ai chot, dua vao dau, va ben nao thang.
   */
  async resolveConflict(
    scope: TenantScope,
    conflictId: string,
    input: {
      readonly winningFactId: string;
      readonly actor: string;
      readonly evidenceRef: string;
      readonly note?: string | null;
      readonly at?: Date;
    },
  ): Promise<BusinessConflictRecord> {
    const conflict = await this.requireConflict(scope, conflictId);

    const decision = evaluateConflictResolution(conflict.status, {
      actor: input.actor,
      evidenceRef: input.evidenceRef,
      winningFactId: input.winningFactId,
      competingFactIds: conflict.factIds,
    });
    this.telemetry?.decision({
      vocabulary: SOURCE_REGISTRY_DECISIONS,
      point: 'conflict.resolution',
      outcome: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      detail: { conflictId, conflictKey: conflict.conflictKey },
    });
    if (!decision.allowed) {
      throw new SourceRegistryError(
        decision.reason,
        `Khong dong duoc xung dot ${conflictId}.`,
      );
    }

    const resolved = await this.repository.updateConflict(scope, conflictId, {
      status: 'RESOLVED',
      resolvedFactId: input.winningFactId,
      resolutionActor: input.actor,
      resolutionRef: input.evidenceRef,
      resolutionNote: input.note ?? null,
      resolvedAt: input.at ?? new Date(),
    });
    this.emitStateChange({
      entity: 'business_conflict',
      entityId: conflictId,
      from: conflict.status,
      to: 'RESOLVED',
      reason: decision.reason,
    });
    return resolved;
  }

  /* ---------------------------------------------------------------- *
   * Doc co pham vi
   * ---------------------------------------------------------------- */

  async findSourceById(scope: TenantScope, id: string): Promise<BusinessSourceRecord | null> {
    return this.repository.findSourceById(scope, id);
  }

  async findFactById(scope: TenantScope, id: string): Promise<BusinessFactRecord | null> {
    return this.repository.findFactById(scope, id);
  }

  async listSources(scope: TenantScope): Promise<readonly BusinessSourceRecord[]> {
    return this.repository.listSources(scope);
  }

  async listConflicts(scope: TenantScope): Promise<readonly BusinessConflictRecord[]> {
    return this.repository.listConflicts(scope);
  }

  async findConflictById(
    scope: TenantScope,
    id: string,
  ): Promise<BusinessConflictRecord | null> {
    return this.repository.findConflictById(scope, id);
  }

  async declareRequiredFact(
    scope: TenantScope,
    input: {
      readonly capability: string;
      readonly domain: string;
      readonly key: string;
      readonly requiresConfirmed?: boolean;
      readonly note?: string | null;
    },
  ): Promise<void> {
    await this.repository.upsertRequiredFact(scope, {
      capability: input.capability,
      domain: input.domain,
      key: input.key,
      requiresConfirmed: input.requiresConfirmed ?? false,
      note: input.note ?? null,
    });
  }

  /* ---------------------------------------------------------------- *
   * Noi bo
   * ---------------------------------------------------------------- */

  /**
   * Lay mot nguon TRONG PHAM VI, hoac nem.
   *
   * `findSourceById` da loc theo pham vi nen ban ghi cua khach khac ve `null` — va o day no thanh
   * `SOURCE_NOT_FOUND`, KHONG phai `TENANT_SCOPE_CROSS_TENANT`. Co y: thong bao loi khong duoc tro
   * thanh kenh xac nhan "ban ghi do co ton tai o khach khac". `assertWithinScope` phia kho moi la
   * cho phan biet duoc hai truong hop, va no chi chay o duong GHI.
   */
  private async requireSource(
    scope: TenantScope,
    id: string,
  ): Promise<BusinessSourceRecord> {
    const found = await this.repository.findSourceById(scope, id);
    if (!found) throw new SourceRegistryError('SOURCE_NOT_FOUND', `Khong tim thay nguon ${id}.`);
    assertWithinScope(scope, found, `Nguon ${id}`);
    return found;
  }

  private async requireFact(scope: TenantScope, id: string): Promise<BusinessFactRecord> {
    const found = await this.repository.findFactById(scope, id);
    if (!found) throw new SourceRegistryError('FACT_NOT_FOUND', `Khong tim thay su that ${id}.`);
    assertWithinScope(scope, found, `Su that ${id}`);
    return found;
  }

  private async requireConflict(
    scope: TenantScope,
    id: string,
  ): Promise<BusinessConflictRecord> {
    const found = await this.repository.findConflictById(scope, id);
    if (!found) {
      throw new SourceRegistryError('CONFLICT_NOT_FOUND', `Khong tim thay xung dot ${id}.`);
    }
    assertWithinScope(scope, found, `Xung dot ${id}`);
    return found;
  }
}
