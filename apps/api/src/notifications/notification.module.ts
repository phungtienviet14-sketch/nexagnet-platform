import { Module } from '@nestjs/common';
import { GroupParticipantsModule } from '../groups/group-participants.module.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { ZaloUserClient } from '../channels/zalo-user.client.js';
import { NotificationSettingsRepository } from './notification-settings.repository.js';
import { EmailLeadDispatcher } from './email-lead-dispatcher.js';
import { ZaloLeadDispatcher } from './zalo-lead-dispatcher.js';
import { LeadDispatchService } from './lead-dispatch.service.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [GroupParticipantsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationSettingsRepository,
    EmailLeadDispatcher,
    ZaloLeadDispatcher,
    LeadDispatchService,
    // Provide ZaloUserClient and AuditLogService from parent context if not globally exported
    ZaloUserClient,
    AuditLogService,
  ],
  exports: [
    NotificationSettingsRepository,
    LeadDispatchService,
    EmailLeadDispatcher,
    ZaloLeadDispatcher,
  ],
})
export class NotificationModule {}
