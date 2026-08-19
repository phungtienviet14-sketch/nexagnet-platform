import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { leadPayloadSchema } from '@netviet/shared';
import { Public } from '../auth/public.decorator.js';
import { LeadDispatchService } from './lead-dispatch.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly dispatchService: LeadDispatchService) {}

  /**
   * Endpoint tiếp nhận lead từ trang marketing (nexagnet247.com) hoặc external webhook.
   */
  @Public()
  @Post('leads')
  async receiveLead(
    @Body() body: unknown,
    @Headers('x-actor') actor = 'marketing-form',
  ) {
    const parsed = leadPayloadSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message ?? parsed.error.message ?? 'Dữ liệu không hợp lệ';
      throw new BadRequestException(msg);
    }

    const result = await this.dispatchService.dispatchLead(parsed.data, actor);
    return {
      success: true,
      result,
    };
  }
}
