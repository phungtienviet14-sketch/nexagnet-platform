import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RUN_CHECKPOINT_TYPES } from '../checkpoint/checkpoint.types.js';
import type { GeoPoint } from '../geo/geo-point.js';
import {
  MOVEMENT_CHECKPOINT_TYPES,
  ORDER_ORIGIN_TOLERANCE_METRES,
  ORIGIN_ATTESTABLE_REASONS,
  OFFICE_COMPLETABLE_REASONS,
  SITE_INTAKE_BINDING_DENY_REASONS,
  SITE_INTAKE_READINESS_REASONS,
  decideException,
  evaluateCommercialReadiness,
  evaluateOrderBinding,
  hasMovementStarted,
  isOrderOriginCompatible,
  matchOrderOrigin,
  siteIntakeOrderCode,
  siteIntakePlanKey,
  type CommercialReadinessFacts,
  type ExceptionFacts,
  type OrderBindingFacts,
  type SiteIntakeBindingDenyReason,
  type SiteIntakeReadinessReason,
} from './commercial-readiness.js';
import { SITE_INTAKE_EXCEPTION_OUTCOMES } from './site-intake-commercial.types.js';

/**
 * BANG QUYET DINH cua `#398` — ham THUAN, nen moi dong cua bang la mot bai.
 *
 * Bo nay khoa HOP DONG chu khong khoa cach viet: moi ma ly do phai do duoc rieng, nhieu ly do phai
 * GOM DU theo thu tu hien thi, va thu tu uu tien `ALREADY_BOUND > REJECTED > NEEDS_REVIEW` khong
 * duoc dao. Moi danh sach ma deu co mot bai "da phu het" — them mot ma moi ma quen viet bai cho no
 * se lam bai do do.
 */

const ORIGIN: GeoPoint = { latitude: 21.35, longitude: 106.35 };
const DESTINATION: GeoPoint = { latitude: 21.03, longitude: 105.85 };
/** Mot met theo vi do ~ 1 / 111_195 do. */
const METRE_IN_DEGREES = 1 / 111_195;
const shifted = (point: GeoPoint, metres: number): GeoPoint => ({
  latitude: point.latitude + metres * METRE_IN_DEGREES,
  longitude: point.longitude,
});

/** Mot lan nhan viec DU dieu kien — moi bai chi doi DUNG mot su that. */
const readyFacts = (over: Partial<CommercialReadinessFacts> = {}): CommercialReadinessFacts => ({
  status: 'PENDING',
  boundOrderId: null,
  siteMatch: 'UNIQUE_INSIDE',
  originAttested: false,
  destination: { label: 'Kho B', point: DESTINATION },
  intakeDriverId: 'drv-1',
  run: { status: 'PLANNED', vehicleId: 'veh-1' },
  leg: { kind: 'LOADED', status: 'PLANNED', orderId: null },
  runDriverId: 'drv-1',
  driver: { active: true, currentVehicleId: 'veh-1' },
  site: { active: true, label: 'Cong ty A — Kho A', originPoints: [ORIGIN] },
  runCarriesOtherOneOrderPlan: false,
  ...over,
});

const reasonsOf = (facts: CommercialReadinessFacts): readonly string[] => {
  const readiness = evaluateCommercialReadiness(facts);
  if (readiness.kind !== 'NEEDS_REVIEW') {
    throw new Error(`mong NEEDS_REVIEW, nhan ${readiness.kind}`);
  }
  return readiness.reasons;
};

describe('evaluateCommercialReadiness — #398 §2', () => {
  it('du su that -> READY_TO_AUTO_CREATE, kem DUNG diem lay (tam hang rao) va diem giao', () => {
    expect(evaluateCommercialReadiness(readyFacts())).toEqual({
      kind: 'READY_TO_AUTO_CREATE',
      origin: { label: 'Cong ty A — Kho A', point: ORIGIN },
      destination: { label: 'Kho B', point: DESTINATION },
    });
  });

  it('chang da lan banh (IN_TRANSIT) va vong chay ACTIVE van nhan don duoc', () => {
    expect(
      evaluateCommercialReadiness(
        readyFacts({
          run: { status: 'ACTIVE', vehicleId: 'veh-1' },
          leg: { kind: 'LOADED', status: 'IN_TRANSIT', orderId: null },
        }),
      ).kind,
    ).toBe('READY_TO_AUTO_CREATE');
  });

  /** MOT su that doi -> DUNG mot ma. Bang nay phai phu HET `SITE_INTAKE_READINESS_REASONS`. */
  const SINGLE_REASON_CASES: ReadonlyArray<
    readonly [SiteIntakeReadinessReason, string, Partial<CommercialReadinessFacts>]
  > = [
    ['DESTINATION_MISSING', 'chua co diem giao', { destination: null }],
    [
      'DESTINATION_SAME_AS_ORIGIN',
      'diem giao cach diem lay nua met',
      { destination: { label: 'Kho A', point: shifted(ORIGIN, 0.5) } },
    ],
    ['ORIGIN_LOCATION_UNVERIFIED', 'xac nhan khong kem vi tri', { siteMatch: 'NO_LOCATION' }],
    ['ORIGIN_LOCATION_UNVERIFIED', 'ban ghi truoc #398 (siteMatch null)', { siteMatch: null }],
    [
      'SITE_MATCH_AMBIGUOUS',
      'tai xe tu chon giua nhieu kho',
      { siteMatch: 'CHOSEN_AMONG_SEVERAL' },
    ],
    [
      'ORIGIN_POINT_UNKNOWN',
      'dia diem khong con hang rao dang hoat dong',
      { site: { active: true, label: 'Cong ty A — Kho A', originPoints: [] } },
    ],
    [
      'ORIGIN_POINT_AMBIGUOUS',
      'hai hang rao khac toa do',
      {
        site: {
          active: true,
          label: 'Cong ty A — Kho A',
          originPoints: [ORIGIN, shifted(ORIGIN, 50)],
        },
      },
    ],
    [
      'SITE_INACTIVE',
      'dia diem da nghi',
      { site: { active: false, label: 'Cong ty A — Kho A', originPoints: [ORIGIN] } },
    ],
    [
      'DRIVER_INACTIVE',
      'ho so lai xe da ngung',
      { driver: { active: false, currentVehicleId: 'veh-1' } },
    ],
    ['DRIVER_INACTIVE', 'khong con ho so lai xe', { driver: null }],
    ['DRIVER_BINDING_CHANGED', 'vong chay giao cho nguoi khac', { runDriverId: 'drv-2' }],
    ['DRIVER_BINDING_CHANGED', 'vong chay khong con ai cam', { runDriverId: null }],
    [
      'VEHICLE_BINDING_CHANGED',
      'lai xe da doi sang xe khac',
      { driver: { active: true, currentVehicleId: 'veh-2' } },
    ],
    [
      'VEHICLE_BINDING_CHANGED',
      'lai xe khong con cam xe nao',
      { driver: { active: true, currentVehicleId: null } },
    ],
    [
      'LEG_COMPLETED',
      'chang da xong',
      { leg: { kind: 'LOADED', status: 'COMPLETED', orderId: null } },
    ],
    [
      'LEG_ORDER_CONFLICT',
      'chang da mang don khac',
      { leg: { kind: 'LOADED', status: 'PLANNED', orderId: 'ord-khac' } },
    ],
    [
      'LEG_ORDER_CONFLICT',
      'chang khong phai chang co hang',
      { leg: { kind: 'EMPTY', status: 'PLANNED', orderId: null } },
    ],
    [
      'RUN_PLAN_CONFLICT',
      'vong chay mang ke hoach ONE cua don khac',
      { runCarriesOtherOneOrderPlan: true },
    ],
  ];

  it.each(SINGLE_REASON_CASES)('%s — %s', (reason, _label, over) => {
    expect(reasonsOf(readyFacts(over))).toEqual([reason]);
  });

  it('bang tren phu HET moi ma ly do da khai', () => {
    expect(new Set(SINGLE_REASON_CASES.map(([reason]) => reason))).toEqual(
      new Set(SITE_INTAKE_READINESS_REASONS),
    );
  });

  it('GOM DU moi ly do (khong dung o ly do dau), theo thu tu HIEN THI', () => {
    const reasons = reasonsOf(
      readyFacts({
        runCarriesOtherOneOrderPlan: true,
        destination: null,
        site: { active: false, label: 'Cong ty A — Kho A', originPoints: [ORIGIN] },
        siteMatch: 'NO_LOCATION',
        runDriverId: 'drv-2',
        driver: { active: false, currentVehicleId: 'veh-9' },
      }),
    );
    expect(reasons).toEqual([
      'DESTINATION_MISSING',
      'ORIGIN_LOCATION_UNVERIFIED',
      'SITE_INACTIVE',
      'DRIVER_INACTIVE',
      'DRIVER_BINDING_CHANGED',
      'VEHICLE_BINDING_CHANGED',
      'RUN_PLAN_CONFLICT',
    ]);
    // Thu tu la thu tu cua danh sach khai, khong phai thu tu phat hien.
    const order = reasons.map((reason) =>
      SITE_INTAKE_READINESS_REASONS.indexOf(reason as SiteIntakeReadinessReason),
    );
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it('diem lay KHONG ro thi khong so diem giao voi no (khong bia DESTINATION_SAME_AS_ORIGIN)', () => {
    expect(
      reasonsOf(
        readyFacts({
          destination: { label: 'Kho A', point: ORIGIN },
          site: {
            active: true,
            label: 'Cong ty A — Kho A',
            originPoints: [ORIGIN, shifted(ORIGIN, 50)],
          },
        }),
      ),
    ).toEqual(['ORIGIN_POINT_AMBIGUOUS']);
  });

  it('diem giao cach diem lay vai met la hai diem khac nhau', () => {
    expect(
      evaluateCommercialReadiness(
        readyFacts({ destination: { label: 'Cong ben canh', point: shifted(ORIGIN, 5) } }),
      ).kind,
    ).toBe('READY_TO_AUTO_CREATE');
  });

  it('nhieu hang rao CUNG toa do (khai lap) van la MOT diem lay', () => {
    const readiness = evaluateCommercialReadiness(
      readyFacts({
        site: {
          active: true,
          label: 'Cong ty A — Kho A',
          originPoints: [ORIGIN, { ...ORIGIN }, shifted(ORIGIN, 0.3)],
        },
      }),
    );
    expect(readiness).toMatchObject({
      kind: 'READY_TO_AUTO_CREATE',
      origin: { point: ORIGIN },
    });
  });

  describe('xac nhan noi lay cua van phong', () => {
    it.each([
      ['NO_LOCATION', 'NO_LOCATION'],
      ['CHOSEN_AMONG_SEVERAL', 'CHOSEN_AMONG_SEVERAL'],
      ['legacy null', null],
    ] as const)('go %s', (_label, siteMatch) => {
      expect(
        evaluateCommercialReadiness(readyFacts({ siteMatch, originAttested: true })).kind,
      ).toBe('READY_TO_AUTO_CREATE');
    });

    it('KHONG go ly do nao khac (hang rao, doi xe, chang)', () => {
      expect(
        reasonsOf(
          readyFacts({
            siteMatch: 'CHOSEN_AMONG_SEVERAL',
            originAttested: true,
            site: {
              active: true,
              label: 'Cong ty A — Kho A',
              originPoints: [ORIGIN, shifted(ORIGIN, 50)],
            },
            runDriverId: 'drv-2',
          }),
        ),
      ).toEqual(['ORIGIN_POINT_AMBIGUOUS', 'DRIVER_BINDING_CHANGED']);
    });

    it('chi hai ma ve noi lay la go duoc bang xac nhan; bon ma bo sung duoc tren viec', () => {
      expect([...ORIGIN_ATTESTABLE_REASONS].sort()).toEqual([
        'ORIGIN_LOCATION_UNVERIFIED',
        'SITE_MATCH_AMBIGUOUS',
      ]);
      expect([...OFFICE_COMPLETABLE_REASONS].sort()).toEqual([
        'DESTINATION_MISSING',
        'DESTINATION_SAME_AS_ORIGIN',
        'ORIGIN_LOCATION_UNVERIFIED',
        'SITE_MATCH_AMBIGUOUS',
      ]);
    });
  });

  describe('thu tu uu tien: ALREADY_BOUND > REJECTED > NEEDS_REVIEW', () => {
    /** Mot lan nhan viec ma MOI su that deu xau — de thu tu uu tien phai tu noi len. */
    const everythingWrong: Partial<CommercialReadinessFacts> = {
      destination: null,
      siteMatch: 'NO_LOCATION',
      run: { status: 'CANCELLED', vehicleId: 'veh-1' },
      leg: { kind: 'LOADED', status: 'CANCELLED', orderId: 'ord-x' },
      driver: null,
      runCarriesOtherOneOrderPlan: true,
    };

    it('da gan don -> ALREADY_BOUND, bat ke moi thu khac', () => {
      expect(
        evaluateCommercialReadiness(
          readyFacts({ ...everythingWrong, status: 'ORDER_BOUND', boundOrderId: 'ord-x' }),
        ),
      ).toEqual({ kind: 'ALREADY_BOUND', orderId: 'ord-x' });
    });

    it('da bao bat thuong -> REJECTED(INTAKE_REJECTED), truoc vong chay/chang huy', () => {
      expect(
        evaluateCommercialReadiness(readyFacts({ ...everythingWrong, status: 'REJECTED' })),
      ).toEqual({ kind: 'REJECTED', reason: 'INTAKE_REJECTED' });
    });

    it('vong chay huy -> REJECTED(RUN_CANCELLED), truoc chang huy', () => {
      expect(evaluateCommercialReadiness(readyFacts(everythingWrong))).toEqual({
        kind: 'REJECTED',
        reason: 'RUN_CANCELLED',
      });
    });

    it('chang huy -> REJECTED(LEG_CANCELLED), khong bao gio NEEDS_REVIEW', () => {
      expect(
        evaluateCommercialReadiness(
          readyFacts({
            destination: null,
            leg: { kind: 'LOADED', status: 'CANCELLED', orderId: null },
          }),
        ),
      ).toEqual({ kind: 'REJECTED', reason: 'LEG_CANCELLED' });
    });
  });
});

/* ------------------------------------------------------------------ *
 * GAN TAY MOT DON CO SAN
 * ------------------------------------------------------------------ */

const bindingFacts = (over: Partial<OrderBindingFacts> = {}): OrderBindingFacts => ({
  status: 'PENDING',
  boundOrderId: null,
  run: { status: 'PLANNED' },
  leg: { kind: 'LOADED', status: 'PLANNED', orderId: null },
  runCarriesOtherOneOrderPlan: false,
  siteOriginPoints: [ORIGIN],
  target: {
    id: 'ord-x',
    status: 'OPEN',
    hasActivePlan: false,
    liveLegCount: 0,
    boundToOtherIntake: false,
    originPoint: ORIGIN,
  },
  ...over,
});

const target = (over: Partial<OrderBindingFacts['target']>): OrderBindingFacts['target'] => ({
  ...bindingFacts().target,
  ...over,
});

describe('evaluateOrderBinding — #398 §6 (null -> X, X -> X, X -> Y)', () => {
  it('null -> X: BIND', () => {
    expect(evaluateOrderBinding(bindingFacts())).toEqual({ kind: 'BIND' });
  });

  it('chang dang chay (IN_TRANSIT) van nhan don duoc', () => {
    expect(
      evaluateOrderBinding(
        bindingFacts({ leg: { kind: 'LOADED', status: 'IN_TRANSIT', orderId: null } }),
      ),
    ).toEqual({ kind: 'BIND' });
  });

  it('X -> X: ALREADY_BOUND, ke ca khi chang/vong chay da doi sau do (gui lai la khong doi)', () => {
    expect(
      evaluateOrderBinding(
        bindingFacts({
          status: 'ORDER_BOUND',
          boundOrderId: 'ord-x',
          run: { status: 'CANCELLED' },
          leg: { kind: 'LOADED', status: 'COMPLETED', orderId: 'ord-x' },
          target: target({ hasActivePlan: true, liveLegCount: 1, boundToOtherIntake: false }),
        }),
      ),
    ).toEqual({ kind: 'ALREADY_BOUND', orderId: 'ord-x' });
  });

  it('X -> Y: DENY INTAKE_BOUND_TO_OTHER_ORDER, truoc moi ly do khac', () => {
    expect(
      evaluateOrderBinding(
        bindingFacts({
          status: 'ORDER_BOUND',
          boundOrderId: 'ord-x',
          run: { status: 'CANCELLED' },
          target: target({ id: 'ord-y', status: 'CANCELLED' }),
        }),
      ),
    ).toEqual({ kind: 'DENY', reason: 'INTAKE_BOUND_TO_OTHER_ORDER' });
  });

  const DENY_CASES: ReadonlyArray<
    readonly [SiteIntakeBindingDenyReason, string, Partial<OrderBindingFacts>]
  > = [
    [
      'INTAKE_BOUND_TO_OTHER_ORDER',
      'viec da gan don khac',
      { status: 'ORDER_BOUND', boundOrderId: 'ord-khac' },
    ],
    ['INTAKE_REJECTED', 'viec da bi bao bat thuong', { status: 'REJECTED' }],
    ['RUN_CANCELLED', 'vong chay da huy', { run: { status: 'CANCELLED' } }],
    [
      'LEG_CANCELLED',
      'chang da huy',
      { leg: { kind: 'LOADED', status: 'CANCELLED', orderId: null } },
    ],
    [
      'LEG_COMPLETED',
      'chang da xong',
      { leg: { kind: 'LOADED', status: 'COMPLETED', orderId: null } },
    ],
    [
      'LEG_ORDER_CONFLICT',
      'chang da mang don khac',
      { leg: { kind: 'LOADED', status: 'PLANNED', orderId: 'ord-z' } },
    ],
    [
      'LEG_ORDER_CONFLICT',
      'chang rong',
      { leg: { kind: 'EMPTY', status: 'PLANNED', orderId: null } },
    ],
    ['RUN_PLAN_CONFLICT', 'vong chay ONE cua don khac', { runCarriesOtherOneOrderPlan: true }],
    ['ORDER_NOT_OPEN', 'don da huy', { target: target({ status: 'CANCELLED' }) }],
    ['ORDER_NOT_OPEN', 'don da giao xong', { target: target({ status: 'FULFILLED' }) }],
    ['ORDER_ALREADY_PLANNED', 'don da co ke hoach', { target: target({ hasActivePlan: true }) }],
    [
      'ORDER_ALREADY_ON_RUN',
      'don da nam tren mot chang song',
      { target: target({ liveLegCount: 1 }) },
    ],
    [
      'ORDER_BOUND_TO_OTHER_INTAKE',
      'don da nhan mot viec tai xe khac',
      { target: target({ boundToOtherIntake: true }) },
    ],
    [
      'ORDER_ORIGIN_MISMATCH',
      'don lay hang o noi khac (vuot dung sai)',
      { target: target({ originPoint: shifted(ORIGIN, ORDER_ORIGIN_TOLERANCE_METRES + 50) }) },
    ],
  ];

  it.each(DENY_CASES)('DENY %s — %s', (reason, _label, over) => {
    expect(evaluateOrderBinding(bindingFacts(over))).toEqual({ kind: 'DENY', reason });
  });

  it('bang tren phu HET moi ma tu choi da khai', () => {
    expect(new Set(DENY_CASES.map(([reason]) => reason))).toEqual(
      new Set(SITE_INTAKE_BINDING_DENY_REASONS),
    );
  });

  /**
   * Don da nhan viec tai xe khac thi CHAC CHAN co ke hoach `ADOPTED` — ly do phai noi dung nguon
   * goc (viec khac), khong noi chung chung "da co ke hoach".
   */
  it('don da nhan viec khac: noi ORDER_BOUND_TO_OTHER_INTAKE, khong noi ORDER_ALREADY_PLANNED', () => {
    expect(
      evaluateOrderBinding(
        bindingFacts({
          target: target({ boundToOtherIntake: true, hasActivePlan: true, liveLegCount: 1 }),
        }),
      ),
    ).toEqual({ kind: 'DENY', reason: 'ORDER_BOUND_TO_OTHER_INTAKE' });
  });

  it('don lay hang o noi khac nhung DA co ke hoach: noi ORDER_ALREADY_PLANNED (san sang truoc, khop sau)', () => {
    expect(
      evaluateOrderBinding(
        bindingFacts({
          target: target({ hasActivePlan: true, originPoint: shifted(ORIGIN, 5_000) }),
        }),
      ),
    ).toEqual({ kind: 'DENY', reason: 'ORDER_ALREADY_PLANNED' });
  });

  it('don KHONG co toa do diem lay: BIND — nguoi chon don tu chiu, khong bia toa do de tu choi', () => {
    expect(evaluateOrderBinding(bindingFacts({ target: target({ originPoint: null }) }))).toEqual({
      kind: 'BIND',
    });
  });

  it('dia diem KHONG con hang rao nao: BIND — khong co diem de doi chieu', () => {
    expect(
      evaluateOrderBinding(
        bindingFacts({
          siteOriginPoints: [],
          target: target({ originPoint: shifted(ORIGIN, 50_000) }),
        }),
      ),
    ).toEqual({ kind: 'BIND' });
  });

  it('don lay hang trong dung sai quanh dia diem: BIND', () => {
    expect(
      evaluateOrderBinding(
        bindingFacts({
          target: target({ originPoint: shifted(ORIGIN, ORDER_ORIGIN_TOLERANCE_METRES - 20) }),
        }),
      ),
    ).toEqual({ kind: 'BIND' });
  });
});

describe('matchOrderOrigin — don co san co lay hang o noi tai xe nhan viec khong (#398 §6)', () => {
  it('trung tam hang rao: MATCH 0 m', () => {
    expect(matchOrderOrigin(ORIGIN, [ORIGIN])).toEqual({ kind: 'MATCH', distanceMetres: 0 });
  });

  it('bien dung sai: dung bang dung sai la MATCH, vuot mot chut la MISMATCH', () => {
    const inside = matchOrderOrigin(shifted(ORIGIN, ORDER_ORIGIN_TOLERANCE_METRES - 1), [ORIGIN]);
    const outside = matchOrderOrigin(shifted(ORIGIN, ORDER_ORIGIN_TOLERANCE_METRES + 1), [ORIGIN]);
    expect(inside.kind).toBe('MATCH');
    expect(outside.kind).toBe('MISMATCH');
    expect(outside.kind === 'MISMATCH' && outside.distanceMetres).toBeGreaterThan(
      ORDER_ORIGIN_TOLERANCE_METRES,
    );
  });

  it('nhieu hang rao cua CUNG dia diem: chi can mot cai khop, khoang cach la cai GAN NHAT', () => {
    const far = shifted(ORIGIN, 3_000);
    const order = shifted(far, 100);
    const match = matchOrderOrigin(order, [ORIGIN, far]);
    expect(match.kind).toBe('MATCH');
    expect(match.kind === 'MATCH' && Math.round(match.distanceMetres)).toBe(100);
  });

  it('khong doi chieu duoc thi noi RO vi sao, va khong phai MISMATCH', () => {
    expect(matchOrderOrigin(null, [ORIGIN])).toEqual({ kind: 'ORDER_ORIGIN_UNKNOWN' });
    expect(matchOrderOrigin(ORIGIN, [])).toEqual({ kind: 'SITE_POINT_UNKNOWN' });
    expect(isOrderOriginCompatible(null, [ORIGIN])).toBe(true);
    expect(isOrderOriginCompatible(ORIGIN, [])).toBe(true);
  });

  it('bo loc danh sach va cong gan don dung CUNG mot luat', () => {
    for (const metres of [0, 100, ORDER_ORIGIN_TOLERANCE_METRES, 501, 2_000, 50_000]) {
      const originPoint = shifted(ORIGIN, metres);
      const listed = isOrderOriginCompatible(originPoint, [ORIGIN]);
      const gate = evaluateOrderBinding(bindingFacts({ target: target({ originPoint }) }));
      expect(gate.kind === 'BIND').toBe(listed);
    }
  });
});

/* ------------------------------------------------------------------ *
 * BAO BAT THUONG
 * ------------------------------------------------------------------ */

const exceptionFacts = (over: Partial<ExceptionFacts> = {}): ExceptionFacts => ({
  status: 'PENDING',
  boundOrderStatus: null,
  movementStarted: false,
  recorded: null,
  key: 'k-1',
  ...over,
});

describe('decideException — #398 §4 (may chu quyet theo su that van hanh)', () => {
  it('don OPEN, xe chua chay -> huy don + huy viec chua chay', () => {
    expect(
      decideException(exceptionFacts({ status: 'ORDER_BOUND', boundOrderStatus: 'OPEN' })),
    ).toEqual({
      kind: 'APPLY',
      outcome: 'ORDER_CANCELLED_WORK_CANCELLED',
      cancelOrder: true,
      rejectIntake: false,
      cancelWork: true,
    });
  });

  it('don OPEN, xe DA chay -> CHI huy don, van hanh giu nguyen', () => {
    expect(
      decideException(
        exceptionFacts({ status: 'ORDER_BOUND', boundOrderStatus: 'OPEN', movementStarted: true }),
      ),
    ).toEqual({
      kind: 'APPLY',
      outcome: 'ORDER_CANCELLED_OPERATION_PRESERVED',
      cancelOrder: true,
      rejectIntake: false,
      cancelWork: false,
    });
  });

  it.each(['FULFILLED', 'CANCELLED'] as const)(
    'don da %s -> chi GHI NHAN, khong doi trang thai nao',
    (status) => {
      for (const movementStarted of [false, true]) {
        expect(
          decideException(
            exceptionFacts({ status: 'ORDER_BOUND', boundOrderStatus: status, movementStarted }),
          ),
        ).toEqual({
          kind: 'APPLY',
          outcome: 'ANOMALY_RECORDED_ORDER_TERMINAL',
          cancelOrder: false,
          rejectIntake: false,
          cancelWork: false,
        });
      }
    },
  );

  it('chua co don, xe chua chay -> REJECTED + huy viec chua chay', () => {
    expect(decideException(exceptionFacts())).toEqual({
      kind: 'APPLY',
      outcome: 'INTAKE_REJECTED_WORK_CANCELLED',
      cancelOrder: false,
      rejectIntake: true,
      cancelWork: true,
    });
  });

  it('chua co don, xe DA chay -> REJECTED, van hanh giu nguyen', () => {
    expect(decideException(exceptionFacts({ movementStarted: true }))).toEqual({
      kind: 'APPLY',
      outcome: 'INTAKE_REJECTED_OPERATION_PRESERVED',
      cancelOrder: false,
      rejectIntake: true,
      cancelWork: false,
    });
  });

  it('bang tren phu HET nam ket cuc da khai', () => {
    const seen = new Set<string>();
    for (const status of ['PENDING', 'ORDER_BOUND'] as const) {
      for (const boundOrderStatus of [null, 'OPEN', 'FULFILLED', 'CANCELLED'] as const) {
        for (const movementStarted of [false, true]) {
          const decision = decideException(
            exceptionFacts({ status, boundOrderStatus, movementStarted }),
          );
          if (decision.kind === 'APPLY') seen.add(decision.outcome);
        }
      }
    }
    expect(seen).toEqual(new Set(SITE_INTAKE_EXCEPTION_OUTCOMES));
  });

  it('gui lai CUNG khoa -> REPLAY, bat ke su that da doi', () => {
    expect(
      decideException(
        exceptionFacts({
          status: 'ORDER_BOUND',
          boundOrderStatus: 'CANCELLED',
          movementStarted: true,
          recorded: { key: 'k-1' },
        }),
      ),
    ).toEqual({ kind: 'REPLAY' });
  });

  it('khoa KHAC khi da co mot lan bao -> DENY EXCEPTION_ALREADY_RECORDED', () => {
    expect(decideException(exceptionFacts({ recorded: { key: 'k-cu' }, key: 'k-moi' }))).toEqual({
      kind: 'DENY',
      reason: 'EXCEPTION_ALREADY_RECORDED',
    });
  });
});

describe('hasMovementStarted — xe da lan banh chua', () => {
  const still = { runStatus: 'PLANNED', legStatus: 'PLANNED', checkpointTypes: [] } as const;

  it('vong chay + chang PLANNED, khong moc nao -> chua', () => {
    expect(hasMovementStarted(still)).toBe(false);
  });

  /** Den noi, vao cong, boc hang la hoat dong TAI CHO — xe chua roi diem lay. */
  it('moc tai diem lay (ASSIGNED, PICKUP_ARRIVAL, GATE_ENTRY, LOADING) KHONG phai di chuyen', () => {
    expect(
      hasMovementStarted({
        ...still,
        checkpointTypes: ['ASSIGNED', 'PICKUP_ARRIVAL', 'GATE_ENTRY', 'LOADING'],
      }),
    ).toBe(false);
  });

  it.each(['DEPARTED', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED', 'COMPLETED'])(
    'moc %s chung minh xe da chay',
    (type) => {
      expect(hasMovementStarted({ ...still, checkpointTypes: ['PICKUP_ARRIVAL', type] })).toBe(
        true,
      );
    },
  );

  it('tap moc di chuyen chi gom loai moc CO THAT', () => {
    for (const type of MOVEMENT_CHECKPOINT_TYPES) {
      expect(RUN_CHECKPOINT_TYPES as readonly string[]).toContain(type);
    }
  });

  it.each([
    ['chang IN_TRANSIT', { legStatus: 'IN_TRANSIT' }],
    ['chang COMPLETED', { legStatus: 'COMPLETED' }],
    ['vong chay ACTIVE', { runStatus: 'ACTIVE' }],
    ['vong chay COMPLETED', { runStatus: 'COMPLETED' }],
  ] as const)('%s -> da chay', (_label, over) => {
    expect(hasMovementStarted({ ...still, ...over })).toBe(true);
  });

  it('huy truoc khi chay khong phai la da chay', () => {
    expect(hasMovementStarted({ ...still, runStatus: 'CANCELLED', legStatus: 'CANCELLED' })).toBe(
      false,
    );
  });
});

describe('ma don + khoa ke hoach do may chu sinh', () => {
  const INTAKE = 'cm1intake000000000000000001';

  it('dang `DH-A<yyMMdd>-<8 hex HOA>`', () => {
    expect(siteIntakeOrderCode('2026-09-26', INTAKE)).toMatch(/^DH-A260926-[0-9A-F]{8}$/);
  });

  it('TAT DINH: cung lan nhan viec -> cung ma; duoi = sha256 co tien to do dai', () => {
    const digest = createHash('sha256')
      .update(`${INTAKE.length}:${INTAKE}`)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();
    expect(siteIntakeOrderCode('2026-09-26', INTAKE)).toBe(`DH-A260926-${digest}`);
    expect(siteIntakeOrderCode('2026-09-26', INTAKE)).toBe(
      siteIntakeOrderCode('2026-09-26', INTAKE),
    );
  });

  it('lan nhan viec khac -> ma khac; ngay khac chi doi phan ngay', () => {
    const first = siteIntakeOrderCode('2026-09-26', INTAKE);
    expect(siteIntakeOrderCode('2026-09-26', `${INTAKE}2`)).not.toBe(first);
    expect(siteIntakeOrderCode('2026-12-31', INTAKE)).toBe(
      first.replace('DH-A260926', 'DH-A261231'),
    );
  });

  it('khoa ke hoach ADOPTED: `site-intake:<intakeId>`', () => {
    expect(siteIntakePlanKey(INTAKE)).toBe(`site-intake:${INTAKE}`);
  });
});
