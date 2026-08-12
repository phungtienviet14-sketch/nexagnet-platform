import { Injectable, Optional } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { loadEnv } from '@netviet/shared';
import { tenantReadiness } from '@netviet/tenant';
import { CampaignRepository } from '../campaigns/campaign.repository.js';
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
  ) {}

  async evaluate(now = new Date()): Promise<OperationalReadinessResult> {
    const env = loadEnv();
    const blockedCapabilities = safeBlockedCapabilities();

    return evaluateOperationalReadiness(
      {
        tenantLoaded: blockedCapabilities !== null,
        // Fail-closed cua P2.1: `prices()` chi tra ky dang active DUNG thang hien tai, khong
        // bao gio roi ve thang truoc. Rong = thang nay chua co bang gia.
        currentPricePeriod: this.knowledge.prices().length > 0,
        dealerCount: this.knowledge.dealers().length,
        enabledGroupMappingCount: this.knowledge.groups().length,
        parser: {
          provider: env.PARSER_MODE,
          productionAllowed: PRODUCTION_PARSERS.has(env.PARSER_MODE),
          credentialsPresent: env.PARSER_MODE !== 'claude' || Boolean(env.ANTHROPIC_API_KEY),
        },
        media: {
          enabled: env.MEDIA_STORE !== 'none',
          healthy: this.media?.enabled ?? false,
        },
        channel: {
          mode: env.CHANNEL_MODE,
          connected: PRODUCTION_CHANNELS.has(env.CHANNEL_MODE),
          productionTransport: PRODUCTION_CHANNELS.has(env.CHANNEL_MODE),
        },
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
