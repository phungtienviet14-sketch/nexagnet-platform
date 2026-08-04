import { Injectable } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';

export type AutoSendMode = 'on' | 'off';

/**
 * Cong tac van hanh trong bo nho. Moi lan API khoi dong lai se quay ve AUTO_SEND trong env
 * (production mac dinh off) de khong vo tinh giu quyen tu gui sau restart.
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
