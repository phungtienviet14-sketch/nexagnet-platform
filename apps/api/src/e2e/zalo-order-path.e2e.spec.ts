/**
 * G1-13 — E2E duong tin Zalo tren DO THI DI THAT.
 *
 * VI SAO TON TAI: moi spec khac trong repo dung `new Service(...)`, nen chung minh duoc TUNG
 * manh nhung khong manh nao chung minh CA DUONG. Ba loi boot cua Dot D lot qua toan bo suite
 * dung vi ly do do. Bai nay dung dung container Nest nhu luc chay that
 * (`AppModule.forRoot()` + `NestFactory.createApplicationContext`).
 *
 * DA THAY (dung MOT bien gioi — mang cua Zalo):
 *   ZaloUserClient.setMessageHandler · isGroupAllowed · sendMessage
 * GIU THAT (tat ca phan con lai, lay tu container):
 *   ZcaListener -> MessageGuard -> PipelineService -> MessagesRepository -> AgentOrchestrator
 *   (6 vai) -> parser -> rules engine -> OrdersService -> OutboundChannelRouter -> ZcaAdapter.
 *
 * PHAN KHONG THE TU DONG HOA O DAY: dang nhap tai khoan Zalo that (D16 van ban chap nhan rui ro
 * ToS + D20 ai dung ten tai khoan phu) va credential. Do la CHAN NGOAI, khong phai thieu test —
 * moi thu nam duoi lop dang nhap deu da duoc chay o day.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Phai dat TRUOC khi container duoc tao: RuntimeSettingsService/ZaloUserClient doc env ngay luc
// construct. (Import ESM da chay xong truoc than module nay, nen `tmpdir` dung duoc o day.)
process.env.PERSISTENCE = 'memory';
process.env.CHANNEL_MODE = 'zca';
process.env.AUTO_SEND = 'on';
process.env.PARSER_MODE = 'mock';
process.env.STREAM_STEP_DELAY_MS = '0';
process.env.TENANT ??= 'ultty';
// Cach ly tuyet doi khoi phien Zalo that cua may dev: tro credential/allowlist vao thu muc tam
// KHONG ton tai. Neu tro vao ./secrets that, `connect(false)` se dang nhap Zalo THAT khi chay test.
const SECRETS_SANDBOX = join(tmpdir(), `netviet-e2e-${process.pid}`);
process.env.ZALO_CRED_PATH = join(SECRETS_SANDBOX, 'zalo-cred.json');
process.env.ZALO_ALLOWED_GROUPS_PATH = join(SECRETS_SANDBOX, 'zalo-allowed-groups.json');

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ThreadType, type Message } from 'zca-js';
import { AppModule } from '../app.module.js';
import { BotIdentityService } from '../channels/bot-identity.service.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { ZaloUserClient, type ZcaMessageHandler } from '../channels/zalo-user.client.js';
import { ZcaListener } from '../ingest/zca-listener.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { MessagesRepository } from '../messages/messages.repository.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

/** Gia si FELIX trong ky gia dang active cua goi khach — doi chieu so tien rules engine tinh ra. */
const FELIX_WHOLESALE = 1_250_000;

/** Tin Zalo tho nhu zca-js ban ra. Giu dung hinh dang that: `ts` la epoch-ms DANG CHUOI. */
function zaloMessage(msgId: string, content: string, threadId: string): Message {
  return {
    type: ThreadType.Group,
    threadId,
    isSelf: false,
    data: { msgId, content, uidFrom: 'u-dai-ly-1', dName: 'Chi Lan', ts: '1783404428055' },
  } as unknown as Message;
}

/**
 * Bien gioi mang gia. Chi ba viec: nhan handler cua listener, tra loi allowlist cua operator,
 * va ghi lai tin gui ra thay vi ban len Zalo.
 */
interface FakeTransport {
  handler: ZcaMessageHandler | undefined;
  readonly sent: { chatId: string; text: string }[];
  deliver(message: Message): Promise<void>;
}

describe('G1-13 — E2E tin Zalo -> DB -> parser -> rules -> outbound (DI that)', () => {
  let ctx: INestApplicationContext;
  let transport: FakeTransport;
  let mappedGroup: string;

  /** Dung listener MOI tren cung container — mo phong tien trinh khoi dong lai (guard rong). */
  function freshListener(): void {
    new ZcaListener(
      ctx.get(PipelineService),
      ctx.get(ZaloUserClient),
      ctx.get(OutboundChannelRouter),
      ctx.get(BotIdentityService),
    ).onModuleInit();
  }

  function orders() {
    return ctx.get(OrdersRepository).list();
  }

  beforeAll(async () => {
    ctx = await NestFactory.createApplicationContext(await AppModule.forRoot(), {
      logger: ['error'],
    });

    const sent: { chatId: string; text: string }[] = [];
    const fake: FakeTransport = {
      handler: undefined,
      sent,
      async deliver(message) {
        await fake.handler?.(message);
      },
    };
    // Ghi de tren CHINH the hien trong container: ZcaAdapter da giu tham chieu toi no, nen ca
    // duong doc lan duong gui deu di qua transport gia ma khong phai thay provider nao.
    const client = ctx.get(ZaloUserClient);
    client.setMessageHandler = (handler: ZcaMessageHandler) => {
      fake.handler = handler;
    };
    client.isGroupAllowed = () => true;
    client.sendMessage = async (chatId: string, text: string) => {
      sent.push({ chatId, text });
      return {};
    };
    transport = fake;

    mappedGroup = ctx
      .get(KnowledgeService)
      .groups()
      .find((group) => group.dealerId === 'meta-hn')!.chatId;
    freshListener();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('don hop le trong nguong tenant: tin -> DB -> don `sent` -> outbound co nhan tu dong', async () => {
    const before = transport.sent.length;
    await transport.deliver(zaloMessage('e2e-ok-1', 'gui 10 ghe felix', mappedGroup));

    const stored = await ctx.get(MessagesRepository).findByExternalMessage('zalo', 'e2e-ok-1');
    const view = (await orders()).find((order) => order.rawText === 'gui 10 ghe felix');

    // Tin tho phai co trong kho TRUOC moi thu khac (CLAUDE.md: luu ngay khi nhan).
    expect(stored?.text).toBe('gui 10 ghe felix');
    expect(view?.intent).toBe('dat_don');
    // Rules engine tinh tien chu khong phai LLM: 10 x gia si FELIX cua ky gia dang active.
    expect(view?.priced?.lines).toHaveLength(1);
    expect(view?.priced?.itemsSubtotal).toBe(10 * FELIX_WHOLESALE);
    expect(view?.priced?.warnings).toEqual([]);
    // Dai ly duoc suy tu map nhom, khong phai tu chu trong tin.
    expect(view?.dealerName).toBe('Meta HN');
    // GĐ1 dung o `sent` + giao viec Sale nhap ERP tay; KHONG goi ERP.
    expect(view?.status).toBe('sent');
    expect(view?.erpCode).toBeUndefined();
    expect(view?.salesHandoff).toMatchObject({ action: 'manual_erp_entry', status: 'pending' });
    // Gui ra DUNG MOT lan, dung kenh da nhan tin (zca), co nhan noi dung tu dong theo dieu khoan
    // Zalo. Dem theo moc `before` chu khong theo so tuyet doi: bai nay khong duoc phu thuoc vao
    // viec no chay dau tien trong file.
    expect(transport.sent).toHaveLength(before + 1);
    expect(transport.sent[before]!.chatId).toBe(mappedGroup);
    expect(transport.sent[before]!.text).toContain('Tin tự động');
  }, 30_000);

  it('vuot nguong tenant: KHONG gui gi, giu Sale can thiep truoc outbound', async () => {
    const before = transport.sent.length;
    await transport.deliver(zaloMessage('e2e-over-1', 'gui 51 ghe felix', mappedGroup));

    const view = (await orders()).find((order) => order.rawText === 'gui 51 ghe felix');
    expect(view?.priced?.lines[0]?.quantity).toBe(51);
    expect(view?.status).not.toBe('sent');
    expect(view?.salesHandoff).toBeUndefined();
    expect(transport.sent).toHaveLength(before);
  }, 30_000);

  it('nhom chua map nguon su that: tin VAN vao DB, khong tao don, khong gui gi (bat bien I1)', async () => {
    const before = { sent: transport.sent.length, orders: (await orders()).length };
    await transport.deliver(zaloMessage('e2e-unmapped-1', 'gui 5 ghe felix', 'zgr-chua-map'));

    const stored = await ctx
      .get(MessagesRepository)
      .findByExternalMessage('zalo', 'e2e-unmapped-1');
    expect(stored?.externalChatId).toBe('zgr-chua-map');
    expect((await orders()).length).toBe(before.orders);
    expect(transport.sent).toHaveLength(before.sent);
  }, 30_000);

  it('tin trung trong cung tien trinh: chi mot don, chi mot lan gui', async () => {
    const before = { sent: transport.sent.length, orders: (await orders()).length };
    await transport.deliver(zaloMessage('e2e-dup-1', 'gui 3 ghe felix', mappedGroup));
    await transport.deliver(zaloMessage('e2e-dup-1', 'gui 3 ghe felix', mappedGroup));

    expect((await orders()).length).toBe(before.orders + 1);
    expect(transport.sent).toHaveLength(before.sent + 1);
  }, 30_000);

  it('KHOI DONG LAI: guard trong bo nho mat het, kho tin ben vung moi la cong chong trung', async () => {
    await transport.deliver(zaloMessage('e2e-restart-1', 'gui 4 ghe felix', mappedGroup));
    const after = { sent: transport.sent.length, orders: (await orders()).length };

    // Listener moi = MessageGuard rong. Neu chong trung chi dua vao guard thi day ra don thu hai.
    freshListener();
    await transport.deliver(zaloMessage('e2e-restart-1', 'gui 4 ghe felix', mappedGroup));

    expect((await orders()).length).toBe(after.orders);
    expect(transport.sent).toHaveLength(after.sent);
  }, 30_000);

  it('NOI LAI KENH: Zalo phat lai tin cu khong nhan doi don, tin moi van chay binh thuong', async () => {
    await transport.deliver(zaloMessage('e2e-reconnect-1', 'gui 2 ghe felix', mappedGroup));
    const after = { sent: transport.sent.length, orders: (await orders()).length };

    // Noi lai kenh: handler duoc dang ky lai, dung nhu ZaloUserClient lam sau khi reconnect.
    freshListener();
    await transport.deliver(zaloMessage('e2e-reconnect-1', 'gui 2 ghe felix', mappedGroup));
    expect((await orders()).length).toBe(after.orders);
    expect(transport.sent).toHaveLength(after.sent);

    await transport.deliver(zaloMessage('e2e-reconnect-2', 'gui 6 ghe felix', mappedGroup));
    expect((await orders()).length).toBe(after.orders + 1);
    expect(transport.sent).toHaveLength(after.sent + 1);
  }, 30_000);
});
