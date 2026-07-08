import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  loadEnv,
  type BroadcastRequest,
  type BroadcastResult,
  type BroadcastTargetResult,
} from '@ultty/shared';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';

/** Tham so gioi han khi gui — mac dinh doc tu env, test co the ep de chay nhanh. */
export interface BroadcastOptions {
  /** Gian cach giua 2 lan gui (ms) — tranh vuot rate-limit Zalo (chua cong bo). */
  throttleMs: number;
  /** Tran so nhom moi lan gui — chan blast nham. */
  maxTargets: number;
}

interface Target {
  chatId: string;
  groupName: string | null;
}

/**
 * Gui hang loat tin khuyen mai vao cac nhom (KH2 — pham vi demo).
 * La CONG CU Sale bam (khong phai AI tu dong): moi tin duoc noi AUTO_LABEL,
 * co throttle + tran so nhom de an toan voi rate-limit Zalo chua kiem chung.
 */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger('BroadcastService');

  constructor(
    private readonly channel: ChannelAdapter,
    private readonly knowledge: KnowledgeService,
  ) {}

  async broadcast(
    req: BroadcastRequest,
    options?: Partial<BroadcastOptions>,
  ): Promise<BroadcastResult> {
    const env = loadEnv();
    const throttleMs = options?.throttleMs ?? env.BROADCAST_THROTTLE_MS;
    const maxTargets = options?.maxTargets ?? env.BROADCAST_MAX_TARGETS;

    const targets = this.resolveTargets(req.groupChatIds);
    if (targets.length > maxTargets) {
      throw new BadRequestException(
        `Số nhóm đích (${targets.length}) vượt trần cho phép (${maxTargets}). ` +
          'Chọn ít nhóm hơn hoặc tăng BROADCAST_MAX_TARGETS.',
      );
    }

    const labeledText = req.text + AUTO_LABEL;

    if (req.dryRun) {
      return {
        dryRun: true,
        labeledText,
        total: targets.length,
        sent: 0,
        failed: 0,
        results: targets.map((t) => ({ chatId: t.chatId, groupName: t.groupName, ok: false })),
      };
    }

    const results: BroadcastTargetResult[] = [];
    for (const [i, target] of targets.entries()) {
      try {
        await this.channel.sendMessage(target.chatId, labeledText);
        results.push({ chatId: target.chatId, groupName: target.groupName, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Gửi broadcast tới ${target.chatId} thất bại: ${message}`);
        results.push({ chatId: target.chatId, groupName: target.groupName, ok: false, error: message });
      }
      // Giãn cách giữa các lần gửi (bỏ qua sau lần cuối) để tránh dồn rate-limit.
      if (throttleMs > 0 && i < targets.length - 1) await sleep(throttleMs);
    }

    const sent = results.filter((r) => r.ok).length;
    this.logger.log(`Broadcast xong: ${sent}/${targets.length} nhóm gửi thành công.`);
    return {
      dryRun: false,
      labeledText,
      total: targets.length,
      sent,
      failed: results.length - sent,
      results,
    };
  }

  /** Bo trong groupChatIds -> tat ca nhom da map; nguoc lai loc theo tap chon. */
  private resolveTargets(groupChatIds?: string[]): Target[] {
    const groups = this.knowledge.groups();
    const selected =
      groupChatIds && groupChatIds.length > 0
        ? groups.filter((g) => groupChatIds.includes(g.chatId))
        : groups;
    return selected.map((g) => ({ chatId: g.chatId, groupName: g.name }));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
