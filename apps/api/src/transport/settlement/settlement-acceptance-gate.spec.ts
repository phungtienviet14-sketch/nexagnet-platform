import { beforeEach, describe, expect, it } from 'vitest';
import type { BusinessDate } from '../business-date.js';
import type {
  CommercialAcceptanceState,
  TripAcceptanceEligibility,
} from '../acceptance/acceptance.types.js';
import { InMemorySettlementRepository } from './in-memory-settlement.repository.js';
import { SettlementAcceptanceGate } from './settlement-acceptance.port.js';
import { FuelSettlementSource, SettlementCoreFacts } from './settlement.ports.js';
import type { FuelHandoffFacts, SettlementTripFacts } from './settlement.ports.js';
import { SettlementService } from './settlement.service.js';

/**
 * CG-010 — CONG DIEU KIEN DOI SOAT (`#268` I5).
 *
 * ============================================================================================
 * BO BAI QUAN TRONG NHAT CUA CA LANE
 * ============================================================================================
 *
 * `#268` goi tranche nay la mot *"financial eligibility boundary"* va xep no RUI RO CAO. Bang chan
 * ly duoi day la ban dich sang ma cua nam gach dau dong trong I5, va no phai doc duoc ma khong can
 * mo mot tep nao khac.
 */

const TRIP = 'chuyen-1';

const tripFacts = (patch: Partial<SettlementTripFacts> = {}): SettlementTripFacts => ({
  id: TRIP,
  code: 'CH-001',
  kind: 'OWN_DIRECT',
  status: 'RECONCILED',
  businessDate: '2026-09-08' as BusinessDate,
  customerId: 'khach-1',
  carrierPartnerId: null,
  referrerPartnerId: null,
  freightAmount: 5_000_000,
  currencyCode: 'VND',
  originLabel: 'HN',
  destinationLabel: 'HP',
  ...patch,
});

class FakeCore extends SettlementCoreFacts {
  constructor(private trip: SettlementTripFacts) {
    super();
  }

  set(trip: SettlementTripFacts): void {
    this.trip = trip;
  }

  async findTrip(tripId: string): Promise<SettlementTripFacts | null> {
    return tripId === this.trip.id ? this.trip : null;
  }

  async listTrips(): Promise<SettlementTripFacts[]> {
    return [this.trip];
  }
}

class FakeFuel extends FuelSettlementSource {
  async latestHandoff(): Promise<FuelHandoffFacts | null> {
    return null;
  }

  async handoffRevisions(): Promise<FuelHandoffFacts[]> {
    return [];
  }
}

/** Cong gia — tra ve dung ket luan ma bai dang dung, va DEM so lan bi hoi. */
class FakeGate extends SettlementAcceptanceGate {
  calls = 0;

  constructor(private verdict: TripAcceptanceEligibility) {
    super();
  }

  set(verdict: TripAcceptanceEligibility): void {
    this.verdict = verdict;
  }

  async eligibilityForTrip(): Promise<TripAcceptanceEligibility> {
    this.calls += 1;
    return this.verdict;
  }
}

const blocked = (
  state: CommercialAcceptanceState,
  runStatus = 'COMPLETED',
): TripAcceptanceEligibility => ({
  kind: 'BLOCKED',
  runId: 'run-1',
  runCode: 'RUN-001',
  runStatus,
  state,
});

const approved: TripAcceptanceEligibility = {
  kind: 'ELIGIBLE',
  runId: 'run-1',
  runCode: 'RUN-001',
  acceptanceId: 'acc-1',
};

describe('Cong nghiem thu chan cong no khach — CG-010', () => {
  let repo: InMemorySettlementRepository;
  let core: FakeCore;
  let gate: FakeGate;
  let service: SettlementService;

  const build = (verdict: TripAcceptanceEligibility, trip = tripFacts()) => {
    repo = new InMemorySettlementRepository();
    core = new FakeCore(trip);
    gate = new FakeGate(verdict);
    service = new SettlementService(repo, core, new FakeFuel(), gate);
  };

  beforeEach(() => build(approved));

  it('COMPLETED + APPROVED — duong DUY NHAT cho mot viec moi di vao ky', async () => {
    const outcome = await service.recogniseCustomerReceivable(TRIP, 'ke-toan');

    expect(outcome.replayed).toBe(false);
    expect(outcome.document.sourceContext).toBe('TRIP_RECONCILED');
    expect(outcome.document.signedAmount).toBe(5_000_000);
  });

  it.each([
    ['PENDING', 'chua ai nghiem thu'],
    ['REJECTED', 'da bi tu choi'],
    ['NEEDS_CORRECTION', 'bi tra lai doi bo sung'],
  ] as const)('COMPLETED + %s (%s) — BI CHAN', async (state, _mota) => {
    build(blocked(state));

    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_ACCEPTANCE_BLOCKED',
    });
    expect(await repo.listDocuments({})).toEqual([]);
  });

  /**
   * `#268` I5: *"non-completed + `APPROVED` cannot bypass operational prerequisites"*.
   *
   * Tang nghiem thu da chan viec nay tu truoc (khong duyet duoc mot vong chay chua chay xong).
   * Bai nay kiem LOP THU HAI: ke ca khi lop thu nhat hong va mot ket luan nhu vay den duoc day,
   * cong van dong.
   */
  it('chua chay xong + APPROVED — van bi chan, khong co duong tat nao', async () => {
    build(blocked('APPROVED', 'ACTIVE'));

    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_ACCEPTANCE_BLOCKED',
    });
  });

  it('mot nguon da duyet chi vao dong kinh te DUNG MOT LAN', async () => {
    const first = await service.recogniseCustomerReceivable(TRIP, 'ke-toan');
    const second = await service.recogniseCustomerReceivable(TRIP, 'ke-toan');

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.document.id).toBe(first.document.id);
    expect(await repo.listDocuments({})).toHaveLength(1);
  });

  /**
   * THU TU KIEM — cong moi THEM mot dieu kien, khong THAY dieu kien nao.
   *
   * Mot chuyen chua doi soat phai bao `SETTLEMENT_TRIP_NOT_RECONCILED` chu khong bao "chua nghiem
   * thu": cai nguoi truc phai lam TRUOC la dong chuyen. Va cong nghiem thu khong duoc hoi den —
   * mot loi goi ra ngoai cho mot cau hoi khong con y nghia.
   */
  it('dieu kien van hanh cu duoc kiem TRUOC, va cong moi khong duoc hoi den', async () => {
    build(approved, tripFacts({ status: 'DELIVERED' }));

    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_TRIP_NOT_RECONCILED',
    });
    expect(gate.calls).toBe(0);
  });

  it('chuyen chua nhap gia cuoc van bao dung ly do cu', async () => {
    build(approved, tripFacts({ freightAmount: null }));

    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_TRIP_REVENUE_MISSING',
    });
    expect(gate.calls).toBe(0);
  });
});

/**
 * CG-011 — TUONG THICH LICH SU (`#268` I5).
 *
 * Hai nua, va thieu nua nao cung hong theo mot kieu rieng.
 */
describe('Tuong thich lich su — CG-011', () => {
  it('chuyen DA co chung tu tu truoc: goi lai tra ve ban cu, KHONG nem', async () => {
    // Nua thu nhat: mot hang da quyet toan TU TRUOC tinh nang. Cong khong duoc ap nguoc len no.
    const repo = new InMemorySettlementRepository();
    const core = new FakeCore(tripFacts());
    const permissive = new FakeGate(approved);

    // Ghi truoc bang mot dich vu "chua co cong" — mo phong du lieu co san tren `main`.
    const legacy = new SettlementService(repo, core, new FakeFuel(), permissive);
    const before = await legacy.recogniseCustomerReceivable(TRIP, 'ke-toan-cu');

    // Bay gio cong da bat, va ho so nghiem thu dang PENDING.
    const gate = new FakeGate(blocked('PENDING'));
    const gated = new SettlementService(repo, core, new FakeFuel(), gate);

    const again = await gated.recogniseCustomerReceivable(TRIP, 'ke-toan');
    expect(again.replayed).toBe(true);
    expect(again.document.id).toBe(before.document.id);
    // Cong THAM CHI khong duoc hoi den: da co chung tu thi day khong phai mot lan chon nguon moi.
    expect(gate.calls).toBe(0);
  });

  it('chuyen chua tung duoc chieu sang v2: CHO QUA, va duong cu giu nguyen', async () => {
    // Nua thu hai: duong v1 thuan tuy. Cong khong siet them, va cung khong noi long gi —
    // `trip.status === 'RECONCILED'` van la dieu kien bat buoc o tren.
    const repo = new InMemorySettlementRepository();
    const service = new SettlementService(
      repo,
      new FakeCore(tripFacts()),
      new FakeFuel(),
      new FakeGate({ kind: 'NOT_PROJECTED' }),
    );

    const outcome = await service.recogniseCustomerReceivable(TRIP, 'ke-toan');
    expect(outcome.replayed).toBe(false);
    expect(await repo.listDocuments({})).toHaveLength(1);
  });
});

/**
 * CG-012 — CONG NO NHA XE NGOAI KHONG DI QUA CONG NAY.
 *
 * Xe khong phai cua B, khong lai xe nao cua B cam bien nhan ve, va `planTripProjection` TU CHOI
 * chieu chuyen `EXTERNAL_CARRIER` sang mot vong chay. Cam cong o day se chan cung mot duong dang
 * chay de doi lay con so khong.
 */
describe('Duong nha xe ngoai — CG-012', () => {
  it('cong no nha xe ngoai ghi duoc du nghiem thu dang PENDING', async () => {
    const trip = tripFacts({
      kind: 'EXTERNAL_CARRIER',
      carrierPartnerId: 'nha-xe-1',
      customerId: null,
    });
    const repo = new InMemorySettlementRepository();
    const gate = new FakeGate(blocked('PENDING'));
    const service = new SettlementService(repo, new FakeCore(trip), new FakeFuel(), gate);

    const outcome = await service.recogniseCarrierPayable(TRIP, 3_000_000, 'ke-toan');

    expect(outcome.document.sourceContext).toBe('TRIP_CARRIER_COST');
    expect(outcome.document.signedAmount).toBe(-3_000_000);
    expect(gate.calls).toBe(0);
  });
});
