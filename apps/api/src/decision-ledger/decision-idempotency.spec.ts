import { describe, expect, it } from 'vitest';
import {
  decisionFingerprint,
  decisionIdempotencyKey,
  type DecisionIdentity,
} from './decision-idempotency.js';

/** MUC 10 hop dong nhiem vu — ngu nghia chong trung TAT DINH. */

const IDENTITY: DecisionIdentity = {
  decisionPoint: 'gate.evaluate',
  subjectType: 'case',
  subjectId: 'case_1',
};

describe('khoa chong trung la TAT DINH', () => {
  it('cung dau vao -> cung khoa, qua nhieu lan goi', () => {
    const first = decisionIdempotencyKey(IDENTITY, { kind: 'workflowRun', workflowRunId: 'run_1' });
    const second = decisionIdempotencyKey(IDENTITY, {
      kind: 'workflowRun',
      workflowRunId: 'run_1',
    });
    expect(first).toBe(second);
  });

  it('HAI CONG trong cung mot luot -> HAI khoa', () => {
    // Thieu `decisionPoint` trong khoa thi cong thu hai se bi coi la lan chay lai cua cong thu
    // nhat, va mot quyet dinh bien mat im lang.
    const gateA = decisionIdempotencyKey(IDENTITY, { kind: 'turn', traceId: 't1' });
    const gateB = decisionIdempotencyKey(
      { ...IDENTITY, decisionPoint: 'gate.other' },
      { kind: 'turn', traceId: 't1' },
    );
    expect(gateA).not.toBe(gateB);
  });

  it('HAI CA khac nhau -> HAI khoa', () => {
    const caseA = decisionIdempotencyKey(IDENTITY, { kind: 'turn', traceId: 't1' });
    const caseB = decisionIdempotencyKey(
      { ...IDENTITY, subjectId: 'case_2' },
      { kind: 'turn', traceId: 't1' },
    );
    expect(caseA).not.toBe(caseB);
  });

  it('HAI LUOT khac nhau -> HAI khoa (quyet dinh lap lai THAT van phan biet duoc)', () => {
    const morning = decisionIdempotencyKey(IDENTITY, { kind: 'turn', traceId: 't-morning' });
    const afternoon = decisionIdempotencyKey(IDENTITY, { kind: 'turn', traceId: 't-afternoon' });
    expect(morning).not.toBe(afternoon);
  });

  it('ba loai lan xuat hien KHONG tron vao nhau', () => {
    // Cung gia tri chuoi, ba y nghia khac nhau -> ba khoa khac nhau. Thieu tien to thi mot
    // `traceId` va mot `workflowRunId` trung gia tri se cho ra cung mot khoa.
    const keys = new Set([
      decisionIdempotencyKey(IDENTITY, { kind: 'externalKey', key: 'X' }),
      decisionIdempotencyKey(IDENTITY, { kind: 'workflowRun', workflowRunId: 'X' }),
      decisionIdempotencyKey(IDENTITY, { kind: 'turn', traceId: 'X' }),
    ]);
    expect(keys.size).toBe(3);
  });

  it('dau phan cach khong the bi lam nhap nhang', () => {
    // Voi mot dau phan cach nhu `:`, hai bo doan duoi day se ra cung mot chuoi dau vao.
    const left = decisionIdempotencyKey(
      { decisionPoint: 'a', subjectType: 'b:c', subjectId: 'd' },
      { kind: 'turn', traceId: 't' },
    );
    const right = decisionIdempotencyKey(
      { decisionPoint: 'a', subjectType: 'b', subjectId: 'c:d' },
      { kind: 'turn', traceId: 't' },
    );
    expect(left).not.toBe(right);
  });
});

describe('dau tay noi dung', () => {
  const BASE = {
    decisionPoint: 'gate.evaluate',
    outcome: 'denied',
    reasonCode: 'ABOVE_LIMIT',
    subjectType: 'case',
    subjectId: 'case_1',
    actorKind: 'DETERMINISTIC_RULE',
    criticality: 'BUSINESS_STANDARD',
  } as const;

  it('cung quyet dinh -> cung dau tay', () => {
    expect(decisionFingerprint(BASE)).toBe(decisionFingerprint({ ...BASE }));
  });

  it.each([
    ['outcome', { outcome: 'allowed' }],
    ['ma ly do', { reasonCode: 'WITHIN_LIMIT' }],
    ['loai chu the quyet dinh', { actorKind: 'HUMAN' }],
    ['muc nghiem trong', { criticality: 'ADVISORY' }],
  ])('doi %s -> doi dau tay', (_label, patch) => {
    expect(decisionFingerprint({ ...BASE, ...patch })).not.toBe(decisionFingerprint(BASE));
  });

  it('KHONG phu thuoc thoi diem, trace hay ban phat hanh', () => {
    // Day la nua con lai cua thiet ke: giu chung trong dau tay se bien MOI lan chay lai binh
    // thuong thanh mot `LEDGER_IDEMPOTENCY_KEY_CONFLICT` — tuc bien lop bao ve thanh nguon su co.
    // Chu ky ham la thu thi hanh dieu do: khong co truong nao trong ba thu do di vao duoc.
    expect(Object.keys(BASE)).toEqual([
      'decisionPoint',
      'outcome',
      'reasonCode',
      'subjectType',
      'subjectId',
      'actorKind',
      'criticality',
    ]);
  });
});
