import { Logger, type Provider } from '@nestjs/common';
import { loadEnv, type AppEnv } from '@netviet/shared';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { MessagesRepository } from '../messages/messages.repository.js';
import { CATALOG_STORE } from './catalog.tokens.js';
import { GcsMediaStore } from './gcs-media.store.js';
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
  useFactory: (): MediaStore => createMediaStore(loadEnv()),
};

/**
 * CHON kho anh tu env — tach thanh ham rieng cho `#169`.
 *
 * `mediaStoreProvider` thuoc `turn-processing` va doc `loadEnv()` DAY DU, nen no fail-fast khi
 * thieu credential cua parser/channel. Mot khach VAN TAI khong co parser nao ca, nen goi duong do
 * se lam ho khong boot noi.
 *
 * Bang chung van tai (`transport-fuel`) vi vay dung chinh ham nay voi `loadFoundationEnv()`. Cai
 * duoc CHIA SE la phep chon kho — phan mang y nghia bao mat: fail-fast khi thieu bucket/khoa, va
 * KHONG am tham quay ve Noop. Cai khong chia se la bo kiem env, vi hai capability doi hai bo khac
 * nhau. Nhan doi khoi `switch` nay sang mien van tai se tao ra hai chinh sach luu tru de lech nhau
 * dung vao lan them mot nha cung cap thu nam.
 */
export function createMediaStore(env: AppEnv): MediaStore {
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
    case 'gcs': {
      // `loadEnv()` da fail-fast khi thieu bucket. ADC khong co bien nao de kiem o day: thieu
      // quyen chi lo ra khi goi that, va cho lo ra dung la `MediaStore.check()`.
      const { MEDIA_BUCKET } = env;
      if (!MEDIA_BUCKET) throw new Error('MEDIA_STORE=gcs nhung thieu MEDIA_BUCKET');
      logger.log(`Kho anh: GcsMediaStore (bucket ${MEDIA_BUCKET}, xac thuc bang ADC)`);
      return new GcsMediaStore({ bucket: MEDIA_BUCKET, endpoint: env.MEDIA_GCS_ENDPOINT });
    }
    case 'local':
      logger.log(`Kho anh: LocalMediaStore (${env.MEDIA_LOCAL_DIR}) — chi dung cho dev`);
      return new LocalMediaStore(env.MEDIA_LOCAL_DIR);
    default:
      logger.log('Kho anh: none — KHONG luu anh ve (mac dinh demo/CI)');
      return new NoopMediaStore();
  }
}

/**
 * Kho ANH CATALOG — luon la thu muc tren dia, KHONG phu thuoc MEDIA_STORE.
 *
 * Anh catalog la tai san TINH cua ban phat hanh (di kem image/volume), khong phai du lieu chay
 * nhu anh khach gui vao. Buoc no theo MEDIA_STORE se keo theo hai he qua khong mong muon: khi
 * MEDIA_STORE=none (demo/CI) thi anh san pham cung bien mat, va khi MEDIA_STORE=gcs thi anh tiep
 * thi lai nam trong dung cai bucket PRIVATE danh cho PII.
 *
 * Doc bang `loadFoundationEnv()` chu KHONG `loadEnv()`: kho nay thuoc `knowledge`, va biet ANH
 * SAN PHAM NAM O DAU khong duoc doi mot khoa LLM hay mot token Zalo. `loadEnv()` la mot bo kiem
 * duy nhat cho ca ung dung, nen goi no o day se keo dieu kien cua `parser`/`channel` vao mot khach
 * chi co tri thuc — va khach do se khong boot noi. Cac kho con lai trong tep nay VAN dung
 * `loadEnv()`: chung thuoc `turn-processing`, capability do thuc su doi mot parser.
 */
export const catalogStoreProvider: Provider = {
  provide: CATALOG_STORE,
  useFactory: (): MediaStore => {
    const env = loadFoundationEnv();
    new Logger('MediaProvider').log(`Kho anh catalog: ${env.CATALOG_DIR}`);
    return new LocalMediaStore(env.CATALOG_DIR);
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
