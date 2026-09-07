import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHECKPOINT_POLICY,
  evaluateCheckpoint,
  isRepeatable,
  isRunScoped,
  requiredPredecessor,
  type CheckpointEvaluation,
} from './checkpoint-lifecycle.js';
import { RUN_CHECKPOINT_TYPES } from './checkpoint.types.js';

/**
 * HAT GIONG NGHIEM THU cua F1 (`#243`).
 *
 * Moi bai o day tra loi mot cau hoi nghiep vu, khong phai mot nhanh `if`. Neu doi mot bai thanh
 * "goi ham roi doc `allowed`", bai do het gia tri: cai duoc bao ve la MA LY DO, vi do la thu
 * nguoi van hanh doc tren trace khi mot lai xe bao "no khong cho toi bam".
 */

const base = (overrides: Partial<CheckpointEvaluation> = {}): CheckpointEvaluation => ({
  type: 'PICKUP_ARRIVAL',
  runTerminal: false,
  hasLeg: true,
  recordedTypes: [],
  hasObservation: false,
  policy: DEFAULT_CHECKPOINT_POLICY,
  ...overrides,
});

describe('pham vi moc', () => {
  it('bat moc muc vong chay gan vao mot chang', () => {
    const decision = evaluateCheckpoint(base({ type: 'DEPARTED', hasLeg: true }));
    expect(decision).toMatchObject({ allowed: false, reason: 'CHECKPOINT_LEG_NOT_APPLICABLE' });
  });

  it('bat moc muc chang khong kem chang nao', () => {
    const decision = evaluateCheckpoint(base({ type: 'PICKUP_ARRIVAL', hasLeg: false }));
    expect(decision).toMatchObject({ allowed: false, reason: 'CHECKPOINT_LEG_REQUIRED' });
  });

  it('ba moc thuoc muc vong chay, sau moc con lai thuoc muc chang', () => {
    const runScoped = RUN_CHECKPOINT_TYPES.filter(isRunScoped);
    expect(runScoped).toEqual(['ASSIGNED', 'DEPARTED', 'COMPLETED']);
  });
});

describe('thu tu nghiep vu', () => {
  it('khong roi diem lay hang khi chua den do, va noi ro thieu moc nao', () => {
    const decision = evaluateCheckpoint(base({ type: 'PICKUP_DEPARTURE', recordedTypes: [] }));
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'CHECKPOINT_PREDECESSOR_MISSING',
      requires: 'PICKUP_ARRIVAL',
    });
  });

  it('khong nhan hang khi chua den noi giao', () => {
    const decision = evaluateCheckpoint(
      base({ type: 'DELIVERY_ACCEPTED', recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] }),
    );
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'CHECKPOINT_PREDECESSOR_MISSING',
      requires: 'DELIVERY_ARRIVAL',
    });
  });

  /**
   * BAI CHOT cua khoi chu thich dau `checkpoint-lifecycle.ts`: nhieu bai khong co cong, nen boc
   * hang KHONG duoc doi mot moc vao cong. Bai nay giu dieu do khoi bi "sua" thanh mot chuoi cung.
   */
  it('boc hang khong doi phai qua cong truoc', () => {
    const decision = evaluateCheckpoint(
      base({ type: 'LOADING', recordedTypes: ['PICKUP_ARRIVAL'] }),
    );
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });

  it('vao cong khong doi phai boc hang truoc', () => {
    const decision = evaluateCheckpoint(
      base({ type: 'GATE_ENTRY', recordedTypes: ['PICKUP_ARRIVAL'] }),
    );
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });

  it('den diem lay hang khong doi dieu kien nao', () => {
    expect(requiredPredecessor('PICKUP_ARRIVAL')).toBeNull();
  });
});

describe('trung lap', () => {
  it('mot chang chi den noi giao mot lan', () => {
    const decision = evaluateCheckpoint(
      base({
        type: 'DELIVERY_ARRIVAL',
        recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'],
        hasObservation: true,
      }),
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'CHECKPOINT_ALREADY_RECORDED' });
  });

  /** Mot chang boc o hai kho la mot su that nghiep vu, khong phai mot lan bam nham. */
  it('boc hang ghi duoc nhieu lan tren cung mot chang', () => {
    expect(isRepeatable('LOADING')).toBe(true);
    const decision = evaluateCheckpoint(
      base({ type: 'LOADING', recordedTypes: ['PICKUP_ARRIVAL', 'LOADING'] }),
    );
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });

  it('chi boc hang duoc lap lai', () => {
    const repeatable = RUN_CHECKPOINT_TYPES.filter(isRepeatable);
    expect(repeatable).toEqual(['LOADING']);
  });
});

describe('chung cu vi tri theo ho so B', () => {
  it('den noi giao ma khong co ban dinh vi thi bi tu choi', () => {
    const decision = evaluateCheckpoint(
      base({
        type: 'DELIVERY_ARRIVAL',
        recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'],
        hasObservation: false,
      }),
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'CHECKPOINT_LOCATION_REQUIRED' });
  });

  it('den noi giao kem ban dinh vi thi duoc ghi', () => {
    const decision = evaluateCheckpoint(
      base({
        type: 'DELIVERY_ARRIVAL',
        recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'],
        hasObservation: true,
      }),
    );
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });

  /**
   * `#243` F5: *"Do not make every document universally mandatory."* Bai nay giu mac dinh khoi bi
   * noi dan ra thanh "moc nao cung phai co GPS" — mot thay doi trong co ve chat che nhung se lam
   * lai xe trong ham/bai khong ghi noi moc vao cong.
   */
  it('den diem lay hang KHONG bat buoc vi tri theo mac dinh', () => {
    expect(DEFAULT_CHECKPOINT_POLICY.locationRequiredTypes).toEqual([
      'DELIVERY_ARRIVAL',
      'DELIVERY_ACCEPTED',
    ]);
    const decision = evaluateCheckpoint(base({ type: 'PICKUP_ARRIVAL', hasObservation: false }));
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });

  it('khach tat yeu cau vi tri thi moc van ghi duoc', () => {
    const decision = evaluateCheckpoint(
      base({
        type: 'DELIVERY_ARRIVAL',
        recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'],
        hasObservation: false,
        policy: { locationRequiredTypes: [] },
      }),
    );
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });
});

describe('vong chay da dong', () => {
  /**
   * Ly do TRANG THAI CUOI phai thang moi ly do khac: mot yeu cau sai ca pham vi lan thu tu tren
   * mot vong chay da dong thi cai nguoi goi can biet la vong chay do dong roi.
   */
  it('vong chay o trang thai cuoi chan moi moc, ke ca moc sai pham vi', () => {
    for (const type of RUN_CHECKPOINT_TYPES) {
      const decision = evaluateCheckpoint(
        base({ type, runTerminal: true, hasLeg: !isRunScoped(type) }),
      );
      expect(decision).toMatchObject({ allowed: false, reason: 'CHECKPOINT_RUN_TERMINAL' });
    }
  });
});
