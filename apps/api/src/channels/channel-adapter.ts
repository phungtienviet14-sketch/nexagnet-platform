/**
 * Tang 1 — moi kenh (Bot Platform / Co-pilot / Mock) trien khai interface nay.
 * Pipeline khong phu thuoc kenh cu the (thiet ke hop nhat muc 3).
 */
export abstract class ChannelAdapter {
  abstract readonly name: string;
  /** Gui van ban ve mot cuoc hoi thoai (chatId phia kenh). */
  abstract sendMessage(chatId: string, text: string): Promise<void>;
}
