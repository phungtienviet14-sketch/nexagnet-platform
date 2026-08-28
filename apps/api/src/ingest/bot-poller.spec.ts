import { describe, expect, it, vi } from 'vitest';
import {
  BotPoller,
  isAllowedBotMessage,
  isBotChannelActive,
  shouldAcceptBotMessage,
  shouldAutoAck,
  updateToChannelMessage,
} from './bot-poller.js';

describe('BotPoller observability', () => {
  it('reports an explicit disabled long-poll transport before startup', () => {
    const poller = new BotPoller(
      {} as ConstructorParameters<typeof BotPoller>[0],
      {} as ConstructorParameters<typeof BotPoller>[1],
    );

    expect(poller.status()).toEqual({
      state: 'disabled',
      transport: 'long_poll',
      received: 0,
      processed: 0,
      failed: 0,
      lastSuccessfulPollAt: null,
      lastErrorAt: null,
      lastError: null,
    });
  });

  it('dua cac tin trong cung mot batch vao pipeline dong thoi de burst co the gom tin', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started: string[] = [];
    const intake = vi.fn(async (message: { externalMessageId: string }) => {
      started.push(message.externalMessageId);
      if (message.externalMessageId === 'batch-1') await firstPending;
      return { outcome: 'skipped_unmapped_group' as const };
    });
    const poller = new BotPoller(
      { intake } as unknown as ConstructorParameters<typeof BotPoller>[0],
      {} as ConstructorParameters<typeof BotPoller>[1],
    );
    const updates = [
      {
        message: {
          message_id: 'batch-1',
          text: 'gui 4 quat tich dine',
          from: { id: 'member-1', is_bot: false },
          chat: { id: 'group-1', chat_type: 'GROUP' },
        },
      },
      {
        message: {
          message_id: 'batch-2',
          text: 'lay vat',
          from: { id: 'member-1', is_bot: false },
          chat: { id: 'group-1', chat_type: 'GROUP' },
        },
      },
    ];

    const batch = (
      poller as unknown as {
        processUpdates(
          raw: unknown,
          botName: string,
          autoAck: 'on' | 'off',
          mode: 'bot',
        ): Promise<void>;
      }
    ).processUpdates(updates, 'Orders', 'off', 'bot');
    await vi.waitFor(() => expect(started).toEqual(['batch-1', 'batch-2']));
    releaseFirst?.();
    await batch;

    expect(intake).toHaveBeenCalledTimes(2);
  });

  /**
   * KHONG DUNG DONG HO THAT DE KHANG DINH THU TU.
   *
   * Ban truoc cua bai nay cho lan poll thu hai bang `vi.waitFor(..., { timeout: 100 })`. Do la
   * mot HAN CHOT CHO THANH CONG: may ban (chay ca monorepo) thi 100 ms troi qua truoc khi vong
   * lap kip poll lan hai, va bai do — trong khi ma nguon hoan toan dung. Da quan sat that:
   * do 2 lan trong `pnpm test` toan monorepo (27/08), nhung 22/22 xanh khi chay rieng tep nay.
   *
   * Mot bai do ngau nhien day nguoi ta bo qua mau do. Do la chi phi that, ke ca khi ma dung.
   *
   * Ban nay cho MOT SU KIEN thay vi cho MOT KHOANG THOI GIAN: `fetchUpdates` lan hai tu bao la
   * no da duoc goi. May cham thi bai chay lau hon, khong phai do hon. Neu vong lap that su bi
   * tuan tu hoa (loi that ma bai nay san), su kien do khong bao gio den va bai do bang han
   * chot cua chinh vitest — mot han chot cho THAT BAI, khac han mot han chot cho THANH CONG.
   */
  it('tiep tuc long-poll khi batch truoc con cho burst, de gom duoc tin o poll ke tiep', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const stopPolling = vi.fn();
    let firstIntakeDone = false;
    const intake = vi.fn(async (message: { externalMessageId: string }) => {
      if (message.externalMessageId === 'poll-1') {
        await firstPending;
        firstIntakeDone = true;
      }
      if (message.externalMessageId === 'poll-2') {
        stopPolling();
      }
      return { outcome: 'skipped_unmapped_group' as const };
    });
    const poller = new BotPoller(
      { intake } as unknown as ConstructorParameters<typeof BotPoller>[0],
      {} as ConstructorParameters<typeof BotPoller>[1],
    );
    const internals = poller as unknown as {
      running: boolean;
      fetchUpdates(token: string): Promise<unknown>;
      loop(
        token: string,
        botName: string,
        autoAck: 'on' | 'off',
        mode: 'bot',
      ): Promise<void>;
    };
    stopPolling.mockImplementation(() => {
      internals.running = false;
      releaseFirst?.();
    });
    const update = (id: string, text: string) => ({
      message: {
        message_id: id,
        text,
        from: { id: 'member-1', is_bot: false },
        chat: { id: 'group-1', chat_type: 'GROUP' },
      },
    });
    let announceSecondPoll: (() => void) | undefined;
    const secondPollStarted = new Promise<void>((resolve) => {
      announceSecondPoll = resolve;
    });
    // CHUP LAI TRANG THAI tai dung khoanh khac poll lan hai bat dau, thay vi do xem no bat dau
    // trong bao lau. Day la thu bai nay thuc su khang dinh: lan poll ke tiep KHONG cho batch
    // truoc xong.
    let firstIntakeDoneAtSecondPoll: boolean | undefined;
    const fetchUpdates = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, result: [update('poll-1', 'gui 4 quat')] }))
      .mockImplementationOnce(async () => {
        firstIntakeDoneAtSecondPoll = firstIntakeDone;
        announceSecondPoll?.();
        return { ok: true, result: [update('poll-2', 'lay vat')] };
      });
    internals.fetchUpdates = fetchUpdates;
    internals.running = true;

    const loop = internals.loop('token', 'Orders', 'off', 'bot');
    try {
      await secondPollStarted;
    } finally {
      internals.running = false;
      releaseFirst?.();
    }
    await loop;

    expect(fetchUpdates).toHaveBeenCalledTimes(2);
    // Batch dau VAN CON DANG CHO luc poll thu hai chay -> hai viec that su goi len nhau.
    expect(firstIntakeDoneAtSecondPoll).toBe(false);
    expect(intake).toHaveBeenCalledTimes(2);
  });
});

describe('updateToChannelMessage — tin tra loi (reply/quote)', () => {
  it('map trich dan sang replyTo de parser co ngu canh, giong kenh zca', () => {
    const m = updateToChannelMessage({
      event_name: 'message.text.received',
      message: {
        message_id: 'm2',
        text: 'them 5 cai nua nhe',
        date: 1783404430000,
        from: { id: 'u1', display_name: 'Phùng Việt', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
        reply_to_message: {
          message_id: 'm1',
          text: '10 ghe felix',
          date: 1783404428000,
          from: { id: 'u2', display_name: 'Meta HN', is_bot: false },
        },
      },
    });

    expect(m?.replyTo?.externalMessageId).toBe('m1');
    expect(m?.replyTo?.text).toBe('10 ghe felix');
    expect(m?.replyTo?.senderExternalId).toBe('u2');
    expect(m?.replyTo?.sentAt).toEqual(new Date(1783404428000));
  });

  it('khong co trich dan -> replyTo undefined, hanh vi y nhu truoc', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'm3',
        text: 'chot don',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });

    expect(m?.replyTo).toBeUndefined();
  });

  it('trich dan rong (khong id, khong chu, khong anh) -> bo qua chu khong tao ngu canh rong', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'm4',
        text: 'chot don',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
        reply_to_message: { text: '   ' },
      },
    });

    expect(m?.replyTo).toBeUndefined();
  });
});

describe('updateToChannelMessage', () => {
  it('map tin text nhom', () => {
    const m = updateToChannelMessage({
      event_name: 'message.text.received',
      message: {
        message_id: 'abc',
        text: '@Bot ultty AI orders 10 ghe felix',
        date: 1783404428055,
        from: { id: 'u1', display_name: 'Phùng Việt', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m?.externalChatId).toBe('zgr-x');
    expect(m?.chatType).toBe('group');
    expect(m?.text).toContain('ghe felix');
    expect(m?.imageUrl).toBeUndefined();
  });

  it('map tin anh: caption -> text, photo_url -> imageUrl', () => {
    const m = updateToChannelMessage({
      event_name: 'message.image.received',
      message: {
        message_id: 'img1',
        caption: '@Bot ultty AI orders 5 noi chien',
        photo_url: 'https://photo-stal-16.zdn.vn/x.jpg',
        from: { id: 'u1', display_name: 'A', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m?.text).toContain('noi chien');
    expect(m?.imageUrl).toBe('https://photo-stal-16.zdn.vn/x.jpg');
  });

  it('bo qua tin cua chinh bot', () => {
    const m = updateToChannelMessage({
      message: { message_id: 'b1', text: 'xac nhan', from: { is_bot: true }, chat: { id: 'zgr-x' } },
    });
    expect(m).toBeNull();
  });

  // Dot A' Task 1: truoc day `if (!text) return null` vut thang anh gui TRAN (khong caption)
  // -> tin chua bao gio vao DB, ma link Zalo chet <=35 ngay => mat vinh vien.
  it('GIU tin anh khong caption: text rong, con nguyen photo_url', () => {
    const m = updateToChannelMessage({
      event_name: 'message.image.received',
      message: {
        message_id: 'img-tran',
        photo_url: 'https://photo-stal-16.zdn.vn/x.jpg',
        from: { id: 'u1', display_name: 'A', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m).not.toBeNull();
    expect(m?.text).toBe('');
    expect(m?.imageUrl).toBe('https://photo-stal-16.zdn.vn/x.jpg');
  });

  // photo_url nay la can cu DUY NHAT de giu tin khong caption, nen no phai duoc kiem truoc
  // (giong toHttpUrl cua zca-message): URL hong ma van cho qua thi safeParse rot ca tin.
  it('tin CO CHU nhung photo_url hong -> giu tin, bo imageUrl (khong lam rot ca tin)', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'bad-photo',
        text: 'gui 3 robot',
        photo_url: 'not-a-url',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m?.text).toContain('robot');
    expect(m?.imageUrl).toBeUndefined();
  });

  it('bo qua tin khong caption khi photo_url hong — khong con gi de luu', () => {
    const m = updateToChannelMessage({
      message: {
        message_id: 'bad-photo-2',
        photo_url: 'not-a-url',
        from: { id: 'u1', is_bot: false },
        chat: { id: 'zgr-x', chat_type: 'GROUP' },
      },
    });
    expect(m).toBeNull();
  });

  it('bo qua update khong co noi dung', () => {
    expect(updateToChannelMessage({ message: { chat: { id: 'zgr-x' } } })).toBeNull();
  });
});

describe('shouldAutoAck', () => {
  it('bat cong tac + intent=khac (LLM khong hieu) -> co ack', () => {
    expect(shouldAutoAck('khac', 'on')).toBe(true);
  });

  it('tat cong tac -> khong ack du intent=khac', () => {
    expect(shouldAutoAck('khac', 'off')).toBe(false);
  });

  it('bat cong tac nhung intent da hieu (dat_don/hoi_gia) -> khong ack', () => {
    expect(shouldAutoAck('dat_don', 'on')).toBe(false);
    expect(shouldAutoAck('hoi_gia', 'on')).toBe(false);
  });
});

describe('hybrid ownership guard', () => {
  it('BotPoller hoat dong o ca bot va hybrid', () => {
    expect(isBotChannelActive('bot')).toBe(true);
    expect(isBotChannelActive('hybrid')).toBe(true);
    expect(isBotChannelActive('zca')).toBe(false);
    expect(isBotChannelActive('mock')).toBe(false);
  });

  it('chi nhan tin NHOM, chan tin ca nhan', () => {
    const base = {
      externalMessageId: 'm-1',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'bot-chat-mapped',
      text: 'gui 10 ghe',
      sentAt: new Date(),
    };

    expect(isAllowedBotMessage(base)).toBe(true);
    expect(isAllowedBotMessage({ ...base, chatType: 'private' })).toBe(false);
  });

  it('hybrid: allowlist cua operator chi phoi CA kenh Bot, khong rieng zca', () => {
    const base = {
      externalMessageId: 'm-3',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'nhom-duoc-chon',
      text: 'gui 10 ghe',
      sentAt: new Date(),
    };
    const ctx = {
      mode: 'hybrid' as const,
      allowlistActive: true,
      isAllowed: (chatId: string) => chatId === 'nhom-duoc-chon',
    };

    expect(shouldAcceptBotMessage(base, ctx)).toBe(true);
    expect(shouldAcceptBotMessage({ ...base, externalChatId: 'nhom-khong-chon' }, ctx)).toBe(false);
  });

  it('bot thuan (khong co phien zca -> allowlist rong) KHONG bi chan', () => {
    // Ap allowlist rong o che do bot thuan la chan sach ca kenh.
    const base = {
      externalMessageId: 'm-4',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'nhom-bat-ky',
      text: 'gui 10 ghe',
      sentAt: new Date(),
    };

    expect(
      shouldAcceptBotMessage(base, {
        mode: 'bot',
        allowlistActive: false,
        isAllowed: () => false,
      }),
    ).toBe(true);
    // Hybrid nhung chua dang nhap zca -> allowlist chua co hieu luc, cung khong chan.
    expect(
      shouldAcceptBotMessage(base, {
        mode: 'hybrid',
        allowlistActive: false,
        isAllowed: () => false,
      }),
    ).toBe(true);
  });

  it('tin ca nhan bi chan o moi che do', () => {
    const priv = {
      externalMessageId: 'm-5',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'private' as const,
      externalChatId: 'nguoi-la',
      text: 'chao',
      sentAt: new Date(),
    };

    expect(
      shouldAcceptBotMessage(priv, { mode: 'bot', allowlistActive: false, isAllowed: () => true }),
    ).toBe(false);
  });

  it('nhom chua map KHONG con bi chan o day — tin phai vao duoc pipeline de duoc luu (I1)', () => {
    // Truoc 04/08/2026 ham nay doi chatId nam trong knowledge.groups(); tin @mention cua nhom
    // chua map bi vut ma Zalo khong phat lai. Cong "da map" gio nam trong PipelineService.intake.
    const unmapped = {
      externalMessageId: 'm-2',
      platform: 'zalo' as const,
      source: 'bot_webhook' as const,
      chatType: 'group' as const,
      externalChatId: 'nhom-hoan-toan-la',
      text: 'don hang co PII',
      sentAt: new Date(),
    };

    expect(isAllowedBotMessage(unmapped)).toBe(true);
  });
});
