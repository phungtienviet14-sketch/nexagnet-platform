import type { ChannelCapabilities, OutboundContent } from '@netviet/shared';
import type { OutboundReceipt } from '../messages/outbound-recorder.js';

/**
 * Tang 1 — moi kenh (Bot Platform / Co-pilot / Mock) trien khai interface nay.
 * Pipeline khong phu thuoc kenh cu the (thiet ke hop nhat muc 3).
 */
export abstract class ChannelAdapter {
  abstract readonly name: string;
  readonly capabilities: ChannelCapabilities = {
    text: true,
    image: false,
    video: false,
    file: false,
  };

  /**
   * Gui van ban ve mot cuoc hoi thoai (chatId phia kenh).
   *
   * Tra ve `OutboundReceipt` (Pha 1): kenh nao cap duoc id tin da gui thi dien vao, de tin
   * outbound luu trong DB mang DUNG id Zalo — can cho ca lich su hoi thoai lan reply/quote.
   * Kenh khong cap id thi tra `{}`, recorder tu sinh id noi bo.
   */
  abstract sendMessage(chatId: string, text: string): Promise<OutboundReceipt>;

  /**
   * GĐ1 chi dam bao text + image neu kenh advertise image=true.
   * Video/PDF/catalog di bang link trong text, khong gia lap sendVideo/sendFile.
   */
  async sendContent(chatId: string, content: OutboundContent): Promise<OutboundReceipt> {
    if (content.images?.length && !this.capabilities.image) {
      throw new Error(`Kênh ${this.name} không hỗ trợ ảnh outbound`);
    }
    const links = content.links?.map((link) => `${link.label}: ${link.url}`) ?? [];
    const imageLines = content.images?.map((image) => `Ảnh: ${image.url}`) ?? [];
    return this.sendMessage(chatId, [content.text, ...imageLines, ...links].join('\n'));
  }
}
