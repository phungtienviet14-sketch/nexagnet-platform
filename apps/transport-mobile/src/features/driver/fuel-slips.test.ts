import { describe, expect, it } from 'vitest';
import { formatLitersUnits, toFuelSlipRow } from './fuel-slips';
import type { DriverFuelSlipView } from './types';

function slip(overrides: Partial<DriverFuelSlipView> = {}): DriverFuelSlipView {
  return {
    id: 's1',
    tripId: null,
    tripCode: null,
    runId: 'r1',
    runCode: 'VX-0001',
    legId: 'l1',
    legSequence: 2,
    vehicleId: 'v1',
    vehiclePlate: '29C-123.45',
    supplierId: 'sup',
    stationId: null,
    stationName: null,
    businessDate: '2026-09-25',
    occurredAt: '2026-09-25T01:00:00.000Z',
    litersUnits: 200_000,
    amount: 4_500_000,
    currencyCode: 'VND',
    odometerKm: 120_345,
    consumptionUnits: null,
    reviewReasons: [],
    paymentMethod: 'DRIVER_CASH',
    verificationStatus: 'DECLARED',
    reconciliationStatus: 'UNMATCHED',
    invoiceNo: null,
    reviewNote: null,
    evidenceCount: 0,
    createdAt: '2026-09-25T01:01:00.000Z',
    ...overrides,
  };
}

describe('toFuelSlipRow', () => {
  it('litersUnits la MILILIT — 200000 hien 200 lit, khong phai 200.000', () => {
    expect(formatLitersUnits(200_000)).toBe('200 lít');
    expect(formatLitersUnits(45_500)).toBe('45,5 lít');
    expect(toFuelSlipRow(slip(), 'Asia/Ho_Chi_Minh').headline).toMatch(/^200 lít · 4\.500\.000/);
  });

  it('gia tri null hien gach, khong hien 0', () => {
    const row = toFuelSlipRow(slip(), 'Asia/Ho_Chi_Minh');
    expect(row.consumptionLabel).toBe('—');
    expect(formatLitersUnits(null)).toBe('—');
  });

  it('ngu canh vong chay + chang, nhan nguon tien va nhan xac thuc cua web', () => {
    const row = toFuelSlipRow(slip(), 'Asia/Ho_Chi_Minh');
    expect(row.contextLabel).toBe('Xe 29C-123.45 · Vòng xe VX-0001 · chặng 2');
    expect(row.paymentLabel).toBe('Lái xe trả tiền mặt');
    expect(row.verificationLabel).toBe('Mới khai');
    expect(row.reconciliationLabel).toBe('Chưa khớp');
    expect(row.evidenceCountLabel).toBe('Chưa có ảnh chứng từ');
  });

  it('phieu bi tu choi: nop lai duoc, ghi chu mac dinh khi ke toan khong ghi', () => {
    const row = toFuelSlipRow(slip({ verificationStatus: 'REJECTED' }), 'UTC');
    expect(row.canResubmit).toBe(true);
    expect(row.rejectedNote).toBe('Phiếu bị từ chối. Sửa lại theo ghi chú rồi nộp lại.');
    expect(
      toFuelSlipRow(slip({ verificationStatus: 'REJECTED', reviewNote: 'Sai số km' }), 'UTC')
        .rejectedNote,
    ).toBe('Sai số km');
  });

  it('hai cong chung tu khac nhau: da xac thuc thi khong go nhung van dinh them', () => {
    const verified = toFuelSlipRow(slip({ verificationStatus: 'VERIFIED' }), 'UTC');
    expect(verified.evidenceLockedReason).toContain('vẫn đính thêm được');
    expect(verified.evidenceAttachLockedReason).toBeNull();
    const settled = toFuelSlipRow(slip({ reconciliationStatus: 'SETTLED' }), 'UTC');
    expect(settled.evidenceLockedReason).toContain('kỳ đối soát');
    expect(settled.evidenceAttachLockedReason).toContain('đã chốt');
  });

  it('ly do soat noi bang cau, ma la thi giu ma', () => {
    const row = toFuelSlipRow(slip({ reviewReasons: ['ODOMETER_NOT_ADVANCED', 'MA_MOI'] }), 'UTC');
    expect(row.reviewReasonLabels).toEqual(['Số km chưa tăng so với lần đổ trước', 'MA_MOI']);
  });
});
