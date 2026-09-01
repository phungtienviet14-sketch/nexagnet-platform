import { describe, expect, it } from 'vitest';
import type { BlockedCapabilityDescriptor } from '../../../lib/tenant-runtime';
import { READINESS_STATUS_LABEL, readinessHeadline, toCustomerReadiness } from '../readiness';

const BLOCKED: readonly BlockedCapabilityDescriptor[] = [
  { key: 'cod_ship', label: 'COD và cước vận chuyển', reason: 'Chưa có bảng phí chính thức.' },
  { key: 'vat', label: 'VAT', reason: 'Chưa chốt cách xuất hoá đơn.' },
];

describe('be mat nghiep vu chua san sang (Issue #107 §7, §9.6)', () => {
  it('moi nang luc bi chan doc ra la chua san sang, kem LY DO nguyen van cua khach', () => {
    expect(toCustomerReadiness(BLOCKED, { canUpdateSources: true })).toEqual([
      {
        key: 'cod_ship',
        label: 'COD và cước vận chuyển',
        status: 'chua_san_sang',
        statusLabel: READINESS_STATUS_LABEL,
        reason: 'Chưa có bảng phí chính thức.',
        action: expect.stringContaining('nguồn dữ liệu'),
      },
      {
        key: 'vat',
        label: 'VAT',
        status: 'chua_san_sang',
        statusLabel: 'Chưa sẵn sàng',
        reason: 'Chưa chốt cách xuất hoá đơn.',
        action: expect.stringContaining('nguồn dữ liệu'),
      },
    ]);
  });

  it('khong bao gio hien mot nang luc bi chan nhu dang chay', () => {
    for (const row of toCustomerReadiness(BLOCKED, { canUpdateSources: false })) {
      expect(row.status).toBe('chua_san_sang');
      expect(row.statusLabel).toBe('Chưa sẵn sàng');
    }
  });

  it('nguoi khong sua duoc nguon du lieu VAN thay du nang luc bi chan, chi khong duoc goi hanh dong', () => {
    const rows = toCustomerReadiness(BLOCKED, { canUpdateSources: false });
    expect(rows).toHaveLength(BLOCKED.length);
    expect(rows.every((row) => row.action === null)).toBe(true);
  });
});

describe('cau tom tat', () => {
  it('goi ten tung nghiep vu chua san sang', () => {
    expect(readinessHeadline(toCustomerReadiness(BLOCKED, { canUpdateSources: true }))).toBe(
      '2 nghiệp vụ chưa sẵn sàng: COD và cước vận chuyển, VAT.',
    );
  });

  it('mot nghiep vu thi cau van doc xuoi', () => {
    expect(readinessHeadline(toCustomerReadiness([BLOCKED[0]!], { canUpdateSources: false }))).toBe(
      '1 nghiệp vụ chưa sẵn sàng: COD và cước vận chuyển.',
    );
  });

  it('danh sach rong KHONG duoc doc thanh "moi thu da san sang"', () => {
    const headline = readinessHeadline([]);
    expect(headline).toBe('Doanh nghiệp chưa khai báo nghiệp vụ nào đang tạm khoá.');
    expect(headline).not.toMatch(/sẵn sàng hết|đã sẵn sàng|hoàn tất/i);
  });
});
