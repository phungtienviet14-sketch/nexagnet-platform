import { describe, expect, it } from 'vitest';
import type { DriverFuelSlipView, DriverTripView } from '../../transport-types';
import {
  currentDriverTrip,
  driverTripActions,
  REVENUE_FIELD_NAMES,
  revenueFieldsIn,
  toDriverFuelSlipRows,
  toDriverHome,
  toDriverTripCard,
} from '../driver';
import { driverFuelSlip, driverTrip, fundStatement, trip } from './fixtures';

/**
 * `INV-09` — be mat lai xe khong bao gio thay doanh thu/gia cuoc.
 *
 * #161 §8 doi mot bang chung cu the: *"payload cua lai xe khong chua doanh thu, chu khong phai chi
 * bi CSS che di"*. Bo test nay la bang chung do o tang du lieu.
 */
describe('cach ly doanh thu khoi be mat lai xe', () => {
  it('khung nhin chuyen cua lai xe khong chua mot khoa mui tien nao', () => {
    expect(revenueFieldsIn(driverTrip())).toEqual([]);
  });

  it('phieu dau cua lai xe khong chua khoa doanh thu', () => {
    expect(revenueFieldsIn(driverFuelSlip())).toEqual([]);
  });

  it('luoi bao dong THAT SU keu khi mot truong doanh thu ro sang', () => {
    // Neu khong co bai nay thi `revenueFieldsIn` co the luon tra ve rong ma khong ai biet.
    // `Trip` cua be mat van hanh CO `freightAmount`, va do la dung cai khong duoc phep sang day.
    expect(revenueFieldsIn(trip())).toContain('freightAmount');
    expect(revenueFieldsIn([driverTrip(), trip()])).toContain('freightAmount');
  });

  it('lai xe VAN duoc thay so tien cua chinh phieu dau minh nop', () => {
    // `INV-09` cam doanh thu, khong cam moi con so tien. Lai xe tra tien mat va can doi soat lai.
    const row = toDriverFuelSlipRows([driverFuelSlip()])[0]!;
    expect(row.amountLabel).not.toBe('—');
    expect((REVENUE_FIELD_NAMES as readonly string[]).includes('amount')).toBe(false);
  });

  it('the chuyen dung cho lai xe chi mang thong tin an toan', () => {
    const card = toDriverTripCard(driverTrip());
    expect(card.customerLabel).toBe('Công ty Đông Anh');
    expect(revenueFieldsIn(card)).toEqual([]);
    expect(Object.keys(card)).not.toContain('freightAmount');
  });
});

describe('chuyen dang lam', () => {
  const mine = (over: Partial<DriverTripView>): DriverTripView =>
    driverTrip({ isCurrentAssignee: true, ...over });

  it('chuyen dang chay duoc uu tien hon chuyen da len ke hoach', () => {
    const trips = [mine({ id: 'a', status: 'PLANNED' }), mine({ id: 'b', status: 'IN_TRANSIT' })];
    expect(currentDriverTrip(trips)?.id).toBe('b');
  });

  it('khong co chuyen dang chay thi lay chuyen ke tiep da len ke hoach', () => {
    expect(currentDriverTrip([mine({ id: 'a', status: 'PLANNED' })])?.id).toBe('a');
  });

  it('chuyen KHONG phai cua minh thi khong bao gio duoc coi la chuyen dang lam', () => {
    const others = [driverTrip({ id: 'x', status: 'IN_TRANSIT', isCurrentAssignee: false })];
    expect(currentDriverTrip(others)).toBeNull();
  });

  it('chuyen da giao hoac da huy khong phai viec dang lam', () => {
    const done = [mine({ id: 'a', status: 'DELIVERED' }), mine({ id: 'b', status: 'CANCELLED' })];
    expect(currentDriverTrip(done)).toBeNull();
  });
});

describe('thao tac lai xe duoc lam', () => {
  it('da len ke hoach thi bat dau chuyen', () => {
    expect(driverTripActions(driverTrip({ status: 'PLANNED' }))).toEqual([
      { to: 'IN_TRANSIT', label: 'Bắt đầu chuyến' },
    ]);
  });

  it('dang chay thi bao da giao', () => {
    expect(driverTripActions(driverTrip({ status: 'IN_TRANSIT' }))).toEqual([
      { to: 'DELIVERED', label: 'Đã giao' },
    ]);
  });

  it('KHONG bao gio co nut chot doi soat — GD-01 doi mot lan chuyen tay co quyen', () => {
    for (const status of ['PLANNED', 'IN_TRANSIT', 'DELIVERED'] as const) {
      const actions = driverTripActions(driverTrip({ status }));
      for (const action of actions) {
        expect(action.to).not.toBe('RECONCILED');
      }
    }
    expect(driverTripActions(driverTrip({ status: 'DELIVERED' }))).toEqual([]);
  });

  it('khong phai nguoi dang phu trach thi khong co thao tac nao', () => {
    expect(driverTripActions(driverTrip({ isCurrentAssignee: false }))).toEqual([]);
  });

  it('khong co chuyen thi khong co thao tac', () => {
    expect(driverTripActions(null)).toEqual([]);
  });
});

describe('phieu dau cua chinh minh', () => {
  it('so lit doc ra dung 200 lit tu 200.000 mililit', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip()])[0]!;
    expect(row.litersLabel).toBe('200,000 L');
    expect(row.consumptionLabel).toBe('40,000 L/100km');
  });

  it('phieu bi tu choi noi ro VIEC CAN LAM, khong noi ly do ky thuat', () => {
    const rejected: DriverFuelSlipView = driverFuelSlip({ verificationStatus: 'REJECTED' });
    const note = toDriverFuelSlipRows([rejected])[0]!.rejectedNote;
    expect(note).toContain('báo kế toán');
    // #195: cau bao cho lai xe khong duoc nhac may chu hay duong du lieu.
    expect(note).not.toContain('máy chủ');
  });

  it('phieu binh thuong khong bay canh bao gi', () => {
    expect(toDriverFuelSlipRows([driverFuelSlip()])[0]!.rejectedNote).toBeNull();
  });

  it('anh chi duoc DEM, va do la gioi han that cua may chu', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip({ evidenceCount: 2 })])[0]!;
    expect(row.evidenceCountLabel).toBe('2');
    expect(row.hasEvidence).toBe(true);
  });
});

describe('trang chu lai xe', () => {
  it('mot viec troi nhat kem thao tac cua chinh no', () => {
    const home = toDriverHome({
      trips: [driverTrip({ status: 'IN_TRANSIT' })],
      fund: fundStatement(),
    });
    expect(home.currentTrip?.code).toBe('VT-2026-0912');
    expect(home.actions).toEqual([{ to: 'DELIVERED', label: 'Đã giao' }]);
    expect(home.headline).toContain('Hà Nội → Thái Nguyên');
  });

  it('khong co chuyen thi noi thang la chua duoc phan cong', () => {
    const home = toDriverHome({ trips: [], fund: null });
    expect(home.currentTrip).toBeNull();
    expect(home.headline).toBe('Hiện chưa có chuyến nào được phân công cho bạn.');
    expect(home.openTripCount).toBe(0);
  });

  it('khach chua bat nghiep vu quy thi KHONG bia so du 0 dong', () => {
    expect(toDriverHome({ trips: [driverTrip()], fund: null }).fund).toBeNull();
  });

  it('so du quy doc theo THE DUNG, khong doc dau cua so', () => {
    const home = toDriverHome({
      trips: [driverTrip()],
      fund: fundStatement({ balance: -500_000, balanceStance: 'COMPANY_OWES_DRIVER' }),
    });
    expect(home.fund?.stanceLabel).toBe('Công ty đang nợ lái xe');
  });

  it('chi dem chuyen dang mo CUA CHINH MINH', () => {
    const home = toDriverHome({
      trips: [
        driverTrip({ id: 'a', status: 'PLANNED', isCurrentAssignee: true }),
        driverTrip({ id: 'b', status: 'IN_TRANSIT', isCurrentAssignee: true }),
        driverTrip({ id: 'c', status: 'DELIVERED', isCurrentAssignee: true }),
        driverTrip({ id: 'd', status: 'PLANNED', isCurrentAssignee: false }),
      ],
      fund: null,
    });
    expect(home.openTripCount).toBe(2);
  });
});
