import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CommercialAcceptanceState,
  OrderCompletionEligibility,
} from '../acceptance/acceptance.types.js';
import type { BusinessDate } from '../business-date.js';
import { InMemorySettlementRepository } from './in-memory-settlement.repository.js';
import { SettlementOrderCompletionGate } from './settlement-order-completion.port.js';
import { FuelSettlementSource, SettlementCoreFacts } from './settlement.ports.js';
import type { FuelHandoffFacts, SettlementTripFacts } from './settlement.ports.js';
import { SettlementService } from './settlement.service.js';
import { settlementDocumentFingerprint } from './settlement-documents.js';

/**
 * CG-020 — CONG DIEU KIEN DOI SOAT O GRAIN DON (`#275` K5).
 *
 * ============================================================================================
 * BO BAI QUAN TRONG NHAT CUA CA LANE
 * ============================================================================================
 *
 * `#275` goi day la mot cong tai chinh va xep no RUI RO CAO. Bang chan ly duoi day la ban dich sang
 * ma cua tam gach dau dong trong K5, va no phai doc duoc ma khong can mo mot tep nao khac.
 *
 * Khac biet trung tam so voi `#273`: nhanh "khong co chu the" DONG CONG thay vi cho qua.
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
class FakeGate extends SettlementOrderCompletionGate {
  calls = 0;

  constructor(private verdict: OrderCompletionEligibility) {
    super();
  }

  set(verdict: OrderCompletionEligibility): void {
    this.verdict = verdict;
  }

  async eligibilityForTrip(): Promise<OrderCompletionEligibility> {
    this.calls += 1;
    return this.verdict;
  }

  async eligibilityForOrder(): Promise<OrderCompletionEligibility> {
    this.calls += 1;
    return this.verdict;
  }
}

const blocked = (
  state: CommercialAcceptanceState,
  orderStatus: 'OPEN' | 'FULFILLED' | 'CANCELLED' = 'FULFILLED',
): OrderCompletionEligibility => ({
  kind: 'BLOCKED',
  orderId: 'don-1',
  orderCode: 'ORD-001',
  orderStatus,
  state,
});

const approved: OrderCompletionEligibility = {
  kind: 'ELIGIBLE',
  orderId: 'don-1',
  orderCode: 'ORD-001',
  acceptanceId: 'acc-1',
};

const seedLegacyCustomerReceivable = (repo: InMemorySettlementRepository) => {
  const identity = {
    direction: 'RECEIVABLE' as const,
    flow: 'CUSTOMER_FREIGHT' as const,
    counterpartyKind: 'CUSTOMER' as const,
    counterpartyId: 'khach-1',
    kind: 'ORIGINAL' as const,
    signedAmount: 5_000_000,
    currencyCode: 'VND',
    businessDate: '2026-09-08' as BusinessDate,
    dueDate: null,
    tripId: TRIP,
    adjustsId: null,
  };
  return repo.recogniseDocument({
    ...identity,
    sourceContext: 'TRIP_RECONCILED',
    sourceId: TRIP,
    sourceFingerprint: settlementDocumentFingerprint(identity),
    invoiceRef: null,
    note: null,
    recordedBy: 'ke-toan-cu',
  });
};

describe('Cong ket thuc don chan cong no khach — CG-020', () => {
  let repo: InMemorySettlementRepository;
  let gate: FakeGate;
  let service: SettlementService;

  const build = (verdict: OrderCompletionEligibility, trip = tripFacts()) => {
    repo = new InMemorySettlementRepository();
    gate = new FakeGate(verdict);
    service = new SettlementService(repo, new FakeCore(trip), new FakeFuel(), gate);
  };

  beforeEach(() => build(approved));

  it('FULFILLED + APPROVED — chi CHO DOI SOAT, khong tao cong no tu trip', async () => {
    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_CUSTOMER_RECONCILIATION_REQUIRED',
    });

    expect(await repo.listDocuments({})).toEqual([]);
  });

  it.each([
    ['PENDING', 'chua ai ket thuc'],
    ['REJECTED', 'da bi tu choi'],
    ['NEEDS_CORRECTION', 'bi tra lai doi bo sung'],
  ] as const)('FULFILLED + %s (%s) — BI CHAN', async (state, _mota) => {
    build(blocked(state));

    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
    });
    expect(await repo.listDocuments({})).toEqual([]);
  });

  /**
   * `#275` K5: *"APPROVED but operational prerequisite false => excluded"*.
   *
   * Tang ket thuc da chan viec nay tu truoc (khong ket thuc duoc mot don chua giao xong). Bai nay
   * kiem LOP THU HAI: ke ca khi lop thu nhat hong va mot ket luan nhu vay den duoc day, cong van
   * dong.
   */
  it.each(['OPEN', 'CANCELLED'] as const)(
    '%s + APPROVED — van bi chan, khong co duong tat nao',
    async (orderStatus) => {
      build(blocked('APPROVED', orderStatus));

      await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
        reason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
      });
    },
  );

  /**
   * KHAC BIET TRUNG TAM VOI `#273` — `#275` K5:
   *
   *     *"Remove/replace any final `NOT_PROJECTED => pass` behavior ... projection absence must not
   *     be an authorization bypass."*
   *
   * `#273` cho qua o nhanh nay. Bai duoi day la thu do dieu do bang mot cach ma khong the doc nham:
   * neu ai do khoi phuc hanh vi cu, bai nay DO.
   */
  it('KHONG co don lam chu the — DONG CONG, khong phai cho qua', async () => {
    build({ kind: 'NO_ORDER' });

    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_ORDER_NOT_LINKED',
    });
    expect(await repo.listDocuments({})).toEqual([]);
  });

  it('goi lai duong trip khong the bien Order completion thanh official AR', async () => {
    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_CUSTOMER_RECONCILIATION_REQUIRED',
    });
    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_CUSTOMER_RECONCILIATION_REQUIRED',
    });

    expect(await repo.listDocuments({})).toEqual([]);
  });

  /**
   * THU TU KIEM — cong moi THEM mot dieu kien, khong THAY dieu kien nao.
   *
   * Mot chuyen chua doi soat phai bao `SETTLEMENT_TRIP_NOT_RECONCILED` chu khong bao "chua ket
   * thuc": cai nguoi truc phai lam TRUOC la dong chuyen. Va cong moi khong duoc hoi den — mot loi
   * goi ra ngoai cho mot cau hoi khong con y nghia.
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
 * CG-021 — TUONG THICH LICH SU (`#275` K6).
 *
 * `#273` co HAI nua tuong thich: `ALREADY_SETTLED` va `NOT_PROJECTED`. `#275` giu nua thu nhat va
 * BO nua thu hai — vi nua thu hai la mot duong vong cua cong, khong phai mot phep tuong thich.
 *
 * Cho nen chi con MOT nua, va no phai du: mot hang da quyet toan TU TRUOC khi cong bat van doc
 * duoc, van tra ve chinh no, va cong KHONG duoc hoi den.
 */
describe('Tuong thich lich su — CG-021', () => {
  it('chuyen DA co chung tu tu truoc: goi lai tra ve ban cu, KHONG nem', async () => {
    const repo = new InMemorySettlementRepository();
    const core = new FakeCore(tripFacts());

    // Ghi truoc bang mot dich vu co cong LUON CHO QUA — mo phong du lieu co san tren `main`.
    const before = await seedLegacyCustomerReceivable(repo);

    // Bay gio cong da bat, va ho so ket thuc dang PENDING.
    const gate = new FakeGate(blocked('PENDING'));
    const gated = new SettlementService(repo, core, new FakeFuel(), gate);

    const again = await gated.recogniseCustomerReceivable(TRIP, 'ke-toan');
    expect(again.replayed).toBe(true);
    expect(again.document.id).toBe(before.document.id);
    // Cong THAM CHI khong duoc hoi den: da co chung tu thi day khong phai mot lan chon nguon moi.
    expect(gate.calls).toBe(0);
  });

  it('hang lich su van tra ve duoc ke ca khi chua co don nao lam chu the', async () => {
    // Truong hop kho nhat: mot chuyen v1 thuan tuy DA quyet toan tu truoc, va no khong bao gio co
    // don. Neu nua `ALREADY_SETTLED` bi bo, chinh hang nay se NEM `SETTLEMENT_ORDER_NOT_LINKED`.
    const repo = new InMemorySettlementRepository();
    const core = new FakeCore(tripFacts());

    const before = await seedLegacyCustomerReceivable(repo);

    const gate = new FakeGate({ kind: 'NO_ORDER' });
    const gated = new SettlementService(repo, core, new FakeFuel(), gate);

    const again = await gated.recogniseCustomerReceivable(TRIP, 'ke-toan');
    expect(again.replayed).toBe(true);
    expect(again.document.id).toBe(before.document.id);
    expect(gate.calls).toBe(0);
  });
});

/**
 * CG-022 — CONG NO NHA XE NGOAI KHONG DI QUA CONG NAY, va do la mot ket luan DA DO LAI.
 *
 * `#275` K5 dan: *"Do not blindly copy #273's assumption that external-carrier work has no
 * receipt/acceptance need. Re-measure business sources and current Order kinds."*
 *
 * Do lai tren `main`: `TRIP_CARRIER_COST` la B TRA cho mot nha xe ngoai theo hop dong van tai giua
 * B va ho. Nghia vu bien nhan cua chinh chuyen ay VAN ton tai — nhung o dong `CUSTOMER_FREIGHT`,
 * noi khach A ky nhan hang, va dong do di qua cong nhu moi dong khac. Bai thu hai duoi day chung
 * minh chinh dieu do, va no la ly do duong nay duoc phep di qua.
 */
describe('Duong nha xe ngoai — CG-022', () => {
  it('cong no nha xe ngoai ghi duoc du ket thuc don dang PENDING', async () => {
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

  it('nhung cong no KHACH cua CHINH chuyen thue ngoai do VAN bi chan', async () => {
    const trip = tripFacts({ kind: 'EXTERNAL_CARRIER', carrierPartnerId: 'nha-xe-1' });
    const repo = new InMemorySettlementRepository();
    const gate = new FakeGate(blocked('PENDING'));
    const service = new SettlementService(repo, new FakeCore(trip), new FakeFuel(), gate);

    await expect(service.recogniseCustomerReceivable(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
    });
    expect(gate.calls).toBe(1);
  });
});

/**
 * CG-023 — HOA HONG DOI TAC di qua cong.
 *
 * Chuyen `PARTNER_REFERRED_INTERNAL_RUN` chay bang XE CUA B, nen no co lai xe cua B mang bien nhan
 * ve va co mot nghia vu thuong mai voi khach. Quy trinh chu so huu mo ta ap dung nguyen ven.
 */
describe('Hoa hong doi tac — CG-023', () => {
  const partnerTrip = tripFacts({
    kind: 'PARTNER_REFERRED_INTERNAL_RUN',
    referrerPartnerId: 'doi-tac-1',
  });

  it('chua ket thuc don thi khong tinh hoa hong duoc', async () => {
    const repo = new InMemorySettlementRepository();
    const gate = new FakeGate(blocked('PENDING'));
    const service = new SettlementService(repo, new FakeCore(partnerTrip), new FakeFuel(), gate);

    await expect(service.recogniseCommission(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
    });
  });

  it('khong co don lam chu the thi cung khong tinh duoc', async () => {
    const repo = new InMemorySettlementRepository();
    const gate = new FakeGate({ kind: 'NO_ORDER' });
    const service = new SettlementService(repo, new FakeCore(partnerTrip), new FakeFuel(), gate);

    await expect(service.recogniseCommission(TRIP, 'ke-toan')).rejects.toMatchObject({
      reason: 'SETTLEMENT_ORDER_NOT_LINKED',
    });
  });
});
