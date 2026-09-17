import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRIVER_PAYMENT_METHOD,
  businessDateOf,
  fromDateTimeLocalValue,
  occurredAtProblem,
  toDateTimeLocalValue,
  toDriverFuelSubmission,
  type DriverFuelForm,
} from '../fuel-declaration';

/**
 * TO KHAI NHIEN LIEU cua lai xe — `#313`.
 *
 * Bai quan trong nhat o day la bai GUI LAI: `occurredAt` nam trong dinh danh chong ghi trung cua
 * may chu (`fuel-entry-identity.ts`). Ban tren `main` sinh `new Date()` NGAY LUC BAM, nen bam lai sau
 * mot lan mat mang voi CUNG khoa tuong quan se gui mot `occurredAt` khac va nhan `409
 * FUEL_CORRELATION_KEY_REUSED` thay vi phat lai phieu cu.
 */

const FORM: DriverFuelForm = {
  supplierId: 'cay-xang-1',
  stationId: 'tram-5',
  liters: ' 62.5 ',
  amount: '1437500',
  odometerKm: '120450',
  invoiceNo: ' 0001234 ',
  occurredAtLocal: '2026-09-16T07:30',
  paymentMethod: 'DRIVER_CASH',
};

const TRIP = { id: 'chuyen-1', vehicleId: 'xe-1' };

describe('toDriverFuelSubmission', () => {
  it('hai lan gui voi CUNG form va CUNG khoa cho ra CUNG than yeu cau — gui lai la phat lai', () => {
    const first = toDriverFuelSubmission({
      form: FORM,
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const retry = toDriverFuelSubmission({
      form: FORM,
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(retry).toEqual(first);
    expect(first.occurredAt).toBe(fromDateTimeLocalValue('2026-09-16T07:30')?.toISOString());
  });

  it('gui dung cac truong may chu nhan, cat khoang trang, khong co driverId', () => {
    const body = toDriverFuelSubmission({
      form: FORM,
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(body).toMatchObject({
      tripId: 'chuyen-1',
      vehicleId: 'xe-1',
      supplierId: 'cay-xang-1',
      liters: '62.5',
      amount: 1_437_500,
      odometerKm: 120_450,
      invoiceNo: '0001234',
      paymentMethod: 'DRIVER_CASH',
      correlationKey: 'khoa-1',
    });
    expect(Object.keys(body)).not.toContain('driverId');
    expect(body.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('so hoa don de trong thi gui null, khong gui chuoi rong', () => {
    const body = toDriverFuelSubmission({
      form: { ...FORM, invoiceNo: '   ' },
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(body.invoiceNo).toBeNull();
  });

  it('#317 — form MOI mac dinh ghi no cay xang; DRIVER_CASH chi khi lai xe chu dong chon', () => {
    expect(DEFAULT_DRIVER_PAYMENT_METHOD).toBe('SUPPLIER_ACCOUNT');
    const cash = toDriverFuelSubmission({
      form: { ...FORM, paymentMethod: 'DRIVER_CASH' },
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(cash.paymentMethod).toBe('DRIVER_CASH');
  });

  it('#317 G1 — tram da chon di vao than yeu cau; khong chon thi gui null tuong minh', () => {
    const withStation = toDriverFuelSubmission({
      form: FORM,
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const withoutStation = toDriverFuelSubmission({
      form: { ...FORM, stationId: '' },
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(withStation.stationId).toBe('tram-5');
    expect(withoutStation.stationId).toBeNull();
    expect(Object.keys(withoutStation)).toContain('stationId');
  });

  it('lai xe chon ghi no cay xang thi gui dung phuong thuc do', () => {
    const body = toDriverFuelSubmission({
      form: { ...FORM, paymentMethod: 'SUPPLIER_ACCOUNT' },
      trip: TRIP,
      correlationKey: 'khoa-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(body.paymentMethod).toBe('SUPPLIER_ACCOUNT');
  });
});

describe('ngay nghiep vu theo mui gio khach (INV-25)', () => {
  it('06:30 ngay 01/08 gio Viet Nam la 23:30Z ngay 31/07 — ngay nghiep vu van la 01/08', () => {
    expect(businessDateOf(new Date('2026-07-31T23:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-08-01');
  });

  it('mui gio hong trong goi khach khong lam hong to khai — roi ve mui gio may', () => {
    // 12:00Z roi vao ngay 14, 15 hoac 16 tuy mui gio cua may chay bai kiem (UTC-12..UTC+14).
    expect(businessDateOf(new Date('2026-07-15T12:00:00Z'), 'Khong/Co_That')).toMatch(
      /^2026-07-1[456]$/,
    );
  });
});

describe('o nhap thoi diem do', () => {
  it('di mot vong khong mat phut nao, bo giay', () => {
    const instant = new Date('2026-09-16T13:45:59.999Z');
    const roundTrip = fromDateTimeLocalValue(toDateTimeLocalValue(instant));

    expect(roundTrip?.getTime()).toBe(new Date('2026-09-16T13:45:00.000Z').getTime());
  });

  it.each(['', '2026-09-16', 'khong-phai-ngay', '2026-13-40T99:99'])(
    'gia tri hong "%s" -> null',
    (value) => {
      expect(fromDateTimeLocalValue(value)).toBeNull();
    },
  );

  it('thoi diem o tuong lai bi chan, lech dong ho vai phut thi khong', () => {
    const now = new Date('2026-09-16T13:00:00Z');

    expect(
      occurredAtProblem(toDateTimeLocalValue(new Date('2026-09-16T12:30:00Z')), now),
    ).toBeNull();
    expect(
      occurredAtProblem(toDateTimeLocalValue(new Date('2026-09-16T13:03:00Z')), now),
    ).toBeNull();
    expect(occurredAtProblem(toDateTimeLocalValue(new Date('2026-09-16T15:00:00Z')), now)).toBe(
      'Thời điểm đổ không được ở tương lai.',
    );
    expect(occurredAtProblem('', now)).toBe('Chọn thời điểm đổ.');
  });
});
