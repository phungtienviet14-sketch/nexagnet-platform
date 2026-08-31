import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import { PrismaSourceRegistryRepository } from '../source-registry/prisma-source-registry.repository.js';
import { SourceRegistryService } from '../source-registry/source-registry.service.js';
import { testTenantScope } from '../source-registry/tenant-scope.js';
import { DecisionLedgerService } from './decision-ledger.service.js';
import { PrismaDecisionLedgerRepository } from './prisma-decision-ledger.repository.js';

/**
 * SO CAI QUYET DINH tren Postgres THAT — muc 13 hop dong nhiem vu.
 *
 * Bo in-memory chung minh QUY TAC; bo nay chung minh cai ma quy tac do dua vao: migration ap duoc,
 * khoa duy nhat `(tenantId, idempotencyKey)` THAT SU chan trung o tang DB, khoa ngoai sang
 * `BusinessFact` that su chan xoa mot su that da dung, `Json` giu duoc bang chung, va — quan trong
 * nhat — du lieu SONG QUA mot lan dung ket noi.
 *
 * `describe.runIf` theo quy uoc repo: khong co DB thi bo qua thay vi do. Nhung "xanh o may" KHONG
 * phu nhung bai nay; chung chay o job `integration` cua CI.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('So cai quyet dinh (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const ledgerRepository = new PrismaDecisionLedgerRepository(prisma);
  const sourceRepository = new PrismaSourceRegistryRepository(prisma);
  const registry = new SourceRegistryService(sourceRepository);
  const ledger = new DecisionLedgerService(ledgerRepository, undefined, sourceRepository);

  // Hai khach chay trong CUNG mot DB — dieu ma trien khai hom nay chua lam, va la dung ly do bai
  // cach ly phai chay o day chu khong chi o bo nho.
  const ALPHA = testTenantScope('it-led-alpha');
  const BRAVO = testTenantScope('it-led-bravo');
  const TENANTS = [ALPHA.tenantId, BRAVO.tenantId];

  const GATE = defineDecisionVocabulary({
    owner: 'it-domain',
    points: ['it.gate'],
    labels: { IT_CLOSED: 'Cong dong', IT_OPEN: 'Cong mo' },
  });

  const AT = new Date('2026-08-31T02:00:00.000Z');

  async function cleanup(): Promise<void> {
    // Thu tu xoa di theo chieu phu thuoc; `deleteMany` gioi han dung hai tenant cua bai test —
    // KHONG bao gio dung `deleteMany({})` o day, DB nay co the dang chua du lieu that.
    const decisions = await prisma.businessDecision.findMany({
      where: { tenantId: { in: TENANTS } },
      select: { id: true },
    });
    const decisionIds = decisions.map((row) => row.id);
    await prisma.businessDecisionFactRef.deleteMany({
      where: { decisionId: { in: decisionIds } },
    });
    await prisma.businessDecisionRelation.deleteMany({
      where: { decisionId: { in: decisionIds } },
    });
    // Quyet dinh tro toi nhau qua `supersedesId`: go lien ket truoc roi moi xoa.
    await prisma.businessDecision.updateMany({
      where: { tenantId: { in: TENANTS } },
      data: { supersedesId: null },
    });
    await prisma.businessDecision.deleteMany({ where: { tenantId: { in: TENANTS } } });

    await prisma.businessApproval.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.businessFact.updateMany({
      where: { tenantId: { in: TENANTS } },
      data: { supersedesId: null },
    });
    await prisma.businessFact.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.businessSource.updateMany({
      where: { tenantId: { in: TENANTS } },
      data: { supersedesId: null },
    });
    await prisma.businessSource.deleteMany({ where: { tenantId: { in: TENANTS } } });
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /** Dua mot su that di het duong toi `CONFIRMED`, kem ban nguon co hieu luc dang sau. */
  async function confirmedFact(scope: typeof ALPHA, version: string, hash: string) {
    const source = await registry.registerSource(scope, {
      sourceKey: 'it-cong-bo',
      title: `Ban cong bo ${version}`,
      kind: 'it_announcement',
      version,
      origin: 'CUSTOMER_SIGNED',
      authority: 'L2_CUSTOMER_PUBLISHED',
      classification: 'BUSINESS_SENSITIVE',
      locator: `vault://it/${version}`,
      contentHash: hash,
      receivedAt: AT,
    });
    await registry.transitionSource(scope, source.id, 'REVIEWED');
    await registry.approveSource(scope, source.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'it-actor',
      evidenceRef: `it-evidence-${version}`,
    });
    const effective = await registry.makeSourceEffective(scope, source.id, AT);
    const fact = await registry.submitFact(scope, {
      domain: 'it_policy',
      key: 'it.limit',
      value: { limit: 50 },
      sourceId: effective.id,
      classification: 'INTERNAL',
    });
    await registry.confirmFact(scope, fact.id, {
      level: 'CUSTOMER_CONFIRMED',
      actor: 'it-actor',
      evidenceRef: `it-evidence-${version}`,
    });
    return { source: effective, fact };
  }

  const gate = (scope: typeof ALPHA, overrides: Record<string, unknown> = {}) =>
    ({
      scope,
      vocabulary: GATE,
      point: 'it.gate',
      outcome: 'denied',
      reason: 'IT_CLOSED',
      subject: { type: 'it_case', id: 'it_case_1' },
      occurrence: { kind: 'turn', traceId: 'it-trace-1' },
      actorKind: 'DETERMINISTIC_RULE',
      occurredAt: AT,
      ...overrides,
    }) as Parameters<DecisionLedgerService['record']>[0];

  const fullWrite = (extra: Record<string, unknown> = {}) =>
    gate(ALPHA, {
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      policyRef: 'it.limit',
      policyVersion: 'v1',
      workflowRunId: 'it-run-1',
      detail: { totalQuantity: 60, threshold: 50, note: 'tong hop' },
      ...extra,
    });

  it('tam buoc: ghi, doc, chong trung, su that, sua, cach ly, khoa ngoai, ben vung', async () => {
    /* 1. GHI, kem bang chung va tham chieu su that. */
    const { source, fact } = await confirmedFact(ALPHA, 'v1', '1'.repeat(64));
    const written = await ledger.record(
      fullWrite({
        facts: [
          {
            factId: fact.id,
            factDomain: 'it_policy',
            factKey: 'it.limit',
            factStatusAtUse: 'CONFIRMED',
          },
        ],
        relations: [{ kind: 'RESULTING_ENTITY', targetType: 'it_task', targetId: 'it_task_1' }],
      }),
    );
    expect(written.persisted).toBe(true);
    const decisionId = written.decision?.id;
    if (!decisionId) throw new Error('phai ghi duoc');

    /* 2. DOC lai — `Json` giu duoc bang chung, quan he va tham chieu con nguyen. */
    const read = await ledger.getById(ALPHA, decisionId);
    expect(read).toMatchObject({
      decisionPoint: 'it.gate',
      reasonCode: 'IT_CLOSED',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      workflowRunId: 'it-run-1',
      status: 'RECORDED',
      detail: { totalQuantity: 60, threshold: 50, note: 'tong hop' },
    });
    expect(read?.factRefs).toEqual([
      expect.objectContaining({
        factId: fact.id,
        factStatusAtUse: 'CONFIRMED',
        sourceId: source.id,
        sourceVersion: 'v1',
      }),
    ]);
    expect(read?.relations).toEqual([
      expect.objectContaining({ kind: 'RESULTING_ENTITY', targetId: 'it_task_1' }),
    ]);
    expect(await ledger.listForWorkflowRun(ALPHA, 'it-run-1')).toHaveLength(1);

    /* 3. CHONG TRUNG. Khoa duy nhat `(tenantId, idempotencyKey)` phai la thu that. */
    const replay = await ledger.record(fullWrite());
    expect(replay.replayed).toBe(true);
    expect(replay.decision?.id).toBe(decisionId);
    expect(await prisma.businessDecision.count({ where: { tenantId: ALPHA.tenantId } })).toBe(1);

    /* 4. SU THAT bi thay the: hang cu VAN tro ban cu, VOI trang thai luc dung. */
    const next = await confirmedFact(ALPHA, 'v2', '2'.repeat(64));
    await registry.supersedeFact(ALPHA, {
      previousFactId: fact.id,
      nextFactId: next.fact.id,
      at: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect((await registry.findFactById(ALPHA, fact.id))?.status).toBe('SUPERSEDED');
    expect((await ledger.getById(ALPHA, decisionId))?.factRefs[0]).toMatchObject({
      factId: fact.id,
      factStatusAtUse: 'CONFIRMED',
      sourceVersion: 'v1',
    });

    /* 5. SUA la GHI THEM — ca hai hang cung song. */
    const corrected = await ledger.correct({
      scope: ALPHA,
      correctsDecisionId: decisionId,
      vocabulary: GATE,
      point: 'it.gate',
      outcome: 'allowed',
      reason: 'IT_OPEN',
      occurrence: { kind: 'turn', traceId: 'it-trace-sua' },
      actorKind: 'HUMAN',
      actorRef: 'it-operator',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      occurredAt: new Date('2026-08-31T04:00:00.000Z'),
    });
    expect(corrected.decision?.supersedesId).toBe(decisionId);
    expect((await ledger.getById(ALPHA, decisionId))?.status).toBe('CORRECTED');
    expect(await ledger.timelineForSubject(ALPHA, 'it_case', 'it_case_1')).toHaveLength(2);

    /* 6. CACH LY KHACH tren CUNG mot DB. */
    expect(await ledger.getById(BRAVO, decisionId)).toBeNull();
    expect(await ledger.timelineForSubject(BRAVO, 'it_case', 'it_case_1')).toEqual([]);
    // Cung khoa chong trung, khach khac: hang RIENG, khong phai mot lan chay lai.
    const bravo = await ledger.record(gate(BRAVO));
    expect(bravo.replayed).toBe(false);
    expect(await ledger.timelineForSubject(BRAVO, 'it_case', 'it_case_1')).toHaveLength(1);

    const bravoFact = await confirmedFact(BRAVO, 'v1', 'b'.repeat(64));
    await expect(
      ledger.record(
        gate(ALPHA, {
          occurrence: { kind: 'turn', traceId: 'it-trace-cross' },
          facts: [
            {
              factId: bravoFact.fact.id,
              factDomain: 'it_policy',
              factKey: 'it.limit',
              factStatusAtUse: 'CONFIRMED',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ reason: 'LEDGER_FACT_NOT_IN_SCOPE' });

    /* 7. KHOA NGOAI that su chan xoa mot su that DA DUOC DUNG de quyet dinh. */
    await expect(prisma.businessFact.delete({ where: { id: fact.id } })).rejects.toThrowError();

    /* 8. BEN VUNG qua mot lan dung ket noi — ca diem cua mat phang su that nghiep vu. */
    await prisma.$disconnect();
    const reconnected = new PrismaService();
    try {
      const fresh = new DecisionLedgerService(
        new PrismaDecisionLedgerRepository(reconnected),
        undefined,
        new PrismaSourceRegistryRepository(reconnected),
      );
      const timeline = await fresh.timelineForSubject(ALPHA, 'it_case', 'it_case_1');
      expect(timeline.map((row) => [row.reasonCode, row.status])).toEqual([
        ['IT_CLOSED', 'CORRECTED'],
        ['IT_OPEN', 'RECORDED'],
      ]);
      expect(timeline[0]?.factRefs[0]?.factId).toBe(fact.id);
      expect(timeline[0]?.detail).toMatchObject({ totalQuantity: 60 });
    } finally {
      await reconnected.$disconnect();
    }
  });

  it('cong chong trung o tang DB chan ca khi hai tien trinh cung ghi mot luc', async () => {
    // Bo doc-truoc o dich vu KHONG chan duoc dieu kien tranh chap giua hai tien trinh; chi rang
    // buoc `@@unique` cua Postgres chan duoc. Bai nay goi thang xuong kho de bo qua bo doc do.
    const input = {
      decisionPoint: 'it.gate',
      outcome: 'denied' as const,
      reasonCode: 'IT_CLOSED',
      subjectType: 'it_case',
      subjectId: 'it_case_race',
      occurredAt: AT,
      actorKind: 'DETERMINISTIC_RULE' as const,
      criticality: 'BUSINESS_STANDARD' as const,
      idempotencyKey: 'it-khoa-tranh-chap',
      fingerprint: 'it-dau-tay',
    };
    await ledgerRepository.append(ALPHA, input);
    await expect(ledgerRepository.append(ALPHA, input)).rejects.toThrowError();
    expect(
      await prisma.businessDecision.count({
        where: { tenantId: ALPHA.tenantId, subjectId: 'it_case_race' },
      }),
    ).toBe(1);
  });
});
