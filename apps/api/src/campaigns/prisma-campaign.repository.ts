import type { Campaign, CampaignDelivery, CampaignTarget, Prisma } from '@prisma/client';
import type { CampaignView, CreateCampaignInput } from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';
import {
  CampaignRepository,
  type ClaimedCampaignDelivery,
  type DeliveryPlan,
} from './campaign.repository.js';

type FullCampaign = Campaign & {
  targets: CampaignTarget[];
  deliveries: CampaignDelivery[];
};

const FULL = { targets: true, deliveries: true } as const;

export class PrismaCampaignRepository extends CampaignRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateCampaignInput): Promise<CampaignView> {
    const campaign = await this.prisma.campaign.create({
      data: {
        name: input.name,
        content: input.content,
        kind: input.kind,
        templateKey: input.templateKey,
        recurrence: input.recurrence as Prisma.InputJsonValue | undefined,
        metadata: input.metadata as Prisma.InputJsonValue,
        targets: {
          create: input.targets.map((target) => ({
            groupId: target.groupId,
            chatId: target.chatId,
            displayName: target.displayName,
            metadata: target.metadata as Prisma.InputJsonValue,
          })),
        },
      },
      include: FULL,
    });
    return toView(campaign);
  }

  async list(): Promise<CampaignView[]> {
    const campaigns = await this.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: FULL,
    });
    return campaigns.map(toView);
  }

  async find(id: string): Promise<CampaignView | null> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id }, include: FULL });
    return campaign ? toView(campaign) : null;
  }

  async approve(id: string, actor: string, now: Date): Promise<CampaignView | null> {
    const changed = await this.prisma.campaign.updateMany({
      where: { id, status: 'draft' },
      data: { status: 'approved', approvedBy: actor, approvedAt: now },
    });
    return changed.count === 1 ? this.find(id) : null;
  }

  async schedule(
    id: string,
    windowStart: Date,
    windowEnd: Date,
    plan: readonly DeliveryPlan[],
    now: Date,
  ): Promise<CampaignView | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.campaign.updateMany({
        where: { id, status: 'approved' },
        data: { status: 'scheduled', windowStart, windowEnd, scheduledAt: now },
      });
      if (changed.count !== 1) return null;
      await tx.campaignDelivery.createMany({
        data: plan.map((item) => ({
          campaignId: id,
          targetId: item.targetId,
          scheduledFor: item.scheduledFor,
          idempotencyKey: `${id}:${item.targetId}`,
        })),
        skipDuplicates: true,
      });
      const campaign = await tx.campaign.findUnique({ where: { id }, include: FULL });
      return campaign ? toView(campaign) : null;
    });
  }

  async cancel(id: string, now: Date): Promise<CampaignView | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.campaign.updateMany({
        where: { id, status: { in: ['draft', 'approved', 'scheduled', 'running'] } },
        data: { status: 'cancelled', cancelledAt: now },
      });
      if (changed.count !== 1) return null;
      await tx.campaignDelivery.updateMany({
        where: { campaignId: id, status: { not: 'sent' } },
        data: { status: 'cancelled', claimedAt: null, claimedBy: null, claimExpiresAt: null },
      });
      const campaign = await tx.campaign.findUnique({ where: { id }, include: FULL });
      return campaign ? toView(campaign) : null;
    });
  }

  async retryFailed(id: string, now: Date): Promise<CampaignView | null> {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id, status: { in: ['partially_failed', 'running'] } },
      });
      if (!campaign) return null;
      const retried = await tx.campaignDelivery.updateMany({
        where: { campaignId: id, status: 'failed' },
        data: { status: 'pending', nextAttemptAt: now, lastError: null },
      });
      if (retried.count === 0) return null;
      await tx.campaign.update({ where: { id }, data: { status: 'running' } });
      const result = await tx.campaign.findUnique({ where: { id }, include: FULL });
      return result ? toView(result) : null;
    });
  }

  /**
   * PostgreSQL row locks make claim atomic across workers. Expired leases are reclaimable after a
   * crashed process; SKIP LOCKED lets another worker keep progressing without waiting.
   */
  async claimDue(
    workerId: string,
    now: Date,
    leaseSeconds: number,
    limit: number,
    minimumSpacingSeconds: number,
  ): Promise<ClaimedCampaignDelivery[]> {
    return this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(2071164281) AS acquired
      `;
      if (!lock?.acquired) return [];
      const spacingBoundary = new Date(now.getTime() - minimumSpacingSeconds * 1_000);
      const [recent] = await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM "CampaignDelivery"
          WHERE "claimedAt" > ${spacingBoundary} OR "sentAt" > ${spacingBoundary}
        ) AS exists
      `;
      if (recent?.exists) return [];
      const due = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT d."id"
        FROM "CampaignDelivery" d
        JOIN "Campaign" c ON c."id" = d."campaignId"
        WHERE c."status" IN ('scheduled'::"CampaignStatus", 'running'::"CampaignStatus")
          AND (
            (d."status" = 'pending'::"CampaignDeliveryStatus"
              AND d."scheduledFor" <= ${now}
              AND (d."nextAttemptAt" IS NULL OR d."nextAttemptAt" <= ${now}))
            OR
            (d."status" = 'claimed'::"CampaignDeliveryStatus"
              AND d."claimExpiresAt" <= ${now})
          )
        ORDER BY d."scheduledFor" ASC
        FOR UPDATE OF d SKIP LOCKED
        LIMIT ${Math.min(limit, 1)}
      `;
      if (due.length === 0) return [];
      const ids = due.map((row) => row.id);
      const claimExpiresAt = new Date(now.getTime() + leaseSeconds * 1_000);
      await tx.campaignDelivery.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'claimed',
          claimedAt: now,
          claimedBy: workerId,
          claimExpiresAt,
          attempts: { increment: 1 },
        },
      });
      const claimed = await tx.campaignDelivery.findMany({
        where: { id: { in: ids }, claimedBy: workerId, claimExpiresAt },
        include: { target: true, campaign: true },
      });
      await tx.campaign.updateMany({
        where: { id: { in: [...new Set(claimed.map((row) => row.campaignId))] }, status: 'scheduled' },
        data: { status: 'running' },
      });
      const byId = new Map(claimed.map((row) => [row.id, row]));
      return ids.flatMap((id) => {
        const row = byId.get(id);
        return row
          ? [{
              deliveryId: row.id,
              campaignId: row.campaignId,
              chatId: row.target.chatId,
              content: row.campaign.content,
              attempts: row.attempts,
              idempotencyKey: row.idempotencyKey,
            }]
          : [];
      });
    });
  }

  async markSent(deliveryId: string, now: Date): Promise<void> {
    const delivery = await this.prisma.campaignDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'sent',
        sentAt: now,
        lastError: null,
        nextAttemptAt: null,
        claimedAt: null,
        claimedBy: null,
        claimExpiresAt: null,
      },
      select: { campaignId: true },
    });
    await this.refreshCompletion(delivery.campaignId);
  }

  async markFailure(
    deliveryId: string,
    error: string,
    _now: Date,
    nextAttemptAt: Date | null,
  ): Promise<void> {
    const delivery = await this.prisma.campaignDelivery.update({
      where: { id: deliveryId },
      data: {
        status: nextAttemptAt ? 'pending' : 'failed',
        nextAttemptAt,
        lastError: error,
        claimedAt: null,
        claimedBy: null,
        claimExpiresAt: null,
      },
      select: { campaignId: true },
    });
    await this.refreshCompletion(delivery.campaignId);
  }

  private async refreshCompletion(campaignId: string): Promise<void> {
    const grouped = await this.prisma.campaignDelivery.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    const terminal = grouped
      .filter((row) => ['sent', 'failed', 'cancelled'].includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);
    if (total === 0 || total !== terminal) return;
    const hasFailure = grouped.some((row) => row.status === 'failed' && row._count._all > 0);
    await this.prisma.campaign.updateMany({
      where: { id: campaignId, status: { not: 'cancelled' } },
      data: { status: hasFailure ? 'partially_failed' : 'completed' },
    });
  }
}

function toView(campaign: FullCampaign): CampaignView {
  return {
    id: campaign.id,
    name: campaign.name,
    content: campaign.content,
    kind: campaign.kind,
    ...(campaign.templateKey ? { templateKey: campaign.templateKey } : {}),
    ...(campaign.recurrence ? { recurrence: campaign.recurrence as Record<string, unknown> } : {}),
    metadata: campaign.metadata as Record<string, unknown>,
    status: campaign.status,
    ...(campaign.approvedBy ? { approvedBy: campaign.approvedBy } : {}),
    ...(campaign.approvedAt ? { approvedAt: campaign.approvedAt.toISOString() } : {}),
    ...(campaign.windowStart ? { windowStart: campaign.windowStart.toISOString() } : {}),
    ...(campaign.windowEnd ? { windowEnd: campaign.windowEnd.toISOString() } : {}),
    ...(campaign.scheduledAt ? { scheduledAt: campaign.scheduledAt.toISOString() } : {}),
    ...(campaign.cancelledAt ? { cancelledAt: campaign.cancelledAt.toISOString() } : {}),
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    targets: campaign.targets.map((target) => ({
      id: target.id,
      ...(target.groupId ? { groupId: target.groupId } : {}),
      chatId: target.chatId,
      ...(target.displayName ? { displayName: target.displayName } : {}),
      enabled: target.enabled,
      metadata: target.metadata as Record<string, unknown>,
    })),
    deliveries: campaign.deliveries.map((delivery) => ({
      id: delivery.id,
      targetId: delivery.targetId,
      status: delivery.status,
      scheduledFor: delivery.scheduledFor.toISOString(),
      attempts: delivery.attempts,
      ...(delivery.nextAttemptAt ? { nextAttemptAt: delivery.nextAttemptAt.toISOString() } : {}),
      ...(delivery.claimedAt ? { claimedAt: delivery.claimedAt.toISOString() } : {}),
      ...(delivery.claimExpiresAt ? { claimExpiresAt: delivery.claimExpiresAt.toISOString() } : {}),
      ...(delivery.sentAt ? { sentAt: delivery.sentAt.toISOString() } : {}),
      ...(delivery.lastError ? { lastError: delivery.lastError } : {}),
    })),
  };
}
