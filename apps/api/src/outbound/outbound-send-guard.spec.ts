import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AgentTrace, OrderView } from '@netviet/shared';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { outboundFingerprint } from './outbound-authority.js';
import { OrdersService } from '../orders/orders.service.js';
import { TurnReplyService } from '../turns/turn-reply.service.js';

/**
 * DIEM NGHEN GUI — muc 7 ca 7 hop dong nhiem vu:
 * "human approval action cannot bypass missing authority merely because an LLM draft exists".
 *
 * Bo test nay di qua DUONG THAT: `OrdersService.approve()` (nut "Duyệt & gửi" cua Sale) va
 * `TurnReplyService.sendAdviceReply()` (cong chung cua ca duong tu dong), roi khang dinh tren
 * `MockAdapter` — tuc tren thu THUC SU ra khoi he thong. Khang dinh mot co `ready` la khang dinh
 * mot y dinh; khang dinh kenh la khang dinh mot hau qua.
 */

const BASE_TRACE: AgentTrace = {
  steps: [],
  primaryRole: 'router',
  senderType: 'dai_ly',
  llmCalls: 1,
  brainMode: 'stub',
  supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
};

/** Ban nhap LLM cua ca da quan sat duoc: intent khac, khong dinh gia, ma van cam ket du thu. */
const UNSAFE_DRAFT =
  'Dạ đơn gia 990.000đ, tổng đơn 9.900.000đ, bên mình cho công nợ 30 ngày. Em đã ghi nhận đơn của anh ạ.';

function build() {
  const repo = new InMemoryOrdersRepository();
  const channel = new MockAdapter();
  const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), channel);
  const turnReply = new TurnReplyService(repo, router);
  return {
    repo,
    channel,
    turnReply,
    orders: new OrdersService(repo, router, undefined, undefined, undefined, turnReply),
  };
}

/**
 * Ghim phan quyet vao DUNG doan van cua chinh ban ghi — y het duong soan that lam.
 *
 * Khong co buoc nay thi moi fixture o day se bi diem nghen tu choi voi `AUTHORITY_PAYLOAD_MISMATCH`,
 * va bo test se do vi mot ly do KHAC voi ly do no muon do — tuc no khong con kiem tra dieu no noi.
 */
function pin(trace: AgentTrace): AgentTrace {
  const verdict = trace.outboundAuthority;
  if (!verdict) return trace;
  return {
    ...trace,
    outboundAuthority: { ...verdict, fingerprint: outboundFingerprint(trace.outbound?.text ?? '') },
  };
}

function view(trace: AgentTrace, patch: Partial<OrderView> = {}): OrderView {
  return {
    id: `o-${Math.random()}`,
    status: 'needs_edit',
    createdAt: new Date().toISOString(),
    chatId: 'chat-1',
    replyChannel: 'mock',
    rawText: 'tin goc',
    intent: 'khac',
    parsed: null,
    priced: null,
    confidence: {},
    senderType: 'dai_ly',
    trace: pin(trace),
    ...patch,
  };
}

describe('7. duyet tay khong vuot qua duoc tham quyen thieu', () => {
  it('Sale bam duyet mot ban nhap bi tu choi -> khong mot ky tu nao ra kenh', async () => {
    const { orders, repo, channel } = build();
    const saved = await repo.create(
      view({
        ...BASE_TRACE,
        outbound: { text: UNSAFE_DRAFT },
        outboundAuthority: {
          sendable: false,
          reason: 'FINANCIAL_AUTHORITY_MISSING',
          missing: ['financial', 'policy', 'order_commitment'],
        },
      }),
    );

    await expect(orders.approve(saved.id)).rejects.toThrow(UnprocessableEntityException);
    expect(channel.sent).toHaveLength(0);
    expect((await repo.findById(saved.id))?.status).toBe('needs_edit');
  });

  it('goi thang duong gui cung bi chan — cong nam o diem nghen, khong o controller', async () => {
    const { turnReply, repo, channel } = build();
    const saved = await repo.create(
      view({
        ...BASE_TRACE,
        outbound: { text: UNSAFE_DRAFT },
        outboundAuthority: {
          sendable: false,
          reason: 'ORDER_COMMITMENT_NOT_AUTHORIZED',
          missing: ['order_commitment'],
        },
      }),
    );

    await expect(turnReply.sendAdviceReply(saved.id)).rejects.toThrow(UnprocessableEntityException);
    expect(channel.sent).toHaveLength(0);
  });

  it('ban ghi CU (co outbound, chua co phan quyet) -> fail closed', async () => {
    const { orders, repo, channel } = build();
    const saved = await repo.create(view({ ...BASE_TRACE, outbound: { text: UNSAFE_DRAFT } }));

    await expect(orders.approve(saved.id)).rejects.toThrow(UnprocessableEntityException);
    expect(channel.sent).toHaveLength(0);
  });
});

describe('6. quyet dinh cau truc doc lap voi heuristic do tin cay', () => {
  it('Giam sat khong thay rui ro van KHONG mo duoc cong tham quyen', async () => {
    const { turnReply, repo, channel } = build();
    const saved = await repo.create(
      view({
        ...BASE_TRACE,
        supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
        outbound: { text: UNSAFE_DRAFT },
        outboundAuthority: {
          sendable: false,
          reason: 'FINANCIAL_AUTHORITY_MISSING',
          missing: ['financial'],
        },
      }),
    );

    await expect(turnReply.sendAdviceReply(saved.id)).rejects.toThrow(UnprocessableEntityException);
    expect(channel.sent).toHaveLength(0);
  });

  it('Giam sat danh dau rui ro cao KHONG lam doi phan quyet tham quyen', async () => {
    const { turnReply, repo, channel } = build();
    const saved = await repo.create(
      view({
        ...BASE_TRACE,
        supervisor: { riskLevel: 'escalate', escalate: true, reasons: ['LOW_CONFIDENCE'] },
        outbound: { text: 'Dạ máy này dùng điện 220V ạ.' },
        outboundAuthority: { sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM', claims: [] },
      }),
    );

    // Cong tham quyen la cong RIENG: no khong doc `supervisor`, va `supervisor` khong doc no.
    // Duong tu dong van co cong rui ro cua chinh no (`evaluateAutoReplyAdvice`) — cai bi cam o
    // day la de mot heuristic do tin cay dong vai ranh gioi tham quyen.
    await expect(turnReply.sendAdviceReply(saved.id)).resolves.toMatchObject({ status: 'sent' });
    expect(channel.sent).toHaveLength(1);
  });
});

describe('11/12. duong hop le khong bi cong nay lam hong', () => {
  it('ban tu van thuong da qua cong van gui binh thuong', async () => {
    const { orders, repo, channel } = build();
    const saved = await repo.create(
      view({
        ...BASE_TRACE,
        outbound: { text: 'Dạ sản phẩm bảo hành 12 tháng ạ.' },
        outboundAuthority: { sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM', claims: [] },
      }),
    );

    const sent = await orders.approve(saved.id);

    expect(sent.status).toBe('sent');
    expect(channel.sent[0]?.text).toContain('12 tháng');
  });

  it('ban co tien DA duoc uy quyen van gui duoc nguyen con so', async () => {
    const { orders, repo, channel } = build();
    const saved = await repo.create(
      view({
        ...BASE_TRACE,
        outbound: { text: 'Dạ đơn giá 990.000đ ạ.' },
        outboundAuthority: {
          sendable: true,
          reason: 'AUTHORITY_SATISFIED',
          claims: ['financial'],
        },
      }),
    );

    const sent = await orders.approve(saved.id);

    expect(sent.status).toBe('sent');
    expect(channel.sent[0]?.text).toContain('990.000đ');
  });
});
