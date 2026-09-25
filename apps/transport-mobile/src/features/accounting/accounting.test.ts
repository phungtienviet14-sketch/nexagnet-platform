import { describe, expect, it } from 'vitest';
import type { ExpenseClaim, WaitingAllowance } from '../office/decision-types';
import { checkRejectReason, fuelActions, fuelContextLabel, verifyConsequence } from './fuel';
import { buildQueue, chipCount, entryKey, filterQueue, nextAfter, queueCounts } from './queue';
import type { FuelEntryPage, FuelEntryRow } from './types';

const claim = (id: string, tripId: string | null = 't'): ExpenseClaim => ({
  id,
  driverId: 'd1',
  status: 'PENDING_REVIEW',
  categoryCode: 'TOLL',
  claimedAmount: 100_000,
  approvedAmount: null,
  currencyCode: 'VND',
  businessDate: '2026-09-25',
  note: null,
  tripId,
  runId: null,
  legId: null,
  submittedAt: '2026-09-25T01:00:00Z',
});

const fuelRow = (id: string, over: Partial<FuelEntryRow> = {}): FuelEntryRow => ({
  id,
  tripId: null,
  tripCode: null,
  runCode: 'VC-1',
  legSequence: 2,
  driverId: 'd1',
  driverName: 'A',
  vehicleId: 'v1',
  vehiclePlate: '29C',
  supplierName: null,
  stationId: null,
  stationName: null,
  businessDate: '2026-09-25',
  occurredAt: '2026-09-25T01:00:00Z',
  litersUnits: 50,
  amount: 1_000_000,
  currencyCode: 'VND',
  invoiceNo: null,
  paymentMethod: 'DRIVER_CASH',
  verificationStatus: 'DECLARED',
  reviewReasons: [],
  reviewNote: null,
  evidenceCount: 1,
  evidence: [{ id: 'e1', contentType: 'image/jpeg' }],
  ...over,
});

const page = (rows: FuelEntryRow[], pending: number): FuelEntryPage => ({
  rows,
  total: rows.length,
  pendingVerificationCount: pending,
  limit: 50,
  offset: 0,
});

const allowance: WaitingAllowance = {
  id: 'w1',
  driverId: 'd1',
  status: 'PENDING',
  currencyCode: 'VND',
  candidateAmount: 200_000,
  approvedAmount: null,
  reason: 'Chờ 5 tiếng',
  businessDate: '2026-09-25',
};

describe('hang can duyet', () => {
  const sources = {
    claims: [claim('c1'), claim('c2', null)],
    fuel: page([fuelRow('f1')], 73),
    allowances: [allowance],
  };

  it('gop ba nguon, giu thu tu may chu trong tung nguon', () => {
    expect(buildQueue(sources).map(entryKey)).toEqual([
      'CLAIM:c1',
      'CLAIM:c2',
      'FUEL:f1',
      'ALLOWANCE:w1',
    ]);
    expect(filterQueue(buildQueue(sources), 'FUEL')).toHaveLength(1);
  });

  it('chip phieu dau dung so may chu va noi ro khi danh sach bi cat', () => {
    const counts = queueCounts(sources);
    expect(chipCount(counts.FUEL)).toBe('1/73');
    expect(chipCount(counts.CLAIM)).toBe('2');
    expect(counts.ALL.total).toBe(76);
  });

  it('nguon chua doc thi khong in 0', () => {
    expect(chipCount(queueCounts({}).ALL)).toBeNull();
    expect(chipCount(queueCounts({ claims: [] }).FUEL)).toBeNull();
  });

  it('viec ke tiep: sau, het thi truoc, khong con thi null', () => {
    const entries = buildQueue(sources);
    expect(nextAfter(entries, 'CLAIM:c1')?.id).toBe('c2');
    expect(nextAfter(entries, 'ALLOWANCE:w1')?.id).toBe('f1');
    expect(nextAfter([], 'CLAIM:c1')).toBeNull();
  });
});

describe('phieu dau', () => {
  it('hau qua xac thuc theo cach tra', () => {
    expect(verifyConsequence(fuelRow('f', { paymentMethod: 'SUPPLIER_ACCOUNT' }))).toContain(
      'kỳ đối soát',
    );
    expect(verifyConsequence(fuelRow('f'))).toContain('trừ vào quỹ lái xe');
  });

  it('nut theo trang thai + quyen', () => {
    expect(fuelActions('DECLARED', true)).toEqual({
      canVerify: true,
      canReject: true,
      canResubmit: false,
    });
    expect(fuelActions('REJECTED', true).canResubmit).toBe(true);
    expect(fuelActions('DECLARED', false).canVerify).toBe(false);
  });

  it('ngu canh khong bia ma; ly do tu choi 1..500', () => {
    expect(fuelContextLabel(fuelRow('f'))).toBe('Vòng xe VC-1 · Chặng 2');
    expect(fuelContextLabel(fuelRow('f', { runCode: null }))).toBe('Không gắn việc');
    expect(checkRejectReason('').ok).toBe(false);
    expect(checkRejectReason('x'.repeat(501)).ok).toBe(false);
  });
});
