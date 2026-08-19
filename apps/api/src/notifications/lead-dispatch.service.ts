import { Injectable, Logger, Optional } from '@nestjs/common';
import type { LeadDispatchResult, LeadPayload, TestEmailPayload, TestZaloPayload } from '@netviet/shared';
import { AuditLogService } from '../audit/audit-log.service.js';
import { EmailLeadDispatcher } from './email-lead-dispatcher.js';
import { NotificationSettingsRepository } from './notification-settings.repository.js';
import { ZaloLeadDispatcher } from './zalo-lead-dispatcher.js';

export interface PersistedLeadRecord {
  leadId: string;
  payload: LeadPayload;
  dispatchResult: LeadDispatchResult;
  createdAt: string;
}

const MAX_LEAD_HISTORY = 100;

@Injectable()
export class LeadDispatchService {
  private readonly logger = new Logger(LeadDispatchService.name);
  private readonly leadHistory: PersistedLeadRecord[] = [];

  constructor(
    private readonly settingsRepo: NotificationSettingsRepository,
    private readonly zaloDispatcher: ZaloLeadDispatcher,
    private readonly emailDispatcher: EmailLeadDispatcher,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  async dispatchLead(payload: LeadPayload, actor = 'marketing-form'): Promise<LeadDispatchResult> {
    const leadId = payload.leadId || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullPayload: LeadPayload = {
      ...payload,
      leadId,
      createdAt: payload.createdAt || new Date().toISOString(),
    };

    const settings = this.settingsRepo.getSettings();

    this.logger.log(`Bắt đầu điều phối lead [${leadId}] từ ${fullPayload.company} (${fullPayload.fullName})`);

    const [zaloRes, emailRes] = await Promise.allSettled([
      this.zaloDispatcher.sendLeadZalo(fullPayload, settings.zalo),
      this.emailDispatcher.sendLeadEmail(fullPayload, settings.email),
    ]);

    const zaloResult =
      zaloRes.status === 'fulfilled'
        ? zaloRes.value
        : { success: false, message: `Lỗi không xác định: ${(zaloRes.reason as Error)?.message}`, recipientsSent: [] };

    const emailResult =
      emailRes.status === 'fulfilled'
        ? emailRes.value
        : { success: false, message: `Lỗi không xác định: ${(emailRes.reason as Error)?.message}`, recipientsSent: [] };

    const dispatchResult: LeadDispatchResult = {
      leadId,
      zalo: zaloResult,
      email: emailResult,
      dispatchedAt: new Date().toISOString(),
    };

    // Lưu vào ring buffer lịch sử lead
    this.recordLeadHistory({
      leadId,
      payload: fullPayload,
      dispatchResult,
      createdAt: fullPayload.createdAt || new Date().toISOString(),
    });

    // Ghi audit log
    await this.audit?.append({
      actor,
      action: 'lead.dispatch',
      entityType: 'Lead',
      entityId: leadId,
      after: {
        company: fullPayload.company,
        fullName: fullPayload.fullName,
        phone: fullPayload.phone,
        workflow: fullPayload.workflow,
        zaloSuccess: zaloResult.success,
        emailSuccess: emailResult.success,
      },
    });

    return dispatchResult;
  }

  async retryLead(leadId: string, actor = 'operator'): Promise<LeadDispatchResult> {
    const record = this.leadHistory.find((r) => r.leadId === leadId);
    if (!record) {
      throw new Error(`Không tìm thấy lead có ID: ${leadId}`);
    }

    const settings = this.settingsRepo.getSettings();
    this.logger.log(`Thực hiện gửi lại (retry) lead [${leadId}] bởi ${actor}`);

    const [zaloRes, emailRes] = await Promise.allSettled([
      this.zaloDispatcher.sendLeadZalo(record.payload, settings.zalo),
      this.emailDispatcher.sendLeadEmail(record.payload, settings.email),
    ]);

    const zaloResult =
      zaloRes.status === 'fulfilled'
        ? zaloRes.value
        : { success: false, message: `Lỗi không xác định: ${(zaloRes.reason as Error)?.message}`, recipientsSent: [] };

    const emailResult =
      emailRes.status === 'fulfilled'
        ? emailRes.value
        : { success: false, message: `Lỗi không xác định: ${(emailRes.reason as Error)?.message}`, recipientsSent: [] };

    const dispatchResult: LeadDispatchResult = {
      leadId,
      zalo: zaloResult,
      email: emailResult,
      dispatchedAt: new Date().toISOString(),
    };

    record.dispatchResult = dispatchResult;

    await this.audit?.append({
      actor,
      action: 'lead.retry',
      entityType: 'Lead',
      entityId: leadId,
      after: {
        zaloSuccess: zaloResult.success,
        emailSuccess: emailResult.success,
      },
    });

    return dispatchResult;
  }

  async testEmail(payload: TestEmailPayload): Promise<{ success: boolean; message?: string }> {
    const settings = this.settingsRepo.getSettings();
    const config = payload.config || settings.email;
    const recipient = payload.to || (config.recipients.length > 0 ? config.recipients[0] : config.user);

    if (!recipient) {
      return { success: false, message: 'Chưa chỉ định địa chỉ email nhận kiểm tra' };
    }

    return this.emailDispatcher.sendTestEmail(recipient, config);
  }

  async testZalo(payload: TestZaloPayload): Promise<{ success: boolean; message?: string; recipientsSent?: string[] }> {
    const settings = this.settingsRepo.getSettings();
    return this.zaloDispatcher.sendTestZalo(payload, settings.zalo);
  }

  getRecentLeads(): PersistedLeadRecord[] {
    return [...this.leadHistory];
  }

  private recordLeadHistory(record: PersistedLeadRecord): void {
    const existingIndex = this.leadHistory.findIndex((r) => r.leadId === record.leadId);
    if (existingIndex >= 0) {
      this.leadHistory[existingIndex] = record;
    } else {
      this.leadHistory.unshift(record);
      if (this.leadHistory.length > MAX_LEAD_HISTORY) {
        this.leadHistory.pop();
      }
    }
  }
}
