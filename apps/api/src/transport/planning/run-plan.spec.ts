import { describe, expect, it } from 'vitest';
import type { Depot, RunGrouping } from './planning.types.js';
import {
  planOrderAssignment,
  planRunCode,
  type PlannerLegFacts,
  type PlannerRunFacts,
} from './run-plan.js';

/**
 * BO LAP KE HOACH — bai kiem TAT DINH tren ham thuan.
 *
 * `#276` L9 dat mot danh sach bai bat buoc. Nhung bai thuoc ve QUYET DINH LAP KE HOACH nam o day:
 *
 *     bai 6   che do mot-don khong bao gio gop hai don vao mot vong chay
 *     bai 7   che do nhieu-don gop duoc don A + B
 *     bai 8   can di chuyen giua giao A va lay B -> DUNG MOT chang rong
 *     bai 9   khong can di chuyen -> KHONG bia mot chang rong nao
 *     bai 11  km khong biet o lai `null`, khong thanh 0
 *     bai 15  don moi sau khi vong chay dong -> vong chay MOI
 */

const DEPOT: Depot = { code: 'DEPOT-HN', label: 'Bãi xe Hà Nội' };

const ORDER_A = {
  id: 'order-a',
  code: 'ORD-A',
  originLabel: 'Kho Hà Nội',
  destinationLabel: 'Hải Phòng',
};

const ORDER_B = {
  id: 'order-b',
  code: 'ORD-B',
  originLabel: 'Ninh Bình',
  destinationLabel: 'Thanh Hóa',
};

const leg = (over: Partial<PlannerLegFacts> = {}): PlannerLegFacts => ({
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  destinationLabel: 'Hải Phòng',
  ...over,
});

const run = (over: Partial<PlannerRunFacts> = {}): PlannerRunFacts => ({
  id: 'run-1',
  code: 'RUN-S260911-AAAA1111',
  status: 'ACTIVE',
  legs: [leg()],
  ...over,
});

const plan = (
  grouping: RunGrouping,
  over: Partial<Parameters<typeof planOrderAssignment>[0]> = {},
) =>
  planOrderAssignment({
    order: ORDER_A,
    vehicleId: 'vehicle-1',
    grouping,
    depot: DEPOT,
    latestRun: null,
    ...over,
  });

describe('bo lap ke hoach vong chay (#276 L2/L3)', () => {
  describe('che do ONE_ORDER_PER_RUN', () => {
    it('bai 6 -- KHONG BAO GIO noi vao vong chay dang chay, ke ca khi xe dang chay do', () => {
      const decision = plan('ONE_ORDER_PER_RUN', { latestRun: run() });
      expect(decision.proposal.outcome).toBe('NEW_RUN');
      expect(decision.proposal.runId).toBeNull();
      expect(decision.groupingReason).toBe('GROUPING_ONE_ORDER_PER_RUN');
    });

    it('bai xe khac diem lay hang -> mot chang RONG roi mot chang CO HANG', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN');
      expect(proposal.emptyLegRequired).toBe(true);
      expect(proposal.startSource).toBe('DEPOT');
      expect(proposal.legs).toEqual([
        {
          sequence: 1,
          kind: 'EMPTY',
          orderId: null,
          originLabel: 'Bãi xe Hà Nội',
          destinationLabel: 'Kho Hà Nội',
          plannedDistanceKm: null,
        },
        {
          sequence: 2,
          kind: 'LOADED',
          orderId: 'order-a',
          originLabel: 'Kho Hà Nội',
          destinationLabel: 'Hải Phòng',
          plannedDistanceKm: null,
        },
      ]);
    });

    it('bai 9 -- bai xe TRUNG diem lay hang thi KHONG bia mot chang rong nao', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN', {
        depot: { code: 'DEPOT-HN', label: 'Kho Hà Nội' },
      });
      expect(proposal.emptyLegRequired).toBe(false);
      expect(proposal.legs).toHaveLength(1);
      expect(proposal.legs[0]?.kind).toBe('LOADED');
      expect(proposal.legs[0]?.sequence).toBe(1);
    });

    it('so sanh dia diem bo qua khoang thua va hoa/thuong', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN', {
        depot: { code: 'DEPOT-HN', label: '  kho   HÀ NỘI ' },
      });
      expect(proposal.emptyLegRequired).toBe(false);
    });

    it('KHONG bo dau: "Kho Ha Noi" va "Kho Hà Nội" van la hai cho khac nhau', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN', {
        depot: { code: 'DEPOT-HN', label: 'Kho Ha Noi' },
      });
      expect(proposal.emptyLegRequired).toBe(true);
    });

    it('khong khai bai xe -> khong biet xe o dau -> KHONG chang rong nao', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN', { depot: null });
      expect(proposal.startSource).toBe('ORDER_ORIGIN');
      expect(proposal.emptyLegRequired).toBe(false);
      expect(proposal.legs).toHaveLength(1);
    });
  });

  describe('che do MULTI_ORDER_RUN', () => {
    it('bai 7 -- noi don thu hai vao vong chay dang chay', () => {
      const decision = planOrderAssignment({
        order: ORDER_B,
        vehicleId: 'vehicle-1',
        grouping: 'MULTI_ORDER_RUN',
        depot: DEPOT,
        latestRun: run(),
      });
      expect(decision.proposal.outcome).toBe('APPENDED');
      expect(decision.proposal.runId).toBe('run-1');
      expect(decision.groupingReason).toBe('GROUPING_MULTI_APPENDED_TO_OPEN_RUN');
    });

    it('bai 8 -- giao o Hai Phong roi lay o Ninh Binh sinh DUNG MOT chang rong', () => {
      const { proposal } = planOrderAssignment({
        order: ORDER_B,
        vehicleId: 'vehicle-1',
        grouping: 'MULTI_ORDER_RUN',
        depot: DEPOT,
        latestRun: run(),
      });
      const empties = proposal.legs.filter((entry) => entry.kind === 'EMPTY');
      expect(empties).toHaveLength(1);
      expect(empties[0]).toMatchObject({
        sequence: 2,
        originLabel: 'Hải Phòng',
        destinationLabel: 'Ninh Bình',
        orderId: null,
      });
      expect(proposal.startSource).toBe('PREVIOUS_LEG_DESTINATION');
    });

    it('bai 9 -- giao va lay o CUNG mot cho thi khong sinh chang rong nao', () => {
      const { proposal } = planOrderAssignment({
        order: { ...ORDER_B, originLabel: 'Hải Phòng' },
        vehicleId: 'vehicle-1',
        grouping: 'MULTI_ORDER_RUN',
        depot: DEPOT,
        latestRun: run(),
      });
      expect(proposal.emptyLegRequired).toBe(false);
      expect(proposal.legs).toHaveLength(1);
      expect(proposal.legs[0]?.sequence).toBe(2);
    });

    it('bai 15 -- vong chay da o diem cuoi thi mo vong chay MOI, khong mo lai cai cu', () => {
      for (const status of ['COMPLETED', 'CANCELLED'] as const) {
        const decision = planOrderAssignment({
          order: ORDER_B,
          vehicleId: 'vehicle-1',
          grouping: 'MULTI_ORDER_RUN',
          depot: DEPOT,
          latestRun: run({ status }),
        });
        expect(decision.proposal.outcome).toBe('NEW_RUN');
        expect(decision.proposal.runId).toBeNull();
        expect(decision.groupingReason).toBe('GROUPING_MULTI_OPEN_RUN_TERMINAL');
      }
    });

    it('xe chua co vong chay nao -> vong chay moi, va LY DO khac han truong hop tren', () => {
      const decision = planOrderAssignment({
        order: ORDER_B,
        vehicleId: 'vehicle-1',
        grouping: 'MULTI_ORDER_RUN',
        depot: DEPOT,
        latestRun: null,
      });
      expect(decision.groupingReason).toBe('GROUPING_MULTI_NO_OPEN_RUN');
    });

    it('so thu tu ke tiep dem CA chang da huy -- `@@unique([runId, sequence])` khong tru chung', () => {
      const { proposal } = planOrderAssignment({
        order: ORDER_B,
        vehicleId: 'vehicle-1',
        grouping: 'MULTI_ORDER_RUN',
        depot: DEPOT,
        latestRun: run({
          legs: [
            leg({ sequence: 1 }),
            leg({ sequence: 2, status: 'CANCELLED', destinationLabel: 'Nam Định' }),
          ],
        }),
      });
      expect(proposal.legs[0]?.sequence).toBe(3);
    });

    it('chang DA HUY khong duoc lam diem xuat phat', () => {
      const { proposal } = planOrderAssignment({
        order: ORDER_B,
        vehicleId: 'vehicle-1',
        grouping: 'MULTI_ORDER_RUN',
        depot: DEPOT,
        latestRun: run({
          legs: [
            leg({ sequence: 1, destinationLabel: 'Hải Phòng' }),
            leg({ sequence: 2, status: 'CANCELLED', destinationLabel: 'Nam Định' }),
          ],
        }),
      });
      // Neu doc chang huy thi diem xuat phat se la "Nam Định" — mot noi xe chua tung den.
      expect(proposal.legs[0]).toMatchObject({ kind: 'EMPTY', originLabel: 'Hải Phòng' });
    });

    it('moi chang deu huy het -> khong biet xe o dau -> khong chang rong nao', () => {
      const { proposal } = planOrderAssignment({
        order: ORDER_B,
        vehicleId: 'vehicle-1',
        grouping: 'MULTI_ORDER_RUN',
        depot: DEPOT,
        latestRun: run({ legs: [leg({ status: 'CANCELLED' })] }),
      });
      expect(proposal.startSource).toBe('ORDER_ORIGIN');
      expect(proposal.emptyLegRequired).toBe(false);
    });
  });

  describe('km du kien', () => {
    it('bai 11 -- khong khai thi o lai `null`, KHONG thanh 0', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN');
      for (const entry of proposal.legs) expect(entry.plannedDistanceKm).toBeNull();
    });

    it('khai thi di dung vao chang cua no', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN', {
        distanceHint: { emptyKm: 12, loadedKm: 105 },
      });
      expect(proposal.legs.find((entry) => entry.kind === 'EMPTY')?.plannedDistanceKm).toBe(12);
      expect(proposal.legs.find((entry) => entry.kind === 'LOADED')?.plannedDistanceKm).toBe(105);
    });

    it('khai 0 van la 0 — chi `undefined`/`null` moi la chua biet', () => {
      const { proposal } = plan('ONE_ORDER_PER_RUN', { distanceHint: { emptyKm: 0 } });
      expect(proposal.legs.find((entry) => entry.kind === 'EMPTY')?.plannedDistanceKm).toBe(0);
    });
  });

  it('chang RONG khong bao gio mang mot nghia vu thuong mai', () => {
    const { proposal } = plan('ONE_ORDER_PER_RUN');
    for (const entry of proposal.legs) {
      if (entry.kind === 'EMPTY') expect(entry.orderId).toBeNull();
    }
  });

  it('KHONG sinh chang rong ve bai o cuoi -- `#276` L2 cam dieu do', () => {
    const { proposal } = plan('ONE_ORDER_PER_RUN');
    const last = proposal.legs[proposal.legs.length - 1];
    expect(last?.kind).toBe('LOADED');
    expect(last?.destinationLabel).toBe('Hải Phòng');
  });

  describe('ma vong chay do he thong sinh', () => {
    it('mang nhan `S` va phan ngay rut gon', () => {
      expect(planRunCode('2026-09-11', 'abcdef0123456789')).toBe('RUN-S260911-ABCDEF01');
    });

    it('TAT DINH: cung dau vao cho cung ma', () => {
      expect(planRunCode('2026-09-11', 'deadbeefcafe')).toBe(
        planRunCode('2026-09-11', 'deadbeefcafe'),
      );
    });
  });
});
