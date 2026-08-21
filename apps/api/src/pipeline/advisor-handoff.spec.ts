import { describe, expect, it } from 'vitest';
import type { ChannelMessage, Intent, ParseResult } from '@netviet/shared';
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
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import type { OrderParser } from './order-parser.js';
import { PipelineService } from './pipeline.service.js';

/**
 * CAU HOI NOI TIEP PHAI DUOC TU TRA LOI.
 *
 * Khach test that (21/08/2026): hoi "thong so day du BB-GREY" -> bot tra loi dung. Roi hoi tiep
 * "co den ngu khong", "bao hanh bao lau", "loc duoc bao nhieu m2" -> IM LANG, day het sang Sale.
 *
 * Nguyen nhan: `dispatch()` cham `handoff`/`needs_edit` bang cong TAT DINH chi nhin van ban tin
 * HIEN TAI. Cau noi tiep khong nhac ten SP -> khong khop danh muc -> handoff. Sau do agent LLM
 * (co cong cu, co lich su) tra loi DUNG, nhung `markComposedRole` GIU LAI co handoff cu va khong
 * ai keo `status` ve `pending_review`, nen `shouldAutoReplyProduct` khong bao gio ban.
 *
 * Bat bien phai giu: LLM tu nhan khong tra loi duoc (`handoff: true`) thi VAN chuyen Sale.
 */

const CHAT_ID = SEED.groups[0]!.chatId;

class StubAdvisor extends AdvisorAgent {
  readonly name = 'stub';
  constructor(private readonly canned: AdvisorReply | null) {
    super();
  }
  async reply(): Promise<AdvisorReply | null> {
    return this.canned;
  }
}

/**
 * Parser co dinh intent. Dung thay `FakeParser` co chu y: heuristic tu khoa cua mock phan loai
 * "ELNI co den ngu khong" thanh `dat_don` (co ten SP, khong khop bo tu khoa cau hoi) — mot dac
 * tinh cua mock, khong phai cua he thong that. Test nay do CHOT CHAN HANDOFF, khong do bo phan
 * loai intent, nen no phai co dinh dau vao do.
 */
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

async function build(advisor: AdvisorAgent, intent: Intent = 'hoi_san_pham') {
  const ordersRepo = new InMemoryOrdersRepository();
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15'));
  // Kho noi dung RONG co chu y: day chinh la canh cong tat dinh keu "chua co tai lieu duyet".
  const content = new ContentService(new InMemoryContentRepository({}, ['ELNI']));
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
  const outbound = new MockAdapter();
  const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
  const orders = new OrdersService(ordersRepo, router);
  const settings = { autoSend: () => 'on' } as RuntimeSettingsService;
  const pipeline = new PipelineService(
    orchestrator,
    orders,
    undefined,
    settings,
    undefined,
    knowledge,
  );
  return { pipeline, outbound };
}

describe('agent tu van ghi de phan quyet handoff tat dinh', () => {
  it('tu tra loi cau hoi san pham khi LLM da soan xong, du cong tat dinh doi chuyen Sale', async () => {
    const { pipeline, outbound } = await build(
      new StubAdvisor({
        text: 'Dạ máy có đèn ngủ ạ, đèn khí quyển học dùng làm đèn trang trí buổi tối ạ.',
        usedTools: ['tra_cuu_san_pham', 'tra_cuu_tai_lieu'],
        handoff: false,
      }),
    );

    const view = await pipeline.process(message('ELNI co den ngu khong'));

    expect(view.status).toBe('sent');
    expect(outbound.sent).toHaveLength(1);
    expect(outbound.sent[0]?.text).toContain('đèn ngủ');
  });

  it('tu tra loi cau hoi CHINH SACH bao hanh (khong phai khieu nai may hong)', async () => {
    const { pipeline, outbound } = await build(
      new StubAdvisor({
        text: 'Dạ sản phẩm được bảo hành 12 tháng kể từ ngày mua ạ.',
        usedTools: ['tra_cuu_tai_lieu'],
        handoff: false,
      }),
      'bao_hanh_khieu_nai',
    );

    const view = await pipeline.process(message('ELNI duoc bao hanh bao lau'));

    expect(view.status).toBe('sent');
    expect(outbound.sent).toHaveLength(1);
    expect(outbound.sent[0]?.text).toContain('12 tháng');
  });

  it('VAN chuyen Sale khi chinh LLM tu nhan khong tra loi duoc', async () => {
    const { pipeline, outbound } = await build(
      new StubAdvisor({
        text: 'Dạ em nhờ Sale kiểm tra lại giúp mình ạ.',
        usedTools: ['tra_cuu_tai_lieu'],
        handoff: true,
      }),
    );

    const view = await pipeline.process(message('ELNI co den ngu khong'));

    expect(view.status).toBe('needs_edit');
    expect(outbound.sent).toHaveLength(0);
  });

  it('VAN chuyen Sale khi khong co agent tu van nao chay duoc', async () => {
    const { pipeline, outbound } = await build(new StubAdvisor(null));

    const view = await pipeline.process(message('ELNI co den ngu khong'));

    expect(view.status).toBe('needs_edit');
    expect(outbound.sent).toHaveLength(0);
  });
});
