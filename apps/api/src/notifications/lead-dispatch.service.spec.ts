import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { LeadPayload } from '@netviet/shared';
import { LeadDispatchService } from './lead-dispatch.service.js';
import { NotificationSettingsRepository } from './notification-settings.repository.js';
import { ZaloLeadDispatcher } from './zalo-lead-dispatcher.js';
import { EmailLeadDispatcher } from './email-lead-dispatcher.js';

describe('LeadDispatchService', () => {
  let service: LeadDispatchService;
  let settingsRepo: NotificationSettingsRepository;
  let zaloDispatcher: ZaloLeadDispatcher;
  let emailDispatcher: EmailLeadDispatcher;

  const mockPayload: LeadPayload = {
    fullName: 'Nguyễn Văn An',
    phone: '0912345678',
    email: 'an.nguyen@example.com',
    company: 'Công ty Cổ phần ABC',
    workflow: 'orders',
    note: 'Cần tư vấn triển khai gấp trong tháng này',
    source: 'nexagnet247.com/demo',
  };

  beforeEach(() => {
    settingsRepo = new NotificationSettingsRepository();
    zaloDispatcher = {
      sendLeadZalo: vi.fn().mockResolvedValue({
        success: true,
        recipientsSent: ['Member: Phùng Việt (12345)', 'Member: Hiệu (67890)'],
      }),
      sendTestZalo: vi.fn().mockResolvedValue({
        success: true,
        message: 'Test zalo sent',
      }),
    } as unknown as ZaloLeadDispatcher;

    emailDispatcher = {
      sendLeadEmail: vi.fn().mockResolvedValue({
        success: true,
        recipientsSent: ['admin@nexagnet247.com'],
      }),
      sendTestEmail: vi.fn().mockResolvedValue({
        success: true,
        message: 'Test email sent',
      }),
    } as unknown as EmailLeadDispatcher;

    service = new LeadDispatchService(settingsRepo, zaloDispatcher, emailDispatcher);
  });

  it('dispatches lead to both Zalo and Email successfully', async () => {
    const result = await service.dispatchLead(mockPayload);

    expect(result.leadId).toBeDefined();
    expect(result.zalo.success).toBe(true);
    expect(result.zalo.recipientsSent).toContain('Member: Phùng Việt (12345)');
    expect(result.email.success).toBe(true);
    expect(result.email.recipientsSent).toContain('admin@nexagnet247.com');

    const recent = service.getRecentLeads();
    expect(recent.length).toBe(1);
    expect(recent[0]?.payload.company).toBe('Công ty Cổ phần ABC');
  });

  it('handles partial failures gracefully without throwing', async () => {
    vi.mocked(emailDispatcher.sendLeadEmail).mockResolvedValueOnce({
      success: false,
      message: 'SMTP connection failed',
      recipientsSent: [],
    });

    const result = await service.dispatchLead(mockPayload);

    expect(result.zalo.success).toBe(true);
    expect(result.email.success).toBe(false);
    expect(result.email.message).toBe('SMTP connection failed');
  });

  it('allows retrying a previously recorded lead', async () => {
    const initial = await service.dispatchLead(mockPayload);

    vi.mocked(zaloDispatcher.sendLeadZalo).mockClear();
    vi.mocked(emailDispatcher.sendLeadEmail).mockClear();

    const retried = await service.retryLead(initial.leadId);

    expect(retried.leadId).toBe(initial.leadId);
    expect(zaloDispatcher.sendLeadZalo).toHaveBeenCalledTimes(1);
    expect(emailDispatcher.sendLeadEmail).toHaveBeenCalledTimes(1);
  });
});
