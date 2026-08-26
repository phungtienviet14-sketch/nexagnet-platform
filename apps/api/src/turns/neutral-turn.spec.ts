import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';

/*
 * KHACH TRUNG TINH — mot to ho tro, khong ban gi.
 *
 * Goi khach phai duoc chon TRUOC khi bat ky module nao cham vao `@netviet/tenant` (`seed.ts` nap
 * nguon su that ngay luc import). Vi vay file nay KHONG import tinh thu gi cua app: moi thu duoc
 * `await import()` ben trong `beforeAll`, sau dong gan bien duoi day.
 */
process.env.TENANT_DIR = fileURLToPath(
  new URL('../../../../packages/tenant/src/__tests__/fixtures/neutral-turn', import.meta.url),
);
process.env.CHANNEL_MODE = 'mock';

const CHAT_ID = 'group-neutral-1';

interface Harness {
  process: (text: string) => Promise<{ id: string; status: string; intent: string } | null>;
  sent: { text: string }[];
  turns: { list: () => Promise<unknown[]> };
  decisions: () => { point: string; outcome: string; reason: string }[];
  steps: () => string[];
}

let build: (options?: { autoSend?: 'on' | 'off' }) => Promise<Harness>;

beforeAll(async () => {
  const [
    { AgentOrchestrator },
    { MockAdapter },
    { OutboundChannelRouter },
    { InMemoryContentRepository },
    { ContentService },
    { KnowledgeService },
    { FakeParser },
    { PipelineService },
    { ConversationContextBuilder },
    { InMemoryMessagesRepository },
    { TurnRecordsRepository, InMemoryTurnRecordsRepository },
    { TurnReplyService },
    { TelemetryService },
  ] = await Promise.all([
    import('../agents/agent-orchestrator.service.js'),
    import('../channels/mock.adapter.js'),
    import('../channels/outbound-channel.router.js'),
    import('../content/content.repository.js'),
    import('../content/content.service.js'),
    import('../knowledge/knowledge.service.js'),
    import('../pipeline/__tests__/fake-parser.js'),
    import('../pipeline/pipeline.service.js'),
    import('../messages/conversation-context.js'),
    import('../messages/messages.repository.js'),
    import('./turn-records.repository.js'),
    import('./turn-reply.service.js'),
    import('../observability/telemetry.service.js'),
  ]);
  void TurnRecordsRepository;

  build = async (options = {}) => {
    const records: Record<string, unknown>[] = [];
    const telemetry = new TelemetryService();
    telemetry.configure({
      release: { tenant: 'neutral-turn', environment: 'test', gitSha: 'a'.repeat(40), source: 'manifest' },
      privacy: 'full',
      sinks: [{ record: (entry: unknown) => void records.push(entry as Record<string, unknown>) }],
    } as never);

    const knowledge = new KnowledgeService();
    const content = new ContentService(
      new InMemoryContentRepository(activeContent(), ['DV-01']) as never,
    );
    await content.reload();

    const turns = new InMemoryTurnRecordsRepository();
    const messages = new InMemoryMessagesRepository();
    const orchestrator = new AgentOrchestrator(
      new FakeParser(),
      knowledge,
      turns,
      undefined,
      undefined,
      content,
      undefined,
      undefined,
      telemetry,
    );
    const bot = new MockAdapter();
    const zca = new MockAdapter();
    const mock = new MockAdapter();
    const router = new OutboundChannelRouter(bot, zca, mock, undefined, telemetry);
    const turnReply = new TurnReplyService(turns, router);
    const pipeline = new PipelineService(
      orchestrator,
      undefined, // orders — KHONG CO: khach nay khong ban gi
      messages,
      { autoSend: () => options.autoSend ?? 'on' } as never,
      undefined, // participants
      knowledge,
      undefined, // groupDiscovery
      undefined, // media
      new ConversationContextBuilder(messages),
      undefined, // conversations
      undefined, // burstWindowMs
      telemetry,
      turnReply,
    );

    return {
      process: async (text: string) => {
        const result = await pipeline.intake(message(text));
        return (result.view ?? null) as never;
      },
      sent: mock.sent as { text: string }[],
      turns,
      decisions: () =>
        records.filter((r) => r.type === 'decision') as unknown as {
          point: string;
          outcome: string;
          reason: string;
        }[],
      steps: () => records.filter((r) => r.type === 'step').map((r) => String(r.name)),
    };
  };
});

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

describe('mot luot TRUNG TINH — khach khong ban gi', () => {
  it('nhan tin -> luu -> dung ngu canh -> chay AI -> dung tri thuc -> tra loi ra kenh', async () => {
    const harness = await build();

    const view = await harness.process('goi bao tri co tot khong');

    // 1. Luot da duoc xu ly va LUU — khong phai `stored_only`.
    expect(view).not.toBeNull();
    expect(await harness.turns.list()).toHaveLength(1);
    // 2. AI da phan loai duoc y dinh (khong phai dat_don).
    expect(view!.intent).not.toBe('dat_don');
    // 3. Cau tra loi DA RA KENH — day la thu ma truoc ban nay khach khong ban hang khong lam duoc.
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]!.text).toContain('Lau bang khan mem');
    expect(view!.status).toBe('sent');
  });

  it('trace cua khach trung tinh co cay CO NGHIA, khong phai mot vet trong', async () => {
    const harness = await build();
    await harness.process('goi bao tri co tot khong');

    const steps = harness.steps();
    expect(steps).toContain('message.persist');
    expect(steps).toContain('outbound.send_advice');

    const decisions = harness.decisions();
    const points = decisions.map((d) => d.point);
    expect(points).toContain('message.intake');
    expect(points).toContain('advice.auto_reply');
    expect(points).toContain('channel.send');
    expect(decisions.find((d) => d.point === 'message.intake')?.reason).toBe('ACCEPTED');
    expect(decisions.find((d) => d.point === 'advice.auto_reply')?.outcome).toBe('allowed');
  });

  it('kill switch tat -> luot van chay va van luu, chi khong gui', async () => {
    const harness = await build({ autoSend: 'off' });

    const view = await harness.process('goi bao tri co tot khong');

    expect(view).not.toBeNull();
    expect(await harness.turns.list()).toHaveLength(1);
    expect(harness.sent).toHaveLength(0);
    expect(harness.decisions().find((d) => d.point === 'advice.auto_reply')?.reason).toBe(
      'KILL_SWITCH_OFF',
    );
  });
});

function activeContent() {
  return {
    provenance: [],
    assets: [],
    faqs: [
      {
        id: 'faq-1',
        externalId: 'neutral-faq',
        productSku: 'DV-01',
        question: 'Co tot khong?',
        answer: 'Lau bang khan mem.',
        status: 'active' as const,
        operatorEdited: false,
      },
    ],
    advice: [],
    links: [],
    readiness: [],
  };
}
