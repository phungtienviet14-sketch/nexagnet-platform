import { describe, expect, it } from 'vitest';
import type { OrderStatus, OrderView, PricedOrder } from '@netviet/shared';
import { amendNeedsCustomerNotice, canAmendOrder } from './amend-window.js';

/**
 * Cong nay la thu duy nhat dung giua LLM va mot don da nam trong ERP. Test o day khong phai de
 * dat do phu — no la ban ghi cua mot quyet dinh nghiep vu: moc khoa la `salesHandoff`, khong phai
 * `status`.
 */

const PRICED: PricedOrder = {
  orderType: 'TH1',
  dealerName: 'Meta HN',
  branch: 'HN',
  lines: [],
  itemsSubtotal: 25_000_000,
  shippingFee: 0,
  policy: 'cong_no_30',
  codCollect: false,
  codFee: 0,
  vat: false,
  vatAmount: 0,
  grandTotal: 25_000_000,
  warnings: [],
  confirmationText: 'XAC NHAN',
};

function order(patch: Partial<OrderView> = {}): OrderView {
  return {
    id: 'o-1',
    status: 'sent',
    createdAt: new Date().toISOString(),
    chatId: 'chat-1',
    rawText: '20 ghe felix',
    intent: 'dat_don',
    parsed: null,
    priced: PRICED,
    confidence: {},
    ...patch,
  };
}

describe('cua so con sua duoc don', () => {
  const editableBeforeSend: OrderStatus[] = ['draft', 'pending_review', 'needs_edit', 'approved'];
  for (const status of editableBeforeSend) {
    it(`cho sua khi don con o "${status}" (khach chua nhan gi)`, () => {
      expect(canAmendOrder(order({ status })).allowed).toBe(true);
    });
  }

  it('VAN cho sua don da gui khi Sale CHUA nhap ERP', () => {
    const view = order({
      status: 'sent',
      salesHandoff: { action: 'manual_erp_entry', status: 'pending', createdAt: '2026-08-21T04:31:14Z' },
    });

    expect(canAmendOrder(view).allowed).toBe(true);
    // Da gui roi thi doi don phai bao lai khach, khong duoc doi lang.
    expect(amendNeedsCustomerNotice(view)).toBe(true);
  });

  it('KHOA khi Sale da nhap ERP — day la diem khong quay lai', () => {
    const verdict = canAmendOrder(
      order({
        status: 'sent',
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'completed',
          createdAt: '2026-08-21T04:31:14Z',
        },
      }),
    );

    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) return;
    expect(verdict.reason).toBe('da_nhap_erp');
    expect(verdict.message).toContain('Sale');
  });

  it('khoa don da dong bo ERP', () => {
    const verdict = canAmendOrder(order({ status: 'synced' }));
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe('da_dong_bo_erp');
  });

  it('khoa don da bi huy', () => {
    const verdict = canAmendOrder(order({ status: 'rejected' }));
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe('da_tu_choi');
  });

  it('tin tu van khong phai don — bao dung ly do, khong bao "da nhap ERP"', () => {
    const verdict = canAmendOrder(order({ intent: 'hoi_san_pham', priced: null }));
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe('khong_phai_don');
  });

  it('don chua gui thi sua khong can bao lai khach', () => {
    expect(amendNeedsCustomerNotice(order({ status: 'needs_edit' }))).toBe(false);
  });
});
