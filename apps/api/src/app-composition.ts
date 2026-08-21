import { type ModuleMetadata, type Provider, type Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { CapabilityId } from '@netviet/tenant';
import { randomUUID } from 'node:crypto';
import { AgentEventsService } from './agents/agent-events.service.js';
import { AgentOrchestrator } from './agents/agent-orchestrator.service.js';
import { ApiKeyGuard } from './auth/api-key.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { SessionAuthGuard } from './auth/session-auth.guard.js';
import { AuditLogService } from './audit/audit-log.service.js';
import { BroadcastController } from './broadcast/broadcast.controller.js';
import { BroadcastService } from './broadcast/broadcast.service.js';
import { CampaignController } from './campaigns/campaign.controller.js';
import { CampaignRepository, InMemoryCampaignRepository } from './campaigns/campaign.repository.js';
import { CampaignScheduler } from './campaigns/campaign.scheduler.js';
import { CampaignService } from './campaigns/campaign.service.js';
import { CAMPAIGN_POLICY } from './campaigns/campaign.tokens.js';
import { PrismaCampaignRepository } from './campaigns/prisma-campaign.repository.js';
import { BotIdentityService } from './channels/bot-identity.service.js';
import { channelProvider, namedChannelProviders } from './channels/channel.provider.js';
import { OutboundChannelRouter } from './channels/outbound-channel.router.js';
import { ZaloController } from './channels/zalo.controller.js';
import { ZaloUserClient } from './channels/zalo-user.client.js';
import { PrismaModule } from './config/prisma.module.js';
import { PrismaService } from './config/prisma.service.js';
import { loadFoundationEnv } from './config/foundation-env.js';
import { ContentModule } from './content/content.module.js';
import {
  ConversationThreadsRepository,
  InMemoryConversationThreadsRepository,
} from './conversations/conversation-threads.repository.js';
import { ConversationsService } from './conversations/conversations.service.js';
import { PrismaConversationThreadsRepository } from './conversations/prisma-conversation-threads.repository.js';
import { DemoController } from './demo/demo.controller.js';
import { ErpController } from './erp/erp.controller.js';
import { erpProvider } from './erp/erp.provider.js';
import { GroupIdentityService } from './groups/group-identity.service.js';
import { GroupParticipantsModule } from './groups/group-participants.module.js';
import { HealthController } from './health/health.controller.js';
import { BotPoller } from './ingest/bot-poller.js';
import { ZcaListener } from './ingest/zca-listener.js';
import { KnowledgeController } from './knowledge/knowledge.controller.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { catalogStoreProvider, mediaFetcherProvider, mediaStoreProvider } from './media/media.provider.js';
import { CatalogMediaController } from './media/catalog-media.controller.js';
import { MediaHealthController } from './media/media-health.controller.js';
import { ConversationContextBuilder } from './messages/conversation-context.js';
import { InMemoryMessagesRepository, MessagesRepository } from './messages/messages.repository.js';
import { OutboundRecorder } from './messages/outbound-recorder.js';
import { PrismaMessagesRepository } from './messages/prisma-messages.repository.js';
import { EmailLeadDispatcher } from './notifications/email-lead-dispatcher.js';
import { LeadDispatchService } from './notifications/lead-dispatch.service.js';
import { NotificationSettingsRepository } from './notifications/notification-settings.repository.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { SettingsNotificationsController } from './notifications/settings-notifications.controller.js';
import { ZaloLeadDispatcher } from './notifications/zalo-lead-dispatcher.js';
import { MessagesController, OrdersController } from './orders/orders.controller.js';
import { InMemoryOrdersRepository, OrdersRepository } from './orders/orders.repository.js';
import { OrdersService } from './orders/orders.service.js';
import { OrderAmendmentService } from './orders/order-amendment.service.js';
import { OrderCommandAdapter } from './orders/order-command.adapter.js';
import { ORDER_COMMANDS } from './advisor/order-commands.token.js';
import { PrismaOrdersRepository } from './orders/prisma-orders.repository.js';
import { parserProvider } from './pipeline/parser.provider.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { ReadinessController } from './readiness/readiness.controller.js';
import { ReadinessService } from './readiness/readiness.service.js';
import { RuntimeSettingsService } from './runtime/runtime-settings.service.js';
import { GroupMappingService } from './settings/group-mapping.service.js';
import { MasterDataController } from './settings/master-data.controller.js';
import { MasterDataService } from './settings/master-data.service.js';
import { OperationalSettingsModule } from './settings/operational-settings.module.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsQueryService } from './settings/settings-query.service.js';
import { SourceTruthWriteService } from './settings/source-truth-write.service.js';
import { StreamController } from './stream/stream.controller.js';
import { tenantCampaignConfig } from '@netviet/tenant';

type CapabilityOwner = CapabilityId | 'foundation';
interface Owned<T> { readonly owner: CapabilityOwner; readonly value: T }

const owned = <T>(owner: CapabilityOwner, value: T): Owned<T> => ({ owner, value });

const IMPORTS: readonly Owned<NonNullable<ModuleMetadata['imports']>[number]>[] = [
  owned('foundation', PrismaModule),
  owned('knowledge', KnowledgeModule),
  owned('foundation', AuthModule),
  owned('operations', OperationalSettingsModule),
  owned('messaging', GroupParticipantsModule),
  owned('knowledge', ContentModule),
  owned('foundation', ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])),
];

const CONTROLLERS: readonly Owned<Type<unknown>>[] = [
  owned('foundation', HealthController),
  owned('sales-order', OrdersController),
  owned('sales-order', MessagesController),
  owned('sales-order', DemoController),
  owned('sales-order', ErpController),
  owned('knowledge', KnowledgeController),
  owned('messaging', BroadcastController),
  owned('sales-order', StreamController),
  owned('messaging', ZaloController),
  owned('operations', SettingsController),
  owned('campaign', CampaignController),
  owned('sales-order', MediaHealthController),
  owned('sales-order', CatalogMediaController),
  owned('operations', MasterDataController),
  owned('operations', ReadinessController),
  owned('notifications', NotificationsController),
  owned('notifications', SettingsNotificationsController),
];

const guardProviders: readonly Provider[] = [ApiKeyGuard, SessionAuthGuard, CsrfGuard, RolesGuard, ThrottlerGuard].map(
  (useClass) => ({ provide: APP_GUARD, useClass }),
);

const PROVIDERS: readonly Owned<Provider>[] = [
  ...guardProviders.map((provider) => owned('foundation' as const, provider)),
  owned('operations', RuntimeSettingsService),
  owned('sales-order', AgentEventsService),
  owned('sales-order', {
    provide: OrdersRepository,
    useFactory: (prisma: PrismaService): OrdersRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaOrdersRepository(prisma)
        : new InMemoryOrdersRepository(),
    inject: [PrismaService],
  }),
  owned('sales-order', ConversationContextBuilder),
  owned('sales-order', {
    provide: ConversationThreadsRepository,
    useFactory: (prisma: PrismaService): ConversationThreadsRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaConversationThreadsRepository(prisma)
        : new InMemoryConversationThreadsRepository(),
    inject: [PrismaService],
  }),
  owned('sales-order', ConversationsService),
  owned('operations', SettingsQueryService),
  owned('operations', GroupMappingService),
  owned('operations', GroupIdentityService),
  owned('operations', SourceTruthWriteService),
  owned('operations', {
    provide: MasterDataService,
    useFactory: (prisma: PrismaService, knowledge: KnowledgeService, audit: AuditLogService) =>
      new MasterDataService(prisma, knowledge, audit, loadFoundationEnv().PERSISTENCE),
    inject: [PrismaService, KnowledgeService, AuditLogService],
  }),
  owned('operations', ReadinessService),
  owned('campaign', {
    provide: CampaignRepository,
    useFactory: (prisma: PrismaService): CampaignRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaCampaignRepository(prisma)
        : new InMemoryCampaignRepository(),
    inject: [PrismaService],
  }),
  owned('campaign', { provide: CAMPAIGN_POLICY, useFactory: tenantCampaignConfig }),
  owned('campaign', { provide: 'CAMPAIGN_WORKER_ID', useFactory: () => `campaign-worker-${randomUUID()}` }),
  owned('sales-order', {
    provide: MessagesRepository,
    useFactory: (prisma: PrismaService): MessagesRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaMessagesRepository(prisma)
        : new InMemoryMessagesRepository(),
    inject: [PrismaService],
  }),
  owned('messaging', OutboundRecorder),
  owned('sales-order', erpProvider),
  owned('sales-order', mediaStoreProvider),
  owned('sales-order', catalogStoreProvider),
  owned('sales-order', mediaFetcherProvider),
  owned('sales-order', parserProvider),
  owned('messaging', ZaloUserClient),
  owned('messaging', BotIdentityService),
  ...namedChannelProviders.map((provider) => owned('messaging' as const, provider)),
  owned('messaging', channelProvider),
  owned('messaging', OutboundChannelRouter),
  owned('sales-order', AgentOrchestrator),
  owned('sales-order', PipelineService),
  owned('sales-order', OrdersService),
  owned('sales-order', OrderAmendmentService),
  // Cong GHI cua agent. Dang ky RIENG khoi `AgentOrchestrator` de doc duoc tu day rang quyen
  // doi trang thai don la mot thu duoc CAP, khong phai mot thu orchestrator tu co.
  owned('sales-order', OrderCommandAdapter),
  owned('sales-order', { provide: ORDER_COMMANDS, useExisting: OrderCommandAdapter }),
  owned('messaging', BroadcastService),
  owned('campaign', CampaignService),
  owned('campaign', CampaignScheduler),
  owned('sales-order', BotPoller),
  owned('sales-order', ZcaListener),
  owned('notifications', NotificationSettingsRepository),
  owned('notifications', EmailLeadDispatcher),
  owned('notifications', ZaloLeadDispatcher),
  owned('notifications', LeadDispatchService),
];

export interface AppComposition {
  readonly imports: NonNullable<ModuleMetadata['imports']>;
  readonly controllers: Type<unknown>[];
  readonly providers: Provider[];
}

/** Typed root composition only; Nest van so huu khoi tao/resolve provider, khong co Service Locator. */
export function buildAppComposition(capabilities: readonly CapabilityId[]): AppComposition {
  const enabled = new Set<CapabilityOwner>(['foundation', ...capabilities]);
  return {
    imports: IMPORTS.filter(({ owner }) => enabled.has(owner)).map(({ value }) => value),
    controllers: CONTROLLERS.filter(({ owner }) => enabled.has(owner)).map(({ value }) => value),
    providers: PROVIDERS.filter(({ owner }) => enabled.has(owner)).map(({ value }) => value),
  };
}
