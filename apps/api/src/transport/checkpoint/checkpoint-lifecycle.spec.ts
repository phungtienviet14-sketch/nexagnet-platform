import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHECKPOINT_POLICY,
  carriesCargoMeaning,
  evaluateCheckpoint,
  isRepeatable,
  isRunScoped,
  legAcceptsNewCheckpoints,
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
  legKind: 'LOADED',
  legStatus: 'IN_TRANSIT',
  recordedTypes: [],
  hasObservation: false,
  policy: DEFAULT_CHECKPOINT_POLICY,
  ...overrides,
});

/**
 * CHANG DA KET THUC — `#354`. Ma rieng, dung o giua PHAM VI va THU TU.
 */
describe('chang da ket thuc khong nhan moc moi (#354)', () => {
  it('chang COMPLETED hay CANCELLED: tu choi bang ma rieng', () => {
    for (const legStatus of ['COMPLETED', 'CANCELLED'] as const) {
      expect(evaluateCheckpoint(base({ legStatus }))).toMatchObject({
        allowed: false,
        reason: 'CHECKPOINT_LEG_TERMINAL',
      });
    }
  });

  it('chang PLANNED hay IN_TRANSIT: luat cu giu nguyen', () => {
    for (const legStatus of ['PLANNED', 'IN_TRANSIT'] as const) {
      expect(evaluateCheckpoint(base({ legStatus }))).toMatchObject({
        allowed: true,
        reason: 'CHECKPOINT_RECORDED',
      });
    }
    expect(legAcceptsNewCheckpoints('PLANNED')).toBe(true);
    expect(legAcceptsNewCheckpoints('IN_TRANSIT')).toBe(true);
    expect(legAcceptsNewCheckpoints('COMPLETED')).toBe(false);
    expect(legAcceptsNewCheckpoints('CANCELLED')).toBe(false);
  });

  it('vong chay da dong thi van la CHECKPOINT_RUN_TERMINAL — vong chay dung truoc chang', () => {
    expect(evaluateCheckpoint(base({ runTerminal: true, legStatus: 'COMPLETED' }))).toMatchObject({
      reason: 'CHECKPOINT_RUN_TERMINAL',
    });
  });

  it('moc hang hoa tren chang RONG da COMPLETED van la CHECKPOINT_CARGO_ON_EMPTY_LEG (#350)', () => {
    const decision = evaluateCheckpoint(
      base({ type: 'DELIVERY_ARRIVAL', legKind: 'EMPTY', legStatus: 'COMPLETED' }),
    );
    expect(decision).toMatchObject({ reason: 'CHECKPOINT_CARGO_ON_EMPTY_LEG' });
  });

  it('chang da ket thuc dung TRUOC thu tu va trung lap', () => {
    const missing = evaluateCheckpoint(
      base({ type: 'PICKUP_DEPARTURE', recordedTypes: [], legStatus: 'COMPLETED' }),
    );
    const duplicate = evaluateCheckpoint(
      base({ type: 'PICKUP_ARRIVAL', recordedTypes: ['PICKUP_ARRIVAL'], legStatus: 'COMPLETED' }),
    );
    expect(missing).toMatchObject({ reason: 'CHECKPOINT_LEG_TERMINAL' });
    expect(duplicate).toMatchObject({ reason: 'CHECKPOINT_LEG_TERMINAL' });
  });

  it('moc muc vong chay khong kem chang thi khong co dieu kien chang nao', () => {
    const decision = evaluateCheckpoint(
      base({ type: 'ASSIGNED', hasLeg: false, legKind: null, legStatus: null }),
    );
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });
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

/**
 * CHANG CHAY RONG KHONG NHAN MOC HANG HOA — `#332`.
 *
 * Runtime transport-preview 19/09/2026: man lai xe moi chuoi lay hang tren chang 1 RONG, va may chu
 * nhan het (`PICKUP_ARRIVAL`, `GATE_ENTRY`, `LOADING`) vi phep kiem chi hoi "chang co thuoc vong
 * chay nay khong". Hang tren thung sinh ra o mot chang khong cho hang, con chang CO HANG thi khong
 * co mot moc nao — hai truc su that lech nhau ngay tu lan bam dau tien.
 */
describe('chang chay rong khong nhan moc hang hoa (#332)', () => {
  const LEG_TYPES = RUN_CHECKPOINT_TYPES.filter((type) => !isRunScoped(type));

  it.each(LEG_TYPES)('%s tren chang RONG bi chan bang mot ma rieng', (type) => {
    const predecessor = requiredPredecessor(type);
    const decision = evaluateCheckpoint(
      base({
        type,
        legKind: 'EMPTY',
        // Du moi dieu kien khac — de cong dang do la cong DUY NHAT con lai.
        recordedTypes: predecessor === null ? [] : [predecessor],
        hasObservation: true,
      }),
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'CHECKPOINT_CARGO_ON_EMPTY_LEG' });
  });

  it('pham vi truoc thu tu: chang rong bao loi PHAM VI, khong bao thieu moc dung truoc', () => {
    const decision = evaluateCheckpoint(
      base({ type: 'DELIVERY_ACCEPTED', legKind: 'EMPTY', recordedTypes: [] }),
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'CHECKPOINT_CARGO_ON_EMPTY_LEG' });
  });

  it('chang CO HANG van nhan dung chuoi cu', () => {
    const decision = evaluateCheckpoint(base({ type: 'PICKUP_ARRIVAL', legKind: 'LOADED' }));
    expect(decision).toMatchObject({ allowed: true, reason: 'CHECKPOINT_RECORDED' });
  });

  /**
   * Hom nay moi moc muc CHANG deu thuoc chuoi hang hoa. Bai nay ghim phan loai do: mot loai moc
   * moi muc chang (vd "ve toi bai") phai duoc phan loai CO Y, khong tu dong roi vao nhom nao.
   */
  it('moi moc muc chang deu mang nghia hang hoa, moc muc vong chay thi khong', () => {
    for (const type of RUN_CHECKPOINT_TYPES) {
      expect(carriesCargoMeaning(type)).toBe(!isRunScoped(type));
    }
  });
});
