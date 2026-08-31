import { Injectable, Optional } from '@nestjs/common';
import type {
  DecisionOutcome,
  DecisionPointOf,
  DecisionReasonOf,
  DecisionVocabulary,
} from '../observability/decision-vocabulary.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { currentTrace } from '../observability/trace-context.js';
import { SourceRegistryRepository } from '../source-registry/source-registry.repository.js';
import { assertWithinScope, type TenantScope } from '../source-registry/tenant-scope.js';
import { DecisionReconciliationSink, failureModeFor } from './decision-criticality.js';
import {
  buildDecisionEvidence,
  DecisionEvidenceRejected,
  isInternalIdentifier,
} from './decision-evidence.js';
import {
  decisionFingerprint,
  decisionIdempotencyKey,
  type DecisionOccurrence,
} from './decision-idempotency.js';
import { LEDGER_WRITE_VOCABULARY } from './decision-ledger-decisions.js';
import { DecisionLedgerError } from './decision-ledger.error.js';
import {
  DecisionLedgerRepository,
  type DecisionAppendInput,
  type DecisionFactReferenceInput,
  type DecisionRelationInput,
} from './decision-ledger.repository.js';
import type {
  BusinessDecisionRecord,
  DecisionActorKind,
  DecisionAppendResult,
  DecisionCriticality,
} from './decision-ledger.types.js';

/**
 * SO CAI QUYET DINH NGHIEP VU — API cua tang.
 *
 * ---------------------------------------------------------------------------
 * CHU KY CO Y GIONG HET `telemetry.decision()`.
 *
 * `{ vocabulary, point, outcome, reason, detail }` la dung bo tham so ma code nghiep vu da quen.
 * Ba he qua, deu co chu dich:
 *
 *  1. NEN TANG KHONG BIET TU VUNG CUA MIEN NAO. Bo tu vung di vao nhu mot THAM SO, giong y cach
 *     `telemetry.decision()` da giai bai toan do (xem `decision-vocabulary.ts`). Nho vay tep nay
 *     khong nhac mot thuat ngu ban hang hay van tai nao, va mot capability moi khong phai chen
 *     ma cua no vao mot enum toan cuc.
 *  2. MA LY DO TRONG SO CAI CO KIEU. `reason` bi rang buoc theo dung bo tu vung cua `point`, nen
 *     khong the co mot cau tieng Viet tu do nam trong mot cot ma sau nay se bi loc bang `GROUP BY`.
 *  3. CHUYEN DOI RE. Mot cho dang goi `telemetry.decision()` doi sang `ledger.record()` bang cach
 *     them ba truong (`subject`, `occurrence`, `criticality`) — khong phai viet lai loi goi.
 *
 * ---------------------------------------------------------------------------
 * MOT LAN GHI SO CAI CUNG PHAT TELEMETRY (muc 12). Khong bat noi goi ghi hai lan: ghi hai lan la
 * cach chac chan de mot trong hai cho troi di sau vai thang. Telemetry mang them
 * `nexagnet.decision.ledger_id`, nen tu mot span quan sat duoc di thang toi bang chung ben vung.
 *
 * KHONG DI NGUOC LAI: so cai khong bao gio chua payload OTel, khong chua cay span. No chi giu ba
 * neo (`traceId`, `spanId`, `workflowRunId`) — du de noi hai mat phang, khong du de thay the nhau.
 */
@Injectable()
export class DecisionLedgerService {
  constructor(
    private readonly repository: DecisionLedgerRepository,
    /**
     * `@Optional()` theo dung bat bien cua tang quan sat: telemetry KHONG duoc la dieu kien de
     * nghiep vu thanh cong. Thieu no thi so cai van ghi day du; chi mat cau noi sang trace.
     */
    @Optional() private readonly telemetry?: TelemetryService,
    /**
     * Kho nguon su that — de KIEM mot `factId` duoc gan co that va co THUOC PHAM VI khach dang
     * cam. `@Optional()` vi mot quyet dinh khong dua tren su that nao van hop le; nhung khi da
     * co `factRefs` ma khong co kho de kiem, cong se dong (xem `resolveFactRefs`).
     */
    @Optional() private readonly sources?: SourceRegistryRepository,
    /** Noi phat yeu cau doi soat khi ghi that bai o muc `BUSINESS_STANDARD`. */
    @Optional() private readonly reconciliation?: DecisionReconciliationSink,
  ) {}

  /**
   * GHI mot quyet dinh nghiep vu.
   *
   * Thu tu cac cong CO Y: moi phep kiem re tien va tat dinh chay TRUOC bat ky lan cham DB nao, va
   * loi lap trinh (sai tu vung, sai khuon dinh danh) do truoc loi du lieu. Mot cong dat tien dat
   * truoc mot cong re se lam bai test cham hon ma khong chan them duoc gi.
   */
  async record<V extends DecisionVocabulary>(input: {
    readonly scope: TenantScope;
    readonly vocabulary: V;
    readonly point: DecisionPointOf<V>;
    readonly outcome: DecisionOutcome;
    readonly reason: DecisionReasonOf<V>;
    readonly subject: { readonly type: string; readonly id: string };
    /** Lan xuat hien — BAT BUOC. Xem `decision-idempotency.ts` de biet vi sao khong co mac dinh. */
    readonly occurrence: DecisionOccurrence;
    readonly actorKind: DecisionActorKind;
    readonly actorRef?: string;
    readonly criticality?: DecisionCriticality;
    readonly occurredAt?: Date;
    readonly policyRef?: string;
    readonly policyVersion?: string;
    readonly model?: { readonly provider: string; readonly ref: string };
    readonly workflowRunId?: string;
    readonly approvalRef?: string;
    readonly facts?: readonly DecisionFactReferenceInput[];
    readonly relations?: readonly DecisionRelationInput[];
    readonly detail?: Readonly<Record<string, unknown>>;
  }): Promise<DecisionAppendResult> {
    const criticality = input.criticality ?? 'BUSINESS_STANDARD';
    this.assertVocabulary(input.vocabulary, input.point, input.reason);
    assertSubject(input.subject);
    assertDecisionAuthority(input.actorKind, criticality);

    const idempotencyKey = decisionIdempotencyKey(
      {
        decisionPoint: input.point,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
      },
      input.occurrence,
    );
    const fingerprint = decisionFingerprint({
      decisionPoint: input.point,
      outcome: input.outcome,
      reasonCode: input.reason,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      actorKind: input.actorKind,
      criticality,
    });
    const detail = input.detail ? this.buildEvidence(input.detail) : undefined;

    const correlation = this.correlate(input.occurrence, input.workflowRunId);
    const append: DecisionAppendInput = {
      decisionPoint: input.point,
      outcome: input.outcome,
      reasonCode: input.reason,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      occurredAt: input.occurredAt ?? new Date(),
      actorKind: input.actorKind,
      actorRef: input.actorRef ?? null,
      criticality,
      policyRef: input.policyRef ?? null,
      policyVersion: input.policyVersion ?? null,
      modelProvider: input.model?.provider ?? null,
      modelRef: input.model?.ref ?? null,
      releaseSha: this.releaseSha(),
      ...correlation,
      approvalRef: input.approvalRef ?? null,
      idempotencyKey,
      fingerprint,
      ...(detail ? { detail } : {}),
      ...(input.relations?.length ? { relations: input.relations } : {}),
    };

    return this.persist(input.scope, append, input.facts);
  }

  /**
   * SUA mot quyet dinh da ghi — bang cach ghi mot quyet dinh MOI, khong bao gio bang cach sua no.
   *
   * Hang cu giu nguyen MOI truong; chi `status` cua no doi sang `CORRECTED`/`SUPERSEDED`. Nguoi
   * doi soat vi the doc duoc ca hai: cai he thong da quyet dinh luc do, VA cai da sua no.
   *
   * BA CONG, moi cong mot ma:
   *   · khong tu sua chinh minh (`LEDGER_SELF_CORRECTION`);
   *   · ban goc phai o CUNG cong va CUNG ca (`LEDGER_CORRECTION_LINEAGE_MISMATCH`) — sua mot
   *     quyet dinh o cong khac la mot quyet dinh MOI, khong phai mot ban sua, va goi no la ban
   *     sua se lam dong thoi gian cua ca ngoi kia mat mot muc;
   *   · mot hang chi bi sua MOT lan (`LEDGER_TARGET_ALREADY_CORRECTED`) — hai ban sua cung tro ve
   *     mot goc thi khong con tra loi duoc "rot cuoc dieu gi da dung".
   *
   * CA HAI PHEP GHI NAM TRONG MOT DON VI: nua duong se de lai mot goc `CORRECTED` khong co ban
   * sua nao, hoac hai hang `RECORDED` cho cung mot ca.
   */
  async correct<V extends DecisionVocabulary>(input: {
    readonly scope: TenantScope;
    readonly correctsDecisionId: string;
    readonly vocabulary: V;
    readonly point: DecisionPointOf<V>;
    readonly outcome: DecisionOutcome;
    readonly reason: DecisionReasonOf<V>;
    readonly occurrence: DecisionOccurrence;
    readonly actorKind: DecisionActorKind;
    readonly actorRef?: string;
    readonly criticality?: DecisionCriticality;
    readonly occurredAt?: Date;
    readonly approvalRef?: string;
    readonly facts?: readonly DecisionFactReferenceInput[];
    readonly detail?: Readonly<Record<string, unknown>>;
    /** `CORRECTED` = ban goc SAI; `SUPERSEDED` = ban goc dung luc do nhung nay da thay bang cai khac. */
    readonly mode?: 'CORRECTED' | 'SUPERSEDED';
  }): Promise<DecisionAppendResult> {
    const criticality = input.criticality ?? 'BUSINESS_STANDARD';
    this.assertVocabulary(input.vocabulary, input.point, input.reason);
    assertDecisionAuthority(input.actorKind, criticality);

    const original = await this.repository.findById(input.scope, input.correctsDecisionId);
    if (!original) {
      throw new DecisionLedgerError(
        'LEDGER_TARGET_NOT_IN_SCOPE',
        `Khong tim thay quyet dinh ${input.correctsDecisionId} trong pham vi khach hien tai.`,
      );
    }
    assertWithinScope(input.scope, original, 'Quyet dinh duoc sua');
    if (original.status !== 'RECORDED') {
      throw new DecisionLedgerError(
        'LEDGER_TARGET_ALREADY_CORRECTED',
        `Quyet dinh ${original.id} da o trang thai ${original.status} — mot hang chi bi sua mot lan.`,
      );
    }
    if (original.decisionPoint !== input.point) {
      throw new DecisionLedgerError(
        'LEDGER_CORRECTION_LINEAGE_MISMATCH',
        `Ban sua o cong "${input.point}" khong sua duoc quyet dinh o cong "${original.decisionPoint}".`,
      );
    }

    const idempotencyKey = decisionIdempotencyKey(
      {
        decisionPoint: input.point,
        subjectType: original.subjectType,
        subjectId: original.subjectId,
      },
      input.occurrence,
    );
    if (idempotencyKey === original.idempotencyKey) {
      // Cung khoa nghia la ben goi dang mo ta CUNG mot lan xuat hien — tuc no dang sua chinh no.
      throw new DecisionLedgerError(
        'LEDGER_SELF_CORRECTION',
        'Ban sua dung cung mot lan xuat hien voi ban goc — do la chinh no, khong phai mot ban sua.',
      );
    }

    const detail = input.detail ? this.buildEvidence(input.detail) : undefined;
    const append: DecisionAppendInput = {
      decisionPoint: input.point,
      outcome: input.outcome,
      reasonCode: input.reason,
      subjectType: original.subjectType,
      subjectId: original.subjectId,
      occurredAt: input.occurredAt ?? new Date(),
      actorKind: input.actorKind,
      actorRef: input.actorRef ?? null,
      criticality,
      releaseSha: this.releaseSha(),
      ...this.correlate(input.occurrence, undefined),
      approvalRef: input.approvalRef ?? null,
      idempotencyKey,
      fingerprint: decisionFingerprint({
        decisionPoint: input.point,
        outcome: input.outcome,
        reasonCode: input.reason,
        subjectType: original.subjectType,
        subjectId: original.subjectId,
        actorKind: input.actorKind,
        criticality,
      }),
      supersedesId: original.id,
      ...(detail ? { detail } : {}),
    };

    return this.repository.runInTransaction(async (tx) => {
      const result = await new DecisionLedgerService(
        tx,
        this.telemetry,
        this.sources,
        this.reconciliation,
      ).persist(input.scope, append, input.facts);
      // Chi dong ban goc khi ban sua THAT SU vao duoc so cai. Mot lan chay lai da dong no tu
      // truoc; mot lan ghi hong thi dong ban goc se de lai mot goc `CORRECTED` khong co ban sua
      // nao — te hon ca hai lua chon.
      if (result.persisted && !result.replayed) {
        await tx.markStatus(input.scope, original.id, input.mode ?? 'CORRECTED');
      }
      return result;
    });
  }

  /* ---------------------------------------------------------------- *
   * DUONG DOC — khong bao gio nem vi so cai vang mat mot hang.
   * ---------------------------------------------------------------- */

  async getById(scope: TenantScope, id: string): Promise<BusinessDecisionRecord | null> {
    return this.repository.findById(scope, id);
  }

  /** DONG THOI GIAN cua mot ca nghiep vu, cu nhat truoc. Thu tu tat dinh — xem tung ban kho. */
  async timelineForSubject(
    scope: TenantScope,
    subjectType: string,
    subjectId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.repository.listForSubject(scope, subjectType, subjectId);
  }

  async listForTrace(
    scope: TenantScope,
    traceId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.repository.listForTrace(scope, traceId);
  }

  async listForWorkflowRun(
    scope: TenantScope,
    workflowRunId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.repository.listForWorkflowRun(scope, workflowRunId);
  }

  /** "Ban so lieu sai nay da lam lech nhung ca nao" — duong doc nguoc de danh gia thiet hai. */
  async listAffectedByFact(
    scope: TenantScope,
    factId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.repository.listForFact(scope, factId);
  }

  /* ---------------------------------------------------------------- *
   * NOI BO
   * ---------------------------------------------------------------- */

  /**
   * Duong ghi CHUNG cua ca `record()` lan `correct()`.
   *
   * BA VIEC, dung thu tu nay:
   *  1. doc theo khoa chong trung -> chay lai thi tra lai hang cu, KHONG ghi hang thu hai (muc 10);
   *  2. kiem `factRefs` thuoc dung pham vi khach (muc 9 + cach ly khach);
   *  3. ghi, va neu ghi hong thi ap chinh sach that bai theo MUC NGHIEM TRONG (muc 11).
   */
  private async persist(
    scope: TenantScope,
    append: DecisionAppendInput,
    facts: readonly DecisionFactReferenceInput[] | undefined,
  ): Promise<DecisionAppendResult> {
    const existing = await this.repository.findByIdempotencyKey(scope, append.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== append.fingerprint) {
        // Cung khoa, khac noi dung. Tra ve hang cu se lam ben goi tin rang quyet dinh MOI cua no
        // da duoc ghi — mot ban ghi nghiep vu bien mat trong im lang. Duong dung la nem.
        throw new DecisionLedgerError(
          'LEDGER_IDEMPOTENCY_KEY_CONFLICT',
          `Khoa chong trung da duoc dung cho mot quyet dinh KHAC (${existing.decisionPoint} / ` +
            `${existing.reasonCode}). Day la loi cua ben goi, khong phai mot lan chay lai.`,
        );
      }
      this.emitTelemetry(append, existing, true);
      return { persisted: true, replayed: true, decision: existing };
    }

    const factRefs = await this.resolveFactRefs(scope, facts);
    const input: DecisionAppendInput = {
      ...append,
      ...(factRefs.length ? { factRefs } : {}),
    };

    try {
      const decision = await this.repository.append(scope, input);
      this.emitTelemetry(append, decision, false);
      return { persisted: true, replayed: false, decision };
    } catch (cause) {
      return this.handleWriteFailure(scope, input, cause);
    }
  }

  /**
   * Kiem tung `factId` co that VA thuoc pham vi khach dang cam.
   *
   * KHONG CO KHO NGUON SU THAT THI DONG CONG. Mot `factId` khong kiem duoc la mot tham chieu ma
   * ta khong chung minh duoc — va mot bang chung khong chung minh duoc thi te hon khong co bang
   * chung, vi no doc len nhu da duoc kiem.
   *
   * ANH CHUP DUOC LAY TU BAN GHI THAT, khong tu doi so cua nguoi goi: neu ben goi tu khai
   * `factStatusAtUse: 'CONFIRMED'` thi so cai se ghi lai loi khai do nhu mot su that. Ben goi chi
   * duoc chon DUNG SU THAT NAO; trang thai va ban nguon cua no do tang nay doc ra.
   */
  private async resolveFactRefs(
    scope: TenantScope,
    facts: readonly DecisionFactReferenceInput[] | undefined,
  ): Promise<readonly DecisionFactReferenceInput[]> {
    if (!facts?.length) return [];
    if (!this.sources) {
      throw new DecisionLedgerError(
        'LEDGER_FACT_NOT_IN_SCOPE',
        'Khong co kho nguon su that de kiem cac tham chieu su that — dong cong thay vi ghi mot ' +
          'tham chieu khong kiem duoc.',
      );
    }

    const resolved: DecisionFactReferenceInput[] = [];
    for (const ref of facts) {
      const fact = await this.sources.findFactById(scope, ref.factId);
      if (!fact) {
        // "Khong ton tai" va "cua khach khac" tra ve CUNG mot ma co chu y: phan biet hai truong
        // hop nay se bien chinh thong bao loi thanh mot kenh do su ton tai cua du lieu khach khac.
        throw new DecisionLedgerError(
          'LEDGER_FACT_NOT_IN_SCOPE',
          `Su that ${ref.factId} khong nam trong pham vi khach hien tai.`,
        );
      }
      assertWithinScope(scope, fact, 'Su that duoc gan vao quyet dinh');
      const source = await this.sources.findSourceById(scope, fact.sourceId);
      resolved.push({
        factId: fact.id,
        factDomain: fact.domain,
        factKey: fact.key,
        factStatusAtUse: fact.status,
        sourceId: fact.sourceId,
        sourceKey: source?.sourceKey ?? null,
        sourceVersion: source?.version ?? null,
      });
    }
    return resolved;
  }

  /**
   * CHINH SACH THAT BAI theo muc nghiem trong — muc 11. Bang tra cuu o `decision-criticality.ts`.
   *
   * `FAIL_CLOSED` nem tiep NGUYEN VEN loi goc chu khong boc lai: ben goi dang o trong mot giao
   * dich, va thu no can la ly do that (khoa duy nhat? mat ket noi?) chu khong phai mot lop giay
   * goi cua tang nay.
   */
  private async handleWriteFailure(
    scope: TenantScope,
    input: DecisionAppendInput,
    cause: unknown,
  ): Promise<DecisionAppendResult> {
    const mode = failureModeFor(input.criticality);
    if (mode === 'FAIL_CLOSED') throw cause;

    if (mode === 'RECONCILE') {
      // KHONG nuot. Yeu cau doi soat la thu bien mot mat mat im lang thanh mot muc viec nhin thay
      // duoc. Ban than no cung fail-open: mot sink hong khong duoc lam sap duong nghiep vu ma
      // chinh sach nay vua quyet dinh cho di tiep.
      try {
        this.reconciliation?.require({
          tenantId: scope.tenantId,
          decisionPoint: input.decisionPoint,
          reasonCode: input.reasonCode,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          idempotencyKey: input.idempotencyKey,
          criticality: input.criticality,
          occurredAt: input.occurredAt,
          traceId: input.traceId ?? undefined,
          cause: describeCause(cause),
        });
      } catch {
        /* fail-open */
      }
    }

    // Ban ghi ben vung khong co, nhung dau vet quan sat thi van phai co — neu khong thi ca hai
    // mat phang cung im lang ve cung mot su viec.
    this.emitWriteFailure(input, cause);
    return {
      persisted: false,
      replayed: false,
      decision: null,
      reason: mode === 'RECONCILE' ? 'LEDGER_WRITE_DEFERRED' : 'LEDGER_WRITE_DROPPED',
      cause: describeCause(cause),
    };
  }

  /** Bo tu vung la nguon su that cua ca `point` lan `reason`. Sai o day la LOI LAP TRINH. */
  private assertVocabulary(vocabulary: DecisionVocabulary, point: string, reason: string): void {
    if (!vocabulary.points.includes(point)) {
      throw new DecisionLedgerError(
        'LEDGER_POINT_NOT_IN_VOCABULARY',
        `Diem quyet dinh "${point}" khong thuoc bo tu vung cua "${vocabulary.owner}".`,
      );
    }
    if (!(reason in vocabulary.labels)) {
      throw new DecisionLedgerError(
        'LEDGER_REASON_NOT_IN_VOCABULARY',
        `Ma ly do "${reason}" khong thuoc bo tu vung cua "${vocabulary.owner}".`,
      );
    }
  }

  private buildEvidence(detail: Readonly<Record<string, unknown>>) {
    try {
      return buildDecisionEvidence(detail);
    } catch (cause) {
      if (cause instanceof DecisionEvidenceRejected) {
        // Boc lai duoi ma cua tang nay de ben goi loc duoc bang MOT bo ma, nhung GIU nguyen loi
        // goc lam `cause`: duong dan va pham tru bi tu choi la thu lam lap trinh vien sua duoc
        // trong mot phut thay vi mot buoi.
        throw new DecisionLedgerError('LEDGER_EVIDENCE_REJECTED', cause.message);
      }
      throw cause;
    }
  }

  /**
   * BON NEO TUONG QUAN, lay tu HAI nguon — muc 12 hop dong nhiem vu.
   *
   * `currentTrace()` la nguon chinh: no la trace ma doan code nay THUC SU dang chay trong, nen no
   * la thu noi dung hang so cai voi dung cay span tren ClickStack.
   *
   * `occurrence` la nguon DU PHONG, va no khong phai trang tri. Ben goi da noi ro "lan ghi nay
   * thuoc luot `t1`" hoac "thuoc run `r1`" de dung lam khoa chong trung; bo cai do di roi ghi
   * `traceId = null` la tu nem mat mot tuong quan MA TA DA BIET. Do la kieu cot rong te nhat:
   * no doc len nhu "luot nay khong co trace" trong khi su that la "khong ai chiu ghi lai".
   *
   * Ambient THANG khi ca hai co mat. Hai gia tri lech nhau la mot loi cua ben goi, va luc do ta
   * muon giu trace ma tien trinh THAT SU dang o trong.
   */
  private correlate(
    occurrence: DecisionOccurrence,
    workflowRunId: string | undefined,
  ): Pick<DecisionAppendInput, 'traceId' | 'spanId' | 'workflowRunId'> {
    const trace = currentTrace();
    return {
      traceId: trace?.traceId ?? (occurrence.kind === 'turn' ? occurrence.traceId : null),
      spanId: trace?.currentSpanId ?? null,
      workflowRunId:
        workflowRunId ?? (occurrence.kind === 'workflowRun' ? occurrence.workflowRunId : null),
    };
  }

  private releaseSha(): string | null {
    const sha = this.telemetry?.releaseIdentity().gitSha;
    // `unknown` di tiep nhu mot gia tri that la cach de sinh ra lien ket sai tu tin — cung ly do
    // `TelemetryService.envelope()` bo han truong nay khi khong biet.
    return sha && sha !== 'unknown' ? sha : null;
  }

  /**
   * Phat telemetry cho MOT lan ghi so cai.
   *
   * `ledgerId`/`ledgerReplayed` la soi day noi hai mat phang: tu mot span quan sat duoc tren
   * ClickStack, di thang toi hang bang chung ben vung trong Postgres.
   */
  private emitTelemetry(
    append: DecisionAppendInput,
    decision: BusinessDecisionRecord,
    replayed: boolean,
  ): void {
    this.telemetry?.decision({
      vocabulary: LEDGER_WRITE_VOCABULARY,
      point: 'ledger.record',
      outcome: append.outcome,
      reason: replayed ? 'LEDGER_IDEMPOTENT_REPLAY' : 'LEDGER_RECORDED',
      detail: {
        ledgerId: decision.id,
        ledgerPoint: append.decisionPoint,
        ledgerReason: append.reasonCode,
        subjectType: append.subjectType,
        subjectId: append.subjectId,
        actorKind: append.actorKind,
        criticality: append.criticality,
        ...(append.workflowRunId ? { workflowRunId: append.workflowRunId } : {}),
      },
    });
  }

  private emitWriteFailure(input: DecisionAppendInput, cause: unknown): void {
    this.telemetry?.decision({
      vocabulary: LEDGER_WRITE_VOCABULARY,
      point: 'ledger.record',
      outcome: 'degraded',
      reason:
        failureModeFor(input.criticality) === 'RECONCILE'
          ? 'LEDGER_WRITE_DEFERRED'
          : 'LEDGER_WRITE_DROPPED',
      detail: {
        ledgerPoint: input.decisionPoint,
        ledgerReason: input.reasonCode,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        criticality: input.criticality,
        cause: describeCause(cause),
      },
    });
  }
}

/**
 * `subjectType`/`subjectId` la cot song cua duong doc so mot ("ke lai ca nay").
 *
 * `subjectId` kiem bang KHUON chu khong quet noi dung — ly do day du o `decision-evidence.ts`.
 */
function assertSubject(subject: { readonly type: string; readonly id: string }): void {
  if (!subject.type.trim() || !subject.id.trim()) {
    throw new DecisionLedgerError(
      'LEDGER_SUBJECT_MISSING',
      'Mot quyet dinh khong gan vao ca nghiep vu nao thi khong tra loi duoc cau hoi nao.',
    );
  }
  if (!isInternalIdentifier(subject.id)) {
    throw new DecisionLedgerError(
      'LEDGER_SUBJECT_NOT_AN_IDENTIFIER',
      `"${subject.id}" khong dung khuon dinh danh noi bo — so cai khong nhan SDT/email lam khoa ca.`,
    );
  }
}

/**
 * MUC 6 HOP DONG, dat vao kieu chay: LLM khong bao gio la tham quyen ben vung cho tien, tham
 * quyen, trang thai nghiep vu hay chinh sach quan trong.
 *
 * Cong nay KHONG cam ghi de xuat cua LLM — no cam ghi de xuat do NHU MOT QUYET DINH DA DUYET o
 * muc `FINANCIAL_OR_AUTHORIZATION`. Duong dung cho mot de xuat da duoc chap nhan la HAI hang:
 * de xuat (`LLM_RECOMMENDATION`, muc `ADVISORY`) va quyet dinh (`HUMAN` hoac
 * `DETERMINISTIC_RULE`) tro nguoc ve no bang quan he `PARENT_DECISION`.
 */
function assertDecisionAuthority(
  actorKind: DecisionActorKind,
  criticality: DecisionCriticality,
): void {
  if (actorKind === 'LLM_RECOMMENDATION' && criticality === 'FINANCIAL_OR_AUTHORIZATION') {
    throw new DecisionLedgerError(
      'LEDGER_LLM_NOT_AUTHORITATIVE',
      'LLM khong duoc la tham quyen ben vung cho tien/tham quyen. Ghi de xuat o muc ADVISORY, roi ' +
        'noi quyet dinh that vao no bang quan he PARENT_DECISION.',
    );
  }
}

function describeCause(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  // Cat ngan CO Y: thong bao loi cua driver DB co the dai hang nghin ky tu va keo theo ca cau
  // truy van. `MAX_EVIDENCE_STRING` la tran cua bang chung, nen dung lai chinh no o day.
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}
