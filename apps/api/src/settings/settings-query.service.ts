import { Injectable, Optional } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { tenantHasCapability, tenantOrderAutomation, tenantReadiness } from '@netviet/tenant';
import { BotIdentityService } from '../channels/bot-identity.service.js';
import { ZaloUserClient, type ZaloGroupView } from '../channels/zalo-user.client.js';
import { PrismaService } from '../config/prisma.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { RuleConfigService } from '../rule-config/rule-config.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { SOURCE_TRUTH_RESOURCES, type SourceTruthResource } from './source-truth-write.service.js';

@Injectable()
export class SettingsQueryService {
  constructor(
    // `messaging` la nang luc TUY CHON. Mot khach chi bat `knowledge` + `operations` khong nap
    // module kenh Zalo, nen hai provider nay khong ton tai trong AppModule cua ho — doi chung
    // bat buoc lam ca tien trinh api khong boot (deploy WATA 21/08/2026 chet dung o day).
    @Optional() private readonly zca: ZaloUserClient | null,
    @Optional() private readonly botIdentity: BotIdentityService | null,
    private readonly knowledge: KnowledgeService,
    private readonly runtime: RuntimeSettingsService,
    private readonly rules: RuleConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async summary() {
    const env = loadEnv();
    const zcaStatus = this.zca?.status() ?? null;
    const activeRule = await this.rules.getActive();
    const groups = await this.groupSummaries();
    return {
      availability: 'available',
      channelMode: env.CHANNEL_MODE,
      // UI phai biet AdminJS co bat khong: khi ADMIN_UI=off thi /admin tra 404, ma trang
      // Nguon su that lai dang chia nut "Mo Admin nang cao" -> bam ra trang loi giua buoi demo.
      adminUi: env.ADMIN_UI,
      zca: zcaStatus,
      zcaState: zcaStatus?.state ?? 'unavailable',
      botIdentity: this.botIdentity?.status() ?? { state: 'disabled' as const },
      autoSend: { enabled: this.runtime.autoSend() === 'on' },
      // `tenantOrderAutomation()` assert nang luc `sales-order` va NEM neu khach khong bat.
      // Trang /settings cua khach chi co `operations` van phai tra loi duoc, nen hoi truoc.
      orderAutomation: tenantHasCapability('sales-order') ? tenantOrderAutomation() : null,
      businessBlockers: tenantReadiness().blockedCapabilities,
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
    // Danh sach nhom la du lieu CUA kenh Zalo. Khach khong bat `messaging` khong co kenh nao,
    // nen khong co nhom nao de tom tat — tra rong thay vi doan ra mot trang thai kenh gia.
    if (!this.zca) return [];
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
        globalId: true,
        name: true,
        status: true,
        dealerId: true,
        dealer: { select: { name: true } },
        participants: { select: { active: true, syncedAt: true } },
      },
    });
    const storedByChat = new Map(stored.map((group) => [group.chatId, group]));
    const storedByGlobalId = new Map(
      stored.flatMap((group) => (group.globalId ? [[group.globalId, group] as const] : [])),
    );
    const liveGroups = zcaGroups.map((group) => {
      const row =
        (group.globalId ? storedByGlobalId.get(group.globalId) : undefined) ??
        storedByChat.get(group.id);
      const participants = row?.participants ?? [];
      const lastSyncedAt = participants
        .map((participant) => participant.syncedAt)
        .sort((left, right) => right.getTime() - left.getTime())[0];
      return {
        ...group,
        groupId: row?.id ?? group.id,
        zcaChatId: group.id,
        // Chua co hang DB = nhom vua thay, chua ai map -> 'pending' (giong mac dinh cua schema).
        status: row?.status ?? 'pending',
        dealerId: row?.dealerId ?? undefined,
        dealerName: row?.dealer?.name ?? mapping.get(group.id)?.dealerName ?? undefined,
        activeParticipants: participants.filter((participant) => participant.active).length,
        inactiveParticipants: participants.filter((participant) => !participant.active).length,
        lastSyncedAt: lastSyncedAt?.toISOString(),
      };
    });
    const liveChatIds = new Set(zcaGroups.map((group) => group.id));
    const liveGlobalIds = new Set(
      zcaGroups.flatMap((group) => (group.globalId ? [group.globalId] : [])),
    );
    const storedOnly = stored
      .filter(
        (group) =>
          !liveChatIds.has(group.chatId) && !(group.globalId && liveGlobalIds.has(group.globalId)),
      )
      .map((group) => {
        const lastSyncedAt = group.participants
          .map((participant) => participant.syncedAt)
          .sort((left, right) => right.getTime() - left.getTime())[0];
        return {
          id: group.chatId,
          groupId: group.id,
          zcaChatId: group.chatId,
          name: group.name ?? `Nhom ${group.chatId}`,
          status: group.status,
          allowed: zcaStatus.allowedGroupIds.includes(group.chatId),
          memberCount: group.participants.length,
          dealerId: group.dealerId ?? undefined,
          dealerName: group.dealer?.name ?? mapping.get(group.chatId)?.dealerName ?? undefined,
          activeParticipants: group.participants.filter((participant) => participant.active).length,
          inactiveParticipants: group.participants.filter((participant) => !participant.active)
            .length,
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
        return this.prisma.price
          .findMany({ include: { period: true }, orderBy: { sku: 'asc' } })
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              periodId: row.periodId,
              sku: row.sku,
              wholesale: row.wholesale,
              minRetailPrice: row.minRetailPrice,
              retailPrice: row.retailPrice,
              listPrice: row.listPrice,
              validMonth: row.period.validMonth,
              periodStatus: row.period.status,
              updatedAt: row.updatedAt,
            })),
          );
      case 'overrides':
        return this.prisma.dealerPriceOverride.findMany({
          orderBy: [{ dealerId: 'asc' }, { sku: 'asc' }],
        });
      case 'glossary':
        return this.prisma.glossaryEntry.findMany({ orderBy: { term: 'asc' } });
    }
  }
}
