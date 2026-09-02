import { describe, expect, it } from 'vitest';
import {
  checkOutcome,
  draftBlockingIssues,
  fingerprintRows,
  periodPurpose,
  resolvePriceWorkflow,
  type PriceCheckSnapshot,
  type PriceWorkflowInput,
} from './price-workflow';
import type { PricePeriod, PricePeriodPrice, PricePeriodValidation } from './settings';

const CURRENT_MONTH = '2026-09';

function period(overrides: Partial<PricePeriod> = {}): PricePeriod {
  return {
    id: 'p1',
    validMonth: CURRENT_MONTH,
    status: 'draft',
    source: 'operator',
    prices: [],
    ...overrides,
  };
}

function rows(...entries: readonly (readonly [string, number])[]): PricePeriodPrice[] {
  return entries.map(([sku, wholesale]) => ({ sku, wholesale }));
}

function validation(overrides: Partial<PricePeriodValidation> = {}): PricePeriodValidation {
  return { valid: true, errors: [], warnings: [], productCount: 19, priceCount: 19, ...overrides };
}

function snapshot(
  content: readonly PricePeriodPrice[],
  overrides: Partial<PricePeriodValidation> = {},
): PriceCheckSnapshot {
  return {
    fingerprint: fingerprintRows(content),
    rows: content.map((row) => ({ ...row })),
    validation: validation(overrides),
  };
}

function workflow(overrides: Partial<PriceWorkflowInput> = {}) {
  return resolvePriceWorkflow({
    period: period(),
    currentMonth: CURRENT_MONTH,
    canConfigure: true,
    rows: [],
    check: null,
    ...overrides,
  });
}

describe('dau van tay noi dung ban nhap', () => {
  it('khong doi khi chi doi thu tu dong', () => {
    expect(fingerprintRows(rows(['A', 1], ['B', 2]))).toBe(
      fingerprintRows(rows(['B', 2], ['A', 1])),
    );
  });

  it('doi ngay khi mot con so doi', () => {
    expect(fingerprintRows(rows(['A', 1]))).not.toBe(fingerprintRows(rows(['A', 2])));
  });

  it('bo qua `id` do may chu cap — cung mot noi dung nghiep vu la cung mot dau', () => {
    const withId: PricePeriodPrice[] = [{ id: 'row-1', sku: 'A', wholesale: 1 }];
    expect(fingerprintRows(withId)).toBe(fingerprintRows(rows(['A', 1])));
  });

  it('phan biet o TRONG voi so 0 o cac cot khong bat buoc', () => {
    const empty: PricePeriodPrice[] = [{ sku: 'A', wholesale: 1, retailPrice: null }];
    const zero: PricePeriodPrice[] = [{ sku: 'A', wholesale: 1, retailPrice: 0 }];
    expect(fingerprintRows(empty)).not.toBe(fingerprintRows(zero));
  });
});

describe('A. ban nhap trong — khong di tiep duoc', () => {
  it('khoa `Kiểm tra & tiếp tục` kem dung cau giai thich cua hop dong', () => {
    const state = workflow({ rows: [] });

    expect(state.mode).toBe('edit');
    expect(state.step).toBe(1);
    expect(state.checkAndContinue.visible).toBe(true);
    expect(state.checkAndContinue.enabled).toBe(false);
    expect(state.checkAndContinue.hint).toBe('Thêm ít nhất một sản phẩm để tiếp tục.');
  });

  it('`Lưu và làm sau` van bam duoc, nhung khong co gi de gui len may chu', () => {
    const state = workflow({ rows: [] });

    expect(state.saveForLater.visible).toBe(true);
    expect(state.saveForLater.enabled).toBe(true);
    expect(state.persistRequired).toBe(false);
  });

  it('nut Kich hoat KHONG duoc render', () => {
    expect(workflow({ rows: [] }).activate.visible).toBe(false);
  });
});

describe('B. ban nhap thieu du lieu — khong di tiep duoc', () => {
  it('thieu don gia CTV thi khoa nut va noi ro mat hang nao', () => {
    const state = workflow({ rows: rows(['FELIX', 1_150_000], ['ELNI', 0]) });

    expect(state.checkAndContinue.enabled).toBe(false);
    expect(state.checkAndContinue.hint).toContain('ELNI');
    expect(state.activate.visible).toBe(false);
    expect(state.step).toBe(1);
  });

  it('bao loi ngay tren du lieu cuc bo, khong cho may chu tra loi', () => {
    const issues = draftBlockingIssues('official', rows(['FELIX', 0]));

    expect(issues.map((issue) => issue.code)).toEqual(['MISSING_WHOLESALE']);
    expect(issues[0]?.skus).toEqual(['FELIX']);
  });

  it('ky chay thu qua 2 mat hang bi chan bang chinh luat may chu se ap', () => {
    const state = workflow({
      period: period({ source: 'test_only' }),
      rows: rows(['A', 1], ['B', 2], ['C', 3]),
    });

    expect(state.purpose).toBe('test-only');
    expect(state.checkAndContinue.enabled).toBe(false);
    expect(state.checkAndContinue.hint).toMatch(/chỉ được 1–2 mặt hàng/i);
  });

  it('KHONG tu suy ra "thieu SKU so voi danh muc" — do la viec cua may chu', () => {
    // Ban sao danh muc tren trinh duyet co the cu. Lay no ra khoa nut thi nguoi van hanh khong
    // bao gio den duoc cho may chu noi cho ho su that.
    expect(draftBlockingIssues('official', rows(['FELIX', 1_150_000]))).toEqual([]);
  });
});

describe('C. ban nhap hop le nhung chua luu', () => {
  it('mo `Kiểm tra & tiếp tục`, van giau nut Kich hoat', () => {
    const state = workflow({ rows: rows(['FELIX', 1_150_000]) });

    expect(state.checkAndContinue.enabled).toBe(true);
    expect(state.checkAndContinue.hint).toBeUndefined();
    expect(state.activate.visible).toBe(false);
    expect(state.step).toBe(2);
  });

  it('bao cho man hinh biet phai LUU TRUOC khi kiem — day la cho chan loi 0 dong', () => {
    // `validate()` phia may chu doc DONG DA LUU. Kiem ma chua luu la kiem mot ban nhap 0 dong
    // trong khi tren man hinh da co du lieu.
    expect(workflow({ rows: rows(['FELIX', 1_150_000]) }).persistRequired).toBe(true);
  });
});

describe('D. may chu tu choi — o lai luong sua', () => {
  it('van la `edit`, nut Kich hoat khong bao gio hien', () => {
    const content = rows(['FELIX', 1_150_000]);
    const state = workflow({
      rows: content,
      check: snapshot(content, { valid: false, errors: ['Thiếu giá cho SKU: ELNI'] }),
    });

    expect(state.mode).toBe('edit');
    expect(state.activate.visible).toBe(false);
    expect(state.rowsEditable).toBe(true);
    expect(state.check?.validation.errors).toEqual(['Thiếu giá cho SKU: ELNI']);
    expect(state.check?.stale).toBe(false);
  });

  it('van cho bam Kiem lai sau khi sua', () => {
    const content = rows(['FELIX', 1_150_000]);
    const state = workflow({ rows: content, check: snapshot(content, { valid: false }) });

    expect(state.checkAndContinue.visible).toBe(true);
    expect(state.checkAndContinue.enabled).toBe(true);
  });

  it('danh sach loi khong bien mat ngay phim dau tien, nhung bi danh dau la cu', () => {
    const checked = rows(['FELIX', 1_150_000]);
    const state = workflow({
      rows: rows(['FELIX', 1_150_000], ['ELNI', 900_000]),
      check: snapshot(checked, { valid: false, errors: ['Thiếu giá cho SKU: ELNI'] }),
    });

    expect(state.check?.stale).toBe(true);
    expect(state.check?.validation.errors).toEqual(['Thiếu giá cho SKU: ELNI']);
    expect(state.activate.visible).toBe(false);
  });
});

describe('E. kiem tra dat — vao trang thai Xem lai', () => {
  it('chuyen sang `review`, khoa sua, va CHI o day moi hien Kich hoat', () => {
    const content = rows(['FELIX', 1_150_000]);
    const state = workflow({ rows: content, check: snapshot(content) });

    expect(state.mode).toBe('review');
    expect(state.step).toBe(3);
    expect(state.rowsEditable).toBe(false);
    expect(state.activate.visible).toBe(true);
    expect(state.activate.enabled).toBe(true);
    expect(state.backToEdit.visible).toBe(true);
    expect(state.saveForLater.visible).toBe(false);
    expect(state.checkAndContinue.visible).toBe(false);
  });

  it('hien dung noi dung DA LUU + DA KIEM, khong phai mang dang soan', () => {
    const content = rows(['FELIX', 1_150_000]);
    const persisted: PricePeriodPrice[] = [{ id: 'row-1', sku: 'FELIX', wholesale: 1_150_000 }];
    const state = workflow({
      rows: content,
      check: { fingerprint: fingerprintRows(content), rows: persisted, validation: validation() },
    });

    expect(state.reviewRows).toBe(persisted);
  });

  it('ky chay thu doc ra dung la ky chay thu, khong lan sang chinh thuc', () => {
    const content = rows(['FELIX', 1_150_000]);
    const state = workflow({
      period: period({ source: 'test_only' }),
      rows: content,
      check: snapshot(content),
    });

    expect(state.purpose).toBe('test-only');
    expect(state.activate.label).toMatch(/chạy thử/i);
  });

  it('nhan nut Kich hoat noi ro thang nao', () => {
    const content = rows(['FELIX', 1_150_000]);
    expect(workflow({ rows: content, check: snapshot(content) }).activate.label).toBe(
      'Kích hoạt bảng giá tháng 09/2026',
    );
  });
});

describe('F. sua bat cu gi sau khi Xem lai — lan kiem cu het hieu luc', () => {
  it('doi mot con so la roi khoi `review` va nut Kich hoat bien mat', () => {
    const checked = rows(['FELIX', 1_150_000]);
    const state = workflow({ rows: rows(['FELIX', 1_150_001]), check: snapshot(checked) });

    expect(state.mode).toBe('edit');
    expect(state.activate.visible).toBe(false);
    expect(state.check?.stale).toBe(true);
    expect(state.checkAndContinue.visible).toBe(true);
  });

  it('them mot mat hang cung lam lan kiem cu het hieu luc', () => {
    const checked = rows(['FELIX', 1_150_000]);
    const state = workflow({
      rows: rows(['FELIX', 1_150_000], ['ELNI', 900_000]),
      check: snapshot(checked),
    });

    expect(state.mode).toBe('edit');
    expect(state.activate.visible).toBe(false);
  });

  it('bo mot mat hang cung vay', () => {
    const checked = rows(['FELIX', 1_150_000], ['ELNI', 900_000]);
    const state = workflow({ rows: rows(['FELIX', 1_150_000]), check: snapshot(checked) });

    expect(state.mode).toBe('edit');
    expect(state.activate.visible).toBe(false);
  });

  it('sua roi sua nguoc lai ve dung noi dung da kiem thi quay lai `review`', () => {
    const checked = rows(['FELIX', 1_150_000]);
    expect(checkOutcome(snapshot(checked), rows(['FELIX', 1_150_000]))?.stale).toBe(false);
  });
});

describe('G/H. ky da chot la CHI DOC', () => {
  it('ky dang ap dung: khong con nut sua/luu/kiem/kich hoat', () => {
    const state = workflow({ period: period({ status: 'active' }), rows: rows(['FELIX', 1]) });

    expect(state.mode).toBe('read-only');
    expect(state.rowsEditable).toBe(false);
    expect(state.saveForLater.visible).toBe(false);
    expect(state.checkAndContinue.visible).toBe(false);
    expect(state.activate.visible).toBe(false);
    expect(state.readOnly?.kind).toBe('official');
    expect(state.readOnly?.canArchive).toBe(true);
    expect(state.readOnly?.canStartNewDraft).toBe(true);
  });

  it('ky chay thu dang ap dung van noi thang la khong phai bang gia chinh thuc', () => {
    const state = workflow({
      period: period({ status: 'active', source: 'test_only' }),
      rows: rows(['FELIX', 1]),
    });

    expect(state.readOnly?.kind).toBe('test-only');
    expect(state.readOnly?.detail).toMatch(/không phải bảng giá chính thức/i);
  });

  it('ky da luu tru: chi doc, va khong luu tru them lan nua', () => {
    const state = workflow({ period: period({ status: 'archived' }) });

    expect(state.mode).toBe('read-only');
    expect(state.readOnly?.kind).toBe('archived');
    expect(state.readOnly?.canArchive).toBe(false);
  });

  it('ky thang truoc con `active` khong duoc goi la dang ap dung', () => {
    const state = workflow({ period: period({ status: 'active', validMonth: '2026-08' }) });

    expect(state.readOnly?.kind).toBe('expired');
    expect(state.readOnly?.title).toMatch(/đã hết hiệu lực/i);
  });

  it('vai tro chi doc thay ban nhap o dang chi doc, khong thay workflow bam khong duoc', () => {
    const state = workflow({ canConfigure: false, rows: rows(['FELIX', 1]) });

    expect(state.mode).toBe('read-only');
    expect(state.saveForLater.visible).toBe(false);
    expect(state.readOnly?.canArchive).toBe(false);
    expect(state.readOnly?.canStartNewDraft).toBe(false);
  });

  it('chua chon ky nao thi khong dung ra trang thai gia', () => {
    const state = workflow({ period: null });

    expect(state.mode).toBe('read-only');
    expect(state.readOnly).toBeNull();
  });
});

describe('muc dich ky doc tu nguon, khong tu nhan tren man hinh', () => {
  it('`test_only` la ky chay thu, moi thu khac la chinh thuc', () => {
    expect(periodPurpose({ source: 'test_only' })).toBe('test-only');
    expect(periodPurpose({ source: 'copy:abc' })).toBe('official');
    expect(periodPurpose({})).toBe('official');
  });
});
