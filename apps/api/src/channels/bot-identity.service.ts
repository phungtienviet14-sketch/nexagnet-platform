import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { callBotApi } from './zalo-bot.client.js';

interface BotIdentity {
  id?: string;
  name?: string;
}

export interface BotIdentityStatus {
  state: 'disabled' | 'unknown' | 'ready' | 'error';
  id?: string;
  name?: string;
}

const FAILURE_COOLDOWN_MS = 30_000;

/** Lay UID Bot chinh thuc bang getMe de so sanh voi metadata mention cua zca-js. */
@Injectable()
export class BotIdentityService implements OnModuleInit {
  private readonly logger = new Logger('BotIdentityService');
  private identity: { id: string; name?: string } | null = null;
  private resolving: Promise<string | null> | null = null;
  private lastFailureAt = 0;

  onModuleInit(): void {
    void this.resolveId();
  }

  async resolveId(): Promise<string | null> {
    if (this.identity) return this.identity.id;
    if (this.resolving) return this.resolving;
    if (Date.now() - this.lastFailureAt < FAILURE_COOLDOWN_MS) return null;

    const env = loadEnv();
    if ((env.CHANNEL_MODE !== 'bot' && env.CHANNEL_MODE !== 'hybrid') || !env.ZALO_BOT_TOKEN) {
      return null;
    }

    this.resolving = this.fetchIdentity(env.ZALO_BOT_TOKEN).finally(() => {
      this.resolving = null;
    });
    return this.resolving;
  }

  status(): BotIdentityStatus {
    const mode = loadEnv().CHANNEL_MODE;
    if (mode !== 'bot' && mode !== 'hybrid') return { state: 'disabled' };
    if (this.identity) return { state: 'ready', ...this.identity };
    return { state: this.lastFailureAt > 0 ? 'error' : 'unknown' };
  }

  private async fetchIdentity(token: string): Promise<string | null> {
    try {
      const response = await callBotApi<BotIdentity>(token, 'getMe');
      const id = response.result?.id;
      if (!response.ok || typeof id !== 'string' || id.length === 0) {
        this.lastFailureAt = Date.now();
        this.logger.warn(`Khong lay duoc ID Bot qua getMe (code=${response.error_code ?? 'invalid'}).`);
        return null;
      }
      const name = response.result?.name;
      this.identity = { id, ...(typeof name === 'string' ? { name } : {}) };
      this.logger.log(`Da xac dinh Bot Platform id=${id}${name ? ` name="${name}"` : ''}.`);
      return id;
    } catch (error) {
      this.lastFailureAt = Date.now();
      this.logger.warn(`getMe loi mang: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
