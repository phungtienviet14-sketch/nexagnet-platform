import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MediaStore } from './media-store.js';

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

  constructor(private readonly config: S3MediaConfig) {
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
