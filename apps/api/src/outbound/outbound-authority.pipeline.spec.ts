import { describe, expect, it } from 'vitest';
import type {
  ChannelMessage,
  Intent,
  OutboundAuthority,
  ParseResult,
  PolicyType,
} from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { AdvisorAgent, type AdvisorReply } from '../advisor/advisor-agent.js';
import {
  fakeAdvisorReply,
  stubEvidence,
  stubEvidenceRegistry,
} from '../advisor/__tests__/advisor-reply.fixture.js';
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
import { NO_BUSINESS_FACTS, type TurnBusinessFacts } from './outbound-facts.js';
import {
  NO_AUTHORITY,
  grantsFromDealerPolicy,
  grantsFromQuote,
  mergeAuthority,
} from './outbound-authority.js';

/**
 * MA TRAN HOI QUY DO TREN DUONG THAT — khong phai tren ham thuan.
 *
 * `outbound-composer.spec.ts` chung minh hop dong. Bo nay chung minh hop dong DA DUOC CAM VAO
 * duong chay: mot ban soan cua agent di tu `AgentOrchestrator.composeReply()` -> `trace` -> cong
 * tu dong -> `MockAdapter`. Khang dinh cuoi cung luon la tren KENH: `channel.sent` la thu that su
 * den tay khach, con moi co trong ban ghi chi la mot y dinh.
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
  const turnReply = new TurnReplyService(
    ordersRepo,
    router,
    undefined,
    undefined,
    stubEvidenceRegistry(),
  );
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

const draft = (
  text: string,
  authority: OutboundAuthority = NO_AUTHORITY,
  overrides: Partial<AdvisorReply> = {},
): AdvisorReply =>
  fakeAdvisorReply({
    text,
    authority,
    // Luot co loi nhan la luot da tra cuu duoc mot nguon he thong (G1). Test nao muon chung minh
    // dieu nguoc lai phai TU truyen `sources: stubEvidence([])`.
    sources: stubEvidence(['Tai lieu da duyet cua san pham (gia lap cho test).']),
    ...overrides,
  });

/** Du kien bao gia — di DOI voi `grantsFromQuote`, khong thay the no. */
const quoteFactsFor = (unitPrice: number): TurnBusinessFacts => ({
  ...NO_BUSINESS_FACTS,
  quote: {
    period: '2026-08',
    qualifier: 'Đây là đơn giá CTV (giá sỉ) áp dụng cho đại lý/CTV theo bảng giá hiện hành.',
    lines: [{ sku: 'FELIX', name: 'Ghế Felix', unit: 'cái', unitPrice }],
  },
});

const policyFactsFor = (policy: PolicyType): TurnBusinessFacts => ({
  ...NO_BUSINESS_FACTS,
  paymentPolicy: { dealerName: 'Meta HN', tier: 'dai_ly', policy },
});

describe('am tinh — ban nhap LLM khong tham quyen khong ra khoi he thong', () => {
  it('1-4. ca goc: intent khac, khong dinh gia, ban nhap cam ket ca tien/chinh sach/don', async () => {
    const { pipeline, channel } = await build(new StubAdvisor(draft(UNSAFE_DRAFT)));

    const view = await pipeline.process(message('cho e hoi chut'));

    // Thu QUAN TRONG NHAT: khong mot ky tu nao ra kenh.
    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: false,
      reason: 'COMPOSITION_EMPTY',
    });
    /*
     * BAN SOAN GHI RO VI SAO, va do la thu doi khac han ban truoc #189.
     *
     * Truoc: cong DOC doan van, thay mot con so, tra ve `FINANCIAL_AUTHORITY_MISSING`. Neu bo trich
     * bo sot con so do thi cau tra loi la CHO GUI.
     * Nay: khong khoi nao dung duoc (luot khong co du kien nao), va loi nhan bi hop dong neo nguon
     * bo — nen khong con gi de gui. Ket qua khong phu thuoc vao viec bo trich nhan ra duoc gi.
     */
    expect(view.trace?.outboundComposition).toMatchObject({
      mode: 'empty',
      blocks: [],
      narrative: { admitted: false, reason: 'NUMERAL_NOT_GROUNDED' },
    });
    expect(view.trace?.outbound).toMatchObject({ ready: false });
    // BAN NHAP GOC van duoc GIU cho nguoi truc doc (muc 5 doi bang chung) — nhung o `trace.reply`,
    // KHONG o `trace.outbound.text`. Do la ca ranh gioi: mot cho de doc, mot cho de gui.
    expect(view.trace?.reply).toContain('990.000đ');
    expect(view.trace?.outbound?.text ?? '').not.toContain('990.000đ');
    expect(view.status).toBe('needs_edit');
  });

  it('2. chi mot con so tien, khong dinh gia -> van chan', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(draft('Dạ cái này 990.000đ anh nhé.')),
    );

    const view = await pipeline.process(message('cai nay bao nhieu'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundComposition?.narrative).toEqual({
      admitted: false,
      reason: 'NUMERAL_NOT_GROUNDED',
    });
    expect(view.trace?.outboundAuthority).toMatchObject({ sendable: false });
  });

  it('3. chi khang dinh chinh sach, khong tra cuu chinh sach -> van chan', async () => {
    const { pipeline, channel } = await build(new StubAdvisor(draft('Dạ bên mình cho công nợ ạ.')));

    const view = await pipeline.process(message('cong no may ngay'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundComposition?.narrative).toEqual({
      admitted: false,
      reason: 'POLICY_CARRIER_NOT_GROUNDED',
    });
  });

  it('4. chi cam ket don, khong co don ben vung -> van chan', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(draft('Dạ em đã chốt đơn cho anh rồi ạ.')),
    );

    const view = await pipeline.process(message('chot cho a nhe'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundComposition?.narrative).toEqual({
      admitted: false,
      reason: 'COMMITMENT_CARRIER_NOT_GROUNDED',
    });
  });

  it('4b. XIN khoi xac nhan don ma khong co don ben vung -> khoi bien mat, khong render', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft('Dạ em kiểm tra giúp mình ngay ạ.', NO_AUTHORITY, {
          plan: { kind: 'order_status', requestedBlocks: ['order_commitment'], narrative: '' },
        }),
      ),
    );

    const view = await pipeline.process(message('don cua a den dau roi'));

    expect(view.trace?.outboundComposition).toMatchObject({
      blocks: [],
      omitted: [{ kind: 'order_commitment', reason: 'FACT_MISSING' }],
    });
    expect(channel.sent[0]?.text ?? '').not.toContain('ghi nhận');
  });

  it('5. co tham quyen tien nhung van xuoi NHAC LAI con so -> phai di qua khoi (G4)', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft('Dạ đơn giá 990.000đ ạ.', mergeAuthority(grantsFromQuote([990_000])), {
          facts: quoteFactsFor(990_000),
        }),
      ),
    );

    const view = await pipeline.process(message('gia bao nhieu'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundComposition?.narrative).toEqual({
      admitted: false,
      reason: 'FINANCIAL_VALUE_IN_NARRATIVE',
    });
  });

  it('5b. co tham quyen chinh sach nhung van xuoi tu viet dieu khoan -> phai di qua khoi (G4)', async () => {
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
    // Ky han "30 ngày" khong co o dau — khong trong nguon, khong trong grant (dai ly nay la 45),
    // khong trong tin khach. Do la mot con so model TU NGHI RA, va G2 bao dung cai do.
    expect(view.trace?.outboundComposition?.narrative).toEqual({
      admitted: false,
      reason: 'NUMERAL_NOT_GROUNDED',
    });
  });

  it('5c. cau chinh sach DUNG nhung do model viet -> van phai di qua khoi (G4)', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft(
          // Khong con so nao, va `payment_policy:cong_no` thi DA duoc cap — tuc cau nay khong sai.
          // No van bi tu choi, vi cau chu ve dieu khoan thuoc bo soan: khoi se noi "Công nợ 45
          // ngày (từ ngày nhận hàng)", con model thi dang noi mot cau khong ky han.
          'Dạ bên mình có cho công nợ ạ.',
          mergeAuthority(grantsFromDealerPolicy('cong_no_45')),
        ),
      ),
    );

    const view = await pipeline.process(message('co cong no khong'));

    expect(channel.sent).toHaveLength(0);
    expect(view.trace?.outboundComposition?.narrative).toEqual({
      admitted: false,
      reason: 'POLICY_STATEMENT_IN_NARRATIVE',
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
  it('8. XIN khoi bao gia + co du kien -> con so tat dinh di toi khach nguyen ven', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft('Dạ em gửi giá cho mình ạ.', mergeAuthority(grantsFromQuote([990_000])), {
          plan: { kind: 'product_advice', requestedBlocks: ['price_quote'], narrative: '' },
          facts: quoteFactsFor(990_000),
        }),
      ),
    );

    const view = await pipeline.process(message('gia bao nhieu'));

    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
    });
    expect(view.trace?.outboundComposition?.mode).toBe('deterministic_business');
    expect(channel.sent).toHaveLength(1);
    // Con so den tay khach do BO SOAN viet ra tu bang gia, khong phai do model go lai.
    expect(channel.sent[0]?.text).toContain('990.000đ');
    expect(view.status).toBe('sent');
  });

  it('9. XIN khoi chinh sach + co cap dai ly -> dung dieu khoan cua chinh ho', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        draft('', mergeAuthority(grantsFromDealerPolicy('cong_no_45')), {
          plan: { kind: 'faq', requestedBlocks: ['payment_policy'], narrative: '' },
          facts: policyFactsFor('cong_no_45'),
        }),
      ),
    );

    const view = await pipeline.process(message('cong no may ngay'));

    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: true,
      reason: 'AUTHORITY_SATISFIED',
    });
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]?.text).toContain('Công nợ 45 ngày');
    expect(channel.sent[0]?.text).not.toContain('30 ngày');
  });

  it('11. cau tu van thuong khong mang khang dinh he qua van gui binh thuong', async () => {
    const { pipeline, channel } = await build(
      new StubAdvisor(
        // #200: cau tra loi trich TRON VEN hai menh de cua nguon, ke ca dau phay ngat giua chung.
        draft('Dạ máy dùng điện 220V, có chế độ ngủ im ạ.', NO_AUTHORITY, {
          sources: stubEvidence(['Máy dùng điện 220V, có chế độ ngủ im.']),
        }),
      ),
    );

    const view = await pipeline.process(message('may nay dung dien bao nhieu'));

    expect(view.trace?.outboundAuthority).toMatchObject({
      sendable: true,
      reason: 'NARRATIVE_ONLY_COMPOSITION',
    });
    expect(channel.sent).toHaveLength(1);
    expect(view.status).toBe('sent');
  });
});
