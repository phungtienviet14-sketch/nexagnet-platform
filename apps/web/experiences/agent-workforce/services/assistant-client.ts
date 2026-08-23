import {
  DETERMINISTIC_ASSISTANT_RESPONSES,
  INITIAL_ASSISTANT_CONVERSATION,
} from '../fixtures/assistant';
import type { AssistantMessage } from './types';

export interface AssistantClient {
  getInitialConversation(): Promise<readonly AssistantMessage[]>;
  sendMessage(prompt: string): Promise<AssistantMessage>;
}

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class DemoAssistantClient implements AssistantClient {
  private conversation: AssistantMessage[] = [...INITIAL_ASSISTANT_CONVERSATION];

  async getInitialConversation(): Promise<readonly AssistantMessage[]> {
    return [...this.conversation];
  }

  async sendMessage(prompt: string): Promise<AssistantMessage> {
    const userMsg: AssistantMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    this.conversation.push(userMsg);

    const norm = normalizeKey(prompt);
    let matched = DETERMINISTIC_ASSISTANT_RESPONSES[norm];

    if (!matched) {
      // Fuzzy substring matching
      const foundKey = Object.keys(DETERMINISTIC_ASSISTANT_RESPONSES).find(
        (key) => norm.includes(key) || key.includes(norm),
      );
      if (foundKey) {
        matched = DETERMINISTIC_ASSISTANT_RESPONSES[foundKey];
      }
    }

    const assistantMsg: AssistantMessage = matched
      ? {
          ...matched,
          id: `msg-assistant-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        }
      : {
          id: `msg-assistant-${Date.now()}`,
          sender: 'assistant',
          text: `Tôi đã tiếp nhận yêu cầu: "${prompt}". Với vai trò **AI Trợ lý điều hành**, tôi đã tổng hợp thông tin từ 6 nhóm Agent. Bạn có thể chọn các gợi ý nhanh bên dưới để xem báo cáo chi tiết về công việc cần xử lý, cảnh báo hoặc hoạt động kinh doanh hôm nay.`,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          sources: [
            {
              title: 'Cơ sở Tri thức NetViet',
              category: 'Hệ thống',
              snippet: 'Tổng hợp từ 6 nhóm Agent nghiệp vụ và nguồn sự thật doanh nghiệp.',
            },
          ],
          actionSuggestions: [
            { label: 'Việc cần xử lý hôm nay', actionType: 'custom', prompt: 'Hôm nay có việc gì cần tôi xử lý?' },
            { label: 'Tóm tắt cảnh báo quan trọng', actionType: 'custom', prompt: 'Tóm tắt các cảnh báo quan trọng.' },
            { label: 'Quy trình phê duyệt hợp đồng', actionType: 'custom', prompt: 'Tìm quy trình phê duyệt hợp đồng.' },
          ],
          status: 'info',
        };

    this.conversation.push(assistantMsg);
    return assistantMsg;
  }
}
