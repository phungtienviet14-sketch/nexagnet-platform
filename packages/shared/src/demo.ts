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
