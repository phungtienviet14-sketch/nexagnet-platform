import { describe, expect, it } from 'vitest';
import {
  categoryInputMode,
  currentLegacyTrip,
  expenseProblem,
  failureCertainty,
  openLegacyTrips,
  toExpenseBody,
} from './expenses';
import type { DriverTripView } from './types';

function trip(overrides: Partial<DriverTripView> = {}): DriverTripView {
  return {
    id: 't1',
    code: 'CH-01',
    status: 'IN_TRANSIT',
    businessDate: '2026-09-25',
    originLabel: 'A',
    destinationLabel: 'B',
    cargoDescription: null,
    distanceKm: null,
    customerName: null,
    vehicleId: 'v1',
    vehicleRegistrationPlate: null,
    isCurrentAssignee: true,
    ...overrides,
  };
}

describe('chuyen cu con mo', () => {
  it('chi PLANNED/IN_TRANSIT', () => {
    const trips = [
      trip(),
      trip({ id: 't2', status: 'DELIVERED' }),
      trip({ id: 't3', status: 'PLANNED' }),
    ];
    expect(openLegacyTrips(trips).map((item) => item.id)).toEqual(['t1', 't3']);
  });
  it('chuyen dang lam: dang chay truoc, chi chuyen minh dang phu trach', () => {
    expect(currentLegacyTrip([trip({ id: 'p', status: 'PLANNED' }), trip({ id: 'r' })])?.id).toBe(
      'r',
    );
    expect(currentLegacyTrip([trip({ isCurrentAssignee: false })])).toBeNull();
  });
});

describe('categoryInputMode', () => {
  it('danh muc mo hoac rong -> go tu do; dong -> chon', () => {
    expect(categoryInputMode({ categories: [], unrestricted: false })).toBe('FREE_TEXT');
    expect(categoryInputMode({ categories: ['BOT'], unrestricted: true })).toBe('FREE_TEXT');
    expect(categoryInputMode({ categories: ['BOT'], unrestricted: false })).toBe('CHOOSE');
  });
});

describe('toExpenseBody', () => {
  const form = { tripId: 't1', categoryCode: ' Phí cầu đường ', amountDigits: '150000', note: '' };
  it('than dong bang: khoa + ngay nghiep vu tuong minh, khong fundedBy/driverId', () => {
    const body = toExpenseBody({
      form,
      correlationKey: 'khoa-chi-0001',
      businessDate: '2026-09-25',
    });
    expect(body).toEqual({
      tripId: 't1',
      categoryCode: 'Phí cầu đường',
      amount: 150_000,
      businessDate: '2026-09-25',
      note: null,
      correlationKey: 'khoa-chi-0001',
    });
  });
  it('form hong -> cau loi tieng Viet', () => {
    expect(expenseProblem({ ...form, tripId: '' })).toBe('Chọn chuyến.');
    expect(expenseProblem({ ...form, amountDigits: '0' })).toBe('Nhập số tiền (đồng) lớn hơn 0.');
    expect(() =>
      toExpenseBody({
        form: { ...form, categoryCode: '' },
        correlationKey: 'k',
        businessDate: 'd',
      }),
    ).toThrow();
  });
});

describe('failureCertainty', () => {
  it('may chu da tu choi -> chac chan khong ghi; mat mang -> khong ro', () => {
    expect(failureCertainty('DOMAIN')).toBe('DEFINITE');
    expect(failureCertainty('NETWORK')).toBe('UNKNOWN');
    expect(failureCertainty('TIMEOUT')).toBe('UNKNOWN');
    expect(failureCertainty(null)).toBe('UNKNOWN');
  });
});
