import { describe, expect, it } from 'vitest';
import {
  INITIAL_TRIP_STATUS,
  TRIP_KINDS,
  TRIP_STATUSES,
  evaluateTripTransition,
  isTerminalTripStatus,
  type TripTransitionContext,
} from './trip-lifecycle.js';

const internalRun: TripTransitionContext = {
  kind: 'OWN_DIRECT',
  hasVehicle: true,
  hasDriver: true,
  hasCarrierPartner: false,
};

const externalCarrier: TripTransitionContext = {
  kind: 'EXTERNAL_CARRIER',
  hasVehicle: false,
  hasDriver: false,
  hasCarrierPartner: true,
};

/**
 * Vong doi chuyen — nguon: T1 §7.1 (`PLANNED → IN_TRANSIT → DELIVERED → RECONCILED`, nhanh thoat
 * `CANCELLED`), `GD-01` (RECONCILED la chuyen tay co kiem soat), `GD-02` (huy thay cho xoa).
 *
 * Quy tac o day la mot HAM THUAN, khong phai mot cot trang thai ai cung set duoc: neu repository
 * hay controller tu gan `status` thi may trang thai chi con la mot loi khuyen, va duong sai se
 * duoc phat hien luc doi soat cuoi thang chu khong phai luc bam nut.
 */
describe('Vong doi chuyen', () => {
  it('nam trang thai va ba loai chuyen dung nhu hop dong mien', () => {
    expect([...TRIP_STATUSES]).toEqual([
      'PLANNED',
      'IN_TRANSIT',
      'DELIVERED',
      'RECONCILED',
      'CANCELLED',
    ]);
    expect([...TRIP_KINDS]).toEqual([
      'OWN_DIRECT',
      'EXTERNAL_CARRIER',
      'PARTNER_REFERRED_INTERNAL_RUN',
    ]);
  });

  // TRIP-CORE-001
  it('TRIP-CORE-001: chuyen moi tao bat dau o PLANNED', () => {
    expect(INITIAL_TRIP_STATUS).toBe('PLANNED');
  });

  // TRIP-CORE-002
  it('TRIP-CORE-002: PLANNED -> IN_TRANSIT -> DELIVERED -> RECONCILED deu hop le', () => {
    expect(evaluateTripTransition('PLANNED', 'IN_TRANSIT', internalRun)).toEqual({
      allowed: true,
      reason: 'TRANSITION_ALLOWED',
    });
    expect(evaluateTripTransition('IN_TRANSIT', 'DELIVERED', internalRun).allowed).toBe(true);
    expect(evaluateTripTransition('DELIVERED', 'RECONCILED', internalRun).allowed).toBe(true);
  });

  // TRIP-CORE-003
  it('TRIP-CORE-003: PLANNED -> DELIVERED bi TU CHOI, co ma ly do phan biet duoc', () => {
    expect(evaluateTripTransition('PLANNED', 'DELIVERED', internalRun)).toEqual({
      allowed: false,
      reason: 'TRANSITION_NOT_PERMITTED',
    });
  });

  it('khong duoc di lui: DELIVERED -> IN_TRANSIT bi tu choi', () => {
    expect(evaluateTripTransition('DELIVERED', 'IN_TRANSIT', internalRun).reason).toBe(
      'TRANSITION_NOT_PERMITTED',
    );
  });

  it('RECONCILED va CANCELLED la diem cuoi — moi loi ra deu bi tu choi', () => {
    expect(isTerminalTripStatus('RECONCILED')).toBe(true);
    expect(isTerminalTripStatus('CANCELLED')).toBe(true);
    expect(isTerminalTripStatus('DELIVERED')).toBe(false);
    for (const to of TRIP_STATUSES) {
      expect(evaluateTripTransition('RECONCILED', to, internalRun).allowed).toBe(false);
      expect(evaluateTripTransition('CANCELLED', to, internalRun).allowed).toBe(false);
    }
    expect(evaluateTripTransition('RECONCILED', 'CANCELLED', internalRun).reason).toBe(
      'TRIP_ALREADY_TERMINAL',
    );
  });

  it('chuyen sang chinh no la mot ma RIENG, khong gop vao "khong cho phep"', () => {
    expect(evaluateTripTransition('IN_TRANSIT', 'IN_TRANSIT', internalRun).reason).toBe(
      'TRIP_ALREADY_IN_STATE',
    );
  });

  // TRIP-CORE-004 (nhanh huy — xem trip.service.spec.ts cho phan "khong xoa cung")
  //
  // Bai nay TRUOC `#168 B6` khang dinh `.allowed === true`, tuc no ghi lai CHINH LO HONG: duong
  // chuyen trang thai chung dua duoc mot chuyen sang `CANCELLED`. Duong huy that van con nguyen o
  // `TripService.cancel()`; cai bi dong la duong VONG.
  it('TRIP-CORE-004 / #168 B6: huy KHONG di qua duong chuyen trang thai chung', () => {
    for (const from of ['PLANNED', 'IN_TRANSIT', 'DELIVERED'] as const) {
      expect(evaluateTripTransition(from, 'CANCELLED', internalRun)).toEqual({
        allowed: false,
        reason: 'TRIP_CANCEL_REQUIRES_DEDICATED_PATH',
      });
    }
  });

  it('#168 B6: ly do noi ro la "sai duong", khong phai "canh khong ton tai"', () => {
    // Phan biet nay la ca diem. `PLANNED -> CANCELLED` LA mot canh hop le cua do thi, nen tra
    // `TRANSITION_NOT_PERMITTED` se noi doi ve mo hinh va lam nguoi doc di tim mot canh khong thieu.
    expect(evaluateTripTransition('PLANNED', 'CANCELLED', internalRun).reason).toBe(
      'TRIP_CANCEL_REQUIRES_DEDICATED_PATH',
    );
    expect(evaluateTripTransition('PLANNED', 'DELIVERED', internalRun).reason).toBe(
      'TRANSITION_NOT_PERMITTED',
    );
  });

  it('#168 B6: chuyen DA huy van tra diem-cuoi, khong tra ma cua duong huy', () => {
    // Thu tu kiem tra phai giu: `isTerminalTripStatus(from)` chay TRUOC cong huy, nen mot chuyen da
    // huy khong bao gio duoc mach nuoc "hay dung duong huy rieng".
    expect(evaluateTripTransition('CANCELLED', 'CANCELLED', internalRun).reason).toBe(
      'TRIP_ALREADY_TERMINAL',
    );
  });

  describe('dieu kien nguon luc de lan banh — phan biet theo LOAI chuyen', () => {
    it('chuyen chay bang xe cong ty doi CA xe LAN lai xe', () => {
      expect(
        evaluateTripTransition('PLANNED', 'IN_TRANSIT', { ...internalRun, hasDriver: false }),
      ).toEqual({ allowed: false, reason: 'TRIP_RESOURCES_MISSING' });
      expect(
        evaluateTripTransition('PLANNED', 'IN_TRANSIT', { ...internalRun, hasVehicle: false })
          .reason,
      ).toBe('TRIP_RESOURCES_MISSING');
    });

    it('chuyen nhan chay ho cung la xe cong ty — cung dieu kien', () => {
      expect(
        evaluateTripTransition('PLANNED', 'IN_TRANSIT', {
          kind: 'PARTNER_REFERRED_INTERNAL_RUN',
          hasVehicle: true,
          hasDriver: false,
          hasCarrierPartner: false,
        }).reason,
      ).toBe('TRIP_RESOURCES_MISSING');
    });

    it('chuyen thue xe ngoai doi NHA XE, khong doi xe/lai xe cua cong ty', () => {
      expect(evaluateTripTransition('PLANNED', 'IN_TRANSIT', externalCarrier).allowed).toBe(true);
      expect(
        evaluateTripTransition('PLANNED', 'IN_TRANSIT', {
          ...externalCarrier,
          hasCarrierPartner: false,
        }),
      ).toEqual({ allowed: false, reason: 'TRIP_CARRIER_MISSING' });
    });
  });
});
