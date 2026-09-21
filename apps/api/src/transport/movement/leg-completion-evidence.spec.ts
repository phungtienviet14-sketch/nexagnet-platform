import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import type { LegFieldDelivery, LegFieldTruthSource } from './leg-field-truth.port.js';
import { evaluateLegCompletionEvidence } from './movement-lifecycle.js';
import { InMemoryMovementRepository } from './movement.repository.js';
import { MovementService } from './movement.service.js';

/**
 * CHANG CO HANG CHI XONG KHI HIEN TRUONG NOI DA GIAO — `#332`.
 *
 * ============================================================================================
 * DIEU DA XAY RA
 * ============================================================================================
 *
 * transport-preview, 19/09/2026 12:26:58–12:27:00Z: mot tien trinh `node` goi
 * `POST /transport/runs/:runId/legs/:legId/transition` sau lan lien trong 2,2 giay — `PLANNED ->
 * IN_TRANSIT -> COMPLETED` cho ca ba chang. Chang `LOADED` thanh `COMPLETED` voi KHONG mot moc hien
 * truong nao, vi `transitionLeg()` chi hoi may trang thai chang (`evaluateLegTransition`), khong hoi
 * so ghi hien truong. Hai truc su that tach nhau tu do, va man UAT thay "chang 2 co hang — Hien
 * truong —" trong mot vong chay da dong.
 *
 * ============================================================================================
 * LUAT HOI TU HEP NHAT
 * ============================================================================================
 *
 * Hien truong KHONG day trang thai chang (do la mot thiet ke khac, lon hon), nhung no CHAN mot lan
 * hoan tat chang CO HANG noi nguoc lai no. Muon hoan tat khi hien truong chua ghi giao xong thi phai
 * noi ro la dang GHI DE, kem ly do — va lan ghi de do co dau vet rieng.
 */

const ACTOR = 'ke-toan';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const OVERRIDE_REASON = 'Lai xe mat song o diem giao, da xac nhan qua dien thoai voi nguoi nhan';

interface RecordedDecision {
  readonly point: string;
  readonly outcome: string;
  readonly reason: string;
  readonly detail?: Record<string, unknown>;
}

/** Nguon hien truong gia — tra loi theo tung chang, dem so lan bi hoi, va hong duoc theo lenh. */
class StubFieldTruth implements LegFieldTruthSource {
  readonly byLeg = new Map<string, LegFieldDelivery | null>();
  readonly asked: string[] = [];
  failure: Error | null = null;

  async deliveryOf(legId: string): Promise<LegFieldDelivery | null> {
    this.asked.push(legId);
    if (this.failure) throw this.failure;
    return this.byLeg.has(legId)
      ? (this.byLeg.get(legId) ?? null)
      : { delivered: false, phase: 'PLANNED' };
  }
}

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  throw new Error('mong doi mot TransportDomainError, nhung loi goi da thanh cong');
};

describe('evaluateLegCompletionEvidence — ham thuan (#332)', () => {
  const notDelivered: LegFieldDelivery = { delivered: false, phase: 'LOADING' };
  const delivered: LegFieldDelivery = { delivered: true, phase: 'DELIVERED' };

  it('chang CO HANG, hien truong chua giao, khong ghi de: tu choi bang MA RIENG', () => {
    expect(
      evaluateLegCompletionEvidence({
        kind: 'LOADED',
        to: 'COMPLETED',
        field: notDelivered,
        overrideReason: null,
      }),
    ).toEqual({ allowed: false, reason: 'LEG_FIELD_DELIVERY_NOT_RECORDED' });
  });

  it('hien truong da ghi giao xong: hoan tat binh thuong', () => {
    expect(
      evaluateLegCompletionEvidence({
        kind: 'LOADED',
        to: 'COMPLETED',
        field: delivered,
        overrideReason: null,
      }),
    ).toEqual({ allowed: true, reason: 'LEG_TRANSITION_APPLIED' });
  });

  it('ghi de TUONG MINH co ly do: cho qua bang mot ma KHAC ma thuong', () => {
    expect(
      evaluateLegCompletionEvidence({
        kind: 'LOADED',
        to: 'COMPLETED',
        field: notDelivered,
        overrideReason: OVERRIDE_REASON,
      }),
    ).toEqual({ allowed: true, reason: 'LEG_COMPLETED_BY_OVERRIDE' });
  });

  it('ly do ghi de khong duoc dung khi khong co gi de ghi de', () => {
    expect(
      evaluateLegCompletionEvidence({
        kind: 'LOADED',
        to: 'COMPLETED',
        field: delivered,
        overrideReason: OVERRIDE_REASON,
      }),
    ).toEqual({ allowed: true, reason: 'LEG_TRANSITION_APPLIED' });
  });

  /**
   * Khach khong bat `transport-checkpoint` thi KHONG CO so ghi hien truong nao de noi nguoc lai
   * trang thai chang. Doi bang chung o do la chan vinh vien mot khach hop le.
   */
  it('khong co nguon hien truong: khong co gi de doi chieu, hanh vi cu giu nguyen', () => {
    expect(
      evaluateLegCompletionEvidence({
        kind: 'LOADED',
        to: 'COMPLETED',
        field: null,
        overrideReason: null,
      }),
    ).toEqual({ allowed: true, reason: 'LEG_TRANSITION_APPLIED' });
  });

  it('chang RONG va lan lan banh khong doi bang chung hien truong', () => {
    for (const input of [
      { kind: 'EMPTY', to: 'COMPLETED' },
      { kind: 'LOADED', to: 'IN_TRANSIT' },
    ] as const) {
      expect(
        evaluateLegCompletionEvidence({ ...input, field: notDelivered, overrideReason: null }),
      ).toEqual({ allowed: true, reason: 'LEG_TRANSITION_APPLIED' });
    }
  });
});

describe('MovementService.transitionLeg — hien truong chan chang CO HANG noi nguoc (#332)', () => {
  let fleet: InMemoryFleetRepository;
  let auditLog: InMemoryAuditLogRepository;
  let service: MovementService;
  let field: StubFieldTruth;
  let decisions: RecordedDecision[];

  beforeEach(() => {
    fleet = new InMemoryFleetRepository();
    auditLog = new InMemoryAuditLogRepository();
    decisions = [];
    const telemetry = {
      decision: (input: RecordedDecision) => {
        decisions.push(input);
      },
    } as unknown as TelemetryService;
    service = new MovementService(
      new InMemoryMovementRepository(),
      fleet,
      new AuditLogService(auditLog),
      POLICY,
      undefined,
      telemetry,
    );
    field = new StubFieldTruth();
  });

  /** Hinh dang UAT: `EMPTY #1 -> LOADED #2`, chang co hang da lan banh. */
  const uatShape = async () => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-33201',
      vehicleClass: 'Dau keo',
    });
    const run = await service.createRun(
      { code: 'RUN-332', vehicleId: vehicle.id, businessDate: '2026-09-19' },
      ACTOR,
    );
    const order = await service.createOrder(
      {
        code: 'ORD-332',
        originLabel: 'Kho lay hang',
        destinationLabel: 'Diem giao',
        businessDate: '2026-09-19',
      },
      ACTOR,
    );
    const empty = await service.addLeg(
      run.id,
      { sequence: 1, kind: 'EMPTY', originLabel: 'Bai xe', destinationLabel: 'Kho lay hang' },
      ACTOR,
    );
    const loaded = await service.addLeg(
      run.id,
      {
        sequence: 2,
        kind: 'LOADED',
        orderId: order.id,
        originLabel: 'Kho lay hang',
        destinationLabel: 'Diem giao',
      },
      ACTOR,
    );
    await service.transitionLeg(loaded.id, 'IN_TRANSIT', ACTOR, { fieldTruth: field });
    return { run, empty, loaded };
  };

  const completionsOf = async (legId: string) =>
    (await auditLog.list({ entityId: legId })).filter(
      (entry) => (entry.after as { status?: string } | null)?.status === 'COMPLETED',
    );

  it('hien truong chua giao: TU CHOI, chang giu nguyen IN_TRANSIT, khong dau vet hoan tat nao', async () => {
    const { loaded } = await uatShape();

    expect(
      await reasonOf(() =>
        service.transitionLeg(loaded.id, 'COMPLETED', ACTOR, { fieldTruth: field }),
      ),
    ).toBe('LEG_FIELD_DELIVERY_NOT_RECORDED');

    expect((await service.getLeg(loaded.id)).status).toBe('IN_TRANSIT');
    expect(await completionsOf(loaded.id)).toEqual([]);
    expect(decisions).toContainEqual(
      expect.objectContaining({
        point: 'run.leg_transition',
        outcome: 'denied',
        reason: 'LEG_FIELD_DELIVERY_NOT_RECORDED',
      }),
    );
  });

  it('hien truong da giao: hoan tat binh thuong, dau vet thuong', async () => {
    const { loaded } = await uatShape();
    field.byLeg.set(loaded.id, { delivered: true, phase: 'DELIVERED' });

    const after = await service.transitionLeg(loaded.id, 'COMPLETED', ACTOR, { fieldTruth: field });

    expect(after.status).toBe('COMPLETED');
    expect((await completionsOf(loaded.id)).map((entry) => entry.action)).toEqual([
      'transport.run.leg.transition',
    ]);
  });

  it('ghi de TUONG MINH: hoan tat, dau vet RIENG mang ly do va giai doan hien truong luc do', async () => {
    const { loaded } = await uatShape();

    const after = await service.transitionLeg(loaded.id, 'COMPLETED', ACTOR, {
      fieldTruth: field,
      overrideReason: OVERRIDE_REASON,
    });

    expect(after.status).toBe('COMPLETED');
    const completions = await completionsOf(loaded.id);
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({
      actor: ACTOR,
      action: 'transport.run.leg.complete.override',
      entityType: 'TransportRunLeg',
      before: { status: 'IN_TRANSIT' },
      after: {
        status: 'COMPLETED',
        fieldOverride: { reason: OVERRIDE_REASON, fieldPhase: 'PLANNED' },
      },
    });
    expect(decisions).toContainEqual(
      expect.objectContaining({
        point: 'run.leg_transition',
        outcome: 'allowed',
        reason: 'LEG_COMPLETED_BY_OVERRIDE',
      }),
    );
  });

  it('chang RONG hoan tat khong hoi hien truong, va lan lan banh cung khong', async () => {
    const { empty } = await uatShape();
    await service.transitionLeg(empty.id, 'IN_TRANSIT', ACTOR, { fieldTruth: field });
    await service.transitionLeg(empty.id, 'COMPLETED', ACTOR, { fieldTruth: field });

    expect(field.asked).toEqual([]);
  });

  it('nguon hien truong HONG: that bai dong — loi di thang ra, chang khong doi', async () => {
    const { loaded } = await uatShape();
    field.failure = new Error('kho moc khong doc duoc');

    await expect(
      service.transitionLeg(loaded.id, 'COMPLETED', ACTOR, { fieldTruth: field }),
    ).rejects.toThrow('kho moc khong doc duoc');
    expect((await service.getLeg(loaded.id)).status).toBe('IN_TRANSIT');
  });

  it('khach khong co nguon hien truong: hoan tat nhu truoc, khong can ghi de', async () => {
    const { loaded } = await uatShape();
    field.byLeg.set(loaded.id, null);

    const after = await service.transitionLeg(loaded.id, 'COMPLETED', ACTOR, { fieldTruth: field });

    expect(after.status).toBe('COMPLETED');
    expect((await completionsOf(loaded.id)).map((entry) => entry.action)).toEqual([
      'transport.run.leg.transition',
    ]);
  });
});
