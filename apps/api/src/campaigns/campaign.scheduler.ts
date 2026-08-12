import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { CampaignConfig } from '@netviet/tenant';
import { Inject } from '@nestjs/common';
import { CampaignService } from './campaign.service.js';
import { CAMPAIGN_POLICY } from './campaign.tokens.js';

/** Timer only wakes the durable database worker; delivery state never lives in this timer. */
@Injectable()
export class CampaignScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignScheduler.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly campaigns: CampaignService,
    @Inject(CAMPAIGN_POLICY) private readonly policy: CampaignConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runTick(), this.policy.tickIntervalSeconds * 1_000);
    this.timer.unref();
    void this.runTick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runTick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.campaigns.tick();
    } catch (error) {
      this.logger.error(
        `Campaign tick that bai: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}

