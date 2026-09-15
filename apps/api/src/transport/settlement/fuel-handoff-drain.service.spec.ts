import { describe, expect, it } from 'vitest';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';
import { fuelHandoffDrainEnabled } from './fuel-handoff-drain.scheduler.js';
import {
  FUEL_HANDOFF_DRAIN_BATCH,
  FUEL_HANDOFF_SCAN_LIMIT,
  FuelHandoffDrainService,
} from './fuel-handoff-drain.service.js';
import { InMemorySettlementRepository } from './in-memory-settlement.repository.js';
import { SettlementOrderCompletionGate } from './settlement-order-completion.port.js';
import {
  FuelSettlementSource,
  SettlementCoreFacts,
  type FuelHandoffFacts,
  type SettlementTripFacts,
} from './settlement.ports.js';
import { SettlementService } from './settlement.service.js';

/**
 * `#295` Lane V P0 — LUAT DIEU PHOI cua vong quet, tach khoi phep tinh tien.
 *
 * ===========================================================================
 * BO BAI NAY KHONG NOI VE SO TIEN. `transport-fuel-handoff-drain.int.spec.ts` lam viec do, tren
 * Postgres that, vi moi bat bien tien cua duong nay song o rang buoc CSDL.
 *
 * Cai con lai — thu tu doc, chan lo, co lap loi, fail-closed khi doc hong — la luat cua TANG UNG
 * DUNG, va chung kiem duoc o day nhanh gap tram lan. Dat chung vao bo int se lam mot bai ve "chan
 * lo la 25" phai dung mot CSDL that de dem toi 26.
 */

class NoTrips extends SettlementCoreFacts {
  async findTrip(): Promise<SettlementTripFacts | null> {
    return null;
  }

  async listTrips(): Promise<SettlementTripFacts[]> {
    return [];
  }
}

class UnusedGate extends SettlementOrderCompletionGate {
  eligibilityForTrip(): Promise<OrderCompletionEligibility> {
    throw new Error('Duong ban giao cay xang khong hoi cong ket thuc don');
  }

  eligibilityForOrder(): Promise<OrderCompletionEligibility> {
    throw new Error('Duong ban giao cay xang khong hoi cong ket thuc don');
  }
}

const handoff = (
  overrides: Partial<FuelHandoffFacts> & { handoffId: string },
): FuelHandoffFacts => ({
  reconciliationId: `ky-${overrides.handoffId}`,
  revision: 1,
  supersedesId: null,
  supplierId: 'cay-xang-1',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  acceptedAmount: 1_000_000,
  currencyCode: 'VND',
  acceptedLineCount: 1,
  acceptedLineIds: ['dong-1'],
  ...overrides,
});

/**
 * HOP THU GIA — tra ve dung nhung gi bai dang dung can, VA DEM so lan bi hoi.
 *
 * `askedFor` la thu phan biet "vong quet bo qua ky da tieu thu" voi "vong quet doc lai ca chuoi cua
 * no roi moi phat hien khong co gi de lam". Hai hanh vi do cho cung ket qua tren bang, va rat khac
 * nhau khi co ba tram ky.
 */
class FakeOutbox extends FuelSettlementSource {
  readonly askedFor: string[] = [];
  failRead = false;

  constructor(private readonly rows: FuelHandoffFacts[]) {
    super();
  }

  async latestHandoff(reconciliationId: string): Promise<FuelHandoffFacts | null> {
    return this.rows.filter((row) => row.reconciliationId === reconciliationId).at(-1) ?? null;
  }

  async handoffRevisions(reconciliationId: string): Promise<FuelHandoffFacts[]> {
    this.askedFor.push(reconciliationId);
    return this.rows.filter((row) => row.reconciliationId === reconciliationId);
  }

  async pendingHandoffs(limit: number): Promise<FuelHandoffFacts[]> {
    if (this.failRead) throw new Error('hop thu khong mo duoc');
    return this.rows.slice(0, limit);
  }
}

const build = (outbox: FuelSettlementSource) => {
  const repository = new InMemorySettlementRepository();
  const settlement = new SettlementService(repository, new NoTrips(), outbox, new UnusedGate());
  return { repository, drain: new FuelHandoffDrainService(settlement, repository, outbox) };
};

describe('Vong quet ban giao cay xang — luat dieu phoi', () => {
  it('hop thu rong: khong lam gi, va khong bao loi', async () => {
    const { drain } = build(new FakeOutbox([]));

    expect(await drain.drain()).toEqual({
      ingested: 0,
      alreadyCurrent: 0,
      failed: 0,
      saturated: false,
    });
  });

  it('doc hop thu that bai: FAIL CLOSED — khong xu ly ky nao', async () => {
    const outbox = new FakeOutbox([handoff({ handoffId: 'a' })]);
    outbox.failRead = true;
    const { drain } = build(outbox);

    const summary = await drain.drain();

    expect(summary.ingested).toBe(0);
    /*
     * Diem mau chot: KHONG phai "0 ky can lam" ma la "khong biet co ky nao can lam". Hai thu do
     * cung cho `ingested: 0`, va chi cai duoi moi duoc phep de lai hop thu chua doc.
     */
    expect(outbox.askedFor).toEqual([]);
  });

  it('ky da tieu thu KHONG bi doc lai chuoi ban sua doi', async () => {
    const outbox = new FakeOutbox([handoff({ handoffId: 'a' })]);
    const { drain } = build(outbox);

    await drain.drain();
    outbox.askedFor.length = 0;

    const summary = await drain.drain();

    expect(summary).toMatchObject({ ingested: 0, alreadyCurrent: 1 });
    expect(outbox.askedFor).toEqual([]);
  });

  it('mot ky hong KHONG chan nhung ky sau no', async () => {
    /*
     * `ky-a` khong co ban sua doi nao trong hop thu gia, nen `ingestFuelHandoff()` nem
     * `SETTLEMENT_DOCUMENT_NOT_FOUND`. Neu ca lo nam trong mot `try`, `ky-b` se khong bao gio duoc
     * xu ly — va vi thu tu la cu-truoc-moi-sau, no se khong bao gio duoc xu ly o luot sau.
     */
    const rows = [handoff({ handoffId: 'a' }), handoff({ handoffId: 'b' })];
    const outbox = new (class extends FakeOutbox {
      override async handoffRevisions(reconciliationId: string): Promise<FuelHandoffFacts[]> {
        if (reconciliationId === 'ky-a') return [];
        return super.handoffRevisions(reconciliationId);
      }
    })(rows);

    const { drain, repository } = build(outbox);
    const summary = await drain.drain();

    expect(summary).toMatchObject({ failed: 1, ingested: 1 });

    const cursors = await repository.fuelHandoffCursors(['ky-a', 'ky-b']);
    expect(cursors.has('ky-a')).toBe(false);
    expect(cursors.get('ky-b')).toBe(1);
  });

  it('chan lo: nhieu hon mot lo thi dung lai va bao con viec', async () => {
    const rows = Array.from({ length: FUEL_HANDOFF_DRAIN_BATCH + 5 }, (_unused, index) =>
      handoff({ handoffId: `h${index}` }),
    );
    const { drain } = build(new FakeOutbox(rows));

    const summary = await drain.drain();

    expect(summary.ingested).toBe(FUEL_HANDOFF_DRAIN_BATCH);
    expect(summary.saturated).toBe(true);
  });

  it('lo con lai duoc lam o nhip sau, khong bi bo', async () => {
    const rows = Array.from({ length: FUEL_HANDOFF_DRAIN_BATCH + 5 }, (_unused, index) =>
      handoff({ handoffId: `h${index}` }),
    );
    const { drain } = build(new FakeOutbox(rows));

    await drain.drain();
    const second = await drain.drain();

    expect(second.ingested).toBe(5);
    expect(second.alreadyCurrent).toBe(FUEL_HANDOFF_DRAIN_BATCH);
    expect(second.saturated).toBe(false);
  });

  it('chan doc duoc truyen xuong nguyen ven', async () => {
    let asked = -1;
    const outbox = new (class extends FakeOutbox {
      override async pendingHandoffs(limit: number): Promise<FuelHandoffFacts[]> {
        asked = limit;
        return [];
      }
    })([]);

    await build(outbox).drain.drain();

    expect(asked).toBe(FUEL_HANDOFF_SCAN_LIMIT);
  });

  it('cong tac van hanh: mac dinh BAT, chi `off` moi tat', () => {
    expect(fuelHandoffDrainEnabled(undefined)).toBe(true);
    expect(fuelHandoffDrainEnabled('')).toBe(true);
    expect(fuelHandoffDrainEnabled('on')).toBe(true);
    expect(fuelHandoffDrainEnabled('OFF')).toBe(false);
    expect(fuelHandoffDrainEnabled('  off  ')).toBe(false);
  });
});
