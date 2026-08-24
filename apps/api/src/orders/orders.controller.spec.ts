import { describe, expect, it, vi } from 'vitest';
import type { OrderView } from '@netviet/shared';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { OrdersController } from './orders.controller.js';
import type { OrdersService } from './orders.service.js';

/*
 * DANH TINH NGUOI BAM NUT — cong vao cua mot gia tri se di RAT XA.
 *
 * `actor` khong dung lai o bang `AuditLog`: no vao `TraceAnchors.actor`, ma
 * `TelemetryService.envelope()` dung `traceSnapshot()` THO — neo KHONG di qua `sanitizeAttributes`.
 * Nen mot `x-actor` bia dat se duoc chep nguyen van vao MOI ban ghi cua luot do va nam lai trong
 * vong dem `RecentTracesSink`. Duoi `AUTH_MODE=api_key` (demo/CI) header do la thu ben ngoai dat.
 *
 * Vi vay cong vao phai loc, va bai test nay giu cai loc do.
 */

function build() {
  const calls: { id: string; actor: string }[] = [];
  const orders = {
    approve: vi.fn((id: string, actor: string) => {
      calls.push({ id, actor });
      return Promise.resolve({ id } as OrderView);
    }),
    reject: vi.fn((id: string, actor: string) => {
      calls.push({ id, actor });
      return Promise.resolve({ id } as OrderView);
    }),
    completeSalesHandoff: vi.fn((id: string, actor: string) => {
      calls.push({ id, actor });
      return Promise.resolve({ id } as OrderView);
    }),
  } as unknown as OrdersService;
  return { controller: new OrdersController(orders), calls };
}

const noSession = {} as AuthenticatedRequest;
const withSession = { authUser: { username: 'phuong.nt' } } as AuthenticatedRequest;

describe('OrdersController — danh tinh nguoi van hanh', () => {
  it('phien dang nhap THANG header: `x-actor` khong ghi de duoc danh tinh da xac thuc', async () => {
    const { controller, calls } = build();

    await controller.approve('o-1', withSession, 'ke-gia-mao');

    expect(calls[0]?.actor).toBe('phuong.nt');
  });

  it('khong co phien: chap nhan `x-actor` hop le (duong AUTH_MODE=api_key)', async () => {
    const { controller, calls } = build();

    await controller.reject('o-1', noSession, 'quan.ly');

    expect(calls[0]?.actor).toBe('quan.ly');
  });

  it('mac dinh `operator` khi khong co gi — khong bao gio de trong', async () => {
    const { controller, calls } = build();

    await controller.completeSalesHandoff('o-1', noSession, '   ');

    expect(calls[0]?.actor).toBe('operator');
  });

  it('CHAN header qua dai: 8KB header x 200 ban ghi x 300 luot la mot cach lam phinh vong dem', async () => {
    const { controller, calls } = build();

    await controller.approve('o-1', noSession, 'a'.repeat(5_000));

    expect(calls[0]?.actor).toBe('operator');
  });

  it('CHAN ky tu la — neo di thang vao NDJSON, khong qua bo loc nao', async () => {
    const { controller, calls } = build();

    for (const hostile of ['xuong\ndong', '{"json":"injection"}', 'a b', '<script>']) {
      calls.length = 0;
      await controller.approve('o-1', noSession, hostile);
      expect(calls[0]?.actor, hostile).toBe('operator');
    }
  });
});
