import { describe, expect, it, vi } from 'vitest';
import { InMemoryMessagesRepository } from '../messages/messages.repository.js';
import { OutboundRecorder } from '../messages/outbound-recorder.js';
import type { ChannelAdapter } from './channel-adapter.js';
import { OutboundChannelRouter } from './outbound-channel.router.js';

function adapter(name: string) {
  return {
    name,
    sendMessage: vi.fn(async () => ({})),
  } as unknown as ChannelAdapter;
}

describe('OutboundChannelRouter', () => {
  it.each([
    ['bot', 0],
    ['zca', 1],
    ['mock', 2],
  ] as const)('replyChannel=%s -> chi gui dung adapter', async (replyChannel, selectedIndex) => {
    const adapters = [adapter('bot'), adapter('zca'), adapter('mock')] as const;
    const router = new OutboundChannelRouter(...adapters);

    await router.sendMessage(replyChannel, 'chat-1', 'xac nhan');

    adapters.forEach((item, index) => {
      expect(item.sendMessage).toHaveBeenCalledTimes(index === selectedIndex ? 1 : 0);
    });
  });

  it('thieu replyChannel -> tu choi thay vi doan sai kenh', async () => {
    const router = new OutboundChannelRouter(adapter('bot'), adapter('zca'), adapter('mock'));

    await expect(router.sendMessage(undefined, 'chat-1', 'xac nhan')).rejects.toThrow(
      /replyChannel/i,
    );
  });

  it('tin da gui duoc luu lai de lan sau bot doc duoc chinh no', async () => {
    const repository = new InMemoryMessagesRepository();
    const router = new OutboundChannelRouter(
      adapter('bot'),
      adapter('zca'),
      adapter('mock'),
      new OutboundRecorder(repository),
    );

    await router.sendMessage('zca', 'group-1', 'Da xac nhan don a nhe');

    expect(repository.list()).toMatchObject([
      { externalChatId: 'group-1', text: 'Da xac nhan don a nhe', direction: 'outbound' },
    ]);
  });

  it('id that tu kenh duoc dung lam externalMessageId cua tin outbound', async () => {
    const repository = new InMemoryMessagesRepository();
    const zca = {
      name: 'zca',
      sendMessage: vi.fn(async () => ({ externalMessageId: '123456789' })),
    } as unknown as ChannelAdapter;
    const router = new OutboundChannelRouter(
      adapter('bot'),
      zca,
      adapter('mock'),
      new OutboundRecorder(repository),
    );

    await router.sendMessage('zca', 'group-1', 'xac nhan');

    expect(repository.list()[0]?.externalMessageId).toBe('123456789');
  });

  it('khong co recorder thi van gui binh thuong (degrade, khong crash)', async () => {
    const zca = adapter('zca');
    const router = new OutboundChannelRouter(adapter('bot'), zca, adapter('mock'));

    await router.sendMessage('zca', 'group-1', 'xac nhan');

    expect(zca.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('sendContent cung duoc luu lai', async () => {
    const repository = new InMemoryMessagesRepository();
    const router = new OutboundChannelRouter(
      adapter('bot'),
      adapter('zca'),
      adapter('mock'),
      new OutboundRecorder(repository),
    );

    await router.sendContent('zca', 'group-1', { text: 'Bang gia a nhe' });

    expect(repository.list()).toMatchObject([
      { externalChatId: 'group-1', text: 'Bang gia a nhe', direction: 'outbound' },
    ]);
  });
});
