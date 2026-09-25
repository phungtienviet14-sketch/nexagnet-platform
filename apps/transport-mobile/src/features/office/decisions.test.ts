import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { businessTodayIn, clockNowIn, isBusinessDate, zonedIsoWithOffset } from './business-date';
import {
  ALLOWANCE_POLICY,
  CLAIM_POLICY,
  FUEL_POLICY,
  classifyDecisionFailure,
} from './decision-errors';
import { buildAllowanceDecision, buildClaimDecision, claimApprovalConsequence } from './decisions';
import { checkText, normalizeSearch, parseVndInput } from './form-input';
import { makeIdempotencyKey } from './idempotency';
import { officeReasonText } from './reasons';

describe('classifyDecisionFailure', () => {
  it('mat mang = RETRY (giu to truot, giu khoa)', () => {
    const failure = classifyDecisionFailure(
      new ApiError('NETWORK', 'x', null),
      CLAIM_POLICY,
      false,
    );
    expect(failure.kind).toBe('RETRY');
  });

  it('CLAIM_ALREADY_DECIDED = da xong', () => {
    const error = new ApiError('FORBIDDEN', 'Da quyet', 403, 'CLAIM_ALREADY_DECIDED');
    expect(classifyDecisionFailure(error, CLAIM_POLICY, true).kind).toBe('ALREADY_DONE');
  });

  it('tach bach quyen noi thang, khong tu thu lai', () => {
    const error = new ApiError('FORBIDDEN', 'raw', 403, 'CLAIM_REVIEWER_IS_SUBMITTER');
    const failure = classifyDecisionFailure(error, CLAIM_POLICY, false);
    expect(failure.kind).toBe('REFUSED');
    expect(failure.message).toContain('người khác');
  });

  it('phieu dau: transition-not-permitted chi la da xong khi GUI LAI', () => {
    const error = new ApiError('FORBIDDEN', 'x', 403, 'FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED');
    expect(classifyDecisionFailure(error, FUEL_POLICY, false).kind).toBe('REFUSED');
    expect(classifyDecisionFailure(error, FUEL_POLICY, true).kind).toBe('ALREADY_DONE');
  });

  it('phu cap: hai ma da quyet deu la da xong', () => {
    const error = new ApiError('DOMAIN', 'x', 409, 'WAITING_ALLOWANCE_ALREADY_APPROVED');
    expect(classifyDecisionFailure(error, ALLOWANCE_POLICY, false).kind).toBe('ALREADY_DONE');
  });

  it('ma la roi ve message may chu', () => {
    expect(officeReasonText('BRAND_NEW', 'Khong duoc')).toBe('Khong duoc');
  });
});

describe('buildClaimDecision', () => {
  const claim = { claimedAmount: 500_000 };

  it('duyet tron khoan khi bo trong so duyet', () => {
    const result = buildClaimDecision(claim, {
      outcome: 'APPROVE',
      reason: '  Đủ hoá đơn ',
      approvedAmount: '',
      note: '',
    });
    expect(result).toEqual({
      ok: true,
      value: { path: 'approve', body: { reasonCode: 'Đủ hoá đơn' } },
    });
  });

  it('so duyet khong vuot so de nghi', () => {
    const result = buildClaimDecision(claim, {
      outcome: 'APPROVE',
      reason: 'ok',
      approvedAmount: '600.000',
      note: '',
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.approvedAmount).toContain('500.000');
  });

  it('ly do bat buoc va toi da 60 ky tu', () => {
    expect(
      buildClaimDecision(claim, { outcome: 'REJECT', reason: ' ', approvedAmount: '', note: '' })
        .ok,
    ).toBe(false);
    expect(
      buildClaimDecision(claim, {
        outcome: 'REJECT',
        reason: 'x'.repeat(61),
        approvedAmount: '',
        note: '',
      }).errors?.reason,
    ).toContain('60');
  });

  it('tu choi khong gui so tien', () => {
    const result = buildClaimDecision(claim, {
      outcome: 'REJECT',
      reason: 'Thiếu hoá đơn',
      approvedAmount: '100.000',
      note: 'Bổ sung ảnh',
    });
    expect(result).toEqual({
      ok: true,
      value: { path: 'reject', body: { reasonCode: 'Thiếu hoá đơn', note: 'Bổ sung ảnh' } },
    });
  });

  it('noi truoc: chua gan chuyen thi chua vao gia thanh', () => {
    expect(claimApprovalConsequence({ tripId: null })).toContain('CHƯA vào giá thành');
    expect(claimApprovalConsequence({ tripId: 't1' })).toContain('vào giá thành chuyến');
  });
});

describe('buildAllowanceDecision', () => {
  const allowance = { candidateAmount: 200_000 };

  it('duyet bat buoc so tien <= de nghi', () => {
    expect(
      buildAllowanceDecision(allowance, { outcome: 'APPROVED', approvedAmount: '', note: '' }, 'k')
        .ok,
    ).toBe(false);
    expect(
      buildAllowanceDecision(
        allowance,
        { outcome: 'APPROVED', approvedAmount: '250000', note: '' },
        'k',
      ).ok,
    ).toBe(false);
    expect(
      buildAllowanceDecision(
        allowance,
        { outcome: 'APPROVED', approvedAmount: '150.000', note: '' },
        'key-123',
      ),
    ).toEqual({
      ok: true,
      value: { outcome: 'APPROVED', approvedAmount: 150_000, idempotencyKey: 'key-123' },
    });
  });

  it('tu choi PHAI vang mat so tien', () => {
    const result = buildAllowanceDecision(
      allowance,
      { outcome: 'REJECTED', approvedAmount: '150.000', note: '' },
      'key-123',
    );
    expect(result).toEqual({ ok: true, value: { outcome: 'REJECTED', idempotencyKey: 'key-123' } });
  });
});

describe('o nhap', () => {
  it('so tien VND nguyen, co dau ngan cach', () => {
    expect(parseVndInput('1.500.000')).toEqual({ ok: true, value: 1_500_000 });
    expect(parseVndInput('1500000 đ')).toEqual({ ok: true, value: 1_500_000 });
    expect(parseVndInput('1,5tr').ok).toBe(false);
    expect(parseVndInput('0').ok).toBe(false);
    expect(parseVndInput('12.5').ok).toBe(false);
    expect(parseVndInput('').ok).toBe(false);
  });

  it('cau bat buoc dem ky tu that (co dau)', () => {
    expect(checkText('Được', { label: 'lý do', min: 1, max: 4 })).toEqual({
      ok: true,
      value: 'Được',
    });
  });

  it('tim khong dau', () => {
    expect(normalizeSearch('Đình Vũ')).toBe('dinh vu');
  });
});

describe('khoa chong ghi trung', () => {
  it('co tien to, trong gioi han 8..120', () => {
    const key = makeIdempotencyKey('claim', '0f8b0b5e-3c1e-4d7c-9a51-6d1c4c2b9e10');
    expect(key.startsWith('m-claim-')).toBe(true);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(120);
    expect(() => makeIdempotencyKey('x', 'abc')).toThrow();
  });
});

describe('ngay nghiep vu theo mui gio doanh nghiep', () => {
  it('23:30 UTC la ngay hom sau o Viet Nam', () => {
    const now = new Date('2026-09-24T23:30:00.000Z');
    expect(businessTodayIn('Asia/Ho_Chi_Minh', now)).toBe('2026-09-25');
    expect(businessTodayIn('UTC', now)).toBe('2026-09-24');
    expect(clockNowIn('Asia/Ho_Chi_Minh', now)).toBe('06:30');
  });

  it('mui gio hong roi ve mac dinh nen tang', () => {
    expect(businessTodayIn('Not/AZone', new Date('2026-09-24T23:30:00.000Z'))).toBe('2026-09-25');
  });

  it('ISO co do lech, dung ca vung co gio mua he', () => {
    expect(zonedIsoWithOffset('2026-09-25', '14:30', 'Asia/Ho_Chi_Minh')).toBe(
      '2026-09-25T14:30:00+07:00',
    );
    expect(zonedIsoWithOffset('2026-07-01', '09:05', 'Europe/Berlin')).toBe(
      '2026-07-01T09:05:00+02:00',
    );
    expect(zonedIsoWithOffset('2026-01-15', '09:05', 'Europe/Berlin')).toBe(
      '2026-01-15T09:05:00+01:00',
    );
    expect(zonedIsoWithOffset('2026-02-30', '09:05', 'UTC')).toBeNull();
    expect(zonedIsoWithOffset('2026-02-10', '25:00', 'UTC')).toBeNull();
  });

  it('ngay khong co tren lich bi tu choi', () => {
    expect(isBusinessDate('2026-02-28')).toBe(true);
    expect(isBusinessDate('2026-02-30')).toBe(false);
  });
});
