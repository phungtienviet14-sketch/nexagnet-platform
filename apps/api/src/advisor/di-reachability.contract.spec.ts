import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChannelMessage, ParseResult } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { InMemoryContentRepository } from '../content/content.repository.js';
import { ContentService } from '../content/content.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { SEED } from '../knowledge/seed.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import type { TelemetryRecord, TelemetrySink } from '../observability/telemetry-record.js';
import { InMemoryOrdersRepository } from '../orders/orders.repository.js';
import type { OrderParser, ParserInput } from '../pipeline/order-parser.js';
import { parserProvider } from '../pipeline/parser.provider.js';
import { ClaudeParser } from '../pipeline/claude-parser.js';
import { DeepSeekParser } from '../pipeline/deepseek-parser.js';
import { createAdvisorAgent } from './advisor.provider.js';
import { ClaudeAdvisorAgent, NoopAdvisorAgent, type AdvisorAgent } from './advisor-agent.js';
import { DeepSeekAdvisorAgent } from './deepseek-advisor.js';

/*
 * HOP DONG: mot MA LY DO chi co gia tri neu no CHAY DUOC bang chinh day noi cua san pham.
 *
 * VI SAO FILE NAY TON TAI. `COMPOSER_DISABLED` duoc code goi la "ma quan trong nhat trong ca he
 * thong quan sat" — va no CHUA BAO GIO chay tren stack. Cong viet `if (!this.advisor)`, nhung DI
 * luon tiem mot `AdvisorAgent`; `ADVICE_COMPOSER` rong thi cai duoc tiem la `NoopAdvisorAgent`,
 * khong phai `undefined`. Su co thi hien ra thanh `LLM_RETURNED_NOTHING` — nhan chi nguoi debug ve
 * phia mo hinh, trong khi mo hinh chua he duoc goi.
 *
 * Test cu KHONG bat duoc vi no truyen `advisor: undefined` — mot trang thai KHONG THE xay ra o
 * production. Nen luat cua file nay: **khong dong nao duoc tu tay dung mot advisor/parser**. Moi
 * doi tuong deu phai di ra tu `createAdvisorAgent()` / `parserProvider.useFactory()`, tuc dung hai
 * ham ma `content.module.ts` va `pipeline.module` goi luc boot. Dat sai bien moi truong thi test
 * do — dung nhu stack se sai.
 */

const CHAT_ID = SEED.groups[0]!.chatId;

/** Moi bien mot lan cham vao — luu va tra lai het, de khong ro ri sang file spec khac. */
const ENV_KEYS = [
  'ADVICE_COMPOSER',
  'ADVICE_MODEL',
  'ADVICE_DEEPSEEK_MODEL',
  'PARSER_MODE',
  'PARSER_MODEL',
  'DEEPSEEK_MODEL',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
] as const;

class RecordingSink implements TelemetrySink {
  readonly records: TelemetryRecord[] = [];
  record(record: TelemetryRecord): void {
    this.records.push(record);
  }
}

/** Parser gia CHI de co dinh ket qua parse — no khong phai thu dang duoc kiem o day. */
class FixedResultParser implements OrderParser {
  readonly name = 'fixed';
  constructor(private readonly result: ParseResult) {}
  async parse(_input: ParserInput): Promise<ParseResult> {
    return this.result;
  }
}

const askAboutProduct: ParseResult = { intent: 'hoi_san_pham', confidence: { intent: 0.95 } };

/**
 * Mot don DU DU KIEN de rules engine tinh duoc gia — dieu kien de `orderIsComplete` bat, tuc de
 * `DETERMINISTIC_PATH_SUFFICIENT` chay duoc. Chi mot `intent: 'dat_don'` tay khong thi
 * `dispatch.priced` van `null` va luot do van di qua LLM: do la ca `LLM_RETURNED_NOTHING`, khong
 * phai ca duong tat dinh.
 */
const completeOrder: ParseResult = {
  intent: 'dat_don',
  order: {
    orderType: 'TH1',
    dealerNameRaw: SEED.dealers[0]!.name,
    items: [{ skuRaw: SEED.products[0]!.sku, quantity: 2 }],
    noVat: false,
  },
  confidence: { intent: 0.97 },
};

/**
 * Cau hinh parser HOP LE cho moi luot chay.
 *
 * `loadEnv()` fail-fast khi `PARSER_MODE` (mac dinh `deepseek`) thieu khoa — nen mot moi truong
 * TRONG RONG khong phai la "production voi ban soan tat", no la mot moi truong KHONG THE boot.
 * Day dung la hinh dang cua `ultty-gd1-test` ngay 22/08/2026: parser co khoa, cong tac ban soan rong.
 */
function withWorkingParser(extra: Record<string, string> = {}): void {
  process.env.PARSER_MODE = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'test-deepseek';
  Object.assign(process.env, extra);
}

function message(text: string): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: 'group',
    externalChatId: CHAT_ID,
    text,
    sentAt: new Date(),
  };
}

/**
 * Chay MOT luot qua `AgentOrchestrator` that, voi advisor lay tu DI factory that.
 * Chi `parser` la gia — de luot khong goi mang.
 */
async function runTurn(options: { parsed: ParseResult; text: string }) {
  const sink = new RecordingSink();
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'ultty', environment: 'gd1-test', gitSha: 'a'.repeat(40), source: 'manifest' },
    privacy: 'full',
    sinks: [sink],
  });
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15'));
  const content = new ContentService(new InMemoryContentRepository({}, ['ELNI']));
  await content.reload();
  const advisor = createAdvisorAgent(); // <- day noi PRODUCTION, khong phai doi tuong tu che
  const orchestrator = new AgentOrchestrator(
    new FixedResultParser(options.parsed),
    knowledge,
    new InMemoryOrdersRepository(),
    undefined,
    undefined,
    content,
    advisor,
    undefined,
    telemetry,
  );

  await orchestrator.run(message(options.text));

  const decisions = sink.records.filter(
    (record): record is Extract<TelemetryRecord, { type: 'decision' }> => record.type === 'decision',
  );
  const aiCalls = sink.records.filter(
    (record): record is Extract<TelemetryRecord, { type: 'ai_call' }> => record.type === 'ai_call',
  );
  return {
    advisor,
    compose: decisions.find((d) => d.point === 'advisor.compose'),
    composeCall: aiCalls.find((call) => call.operation === 'compose'),
  };
}

describe('HOP DONG DI: ma ly do phai chay duoc bang day noi that', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('ban soan tu van — `createAdvisorAgent()`', () => {
    /*
     * Bang nay la HOP DONG day du cua cong tac: moi gia tri `ADVICE_COMPOSER` chap nhan duoc, cong
     * hai ca "co cong tac nhung THIEU KHOA" — vi do la cach that ma mot stack bi tat nham.
     */
    it.each([
      ['(rong) — mac dinh', {}, NoopAdvisorAgent, false],
      ['off', { ADVICE_COMPOSER: 'off' }, NoopAdvisorAgent, false],
      ['claude nhung thieu khoa', { ADVICE_COMPOSER: 'claude' }, NoopAdvisorAgent, false],
      ['deepseek nhung thieu khoa', { ADVICE_COMPOSER: 'deepseek' }, NoopAdvisorAgent, false],
      [
        'claude co khoa',
        { ADVICE_COMPOSER: 'claude', ANTHROPIC_API_KEY: 'test-anthropic' },
        ClaudeAdvisorAgent,
        true,
      ],
      [
        'deepseek co khoa',
        { ADVICE_COMPOSER: 'deepseek', DEEPSEEK_API_KEY: 'test-deepseek' },
        DeepSeekAdvisorAgent,
        true,
      ],
    ])('ADVICE_COMPOSER=%s -> %s, composes=%s', (_label, env, expectedClass, expectedComposes) => {
      Object.assign(process.env, env);

      const advisor = createAdvisorAgent();

      expect(advisor).toBeInstanceOf(expectedClass as new (...args: never[]) => AdvisorAgent);
      expect(advisor.composes).toBe(expectedComposes);
    });

    it('thieu khoa cua nha cung cap DA CHON thi KHONG am tham roi sang nha cung cap kia', () => {
      process.env.ADVICE_COMPOSER = 'claude';
      process.env.DEEPSEEK_API_KEY = 'test-deepseek'; // co san, nhung khong duoc dung

      expect(createAdvisorAgent()).toBeInstanceOf(NoopAdvisorAgent);
    });
  });

  describe('`COMPOSER_DISABLED` reachable qua day noi that', () => {
    it('cong tac rong -> COMPOSER_DISABLED, va KHONG co span AI compose gia', async () => {
      // Dung cau hinh cua `ultty-gd1-test` ngay 22/08/2026: parser co khoa, cong tac ban soan rong.
      withWorkingParser();

      const { advisor, compose, composeCall } = await runTurn({
        parsed: askAboutProduct,
        text: 'ELNI co den ngu khong',
      });

      expect(advisor).toBeInstanceOf(NoopAdvisorAgent);
      expect(compose?.outcome).toBe('denied');
      expect(compose?.reason).toBe('COMPOSER_DISABLED');
      // `AI compose noop/noop` la mot ban ghi cho lan goi CHUA HE XAY RA — te hon khong co gi.
      expect(composeCall).toBeUndefined();
    });

    it('bat ban soan that -> KHONG con bao COMPOSER_DISABLED', async () => {
      withWorkingParser({ ADVICE_COMPOSER: 'deepseek' });

      const { advisor, compose } = await runTurn({
        parsed: askAboutProduct,
        text: 'ELNI co den ngu khong',
      });

      expect(advisor.composes).toBe(true);
      // Khoa gia -> lan goi mang that bai -> `LLM_RETURNED_NOTHING`. Dung: co GOI va co HONG.
      // Dieu can khang dinh la hai tinh huong nay KHONG con dung chung mot ma nua.
      expect(compose?.reason).not.toBe('COMPOSER_DISABLED');
    });
  });

  describe('duong tat dinh — `DETERMINISTIC_PATH_SUFFICIENT` reachable', () => {
    it('don da du du kien thi KHONG goi LLM, va ly do noi dung the', async () => {
      // Ban soan BAT HAN HOI — de chung minh viec khong goi LLM la mot QUYET DINH, khong phai
      // hau qua cua viec khong co ban soan nao.
      withWorkingParser({ ADVICE_COMPOSER: 'deepseek' });

      const { compose, composeCall } = await runTurn({
        parsed: completeOrder,
        text: `HN_30.6_${SEED.dealers[0]!.name}, 2 x ${SEED.products[0]!.sku}`,
      });

      expect(compose?.outcome).toBe('denied');
      expect(compose?.reason).toBe('DETERMINISTIC_PATH_SUFFICIENT');
      // Khong duoc lan sang mot ma "loi LLM" nao — day la duong DUNG, khong phai duong hong.
      expect(composeCall).toBeUndefined();
    });
  });

  describe('nhan provider/model cua parser — `parserProvider.useFactory()`', () => {
    const factory = parserProvider as { useFactory: () => OrderParser };

    /*
     * Chong tai pham loi 21/08/2026: trace ghi `deepseek/claude-sonnet-5` — provider dung, model
     * sai, vi orchestrator doc `PARSER_MODEL` (mac dinh cua nhanh Claude) trong khi dang chay
     * DeepSeek. Nhan model sai lam nguoi debug di tim loi o dung mo hinh khong he chay.
     */
    it('DeepSeek bao model cua CHINH no, khong phai PARSER_MODEL cua nhanh Claude', () => {
      process.env.PARSER_MODE = 'deepseek';
      process.env.DEEPSEEK_API_KEY = 'test-deepseek';
      process.env.DEEPSEEK_MODEL = 'deepseek-v4-flash';
      process.env.PARSER_MODEL = 'claude-sonnet-5'; // cai bay: bien cua nhanh kia van co mat

      const parser = factory.useFactory();

      expect(parser).toBeInstanceOf(DeepSeekParser);
      expect(parser.name).toBe('deepseek');
      expect(parser.model).toBe('deepseek-v4-flash');
      expect(parser.model).not.toBe(process.env.PARSER_MODEL);
    });

    it('Claude bao dung model cua no', () => {
      process.env.PARSER_MODE = 'claude';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic';
      process.env.PARSER_MODEL = 'claude-sonnet-5';

      const parser = factory.useFactory();

      expect(parser).toBeInstanceOf(ClaudeParser);
      expect(parser.name).toBe('claude');
      expect(parser.model).toBe('claude-sonnet-5');
    });

    it('moi parser that deu tu khai duoc model — khong con cho nao phai doan', () => {
      process.env.PARSER_MODE = 'deepseek';
      process.env.DEEPSEEK_API_KEY = 'test-deepseek';

      expect(factory.useFactory().model).toBeTruthy();
    });
  });
});
