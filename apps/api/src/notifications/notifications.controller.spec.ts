import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { SettingsNotificationsController } from './settings-notifications.controller.js';
import { LeadDispatchService } from './lead-dispatch.service.js';
import { NotificationSettingsRepository } from './notification-settings.repository.js';

describe('NotificationsController & SettingsNotificationsController', () => {
  let notificationsController: NotificationsController;
  let settingsController: SettingsNotificationsController;
  let dispatchService: LeadDispatchService;
  let settingsRepo: NotificationSettingsRepository;

  beforeEach(() => {
    settingsRepo = new NotificationSettingsRepository();
    dispatchService = {
      dispatchLead: vi.fn().mockResolvedValue({
        leadId: 'lead_123',
        zalo: { success: true, recipientsSent: ['Member: Phùng Việt (12345)'] },
        email: { success: true, recipientsSent: ['sales@nexagnet247.com'] },
        dispatchedAt: new Date().toISOString(),
      }),
      testEmail: vi.fn().mockResolvedValue({ success: true, message: 'Test email ok' }),
      testZalo: vi.fn().mockResolvedValue({ success: true, message: 'Test zalo ok' }),
      getRecentLeads: vi.fn().mockReturnValue([]),
      retryLead: vi.fn().mockResolvedValue({
        leadId: 'lead_123',
        zalo: { success: true },
        email: { success: true },
        dispatchedAt: new Date().toISOString(),
      }),
    } as unknown as LeadDispatchService;

    notificationsController = new NotificationsController(dispatchService);
    settingsController = new SettingsNotificationsController(dispatchService, settingsRepo);
  });

  it('receives and dispatches valid lead payload', async () => {
    const response = await notificationsController.receiveLead({
      fullName: 'Phùng Việt',
      phone: '0988888888',
      email: 'viet@example.com',
      company: 'NetViet Solutions',
      workflow: 'orders',
      note: 'Test lead',
    });

    expect(response.success).toBe(true);
    expect(response.result.leadId).toBe('lead_123');
    expect(dispatchService.dispatchLead).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid lead payload with BadRequestException', async () => {
    await expect(
      notificationsController.receiveLead({
        fullName: '',
        email: 'invalid-email',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('masks password when retrieving notification settings', () => {
    settingsRepo.updateEmail({ pass: 'secret_smtp_password_123' });

    const settings = settingsController.getSettings();
    expect(settings.email.pass).toBe('********');
  });

  it('updates email and zalo settings cleanly', () => {
    const updatedEmail = settingsController.updateEmailSettings({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: 'notify@nexagnet247.com',
      recipients: ['admin@nexagnet247.com'],
    });

    expect(updatedEmail.email.host).toBe('smtp.gmail.com');
    expect(updatedEmail.email.port).toBe(465);

    const updatedZalo = settingsController.updateZaloSettings({
      targetMemberNames: ['Phùng Việt', 'Hiệu'],
    });

    expect(updatedZalo.zalo.targetMemberNames).toContain('Phùng Việt');
    expect(updatedZalo.zalo.targetMemberNames).toContain('Hiệu');
  });
});
