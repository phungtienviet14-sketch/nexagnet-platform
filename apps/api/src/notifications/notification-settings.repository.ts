import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type EmailNotificationConfig,
  type NotificationSettings,
  type ZaloNotificationConfig,
  notificationSettingsSchema,
} from '@netviet/shared';

const DEFAULT_SETTINGS: NotificationSettings = {
  email: {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: '',
    recipients: [],
  },
  zalo: {
    enabled: true,
    targetMemberNames: ['Phùng Việt', 'Hiệu'],
    targetMemberIds: [],
    targetGroupIds: [],
  },
};

@Injectable()
export class NotificationSettingsRepository {
  private readonly logger = new Logger(NotificationSettingsRepository.name);
  private currentSettings: NotificationSettings = { ...DEFAULT_SETTINGS };
  private storagePath: string;

  constructor() {
    const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
    this.storagePath = join(dataDir, 'notification-settings.json');
    this.loadFromDisk();
  }

  getSettings(): NotificationSettings {
    return JSON.parse(JSON.stringify(this.currentSettings)) as NotificationSettings;
  }

  getMaskedSettings(): NotificationSettings {
    const settings = this.getSettings();
    if (settings.email.pass) {
      settings.email.pass = '********';
    }
    return settings;
  }

  updateEmail(changes: Partial<EmailNotificationConfig>): NotificationSettings {
    const prevPass = this.currentSettings.email.pass;
    const newPass = changes.pass && changes.pass !== '********' ? changes.pass : prevPass;

    this.currentSettings.email = {
      ...this.currentSettings.email,
      ...changes,
      pass: newPass,
    };
    this.saveToDisk();
    return this.getMaskedSettings();
  }

  updateZalo(changes: Partial<ZaloNotificationConfig>): NotificationSettings {
    this.currentSettings.zalo = {
      ...this.currentSettings.zalo,
      ...changes,
    };
    this.saveToDisk();
    return this.getMaskedSettings();
  }

  private loadFromDisk(): void {
    try {
      if (existsSync(this.storagePath)) {
        const raw = readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        const validated = notificationSettingsSchema.safeParse(parsed);
        if (validated.success) {
          this.currentSettings = validated.data;
          return;
        }
        this.logger.warn(`File cấu hình notification không đúng schema: ${validated.error.message}`);
      }
    } catch (err) {
      this.logger.warn(`Không thể nạp cấu hình notification từ ổ đĩa: ${(err as Error).message}`);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.storagePath, JSON.stringify(this.currentSettings, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn(`Không thể lưu cấu hình notification ra ổ đĩa: ${(err as Error).message}`);
    }
  }
}
