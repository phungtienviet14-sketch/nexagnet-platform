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
  it('TRIP-CORE-004: huy duoc tu PLANNED, IN_TRANSIT va DELIVERED', () => {
    for (const from of ['PLANNED', 'IN_TRANSIT', 'DELIVERED'] as const) {
      expect(evaluateTripTransition(from, 'CANCELLED', internalRun).allowed).toBe(true);
    }
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
