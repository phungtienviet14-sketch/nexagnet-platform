import { Logger, type Provider } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { MessagesRepository } from '../messages/messages.repository.js';
import { LocalMediaStore } from './local-media.store.js';
import { MediaFetcherService } from './media-fetcher.service.js';
import { parseAllowedHosts } from './media-policy.js';
import { MediaStore } from './media-store.js';
import { NoopMediaStore } from './noop-media.store.js';
import { S3MediaStore } from './s3-media.store.js';

/**
 * Chon kho anh theo MEDIA_STORE — cung khuon `channels/channel.provider.ts`:
 *   none  -> NoopMediaStore (MAC DINH, demo/CI khong I/O)
 *   local -> LocalMediaStore (dev)
 *   s3    -> S3MediaStore (GCS hom nay, OVHcloud sau nay)
 *
 * `loadEnv()` da fail-fast khi MEDIA_STORE=s3 ma thieu bucket/endpoint/khoa — KHONG am tham quay
 * ve Noop, vi nhu vay la anh moi ngay bi vut ma khong ai biet.
 */
export const mediaStoreProvider: Provider = {
  provide: MediaStore,
  useFactory: (): MediaStore => {
    const env = loadEnv();
    const logger = new Logger('MediaProvider');
    switch (env.MEDIA_STORE) {
      case 's3': {
        const { MEDIA_BUCKET, MEDIA_ENDPOINT, MEDIA_ACCESS_KEY_ID, MEDIA_SECRET_ACCESS_KEY } = env;
        // `loadEnv()` da fail-fast; kiem lai o day de bo 4 phep ep kieu `as string` — va neu sau
        // nay ai do sua env.ts thi vo o cho noi ro nguyen nhan, khong phai loi la tu AWS SDK.
        if (!MEDIA_BUCKET || !MEDIA_ENDPOINT || !MEDIA_ACCESS_KEY_ID || !MEDIA_SECRET_ACCESS_KEY) {
          throw new Error('MEDIA_STORE=s3 nhung thieu MEDIA_BUCKET/ENDPOINT/ACCESS_KEY/SECRET');
        }
        logger.log(`Kho anh: S3MediaStore (bucket ${MEDIA_BUCKET})`);
        return new S3MediaStore({
          bucket: MEDIA_BUCKET,
          endpoint: MEDIA_ENDPOINT,
          region: env.MEDIA_REGION,
          accessKeyId: MEDIA_ACCESS_KEY_ID,
          secretAccessKey: MEDIA_SECRET_ACCESS_KEY,
        });
      }
      case 'local':
        logger.log(`Kho anh: LocalMediaStore (${env.MEDIA_LOCAL_DIR}) — chi dung cho dev`);
        return new LocalMediaStore(env.MEDIA_LOCAL_DIR);
      default:
        logger.log('Kho anh: none — KHONG luu anh ve (mac dinh demo/CI)');
        return new NoopMediaStore();
    }
  },
};

export const mediaFetcherProvider: Provider = {
  provide: MediaFetcherService,
  inject: [MediaStore, MessagesRepository],
  useFactory: (store: MediaStore, messages: MessagesRepository): MediaFetcherService => {
    const env = loadEnv();
    return new MediaFetcherService(store, messages, {
      allowedHosts: parseAllowedHosts(env.MEDIA_ALLOWED_HOSTS),
      maxBytes: env.MEDIA_MAX_BYTES,
      timeoutMs: env.MEDIA_TIMEOUT_MS,
      concurrency: env.MEDIA_CONCURRENCY,
    });
  },
};
