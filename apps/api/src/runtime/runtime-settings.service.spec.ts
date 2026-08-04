import { describe, expect, it } from 'vitest';
import { RuntimeSettingsService } from './runtime-settings.service.js';

describe('RuntimeSettingsService', () => {
  it('mac dinh doc AUTO_SEND nhung cho phep doi ngay trong runtime', () => {
    process.env.AUTO_SEND = 'off';
    const settings = new RuntimeSettingsService();

    expect(settings.autoSend()).toBe('off');
    expect(settings.setAutoSend(true)).toEqual({ autoSend: 'on' });
    expect(settings.autoSend()).toBe('on');
    expect(settings.setAutoSend(false)).toEqual({ autoSend: 'off' });
  });
});
