import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySourceRegistryRepository } from '../../source-registry/in-memory-source-registry.repository.js';
import { testTenantScope } from '../../source-registry/tenant-scope.js';
import { TRANSPORT_COSTING_DECISIONS } from '../../transport/costing/costing-decisions.js';
import { DecisionLedgerService } from '../decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from '../in-memory-decision-ledger.repository.js';

/**
 * BAN CHUNG MINH B — mien VAN TAI, dung CUNG mot API (muc 8 hop dong nhiem vu).
 *
 * Cac cong dung o day la cong TAT DINH DA CO TREN `main`, khong phai cong bia cho ban chung minh:
 * `trip_expense.record`, `driver_fund.post_entry`, `fund_period.transition` — tat ca deu tu
 * `TRANSPORT_COSTING_DECISIONS`. Muc 8 noi ro khong duoc doi ngu nghia nghiep vu cua van tai chi
 * de ban chung minh nay chay duoc, va tep nay khong doi mot dong nao cua mien do.
 *
 * DIEU DUOC CHUNG MINH: cot loi so cai khong co MOT nhanh nao theo mien. Cung `record()`, cung
 * `correct()`, cung chinh sach chong trung va cung chinh sach that bai — chi khac bo tu vung va
 * ten loai ca (`trip` thay vi `order`).
 *
 * SO LIEU LA TONG HOP.
 */

const CARRIER = testTenantScope('khach-van-tai');

let ledger: DecisionLedgerService;

beforeEach(() => {
  ledger = new DecisionLedgerService(
    new InMemoryDecisionLedgerRepository(),
    undefined,
    new InMemorySourceRegistryRepository(),
  );
});

const AT = new Date('2026-08-31T02:00:00Z');
const TRIP = { type: 'trip', id: 'trip_01H8XGJDEMO' } as const;

describe('B1 — cong tat dinh cua van tai ghi duoc bang API chung', () => {
  it('mot khoan chi bi tu choi vi ky da dong, kem chinh sach da ap', async () => {
    // `EXPENSE_PERIOD_FROZEN` la mot trong sau duong tu choi CO THAT cua `recordTripExpense()`.
    const written = await ledger.record({
      scope: CARRIER,
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'trip_expense.record',
      outcome: 'denied',
      reason: 'EXPENSE_PERIOD_FROZEN',
      subject: TRIP,
      occurrence: { kind: 'externalKey', key: 'chi-phi-001' },
      actorKind: 'DETERMINISTIC_RULE',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      policyRef: 'INV-22',
      policyVersion: 'v1',
      occurredAt: AT,
      detail: { businessDate: '2026-08-15', periodStatus: 'CLOSED' },
    });

    expect(written.decision).toMatchObject({
      tenantId: 'khach-van-tai',
      decisionPoint: 'trip_expense.record',
      reasonCode: 'EXPENSE_PERIOD_FROZEN',
      subjectType: 'trip',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      policyRef: 'INV-22',
    });
    // Ngay nghiep vu di vao bang chung dang CHUOI `YYYY-MM-DD`, dung quy uoc `INV-25` cua mien —
    // khong phai timestamp, nen khong ai suy nguoc ra ngay bang UTC.
    expect(written.decision?.detail).toEqual({
      businessDate: '2026-08-15',
      periodStatus: 'CLOSED',
    });
  });

  it('sau duong tu choi cua mot cong deu ghi duoc, va phan biet duoc', async () => {
    // Day la ly do bo ma ton tai: gop lai thanh mot `false` thi nguoi truc phai mo source doc lai
    // sau dieu kien roi doan xem cai nao da dong.
    const reasons = [
      'EXPENSE_TRIP_RECONCILED',
      'EXPENSE_TRIP_CANCELLED',
      'EXPENSE_TRIP_OUTSOURCED',
      'EXPENSE_PERIOD_FROZEN',
      'EXPENSE_DRIVER_NOT_ASSIGNED',
      'EXPENSE_IDEMPOTENT_REPLAY',
    ] as const;

    for (const [index, reason] of reasons.entries()) {
      await ledger.record({
        scope: CARRIER,
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'trip_expense.record',
        outcome: 'denied',
        reason,
        subject: TRIP,
        occurrence: { kind: 'externalKey', key: `chi-phi-${index}` },
        actorKind: 'DETERMINISTIC_RULE',
        criticality: 'FINANCIAL_OR_AUTHORIZATION',
        occurredAt: new Date(AT.getTime() + index * 1000),
      });
    }

    const timeline = await ledger.timelineForSubject(CARRIER, 'trip', TRIP.id);
    expect(timeline.map((row) => row.reasonCode)).toEqual([...reasons]);
  });
});

describe('B2 — but toan DAO cua van tai anh xa dung vao ban sua cua so cai', () => {
  it('bat bien "sua = dao + ghi moi" la CHINH mo hinh append-only cua so cai', async () => {
    // Mien van tai da co bat bien "khong bao gio UPDATE/DELETE mot but toan". So cai khong bat
    // mien do doi cach lam viec — no ghi lai chinh cach do bang `correct()`.
    const posted = await ledger.record({
      scope: CARRIER,
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver_fund.post_entry',
      outcome: 'allowed',
      reason: 'FUND_ENTRY_POSTED',
      subject: TRIP,
      occurrence: { kind: 'externalKey', key: 'but-toan-001' },
      actorKind: 'DETERMINISTIC_RULE',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      occurredAt: AT,
    });
    const postedId = posted.decision?.id;
    if (!postedId) throw new Error('phai ghi duoc');

    const reversed = await ledger.correct({
      scope: CARRIER,
      correctsDecisionId: postedId,
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver_fund.post_entry',
      outcome: 'degraded',
      reason: 'FUND_ENTRY_PERIOD_FROZEN',
      occurrence: { kind: 'externalKey', key: 'but-toan-001-dao' },
      actorKind: 'HUMAN',
      actorRef: 'nguoi-doi-soat',
      criticality: 'FINANCIAL_OR_AUTHORIZATION',
      occurredAt: new Date('2026-08-31T03:00:00Z'),
      mode: 'CORRECTED',
    });

    // Ban goc GIU NGUYEN — do la dieu ma mot so cai tai chinh doi hoi.
    expect(await ledger.getById(CARRIER, postedId)).toMatchObject({
      reasonCode: 'FUND_ENTRY_POSTED',
      outcome: 'allowed',
      status: 'CORRECTED',
    });
    expect(reversed.decision?.supersedesId).toBe(postedId);
    expect(await ledger.timelineForSubject(CARRIER, 'trip', TRIP.id)).toHaveLength(2);
  });
});

describe('B3 — chay lai cua workflow khong sinh ban ghi trung', () => {
  it('cung `workflowRunId` cho MOT hang, va neo run duoc ghi ma khong phai khai lai', async () => {
    const occurrence = { kind: 'workflowRun', workflowRunId: 'run-chot-ky-8' } as const;
    const write = () =>
      ledger.record({
        scope: CARRIER,
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'fund_period.transition',
        outcome: 'allowed',
        reason: 'PERIOD_CLOSED',
        subject: { type: 'fund_period', id: 'period_2026_08' },
        occurrence,
        actorKind: 'SYSTEM_CONSEQUENCE',
        criticality: 'FINANCIAL_OR_AUTHORIZATION',
        occurredAt: AT,
      });

    const first = await write();
    const retry = await write();

    expect(retry.replayed).toBe(true);
    expect(retry.decision?.id).toBe(first.decision?.id);
    // Neo run duoc suy ra tu `occurrence` — ben goi khong phai khai lai cung mot thu hai lan.
    expect(first.decision?.workflowRunId).toBe('run-chot-ky-8');
    expect(await ledger.listForWorkflowRun(CARRIER, 'run-chot-ky-8')).toHaveLength(1);
  });
});
