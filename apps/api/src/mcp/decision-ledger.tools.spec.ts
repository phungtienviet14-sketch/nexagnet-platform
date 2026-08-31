import { beforeEach, describe, expect, it } from 'vitest';
import { DecisionLedgerService } from '../decision-ledger/decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from '../decision-ledger/in-memory-decision-ledger.repository.js';
import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import { InMemorySourceRegistryRepository } from '../source-registry/in-memory-source-registry.repository.js';
import { testTenantScope } from '../source-registry/tenant-scope.js';
import {
  explainDecisionRefs,
  getDecision,
  listDecisionsForSubject,
} from './decision-ledger.tools.js';

/**
 * BA tool CHI DOC cua so cai — muc 15 hop dong nhiem vu.
 *
 * Bai quan trong nhat trong tep nay khong phai "tool tra ve du lieu", ma la hai bai cuoi: pham vi
 * khach den tu THAM SO TIEM VAO chu khong tu doi so cua tool, va khong co mot cong ghi nao.
 */

const GATE = defineDecisionVocabulary({
  owner: 'test-domain',
  points: ['gate.evaluate'],
  labels: { GATE_CLOSED: 'Cong dong' },
});

const ALPHA = testTenantScope('t-alpha');
const BRAVO = testTenantScope('t-bravo');

let ledger: DecisionLedgerService;

beforeEach(() => {
  ledger = new DecisionLedgerService(
    new InMemoryDecisionLedgerRepository(),
    undefined,
    new InMemorySourceRegistryRepository(),
  );
});

async function seed(scope = ALPHA) {
  const result = await ledger.record({
    scope,
    vocabulary: GATE,
    point: 'gate.evaluate',
    outcome: 'denied',
    reason: 'GATE_CLOSED',
    subject: { type: 'case', id: 'case_1' },
    occurrence: { kind: 'turn', traceId: 'trace-1' },
    actorKind: 'DETERMINISTIC_RULE',
    criticality: 'FINANCIAL_OR_AUTHORIZATION',
    policyRef: 'gate.limit',
    policyVersion: 'v1',
    occurredAt: new Date('2026-08-31T02:00:00Z'),
    detail: { totalQuantity: 60, threshold: 50 },
  });
  const id = result.decision?.id;
  if (!id) throw new Error('phai ghi duoc');
  return id;
}

describe('get_decision', () => {
  it('tra ve quyet dinh kem NHAN tieng Viet cua ma ly do', async () => {
    const id = await seed();
    const result = await getDecision(ledger, ALPHA, { decisionId: id });
    expect(result).toMatchObject({
      ok: true,
      decision: {
        id,
        decisionPoint: 'gate.evaluate',
        reasonCode: 'GATE_CLOSED',
        // Agent giai thich duoc tinh hinh ma khong phai tu dich mot ma no chua tung thay.
        reasonLabel: 'Cong dong',
        criticality: 'FINANCIAL_OR_AUTHORIZATION',
      },
    });
  });

  it('doi so rong bi tu choi truoc khi cham kho', async () => {
    expect(await getDecision(ledger, ALPHA, { decisionId: '  ' })).toMatchObject({ ok: false });
  });

  it('khong tim thay thi noi ro, khong nem', async () => {
    expect(await getDecision(ledger, ALPHA, { decisionId: 'khong-co' })).toMatchObject({
      ok: false,
    });
  });
});

describe('list_decisions_for_subject', () => {
  it('tra ve dong thoi gian cua mot ca', async () => {
    await seed();
    const result = await listDecisionsForSubject(ledger, ALPHA, {
      subjectType: 'case',
      subjectId: 'case_1',
    });
    expect(result).toMatchObject({ ok: true, count: 1 });
  });

  it('ca khong co gi tra ve danh sach rong, khong phai loi', async () => {
    expect(
      await listDecisionsForSubject(ledger, ALPHA, { subjectType: 'case', subjectId: 'case_9' }),
    ).toMatchObject({ ok: true, count: 0 });
  });
});

describe('explain_decision_refs', () => {
  it('gom BON MAT PHANG vao mot cho: su that, chinh sach, chu the, tuong quan', async () => {
    const id = await seed();
    const result = await explainDecisionRefs(ledger, ALPHA, { decisionId: id });
    expect(result).toMatchObject({
      ok: true,
      decisionId: id,
      reasonLabel: 'Cong dong',
      basis: {
        facts: [],
        policy: { ref: 'gate.limit', version: 'v1' },
        actor: { kind: 'DETERMINISTIC_RULE' },
        // Khong co LLM tham gia -> `null`, khong phai mot doi tuong rong doc len nhu "co model".
        model: null,
      },
      correlation: { traceId: 'trace-1' },
      lineage: { status: 'RECORDED', supersedesId: null },
    });
  });
});

describe('pham vi khach den tu THAM SO TIEM VAO, khong tu doi so cua tool', () => {
  it('khach khac khong doc duoc quyet dinh, ke ca khi biet dung ID', async () => {
    const id = await seed(ALPHA);
    expect(await getDecision(ledger, BRAVO, { decisionId: id })).toMatchObject({ ok: false });
    expect(
      await listDecisionsForSubject(ledger, BRAVO, { subjectType: 'case', subjectId: 'case_1' }),
    ).toMatchObject({ ok: true, count: 0 });
    expect(await explainDecisionRefs(ledger, BRAVO, { decisionId: id })).toMatchObject({
      ok: false,
    });
  });

  it('mot `tenantId` trong doi so KHONG doi duoc pham vi', async () => {
    // Chu ky ham la thu thi hanh dieu nay: `scope` la tham so thu hai, va doi so cua tool di vao
    // tham so thu ba. Mot truong thua trong doi so khong co duong nao cham toi pham vi.
    const id = await seed(ALPHA);
    expect(await getDecision(ledger, BRAVO, { decisionId: id, tenantId: 't-alpha' })).toMatchObject(
      { ok: false },
    );
  });
});

describe('khong co cong GHI nao trong be mat nay', () => {
  it('module chi export ba ham doc + hai schema + kieu', async () => {
    const module = await import('./decision-ledger.tools.js');
    const exported = Object.keys(module).sort();
    expect(exported).toEqual([
      'explainDecisionRefs',
      'getDecision',
      'getDecisionInput',
      'listDecisionsForSubject',
      'listForSubjectInput',
    ]);
  });
});
