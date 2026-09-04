import { describe, expect, it } from 'vitest';
import {
  activeAssignment,
  cancellationNote,
  EMPTY_TRIP_FILTER,
  filterTrips,
  findTripByCode,
  primaryOffer,
  sortTrips,
  toAssignmentRows,
  toDirectory,
  toTripRow,
  toTripTimeline,
  tripActionOffers,
  tripCodeOf,
} from '../trips';
import { assignment, customer, driver, partner, trip, vehicle } from './fixtures';

const directory = toDirectory({
  customers: [customer()],
  partners: [partner()],
  vehicles: [vehicle()],
  drivers: [driver()],
});

describe('dong danh sach chuyen', () => {
  it('hien TEN khach hang, khong hien id ky thuat lam nhan', () => {
    const row = toTripRow(trip(), directory);
    expect(row.customerLabel).toBe('Công ty Đông Anh');
    expect(row.customerLabel).not.toContain('cus-1');
    expect(row.code).toBe('VT-2026-0912');
  });

  it('khoa ngoai tra cuu khong ra thi NOI RO, khong dan uuid len man hinh', () => {
    const row = toTripRow(trip({ customerId: 'cus-khong-co' }), directory);
    expect(row.customerLabel).toBe('Khách hàng chưa đọc được tên');
    expect(row.customerLabel).not.toContain('cus-khong-co');
  });

  it('chuyen khong co khach chi dinh doc len la noi bo, khong phai mot o trong', () => {
    expect(toTripRow(trip({ customerId: null }), directory).customerLabel).toBe('Nội bộ');
  });

  it('gia cuoc thieu khong duoc hien thanh 0 dong', () => {
    expect(toTripRow(trip({ freightAmount: null }), directory).freightLabel).toBe('—');
  });

  it('ngay nghiep vu hien theo lich Viet Nam va KHONG bi lech mot ngay', () => {
    expect(toTripRow(trip({ businessDate: '2026-01-01' }), directory).businessDateLabel).toBe(
      '01/01/2026',
    );
  });
});

describe('tim va loc — buoc phai lam o man hinh vi API khong co bo loc nao', () => {
  const trips = [
    trip({ id: 't1', code: 'VT-001', destinationLabel: 'Thái Nguyên', status: 'IN_TRANSIT' }),
    trip({ id: 't2', code: 'VT-002', destinationLabel: 'Đông Anh', status: 'PLANNED' }),
    trip({
      id: 't3',
      code: 'VT-003',
      destinationLabel: 'Đà Nẵng',
      kind: 'EXTERNAL_CARRIER',
      status: 'DELIVERED',
    }),
  ];

  it('go khong dau van tim ra dia danh co dau', () => {
    expect(
      filterTrips(trips, { ...EMPTY_TRIP_FILTER, search: 'thai nguyen' }).map((row) => row.code),
    ).toEqual(['VT-001']);
  });

  it('go "dong anh" tim ra "Đông Anh" — chu Đ khong phai D co dau nen phai doi tay', () => {
    expect(
      filterTrips(trips, { ...EMPTY_TRIP_FILTER, search: 'dong anh' }).map((row) => row.code),
    ).toEqual(['VT-002']);
  });

  it('go "da nang" tim ra "Đà Nẵng"', () => {
    expect(
      filterTrips(trips, { ...EMPTY_TRIP_FILTER, search: 'da nang' }).map((row) => row.code),
    ).toEqual(['VT-003']);
  });

  it('loc theo trang thai va theo loai chuyen', () => {
    expect(
      filterTrips(trips, { ...EMPTY_TRIP_FILTER, status: 'PLANNED' }).map((row) => row.code),
    ).toEqual(['VT-002']);
    expect(
      filterTrips(trips, { ...EMPTY_TRIP_FILTER, kind: 'EXTERNAL_CARRIER' }).map((row) => row.code),
    ).toEqual(['VT-003']);
  });

  it('khong loc gi thi tra lai nguyen danh sach', () => {
    expect(filterTrips(trips, EMPTY_TRIP_FILTER)).toHaveLength(3);
  });

  it('sap xep giong may chu: ngay giam dan, roi ma tang dan', () => {
    const mixed = [
      trip({ id: 'a', code: 'VT-B', businessDate: '2026-09-01' }),
      trip({ id: 'b', code: 'VT-A', businessDate: '2026-09-03' }),
      trip({ id: 'c', code: 'VT-A', businessDate: '2026-09-01' }),
    ];
    expect(sortTrips(mixed).map((row) => `${row.businessDate}/${row.code}`)).toEqual([
      '2026-09-03/VT-A',
      '2026-09-01/VT-A',
      '2026-09-01/VT-B',
    ]);
  });

  it('dia chi mang MA chuyen, va doi nguoc ve id duoc', () => {
    expect(findTripByCode(trips, 'VT-002')?.id).toBe('t2');
    expect(findTripByCode(trips, 'khong-co')).toBeNull();
    expect(tripCodeOf(trips, 't3')).toBe('VT-003');
  });
});

describe('phan cong', () => {
  it('dong dang hieu luc la dong khong co ngay ket thuc', () => {
    const rows = [
      assignment({ id: 'a1', effectiveTo: '2026-09-04T05:00:00.000Z' }),
      assignment({ id: 'a2', effectiveTo: null }),
    ];
    expect(activeAssignment(rows)?.id).toBe('a2');
    expect(activeAssignment([assignment({ effectiveTo: '2026-09-04T05:00:00.000Z' })])).toBeNull();
  });

  it('lich su phan cong doc ra bien so va ten nguoi, khong ra id', () => {
    const rows = toAssignmentRows([assignment()], directory);
    expect(rows[0]!.vehicleLabel).toBe('29H-123.45');
    expect(rows[0]!.driverLabel).toBe('Nguyễn Văn Bình');
    expect(rows[0]!.toLabel).toBe('đang hiệu lực');
    expect(rows[0]!.isActive).toBe(true);
  });
});

describe('thao tac duoc phep — goi y, khong phai phan quyet', () => {
  it('chuyen da len ke hoach co du xe va lai xe thi cho chay la viec chinh', () => {
    const offers = tripActionOffers(trip(), assignment(), 'ADMIN');
    const primary = primaryOffer(offers);
    expect(primary?.id).toBe('start');
    expect(primary?.blockedReason).toBeNull();
  });

  it('thieu phan cong thi noi TRUOC ly do, khong de nguoi dung bam roi nhan tu choi', () => {
    const offers = tripActionOffers(trip(), null, 'ADMIN');
    expect(offers.find((offer) => offer.id === 'start')?.blockedReason).toBe(
      'Cần phân công cả xe và lái xe trước khi cho chạy.',
    );
  });

  it('chuyen thue ngoai thieu nha xe co ly do RIENG, khong dung cau cua chuyen tu chay', () => {
    const offers = tripActionOffers(
      trip({ kind: 'EXTERNAL_CARRIER', carrierPartnerId: null }),
      null,
      'ADMIN',
    );
    expect(offers.find((offer) => offer.id === 'start')?.blockedReason).toBe(
      'Chuyến thuê ngoài cần chọn nhà xe trước khi chạy.',
    );
  });

  it('KHONG bao gio bay huy chuyen qua duong chuyen trang thai', () => {
    // Cua sau `transition {to:'CANCELLED'}` tao ra chuyen da huy KHONG CO LY DO, va di vong qua
    // quyen `transport.trip.cancel`. Nen khong offer nao duoc mang `transitionTo: 'CANCELLED'`.
    for (const status of ['PLANNED', 'IN_TRANSIT', 'DELIVERED'] as const) {
      const offers = tripActionOffers(trip({ status }), assignment(), 'ADMIN');
      for (const offer of offers) {
        expect(offer.transitionTo).not.toBe('CANCELLED');
      }
      expect(offers.find((offer) => offer.id === 'cancel')?.transitionTo).toBeNull();
    }
  });

  it('Ke toan khong duoc bay nut huy chuyen', () => {
    const offers = tripActionOffers(trip(), assignment(), 'ACCOUNTING');
    expect(offers.map((offer) => offer.id)).not.toContain('cancel');
    expect(tripActionOffers(trip(), assignment(), 'ADMIN').map((offer) => offer.id)).toContain(
      'cancel',
    );
  });

  it('chuyen o diem cuoi khong con thao tac nao', () => {
    expect(tripActionOffers(trip({ status: 'RECONCILED' }), assignment(), 'ADMIN')).toEqual([]);
    expect(tripActionOffers(trip({ status: 'CANCELLED' }), assignment(), 'ADMIN')).toEqual([]);
  });

  it('da giao thi viec chinh la chot doi soat', () => {
    const offers = tripActionOffers(trip({ status: 'DELIVERED' }), assignment(), 'ADMIN');
    expect(primaryOffer(offers)?.id).toBe('reconcile');
  });

  it('MANAGER khong duoc bay thao tac nao', () => {
    expect(tripActionOffers(trip(), assignment(), 'MANAGER')).toEqual([]);
  });
});

describe('dong thoi gian', () => {
  it('chi dung moc THAT co, khong bia moc chuyen trang thai', () => {
    const entries = toTripTimeline(trip(), [assignment()], directory);
    expect(entries.map((entry) => entry.title)).toEqual(['Lập chuyến', 'Phân công hiện tại']);
    // Khong co moc nao cho `IN_TRANSIT`/`DELIVERED` vi API khong luu thoi diem do.
    expect(entries.map((entry) => entry.title)).not.toContain('Đang chạy');
  });

  it('xep theo thoi gian tang dan va co moc huy khi co', () => {
    const entries = toTripTimeline(
      trip({
        status: 'CANCELLED',
        cancelledAt: '2026-09-05T00:00:00.000Z',
        cancellationReason: 'Khách hoãn',
      }),
      [assignment()],
      directory,
    );
    const last = entries[entries.length - 1]!;
    expect(last.title).toBe('Huỷ chuyến');
    expect(last.detail).toBe('Khách hoãn');
  });
});

describe('chuyen da huy', () => {
  it('huy co ly do thi hien ly do do', () => {
    expect(cancellationNote(trip({ status: 'CANCELLED', cancellationReason: 'Khách hoãn' }))).toBe(
      'Khách hoãn',
    );
  });

  it('huy KHONG co ly do phai noi ro la khong ro, khong de trong', () => {
    // Hinh dang nay do duong `transition` tao ra duoc — man hinh phai chiu duoc no.
    expect(cancellationNote(trip({ status: 'CANCELLED', cancellationReason: null }))).toBe(
      'Chuyến đã huỷ nhưng không có lý do được ghi lại.',
    );
  });

  it('chuyen chua huy thi khong co ghi chu nao', () => {
    expect(cancellationNote(trip())).toBeNull();
  });
});
