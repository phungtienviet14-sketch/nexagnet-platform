import { Injectable } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';

export type AutoSendMode = 'on' | 'off';

/**
 * Cong tac van hanh trong bo nho. Moi lan API khoi dong lai se quay ve AUTO_SEND trong env
 * (pilot GĐ1 mac dinh on) de don hop le trong nguong tenant duoc tu gui sau restart.
 */
@Injectable()
export class RuntimeSettingsService {
  private autoSendMode: AutoSendMode = loadEnv().AUTO_SEND;

  autoSend(): AutoSendMode {
    return this.autoSendMode;
  }

  setAutoSend(enabled: boolean): { autoSend: AutoSendMode } {
    this.autoSendMode = enabled ? 'on' : 'off';
    return { autoSend: this.autoSendMode };
  }
}
