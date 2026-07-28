import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadType, type Message } from 'zca-js';
import type { OrderView, Intent } from '@ultty/shared';
import type { ChannelAdapter } from '../channels/channel-adapter.js';
import type { ZaloUserClient, ZcaMessageHandler } from '../channels/zalo-user.client.js';
import type { PipelineService } from '../pipeline/pipeline.service.js';
import { AUTO_ACK_TEXT } from './bot-poller.js';
import { ZcaListener } from './zca-listener.js';

function makeZcaMessage(msgId: string, content = 'gui 10 ghe felix', threadId = 'zgr-x'): Message {
  return {
    type: ThreadType.Group,
    threadId,
    isSelf: false,
    data: { msgId, content, uidFrom: 'u1', dName: 'A', ts: '1783404428055' },
  } as unknown as Message;
}

/** Dung listener + fake deps; tra ve handler ma ingest da dang ky (de tu goi). */
function setup(intent: Intent = 'dat_don') {
  let captured: ZcaMessageHandler | undefined;
  const process = vi.fn(async (): Promise<OrderView> => ({ intent }) as OrderView);
  const sendMessage = vi.fn(async (_chatId: string, _text: string): Promise<void> => undefined);
  const client = { setMessageHandler: (h: ZcaMessageHandler) => (captured = h) } as unknown as ZaloUserClient;
  const pipeline = { process } as unknown as PipelineService;
  const channel = { sendMessage } as unknown as ChannelAdapter;
  const listener = new ZcaListener(pipeline, client, channel);
  listener.onModuleInit();
  return { getHandler: () => captured, process, sendMessage };
}

describe('ZcaListener', () => {
  const KEYS = ['CHANNEL_MODE', 'AUTO_ACK'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.CHANNEL_MODE = 'zca';
    process.env.AUTO_ACK = 'off';
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  it('CHANNEL_MODE != zca -> khong dang ky handler', () => {
    process.env.CHANNEL_MODE = 'mock';
    const { getHandler } = setup();
    expect(getHandler()).toBeUndefined();
  });

  it('chong trung: cung msgId 2 lan -> pipeline.process chi chay 1 lan', async () => {
    const { getHandler, process } = setup();
    const handler = getHandler()!;
    await handler(makeZcaMessage('a'));
    await handler(makeZcaMessage('a'));
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('cung 1 tin ban 2 lan SONG SONG -> chi xu ly 1 lan', async () => {
    const { getHandler, process } = setup();
    const handler = getHandler()!;
    await Promise.all([handler(makeZcaMessage('a')), handler(makeZcaMessage('a'))]);
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('pipeline loi TAM THOI -> tu thu lai va xu ly thanh cong (khong mat tin)', async () => {
    const { getHandler, process } = setup();
    (process as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('LLM timeout'));
    const handler = getHandler()!;
    await expect(handler(makeZcaMessage('a'))).resolves.toBeUndefined();
    expect(process).toHaveBeenCalledTimes(2); // 1 goc + 1 lan thu lai
  });

  it('pipeline loi HET LUOT -> KHONG danh dau da xu ly, tin den lai thi VAN chay lai', async () => {
    const { getHandler, process } = setup();
    (process as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM chet han'));
    const handler = getHandler()!;
    await expect(handler(makeZcaMessage('a'))).resolves.toBeUndefined();
    expect(process).toHaveBeenCalledTimes(3); // 1 goc + 2 lan thu lai
    // Truoc day tin bi danh dau NGAY TRUOC khi xu ly -> mat don im lang. Gio phai chay lai duoc.
    await handler(makeZcaMessage('a'));
    expect(process).toHaveBeenCalledTimes(6);
  });

  it('AUTO_ACK=on + intent=khac -> gui auto-ack 1 lan (kem nhan tu dong)', async () => {
    process.env.AUTO_ACK = 'on';
    const { getHandler, sendMessage } = setup('khac');
    await getHandler()!(makeZcaMessage('a'));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![1]).toContain(AUTO_ACK_TEXT);
  });

  it('AUTO_ACK=on nhung intent=dat_don (da hieu) -> KHONG auto-ack', async () => {
    process.env.AUTO_ACK = 'on';
    const { getHandler, sendMessage } = setup('dat_don');
    await getHandler()!(makeZcaMessage('a'));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('gui auto-ack loi -> nuot loi, khong throw ra listener', async () => {
    process.env.AUTO_ACK = 'on';
    const { getHandler, sendMessage } = setup('khac');
    sendMessage.mockRejectedValueOnce(new Error('rate limit'));
    await expect(getHandler()!(makeZcaMessage('a'))).resolves.toBeUndefined();
  });

  it('chan phinh: qua MAX_SEEN thi bo id cu nhat (id dau xu ly lai duoc, id moi thi khong)', async () => {
    const { getHandler, process } = setup();
    const handler = getHandler()!;
    for (let i = 0; i < 2001; i++) {
      await handler(makeZcaMessage(`id-${i}`));
    }
    expect(process).toHaveBeenCalledTimes(2001);
    // id-0 da bi evict -> xu ly lai; id-2000 con trong seen -> khong xu ly lai.
    await handler(makeZcaMessage('id-0'));
    await handler(makeZcaMessage('id-2000'));
    expect(process).toHaveBeenCalledTimes(2002);
  });
});
