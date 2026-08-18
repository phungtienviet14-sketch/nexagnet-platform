import { Logger } from '@nestjs/common';
import type { OutboundContent } from '@netviet/shared';
import type { OutboundReceipt } from '../messages/outbound-recorder.js';
import { ChannelAdapter } from './channel-adapter.js';
import type { ZaloOutboundImage, ZaloUserClient } from './zalo-user.client.js';

/** Chan mot URL doc hoac mot tep khong lo lam nghen tien trinh gui. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Adapter GUI tin qua zca-js (userbot tai khoan ca nhan, CHANNEL_MODE=zca).
 * Uy quyen cho ZaloUserClient (giu phien). chatId phia kenh = threadId nhom Zalo.
 * Loi gui (chua dang nhap / mang) nem len -> OrdersService.approve xu ly (giu pending_review).
 */
export class ZcaAdapter extends ChannelAdapter {
  readonly name = 'zca';
  /**
   * zca-js gui duoc attachment bang Buffer, nen zca GUI DUOC ANH THAT. Truoc 15/08/2026 lop nay
   * khong khai `capabilities` nen thua ke mac dinh `image: false` — va zca la KENH CHINH GĐ1, tuc
   * anh san pham bi ha cap thanh mot dong link chu tren dung kenh khach dung nhieu nhat.
   * `video: false` van dung: zca-js co gui video nhung ta khong nhung video (7 GB), video di link.
   */
  override readonly capabilities = { text: true, image: true, video: false, file: false } as const;
  private readonly logger = new Logger('ZcaAdapter');

  constructor(private readonly client: ZaloUserClient) {
    super();
  }

  async sendMessage(chatId: string, text: string): Promise<OutboundReceipt> {
    return this.client.sendMessage(chatId, text);
  }

  /**
   * Ca chum anh + chu di trong MOT tin (khac Bot Platform: moi anh mot request).
   *
   * Anh tai duoc bao nhieu thi gui bay nhieu: mot URL hong khong duoc lam rot ca cau tra loi tu
   * van. Hong het thi lui ve gui text kem link anh — khach van co thu de bam.
   */
  override async sendContent(
    chatId: string,
    content: OutboundContent,
  ): Promise<OutboundReceipt> {
    const links = content.links?.map((link) => `${link.label}: ${link.url}`) ?? [];
    const text = [content.text, ...links].join('\n');
    const urls = content.images?.map((image) => image.url) ?? [];
    if (!urls.length) return this.sendMessage(chatId, text);

    const images: ZaloOutboundImage[] = [];
    for (const url of urls) {
      const image = await this.download(url);
      if (image) images.push(image);
    }
    if (!images.length) {
      this.logger.warn('Khong tai duoc anh nao — gui text kem link anh.');
      return this.sendMessage(chatId, [text, ...urls.map((url) => `Ảnh: ${url}`)].join('\n'));
    }
    return this.client.sendMessageWithImages(chatId, text, images);
  }

  private async download(url: string): Promise<ZaloOutboundImage | null> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
        throw new Error(`kich thuoc khong hop le: ${bytes.length} byte`);
      }
      return { data: bytes, filename: filenameFor(url) };
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Bo qua anh ${url}: ${detail}`);
      return null;
    }
  }
}

/** zca-js doi `filename` kieu `${string}.${string}`; URL khong co duoi thi mac dinh .webp. */
function filenameFor(url: string): `${string}.${string}` {
  const last = url.split('/').pop()?.split('?')[0] ?? '';
  return /^[^.]+\.[^.]+$/.test(last) ? (last as `${string}.${string}`) : 'product.webp';
}
