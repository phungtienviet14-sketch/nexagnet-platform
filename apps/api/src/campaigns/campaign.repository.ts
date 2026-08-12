import { randomUUID } from 'node:crypto';
import type {
  CampaignDeliveryStatus,
  CampaignKind,
  CampaignStatus,
  CampaignView,
  CreateCampaignInput,
} from '@netviet/shared';

export interface DeliveryPlan {
  targetId: string;
  scheduledFor: Date;
}

export interface ClaimedCampaignDelivery {
  deliveryId: string;
  campaignId: string;
  chatId: string;
  content: string;
  attempts: number;
  idempotencyKey: string;
}

export abstract class CampaignRepository {
  abstract create(input: CreateCampaignInput): Promise<CampaignView>;
  abstract list(): Promise<CampaignView[]>;
  abstract find(id: string): Promise<CampaignView | null>;
  abstract approve(id: string, actor: string, now: Date): Promise<CampaignView | null>;
  abstract schedule(
    id: string,
    windowStart: Date,
    windowEnd: Date,
    plan: readonly DeliveryPlan[],
    now: Date,
  ): Promise<CampaignView | null>;
  abstract cancel(id: string, now: Date): Promise<CampaignView | null>;
  abstract retryFailed(id: string, now: Date): Promise<CampaignView | null>;
  abstract claimDue(
    workerId: string,
    now: Date,
    leaseSeconds: number,
    limit: number,
    minimumSpacingSeconds: number,
  ): Promise<ClaimedCampaignDelivery[]>;
  abstract markSent(deliveryId: string, now: Date): Promise<void>;
  abstract markFailure(
    deliveryId: string,
    error: string,
    now: Date,
    nextAttemptAt: Date | null,
  ): Promise<void>;
}

interface MemoryTarget {
  id: string;
  groupId?: string;
  chatId: string;
  displayName?: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

interface MemoryDelivery {
  id: string;
  targetId: string;
  status: CampaignDeliveryStatus;
  scheduledFor: Date;
  nextAttemptAt?: Date;
  attempts: number;
  claimedAt?: Date;
  claimedBy?: string;
  claimExpiresAt?: Date;
  sentAt?: Date;
  lastError?: string;
  idempotencyKey: string;
}

interface MemoryCampaign {
  id: string;
  name: string;
  content: string;
  kind: CampaignKind;
  templateKey?: string;
  recurrence?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: CampaignStatus;
  approvedBy?: string;
  approvedAt?: Date;
  windowStart?: Date;
  windowEnd?: Date;
  scheduledAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  targets: MemoryTarget[];
  deliveries: MemoryDelivery[];
}

/** Test/demo repository. Pilot uses Prisma; this preserves the exact lifecycle without a DB. */
export class InMemoryCampaignRepository extends CampaignRepository {
  private readonly campaigns = new Map<string, MemoryCampaign>();

  async create(input: CreateCampaignInput): Promise<CampaignView> {
    const now = new Date();
    const id = randomUUID();
    const campaign: MemoryCampaign = {
      id,
      name: input.name,
      content: input.content,
      kind: input.kind,
      ...(input.templateKey ? { templateKey: input.templateKey } : {}),
      ...(input.recurrence ? { recurrence: input.recurrence } : {}),
      metadata: input.metadata,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      targets: input.targets.map((target) => ({
        id: randomUUID(),
        ...(target.groupId ? { groupId: target.groupId } : {}),
        chatId: target.chatId,
        ...(target.displayName ? { displayName: target.displayName } : {}),
        enabled: true,
        metadata: target.metadata,
      })),
      deliveries: [],
    };
    this.campaigns.set(id, campaign);
    return toView(campaign);
  }

  async list(): Promise<CampaignView[]> {
    return [...this.campaigns.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(toView);
  }

  async find(id: string): Promise<CampaignView | null> {
    const campaign = this.campaigns.get(id);
    return campaign ? toView(campaign) : null;
  }

  async approve(id: string, actor: string, now: Date): Promise<CampaignView | null> {
    const campaign = this.campaigns.get(id);
    if (!campaign || campaign.status !== 'draft') return null;
    const next = { ...campaign, status: 'approved' as const, approvedBy: actor, approvedAt: now, updatedAt: now };
    this.campaigns.set(id, next);
    return toView(next);
  }

  async schedule(
    id: string,
    windowStart: Date,
    windowEnd: Date,
    plan: readonly DeliveryPlan[],
    now: Date,
  ): Promise<CampaignView | null> {
    const campaign = this.campaigns.get(id);
    if (!campaign || campaign.status !== 'approved') return null;
    const deliveries = plan.map((item) => ({
      id: randomUUID(),
      targetId: item.targetId,
      status: 'pending' as const,
      scheduledFor: item.scheduledFor,
      attempts: 0,
      idempotencyKey: `${id}:${item.targetId}`,
    }));
    const next: MemoryCampaign = {
      ...campaign,
      status: 'scheduled',
      windowStart,
      windowEnd,
      scheduledAt: now,
      updatedAt: now,
      deliveries,
    };
    this.campaigns.set(id, next);
    return toView(next);
  }

  async cancel(id: string, now: Date): Promise<CampaignView | null> {
    const campaign = this.campaigns.get(id);
    if (!campaign || ['completed', 'partially_failed', 'cancelled'].includes(campaign.status)) return null;
    const next: MemoryCampaign = {
      ...campaign,
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
      deliveries: campaign.deliveries.map((delivery) =>
        delivery.status === 'sent' ? delivery : { ...delivery, status: 'cancelled' },
      ),
    };
    this.campaigns.set(id, next);
    return toView(next);
  }

  async retryFailed(id: string, now: Date): Promise<CampaignView | null> {
    const campaign = this.campaigns.get(id);
    if (!campaign || !['partially_failed', 'running'].includes(campaign.status)) return null;
    const hasFailed = campaign.deliveries.some((delivery) => delivery.status === 'failed');
    if (!hasFailed) return null;
    const next: MemoryCampaign = {
      ...campaign,
      status: 'running',
      updatedAt: now,
      deliveries: campaign.deliveries.map((delivery) =>
        delivery.status === 'failed'
          ? { ...delivery, status: 'pending', nextAttemptAt: now, lastError: undefined }
          : delivery,
      ),
    };
    this.campaigns.set(id, next);
    return toView(next);
  }

  async claimDue(
    workerId: string,
    now: Date,
    leaseSeconds: number,
    limit: number,
    minimumSpacingSeconds: number,
  ) {
    const mostRecentOutbound = [...this.campaigns.values()]
      .flatMap((campaign) => campaign.deliveries)
      .flatMap((delivery) => [delivery.claimedAt, delivery.sentAt])
      .filter((value): value is Date => value instanceof Date)
      .reduce((latest, value) => Math.max(latest, value.getTime()), 0);
    if (mostRecentOutbound > now.getTime() - minimumSpacingSeconds * 1_000) return [];
    const due: Array<{ campaign: MemoryCampaign; delivery: MemoryDelivery }> = [];
    for (const campaign of this.campaigns.values()) {
      if (!['scheduled', 'running'].includes(campaign.status)) continue;
      for (const delivery of campaign.deliveries) {
        const unclaimedDue =
          delivery.status === 'pending' &&
          delivery.scheduledFor <= now &&
          (!delivery.nextAttemptAt || delivery.nextAttemptAt <= now);
        const expired = delivery.status === 'claimed' && Boolean(delivery.claimExpiresAt && delivery.claimExpiresAt <= now);
        if (unclaimedDue || expired) due.push({ campaign, delivery });
      }
    }
    due.sort((a, b) => a.delivery.scheduledFor.getTime() - b.delivery.scheduledFor.getTime());
    // Campaign spacing is silo-global. One claim per atomic tick keeps catch-up after downtime from
    // becoming a burst; the persistent timestamp gate handles restart.
    const selected = due.slice(0, Math.min(limit, 1));
    const selectedIds = new Set(selected.map(({ delivery }) => delivery.id));
    const claimedById = new Map<string, MemoryDelivery>();
    for (const [campaignId, campaign] of this.campaigns) {
      if (!campaign.deliveries.some((delivery) => selectedIds.has(delivery.id))) continue;
      const deliveries = campaign.deliveries.map((delivery) => {
        if (!selectedIds.has(delivery.id)) return delivery;
        const claimed: MemoryDelivery = {
          ...delivery,
          status: 'claimed',
          claimedAt: now,
          claimedBy: workerId,
          claimExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000),
          attempts: delivery.attempts + 1,
        };
        claimedById.set(delivery.id, claimed);
        return claimed;
      });
      this.campaigns.set(campaignId, {
        ...campaign,
        status: 'running',
        updatedAt: now,
        deliveries,
      });
    }
    return selected.map(({ campaign, delivery }) => {
      const claimed = claimedById.get(delivery.id);
      if (!claimed) throw new Error('Campaign claim missing');
      const target = campaign.targets.find((row) => row.id === delivery.targetId);
      if (!target) throw new Error('Campaign target missing');
      return {
        deliveryId: claimed.id,
        campaignId: campaign.id,
        chatId: target.chatId,
        content: campaign.content,
        attempts: claimed.attempts,
        idempotencyKey: claimed.idempotencyKey,
      };
    });
  }

  async markSent(deliveryId: string, now: Date): Promise<void> {
    this.updateDelivery(deliveryId, (delivery) => {
      const {
        claimedAt: _claimedAt,
        claimedBy: _claimedBy,
        claimExpiresAt: _claimExpiresAt,
        nextAttemptAt: _nextAttemptAt,
        lastError: _lastError,
        ...stable
      } = delivery;
      return {
      ...stable,
      status: 'sent',
      sentAt: now,
    };
    }, now);
  }

  async markFailure(deliveryId: string, error: string, now: Date, nextAttemptAt: Date | null): Promise<void> {
    this.updateDelivery(deliveryId, (delivery) => {
      const {
        claimedAt: _claimedAt,
        claimedBy: _claimedBy,
        claimExpiresAt: _claimExpiresAt,
        nextAttemptAt: _nextAttemptAt,
        ...stable
      } = delivery;
      return {
      ...stable,
      status: nextAttemptAt ? 'pending' : 'failed',
      ...(nextAttemptAt ? { nextAttemptAt } : {}),
      lastError: error,
    };
    }, now);
  }

  private updateDelivery(
    deliveryId: string,
    update: (delivery: MemoryDelivery) => MemoryDelivery,
    now: Date,
  ): void {
    for (const [id, campaign] of this.campaigns) {
      const index = campaign.deliveries.findIndex((delivery) => delivery.id === deliveryId);
      if (index < 0 || campaign.deliveries[index]?.status !== 'claimed') continue;
      const deliveries = campaign.deliveries.map((delivery, current) => current === index ? update(delivery) : delivery);
      const next = { ...campaign, deliveries, updatedAt: now };
      next.status = completionStatus(next);
      this.campaigns.set(id, next);
      return;
    }
  }
}

function completionStatus(campaign: MemoryCampaign): CampaignStatus {
  if (campaign.status === 'cancelled') return 'cancelled';
  if (campaign.deliveries.length > 0 && campaign.deliveries.every((row) => row.status === 'sent')) return 'completed';
  if (
    campaign.deliveries.length > 0 &&
    campaign.deliveries.every((row) => ['sent', 'failed', 'cancelled'].includes(row.status)) &&
    campaign.deliveries.some((row) => row.status === 'failed')
  ) return 'partially_failed';
  return campaign.status === 'scheduled' ? 'scheduled' : 'running';
}

function toView(campaign: MemoryCampaign): CampaignView {
  return {
    id: campaign.id,
    name: campaign.name,
    content: campaign.content,
    kind: campaign.kind,
    ...(campaign.templateKey ? { templateKey: campaign.templateKey } : {}),
    ...(campaign.recurrence ? { recurrence: structuredClone(campaign.recurrence) } : {}),
    metadata: structuredClone(campaign.metadata),
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
      metadata: structuredClone(target.metadata),
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
