import { describe, expect, it } from 'vitest';
import type { ChannelMessage, OrderView } from '@netviet/shared';
import { AgentOrchestrator } from '../agents/agent-orchestrator.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { SEED } from '../knowledge/seed.js';
import { PipelineService } from './pipeline.service.js';

/**
 * NHIEU KHACH CUNG LUC TRONG MOT NHOM.
 *
 * Hai yeu cau nguoc chieu nhau, va he thong phai giu ca hai:
 *  - Tin cua CUNG mot khach phai chay TUAN TU. Mach hoi thoai la doc-sua-ghi quanh mot lan goi
 *    LLM keo dai vai giay; hai luot chong nhau se ghi de mat don nhap cua nhau.
 *  - Tin cua CAC KHACH KHAC NHAU phai chay SONG SONG. Mot nhom co 200 dai ly; bat ho xep hang
 *    sau nhau nghia la nguoi thu hai doi vai giay chi vi nguoi thu nhat dang duoc tra loi.
 */

const CHAT_ID = SEED.groups[0]!.chatId;

function message(senderExternalId: string, text: string): ChannelMessage {
  return {
    externalMessageId: `m-${Math.random()}`,
    platform: 'zalo',
    source: 'copilot_paste',
    chatType: 'group',
    externalChatId: CHAT_ID,
    senderExternalId,
    text,
    sentAt: new Date(),
  };
}

/** Orchestrator gia: ghi lai thu tu vao/ra de doc duoc su chong lan. */
class TracingOrchestrator {
  readonly events: string[] = [];
  private release: (() => void)[] = [];

  async run(msg: ChannelMessage): Promise<OrderView> {
    const who = msg.senderExternalId ?? 'anon';
    this.events.push(`vao:${who}:${msg.text}`);
    await new Promise<void>((resolve) => this.release.push(resolve));
    this.events.push(`ra:${who}:${msg.text}`);
    return {
      id: `o-${Math.random()}`,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
      chatId: msg.externalChatId,
      rawText: msg.text,
      intent: 'khac',
      parsed: null,
      priced: null,
      confidence: {},
      ...(msg.senderExternalId ? { senderExternalId: msg.senderExternalId } : {}),
    };
  }

  /** Cho tat ca luot dang cho chay tiep. */
  flush(): void {
    const pending = this.release;
    this.release = [];
    for (const resolve of pending) resolve();
  }

  get inFlight(): number {
    return this.release.length;
  }
}

function build(orchestrator: TracingOrchestrator) {
  const knowledge = new KnowledgeService(undefined, new Date('2026-08-15'));
  return new PipelineService(
    orchestrator as unknown as AgentOrchestrator,
    undefined,
    undefined,
    undefined,
    undefined,
    knowledge,
  );
}

/** Cho microtask queue chay het, de duoi cho kip xep xong. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('nhieu khach trong mot nhom', () => {
  it('tin cua CUNG mot khach chay tuan tu, khong chong nhau', async () => {
    const orchestrator = new TracingOrchestrator();
    const pipeline = build(orchestrator);

    const first = pipeline.process(message('uid-viet', 'tin 1'));
    const second = pipeline.process(message('uid-viet', 'tin 2'));
    await settle();

    // Chi luot DAU duoc vao; luot sau phai dung o duoi cho.
    expect(orchestrator.inFlight).toBe(1);

    orchestrator.flush();
    await first;
    await settle();
    orchestrator.flush();
    await second;

    expect(orchestrator.events).toEqual([
      'vao:uid-viet:tin 1',
      'ra:uid-viet:tin 1',
      'vao:uid-viet:tin 2',
      'ra:uid-viet:tin 2',
    ]);
  });

  it('tin cua HAI khach khac nhau chay song song', async () => {
    const orchestrator = new TracingOrchestrator();
    const pipeline = build(orchestrator);

    const viet = pipeline.process(message('uid-viet', 'hoi ELNI'));
    const hung = pipeline.process(message('uid-hung', 'hoi Felix'));
    await settle();

    // CA HAI cung o trong orchestrator — khong ai phai doi ai.
    expect(orchestrator.inFlight).toBe(2);

    orchestrator.flush();
    const [a, b] = await Promise.all([viet, hung]);

    expect(a.senderExternalId).toBe('uid-viet');
    expect(b.senderExternalId).toBe('uid-hung');
    expect(a.rawText).toBe('hoi ELNI');
    expect(b.rawText).toBe('hoi Felix');
  });

  it('mot luot hong khong lam ket duoi cho cua nguoi do', async () => {
    const orchestrator = new TracingOrchestrator();
    const pipeline = build(orchestrator);
    let firstCall = true;
    const original = orchestrator.run.bind(orchestrator);
    orchestrator.run = async (msg: ChannelMessage) => {
      if (firstCall) {
        firstCall = false;
        throw new Error('LLM sap');
      }
      return original(msg);
    };

    await expect(pipeline.process(message('uid-viet', 'tin hong'))).rejects.toThrow('LLM sap');

    // Duoi cho van chay tiep cho tin sau cua CHINH nguoi do.
    const next = pipeline.process(message('uid-viet', 'tin sau'));
    await settle();
    orchestrator.flush();
    await expect(next).resolves.toMatchObject({ rawText: 'tin sau' });
  });
});
