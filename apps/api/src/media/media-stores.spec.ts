import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn(async () => ({}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = send;
  },
  PutObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

const { LocalMediaStore } = await import('./local-media.store.js');
const { NoopMediaStore } = await import('./noop-media.store.js');
const { S3MediaStore } = await import('./s3-media.store.js');

const KEY = 'media/2026/08/ckabc123.webp';
const BODY = Buffer.from([0x52, 0x49, 0x46, 0x46]);

describe('NoopMediaStore — mac dinh demo/CI', () => {
  it('enabled=false de MediaFetcher bo qua han, khong tai byte nao', () => {
    expect(new NoopMediaStore().enabled).toBe(false);
    expect(new NoopMediaStore().name).toBe('none');
  });

  it('put khong nem, khong cham dia', async () => {
    await expect(new NoopMediaStore().put(KEY, BODY, 'image/webp')).resolves.toBeUndefined();
  });
});

describe('LocalMediaStore — cho dev', () => {
  let root = '';
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ultty-media-'));
  });

  it('ghi dung duong dan theo khoa, tu tao thu muc long nhau', async () => {
    const store = new LocalMediaStore(root);

    await store.put(KEY, BODY, 'image/webp');

    expect(await readFile(join(root, KEY))).toEqual(BODY);
    expect(store.enabled).toBe(true);
    expect(store.name).toBe('local');
  });

  // Khoa da duoc buildMediaKey kiem, nhung store la bien gioi ghi dia — kiem LAN HAI o day
  // vi mot khoa la la duong ghi de file ngoai thu muc goc.
  it('tu choi khoa vuot ra ngoai thu muc goc', async () => {
    const store = new LocalMediaStore(root);
    await expect(store.put('../ngoai.webp', BODY, 'image/webp')).rejects.toThrow();
  });
});

describe('S3MediaStore — GCS hom nay, OVHcloud sau nay, cung mot code', () => {
  afterEach(() => send.mockClear());

  it('put -> PutObjectCommand dung bucket/khoa/content-type', async () => {
    const store = new S3MediaStore({
      bucket: 'ultty-media',
      endpoint: 'https://storage.googleapis.com',
      region: 'auto',
      accessKeyId: 'AKIA-GIA-LAP',
      secretAccessKey: 'secret-gia-lap',
    });

    await store.put(KEY, BODY, 'image/webp');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: 'ultty-media',
      Key: KEY,
      Body: BODY,
      ContentType: 'image/webp',
    });
    expect(store.enabled).toBe(true);
    expect(store.name).toBe('s3');
  });
});
