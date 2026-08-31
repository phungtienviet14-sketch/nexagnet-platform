import { beforeEach, describe, expect, it } from 'vitest';
import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import { InMemorySourceRegistryRepository } from '../source-registry/in-memory-source-registry.repository.js';
import { testTenantScope } from '../source-registry/tenant-scope.js';
import { DecisionLedgerService } from './decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from './in-memory-decision-ledger.repository.js';

/**
 * HANH VI cua so cai quyet dinh.
 *
 * BO TU VUNG DUNG TRONG TEST LA MOT BO GIA, va do la mot khang dinh chu khong mot tien loi: neu
 * bai test nay phai muon `SALES_ORDER_DECISIONS` hay `TRANSPORT_COSTING_DECISIONS` de chay, thi
 * API cua so cai da biet ten mot mien nghiep vu.
 */
const GATE = defineDecisionVocabulary({
  owner: 'test-domain',
  points: ['gate.evaluate', 'gate.other'],
  labels: {
    GATE_OPEN: 'Cong mo',
    GATE_CLOSED: 'Cong dong',
    GATE_FALLBACK: 'Duong du phong',
  },
});

const TENANT = testTenantScope('t-alpha');

let ledgerRepository: InMemoryDecisionLedgerRepository;
let sourceRepository: InMemorySourceRegistryRepository;
let ledger: DecisionLedgerService;

beforeEach(() => {
  ledgerRepository = new InMemoryDecisionLedgerRepository();
  sourceRepository = new InMemorySourceRegistryRepository();
  ledger = new DecisionLedgerService(ledgerRepository, undefined, sourceRepository);
});

/** Dau vao toi thieu cua mot lan ghi — cac bai duoi chi doi phan chung minh dang noi ve. */
const deterministicGate = (overrides: Record<string, unknown> = {}) =>
  ({
    scope: TENANT,
    vocabulary: GATE,
    point: 'gate.evaluate',
    outcome: 'denied',
    reason: 'GATE_CLOSED',
    subject: { type: 'case', id: 'case_1' },
    occurrence: { kind: 'turn', traceId: 'trace-1' },
    actorKind: 'DETERMINISTIC_RULE',
    ...overrides,
  }) as Parameters<DecisionLedgerService['record']>[0];

describe('1-2. ghi mot quyet dinh tat dinh, roi doc lai bang ID', () => {
  it('ghi xong doc duoc lai day du, kem ma ly do CO KIEU', async () => {
    const result = await ledger.record(
      deterministicGate({
        policyRef: 'gate.limit',
        policyVersion: 'v3',
        detail: { totalQuantity: 60, threshold: 50 },
      }),
    );

    expect(result.persisted).toBe(true);
    expect(result.replayed).toBe(false);
    const written = result.decision;
    if (!written) throw new Error('phai ghi duoc');

    expect(await ledger.getById(TENANT, written.id)).toMatchObject({
      tenantId: 't-alpha',
      decisionPoint: 'gate.evaluate',
      outcome: 'denied',
      reasonCode: 'GATE_CLOSED',
      subjectType: 'case',
      subjectId: 'case_1',
      actorKind: 'DETERMINISTIC_RULE',
      criticality: 'BUSINESS_STANDARD',
      policyRef: 'gate.limit',
      policyVersion: 'v3',
      status: 'RECORDED',
      detail: { totalQuantity: 60, threshold: 50 },
    });
  });

  it('ma ly do ngoai bo tu vung bi tu choi — khong co chuoi tu do trong cot ly do', async () => {
    await expect(
      ledger.record(deterministicGate({ reason: 'don qua lon nen khong gui' })),
    ).rejects.toMatchObject({ reason: 'LEDGER_REASON_NOT_IN_VOCABULARY' });
  });

  it('diem quyet dinh ngoai bo tu vung bi tu choi', async () => {
    await expect(
      ledger.record(deterministicGate({ point: 'gate.khong-ton-tai' })),
    ).rejects.toMatchObject({ reason: 'LEDGER_POINT_NOT_IN_VOCABULARY' });
  });

  it('ca nghiep vu rong bi tu choi', async () => {
    await expect(
      ledger.record(deterministicGate({ subject: { type: 'case', id: '  ' } })),
    ).rejects.toMatchObject({ reason: 'LEDGER_SUBJECT_MISSING' });
  });

  it('so dien thoai lam khoa ca bi tu choi', async () => {
    await expect(
      ledger.record(deterministicGate({ subject: { type: 'case', id: '0912345678' } })),
    ).rejects.toMatchObject({ reason: 'LEDGER_SUBJECT_NOT_AN_IDENTIFIER' });
  });
});

describe('3-4. doc theo ca, va DONG THOI GIAN co thu tu TAT DINH', () => {
  it('cung mot moc thoi gian van ra dung thu tu GHI, on dinh qua nhieu lan doc', async () => {
    // Mot luot ra ba quyet dinh trong cung mot mili-giay la chuyen thuong. Neu thu tu khong tat
    // dinh thi cung mot cau truy van ke lai ca theo hai kieu giua hai lan chay.
    const sameInstant = new Date('2026-08-31T03:00:00.000Z');
    const steps = ['GATE_CLOSED', 'GATE_FALLBACK', 'GATE_OPEN'] as const;
    for (const [index, reason] of steps.entries()) {
      await ledger.record(
        deterministicGate({
          reason,
          outcome: reason === 'GATE_OPEN' ? 'allowed' : 'denied',
          occurredAt: sameInstant,
          occurrence: { kind: 'externalKey', key: `step-${index}` },
        }),
      );
    }

    const first = await ledger.timelineForSubject(TENANT, 'case', 'case_1');
    const second = await ledger.timelineForSubject(TENANT, 'case', 'case_1');
    expect(first.map((row) => row.reasonCode)).toEqual([...steps]);
    expect(second.map((row) => row.reasonCode)).toEqual(first.map((row) => row.reasonCode));
  });

  it('ca khac khong lan vao dong thoi gian nay', async () => {
    await ledger.record(deterministicGate());
    await ledger.record(
      deterministicGate({
        subject: { type: 'case', id: 'case_2' },
        occurrence: { kind: 'turn', traceId: 'trace-2' },
      }),
    );
    expect(await ledger.timelineForSubject(TENANT, 'case', 'case_1')).toHaveLength(1);
    expect(await ledger.timelineForSubject(TENANT, 'case', 'case_2')).toHaveLength(1);
  });
});

describe('9-10. chong trung', () => {
  it('chay lai cung khoa -> KHONG ghi hang thu hai, va biet minh la lan chay lai', async () => {
    const first = await ledger.record(deterministicGate());
    const retry = await ledger.record(deterministicGate());

    expect(retry.replayed).toBe(true);
    expect(retry.decision?.id).toBe(first.decision?.id);
    expect(await ledger.timelineForSubject(TENANT, 'case', 'case_1')).toHaveLength(1);
  });

  it('mot quyet dinh THAT SU khac (luot khac) -> hang RIENG', async () => {
    await ledger.record(deterministicGate({ occurrence: { kind: 'turn', traceId: 'trace-1' } }));
    await ledger.record(deterministicGate({ occurrence: { kind: 'turn', traceId: 'trace-2' } }));
    expect(await ledger.timelineForSubject(TENANT, 'case', 'case_1')).toHaveLength(2);
  });

  it('cung khoa nhung KHAC noi dung thi NEM, khong tra ve hang cu', async () => {
    // Tra ve hang cu o day se lam ben goi tin rang quyet dinh MOI cua no da duoc ghi.
    await ledger.record(deterministicGate());
    await expect(
      ledger.record(deterministicGate({ outcome: 'allowed', reason: 'GATE_OPEN' })),
    ).rejects.toMatchObject({ reason: 'LEDGER_IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('hai lan thu cua CUNG mot workflow run la CUNG mot quyet dinh', async () => {
    const occurrence = { kind: 'workflowRun', workflowRunId: 'run-9' };
    await ledger.record(deterministicGate({ occurrence, workflowRunId: 'run-9' }));
    const retry = await ledger.record(deterministicGate({ occurrence, workflowRunId: 'run-9' }));
    expect(retry.replayed).toBe(true);
    expect(await ledger.listForWorkflowRun(TENANT, 'run-9')).toHaveLength(1);
  });
});

describe('6. LLM khong bao gio la tham quyen ben vung', () => {
  it('de xuat cua LLM o muc tien/tham quyen bi TU CHOI', async () => {
    await expect(
      ledger.record(
        deterministicGate({
          actorKind: 'LLM_RECOMMENDATION',
          criticality: 'FINANCIAL_OR_AUTHORIZATION',
          model: { provider: 'anthropic', ref: 'claude-opus-5' },
        }),
      ),
    ).rejects.toMatchObject({ reason: 'LEDGER_LLM_NOT_AUTHORITATIVE' });
  });

  it('de xuat cua LLM o muc quan sat thi ghi duoc — bi cam DOI VAI, khong bi cam ton tai', async () => {
    const advice = await ledger.record(
      deterministicGate({
        actorKind: 'LLM_RECOMMENDATION',
        criticality: 'ADVISORY',
        model: { provider: 'anthropic', ref: 'claude-opus-5' },
      }),
    );
    expect(advice.decision).toMatchObject({
      actorKind: 'LLM_RECOMMENDATION',
      criticality: 'ADVISORY',
      modelProvider: 'anthropic',
      modelRef: 'claude-opus-5',
    });
  });

  it('duong DUNG: de xuat roi quyet dinh cua NGUOI, noi bang PARENT_DECISION', async () => {
    const advice = await ledger.record(
      deterministicGate({
        actorKind: 'LLM_RECOMMENDATION',
        criticality: 'ADVISORY',
        occurrence: { kind: 'turn', traceId: 'trace-advice' },
      }),
    );
    const adviceId = advice.decision?.id;
    if (!adviceId) throw new Error('phai ghi duoc de xuat');

    const approved = await ledger.record(
      deterministicGate({
        outcome: 'allowed',
        reason: 'GATE_OPEN',
        actorKind: 'HUMAN',
        actorRef: 'nguoi-van-hanh',
        criticality: 'FINANCIAL_OR_AUTHORIZATION',
        approvalRef: 'phe-duyet-001',
        occurrence: { kind: 'turn', traceId: 'trace-approve' },
        relations: [{ kind: 'PARENT_DECISION', targetType: 'decision', targetId: adviceId }],
      }),
    );

    // HAI hang, phan biet duoc — khong phai mot de xuat duoc doc nham la mot quyet dinh da duyet.
    const timeline = await ledger.timelineForSubject(TENANT, 'case', 'case_1');
    expect(timeline).toHaveLength(2);
    expect(approved.decision?.actorKind).toBe('HUMAN');
    expect(approved.decision?.relations).toEqual([
      expect.objectContaining({ kind: 'PARENT_DECISION', targetId: adviceId }),
    ]);
  });
});

/** Gia tri co HINH DANG khoa nha cung cap, ghep luc chay — xem chu thich o `decision-evidence.spec.ts`. */
const VENDOR_KEY_SHAPED = ['sk', 'ant', '0123456789abcdef0123'].join('-');

describe('12. bang chung mat bi hop dong tu choi', () => {
  it.each([
    ['so tien', { unitPrice: 1_150_000 }],
    ['so dien thoai', { customerPhone: '0912345678' }],
    ['noi dung tin', { rawText: 'gui ve TN cho c' }],
    ['prompt LLM', { prompt: 'ban la tro ly...' }],
    ['bi mat', { apiKey: VENDOR_KEY_SHAPED }],
  ])('tu choi %s trong `detail`', async (_label, detail) => {
    await expect(ledger.record(deterministicGate({ detail }))).rejects.toMatchObject({
      reason: 'LEDGER_EVIDENCE_REJECTED',
    });
  });

  it('khong ghi gi khi bang chung bi tu choi — cong dong TRUOC lan cham kho', async () => {
    await expect(
      ledger.record(deterministicGate({ detail: { unitPrice: 1 } })),
    ).rejects.toThrowError();
    expect(await ledger.timelineForSubject(TENANT, 'case', 'case_1')).toHaveLength(0);
  });
});
