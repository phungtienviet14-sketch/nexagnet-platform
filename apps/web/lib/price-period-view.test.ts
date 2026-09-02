import { describe, expect, it } from 'vitest';
import {
  addRow,
  archiveConfirmation,
  buildPricePeriodBoard,
  canActivatePeriod,
  canArchivePeriod,
  canEditPeriodRows,
  classifyPricePeriod,
  isPeriodInEffect,
  planPricePeriod,
  pricePeriodOrigin,
  pricePeriodPurposeOptions,
  removeRow,
  removeRowConfirmation,
  validatePricePeriodRows,
} from './price-period-view';
import type { PricePeriod, PricePeriodsView } from './settings';

const CURRENT_MONTH = '2026-09';

function period(overrides: Partial<PricePeriod> & { id: string }): PricePeriod {
  return {
    validMonth: CURRENT_MONTH,
    status: 'draft',
    prices: [{ sku: 'FELIX', wholesale: 1_250_000 }],
    ...overrides,
  };
}

function view(periods: PricePeriod[]): PricePeriodsView {
  return {
    currentMonth: CURRENT_MONTH,
    currentPeriodId: null,
    missingCurrentPeriod: true,
    periods,
  };
}

describe('ba loai ky la ba khoi rieng', () => {
  it('tach chinh thuc / chay thu / nhap / da luu tru', () => {
    const official = period({ id: 'official', status: 'active', source: 'operator' });
    const testOnly = period({ id: 'test', status: 'active', source: 'test_only' });
    const draft = period({ id: 'draft' });
    const archived = period({ id: 'archived', status: 'archived' });

    expect(classifyPricePeriod(official)).toBe('official');
    expect(classifyPricePeriod(testOnly)).toBe('test-only');
    expect(classifyPricePeriod(draft)).toBe('draft');
    expect(classifyPricePeriod(archived)).toBe('archived');

    const board = buildPricePeriodBoard(view([official, testOnly, draft, archived]));
    expect(board.official?.id).toBe('official');
    expect(board.testOnly?.id).toBe('test');
    expect(board.drafts.map((entry) => entry.id)).toEqual(['draft']);
    expect(board.archived.map((entry) => entry.id)).toEqual(['archived']);
  });

  /** Chinh la trang thai #113/#114 de lai: co gia de chay thu, van thieu bang gia chinh thuc. */
  it('chi co ky chay thu thi VAN la thieu bang gia chinh thuc', () => {
    const board = buildPricePeriodBoard(
      view([period({ id: 'test', status: 'active', source: 'test_only' })]),
    );

    expect(board.testOnly?.id).toBe('test');
    expect(board.official).toBeNull();
    expect(board.missingOfficial).toBe(true);
  });

  it('ky active cua thang khac khong duoc tinh la bang gia thang nay', () => {
    const board = buildPricePeriodBoard(
      view([period({ id: 'aug', validMonth: '2026-08', status: 'active' })]),
    );

    expect(board.official).toBeNull();
    expect(board.missingOfficial).toBe(true);
    expect(board.pastActive.map((entry) => entry.id)).toEqual(['aug']);
  });

  /**
   * Mot ky thang 8 con `status='active'` sang thang 9 la ky HET HIEU LUC, khong phai "bang gia
   * chinh thuc": may chu chi doc ky dung thang hien hanh. Man hinh phai noi dung dieu do.
   */
  it('ky thang truoc con active duoc goi la DA HET HIEU LUC, khong phai bang gia chinh thuc', () => {
    const august = period({ id: 'aug', validMonth: '2026-08', status: 'active' });

    expect(classifyPricePeriod(august, CURRENT_MONTH)).toBe('expired');
    expect(isPeriodInEffect(august, CURRENT_MONTH)).toBe(false);

    const september = period({ id: 'sep', status: 'active', source: 'operator' });
    expect(classifyPricePeriod(september, CURRENT_MONTH)).toBe('official');
    expect(isPeriodInEffect(september, CURRENT_MONTH)).toBe(true);
  });

  it('ban nhap va ky da luu tru khong bao gio duoc coi la dang ap dung', () => {
    expect(isPeriodInEffect(period({ id: 'd', status: 'draft' }), CURRENT_MONTH)).toBe(false);
    expect(isPeriodInEffect(period({ id: 'x', status: 'archived' }), CURRENT_MONTH)).toBe(false);
  });

  it('doc nguon ky ra tieng Viet, khong tra ve ma noi bo', () => {
    expect(pricePeriodOrigin({ source: 'copy:cmtivsest000ape01zjflq1wt' })).toBe(
      'Sao chép từ một kỳ giá khác',
    );
    expect(pricePeriodOrigin({ source: 'test_only' })).toBe('Tạo riêng để chạy thử');
    expect(pricePeriodOrigin({ source: 'operator' })).toBe('Người vận hành tạo mới');
    expect(pricePeriodOrigin({ source: undefined })).not.toMatch(/copy:|test_only|operator/);
  });
});

describe('thao tac nao con duoc phep', () => {
  it('luu tru duoc ca ky dang ap dung lan ban nhap (Issue #116 acceptance 1-2)', () => {
    expect(canArchivePeriod(period({ id: 'a', status: 'active' }))).toBe(true);
    expect(canArchivePeriod(period({ id: 'd', status: 'draft' }))).toBe(true);
    expect(canArchivePeriod(period({ id: 'x', status: 'archived' }))).toBe(false);
  });

  it('chi ban nhap moi sua/xoa duoc dong gia (Issue #116 acceptance 5)', () => {
    expect(canEditPeriodRows(period({ id: 'd', status: 'draft' }))).toBe(true);
    expect(canEditPeriodRows(period({ id: 'a', status: 'active' }))).toBe(false);
    expect(canEditPeriodRows(period({ id: 'x', status: 'archived' }))).toBe(false);
    expect(canActivatePeriod(period({ id: 'a', status: 'active' }))).toBe(false);
  });
});

describe('canh bao truoc thao tac co hau qua', () => {
  it('luu tru ky DANG AP DUNG noi ro don se chuyen ve cho Sale', () => {
    const active = period({ id: 'a', status: 'active', source: 'operator' });
    const board = buildPricePeriodBoard(view([active]));

    const confirmation = archiveConfirmation(active, board);
    expect(confirmation.affectedOrders).toMatch(/chuyển về cho Sale/i);
    expect(confirmation.howToUndo).toMatch(/không có thao tác nào xóa hẳn/i);
  });

  it('luu tru BAN NHAP noi ro khong don nao bi anh huong', () => {
    const draft = period({ id: 'd' });
    const board = buildPricePeriodBoard(view([draft]));

    const confirmation = archiveConfirmation(draft, board);
    expect(confirmation.title).toMatch(/bản nháp/i);
    expect(confirmation.affectedOrders).toMatch(/Không đơn nào/i);
  });

  it('moi canh bao tra loi du bon cau bat buoc', () => {
    const draft = period({ id: 'd' });
    const board = buildPricePeriodBoard(view([draft]));
    for (const confirmation of [
      archiveConfirmation(draft, board),
      removeRowConfirmation('BB', 1),
    ]) {
      expect(confirmation.whatChanges.length).toBeGreaterThan(0);
      expect(confirmation.effectiveFrom.length).toBeGreaterThan(0);
      expect(confirmation.affectedOrders.length).toBeGreaterThan(0);
      expect(confirmation.howToUndo.length).toBeGreaterThan(0);
    }
  });
});

describe('luong tao co dan duong', () => {
  /**
   * Bai kiem tra chan lai dung loi cua Issue #114: ky "chi de chay thu" khong bao gio duoc di qua
   * duong copy, vi `copyDraft()` phia API luon dat `source='copy:<id>'` — tuc la ra mot ky CHINH
   * THUC, lam xanh cong san sang van hanh.
   */
  it('muc dich CHAY THU luon goi API tao ky trong voi testOnly, khong bao gio la copy', () => {
    const plan = planPricePeriod({ purpose: 'test-only', validMonth: CURRENT_MONTH });

    expect(plan.api).toBe('create');
    expect(plan.testOnly).toBe(true);
    expect(plan.sourcePeriodId).toBeUndefined();
    expect(plan.note).toBe('UAT_TEST_ONLY_2026-09');
  });

  it('muc dich CHINH THUC tao ky trong, khong danh dau chay thu', () => {
    const plan = planPricePeriod({ purpose: 'official', validMonth: CURRENT_MONTH });

    expect(plan).toEqual({ api: 'create', validMonth: CURRENT_MONTH, testOnly: false });
  });

  it('chi muc dich CHEP LAI moi dung duong copy, va bat buoc co ky nguon', () => {
    const plan = planPricePeriod({
      purpose: 'copy-previous',
      validMonth: CURRENT_MONTH,
      sourcePeriodId: 'aug',
    });

    expect(plan).toEqual({
      api: 'copy',
      validMonth: CURRENT_MONTH,
      testOnly: false,
      sourcePeriodId: 'aug',
    });
    expect(() => planPricePeriod({ purpose: 'copy-previous', validMonth: CURRENT_MONTH })).toThrow(
      /kỳ giá nguồn/i,
    );
  });

  it('khong mo duong tao ky chay thu ngoai moi truong du lieu thu', () => {
    const options = pricePeriodPurposeOptions({
      dataClassificationTest: false,
      hasPeriodToCopy: true,
    });
    const testOption = options.find((option) => option.purpose === 'test-only');

    expect(testOption?.available).toBe(false);
    expect(testOption?.unavailableReason).toMatch(/dữ liệu thử/i);
  });

  it('khong co ky nao de chep thi tat lua chon chep, khong de nguoi dung vao ngo cut', () => {
    const options = pricePeriodPurposeOptions({
      dataClassificationTest: true,
      hasPeriodToCopy: false,
    });

    expect(options.find((option) => option.purpose === 'copy-previous')?.available).toBe(false);
    expect(options.find((option) => option.purpose === 'official')?.available).toBe(true);
  });

  it('moi lua chon noi ro he qua truoc khi bam', () => {
    const options = pricePeriodPurposeOptions({
      dataClassificationTest: true,
      hasPeriodToCopy: true,
    });

    expect(options.find((option) => option.purpose === 'test-only')?.consequence).toMatch(
      /KHÔNG phải bảng giá chính thức/,
    );
    expect(options.find((option) => option.purpose === 'copy-previous')?.consequence).toMatch(
      /không tự nhiên đúng cho tháng mới/,
    );
  });
});

describe('kiem tra truoc khi gui', () => {
  it('bao luat 1-2 mat hang cua ky chay thu NGAY, khong doi may chu tu choi', () => {
    const rows = [
      { sku: 'A', wholesale: 1 },
      { sku: 'B', wholesale: 1 },
      { sku: 'C', wholesale: 1 },
    ];

    expect(validatePricePeriodRows('test-only', rows)[0]).toMatch(/chỉ được 1–2 mặt hàng/i);
    expect(validatePricePeriodRows('test-only', rows.slice(0, 1))).toEqual([]);
  });

  it('bat mat hang chua co don gia CTV', () => {
    const errors = validatePricePeriodRows('official', [{ sku: 'FELIX', wholesale: 0 }]);

    expect(errors.join(' ')).toMatch(/FELIX/);
  });

  it('bat bang gia chinh thuc con thieu mat hang so voi danh muc', () => {
    const errors = validatePricePeriodRows('official', [{ sku: 'FELIX', wholesale: 100 }], 19);

    expect(errors.join(' ')).toMatch(/thiếu 18/);
  });

  it('bang trong luon la loi', () => {
    expect(validatePricePeriodRows('official', [])[0]).toMatch(/đang trống/i);
  });
});

describe('sua danh sach mat hang', () => {
  it('xoa tra ve mang moi, khong sua tai cho', () => {
    const rows = [
      { sku: 'A', wholesale: 1 },
      { sku: 'B', wholesale: 2 },
    ];
    const next = removeRow(rows, 'A');

    expect(next).toEqual([{ sku: 'B', wholesale: 2 }]);
    expect(rows).toHaveLength(2);
  });

  it('them mat hang moi voi gia chua nhap, va khong tao dong trung', () => {
    const rows = addRow([], 'FELIX');

    expect(rows).toEqual([{ sku: 'FELIX', wholesale: 0 }]);
    expect(addRow(rows, 'FELIX')).toEqual(rows);
    expect(addRow(rows, '   ')).toEqual(rows);
  });
});
