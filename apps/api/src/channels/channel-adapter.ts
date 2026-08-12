import type { ChannelCapabilities, OutboundContent } from '@netviet/shared';

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

  /** Gui van ban ve mot cuoc hoi thoai (chatId phia kenh). */
  abstract sendMessage(chatId: string, text: string): Promise<void>;

  /**
   * GĐ1 chi dam bao text + image neu kenh advertise image=true.
   * Video/PDF/catalog di bang link trong text, khong gia lap sendVideo/sendFile.
   */
  async sendContent(chatId: string, content: OutboundContent): Promise<void> {
    if (content.image && !this.capabilities.image) {
      throw new Error(`Kênh ${this.name} không hỗ trợ ảnh outbound`);
    }
    const links = content.links?.map((link) => `${link.label}: ${link.url}`) ?? [];
    const imageLine = content.image ? [`Ảnh: ${content.image.url}`] : [];
    await this.sendMessage(chatId, [content.text, ...imageLine, ...links].join('\n'));
  }
}
