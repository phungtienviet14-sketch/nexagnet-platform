import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  emailNotificationConfigSchema,
  testEmailPayloadSchema,
  testZaloPayloadSchema,
  zaloNotificationConfigSchema,
} from '@netviet/shared';
import { Roles } from '../auth/roles.decorator.js';
import { LeadDispatchService } from './lead-dispatch.service.js';
import { NotificationSettingsRepository } from './notification-settings.repository.js';

@Roles('ADMIN', 'MANAGER')
@Controller('settings')
export class SettingsNotificationsController {
  constructor(
    private readonly dispatchService: LeadDispatchService,
    private readonly settingsRepo: NotificationSettingsRepository,
  ) {}

  /**
   * Lấy cấu hình thông báo (đã che mật khẩu SMTP).
   */
  @Get('notifications')
  getSettings() {
    return this.settingsRepo.getMaskedSettings();
  }

  /**
   * Cập nhật cấu hình gửi Email SMTP.
   */
  @Put('notifications/email')
  updateEmailSettings(@Body() body: unknown) {
    const parsed = emailNotificationConfigSchema.partial().safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message ?? parsed.error.message ?? 'Cấu hình Email không hợp lệ';
      throw new BadRequestException(msg);
    }
    return this.settingsRepo.updateEmail(parsed.data);
  }

  /**
   * Cập nhật cấu hình gửi tin Zalo (người nhận, group...).
   */
  @Put('notifications/zalo')
  updateZaloSettings(@Body() body: unknown) {
    const parsed = zaloNotificationConfigSchema.partial().safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message ?? parsed.error.message ?? 'Cấu hình Zalo không hợp lệ';
      throw new BadRequestException(msg);
    }
    return this.settingsRepo.updateZalo(parsed.data);
  }

  /**
   * Kiểm tra gửi Email test.
   */
  @Post('notifications/test-email')
  async testEmail(@Body() body: unknown) {
    const parsed = testEmailPayloadSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message ?? parsed.error.message ?? 'Dữ liệu test Email không hợp lệ';
      throw new BadRequestException(msg);
    }
    return this.dispatchService.testEmail(parsed.data);
  }

  /**
   * Kiểm tra gửi Zalo test.
   */
  @Post('notifications/test-zalo')
  async testZalo(@Body() body: unknown) {
    const parsed = testZaloPayloadSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message ?? parsed.error.message ?? 'Dữ liệu test Zalo không hợp lệ';
      throw new BadRequestException(msg);
    }
    return this.dispatchService.testZalo(parsed.data);
  }

  /**
   * Xem danh sách lead gần đây và trạng thái phát tin.
   */
  @Get('notifications/leads')
  getRecentLeads() {
    return this.dispatchService.getRecentLeads();
  }

  /**
   * Gửi lại (retry) thông báo cho một lead cụ thể.
   */
  @Post('notifications/leads/:leadId/retry')
  async retryLead(
    @Param('leadId') leadId: string,
    @Headers('x-actor') actor = 'operator',
  ) {
    try {
      const result = await this.dispatchService.retryLead(leadId, actor);
      return { success: true, result };
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }
}
