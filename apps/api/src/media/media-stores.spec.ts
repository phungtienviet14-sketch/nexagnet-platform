import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn(async (_command: { input: Record<string, unknown> }) => ({}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = send;
  },
  PutObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  ListObjectsV2Command: class {
    readonly kind = 'ListObjectsV2';
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
    const command = send.mock.calls[0]![0];
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

/**
 * Cong readiness `media.production` truoc day doc co `enabled` — HANG SO `true` cua S3MediaStore —
 * nen dat du bon bien MEDIA_* la cong xanh, ke ca khi bucket khong ton tai. `check()` phai cham
 * that vao bucket thi loi cau hinh moi lo ra TRUOC khi co anh khach.
 */
describe('S3MediaStore.check — cham that vao bucket', () => {
  const CONFIG = {
    bucket: 'kho-anh',
    endpoint: 'https://storage.googleapis.com',
    region: 'auto',
    accessKeyId: 'AKIA-GIA-LAP',
    secretAccessKey: 'secret-gia-lap',
  };

  afterEach(() => send.mockReset());

  /**
   * Phai la ListObjectsV2 chu KHONG phai HeadBucket: tren pilot GCP tai khoan dich vu chi co
   * `roles/storage.objectAdmin` (quyen tren object), khong co `storage.buckets.get` — HeadBucket
   * se 403 ngay ca khi cau hinh dung.
   */
  it('bucket doc duoc -> healthy, va di bang quyen tren OBJECT chu khong phai tren bucket', async () => {
    send.mockResolvedValue({});
    const result = await new S3MediaStore(CONFIG).check();

    expect(result.healthy).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      kind: 'ListObjectsV2',
      input: { Bucket: 'kho-anh', Prefix: 'media/', MaxKeys: 1 },
    });
  });

  it('bucket sai ten / khoa het han -> KHONG healthy, kem ly do doc duoc', async () => {
    send.mockRejectedValue(new Error('NoSuchBucket: The specified bucket does not exist'));
    const result = await new S3MediaStore(CONFIG).check();

    expect(result.healthy).toBe(false);
    expect(result.detail).toContain('kho-anh');
    expect(result.detail).toContain('NoSuchBucket');
  });

  it('khong ro ri khoa ra thong diep cho nguoi van hanh doc', async () => {
    send.mockRejectedValue(new Error('SignatureDoesNotMatch'));
    const result = await new S3MediaStore(CONFIG).check();

    expect(result.detail).not.toContain(CONFIG.secretAccessKey);
    expect(result.detail).not.toContain(CONFIG.accessKeyId);
  });

  it('giu ket qua trong TTL — /settings/readiness bi hoi lien tuc khong bien thanh spam mang', async () => {
    send.mockResolvedValue({});
    let now = 1_000;
    const store = new S3MediaStore(CONFIG, 30_000, () => now);

    await store.check();
    await store.check();
    expect(send).toHaveBeenCalledTimes(1);

    now += 30_001;
    await store.check();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('NoopMediaStore.check', () => {
  it('kho none -> KHONG healthy: khong luu anh thi khong the goi la san sang', async () => {
    await expect(new NoopMediaStore().check()).resolves.toMatchObject({ healthy: false });
  });
});
