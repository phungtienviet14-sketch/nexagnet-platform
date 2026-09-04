import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AgentTrace, OrderView, PricedOrder } from '@netviet/shared';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { InMemoryOrdersRepository } from './orders.repository.js';
import { TurnReplyService } from '../turns/turn-reply.service.js';
import { OrdersService } from './orders.service.js';

/**
 * NUT "DUYET & GUI" PHAI GUI DUOC CA HAI LOAI NOI DUNG.
 *
 * Truoc 21/08/2026 console chi co mot nut, noi toi `approve()` -> `sendConfirmation()`, ma ham do
 * nem 422 "Tin nay khong phai don hang" ngay khi `priced` rong. Tuc MOI tin tu van — dung nhung
 * tin bi cong handoff tat dinh day ve `needs_edit` — deu khong the gui tu giao dien. Con
 * `sendProductAdvice()` thi khong co route nao goi toi.
 *
 * Nay `approve()` dinh tuyen theo NOI DUNG dang co: don da tinh gia -> ban xac nhan; tin tu van
 * da soan -> ban tu van. Khong co gi de gui thi moi bao loi.
 */

const TRACE: AgentTrace = {
  steps: [],
  primaryRole: 'product_advisor',
  senderType: 'dai_ly',
  llmCalls: 1,
  brainMode: 'stub',
  supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
};

/**
 * PHAN QUYET THAM QUYEN cua mot cau tu van thuong: khong khang dinh tien/chinh sach/cam ket don
 * nao ca, nen no gui duoc. Mot ban ghi KHONG co truong nay la mot ban ghi chua qua cong, va cong
 * gui se tu choi no — xem bo test ngay duoi.
 */
const CLEARED: AgentTrace['outboundAuthority'] = {
  sendable: true,
  reason: 'NO_CONSEQUENTIAL_CLAIM',
  claims: [],
};

function build() {
  const repo = new InMemoryOrdersRepository();
  const outbound = new MockAdapter();
  const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
  const turnReply = new TurnReplyService(repo, router);
  return {
    orders: new OrdersService(repo, router, undefined, undefined, undefined, turnReply),
    repo,
    outbound,
  };
}

function baseView(patch: Partial<OrderView>): OrderView {
  return {
    id: `o-${Math.random()}`,
    status: 'pending_review',
    createdAt: new Date().toISOString(),
    chatId: 'chat-1',
    replyChannel: 'mock',
    rawText: 'tin goc',
    intent: 'hoi_san_pham',
    parsed: null,
    priced: null,
    confidence: {},
    senderType: 'dai_ly',
    ...patch,
  };
}

function pricedOrder(): PricedOrder {
  return {
    orderType: 'TH1',
    dealerName: 'Meta HN',
    branch: 'HN',
    lines: [],
    itemsSubtotal: 5_000_000,
    shippingFee: 0,
    policy: 'cong_no_30',
    codCollect: false,
    codFee: 0,
    vat: false,
    vatAmount: 0,
    grandTotal: 5_000_000,
    warnings: [],
    confirmationText: 'XAC NHAN DON: 5.000.000d',
  };
}

describe('Sale bam duyet — dinh tuyen theo noi dung', () => {
  it('gui ban XAC NHAN khi don da co gia', async () => {
    const { orders, repo, outbound } = build();
    const view = await repo.create(
      baseView({
        intent: 'dat_don',
        priced: pricedOrder(),
      }),
    );

    const sent = await orders.approve(view.id);

    expect(sent.status).toBe('sent');
    expect(outbound.sent[0]?.text).toContain('XAC NHAN DON');
    // Don that thi Sale con phai nhap ERP thu cong (GD1 khong goi KiotViet).
    expect(sent.salesHandoff?.status).toBe('pending');
  });

  it('gui ban TU VAN khi tin khong co gia nhung da co noi dung soan san', async () => {
    const { orders, repo, outbound } = build();
    const view = await repo.create(
      baseView({
        // Dung trang thai ma cong handoff tat dinh day tin tu van ve.
        status: 'needs_edit',
        trace: {
          ...TRACE,
          outbound: { text: 'Dạ máy có đèn ngủ ạ.' },
          outboundAuthority: CLEARED,
        },
      }),
    );

    const sent = await orders.approve(view.id);

    expect(sent.status).toBe('sent');
    expect(outbound.sent[0]?.text).toContain('đèn ngủ');
    // Tin tu van KHONG sinh viec nhap ERP — no khong phai don hang.
    expect(sent.salesHandoff).toBeUndefined();
  });

  it('gui duoc ban tu van cua intent NGOAI hoi_san_pham (bao hanh, cong no, van chuyen)', async () => {
    const { orders, repo, outbound } = build();
    const view = await repo.create(
      baseView({
        intent: 'bao_hanh_khieu_nai',
        status: 'needs_edit',
        trace: {
          ...TRACE,
          primaryRole: 'after_sales',
          outbound: { text: 'Dạ sản phẩm bảo hành 12 tháng ạ.' },
          outboundAuthority: CLEARED,
        },
      }),
    );

    const sent = await orders.approve(view.id);

    expect(sent.status).toBe('sent');
    expect(outbound.sent[0]?.text).toContain('12 tháng');
  });

  it('bao loi ro rang khi khong co gi de gui', async () => {
    const { orders, repo, outbound } = build();
    const view = await repo.create(baseView({ trace: TRACE }));

    await expect(orders.approve(view.id)).rejects.toThrow(UnprocessableEntityException);
    expect(outbound.sent).toHaveLength(0);
  });

  it('khong gui lai mot tin khach da nhan', async () => {
    const { orders, repo, outbound } = build();
    const view = await repo.create(
      baseView({ status: 'sent', trace: { ...TRACE, outbound: { text: 'da gui roi' } } }),
    );

    const again = await orders.approve(view.id);

    expect(again.status).toBe('sent');
    expect(outbound.sent).toHaveLength(0);
  });
});
