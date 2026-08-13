import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MediaStore, type MediaStoreHealth } from './media-store.js';

export interface S3MediaConfig {
  readonly bucket: string;
  /** GCS XML API: https://storage.googleapis.com · OVHcloud: https://s3.<region>.io.cloud.ovh.net */
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * Kho production. Dung CHUAN S3 chu khong phai `@google-cloud/storage` co chu y (chot 11/08/2026):
 * ha tang dang o GCP nhung se chuyen OVHcloud — cung mot code chay tren GCS (XML API + khoa HMAC),
 * OVHcloud Object Storage va MinIO khi dev offline.
 *
 * Bucket phai PRIVATE: anh co the chua PII (CCCD, dia chi khach) — thuoc pham vi ho so D22.
 */
export class S3MediaStore extends MediaStore {
  readonly name = 's3';
  readonly enabled = true;
  private readonly client: S3Client;
  private cached?: { at: number; value: MediaStoreHealth };

  constructor(
    private readonly config: S3MediaConfig,
    private readonly ttlMs = 30_000,
    private readonly clock: () => number = Date.now,
  ) {
    super();
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // GCS XML API va MinIO deu can path-style; virtual-host style khong chay tren ca hai.
      forcePathStyle: true,
    });
  }

  /**
   * Cham THAT vao bucket (`HeadBucket`) thay vi bao "da bat la coi nhu chay duoc".
   *
   * Ba loi thuong gap ma chi cach nay moi thay: go nham ten bucket, khoa HMAC het han/sai quyen,
   * va bucket nam o project khac. Ca ba deu de bien `MEDIA_STORE=s3` thanh mot cong readiness xanh
   * gia trong khi anh dau tien tu Zalo se rot.
   *
   * Ket qua duoc giu lai trong `ttlMs` vi `/settings/readiness` co the bi hoi lien tuc; nguoc lai
   * moi lan mo tab la mot request ra ngoai mang.
   */
  override async check(): Promise<MediaStoreHealth> {
    const now = this.clock();
    if (this.cached && now - this.cached.at < this.ttlMs) return this.cached.value;
    const value = await this.probe();
    this.cached = { at: now, value };
    return value;
  }

  /**
   * Liet ke 1 object duoi prefix `media/` chu KHONG dung `HeadBucket`.
   *
   * Ly do rat cu the: tren pilot GCP, tai khoan dich vu chi co `roles/storage.objectAdmin` — quyen
   * tren OBJECT, khong co `storage.buckets.get`. `HeadBucket` se tra 403 ngay ca khi cau hinh
   * hoan toan dung, tuc la doi mot bao-xanh-gia lay mot bao-do-gia. `ListObjectsV2` chi can
   * `storage.objects.list`, va van phan biet du ba kieu hong can bat: sai ten bucket
   * (NoSuchBucket), khoa sai/het han (403), va bucket o project khac.
   */
  private async probe(): Promise<MediaStoreHealth> {
    try {
      await this.client.send(
        new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: 'media/', MaxKeys: 1 }),
      );
      return { healthy: true, detail: `s3: doc duoc bucket ${this.config.bucket}` };
    } catch (error: unknown) {
      // Thong diep cua AWS SDK khong chua khoa, nhung van cat ngan de khong do ca stack vao UI.
      const reason = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        detail: `s3: khong doc duoc bucket ${this.config.bucket} — ${reason.slice(0, 200)}`,
      };
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}
