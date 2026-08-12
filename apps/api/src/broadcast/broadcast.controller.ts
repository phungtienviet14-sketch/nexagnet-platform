import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { broadcastRequestSchema, type BroadcastResult } from '@netviet/shared';
import { Roles } from '../auth/roles.decorator.js';
import { BroadcastService } from './broadcast.service.js';

/** Legacy compatibility facade. Real send is disabled; campaigns own all outbound bulk work. */
@Controller('broadcast')
export class BroadcastController {
  constructor(private readonly broadcast: BroadcastService) {}

  @Post()
  @Roles('SALE', 'MANAGER', 'ADMIN')
  send(@Body() body: unknown): Promise<BroadcastResult> {
    const parsed = broadcastRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join(', '));
    }
    return this.broadcast.broadcast(parsed.data);
  }
}

