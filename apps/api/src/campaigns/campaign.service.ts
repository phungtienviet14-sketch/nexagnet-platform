import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { loadEnv, type CampaignView, type CreateCampaignInput, type ScheduleCampaignInput } from '@netviet/shared';
import type { CampaignConfig } from '@netviet/tenant';
import { AuditLogService } from '../audit/audit-log.service.js';
import { AUTO_LABEL } from '../channels/auto-label.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { OutboundRecorder } from '../messages/outbound-recorder.js';
import { CAMPAIGN_POLICY } from './campaign.tokens.js';
import { distributeCampaignDeliveries } from './campaign-schedule.js';
import { CampaignRepository } from './campaign.repository.js';

export type CampaignLifecycleErrorCode = 'NOT_FOUND' | 'INVALID_TRANSITION' | 'INVALID_INPUT';

export class CampaignLifecycleError extends Error {
  constructor(public readonly code: CampaignLifecycleErrorCode, message: string) {
    super(message);
    this.name = 'CampaignLifecycleError';
  }
}

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly repository: CampaignRepository,
    private readonly channel: ChannelAdapter,
    private readonly audit: AuditLogService,
    @Inject(CAMPAIGN_POLICY) private readonly policy: CampaignConfig,
    @Inject('CAMPAIGN_WORKER_ID') private readonly workerId: string,
    // Campaign gui THANG qua adapter (khong qua OutboundChannelRouter), nen phai tu ghi lai
    // tin da gui — neu khong, tin CSKH se vang mat khoi lich su hoi thoai cua nhom.
    @Optional() private readonly recorder?: OutboundRecorder,
  ) {}

  async list(): Promise<CampaignView[]> {
    return this.repository.list();
  }

  async get(id: string): Promise<CampaignView> {
    const campaign = await this.repository.find(id);
    if (!campaign) throw new CampaignLifecycleError('NOT_FOUND', 'Campaign khong ton tai');
    return campaign;
  }

  async create(input: CreateCampaignInput, actor: string): Promise<CampaignView> {
    if (input.targets.length > this.policy.maxTargets) {
      throw new CampaignLifecycleError(
        'INVALID_INPUT',
        `Campaign vuot tran ${this.policy.maxTargets} nhom cua tenant`,
      );
    }
    if (new Set(input.targets.map((target) => target.chatId)).size !== input.targets.length) {
      throw new CampaignLifecycleError('INVALID_INPUT', 'Campaign co nhom dich bi trung');
    }
    const campaign = await this.repository.create(input);
    await this.appendAudit(actor, 'campaign.create', campaign);
    return campaign;
  }

  async approve(id: string, actor: string): Promise<CampaignView> {
    const before = await this.get(id);
    if (before.status !== 'draft') {
      throw new CampaignLifecycleError('INVALID_TRANSITION', 'Chi campaign draft moi duoc duyet');
    }
    const campaign = await this.repository.approve(id, actor, new Date());
    if (!campaign) throw new CampaignLifecycleError('INVALID_TRANSITION', 'Campaign da thay doi');
    await this.appendAudit(actor, 'campaign.approve', campaign);
    return campaign;
  }

  async schedule(id: string, input: ScheduleCampaignInput, actor: string): Promise<CampaignView> {
    if (loadEnv().CHANNEL_MODE === 'hybrid') {
      throw new CampaignLifecycleError(
        'INVALID_INPUT',
        'Campaign can mot kenh outbound ro rang; CHANNEL_MODE=hybrid khong duoc suy doan',
      );
    }
    const before = await this.get(id);
    if (before.status !== 'approved') {
      throw new CampaignLifecycleError('INVALID_TRANSITION', 'Campaign phai duoc duyet truoc khi len lich');
    }
    const enabledTargets = before.targets.filter((target) => target.enabled);
    const windowStart = new Date(input.windowStart);
    const windowEnd = new Date(input.windowEnd);
    let plan;
    try {
      plan = distributeCampaignDeliveries({
        targetIds: enabledTargets.map((target) => target.id),
        windowStart,
        windowEnd,
        minSpacingSeconds: this.policy.minSpacingSeconds,
        rateLimitPerMinute: this.policy.rateLimitPerMinute,
      });
    } catch (error) {
      throw new CampaignLifecycleError(
        'INVALID_INPUT',
        error instanceof Error ? error.message : 'Khong the phan bo lich gui',
      );
    }
    const campaign = await this.repository.schedule(id, windowStart, windowEnd, plan, new Date());
    if (!campaign) throw new CampaignLifecycleError('INVALID_TRANSITION', 'Campaign da thay doi');
    await this.appendAudit(actor, 'campaign.schedule', campaign);
    return campaign;
  }

  async cancel(id: string, actor: string): Promise<CampaignView> {
    await this.get(id);
    const campaign = await this.repository.cancel(id, new Date());
    if (!campaign) {
      throw new CampaignLifecycleError('INVALID_TRANSITION', 'Campaign da ket thuc hoac da huy');
    }
    await this.appendAudit(actor, 'campaign.cancel', campaign);
    return campaign;
  }

  async retryFailed(id: string, actor: string): Promise<CampaignView> {
    await this.get(id);
    const campaign = await this.repository.retryFailed(id, new Date());
    if (!campaign) {
      throw new CampaignLifecycleError('INVALID_TRANSITION', 'Campaign khong co delivery that bai de retry');
    }
    await this.appendAudit(actor, 'campaign.retry_failed', campaign);
    return campaign;
  }

  /** One bounded worker tick. No request is kept open and no sleep loop exists. */
  async tick(now = new Date()): Promise<number> {
    const perTick = Math.max(
      1,
      Math.floor((this.policy.rateLimitPerMinute * this.policy.tickIntervalSeconds) / 60),
    );
    const minimumSpacingSeconds = Math.max(
      this.policy.minSpacingSeconds,
      Math.ceil(60 / this.policy.rateLimitPerMinute),
    );
    const claims = await this.repository.claimDue(
      this.workerId,
      now,
      this.policy.claimLeaseSeconds,
      perTick,
      minimumSpacingSeconds,
    );
    await Promise.all(
      claims.map(async (claim) => {
        try {
          // The ledger is at-least-once across a crash between remote send and markSent. Current
          // Zalo adapters expose no provider idempotency key, so do not claim exactly-once here.
          // `idempotencyKey` still prevents duplicate planned rows and is ready for a future
          // channel receipt/dedup capability.
          const text = claim.content + AUTO_LABEL;
          const receipt = await this.channel.sendMessage(claim.chatId, text);
          await this.repository.markSent(claim.deliveryId, new Date());
          await this.recorder?.record({ chatId: claim.chatId, text, receipt });
        } catch (error) {
          const message = safeDeliveryError(error);
          const retryable = claim.attempts < this.policy.retry.maxAttempts;
          const backoffMs =
            this.policy.retry.baseBackoffSeconds * 1_000 * 2 ** Math.max(0, claim.attempts - 1);
          await this.repository.markFailure(
            claim.deliveryId,
            message,
            new Date(),
            retryable ? new Date(now.getTime() + backoffMs) : null,
          );
          this.logger.warn(`Campaign delivery ${claim.deliveryId} that bai: ${message}`);
        }
      }),
    );
    return claims.length;
  }

  policySummary(): CampaignConfig {
    return structuredClone(this.policy);
  }

  private async appendAudit(actor: string, action: string, campaign: CampaignView): Promise<void> {
    await this.audit.append({
      actor,
      action,
      entityType: 'Campaign',
      entityId: campaign.id,
      after: { status: campaign.status, name: campaign.name, targetCount: campaign.targets.length },
    });
  }
}

function safeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'loi gui khong xac dinh';
  return message.slice(0, 1_000);
}
