import type { OrderView } from '@netviet/shared';
import { describe, expect, it } from 'vitest';
import { requiresSalesAction } from './sales-work';

const BASE = {
  id: 'o-1',
  createdAt: '2026-08-12T00:00:00.000Z',
  chatId: 'g-1',
  rawText: 'don',
  intent: 'dat_don',
  parsed: null,
  priced: null,
  confidence: { intent: 1 },
} satisfies Omit<OrderView, 'status'>;

describe('requiresSalesAction', () => {
  it.each(['pending_review', 'needs_edit'] as const)('%s la viec Sale truoc outbound', (status) => {
    expect(requiresSalesAction({ ...BASE, status })).toBe(true);
  });

  it('sent + manual ERP handoff pending la viec Sale sau outbound', () => {
    expect(
      requiresSalesAction({
        ...BASE,
        status: 'sent',
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'pending',
          createdAt: '2026-08-12T00:00:01.000Z',
        },
      }),
    ).toBe(true);
  });

  it('handoff da hoan tat hoac don ket thuc khong con la viec Sale', () => {
    expect(
      requiresSalesAction({
        ...BASE,
        status: 'sent',
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'completed',
          createdAt: '2026-08-12T00:00:01.000Z',
        },
      }),
    ).toBe(false);
    expect(requiresSalesAction({ ...BASE, status: 'rejected' })).toBe(false);
  });
});
