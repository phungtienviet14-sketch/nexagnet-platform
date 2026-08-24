import { describe, expect, it } from 'vitest';
import type { ChannelMessage, Intent, ParseResult } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import {
  AdvisorAgent,
  NoopAdvisorAgent,
  type AdvisorReply,
  type AdvisorRequest,
} from '../advisor/advisor-agent.js';
import type { LlmUsage } from '../observability/llm-usage.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { InMemoryContentRepository } from '../content/content.repository.js';
import { ContentService } from '../content/content.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { SEED } from '../knowledge/seed.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import type { TelemetryRecord, TelemetrySink } from '../observability/telemetry-record.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import { TurnReplyService } from '../turns/turn-reply.service.js';
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import type { OrderParser, ParserInput } from './order-parser.js';
import { PipelineService } from './pipeline.service.js';

/**
 * CHUNG MINH MUC 36 — "codebase co the lon, nhung nghiep vu phai NHIN DUOC".
 *
 * Day khong phai test cho lop telemetry (da co `observability/*.spec.ts`). Day la test cho cau
 * hoi that: mot nguoi khong thuoc du an, cam mot `traceId`, co doc duoc cau chuyen nghiep vu ma
 * KHONG can mo source khong?
 *
 * Nen moi khang dinh o day deu viet duoi dang mot CAU HOI DEBUG co that, khong phai duoi dang
 * "ham X co goi ham Y".
 */

const CHAT_ID = SEED.groups[0]!.chatId;

class RecordingSink implements TelemetrySink {
  readonly records: TelemetryRecord[] = [];
  record(record: TelemetryRecord): void {
    this.records.push(record);
  }
}

class StubAdvisor extends AdvisorAgent {
  readonly name = 'stub';
  constructor(
    private readonly canned: AdvisorReply | null,
    /** Mot phan tu = mot VONG goi cong cu; agent that bao tung vong, ben goi cong don. */
    private readonly rounds: readonly LlmUsage[] = [],
  ) {
    super();
  }
  async reply(request: AdvisorRequest): Promise<AdvisorReply | null> {
    for (const round of this.rounds) request.reportUsage?.(round);
    return this.canned;
  }
}

class StubParser implements OrderParser {
  readonly name = 'stub';
  constructor(
    private readonly intent: Intent,
    private readonly usage?: LlmUsage,
  ) {}
  async parse(input: ParserInput): Promise<ParseResult> {
    if (this.usage) input.reportUsage?.(this.usage);
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

async function build(options: {
  advisor?: AdvisorAgent;
  intent?: Intent;
  autoSend?: 'on' | 'off';
  parseUsage?: LlmUsage;
}) {
  const sink = new RecordingSink();
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'ultty', environment: 'gd1-test', gitSha: 'c37ee04'.padEnd(40, '0') },
    privacy: 'full',
    sinks: [sink],
  });

  const ordersRepo = new InMemoryOrdersRepository();
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15'));
  const content = new ContentService(new InMemoryContentRepository({}, ['ELNI']));
  await content.reload();
  const orchestrator = new AgentOrchestrator(
    new StubParser(options.intent ?? 'hoi_san_pham', options.parseUsage),
    knowledge,
    ordersRepo,
    undefined,
    undefined,
    content,
    options.advisor,
    undefined,
    telemetry,
  );
  const outbound = new MockAdapter();
  const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
  const turnReply = new TurnReplyService(ordersRepo, router);
  const orders = new OrdersService(ordersRepo, router, undefined, telemetry, undefined, turnReply);
  const settings = { autoSend: () => options.autoSend ?? 'on' } as RuntimeSettingsService;
  const pipeline = new PipelineService(
    orchestrator,
    orders,
    undefined,
    settings,
    undefined,
    knowledge,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    telemetry,
    turnReply,
  );
  return { pipeline, outbound, sink };
}

/** Loc tien: cac cau hoi debug ben duoi deu bat dau bang mot trong ba ham nay. */
const decisions = (sink: RecordingSink) =>
  sink.records.filter((record) => record.type === 'decision') as Extract<
    TelemetryRecord,
    { type: 'decision' }
  >[];
const aiCalls = (sink: RecordingSink) =>
  sink.records.filter((record) => record.type === 'ai_call') as Extract<
    TelemetryRecord,
    { type: 'ai_call' }
  >[];
const steps = (sink: RecordingSink) =>
  sink.records.filter((record) => record.type === 'step') as Extract<
    TelemetryRecord,
    { type: 'step' }
  >[];

describe('CAU HOI: "khach bao bot tra loi sai" — lan tu mot tin ra ca cay xu ly', () => {
  it('mot tin -> MOT traceId, va moi ban ghi cua luot deu mang no', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({
        text: 'Dạ máy có đèn ngủ ạ.',
        usedTools: ['tra_cuu_san_pham'],
        handoff: false,
      }),
    });

    const view = await pipeline.process(message('ELNI co den ngu khong'));

    // Don mang `traceId` -> console co diem xuat phat de lan nguoc (muc 25).
    expect(view?.traceId).toMatch(/^[0-9a-f]{32}$/);
    // …va MOI ban ghi cua luot deu cung mot soi chi.
    expect(new Set(sink.records.map((record) => record.traceId))).toEqual(new Set([view!.traceId]));
    expect(sink.records.length).toBeGreaterThan(3);
  });

  it('doc duoc CAY NGHIEP VU 5-15 buoc, khong phai hang tram span vun', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({ text: 'Dạ có ạ.', usedTools: [], handoff: false }),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    const names = steps(sink).map((step) => step.name);
    // Muc 10: mot luot chay hang chuc ham van chi duoc nhin ra vai buoc nghiep vu.
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.length).toBeLessThanOrEqual(15);
    // Va chung phai la TEN NGHIEP VU, khong phai ten ham tien ich.
    for (const name of names) expect(name).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it('nhin duoc lan goi LLM: provider, model, do tre, cong cu da dung', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({
        text: 'Dạ máy có đèn ngủ ạ.',
        usedTools: ['tra_cuu_san_pham', 'tra_cuu_tai_lieu'],
        handoff: false,
      }),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    const calls = aiCalls(sink);
    // Hai lan goi LLM co that trong mot luot: Router parse + Tu van soan.
    expect(calls.map((call) => call.operation).sort()).toEqual(['compose', 'parse']);

    const compose = calls.find((call) => call.operation === 'compose')!;
    expect(compose.provider).toBe('stub');
    expect(compose.toolNames).toEqual(['tra_cuu_san_pham', 'tra_cuu_tai_lieu']);
    expect(compose.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('moi ban ghi neo duoc vao khach, moi truong va RELEASE dang chay', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({ text: 'Dạ có ạ.', usedTools: [], handoff: false }),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    for (const record of sink.records) {
      expect(record.tenant).toBe('ultty');
      expect(record.environment).toBe('gd1-test');
      // Muc 23: "bug nay xay ra tren commit nao" tra loi duoc ngay tu ban ghi.
      expect(record.release).toBe('c37ee04'.padEnd(12, '0'));
    }
  });
});

describe('CAU HOI: "AI tra loi dung nhung he thong khong gui" — CASE C', () => {
  it('chi ra DUNG dieu kien da chan, thay vi mot chu `false`', async () => {
    const { pipeline, outbound, sink } = await build({
      advisor: new StubAdvisor({
        text: 'Dạ em nhờ Sale kiểm tra lại giúp mình ạ.',
        usedTools: ['tra_cuu_tai_lieu'],
        handoff: true,
      }),
    });

    const view = await pipeline.process(message('ELNI co den ngu khong'));

    expect(view?.status).toBe('needs_edit');
    expect(outbound.sent).toHaveLength(0);

    /*
     * Truoc day day la ngo cut: "khong gui" va het. Nay CAU CHUYEN doc duoc tu HAI ban ghi,
     * theo dung thu tu nhan qua ma code that su chay:
     *
     *   1. `advisor.compose` = COMPOSED, `handoff: 1` — agent CO soan, va tu xin chuyen Sale;
     *   2. `advice.auto_reply` = denied, STATUS_NOT_PENDING_REVIEW — vi buoc 1 da day don ra
     *      khoi `pending_review` TRUOC khi cong tu tra loi kip xet toi co handoff.
     *
     * Thu tu nay quan trong voi nguoi debug: no chi dung THU PHAM (agent xin chuyen) chu khong
     * chi vao trieu chung (trang thai sai). Khang dinh o day co y bam theo hanh vi THAT cua code
     * chu khong bam theo hanh vi ma test muon code co.
     */
    const compose = decisions(sink).find((d) => d.point === 'advisor.compose')!;
    expect(compose.reason).toBe('COMPOSED');
    expect(compose.detail).toMatchObject({ handoff: 1 });

    const autoReply = decisions(sink).find((d) => d.point === 'advice.auto_reply')!;
    expect(autoReply.outcome).toBe('denied');
    expect(autoReply.reason).toBe('STATUS_NOT_PENDING_REVIEW');
  });

  it('phan biet duoc "kill switch tat" voi "agent xin chuyen Sale"', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({ text: 'Dạ có ạ.', usedTools: [], handoff: false }),
      autoSend: 'off',
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    const autoReply = decisions(sink).find((d) => d.point === 'advice.auto_reply')!;
    expect(autoReply.reason).toBe('KILL_SWITCH_OFF');
  });

  /*
   * HAI cach "khong co ban soan", va ca hai phai doc len GIONG NHAU.
   *
   * Ban dau test nay chi chay `advisor: undefined` — mot cau hinh KHONG BAO GIO xay ra tren stack:
   * `content.module.ts` luon tiem mot `AdvisorAgent`, va khi `ADVICE_COMPOSER` rong thi cai duoc
   * tiem la `NoopAdvisorAgent`. Nen test xanh trong khi stack that van ghi sai — do dung cai do
   * duoc tren trace that `6c46754f...` ngay 22/08/2026 (`AI compose noop/noop` +
   * `LLM_RETURNED_NOTHING`, tuc bao "LLM hong" cho mot lan goi chua he xay ra).
   */
  it.each([
    ['NoopAdvisorAgent (dung cai stack that tiem khi ADVICE_COMPOSER rong)', new NoopAdvisorAgent()],
    ['khong tiem advisor nao (CI/demo offline)', undefined],
  ])(
    'SU CO 19/08-21/08: `ADVICE_COMPOSER` rong hien ra thanh mot dong loc duoc — %s',
    async (_label, advisor) => {
      const { pipeline, sink } = await build({ advisor });

      await pipeline.process(message('ELNI co den ngu khong'));

      const compose = decisions(sink).find((d) => d.point === 'advisor.compose')!;
      // Trieu chung ben ngoai ("AI tra loi y het nhau") khong phan biet duoc voi "LLM tra loi kem".
      // Ma nay phan biet duoc: agent CHUA TUNG duoc goi.
      expect(compose.reason).toBe('COMPOSER_DISABLED');
      expect(compose.outcome).toBe('denied');
      // …va dung vay, khong co lan goi LLM `compose` nao ca. Mot ban ghi `AI compose noop/noop` o
      // day con te hon khong co ban ghi nao: no lam nguoi debug tin da co mot lan goi LLM.
      expect(aiCalls(sink).map((call) => call.operation)).not.toContain('compose');
    },
  );

  it('phan biet "LLM khong tra ve gi" (degraded) voi "cong dong co chu y" (denied)', async () => {
    const { pipeline, sink } = await build({ advisor: new StubAdvisor(null) });

    await pipeline.process(message('ELNI co den ngu khong'));

    const compose = decisions(sink).find((d) => d.point === 'advisor.compose')!;
    expect(compose.outcome).toBe('degraded');
    expect(compose.reason).toBe('LLM_RETURNED_NOTHING');
  });
});

describe('CAU HOI: "luot nay dot bao nhieu token, va o dau?"', () => {
  it('ca hai lan goi LLM deu co so token — parse VA compose', async () => {
    const { pipeline, sink } = await build({
      parseUsage: { inputTokens: 2_310, outputTokens: 96 },
      advisor: new StubAdvisor({ text: 'Dạ có ạ.', usedTools: ['tra_cuu_san_pham'], handoff: false }, [
        { inputTokens: 3_100, outputTokens: 120 },
        { inputTokens: 880, outputTokens: 90 },
      ]),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    const parse = aiCalls(sink).find((call) => call.operation === 'parse')!;
    expect(parse.inputTokens).toBe(2_310);
    expect(parse.outputTokens).toBe(96);

    // Agent tu van goi API MOT LAN cho MOI vong cong cu. Chi ghi vong cuoi la bao thieu — hoa don
    // that la tong, va do la con so nguoi doc trace can de tra loi "vi sao thang nay tang tien".
    const compose = aiCalls(sink).find((call) => call.operation === 'compose')!;
    expect(compose.inputTokens).toBe(3_980);
    expect(compose.outputTokens).toBe(210);
  });

  it('LLM tra ve rong van phai ghi token — do la luot dat nhat va de mat dau nhat', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor(null, [{ inputTokens: 4_000, outputTokens: 500 }]),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    const compose = aiCalls(sink).find((call) => call.operation === 'compose')!;
    expect(compose.status).toBe('error');
    expect(compose.inputTokens).toBe(4_000);
    expect(compose.outputTokens).toBe(500);
  });

  it('nha cung cap khong bao gi -> KHONG co truong token, khong phai `0`', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({ text: 'Dạ có ạ.', usedTools: [], handoff: false }),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    // `0 -> 0 tok` doc len giong "lan goi nay mien phi". Vang mat moi la su that.
    for (const call of aiCalls(sink)) {
      expect(call.inputTokens).toBeUndefined();
      expect(call.outputTokens).toBeUndefined();
    }
  });
});

describe('CAU HOI: "vi sao don nay khong tu gui?"', () => {
  it('tra loi bang mot ma, kem so lieu nguong', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({ text: 'Dạ có ạ.', usedTools: [], handoff: false }),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    const autoConfirm = decisions(sink).find((d) => d.point === 'order.auto_confirm')!;
    expect(autoConfirm.outcome).toBe('denied');
    // Tin nay khong phai don -> ly do phai noi dung the, khong phai mot ly do chung chung.
    expect(autoConfirm.reason).toBe('NOT_ORDER_INTENT');
  });

  it('cong quyen GHI cua agent nhin duoc — cap hay khong, va vi sao', async () => {
    const { pipeline, sink } = await build({
      advisor: new StubAdvisor({ text: 'Dạ có ạ.', usedTools: [], handoff: false }),
    });

    await pipeline.process(message('ELNI co den ngu khong'));

    const auth = decisions(sink).find((d) => d.point === 'agent.tool_authorization')!;
    expect(auth.outcome).toBe('denied');
    // Test harness khong cau hinh cong ghi — va trace noi dung nhu vay.
    expect(auth.reason).toBe('WRITE_PORT_ABSENT');
  });
});

describe('BAT BIEN: quan sat hong KHONG duoc lam hong nghiep vu (muc 20)', () => {
  it('sink nem loi o MOI ban ghi — don van chot va van gui duoc', async () => {
    const exploding: TelemetrySink = {
      record(): void {
        throw new Error('kho trace chet');
      },
    };
    const telemetry = new TelemetryService();
    telemetry.configure({
      release: { tenant: 'ultty', environment: 'gd1-test', gitSha: 'unknown' },
      privacy: 'full',
      sinks: [exploding],
    });

    const ordersRepo = new InMemoryOrdersRepository();
    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15'));
    const content = new ContentService(new InMemoryContentRepository({}, ['ELNI']));
    await content.reload();
    const orchestrator = new AgentOrchestrator(
      new StubParser('hoi_san_pham'),
      knowledge,
      ordersRepo,
      undefined,
      undefined,
      content,
      new StubAdvisor({ text: 'Dạ máy có đèn ngủ ạ.', usedTools: [], handoff: false }),
      undefined,
      telemetry,
    );
    const outbound = new MockAdapter();
    const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
    const turnReply = new TurnReplyService(ordersRepo, router);
    const pipeline = new PipelineService(
      orchestrator,
      new OrdersService(ordersRepo, router, undefined, telemetry, undefined, turnReply),
      undefined,
      { autoSend: () => 'on' } as RuntimeSettingsService,
      undefined,
      knowledge,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      telemetry,
      turnReply,
    );

    const view = await pipeline.process(message('ELNI co den ngu khong'));

    // Nghiep vu di het duong, y het khi khong co su co quan sat nao.
    expect(view?.status).toBe('sent');
    expect(outbound.sent).toHaveLength(1);
    expect(outbound.sent[0]?.text).toContain('đèn ngủ');
  });

  it('KHONG co telemetry -> pipeline chay y het (moi test cu khong phai doi mot dong)', async () => {
    const ordersRepo = new InMemoryOrdersRepository();
    const knowledge = new KnowledgeService(undefined, new Date('2026-08-15'));
    const content = new ContentService(new InMemoryContentRepository({}, ['ELNI']));
    await content.reload();
    const orchestrator = new AgentOrchestrator(
      new StubParser('hoi_san_pham'),
      knowledge,
      ordersRepo,
      undefined,
      undefined,
      content,
      new StubAdvisor({ text: 'Dạ máy có đèn ngủ ạ.', usedTools: [], handoff: false }),
    );
    const outbound = new MockAdapter();
    const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
    const turnReply = new TurnReplyService(ordersRepo, router);
    const pipeline = new PipelineService(
      orchestrator,
      new OrdersService(ordersRepo, router, undefined, undefined, undefined, turnReply),
      undefined,
      { autoSend: () => 'on' } as RuntimeSettingsService,
      undefined,
      knowledge,
      undefined, // groupDiscovery
      undefined, // media
      undefined, // conversationContext
      undefined, // conversations
      undefined, // burstWindowMs
      undefined, // telemetry
      turnReply,
    );

    const view = await pipeline.process(message('ELNI co den ngu khong'));

    expect(view?.status).toBe('sent');
    expect(view?.traceId).toBeUndefined();
    expect(outbound.sent).toHaveLength(1);
  });
});
