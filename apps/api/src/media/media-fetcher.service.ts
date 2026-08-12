import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import pLimit from 'p-limit';
import sharp from 'sharp';
import type { MessageMedia, MessagesRepository } from '../messages/messages.repository.js';
import { buildMediaKey, isAllowedMediaHost } from './media-policy.js';
import { MediaStore } from './media-store.js';

/** Be rong toi da khi luu lai — du doc bien ban giao hang, nho hon ban goc ~5-10 lan. */
const RESIZE_WIDTH = 1600;
const WEBP_QUALITY = 80;
/** Cat bot thong bao loi truoc khi ghi DB: mot stack trace dai khong duoc lam phinh bang messages. */
const MAX_ERROR_LENGTH = 500;

export interface MediaFetcherOptions {
  readonly allowedHosts: readonly string[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly concurrency: number;
}

export interface MediaHealthSnapshot {
  storage: {
    name: string;
    enabled: boolean;
    state: 'disabled' | 'healthy' | 'degraded';
  };
  downloads: {
    attempted: number;
    succeeded: number;
    failed: number;
    inflight: number;
    lastSucceededAt?: string;
    lastFailedAt?: string;
    lastError?: string;
  };
}

interface DownloadCounters {
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly lastSucceededAt?: string;
  readonly lastFailedAt?: string;
  readonly lastError?: string;
}

/**
 * Tai anh Zalo ve kho ben vung (Dot A' Task 2).
 *
 * VI SAO CAN: do that 11/08/2026 cho thay Zalo XOA object phia server sau <=35 ngay — URL dang
 * `photo-stal-16.zdn.vn/gr/jpg/<hash>/<key>.jpg` khong co chu ky, khong co `expires`, va `HEAD`
 * lai link cua 07/07 tra 404. Task 1 da cho tin chi-anh vao DB, nhung DB moi giu CAI LINK; khong
 * tai file ve thi 35 ngay nua van mat.
 *
 * HAI BAT BIEN:
 *  1. Tai anh hong KHONG duoc lam rot tin — moi that bai thanh `mediaError`, tin da o trong DB.
 *  2. Tai chay NGOAI duong di cua tin (`schedule`, khong await) — mang cham khong duoc lam cham
 *     viec chot don.
 */
export class MediaFetcherService implements OnApplicationShutdown {
  private readonly logger = new Logger('MediaFetcher');
  private readonly limit: ReturnType<typeof pLimit>;
  private readonly inflight = new Set<Promise<void>>();
  private counters: DownloadCounters = { attempted: 0, succeeded: 0, failed: 0 };

  constructor(
    private readonly store: MediaStore,
    private readonly messages: MessagesRepository | undefined,
    private readonly options: MediaFetcherOptions,
  ) {
    // p-limit chan bao tai khi nhieu nhom cung gui anh mot luc (200-350 nhom).
    this.limit = pLimit(options.concurrency);
  }

  /** Dat lich tai — TRA VE NGAY. Loi da duoc `archive` nuot het; `catch` day chi la luoi cuoi. */
  schedule(messageId: string, imageUrl: string, sentAt: Date): void {
    if (!this.store.enabled) return;
    const task = this.limit(() => this.archive(messageId, imageUrl, sentAt))
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(`Tai anh tin ${messageId} loi ngoai du kien: ${errorText(error)}`);
      });
    this.inflight.add(task);
    void task.finally(() => this.inflight.delete(task));
  }

  /** Doi moi luot tai dang cho. Dung cho test va cho luc tat may — khong bo roi anh dang tai. */
  async drain(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.all([...this.inflight]);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.drain();
  }

  /** Snapshot chi so lieu van hanh; khong lo bucket, endpoint hay credential. */
  health(): MediaHealthSnapshot {
    const enabled = this.store.enabled;
    return {
      storage: {
        name: this.store.name,
        enabled,
        state: !enabled ? 'disabled' : this.counters.failed > 0 ? 'degraded' : 'healthy',
      },
      downloads: {
        ...this.counters,
        inflight: this.inflight.size,
      },
    };
  }

  /**
   * Tai 1 anh ve kho va ghi ket qua vao dong tin. KHONG BAO GIO NEM.
   * `null` = kho tat (MEDIA_STORE=none): khong lam gi va cung khong ghi mediaError gia.
   */
  async archive(messageId: string, imageUrl: string, sentAt: Date): Promise<MessageMedia | null> {
    if (!this.store.enabled) return null;
    this.counters = { ...this.counters, attempted: this.counters.attempted + 1 };
    let media: MessageMedia;
    try {
      const downloaded = await this.download(messageId, imageUrl, sentAt);
      media = downloaded;
      this.counters = {
        ...this.counters,
        succeeded: this.counters.succeeded + 1,
        lastSucceededAt: downloaded.fetchedAt.toISOString(),
      };
    } catch (error) {
      media = { error: errorText(error).slice(0, MAX_ERROR_LENGTH) };
      this.counters = {
        ...this.counters,
        failed: this.counters.failed + 1,
        lastFailedAt: new Date().toISOString(),
        lastError: media.error,
      };
      this.logger.warn(`Khong luu duoc anh cua tin ${messageId}: ${media.error}`);
    }
    await this.record(messageId, media);
    return media;
  }

  private async download(
    messageId: string,
    imageUrl: string,
    sentAt: Date,
  ): Promise<{ key: string; bytes: number; fetchedAt: Date; error?: undefined }> {
    // Chan TRUOC khi ra mang: URL den tu tin nhan, tuc du lieu ben ngoai (SSRF).
    if (!isAllowedMediaHost(imageUrl, this.options.allowedHosts)) {
      throw new Error('Host khong nam trong MEDIA_ALLOWED_HOSTS');
    }
    const key = buildMediaKey(messageId, sentAt);
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(this.options.timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > this.options.maxBytes) {
      throw new Error(`Anh khai ${declared} byte, vuot tran ${this.options.maxBytes}`);
    }
    const raw = await readCapped(response, this.options.maxBytes);
    // sharp vua NEN vua XAC MINH day that su la anh: mot trang HTML "404" se nem o day thay vi
    // duoc luu vao bucket duoi ten .webp.
    const webp = await sharp(raw)
      .rotate()
      .resize({ width: RESIZE_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    await this.store.put(key, webp, 'image/webp');
    return { key, bytes: webp.length, fetchedAt: new Date() };
  }

  /** Ghi ket qua vao dong tin. Loi ghi cung khong duoc noi len (I6). */
  private async record(messageId: string, media: MessageMedia): Promise<void> {
    try {
      await this.messages?.recordMedia(messageId, media);
    } catch (error) {
      this.logger.warn(`Ghi ket qua tai anh cho tin ${messageId} that bai: ${errorText(error)}`);
    }
  }
}

/**
 * Doc than tin CO TRAN. Khong dung thang `arrayBuffer()` vi may chu co the khong khai
 * `content-length` (chunked) hoac khai doi — mot phan hoi khong gioi han se lam het RAM tien trinh.
 */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  // `body` null = khong co than tin (vd 204) -> khong co gi de dem. Tra rong va de sharp bao
  // "khong phai anh" o buoc sau, thay vi viet mot nhanh dem byte khong bao gio chay.
  if (!reader) return Buffer.from(await response.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Anh vuot tran ${maxBytes} byte — huy tai giua chung`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
