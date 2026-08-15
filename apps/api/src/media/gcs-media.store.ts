import { GoogleAuth } from 'google-auth-library';
import {
  MediaStore,
  contentTypeForKey,
  type MediaObject,
  type MediaStoreHealth,
} from './media-store.js';

export interface GcsMediaConfig {
  readonly bucket: string;
  /** JSON API cua GCS. Tach rieng khoi endpoint S3 de hai duong khong lan nhau. */
  readonly endpoint: string;
}

/** Chi xin quyen tren object — tam quyen it nhat du de ghi anh. */
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';

interface TokenSource {
  getAccessToken(): Promise<string>;
}

/**
 * `GoogleAuth.getAccessToken()` khai bao tra `string | null | undefined`. Token rong khong phai
 * truong hop hop le nao ca — no chi xay ra khi ADC hong — nen chan ngay tai day de loi noi dung
 * nguyen nhan, thay vi de request di tiep roi nhan mot 401 kho hieu.
 */
function defaultTokenSource(): TokenSource {
  const auth = new GoogleAuth({ scopes: [SCOPE] });
  return {
    async getAccessToken(): Promise<string> {
      const token = await auth.getAccessToken();
      if (!token) throw new Error('ADC tra ve token rong — may chu chua co danh tinh Google');
      return token;
    },
  };
}

/**
 * Kho production tren GCP, xac thuc bang ADC — tai khoan dich vu GAN SAN tren may chu.
 *
 * Vi sao khong di duong S3 o day (chot 13/08/2026): GCS chi ky duoc request S3 bang KHOA HMAC, ma
 * to chuc dang bat `constraints/iam.disableServiceAccountKeyCreation` nen khong tao duoc khoa. ADC
 * di bang danh tinh cua chinh may chu: khong sinh bi mat dai han nao de ro ri, khong co gi phai
 * xoay vong, va thu hoi bang cach go IAM binding chu khong phai di tim khoa da phat.
 *
 * `S3MediaStore` VAN CON va van la duong di OVHcloud — cong `MediaStore` moi la thu giu tinh
 * chuyen doi duoc, khong phai viec chi ton tai mot hien thuc. Doi nha cung cap = doi `MEDIA_STORE`.
 *
 * Bucket phai PRIVATE: anh co the chua PII (CCCD, dia chi khach) — thuoc pham vi ho so D22.
 */
export class GcsMediaStore extends MediaStore {
  readonly name = 'gcs';
  readonly enabled = true;
  private cached?: { at: number; value: MediaStoreHealth };

  constructor(
    private readonly config: GcsMediaConfig,
    private readonly auth: TokenSource = defaultTokenSource(),
    private readonly ttlMs = 30_000,
    private readonly clock: () => number = Date.now,
  ) {
    super();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const url =
      `${this.config.endpoint}/upload/storage/v1/b/${encodeURIComponent(this.config.bucket)}/o` +
      `?uploadType=media&name=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await this.auth.getAccessToken()}`,
        'content-type': contentType,
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) {
      // NEM co chu y: `MediaFetcherService` bat loi nay va ghi `mediaError` len dong tin, tin nhan
      // van nam nguyen trong DB. Nuot loi o day thi anh mat ma khong con dau vet nao.
      throw new Error(`GCS tu choi ghi ${key}: HTTP ${response.status} ${await safeBody(response)}`);
    }
  }

  /**
   * Doc object ve. Duong JSON API voi `alt=media` — cung endpoint va cung quyen voi `put`, khong
   * xin them scope nao.
   *
   * 404 tra `null` (chua co anh do). Cac loi khac NEM: route catalog phai lo ra 5xx that chu khong
   * duoc gia vo la "khong co anh" — mot bucket sai quyen ma im lang thanh 404 la kieu loi tha ma
   * khong ai di tim.
   */
  override async get(key: string): Promise<MediaObject | null> {
    const url =
      `${this.config.endpoint}/storage/v1/b/${encodeURIComponent(this.config.bucket)}/o/` +
      `${encodeURIComponent(key)}?alt=media`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.auth.getAccessToken()}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GCS tu choi doc ${key}: HTTP ${response.status} ${await safeBody(response)}`);
    }
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? contentTypeForKey(key),
    };
  }

  /**
   * Cham THAT vao bucket bang chinh quyen se dung de ghi.
   *
   * Liet ke 1 object duoi prefix `media/` — chu khong doc metadata bucket — vi tai khoan dich vu
   * chi duoc cap quyen tren OBJECT (`roles/storage.objectAdmin`); hoi metadata bucket se 403 ngay
   * ca khi cau hinh dung, tuc la doi mot bao-xanh-gia lay mot bao-do-gia.
   */
  override async check(): Promise<MediaStoreHealth> {
    const now = this.clock();
    if (this.cached && now - this.cached.at < this.ttlMs) return this.cached.value;
    const value = await this.probe();
    this.cached = { at: now, value };
    return value;
  }

  private async probe(): Promise<MediaStoreHealth> {
    const url =
      `${this.config.endpoint}/storage/v1/b/${encodeURIComponent(this.config.bucket)}/o` +
      '?maxResults=1&prefix=media/';
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${await this.auth.getAccessToken()}` },
      });
      if (!response.ok) {
        return {
          healthy: false,
          detail:
            `gcs: khong doc duoc bucket ${this.config.bucket} — HTTP ${response.status} ` +
            (await safeBody(response)),
        };
      }
      return { healthy: true, detail: `gcs: doc duoc bucket ${this.config.bucket} bang ADC` };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        detail: `gcs: khong lay duoc danh tinh hoac khong goi duoc GCS — ${reason.slice(0, 200)}`,
      };
    }
  }
}

/** Cat ngan than loi cua Google de khong do ca trang JSON vao log/UI. */
async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return '';
  }
}
