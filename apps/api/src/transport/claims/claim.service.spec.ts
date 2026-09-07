import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { CostingService } from '../costing/costing.service.js';
import { InMemoryCostingRepository } from '../costing/in-memory-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryTripRepository } from '../trips/trip.repository.js';
import { InMemoryExpenseClaimRepository } from './claim.repository.js';
import { ExpenseClaimService } from './claim.service.js';

/**
 * HAT GIONG NGHIEM THU `EC-001`..`EC-012` -- #234 A2 / #232 `D-06`.
 *
 * Cau ma bo test nay ton tai de khoa lai: **chi khoan DA DUYET moi cham vao gia thanh va so quy**.
 * Moi bai duoi day la mot cach cau do co the bi pha.
 */

const DRIVER_ACTOR = 'lai-xe-a';
const REVIEWER = 'ke-toan';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const COSTING_POLICY = {
  expenseCategories: ['Sửa chữa dọc đường', 'Bốc xếp', 'FUEL'],
  // `FUEL` CO trong danh muc cua T3 — va `EC-006` chung minh cong duyet van chan no, tuc bat
  // bien `D-05` khong dua vao viec danh muc tinh co khong khai no.
  advanceApprovalRequired: false,
} as const;
const BUSINESS_DATE = '2026-09-07';

describe('ExpenseClaimService -- de nghi chi cua lai xe va cong duyet', () => {
  let fleet: InMemoryFleetRepository;
  let trips: InMemoryTripRepository;
  let movement: InMemoryMovementRepository;
  let costingRepo: InMemoryCostingRepository;
  let costing: CostingService;
  let costingRead: CostingReadService;
  let claims: InMemoryExpenseClaimRepository;
  let service: ExpenseClaimService;

  let driverId: string;
  let tripId: string;

  beforeEach(async () => {
    fleet = new InMemoryFleetRepository();
    trips = new InMemoryTripRepository();
    movement = new InMemoryMovementRepository();
    costingRepo = new InMemoryCostingRepository();
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const core = new TransportCoreFactsAdapter(trips, fleet);
    costing = new CostingService(costingRepo, core, audit, POLICY, COSTING_POLICY);
    costingRead = new CostingReadService(costingRepo, core);
    claims = new InMemoryExpenseClaimRepository();
    service = new ExpenseClaimService(claims, costing, core, movement, fleet, audit, POLICY);

    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-12345',
      vehicleClass: 'Dau keo',
    });
    const driver = await fleet.createDriver({
      fullName: 'Lai xe A',
      phone: '0900000001',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });
    driverId = driver.id;
    const trip = await trips.create({
      code: 'CHUYEN-1',
      kind: 'OWN_DIRECT',
      businessDate: BUSINESS_DATE,
      originLabel: 'Ha Noi',
      destinationLabel: 'Hai Phong',
    });
    tripId = trip.id;
    await trips.assign(trip.id, {
      vehicleId: vehicle.id,
      driverId: driver.id,
      assignedBy: REVIEWER,
      at: new Date(),
    });
  });

  const submit = (over: Record<string, unknown> = {}) =>
    service.submit(
      {
        driverId,
        categoryCode: 'Sửa chữa dọc đường',
        claimedAmount: 450_000,
        businessDate: BUSINESS_DATE,
        tripId,
        note: 'Va lop doc duong',
        ...over,
      },
      DRIVER_ACTOR,
    );

  const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof TransportDomainError) return error.reason;
      throw error;
    }
    throw new Error('mong doi mot TransportDomainError, nhung loi goi da thanh cong');
  };

  const fundBalance = async (): Promise<number> =>
    (await costingRead.driverFundStatement(driverId)).balance;

  it('EC-001 -- de nghi moi la PENDING_REVIEW, va KHONG cham vao so quy', async () => {
    const claim = await submit();

    expect(claim.status).toBe('PENDING_REVIEW');
    expect(claim.approvedAmount).toBeNull();
    expect(claim.settlementExpenseId).toBeNull();
    expect(await fundBalance()).toBe(0);
    expect((await costingRead.tripCostBreakdown(tripId)).expenses).toHaveLength(0);
  });

  it('EC-002 -- DUYET moi ghi vao gia thanh va so quy', async () => {
    const claim = await submit();
    const decided = await service.approve(claim.id, { reasonCode: 'EVIDENCE_SUFFICIENT' }, REVIEWER);

    expect(decided.claim.status).toBe('APPROVED');
    expect(decided.claim.approvedAmount).toBe(450_000);
    expect(decided.claim.settlementExpenseId).not.toBeNull();

    const expenses = (await costingRead.tripCostBreakdown(tripId)).expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.fundedBy).toBe('DRIVER_FUND');
    // So quy giam dung so DUOC DUYET: lai xe da tieu tien cua cong ty.
    expect(await fundBalance()).toBe(-450_000);
  });

  it('EC-003 -- TU CHOI khong cham vao gia thanh, va van ghi lai ly do', async () => {
    const claim = await submit();
    const decided = await service.reject(claim.id, { reasonCode: 'NO_EVIDENCE' }, REVIEWER);

    expect(decided.claim.status).toBe('REJECTED');
    expect(decided.claim.approvedAmount).toBeNull();
    expect(decided.claim.settlementExpenseId).toBeNull();
    expect((await costingRead.tripCostBreakdown(tripId)).expenses).toHaveLength(0);
    expect(await fundBalance()).toBe(0);

    expect(decided.decisions).toHaveLength(1);
    expect(decided.decisions[0]).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'NO_EVIDENCE',
      decidedBy: REVIEWER,
      approvedAmount: null,
    });
  });

  it('EC-004 -- lich su quyet dinh la BAT BIEN: da quyet thi khong quyet lai', async () => {
    const claim = await submit();
    await service.approve(claim.id, { reasonCode: 'EVIDENCE_SUFFICIENT' }, REVIEWER);

    expect(await reasonOf(() => service.reject(claim.id, { reasonCode: 'DOI_Y' }, REVIEWER))).toBe(
      'CLAIM_ALREADY_DECIDED',
    );
    expect(
      await reasonOf(() => service.approve(claim.id, { reasonCode: 'LAN_HAI' }, REVIEWER)),
    ).toBe('CLAIM_ALREADY_DECIDED');

    // Va so quy KHONG bi tru hai lan.
    expect(await fundBalance()).toBe(-450_000);
  });

  it('EC-005 -- NGUOI DUYET khong duoc la NGUOI DE NGHI', async () => {
    const claim = await submit();
    const reason = await reasonOf(() =>
      service.approve(claim.id, { reasonCode: 'TU_DUYET' }, DRIVER_ACTOR),
    );
    expect(reason).toBe('CLAIM_REVIEWER_IS_SUBMITTER');
    expect(await fundBalance()).toBe(0);
  });

  it('EC-006 -- NHIEN LIEU khong di duong nay (`D-05`)', async () => {
    expect(await reasonOf(() => submit({ categoryCode: 'FUEL' }))).toBe(
      'CLAIM_CATEGORY_ROUTED_ELSEWHERE',
    );
  });

  it('EC-007 -- ETC khong di duong nay (`D-07`)', async () => {
    expect(await reasonOf(() => submit({ categoryCode: 'etc' }))).toBe(
      'CLAIM_CATEGORY_ROUTED_ELSEWHERE',
    );
  });

  it('EC-008 -- de nghi khong tham chieu vao dau bi tu choi CO TEN', async () => {
    const reason = await reasonOf(() => submit({ tripId: null }));
    expect(reason).toBe('CLAIM_REFERENCE_REQUIRED');
  });

  it('EC-009 -- lai xe khong duoc phan cong vao chuyen thi khong de nghi duoc tren chuyen do', async () => {
    const other = await fleet.createDriver({
      fullName: 'Lai xe B',
      phone: '0900000002',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });
    const reason = await reasonOf(() => submit({ driverId: other.id }));
    expect(reason).toBe('CLAIM_DRIVER_NOT_ASSIGNED');
  });

  it('EC-010 -- duyet nhieu hon so de nghi bi tu choi CO TEN', async () => {
    const claim = await submit();
    const reason = await reasonOf(() =>
      service.approve(claim.id, { reasonCode: 'ROI_RONG', approvedAmount: 500_000 }, REVIEWER),
    );
    expect(reason).toBe('CLAIM_APPROVED_AMOUNT_ABOVE_CLAIMED');
    expect(await fundBalance()).toBe(0);
  });

  it('EC-011 -- de nghi chi gan vao VONG CHAY: duyet duoc, nhung noi ro chua vao gia thanh', async () => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-77777',
      vehicleClass: 'Dau keo',
    });
    const run = await movement.createRun({
      code: 'RUN-1',
      vehicleId: vehicle.id,
      businessDate: BUSINESS_DATE,
    });
    const claim = await submit({ tripId: null, runId: run.id });

    const decided = await service.approve(claim.id, { reasonCode: 'EVIDENCE_SUFFICIENT' }, REVIEWER);
    expect(decided.claim.status).toBe('APPROVED');
    expect(decided.claim.approvedAmount).toBe(450_000);
    // Duong tien cua T3 di qua mot CHUYEN. Chua co chuyen thi chua vao gia thanh duoc -- va dieu do
    // phai DOC RA DUOC, khong duoc im lang.
    expect(decided.claim.settlementExpenseId).toBeNull();
    expect(await fundBalance()).toBe(0);
  });

  it('EC-012 -- so DE NGHI khong bao gio bi ghi de boi so DUYET', async () => {
    const claim = await submit({ claimedAmount: 450_000 });
    const decided = await service.approve(
      claim.id,
      { reasonCode: 'CAT_BOT', approvedAmount: 300_000 },
      REVIEWER,
    );

    expect(decided.claim.claimedAmount).toBe(450_000);
    expect(decided.claim.approvedAmount).toBe(300_000);
    // Gia thanh va so quy chay theo so DUYET, khong theo so de nghi.
    expect(await fundBalance()).toBe(-300_000);
  });
});
