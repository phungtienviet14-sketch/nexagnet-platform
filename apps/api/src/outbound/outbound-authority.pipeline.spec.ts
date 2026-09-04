import { describe, expect, it } from 'vitest';
import type { ChannelMessage, Intent, OutboundAuthority, ParseResult } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { AdvisorAgent, type AdvisorReply } from '../advisor/advisor-agent.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { InMemoryContentRepository } from '../content/content.repository.js';
import { ContentService } from '../content/content.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { SEED } from '../knowledge/seed.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { SalesOrderOutcomeService } from '../orders/sales-order-outcome.service.js';
import type { OrderParser } from '../pipeline/order-parser.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { TurnReplyService } from '../turns/turn-reply.service.js';
import {
  NO_AUTHORITY,
  grantsFromDealerPolicy,
  grantsFromQuote,
  mergeAuthority,
} from './outbound-authority.js';

/**
 * MA TRAN HOI QUY muc 7, DO TREN DUONG THAT — khong phai tren ham thuan.
 *
 * `outbound-authority.spec.ts` chung minh hop dong. Bo nay chung minh hop dong DA DUOC CAM VAO
 * duong chay: mot ban nhap LLM di tu `AgentOrchestrator.composeReply()` -> `trace` -> cong tu dong
 * -> `MockAdapter`. Khang dinh cuoi cung luon la tren KENH: `channel.sent` la thu that su den tay
 * khach, con moi co trong ban ghi chi la mot y dinh.
 *
 * CA GOC (quan sat duoc tren gd1-test): `intent=khac`, `priced=null`, `sales=skipped`,
 * `policy_finance=skipped`, ma ban nhap van chua don gia + tong tien + cong no + "da ghi nhan don",
 * va `outbound.ready` van la `true`.
 *
 * `AUTO_SEND` bat `on` trong ca bo test nay CO CHU Y: neu tat, moi bai deu "xanh" ma khong chung
 * minh duoc gi — cong tham quyen phai chan trong dieu kien kill switch DA MO.
 */

const CHAT_ID = SEED.groups[0]!.chatId;

/** Van y het ban nhap da quan sat duoc: bon lop khang dinh he qua, khong mot tham quyen nao. */
const UNSAFE_DRAFT =
  'Dạ đơn giá 990.000đ, tổng đơn 9.900.000đ ạ. Bên mình cho công nợ 30 ngày. ' +
  'Em đã ghi nhận đơn của anh, Sale sẽ liên hệ ngay ạ.';

class StubAdvisor extends AdvisorAgent {
  readonly name = 'stub';
  constructor(private readonly canned: AdvisorReply | null) {
    super();
  }
  async reply(): Promise<AdvisorReply | null> {
    return this.canned;
  }
}

class StubParser implements OrderParser {
  readonly name = 'stub';
  constructor(private readonly intent: Intent) {}
  async parse(): Promise<ParseResult> {
    return { intent: this.intent, confidence: { intent: 0.95 } };
  }
}

function message(text: string): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source: 'copilot_paste',
    chatType: 'group',
    externalChatId: CHAT_ID,
    text,
    sentAt: new Date(),
  };
}

async function build(advisor: AdvisorAgent, intent: Intent = 'khac') {
  const ordersRepo = new InMemoryOrdersRepository();
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15'));
  const content = new ContentService(new InMemoryContentRepository({}, []));
  await content.reload();
  const orchestrator = new AgentOrchestrator(
    new StubParser(intent),
    knowledge,
    ordersRepo,
    undefined,
    undefined,
    content,
    advisor,
  );
  const channel = new MockAdapter();
  const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), channel);
  const turnReply = new TurnReplyService(ordersRepo, router);
  const orders = new OrdersService(ordersRepo, router, undefined, undefined, undefined, turnReply);
  const settings = { autoSend: () => 'on' } as RuntimeSettingsService;
  const pipeline = new PipelineService(
    orchestrator,
    new SalesOrderOutcomeService(orders),
    undefined,
    settings,
    undefined,
    knowledge,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    turnReply,
  );
  return { pipeline, channel, orders };
}

const draft = (text: string, authority: OutboundAuthority = NO_AUTHORITY): AdvisorReply => ({
  text,
  usedTools: [],
  handoff: false,
  authority,
});

describe('am tinh — ban nhap LLM khong tham quyen khong ra khoi he thong', () => {
  it('1-4. ca goc: intent khac, khong dinh gia, ban nhap cam ket ca tien/chinh sach/don', async () => {
    const { pipeline, channel } = await build(new StubAdvisor(draft(UNSAFE_DRAFT)));

    const view = await pipeline.process(message('cho e hoi chut'));

    // Thu QUAN TRONG NHAT: khong mot ky tu nao ra kenh.
    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: false,
      reason: 'FINANCIAL_AUTHORITY_MISSING',
      missing: ['financial', 'policy', 'order_commitment'],
    });
    // Co `ready` khong con lay tu loi tu khai cua LLM nua.
    expect(view.trace?.outbound).toMatchObject({ ready: false });
    // Ban nhap van duoc GIU cho nguoi truc doc — muc 5 doi bang chung, khong doi xoa dau vet.
    expect(view.trace?.outbound?.text).toContain('990.000đ');
    expect(view.status).toBe('needs_edit');
  });

  it('2. chi mot con so tien, khong dinh gia -> van chan', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(draft('Dạ cái này 990.000đ anh nhé.')),
    );

    const view = await pipeline.process(message('cai nay bao nhieu'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: false,
      reason: 'FINANCIAL_AUTHORITY_MISSING',
    });
  });

  // `policy_finance` SKIPPED nghia la vai do khong chay trong luot nay — nen intent phai la `khac`,
  // dung nhu ca da quan sat duoc. Mot luot `chinh_sach_cong_no` thi vai do CO chay va CO tra cuu
  // duoc cap dai ly, tuc luot do that su co tham quyen — xem bai duong duong ben duoi.
  it('3. chi khang dinh chinh sach, khong tra cuu chinh sach -> van chan', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(draft('Dạ bên mình cho công nợ 30 ngày ạ.')),
    );

    const view = await pipeline.process(message('cong no may ngay'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: false,
      reason: 'POLICY_AUTHORITY_MISSING',
    });
  });

  it('4. chi cam ket don, khong co don ben vung -> van chan', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(draft('Dạ em đã chốt đơn cho anh rồi ạ.')),
    );

    const view = await pipeline.process(message('chot cho a nhe'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: false,
      reason: 'ORDER_COMMITMENT_NOT_AUTHORIZED',
    });
  });

  it('5. co tham quyen tien + thanh toan nhung bia VAT -> chan dung lop chinh sach', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft(
          'Dạ 990.000đ, công nợ 30 ngày, đơn này xuất hoá đơn VAT đầy đủ ạ.',
          mergeAuthority(grantsFromQuote([990_000]), grantsFromDealerPolicy('cong_no_30')),
        ),
      ),
    );

    const view = await pipeline.process(message('gia bao nhieu co vat khong'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: false,
      reason: 'POLICY_STATEMENT_NOT_AUTHORIZED',
      missing: ['policy'],
    });
  });

  it('5b. co tham quyen cong no 45 ngay nhung viet 30 ngay -> chan vi DOI GIA TRI', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft(
          'Dạ bên mình cho anh công nợ 30 ngày ạ.',
          mergeAuthority(grantsFromDealerPolicy('cong_no_45')),
        ),
      ),
    );

    const view = await pipeline.process(message('cong no may ngay'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: false,
      reason: 'POLICY_STATEMENT_NOT_AUTHORIZED',
    });
  });

  it('7. Sale bam duyet chinh ban nhap do -> van khong ra kenh', async () => {
    const { pipeline, channel, orders } = await build(new StubAdvisor(draft(UNSAFE_DRAFT)));

    const view = await pipeline.process(message('cho e hoi chut'));
    await expect(orders.approve(view.id)).rejects.toThrow(/thẩm quyền/);

    expect(channel.sent).toHaveLength(0);
  });
});

describe('duong duong — cong nay khong lam hong nhung luot hop le', () => {
  it('8. con so DA duoc rules uy quyen van di toi khach nguyen ven', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(draft('Dạ đơn giá 990.000đ ạ.', mergeAuthority(grantsFromQuote([990_000])))),
    );

    const view = await pipeline.process(message('gia bao nhieu'));

    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
    });
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]?.text).toContain('990.000đ');
    expect(view.status).toBe('sent');
  });

  it('9. dung ky han cong no ma cap dai ly uy quyen -> gui duoc', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft(
          'Dạ bên mình cho anh công nợ 45 ngày ạ.',
          mergeAuthority(grantsFromDealerPolicy('cong_no_45')),
        ),
      ),
    );

    const view = await pipeline.process(message('cong no may ngay'));

    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
    });
    expect(channel.sent).toHaveLength(1);
  });

  it('11. cau tu van thuong khong mang khang dinh he qua van gui binh thuong', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(draft('Dạ máy dùng điện 220V và có chế độ ngủ im ạ.')),
    );

    const view = await pipeline.process(message('may nay dung dien bao nhieu'));

    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: true,
      reason: 'NO_CONSEQUENTIAL_CLAIM',
    });
    expect(channel.sent).toHaveLength(1);
    expect(view.status).toBe('sent');
  });
});
