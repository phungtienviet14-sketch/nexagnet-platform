import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { broadcastRequestSchema, type BroadcastResult } from '@ultty/shared';
import { BroadcastService } from './broadcast.service.js';

/**
 * Cong broadcast (KH2): Sale gui/xem-truoc tin khuyen mai toi cac nhom.
 * Validate zod tai ranh gioi -> tra 400 voi thong bao ro rang khi sai.
 */
@Controller('broadcast')
export class BroadcastController {
  constructor(private readonly broadcast: BroadcastService) {}

  @Post()
  send(@Body() body: unknown): Promise<BroadcastResult> {
    const parsed = broadcastRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    return this.broadcast.broadcast(parsed.data);
  }
}
