import { Injectable, Logger, Optional } from '@nestjs/common';
import type { LeadPayload, TestZaloPayload, ZaloNotificationConfig } from '@netviet/shared';
import { ZaloUserClient } from '../channels/zalo-user.client.js';
import { GroupParticipantsRepository } from '../groups/group-participants.repository.js';
import { ThreadType } from 'zca-js';

export interface ZaloDispatchResult {
  success: boolean;
  message?: string;
  recipientsSent: string[];
}

@Injectable()
export class ZaloLeadDispatcher {
  private readonly logger = new Logger(ZaloLeadDispatcher.name);

  constructor(
    private readonly zaloClient: ZaloUserClient,
    @Optional() private readonly participantsRepo?: GroupParticipantsRepository,
  ) {}

  async sendLeadZalo(payload: LeadPayload, config: ZaloNotificationConfig): Promise<ZaloDispatchResult> {
    if (!config.enabled) {
      return { success: false, message: 'Kênh gửi Zalo đang bị tắt trong cấu hình', recipientsSent: [] };
    }

    const messageText = this.formatMessage(payload);
    return this.dispatchMessage(messageText, config);
  }

  async sendTestZalo(testPayload: TestZaloPayload, config: ZaloNotificationConfig): Promise<{ success: boolean; message?: string; recipientsSent?: string[] }> {
    const time = new Date().toLocaleString('vi-VN');
    const testMessage = [
      '🔔 [NEXAGNET TEST] KIỂM TRA KẾT NỐI GỬI THÔNG BÁO ZALO',
      '━━━━━━━━━━━━━━━━━━━━━',
      '✅ Hệ thống điều phối thông báo Zalo hoạt động bình thường.',
      `⏰ Thời gian: ${time}`,
      '━━━━━━━━━━━━━━━━━━━━━',
      'Nexagnet Platform Lead Notification System',
    ].join('\n');

    const mergedConfig: ZaloNotificationConfig = {
      ...config,
      ...(testPayload.targetNames ? { targetMemberNames: testPayload.targetNames } : {}),
      ...(testPayload.targetMemberIds ? { targetMemberIds: testPayload.targetMemberIds } : {}),
      ...(testPayload.targetGroupId ? { targetGroupIds: [testPayload.targetGroupId] } : {}),
    };

    return this.dispatchMessage(testMessage, mergedConfig);
  }

  private async dispatchMessage(text: string, config: ZaloNotificationConfig): Promise<ZaloDispatchResult> {
    const targetGroupIds = config.targetGroupIds ?? [];
    const targetMemberIds = config.targetMemberIds ?? [];
    const targetMemberNames = config.targetMemberNames ?? [];
    if (
      targetGroupIds.length === 0 &&
      targetMemberIds.length === 0 &&
      targetMemberNames.length === 0
    ) {
      return {
        success: false,
        message: 'Chưa cấu hình người nhận Zalo; không gửi thông báo.',
        recipientsSent: [],
      };
    }

    if (!this.zaloClient.isReady()) {
      const status = this.zaloClient.status();
      const msg = `Tài khoản Zalo chưa sẵn sàng gửi (Trạng thái: ${status.state}, Channel: ${status.channelMode}). Vui lòng quét mã QR để đăng nhập.`;
      this.logger.warn(msg);
      return { success: false, message: msg, recipientsSent: [] };
    }

    const recipientsSent: string[] = [];
    const errors: string[] = [];

    // 1. Gửi vào các targetGroupIds được cấu hình
    if (targetGroupIds.length > 0) {
      for (const groupId of targetGroupIds) {
        try {
          await this.zaloClient.sendMessage(groupId, text, undefined, ThreadType.Group);
          recipientsSent.push(`Group: ${groupId}`);
          this.logger.log(`Đã gửi thông báo Zalo tới nhóm: ${groupId}`);
        } catch (err) {
          const errorMsg = `Lỗi gửi nhóm ${groupId}: ${(err as Error).message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }
    }

    // 2. Gửi trực tiếp tới các targetMemberIds
    if (targetMemberIds.length > 0) {
      for (const memberId of targetMemberIds) {
        try {
          await this.zaloClient.sendMessage(memberId, text, undefined, ThreadType.User);
          recipientsSent.push(`Member ID: ${memberId}`);
          this.logger.log(`Đã gửi thông báo Zalo trực tiếp tới member ID: ${memberId}`);
        } catch (err) {
          const errorMsg = `Lỗi gửi member ID ${memberId}: ${(err as Error).message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }
    }

    // 3. Tìm thành viên theo tên được cấu hình tường minh trong các nhóm đã đồng bộ.
    if (targetMemberNames.length > 0 && this.participantsRepo) {
      try {
        const allowedGroupIds = this.zaloClient.status().allowedGroupIds || [];
        for (const groupId of allowedGroupIds) {
          const { participants } = await this.participantsRepo.list(groupId, { active: true });
          for (const targetName of targetMemberNames) {
            const normalizedTarget = targetName.toLowerCase().trim();
            const matched = participants.filter(
              (p) =>
                p.displayName.toLowerCase().includes(normalizedTarget) ||
                (p.zaloName && p.zaloName.toLowerCase().includes(normalizedTarget)),
            );

            for (const member of matched) {
              const recipientKey = `Member: ${member.displayName} (${member.externalUserId})`;
              if (recipientsSent.includes(recipientKey) || recipientsSent.includes(`Member ID: ${member.externalUserId}`)) {
                continue;
              }

              try {
                await this.zaloClient.sendMessage(member.externalUserId, text, undefined, ThreadType.User);
                recipientsSent.push(recipientKey);
                this.logger.log(`Đã gửi thông báo Zalo tới ${recipientKey}`);
              } catch (err) {
                const errorMsg = `Lỗi gửi tới ${member.displayName} (${member.externalUserId}): ${(err as Error).message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Lỗi khi tra cứu thành viên Zalo theo tên: ${(err as Error).message}`);
      }
    }

    if (recipientsSent.length === 0) {
      const msg = errors.length > 0
        ? `Không thể gửi tin nhắn Zalo: ${errors.join('; ')}`
        : `Không tìm thấy người nhận Zalo phù hợp (Danh sách tìm: ${targetMemberNames.join(', ')}). Vui lòng đồng bộ thành viên nhóm hoặc cấu hình Target Group/Member ID.`;
      return { success: false, message: msg, recipientsSent: [] };
    }

    return {
      success: true,
      recipientsSent,
      message: errors.length > 0 ? `Đã gửi tới ${recipientsSent.length} người nhận, ${errors.length} lỗi` : undefined,
    };
  }

  private formatMessage(payload: LeadPayload): string {
    const time = payload.createdAt || new Date().toLocaleString('vi-VN');
    return [
      '🔔 [NEXAGNET] YÊU CẦU ĐĂNG KÝ TRAO ĐỔI GIẢI PHÁP 1-1',
      '━━━━━━━━━━━━━━━━━━━━━',
      `👤 Khách hàng: ${payload.fullName}`,
      `🏢 Doanh nghiệp: ${payload.company}`,
      `📞 SĐT / Zalo: ${payload.phone}`,
      `✉️ Email: ${payload.email}`,
      `🎯 Lĩnh vực / Quy trình: ${payload.workflow}`,
      `📝 Ghi chú: ${payload.note || '(Không có)'}`,
      `⏰ Thời gian: ${time}`,
      '━━━━━━━━━━━━━━━━━━━━━',
      '👉 Vui lòng liên hệ phản hồi khách hàng trong vòng 15-30 phút!',
    ].join('\n');
  }
}
