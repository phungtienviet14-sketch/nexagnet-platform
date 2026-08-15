import { describe, expect, it, vi } from 'vitest';
import { ChannelAdapter } from './channel-adapter.js';
import { OutboundChannelRouter } from './outbound-channel.router.js';

function adapter(capabilities: ChannelAdapter['capabilities']): ChannelAdapter {
  class TestAdapter extends ChannelAdapter {
    readonly name = 'test';
    override readonly capabilities = capabilities;
    readonly sendMessage = vi.fn(async () => undefined);
  }
  return new TestAdapter();
}

describe('channel content capabilities', () => {
  it('routes text + image only to a channel that advertises image support', async () => {
    const bot = adapter({ text: true, image: true, video: false, file: false });
    const zca = adapter({ text: true, image: false, video: false, file: false });
    const mock = adapter({ text: true, image: true, video: false, file: false });
    const router = new OutboundChannelRouter(bot, zca, mock);

    await router.sendContent('bot', 'group-1', {
      text: 'Thông tin sản phẩm',
      images: [{ url: 'https://cdn.example.test/p.webp', alt: 'Sản phẩm' }],
      links: [{ kind: 'video', label: 'Video', url: 'https://example.test/v' }],
    });

    expect(bot.sendMessage).toHaveBeenCalledOnce();
    expect(router.capabilities('bot')).toEqual({
      text: true,
      image: true,
      video: false,
      file: false,
    });
  });

  it('fails closed instead of pretending a channel can send an image', async () => {
    const noImage = adapter({ text: true, image: false, video: false, file: false });
    const router = new OutboundChannelRouter(noImage, noImage, noImage);
    await expect(
      router.sendContent('zca', 'group-1', {
        text: 'Thông tin',
        images: [{ url: 'https://cdn.example.test/p.webp' }],
      }),
    ).rejects.toThrow(/không hỗ trợ ảnh/i);
  });
});
