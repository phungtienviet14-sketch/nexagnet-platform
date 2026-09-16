import { describe, expect, it } from 'vitest';
import type { TollAccount } from '../../transport-types';
import {
  EMPTY_TOLL_ACCOUNT_DRAFT,
  EMPTY_TOLL_LINK_DRAFT,
  toCreateTollAccountInput,
  toOpenTollLinkInput,
  toTollVehicleOptions,
  tollAccountDraftProblem,
  tollAccountLabelOf,
  tollAccountToggleCopy,
  tollCloseLinkProblem,
  tollLinkDraftProblem,
  tollOpenLinkBlockedReason,
  tollVehicleLabelOf,
} from '../toll-admin';
import { vehicle } from './fixtures';

/**
 * `#314` G7 — QUAN TRI TAI KHOAN GIAO THONG va SO XE NHAN CHI TRA tu san pham.
 *
 * So xe nhan chi tra la mot thu PHAP LY (ND 119/2024 D.11 kh.3: moi xe chi nhan chi tra tu MOT tai
 * khoan). May chu la cong that; bo bai nay giu nhung gi man hinh noi TRUOC khi gui: rang buoc ngay
 * dung nhu may chu, khong chon xe giup, va cau "ngung dung" noi dung dieu no lam.
 */

const account = (over: Partial<TollAccount> = {}): TollAccount => ({
  id: 'acc-1',
  provider: 'VETC',
  accountNo: 'TK-001',
  holderName: null,
  active: true,
  createdAt: '2026-09-01T01:00:00Z',
  updatedAt: '2026-09-01T01:00:00Z',
  ...over,
});

describe('khai tai khoan', () => {
  it('so tai khoan la bat buoc; ten chu tai khoan thi khong', () => {
    expect(tollAccountDraftProblem(EMPTY_TOLL_ACCOUNT_DRAFT)).toContain('số tài khoản');
    expect(
      tollAccountDraftProblem({ ...EMPTY_TOLL_ACCOUNT_DRAFT, accountNo: '   ' }),
    ).not.toBeNull();
    expect(
      tollAccountDraftProblem({ ...EMPTY_TOLL_ACCOUNT_DRAFT, accountNo: 'TK-001' }),
    ).toBeNull();
  });

  it('than yeu cau cat khoang trang; ten chu tai khoan rong di ra `null`, khong phai chuoi rong', () => {
    expect(
      toCreateTollAccountInput({ provider: 'EPASS', accountNo: '  EP-9 ', holderName: '  ' }),
    ).toEqual({ provider: 'EPASS', accountNo: 'EP-9', holderName: null });
  });
});

describe('mo doan noi xe <-> tai khoan', () => {
  const ready = { ...EMPTY_TOLL_LINK_DRAFT, vehicleId: 'veh-1', effectiveFrom: '2026-09-01' };

  /** Ban nhap bat dau KHONG co xe nao: man hinh khong bao gio chon xe giup. */
  it('ban nhap trong khong co xe nao duoc chon san', () => {
    expect(EMPTY_TOLL_LINK_DRAFT.vehicleId).toBe('');
    expect(tollLinkDraftProblem(EMPTY_TOLL_LINK_DRAFT)).toContain('Chọn xe');
  });

  it('ngay bat dau la bat buoc', () => {
    expect(tollLinkDraftProblem({ ...ready, effectiveFrom: '' })).toContain('ngày bắt đầu');
  });

  /** Cung luat voi `tollLinkPeriodInvalid` cua may chu: hai dau deu TINH, nen bang nhau la hop le. */
  it('ngay ket thuc TRUOC ngay bat dau -> tu choi; BANG ngay bat dau -> hop le', () => {
    expect(tollLinkDraftProblem({ ...ready, effectiveTo: '2026-08-31' })).toContain(
      'sau hoặc bằng',
    );
    expect(tollLinkDraftProblem({ ...ready, effectiveTo: '2026-09-01' })).toBeNull();
  });

  it('ngay khong dung dang -> tu choi truoc khi gui', () => {
    expect(tollLinkDraftProblem({ ...ready, effectiveFrom: '01/09/2026' })).not.toBeNull();
  });

  it('than yeu cau: ma xe ben nha cung cap rong -> `null`; ngay ket thuc rong -> `null` (dang hieu luc)', () => {
    expect(toOpenTollLinkInput({ ...ready, providerVehicleRef: '  ' })).toEqual({
      vehicleId: 'veh-1',
      providerVehicleRef: null,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    expect(
      toOpenTollLinkInput({ ...ready, providerVehicleRef: ' RFID-1 ', effectiveTo: '2026-12-31' }),
    ).toEqual({
      vehicleId: 'veh-1',
      providerVehicleRef: 'RFID-1',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-12-31',
    });
  });

  it('tai khoan da ngung hoac vai chi xem -> noi RO vi sao khong noi xe duoc', () => {
    expect(tollOpenLinkBlockedReason(account(), true)).toBeNull();
    expect(tollOpenLinkBlockedReason(account({ active: false }), true)).toContain('ngừng dùng');
    expect(tollOpenLinkBlockedReason(account(), false)).toContain('chỉ xem');
    expect(tollOpenLinkBlockedReason(undefined, true)).not.toBeNull();
  });
});

describe('dong doan noi', () => {
  const open = { effectiveFrom: '2026-01-01', effectiveTo: null };

  it('phai co ngay ket thuc, va ngay do khong truoc ngay bat dau', () => {
    expect(tollCloseLinkProblem(open, '')).toContain('ngày kết thúc');
    expect(tollCloseLinkProblem(open, '2025-12-31')).toContain('sau hoặc bằng');
    expect(tollCloseLinkProblem(open, '2026-01-01')).toBeNull();
  });

  it('doan da dong thi khong dong lai duoc — va noi no da dong tu ngay nao', () => {
    expect(
      tollCloseLinkProblem(
        { effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' },
        '2026-07-01',
      ),
    ).toContain('30/06/2026');
  });
});

describe('xe va tai khoan doc ra bang NHAN, khong bang ma', () => {
  it('danh sach xe sap theo bien so', () => {
    expect(
      toTollVehicleOptions([
        vehicle({ id: 'veh-b', registrationPlate: '30E-111.22' }),
        vehicle({ id: 'veh-a', registrationPlate: '15C-556.33' }),
      ]),
    ).toEqual([
      { id: 'veh-a', label: '15C-556.33' },
      { id: 'veh-b', label: '30E-111.22' },
    ]);
    expect(toTollVehicleOptions(undefined)).toEqual([]);
  });

  it('xe co trong doi -> bien so; xe da roi doi -> noi that; doi xe chua doc duoc -> khong gia vo', () => {
    const labelOf = tollVehicleLabelOf([vehicle({ id: 'veh-1', registrationPlate: '15C-556.33' })]);
    expect(labelOf('veh-1')).toBe('15C-556.33');
    expect(labelOf('veh-da-ban-999')).toContain('Không còn trong đội xe');
    expect(tollVehicleLabelOf(undefined)('veh-1')).toContain('chưa đọc được đội xe');
  });

  it('tai khoan -> "nha cung cap + so tai khoan"; khong con trong danh sach -> noi that', () => {
    const labelOf = tollAccountLabelOf([account({ provider: 'EPASS', accountNo: 'EP-9' })]);
    expect(labelOf('acc-1')).toBe('ePass EP-9');
    expect(labelOf('acc-khac')).toContain('không còn trong danh sách');
  });
});

describe('ngung / dung lai tai khoan', () => {
  /**
   * Do tren kho that: `listAccounts` KHONG loc theo `active`, nen mot tai khoan da ngung VAN duoc
   * nhan ra tren bang ke. Chi `openLink` tu choi no. Cau hoi xac nhan phai noi dung dieu do — noi
   * "ngung se dung doi soat" la mot loi hua sai.
   */
  it('ngung: chi chan NOI THEM xe; doan cu, dong da nap va viec nhan ra tren bang ke giu nguyen', () => {
    const copy = tollAccountToggleCopy(account());
    expect(copy.nextActive).toBe(false);
    expect(copy.title).toContain('VETC TK-001');
    expect(copy.detail).toContain('không nối thêm được xe');
    expect(copy.detail).toContain('vẫn giữ nguyên');
    expect(copy.detail).not.toMatch(/xoá hết|đóng tất cả/);
  });

  it('dung lai: noi them xe duoc, KHONG doan noi nao tu mo lai', () => {
    const copy = tollAccountToggleCopy(account({ active: false }));
    expect(copy.nextActive).toBe(true);
    expect(copy.detail).toContain('Không đoạn nối nào tự mở lại');
  });
});
