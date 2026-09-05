import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { CostingService } from './costing.service.js';
import { DriverExpensesSelfController } from './driver-expenses-self.controller.js';
import { InMemoryCostingRepository } from './in-memory-costing.repository.js';
import {
  TransportCoreFacts,
  type DriverFacts,
  type TripFacts,
} from './transport-core-facts.port.js';

/**
 * `#168 B3`/`B4` — be mat lai xe cho khoan chi thuong.
 *
 * Cung khuon `costing.service.spec.ts`: kho trong bo nho + mot `TransportCoreFacts` gia. Bo nay
 * chung minh QUY TAC — rang cac cong co san cua T3 that su dong lai quanh duong moi. Nhung gi no
 * khong chung minh (giao dich, unique, `CHECK`) nam o `transport-costing.int.spec.ts` tren
 * Postgres 16 that.
 */

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const DRIVER_A_USER = 'user-lai-xe-a';
const DRIVER_B_USER = 'user-lai-xe-b';

class FakeCoreFacts extends TransportCoreFacts {
  readonly trips = new Map<string, TripFacts>();
  readonly drivers = new Map<string, DriverFacts>();
  readonly bindings = new Map<string, string>();
  readonly assignments = new Map<string, Set<string>>();

  assign(tripId: string, driverId: string): void {
    const seen = this.assignments.get(tripId) ?? new Set<string>();
    seen.add(driverId);
    this.assignments.set(tripId, seen);
  }

  async findTrip(tripId: string): Promise<TripFacts | null> {
    return this.trips.get(tripId) ?? null;
  }

  async findDriver(driverId: string): Promise<DriverFacts | null> {
    return this.drivers.get(driverId) ?? null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<DriverFacts | null> {
    const driverId = this.bindings.get(authUserId);
    return driverId ? (this.drivers.get(driverId) ?? null) : null;
  }

  async wasDriverEverAssignedToTrip(tripId: string, driverId: string): Promise<boolean> {
    return this.assignments.get(tripId)?.has(driverId) ?? false;
  }
}

const requestOf = (authUserId: string): AuthenticatedRequest =>
  ({ authUser: { id: authUserId, role: 'SALE' } }) as unknown as AuthenticatedRequest;

function harness(expenseCategories: readonly string[] = []) {
  const ledger = new InMemoryCostingRepository();
  const core = new FakeCoreFacts();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());

  core.drivers.set('drv-a', { id: 'drv-a', fullName: 'Lai Xe A' });
  core.drivers.set('drv-b', { id: 'drv-b', fullName: 'Lai Xe B' });
  core.bindings.set(DRIVER_A_USER, 'drv-a');
  core.bindings.set(DRIVER_B_USER, 'drv-b');
  core.trips.set('trip-a', { id: 'trip-a', code: 'CH-A', kind: 'OWN_DIRECT', status: 'IN_TRANSIT' });
  core.trips.set('trip-b', { id: 'trip-b', code: 'CH-B', kind: 'OWN_DIRECT', status: 'IN_TRANSIT' });
  core.assign('trip-a', 'drv-a');
  core.assign('trip-b', 'drv-b');

  const costing = new CostingService(ledger, core, audit, CORE_POLICY, {
    expenseCategories,
    advanceApprovalRequired: false,
  });
  return { ledger, core, costing, controller: new DriverExpensesSelfController(costing) };
}

const validBody = (tripId: string) => ({
  tripId,
  categoryCode: 'CAU_DUONG',
  amount: 120_000,
  businessDate: '2026-09-01',
});

describe('DriverExpensesSelfController — #168 B3', () => {
  it('lai xe ghi duoc khoan chi tren chuyen CUA CHINH MINH', async () => {
    const { controller } = harness();

    const posted = await controller.record(requestOf(DRIVER_A_USER), validBody('trip-a'));

    expect(posted.expense?.tripId).toBe('trip-a');
    expect(posted.expense?.driverId).toBe('drv-a');
    // `DRIVER_FUND` sinh doi: mot but toan quy AM va mot dong gia thanh DUONG (`INV-03`).
    expect(posted.expense?.fundedBy).toBe('DRIVER_FUND');
    expect(posted.entry).not.toBeNull();
  });

  /**
   * PHEP THU QUAN TRONG NHAT cua B3.
   *
   * Khong mot phep kiem quyen nao duoc viet lai trong `recordSelfTripExpense`: cong that la
   * `requireDriverAssignedToTrip()` co san cua T3. Bai nay chung minh cong do THAT SU dong lai
   * quanh duong moi, chu khong chi ton tai o duong cu.
   */
  it('lai xe A KHONG ghi duoc vao chuyen cua lai xe B', async () => {
    const { controller } = harness();

    await expect(
      controller.record(requestOf(DRIVER_A_USER), validBody('trip-b')),
    ).rejects.toMatchObject({ response: { reason: 'EXPENSE_DRIVER_NOT_ASSIGNED' } });
  });

  it('...va duong hop le cua chinh nguoi do van chay', async () => {
    const { controller } = harness();
    await expect(
      controller.record(requestOf(DRIVER_A_USER), validBody('trip-a')),
    ).resolves.toBeDefined();
  });

  it('danh tinh den tu PHIEN: cung mot than yeu cau, hai nguoi, hai ket qua', async () => {
    const { controller } = harness();
    const body = validBody('trip-b');

    await expect(controller.record(requestOf(DRIVER_B_USER), body)).resolves.toBeDefined();
    await expect(controller.record(requestOf(DRIVER_A_USER), body)).rejects.toThrow();
  });

  it('tai khoan chua noi voi ho so lai xe bi tu choi CO LY DO', async () => {
    const { controller } = harness();

    await expect(
      controller.record(requestOf('user-khong-phai-lai-xe'), validBody('trip-a')),
    ).rejects.toMatchObject({ response: { reason: 'SELF_EXPENSE_SCOPE_NO_DRIVER_BINDING' } });
  });

  /**
   * Hai truong VANG MAT cua `driverSelfExpenseSchema` la ca diem cua B3, nen chung phai bi tu choi
   * TUONG MINH — khong phai bi bo qua im lang.
   */
  it('than yeu cau khong nhan `driverId` — khong ghi ho nguoi khac duoc', async () => {
    const { controller } = harness();

    expect(() =>
      controller.record(requestOf(DRIVER_A_USER), { ...validBody('trip-a'), driverId: 'drv-b' }),
    ).toThrow(BadRequestException);
  });

  it('than yeu cau khong nhan `fundedBy` — khong tuyen bo "cong ty da tra" duoc', async () => {
    const { controller } = harness();

    expect(() =>
      controller.record(requestOf(DRIVER_A_USER), {
        ...validBody('trip-a'),
        fundedBy: 'COMPANY_DIRECT',
      }),
    ).toThrow(BadRequestException);
  });

  it('khong co phien thi khong co "chinh minh" — bi tu choi', async () => {
    const { controller } = harness();

    expect(() => controller.record({} as AuthenticatedRequest, validBody('trip-a'))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('#168 B4 — danh muc nhom chi phi', () => {
  it('danh muc RONG doc len la "nhap tu do", khong phai "khong nhom nao hop le"', () => {
    expect(harness().controller.categories()).toEqual({ categories: [], unrestricted: true });
  });

  it('goi khach co danh muc thi tra dung danh muc do', () => {
    expect(harness(['CAU_DUONG', 'BOC_XEP', 'AN_CA']).controller.categories()).toEqual({
      categories: ['CAU_DUONG', 'BOC_XEP', 'AN_CA'],
      unrestricted: false,
    });
  });

  /**
   * Danh muc phai la CHINH cai may chu kiem theo. Neu hai ben doc hai nguon, trieu chung se la
   * "chon dung muc tren man hinh ma van bi 400".
   */
  it('mot ma NGOAI danh muc bi tu choi — cung nguon voi danh sach vua tra', async () => {
    const { controller } = harness(['CAU_DUONG']);

    expect(controller.categories().categories).toEqual(['CAU_DUONG']);

    await expect(
      controller.record(requestOf(DRIVER_A_USER), {
        ...validBody('trip-a'),
        categoryCode: 'MOT_MA_BIA_RA',
      }),
    ).rejects.toMatchObject({ response: { reason: 'EXPENSE_CATEGORY_UNKNOWN' } });

    await expect(
      controller.record(requestOf(DRIVER_A_USER), validBody('trip-a')),
    ).resolves.toBeDefined();
  });
});
