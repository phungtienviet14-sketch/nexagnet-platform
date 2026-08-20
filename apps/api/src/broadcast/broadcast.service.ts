import { BadRequestException, Injectable } from '@nestjs/common';
import type { BroadcastRequest, BroadcastResult } from '@netviet/shared';
import { autoLabel } from '../channels/auto-label.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';

/**
 * Backward-compatible preview only. Sending via the old HTTP for/sleep path is rejected so callers
 * cannot bypass approval, persistent deliveries, cancellation, audit, or restart recovery.
 */
@Injectable()
export class BroadcastService {
  constructor(private readonly knowledge: KnowledgeService) {}

  async broadcast(request: BroadcastRequest): Promise<BroadcastResult> {
    const groups = this.knowledge.groups();
    const targets =
      request.groupChatIds && request.groupChatIds.length > 0
        ? groups.filter((group) => request.groupChatIds?.includes(group.chatId))
        : groups;
    if (!request.dryRun) {
      throw new BadRequestException(
        'Gui broadcast truc tiep da dung. Hay tao, duyet va len lich campaign tai /settings.',
      );
    }
    return {
      dryRun: true,
      labeledText: request.text + autoLabel(),
      total: targets.length,
      sent: 0,
      failed: 0,
      results: targets.map((target) => ({
        chatId: target.chatId,
        groupName: target.name,
        ok: false,
      })),
    };
  }
}

