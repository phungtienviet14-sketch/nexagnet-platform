import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  InMemoryMovementRepository,
  type LegStatusWrite,
  type LegStatusWriteResult,
} from './movement.repository.js';
import { MovementService } from './movement.service.js';
import type { RunLegStatus } from './movement.types.js';

/**
 * DOI TRANG THAI CHANG tren CUNG ranh gioi serialize voi lan ghi moc — `#354`.
 *
 * Hai dieu, do o ban TRONG-BO-NHO (duong chay that cua `PERSISTENCE=memory`); ban Postgres duoc do
 * o `checkpoint/checkpoint-terminal-leg.int.spec.ts`:
 *
 *   1. `setLegStatus()` xep hang sau `underRunLock()` cua CUNG vong chay — mot lan ghi moc dang giu
 *      khoa thi lan ket thuc chang phai doi;
 *   2. lan ghi CO DIEU KIEN: mot phan xu doc chang TRUOC khoa ma chang da doi trong khe do thi lenh
 *      bi tu choi bang dung ma cua duong tuan tu — mot chang da huy khong bao gio song lai.
 */

const ACTOR = 'ke-toan';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/**
 * Kho cho MOT nguoi ghi khac chen vao dung khe: SAU khi phan xu da doc chang, TRUOC khi lan ghi cua
 * no lay khoa. Chi ban mot lan, roi di tiep y nhu kho that.
 */
class RivalSlipsIn extends InMemoryMovementRepository {
  private rival: LegStatusWrite | null = null;

  armWith(rival: LegStatusWrite): void {
    this.rival = rival;
  }

  override async setLegStatus(input: LegStatusWrite): Promise<LegStatusWriteResult | null> {
    const rival = this.rival;
    if (rival !== null) {
      this.rival = null;
      const won = await super.setLegStatus(rival);
      expect(won?.applied).toBe(true);
    }
    return super.setLegStatus(input);
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

describe('Doi trang thai chang duoi khoa vong chay, co dieu kien (#354)', () => {
  let repository: RivalSlipsIn;
  let auditLog: InMemoryAuditLogRepository;
  let service: MovementService;

  beforeEach(() => {
    repository = new RivalSlipsIn();
    auditLog = new InMemoryAuditLogRepository();
    service = new MovementService(
      repository,
      new InMemoryFleetRepository(),
      new AuditLogService(auditLog),
      POLICY,
    );
  });

  const aLeg = async () => {
    const run = await repository.createRun({
      code: 'RUN-354',
      vehicleId: 'veh_1',
      businessDate: '2026-09-22',
    });
    const leg = await repository.createLeg({
      runId: run.id,
      sequence: 1,
      kind: 'EMPTY',
      orderId: null,
      originLabel: 'Bai xe',
      destinationLabel: 'Kho',
      businessDate: '2026-09-22',
    });
    return { run, leg };
  };

  const statusOf = async (legId: string): Promise<RunLegStatus | undefined> =>
    (await repository.findLeg(legId))?.status;

  it('lenh "bat dau chay" cham hon mot lenh huy: bi tu choi, chang da huy KHONG song lai', async () => {
    const { leg } = await aLeg();
    repository.armWith({ legId: leg.id, from: 'PLANNED', to: 'CANCELLED', at: new Date() });

    expect(await reasonOf(() => service.transitionLeg(leg.id, 'IN_TRANSIT', ACTOR))).toBe(
      'LEG_ALREADY_TERMINAL',
    );
    expect(await statusOf(leg.id)).toBe('CANCELLED');
  });

  it('lenh huy cham hon mot lenh "bat dau chay": bi tu choi bang dung ma cua duong tuan tu', async () => {
    const { leg } = await aLeg();
    repository.armWith({ legId: leg.id, from: 'PLANNED', to: 'IN_TRANSIT', at: new Date() });

    expect(await reasonOf(() => service.cancelLeg(leg.id, 'doi y', ACTOR))).toBe(
      'LEG_CANCEL_ALREADY_STARTED',
    );
    expect(await statusOf(leg.id)).toBe('IN_TRANSIT');
    // Khong mot dong dau vet huy nao cho mot lan huy khong xay ra.
    const cancels = (await auditLog.list()).filter(
      (entry) => entry.action === 'transport.run.leg.cancel',
    );
    expect(cancels).toEqual([]);
  });

  it('hai lan hoan tat cung mot chang: dung mot lan ghi, lan sau bi tu choi', async () => {
    const { leg } = await aLeg();
    await service.transitionLeg(leg.id, 'IN_TRANSIT', ACTOR);
    repository.armWith({ legId: leg.id, from: 'IN_TRANSIT', to: 'COMPLETED', at: new Date() });

    expect(await reasonOf(() => service.transitionLeg(leg.id, 'COMPLETED', ACTOR))).toBe(
      'LEG_ALREADY_TERMINAL',
    );
    expect(await statusOf(leg.id)).toBe('COMPLETED');
  });

  it('lan ghi trang thai chang XEP HANG sau mot lan ghi dang giu khoa cua CUNG vong chay', async () => {
    const { run, leg } = await aLeg();
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seenUnderLock: RunLegStatus | undefined;

    const holder = repository.underRunLock(run.id, async (scope) => {
      seenUnderLock = scope.legs.find((entry) => entry.id === leg.id)?.status;
      await held;
    });
    const cancelling = service.cancelLeg(leg.id, 'doi y', ACTOR);

    // Nhuong vai nhip: khong co khoa chung thi lenh huy da xong trong nhung nhip nay.
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await statusOf(leg.id)).toBe('PLANNED');
    expect(seenUnderLock).toBe('PLANNED');

    release();
    await holder;
    await cancelling;
    expect(await statusOf(leg.id)).toBe('CANCELLED');
  });
});
