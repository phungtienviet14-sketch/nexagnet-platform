import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryMessagesRepository,
  MessagesRepository,
} from '../messages/messages.repository.js';
import { LocalMediaStore } from './local-media.store.js';
import { MediaFetcherService } from './media-fetcher.service.js';
import { MediaStore } from './media-store.js';
import { mediaFetcherProvider, mediaStoreProvider } from './media.provider.js';
import { NoopMediaStore } from './noop-media.store.js';
import { S3MediaStore } from './s3-media.store.js';

const factory = (mediaStoreProvider as { useFactory: () => MediaStore }).useFactory;

const KEYS = [
  'MEDIA_STORE',
  'MEDIA_BUCKET',
  'MEDIA_ENDPOINT',
  'MEDIA_ACCESS_KEY_ID',
  'MEDIA_SECRET_ACCESS_KEY',
  'MEDIA_LOCAL_DIR',
] as const;

describe('mediaStoreProvider (chon kho anh theo MEDIA_STORE)', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('khong dat gi (mac dinh) -> NoopMediaStore: demo/CI khong can bucket', () => {
    expect(factory()).toBeInstanceOf(NoopMediaStore);
  });

  it('local -> LocalMediaStore', () => {
    process.env.MEDIA_STORE = 'local';
    expect(factory()).toBeInstanceOf(LocalMediaStore);
  });

  it('s3 + du cau hinh -> S3MediaStore', () => {
    process.env.MEDIA_STORE = 's3';
    process.env.MEDIA_BUCKET = 'ultty-media';
    process.env.MEDIA_ENDPOINT = 'https://storage.googleapis.com';
    process.env.MEDIA_ACCESS_KEY_ID = 'AKIA-GIA-LAP';
    process.env.MEDIA_SECRET_ACCESS_KEY = 'secret-gia-lap';
    expect(factory()).toBeInstanceOf(S3MediaStore);
  });

  // Am tham quay ve Noop = anh moi ngay bi vut ma khong ai biet — dung thu ma Task 2 sinh ra de
  // ngan. Thieu cau hinh phai FAIL FAST luc khoi dong, giong PARSER_MODE=flowise trong env.ts.
  it('s3 nhung thieu bucket/khoa -> nem loi luc khoi dong, KHONG am tham ve Noop', () => {
    process.env.MEDIA_STORE = 's3';
    expect(() => factory()).toThrow();
  });
});

describe('mediaFetcherProvider (dung MediaFetcher tu env)', () => {
  it('dung duoc fetcher voi kho da chon; kho none -> khong tai gi', async () => {
    const store = (mediaFetcherProvider as { inject: unknown[] }).inject;
    expect(store).toEqual([MediaStore, MessagesRepository]);

    const build = (mediaFetcherProvider as {
      useFactory: (s: MediaStore, m: MessagesRepository) => MediaFetcherService;
    }).useFactory;
    const fetcher = build(new NoopMediaStore(), new InMemoryMessagesRepository());

    expect(fetcher).toBeInstanceOf(MediaFetcherService);
    expect(await fetcher.archive('m-1', 'https://photo-stal-16.zdn.vn/x.jpg', new Date())).toBeNull();
  });
});
