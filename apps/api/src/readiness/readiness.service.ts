import { Injectable, Optional } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { loadEnv } from '@netviet/shared';
import { tenantReadiness } from '@netviet/tenant';
import { CampaignRepository } from '../campaigns/campaign.repository.js';
import { BotIdentityService } from '../channels/bot-identity.service.js';
import { ZaloUserClient } from '../channels/zalo-user.client.js';
import { BotPoller } from '../ingest/bot-poller.js';
import { TEST_ONLY_PRICE_PERIOD_SOURCE } from '../knowledge/domain.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { MediaStore } from '../media/media-store.js';
import { parseGoldenEvalReport, type GoldenReadiness } from './golden-eval-report.js';
import {
  evaluateOperationalReadiness,
  type OperationalReadinessResult,
} from './operational-readiness.js';

/**
 * Provider parser duoc phep cham du lieu khach that. Giu o NHAN chu khong o goi khach: day la
 * rang buoc nen tang/thoa thuan xu ly du lieu, khong phai so thich cua mot khach.
 */
const PRODUCTION_PARSERS = new Set(['claude']);
/** Kenh coi la "van chuyen production": mock chi de demo/CI. */
const PRODUCTION_CHANNELS = new Set(['bot', 'zca', 'hybrid']);

@Injectable()
export class ReadinessService {
  constructor(
    private readonly knowledge: KnowledgeService,
    @Optional() private readonly campaigns?: CampaignRepository,
    @Optional() private readonly media?: MediaStore,
    @Optional() private readonly zca?: ZaloUserClient,
    @Optional() private readonly botIdentity?: BotIdentityService,
    @Optional() private readonly botPoller?: BotPoller,
  ) {}

  async evaluate(now = new Date()): Promise<OperationalReadinessResult> {
    const env = loadEnv();
    const blockedCapabilities = safeBlockedCapabilities();

    return evaluateOperationalReadiness(
      {
        tenantLoaded: blockedCapabilities !== null,
        // Fail-closed cua P2.1: `prices()` chi tra ky dang active DUNG thang hien tai, khong
        // bao gio roi ve thang truoc. Rong = thang nay chua co bang gia.
        currentPricePeriod: this.hasProductionCurrentPricePeriod(),
        dealerCount: this.knowledge.dealers().length,
        enabledGroupMappingCount: this.knowledge.groups().length,
        parser: {
          provider: env.PARSER_MODE,
          productionAllowed: PRODUCTION_PARSERS.has(env.PARSER_MODE),
          credentialsPresent: env.PARSER_MODE !== 'claude' || Boolean(env.ANTHROPIC_API_KEY),
        },
        // `healthy` phai den tu mot request THAT toi kho (S3MediaStore.check -> HeadBucket).
        // Truoc day no doc co `enabled` — hang so `true` cua S3MediaStore — nen dat du bon bien
        // MEDIA_* la cong nay xanh, ke ca khi bucket go nham ten hay khoa het han.
        media: {
          enabled: env.MEDIA_STORE !== 'none',
          healthy: (await this.media?.check())?.healthy ?? false,
        },
        channel: this.channelReadiness(env.CHANNEL_MODE),
        auth: {
          enabled: env.AUTH_MODE !== 'none',
          persistentSessions: env.AUTH_MODE !== 'session' || env.PERSISTENCE === 'prisma',
        },
        goldenEval: await this.goldenEval(),
        campaignDataCount: (await this.campaigns?.list())?.length ?? 0,
        blockedCapabilities: blockedCapabilities ?? [],
      },
      now,
    );
  }

  private hasProductionCurrentPricePeriod(): boolean {
    const period = this.knowledge.pricePeriod();
    return (
      this.knowledge.prices().length > 0 &&
      period?.status === 'active' &&
      period.source !== TEST_ONLY_PRICE_PERIOD_SOURCE
    );
  }

  /**
   * Doc snapshot runtime san co, khong ping Zalo trong request readiness. Trang thai vi the
   * phan anh listener/poller dang chay ma khong lam endpoint phu thuoc them vao mang transient.
   */
  private channelReadiness(mode: 'mock' | 'bot' | 'zca' | 'hybrid'): {
    mode: string;
    connected: boolean;
    productionTransport: boolean;
    detail: string;
  } {
    const productionTransport = PRODUCTION_CHANNELS.has(mode);
    const zcaState = this.zca?.status().state ?? 'disabled';
    const botState = this.botIdentity?.status().state ?? 'disabled';
    const pollerStatus = this.botPoller?.status();
    const pollerState = pollerStatus?.state ?? 'disabled';
    const pollerProven = pollerState === 'running' && Boolean(pollerStatus?.lastSuccessfulPollAt);
    const pollerDetail = pollerProven ? 'running' : `${pollerState}_unproven`;

    if (mode === 'zca') {
      return {
        mode,
        productionTransport,
        connected: zcaState === 'ready',
        detail: `zca:${zcaState}`,
      };
    }
    if (mode === 'bot') {
      return {
        mode,
        productionTransport,
        connected: botState === 'ready' && pollerProven,
        detail: `bot:identity_${botState},poller_${pollerDetail}`,
      };
    }
    if (mode === 'hybrid') {
      return {
        mode,
        productionTransport,
        connected:
          zcaState === 'ready' && botState === 'ready' && pollerProven,
        detail: `hybrid:zca_${zcaState},bot_${botState},poller_${pollerDetail}`,
      };
    }
    return { mode, productionTransport, connected: false, detail: 'mock' };
  }

  /** Bao cao golden do harness sinh ra; khong co file = chua danh gia, KHONG doan la dat. */
  private async goldenEval(): Promise<GoldenReadiness> {
    const path = loadEnv().GOLDEN_EVAL_REPORT_PATH;
    if (!path) return parseGoldenEvalReport(null);
    try {
      return parseGoldenEvalReport(await readFile(path, 'utf8'));
    } catch {
      return parseGoldenEvalReport(null);
    }
  }
}

/** `null` = khong nap duoc goi khach; readiness phai coi la thieu tenant chu khong nga sap. */
function safeBlockedCapabilities(): ReadonlyArray<{
  key: string;
  label: string;
  reason: string;
}> | null {
  try {
    return tenantReadiness().blockedCapabilities;
  } catch {
    return null;
  }
}
