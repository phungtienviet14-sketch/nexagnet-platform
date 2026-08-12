import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotPlatformAdapter } from './bot-platform.adapter.js';

describe('BotPlatformAdapter outbound content', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the real sendPhoto contract and keeps video/catalog as links in the caption', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 'm1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new BotPlatformAdapter('token-test');

    expect(adapter.capabilities).toEqual({ text: true, image: true, video: false, file: false });
    await adapter.sendContent('group-1', {
      text: 'Thông tin sản phẩm',
      image: { url: 'https://cdn.example.test/photo.webp' },
      links: [{ kind: 'video', label: 'Video', url: 'https://example.test/video' }],
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/sendPhoto');
    expect(JSON.parse(String(request?.body))).toEqual({
      chat_id: 'group-1',
      photo: 'https://cdn.example.test/photo.webp',
      caption: 'Thông tin sản phẩm\nVideo: https://example.test/video',
    });
  });
});
