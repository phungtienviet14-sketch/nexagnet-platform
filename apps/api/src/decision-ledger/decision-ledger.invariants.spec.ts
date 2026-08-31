import { beforeEach, describe, expect, it } from 'vitest';
import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import { InMemorySourceRegistryRepository } from '../source-registry/in-memory-source-registry.repository.js';
import { SourceRegistryService } from '../source-registry/source-registry.service.js';
import { testTenantScope, type TenantScope } from '../source-registry/tenant-scope.js';
import { DecisionReconciliationSink } from './decision-criticality.js';
import { DecisionLedgerService } from './decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from './in-memory-decision-ledger.repository.js';

/**
 * BAT BIEN cua so cai: cach ly khach, tuong quan nguon su that, sua khong pha lich su, va chinh
 * sach that bai. Bon nhom nay tach khoi `service.spec.ts` vi chung khong kiem "API chay dung" —
 * chung kiem nhung dieu KHONG DUOC PHEP XAY RA.
 */

const GATE = defineDecisionVocabulary({
  owner: 'test-domain',
  points: ['gate.evaluate', 'gate.other'],
  labels: { GATE_OPEN: 'Cong mo', GATE_CLOSED: 'Cong dong' },
});

const ALPHA = testTenantScope('t-alpha');
const BRAVO = testTenantScope('t-bravo');

let ledgerRepository: InMemoryDecisionLedgerRepository;
let sourceRepository: InMemorySourceRegistryRepository;
let registry: SourceRegistryService;
let ledger: DecisionLedgerService;

beforeEach(() => {
  ledgerRepository = new InMemoryDecisionLedgerRepository();
  sourceRepository = new InMemorySourceRegistryRepository();
  registry = new SourceRegistryService(sourceRepository);
  ledger = new DecisionLedgerService(ledgerRepository, undefined, sourceRepository);
});

const gate = (scope: TenantScope, overrides: Record<string, unknown> = {}) =>
  ({
    scope,
    vocabulary: GATE,
    point: 'gate.evaluate',
    outcome: 'denied',
    reason: 'GATE_CLOSED',
    subject: { type: 'case', id: 'case_1' },
    occurrence: { kind: 'turn', traceId: 'trace-1' },
    actorKind: 'DETERMINISTIC_RULE',
    ...overrides,
  }) as Parameters<DecisionLedgerService['record']>[0];

/** Dua mot su that di het duong toi `CONFIRMED`, kem ban nguon co hieu luc dang sau. */
async function confirmedFact(
  scope: TenantScope,
  input: { key: string; version: string; hash: string },
) {
  const at = new Date('2026-07-01T00:00:00Z');
  const source = await registry.registerSource(scope, {
    sourceKey: 'bang-cong-bo',
    title: `Ban cong bo ${input.version}`,
    kind: 'announcement',
    version: input.version,
    origin: 'CUSTOMER_SIGNED',
    authority: 'L2_CUSTOMER_PUBLISHED',
    classification: 'BUSINESS_SENSITIVE',
    locator: `vault://${scope.tenantId}/${input.version}`,
    contentHash: input.hash,
    receivedAt: at,
  });
  await registry.transitionSource(scope, source.id, 'REVIEWED');
  await registry.approveSource(scope, source.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'nguoi-co-tham-quyen',
    evidenceRef: `dan-chung-${input.version}`,
  });
  const effective = await registry.makeSourceEffective(scope, source.id, at);

  const fact = await registry.submitFact(scope, {
    domain: 'policy',
    key: input.key,
    value: { limit: 50 },
    sourceId: effective.id,
    classification: 'INTERNAL',
  });
  await registry.confirmFact(scope, fact.id, {
    level: 'CUSTOMER_CONFIRMED',
    actor: 'nguoi-co-tham-quyen',
    evidenceRef: `dan-chung-${input.version}`,
  });
  return { source: effective, fact };
}

describe('7-8. cach ly khach — chung minh PHU DINH', () => {
  it('khach A khong doc duoc quyet dinh cua khach B', async () => {
    const written = await ledger.record(gate(ALPHA));
    const id = written.decision?.id;
    if (!id) throw new Error('phai ghi duoc');

    // Doc bang ID CHINH XAC cua khach kia van tra ve `null` — "khong ton tai" va "cua khach khac"
    // khong duoc phan biet tu ben ngoai, neu khong thi thong bao loi thanh mot kenh do su ton tai.
    expect(await ledger.getById(BRAVO, id)).toBeNull();
    expect(await ledger.timelineForSubject(BRAVO, 'case', 'case_1')).toEqual([]);
    expect(await ledger.listForTrace(BRAVO, 'trace-1')).toEqual([]);
    expect(await ledger.getById(ALPHA, id)).not.toBeNull();
  });

  it('khoa chong trung KHONG va nhau giua hai khach', async () => {
    // Hai khach dung cung mot khoa la hai quyet dinh khac nhau; khoa duy nhat co pham vi khach.
    await ledger.record(gate(ALPHA));
    const bravo = await ledger.record(gate(BRAVO));
    expect(bravo.replayed).toBe(false);
    expect(await ledger.timelineForSubject(BRAVO, 'case', 'case_1')).toHaveLength(1);
  });

  it('khach A KHONG gan duoc su that cua khach B', async () => {
    const { fact } = await confirmedFact(BRAVO, {
      key: 'limit',
      version: 'v1',
      hash: 'b'.repeat(64),
    });

    await expect(
      ledger.record(
        gate(ALPHA, {
          facts: [
            {
              factId: fact.id,
              factDomain: 'policy',
              factKey: 'limit',
              factStatusAtUse: 'CONFIRMED',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ reason: 'LEDGER_FACT_NOT_IN_SCOPE' });

    // Va khong hang nao duoc ghi: cong dong TRUOC khi cham kho quyet dinh.
    expect(await ledger.timelineForSubject(ALPHA, 'case', 'case_1')).toEqual([]);
  });

  it('khong co kho nguon su that thi DONG CONG, khong ghi tham chieu khong kiem duoc', async () => {
    const blind = new DecisionLedgerService(ledgerRepository);
    await expect(ledger.record(gate(ALPHA))).resolves.toMatchObject({ persisted: true });
    await expect(
      blind.record(
        gate(ALPHA, {
          occurrence: { kind: 'turn', traceId: 'trace-2' },
          facts: [
            {
              factId: 'khong-kiem-duoc',
              factDomain: 'd',
              factKey: 'k',
              factStatusAtUse: 'CONFIRMED',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ reason: 'LEDGER_FACT_NOT_IN_SCOPE' });
  });
});

describe('5-9. tuong quan NGUON SU THAT, giu duoc qua thay the', () => {
  it('quyet dinh tro DUNG ban su that da dung, kem ban nguon dang sau no', async () => {
    const { source, fact } = await confirmedFact(ALPHA, {
      key: 'limit',
      version: 'v1',
      hash: '1'.repeat(64),
    });

    const written = await ledger.record(
      gate(ALPHA, {
        policyRef: 'policy.limit',
        facts: [
          // Ben goi chi chon DUNG SU THAT NAO. Trang thai va ban nguon do tang nay doc ra tu ban
          // ghi that — bai nay chung minh dieu do bang cach khai SAI o day.
          { factId: fact.id, factDomain: 'sai', factKey: 'sai', factStatusAtUse: 'REJECTED' },
        ],
      }),
    );

    expect(written.decision?.factRefs).toEqual([
      expect.objectContaining({
        factId: fact.id,
        factDomain: 'policy',
        factKey: 'limit',
        factStatusAtUse: 'CONFIRMED',
        sourceId: source.id,
        sourceKey: 'bang-cong-bo',
        sourceVersion: 'v1',
      }),
    ]);
  });

  it('su that bi THAY THE ve sau: quyet dinh cu VAN tro ban cu, VOI trang thai luc do', async () => {
    const first = await confirmedFact(ALPHA, { key: 'limit', version: 'v1', hash: '1'.repeat(64) });
    const decided = await ledger.record(
      gate(ALPHA, {
        facts: [
          {
            factId: first.fact.id,
            factDomain: 'policy',
            factKey: 'limit',
            factStatusAtUse: 'CONFIRMED',
          },
        ],
      }),
    );
    const decisionId = decided.decision?.id;
    if (!decisionId) throw new Error('phai ghi duoc');

    // Ky sau: mot ban KHAC thay ban cu tai cung dia chi su that.
    const second = await confirmedFact(ALPHA, {
      key: 'limit',
      version: 'v2',
      hash: '2'.repeat(64),
    });
    await registry.supersedeFact(ALPHA, {
      previousFactId: first.fact.id,
      nextFactId: second.fact.id,
      at: new Date('2026-08-01T00:00:00Z'),
    });

    // Ban su that cu DA doi trang thai sang SUPERSEDED trong so nguon su that...
    expect((await registry.findFactById(ALPHA, first.fact.id))?.status).toBe('SUPERSEDED');

    // ...nhung quyet dinh cu KHONG bi viet lai: van tro ban cu, va van ghi trang thai LUC DUNG.
    // Day la muc 9 hop dong, va la ly do `factStatusAtUse` ton tai canh khoa ngoai.
    const reread = await ledger.getById(ALPHA, decisionId);
    expect(reread?.factRefs).toEqual([
      expect.objectContaining({
        factId: first.fact.id,
        factStatusAtUse: 'CONFIRMED',
        sourceVersion: 'v1',
      }),
    ]);
    expect(reread?.factRefs[0]?.factId).not.toBe(second.fact.id);
  });

  it('doc NGUOC: mot ban so lieu da lam lech nhung ca nao', async () => {
    const { fact } = await confirmedFact(ALPHA, {
      key: 'limit',
      version: 'v1',
      hash: '1'.repeat(64),
    });
    for (const caseId of ['case_1', 'case_2']) {
      await ledger.record(
        gate(ALPHA, {
          subject: { type: 'case', id: caseId },
          occurrence: { kind: 'turn', traceId: `trace-${caseId}` },
          facts: [
            {
              factId: fact.id,
              factDomain: 'policy',
              factKey: 'limit',
              factStatusAtUse: 'CONFIRMED',
            },
          ],
        }),
      );
    }
    const affected = await ledger.listAffectedByFact(ALPHA, fact.id);
    expect(affected.map((row) => row.subjectId)).toEqual(['case_1', 'case_2']);
    expect(await ledger.listAffectedByFact(BRAVO, fact.id)).toEqual([]);
  });
});

describe('11. SUA la GHI THEM, khong bao gio la ghi de', () => {
  it('ban goc giu nguyen moi truong, chi `status` doi; ban sua tro nguoc ve no', async () => {
    const original = await ledger.record(gate(ALPHA, { detail: { totalQuantity: 60 } }));
    const originalId = original.decision?.id;
    if (!originalId) throw new Error('phai ghi duoc');

    const corrected = await ledger.correct({
      scope: ALPHA,
      correctsDecisionId: originalId,
      vocabulary: GATE,
      point: 'gate.evaluate',
      outcome: 'allowed',
      reason: 'GATE_OPEN',
      occurrence: { kind: 'turn', traceId: 'trace-sua' },
      actorKind: 'HUMAN',
      actorRef: 'nguoi-van-hanh',
      detail: { totalQuantity: 40 },
    });

    expect(await ledger.getById(ALPHA, originalId)).toMatchObject({
      outcome: 'denied',
      reasonCode: 'GATE_CLOSED',
      status: 'CORRECTED',
      detail: { totalQuantity: 60 },
    });
    expect(corrected.decision).toMatchObject({
      outcome: 'allowed',
      reasonCode: 'GATE_OPEN',
      status: 'RECORDED',
      supersedesId: originalId,
    });

    // Ca hai deu con tren dong thoi gian — do la ca diem cua append-only.
    expect(await ledger.timelineForSubject(ALPHA, 'case', 'case_1')).toHaveLength(2);
  });

  it('mot hang chi bi sua MOT lan', async () => {
    const original = await ledger.record(gate(ALPHA));
    const originalId = original.decision?.id;
    if (!originalId) throw new Error('phai ghi duoc');
    const correction = {
      scope: ALPHA,
      correctsDecisionId: originalId,
      vocabulary: GATE,
      point: 'gate.evaluate',
      outcome: 'allowed',
      reason: 'GATE_OPEN',
      actorKind: 'HUMAN',
    } as const;

    await ledger.correct({ ...correction, occurrence: { kind: 'turn', traceId: 'sua-1' } });
    await expect(
      ledger.correct({ ...correction, occurrence: { kind: 'turn', traceId: 'sua-2' } }),
    ).rejects.toMatchObject({ reason: 'LEDGER_TARGET_ALREADY_CORRECTED' });
  });

  it('khong tu sua chinh minh', async () => {
    const original = await ledger.record(gate(ALPHA));
    const originalId = original.decision?.id;
    if (!originalId) throw new Error('phai ghi duoc');
    await expect(
      ledger.correct({
        scope: ALPHA,
        correctsDecisionId: originalId,
        vocabulary: GATE,
        point: 'gate.evaluate',
        outcome: 'allowed',
        reason: 'GATE_OPEN',
        // CUNG lan xuat hien voi ban goc, tuc cung khoa: day la chinh no.
        occurrence: { kind: 'turn', traceId: 'trace-1' },
        actorKind: 'HUMAN',
      }),
    ).rejects.toMatchObject({ reason: 'LEDGER_SELF_CORRECTION' });
  });

  it('khong sua duoc mot quyet dinh o CONG KHAC', async () => {
    const original = await ledger.record(gate(ALPHA));
    const originalId = original.decision?.id;
    if (!originalId) throw new Error('phai ghi duoc');
    await expect(
      ledger.correct({
        scope: ALPHA,
        correctsDecisionId: originalId,
        vocabulary: GATE,
        point: 'gate.other',
        outcome: 'allowed',
        reason: 'GATE_OPEN',
        occurrence: { kind: 'turn', traceId: 'sua-1' },
        actorKind: 'HUMAN',
      }),
    ).rejects.toMatchObject({ reason: 'LEDGER_CORRECTION_LINEAGE_MISMATCH' });
  });

  it('khach khac khong sua duoc quyet dinh cua ta', async () => {
    const original = await ledger.record(gate(ALPHA));
    const originalId = original.decision?.id;
    if (!originalId) throw new Error('phai ghi duoc');
    await expect(
      ledger.correct({
        scope: BRAVO,
        correctsDecisionId: originalId,
        vocabulary: GATE,
        point: 'gate.evaluate',
        outcome: 'allowed',
        reason: 'GATE_OPEN',
        occurrence: { kind: 'turn', traceId: 'sua-1' },
        actorKind: 'HUMAN',
      }),
    ).rejects.toMatchObject({ reason: 'LEDGER_TARGET_NOT_IN_SCOPE' });
  });
});

/**
 * Mot kho LUON TU CHOI GHI, de do chinh sach that bai. Chi `append` hong; duong doc van chay, vi
 * muc 11 cung cam dieu nguoc lai ("khong lam moi doc muc thap do theo").
 */
class FailingLedgerRepository extends InMemoryDecisionLedgerRepository {
  /** Bat/tat de bai test SEED duoc mot hang truoc, roi moi lam duong ghi hong. */
  writesFail = true;

  override async append(
    ...args: Parameters<InMemoryDecisionLedgerRepository['append']>
  ): ReturnType<InMemoryDecisionLedgerRepository['append']> {
    if (this.writesFail) throw new Error('connect ECONNREFUSED postgres:5432');
    return super.append(...args);
  }
}

class RecordingSink extends DecisionReconciliationSink {
  readonly requests: Parameters<DecisionReconciliationSink['require']>[0][] = [];
  require(request: Parameters<DecisionReconciliationSink['require']>[0]): void {
    this.requests.push(request);
  }
}

describe('11. chinh sach that bai — mat mot ban ghi KHONG duoc im lang', () => {
  let failing: FailingLedgerRepository;
  let sink: RecordingSink;
  let brittle: DecisionLedgerService;

  beforeEach(() => {
    failing = new FailingLedgerRepository();
    sink = new RecordingSink();
    brittle = new DecisionLedgerService(failing, undefined, sourceRepository, sink);
  });

  it('tien/tham quyen: NEM tiep, de giao dich bao quanh cuon nguoc', async () => {
    await expect(
      brittle.record(gate(ALPHA, { criticality: 'FINANCIAL_OR_AUTHORIZATION' })),
    ).rejects.toThrowError(/ECONNREFUSED/);
    expect(sink.requests).toHaveLength(0);
  });

  it('nghiep vu thuong: di tiep, NHUNG phat mot yeu cau doi soat mang du khoa de ghi bu', async () => {
    const result = await brittle.record(gate(ALPHA, { criticality: 'BUSINESS_STANDARD' }));

    expect(result.persisted).toBe(false);
    expect(result.decision).toBeNull();
    expect(result).toMatchObject({ reason: 'LEDGER_WRITE_DEFERRED' });

    expect(sink.requests).toHaveLength(1);
    // `idempotencyKey` la thu quan trong nhat: no la cach ghi BU dung hang con thieu ma khong trung.
    expect(sink.requests[0]).toMatchObject({
      tenantId: 't-alpha',
      decisionPoint: 'gate.evaluate',
      reasonCode: 'GATE_CLOSED',
      subjectType: 'case',
      subjectId: 'case_1',
      criticality: 'BUSINESS_STANDARD',
    });
    expect(sink.requests[0]?.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('quan sat: di tiep, KHONG phat yeu cau doi soat', async () => {
    const result = await brittle.record(gate(ALPHA, { criticality: 'ADVISORY' }));
    expect(result).toMatchObject({ persisted: false, reason: 'LEDGER_WRITE_DROPPED' });
    expect(sink.requests).toHaveLength(0);
  });

  it('sink hong KHONG lam sap duong nghiep vu ma chinh sach vua cho di tiep', async () => {
    class BrokenSink extends DecisionReconciliationSink {
      require(): never {
        throw new Error('sink hong');
      }
    }
    const service = new DecisionLedgerService(
      failing,
      undefined,
      sourceRepository,
      new BrokenSink(),
    );
    await expect(service.record(gate(ALPHA))).resolves.toMatchObject({ persisted: false });
  });

  it('KHONG co sink nao thi van khong nem — nhung ket qua van noi ro la chua ghi duoc', async () => {
    const service = new DecisionLedgerService(failing, undefined, sourceRepository);
    await expect(service.record(gate(ALPHA))).resolves.toMatchObject({
      persisted: false,
      decision: null,
      reason: 'LEDGER_WRITE_DEFERRED',
    });
  });

  it('duong DOC khong do theo khi duong GHI hong', async () => {
    // SEED mot hang THAT vao chinh kho do, roi moi lam duong ghi hong. Khong co buoc seed nay thi
    // bai test se xanh chi vi kho rong — tuc no khong chung minh gi ca.
    failing.writesFail = false;
    const seeded = await brittle.record(gate(ALPHA));
    expect(seeded.persisted).toBe(true);
    failing.writesFail = true;

    // Ghi hong, nhung doc VAN ra dung hang da co. Mot so cai khong ghi duoc ma cung khong doc
    // duoc thi su co ghi bien thanh su co ca hai chieu — muc 11 cam dieu do.
    const timeline = await brittle.timelineForSubject(ALPHA, 'case', 'case_1');
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.reasonCode).toBe('GATE_CLOSED');
    await expect(
      brittle.record(gate(ALPHA, { occurrence: { kind: 'turn', traceId: 'trace-2' } })),
    ).resolves.toMatchObject({ persisted: false });
  });
});
