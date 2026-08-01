/**
 * DTO cho cong demo (/demo/*). Dung chung backend + web de tranh khai bao trung.
 */

/** 1 nhom Zalo da map — dung cho bo chon nhom khi giả lập tin (GET /demo/groups). */
export interface DemoGroup {
  chatId: string;
  name: string;
  dealerName: string | null;
  branch: string;
}

/**
 * Che do van hanh demo (GET /demo/config) — de topbar console hien badge TRUNG THUC
 * (bot bat/tat, parser dang dung). Read-only, khong lo secret.
 */
export interface DemoConfig {
  botMode: 'on' | 'off';
  /**
   * Kenh Zalo dang dung (nguon su that chon kenh):
   *   mock = offline · bot = Bot Platform (@mention) · zca = zca-js userbot (doc moi tin nhom).
   */
  channelMode: 'mock' | 'bot' | 'zca';
  parserMode: 'mock' | 'claude' | 'deepseek' | 'flowise';
  botName: string;
  /** on -> frontend dung SSE /events (real-time); off -> polling. */
  streamMode: 'on' | 'off';
  /** on -> AI tu chot + gui don khi khong co rui ro (khong can Sale duyet). */
  autoSend: 'on' | 'off';
  /** Trang van hanh Zalo duoc bao ve rieng; khong chua secret. */
  zaloOperatorUrl?: string;
}
