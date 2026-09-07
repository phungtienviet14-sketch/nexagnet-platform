import { describe, expect, it } from 'vitest';
import {
  normalizeStationCode,
  normalizeStationLabel,
  resolveFuelStation,
  type FuelStationAliasIndexEntry,
  type FuelStationIndexEntry,
} from './fuel-station-identity.js';

/**
 * NHAN RA MOT CAY XANG TU MOT TO GIAY — bo test cua phep DINH DANH, khong phai cua mot man hinh.
 *
 * Ca tep nay do dung mot cau hoi: khi hoa don/bang ke viet mot cai ten, he thong co duoc phep noi
 * "day la cay xang X" khong. Va cau tra loi phai la MOT TRONG NAM ket cuc CO TEN — khong bao gio
 * la "cai gan giong nhat". Mot phep so gan dung o day se gan mot hoa don vao nham tram, va so
 * lieu tieu hao theo tram — thu duy nhat de phat hien that thoat — se lang le tro thanh vo nghia.
 */

const station = (over: Partial<FuelStationIndexEntry> & { id: string }): FuelStationIndexEntry => ({
  supplierId: 'sup-1',
  code: null,
  codeNormalized: null,
  name: 'Cua hang xang dau so 5',
  nameNormalized: 'CUA HANG XANG DAU SO 5',
  status: 'ACTIVE',
  ...over,
});

describe('normalizeStationLabel', () => {
  it('bo dau tieng Viet, dua ve chu hoa, gom khoang trang', () => {
    expect(normalizeStationLabel('Cửa   hàng Xăng dầu  số 5')).toBe('CUA HANG XANG DAU SO 5');
  });

  /**
   * `đ` KHONG phan ra duoc bang NFD — no la mot chu cai rieng cua bang chu cai Viet, khong phai
   * `d` cong mot dau. Bo qua no se lam moi ten cay xang co chu `đ` mat mot ky tu.
   */
  it('doi `đ`/`Đ` thanh `D` — NFD khong lam duoc viec do', () => {
    expect(normalizeStationLabel('Đồng Đăng')).toBe('DONG DANG');
  });

  it('dau cau va gach noi tro thanh mot khoang trang, khong bi nuot', () => {
    expect(normalizeStationLabel('CHXD-số 5, Km12')).toBe('CHXD SO 5 KM12');
  });

  it('chuoi chi co dau cau chuan hoa ve rong', () => {
    expect(normalizeStationLabel('  --- ')).toBe('');
  });
});

describe('normalizeStationCode', () => {
  it('bo moi ky tu khong phai chu-so va dua ve chu hoa', () => {
    expect(normalizeStationCode('ch-05')).toBe('CH05');
    expect(normalizeStationCode('CH 05')).toBe('CH05');
  });

  it('chuoi rong hay chi co dau cach doc ra `null`, khong phai chuoi rong', () => {
    expect(normalizeStationCode('   ')).toBeNull();
    expect(normalizeStationCode(null)).toBeNull();
  });
});

describe('resolveFuelStation — nam ket cuc co ten', () => {
  const stations: FuelStationIndexEntry[] = [
    station({ id: 'st-1', code: 'CH-05', codeNormalized: 'CH05' }),
    station({ id: 'st-2', code: 'CH-09', codeNormalized: 'CH09' }),
    station({
      id: 'st-3',
      supplierId: 'sup-2',
      name: 'Tram Long Bien',
      nameNormalized: 'TRAM LONG BIEN',
      code: 'CH-05',
      codeNormalized: 'CH05',
    }),
  ];

  const aliases: FuelStationAliasIndexEntry[] = [
    { normalized: 'CHXD SO 5 HA NOI', stationId: 'st-1' },
    { normalized: 'TRAM LB', stationId: 'st-3' },
  ];

  const resolve = (input: {
    supplierId?: string | null;
    code?: string | null;
    label?: string | null;
  }) =>
    resolveFuelStation({
      supplierId: input.supplierId ?? null,
      code: input.code ?? null,
      label: input.label ?? null,
      stations,
      aliases,
    });

  it('khong co ma lan ten thi khong co gi de tra loi — `NO_INPUT`', () => {
    expect(resolve({ supplierId: 'sup-1' })).toEqual({ outcome: 'NO_INPUT' });
    expect(resolve({ supplierId: 'sup-1', code: '  ', label: ' - ' })).toEqual({
      outcome: 'NO_INPUT',
    });
  });

  it('ma cay xang khop trong pham vi mot nha cung cap — `RESOLVED` qua `CODE`', () => {
    expect(resolve({ supplierId: 'sup-1', code: 'ch 05' })).toEqual({
      outcome: 'RESOLVED',
      stationId: 'st-1',
      via: 'CODE',
      status: 'ACTIVE',
    });
  });

  /**
   * Ma cay xang chi duy nhat TRONG mot nha cung cap. Khi chung tu khong noi ro nha cung cap nao,
   * cung mot ma co the la hai tram cua hai chuoi khac nhau — va do la mot cau hoi cho NGUOI.
   */
  it('cung mot ma o hai nha cung cap, khong biet nha nao — `AMBIGUOUS`', () => {
    expect(resolve({ code: 'CH05' })).toEqual({
      outcome: 'AMBIGUOUS',
      candidateIds: ['st-1', 'st-3'],
    });
  });

  /**
   * Ma co that, nhung o mot nha cung cap KHAC. Tra `NO_MATCH` se day nguoi truc di tao mot tram
   * moi trung lap; ma rieng nay noi dung viec phai lam: doi lai nha cung cap tren chung tu.
   */
  it('ma khop mot tram cua nha cung cap khac — `SUPPLIER_MISMATCH`', () => {
    expect(resolve({ supplierId: 'sup-2', code: 'CH-09' })).toEqual({
      outcome: 'SUPPLIER_MISMATCH',
      candidateIds: ['st-2'],
    });
  });

  it('bi danh do nguoi dat — `RESOLVED` qua `ALIAS`, va no thang phep so ten', () => {
    expect(resolve({ supplierId: 'sup-1', label: 'CHXD số 5 — Hà Nội' })).toEqual({
      outcome: 'RESOLVED',
      stationId: 'st-1',
      via: 'ALIAS',
      status: 'ACTIVE',
    });
  });

  it('bi danh tro toi tram cua nha cung cap khac — `SUPPLIER_MISMATCH`', () => {
    expect(resolve({ supplierId: 'sup-1', label: 'Tram LB' })).toEqual({
      outcome: 'SUPPLIER_MISMATCH',
      candidateIds: ['st-3'],
    });
  });

  /**
   * HAI tram cung ten trong CUNG mot nha cung cap la chuyen co that — cac chuoi ban le danh so cua
   * hang theo tung vung. Nen ten KHONG unique, va lan trung ten phai ra `AMBIGUOUS` chu khong duoc
   * chon bua mot cai. Duong go la nguoi dat mot bi danh phan biet — do la ly do bang bi danh ton tai.
   */
  it('hai tram cung ten cua cung mot nha cung cap — `AMBIGUOUS`', () => {
    expect(resolve({ supplierId: 'sup-1', label: 'Cửa hàng xăng dầu số 5' })).toEqual({
      outcome: 'AMBIGUOUS',
      candidateIds: ['st-1', 'st-2'],
    });
  });

  it('co du kien nhung khong khop tram nao — `NO_MATCH`', () => {
    expect(resolve({ supplierId: 'sup-1', code: 'CH-99', label: 'Tram khong co that' })).toEqual({
      outcome: 'NO_MATCH',
    });
  });

  /**
   * Tram NGUNG HOAT DONG van duoc nhan ra, va trang thai di kem ket qua.
   *
   * Loc no ra khoi phep dinh danh se lam mot chung tu cu cua mot tram da dong ra `NO_MATCH`, roi
   * nguoi truc tao mot tram trung lap. Viec "co nen nhan chung tu cua mot tram da dong khong" la
   * mot cau hoi CHINH SACH, va no thuoc ben goi — khong thuoc phep nhan dang.
   */
  it('tram INACTIVE van duoc nhan ra, kem trang thai de ben goi tu quyet', () => {
    const closed = [
      station({ id: 'st-9', code: 'CH-77', codeNormalized: 'CH77', status: 'INACTIVE' }),
    ];
    expect(
      resolveFuelStation({
        supplierId: 'sup-1',
        code: 'CH77',
        label: null,
        stations: closed,
        aliases: [],
      }),
    ).toEqual({ outcome: 'RESOLVED', stationId: 'st-9', via: 'CODE', status: 'INACTIVE' });
  });

  /** Thu tu uu tien la MA -> BI DANH -> TEN, va no phai on dinh. */
  it('ma thang bi danh khi ca hai cung tro toi hai tram khac nhau', () => {
    expect(resolve({ supplierId: 'sup-1', code: 'CH-09', label: 'CHXD số 5 Hà Nội' })).toEqual({
      outcome: 'RESOLVED',
      stationId: 'st-2',
      via: 'CODE',
      status: 'ACTIVE',
    });
  });
});
