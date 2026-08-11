import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageMedia } from '../messages/messages.repository.js';
import { MediaFetcherService, type MediaFetcherOptions } from './media-fetcher.service.js';
import { MediaStore } from './media-store.js';
import { NoopMediaStore } from './noop-media.store.js';

const URL_ANH = 'https://photo-stal-16.zdn.vn/gr/jpg/abc/def.jpg';
const SENT_AT = new Date('2026-08-11T03:00:00.000Z');
const KHOA = 'media/2026/08/msg-1.webp';

const OPTIONS: MediaFetcherOptions = {
  allowedHosts: ['zdn.vn'],
  maxBytes: 5_000_000,
  timeoutMs: 5_000,
  concurrency: 3,
};

/** Kho gia lap — giu lai moi lan put de kiem, va gia lap duoc loi ghi. */
class FakeStore extends MediaStore {
  readonly name = 'fake';
  readonly enabled = true;
  readonly puts: Array<{ key: string; body: Buffer; contentType: string }> = [];
  failWith: Error | null = null;

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.puts.push({ key, body, contentType });
  }
}

/** Chi ghi lai loi goi — khong can ca MessagesRepository that. */
class FakeMessages {
  readonly calls: Array<{ messageId: string; media: MessageMedia }> = [];
  async recordMedia(messageId: string, media: MessageMedia): Promise<void> {
    this.calls.push({ messageId, media });
  }
}

function build(store: MediaStore = new FakeStore(), options: Partial<MediaFetcherOptions> = {}) {
  const messages = new FakeMessages();
  const fetcher = new MediaFetcherService(
    store,
    messages as unknown as ConstructorParameters<typeof MediaFetcherService>[1],
    { ...OPTIONS, ...options },
  );
  return { fetcher, store, messages };
}

/** Anh JPEG that 2000x1000 — de kiem ca viec thu nho lan viec doi sang WebP. */
async function anhThat(): Promise<Buffer> {
  return sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

function traLoi(body: Buffer | string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

describe('MediaFetcherService.archive', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('anh that -> nen WebP, day len kho dung khoa, ghi lai vao DB', async () => {
    const jpeg = await anhThat();
    const fetchMock = vi.fn(async () => traLoi(jpeg, { headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetcher, store, messages } = build();

    const result = await fetcher.archive('msg-1', URL_ANH, SENT_AT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const put = (store as FakeStore).puts[0];
    expect(put?.key).toBe(KHOA);
    expect(put?.contentType).toBe('image/webp');
    const meta = await sharp(put!.body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600); // thu nho ve 1600px theo thiet ke
    expect(put!.body.length).toBeLessThan(jpeg.length);
    expect(result).toMatchObject({ key: KHOA, bytes: put!.body.length });
    expect(messages.calls).toEqual([{ messageId: 'msg-1', media: result }]);
  });

  // BAT BIEN CUA CA TASK 2: tai anh hong KHONG duoc lam rot tin. Moi nhanh loi duoi day
  // deu phai tra ve `error` va KHONG nem ra ngoai.
  it('HTTP 404 -> ghi mediaError, khong nem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const { fetcher, messages } = build();

    const result = await fetcher.archive('msg-1', URL_ANH, SENT_AT);

    expect(result?.error).toContain('404');
    expect(result?.key).toBeUndefined();
    expect(messages.calls[0]?.media.error).toContain('404');
  });

  it('than tin khong phai anh (HTML) -> ghi mediaError, khong nem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => traLoi('<html>404 not found</html>')));
    const { fetcher } = build();

    const result = await fetcher.archive('msg-1', URL_ANH, SENT_AT);

    expect(result?.error).toBeTruthy();
    expect(result?.key).toBeUndefined();
  });

  it('mang loi (fetch nem) -> ghi mediaError, khong nem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ETIMEDOUT');
      }),
    );
    const { fetcher } = build();

    expect((await fetcher.archive('msg-1', URL_ANH, SENT_AT))?.error).toContain('ETIMEDOUT');
  });

  // SSRF: URL den tu tin nhan = du lieu ben ngoai. Phai chan TRUOC khi ra mang, khong phai
  // chan sau khi da goi — nen phep kiem la "fetch chua he duoc goi".
  it('host ngoai danh sach cho phep -> KHONG goi fetch lan nao', async () => {
    const fetchMock = vi.fn(async () => traLoi(Buffer.alloc(0)));
    vi.stubGlobal('fetch', fetchMock);
    const { fetcher } = build();

    const result = await fetcher.archive(
      'msg-1',
      'http://169.254.169.254/computeMetadata/v1/',
      SENT_AT,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result?.error).toBeTruthy();
  });

  it('content-length vuot tran -> bo som, ghi mediaError', async () => {
    const jpeg = await anhThat();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => traLoi(jpeg, { headers: { 'content-length': '99000000' } })),
    );
    const { fetcher } = build(new FakeStore(), { maxBytes: 1000 });

    expect((await fetcher.archive('msg-1', URL_ANH, SENT_AT))?.error).toBeTruthy();
  });

  // May chu co the KHONG khai content-length (chunked) hoac khai doi — phai dem byte that
  // trong luc doc, neu khong mot phan hoi 10GB se lam het RAM tien trinh.
  it('than tin vuot tran du content-length noi doi -> huy giua chung', async () => {
    const jpeg = await anhThat();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => traLoi(jpeg, { headers: { 'content-length': '10' } })),
    );
    const { fetcher } = build(new FakeStore(), { maxBytes: 500 });

    expect((await fetcher.archive('msg-1', URL_ANH, SENT_AT))?.error).toBeTruthy();
  });

  it('kho ghi loi -> ghi mediaError, khong nem', async () => {
    const jpeg = await anhThat();
    vi.stubGlobal('fetch', vi.fn(async () => traLoi(jpeg)));
    const store = new FakeStore();
    store.failWith = new Error('AccessDenied');
    const { fetcher } = build(store);

    expect((await fetcher.archive('msg-1', URL_ANH, SENT_AT))?.error).toContain('AccessDenied');
  });

  // MEDIA_STORE=none la MAC DINH (demo/CI): tai roi vut di la lang phi bang thong va lam CI
  // phu thuoc mang. Khong lam gi ca, va cung khong ghi mediaError gia.
  it('kho tat (enabled=false) -> khong fetch, khong ghi DB, tra null', async () => {
    const fetchMock = vi.fn(async () => traLoi(Buffer.alloc(0)));
    vi.stubGlobal('fetch', fetchMock);
    const { fetcher, messages } = build(new NoopMediaStore());

    expect(await fetcher.archive('msg-1', URL_ANH, SENT_AT)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(messages.calls).toHaveLength(0);
  });
});

describe('MediaFetcherService.schedule + drain — tai NGOAI duong di cua tin', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('schedule tra ve ngay lap tuc; drain doi tai xong', async () => {
    const jpeg = await anhThat();
    vi.stubGlobal('fetch', vi.fn(async () => traLoi(jpeg)));
    const { fetcher, store } = build();

    fetcher.schedule('msg-1', URL_ANH, SENT_AT);
    expect((store as FakeStore).puts).toHaveLength(0); // chua chay xong -> khong chan pipeline

    await fetcher.drain();
    expect((store as FakeStore).puts).toHaveLength(1);
  });

  it('mot tin loi khong lam hong tin khac, va khong nem ra ngoai', async () => {
    const jpeg = await anhThat();
    let lanGoi = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        lanGoi += 1;
        if (lanGoi === 1) throw new Error('ECONNRESET');
        return traLoi(jpeg);
      }),
    );
    const { fetcher, store, messages } = build();

    fetcher.schedule('msg-loi', URL_ANH, SENT_AT);
    fetcher.schedule('msg-ok', URL_ANH, SENT_AT);
    await expect(fetcher.drain()).resolves.toBeUndefined();

    expect((store as FakeStore).puts).toHaveLength(1);
    expect(messages.calls.find((c) => c.messageId === 'msg-loi')?.media.error).toContain(
      'ECONNRESET',
    );
    expect(messages.calls.find((c) => c.messageId === 'msg-ok')?.media.key).toBeTruthy();
  });

  it('drain khi khong co gi dang tai -> ket thuc ngay', async () => {
    const { fetcher } = build();
    await expect(fetcher.drain()).resolves.toBeUndefined();
  });
});
