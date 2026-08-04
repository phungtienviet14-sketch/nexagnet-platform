import { describe, expect, it, vi } from 'vitest';
import type { ChannelAdapter } from './channel-adapter.js';
import { OutboundChannelRouter } from './outbound-channel.router.js';

function adapter(name: string) {
  return {
    name,
    sendMessage: vi.fn(async () => undefined),
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
});
