import { Injectable } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { BotIdentityService } from '../channels/bot-identity.service.js';
import { ZaloUserClient, type ZaloGroupView } from '../channels/zalo-user.client.js';
import { PrismaService } from '../config/prisma.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { RuleConfigService } from '../rule-config/rule-config.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import {
  SOURCE_TRUTH_RESOURCES,
  type SourceTruthResource,
} from './source-truth-write.service.js';

@Injectable()
export class SettingsQueryService {
  constructor(
    private readonly zca: ZaloUserClient,
    private readonly botIdentity: BotIdentityService,
    private readonly knowledge: KnowledgeService,
    private readonly runtime: RuntimeSettingsService,
    private readonly rules: RuleConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async summary() {
    const env = loadEnv();
    const zcaStatus = this.zca.status();
    const activeRule = await this.rules.getActive();
    const groups = await this.groupSummaries();
    return {
      availability: 'available',
      channelMode: env.CHANNEL_MODE,
      zca: zcaStatus,
      zcaState: zcaStatus.state,
      botIdentity: this.botIdentity.status(),
      autoSend: { enabled: this.runtime.autoSend() === 'on' },
      sourceTruth: {
        status: env.PERSISTENCE === 'prisma' ? 'available' : 'fallback',
        productCount: this.knowledge.products().length,
        dealerCount: this.knowledge.dealers().length,
      },
      rules: {
        status: 'available',
        activeVersion: activeRule ? String(activeRule.version) : undefined,
        provisionalKeys: ['A3.shipping', 'D8.codFee', 'D15.thresholds'],
      },
      groups,
      warnings: [
        ...(env.PERSISTENCE === 'prisma' ? [] : ['Che do memory chi cho xem; khong ghi DB.']),
        'Rank thanh vien khong thay doi don gia; gia van theo dai ly va override SKU.',
      ],
    };
  }

  async sourceTruth(resource: SourceTruthResource): Promise<unknown[]> {
    if (!SOURCE_TRUTH_RESOURCES.includes(resource)) return [];
    if (loadEnv().PERSISTENCE === 'prisma') return this.sourceTruthFromPrisma(resource);
    switch (resource) {
      case 'dealers':
        return this.knowledge.dealers();
      case 'groups':
        return this.knowledge.groups();
      case 'products':
        return this.knowledge.products();
      case 'prices':
        return this.knowledge.prices();
      case 'overrides':
        return this.knowledge.priceOverrides();
      case 'glossary':
        return this.knowledge.glossary();
    }
  }

  private async groupSummaries(): Promise<unknown[]> {
    const zcaStatus = this.zca.status();
    let zcaGroups: ZaloGroupView[] = [];
    try {
      zcaGroups = await this.zca.listGroups();
    } catch {
      // Dang logout van tra duoc summary; UI hien trang thai zca thay vi fail ca trang.
    }
    const mapping = new Map(this.knowledge.groupViews().map((group) => [group.chatId, group]));
    if (loadEnv().PERSISTENCE !== 'prisma') {
      return zcaGroups.map((group) => ({
        ...group,
        zcaChatId: group.id,
        dealerName: mapping.get(group.id)?.dealerName ?? undefined,
      }));
    }
    const stored = await this.prisma.group.findMany({
      select: {
        id: true,
        chatId: true,
        name: true,
        dealerId: true,
        dealer: { select: { name: true } },
        participants: { select: { active: true, syncedAt: true } },
      },
    });
    const storedByChat = new Map(stored.map((group) => [group.chatId, group]));
    const liveGroups = zcaGroups.map((group) => {
      const row = storedByChat.get(group.id);
      const participants = row?.participants ?? [];
      const lastSyncedAt = participants
        .map((participant) => participant.syncedAt)
        .sort((left, right) => right.getTime() - left.getTime())[0];
      return {
        ...group,
        groupId: row?.id ?? group.id,
        zcaChatId: group.id,
        dealerId: row?.dealerId ?? undefined,
        dealerName: row?.dealer?.name ?? mapping.get(group.id)?.dealerName ?? undefined,
        activeParticipants: participants.filter((participant) => participant.active).length,
        inactiveParticipants: participants.filter((participant) => !participant.active).length,
        lastSyncedAt: lastSyncedAt?.toISOString(),
      };
    });
    const liveChatIds = new Set(zcaGroups.map((group) => group.id));
    const storedOnly = stored
      .filter((group) => !liveChatIds.has(group.chatId))
      .map((group) => {
        const lastSyncedAt = group.participants
          .map((participant) => participant.syncedAt)
          .sort((left, right) => right.getTime() - left.getTime())[0];
        return {
          id: group.chatId,
          groupId: group.id,
          zcaChatId: group.chatId,
          name: group.name ?? `Nhom ${group.chatId}`,
          allowed: zcaStatus.allowedGroupIds.includes(group.chatId),
          memberCount: group.participants.length,
          dealerId: group.dealerId ?? undefined,
          dealerName: group.dealer?.name ?? mapping.get(group.chatId)?.dealerName ?? undefined,
          activeParticipants: group.participants.filter((participant) => participant.active).length,
          inactiveParticipants: group.participants.filter((participant) => !participant.active).length,
          lastSyncedAt: lastSyncedAt?.toISOString(),
        };
      });
    return [...liveGroups, ...storedOnly];
  }

  private sourceTruthFromPrisma(resource: SourceTruthResource): Promise<unknown[]> {
    switch (resource) {
      case 'dealers':
        return this.prisma.dealer.findMany({ orderBy: { name: 'asc' } });
      case 'groups':
        return this.prisma.group.findMany({ orderBy: { updatedAt: 'desc' } });
      case 'products':
        return this.prisma.product.findMany({ orderBy: { sku: 'asc' } });
      case 'prices':
        return this.prisma.price.findMany({ orderBy: { sku: 'asc' } });
      case 'overrides':
        return this.prisma.dealerPriceOverride.findMany({ orderBy: [{ dealerId: 'asc' }, { sku: 'asc' }] });
      case 'glossary':
        return this.prisma.glossaryEntry.findMany({ orderBy: { term: 'asc' } });
    }
  }
}
