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
import { InternalServiceGuard } from './auth/internal-service.guard.js';
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
import { ChannelHealthService } from './channels/channel-health.js';
import { ZaloUserClient } from './channels/zalo-user.client.js';
import { PrismaModule } from './config/prisma.module.js';
import { PrismaService } from './config/prisma.service.js';
import { loadFoundationEnv } from './config/foundation-env.js';
import { DebugModule } from './debug/debug.module.js';
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
import {
  catalogStoreProvider,
  mediaFetcherProvider,
  mediaStoreProvider,
} from './media/media.provider.js';
import { CatalogMediaController } from './media/catalog-media.controller.js';
import { MediaHealthController } from './media/media-health.controller.js';
import { ConversationContextBuilder } from './messages/conversation-context.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { InMemoryMessagesRepository, MessagesRepository } from './messages/messages.repository.js';
import { OutboundRecorder } from './messages/outbound-recorder.js';
import { PrismaMessagesRepository } from './messages/prisma-messages.repository.js';
import { EmailLeadDispatcher } from './notifications/email-lead-dispatcher.js';
import { LeadDispatchService } from './notifications/lead-dispatch.service.js';
import { NotificationSettingsRepository } from './notifications/notification-settings.repository.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { SettingsNotificationsController } from './notifications/settings-notifications.controller.js';
import { ZaloLeadDispatcher } from './notifications/zalo-lead-dispatcher.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersRepository } from './orders/orders.repository.js';
import {
  InMemoryTurnRecordsRepository,
  TurnRecordsRepository,
} from './turns/turn-records.repository.js';
import { TurnReplyService } from './turns/turn-reply.service.js';
import { MessagesController } from './turns/turns.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { SalesOrderOutcomeService } from './orders/sales-order-outcome.service.js';
import { SalesHandoffController } from './orders/sales-handoff.controller.js';
import { SalesHandoffFollowupService } from './orders/sales-handoff-followup.service.js';
import { TurnOutcomePort } from './turns/turn-outcome.port.js';
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
import { WorkflowModule } from './workflow/workflow.module.js';
import { tenantCampaignConfig } from '@netviet/tenant';

type CapabilityOwner = CapabilityId | 'foundation';
interface Owned<T> {
  readonly owner: CapabilityOwner;
  readonly value: T;
}

const owned = <T>(owner: CapabilityOwner, value: T): Owned<T> => ({ owner, value });

const IMPORTS: readonly Owned<NonNullable<ModuleMetadata['imports']>[number]>[] = [
  // `foundation`, KHONG phai mot capability: moi khach deu phai quan sat duoc (muc 12).
  // Cai khac nhau giua cac khach la muc chi tiet noi dung, khong phai co trace hay khong.
  owned('foundation', ObservabilityModule),
  owned('foundation', PrismaModule),
  owned('knowledge', KnowledgeModule),
  owned('foundation', AuthModule),
  owned('operations', OperationalSettingsModule),
  owned('messaging', GroupParticipantsModule),
  owned('knowledge', ContentModule),
  owned('foundation', ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])),
  // `foundation`, cung ly do voi ObservabilityModule: ban giao ben vung la nang luc ma BAT KY
  // mien nao cung co the can. Khach khong khai bao `integrations.workflowEngine` van nap module
  // nay va nhan cong VO HIEU HOA — boot binh thuong, dispatcher khong khoi dong.
  owned('foundation', WorkflowModule),
  // `foundation`: mot khach khong chan doan duoc la mot khach khong ho tro duoc. Module nay chi
  // DOC (vong dem trace + bang outbox) va khong phu thuoc capability nao — khach khong ban hang
  // van mo duoc luong xu ly cua mot luot.
  owned('foundation', DebugModule),
];

const CONTROLLERS: readonly Owned<Type<unknown>>[] = [
  owned('foundation', HealthController),
  owned('sales-order', OrdersController),
  // Duong QUAY LAI cua worker workflow. Den cung `sales-order` va bien mat cung no: mot khach
  // khong ban hang khong co viec ban giao nao de theo doi.
  owned('sales-order', SalesHandoffController),
  owned('turn-processing', MessagesController),
  // Bo MO PHONG cua duong xu ly luot, khong phai mot man hinh ban hang: `/demo/simulate` la cong
  // duy nhat chay tron pipeline that ma khong can Zalo (smoke test deploy, do tre observability,
  // eval parser). Khach trung tinh phai chay thu duoc mot luot.
  owned('turn-processing', DemoController),
  owned('sales-order', ErpController),
  owned('knowledge', KnowledgeController),
  owned('messaging', BroadcastController),
  owned('turn-processing', StreamController),
  owned('messaging', ZaloController),
  owned('operations', SettingsController),
  owned('campaign', CampaignController),
  // Suc khoe kho anh KHACH GUI VAO (`MediaStore`) — ca hai dependency deu thuoc `turn-processing`.
  owned('turn-processing', MediaHealthController),
  // ANH CATALOG SAN PHAM thuoc `knowledge`, khong thuoc ban hang.
  //
  // `ContentService` (knowledge) doi locator tuong doi cua goi khach (`/media/catalog/...`) thanh
  // URL tuyet doi roi dua vao `images`/`links` — tuc URL do di THANG toi khach qua Zalo. Route
  // phuc vu chinh nhung byte do phai o cung capability, neu khong thi mot khach co tri thuc ma
  // khong ban hang se gui di mot duong dan anh ma chinh API cua no tra 404: khong ngoai le, khong
  // canh bao, chi la mot tin nhan den noi thieu anh.
  owned('knowledge', CatalogMediaController),
  owned('operations', MasterDataController),
  owned('operations', ReadinessController),
  owned('notifications', NotificationsController),
  owned('notifications', SettingsNotificationsController),
];

const guardProviders: readonly Provider[] = [
  /**
   * PHAI DUNG DAU. Thu tu dang ky `APP_GUARD` chinh la thu tu chay, va ba guard nguoi-dung phia
   * duoi doc DAU do guard nay dat len yeu cau. Doi cho no xuong duoi nghia la worker bi 401
   * truoc khi ai kip kiem khoa dich vu cua no.
   */
  InternalServiceGuard,
  ApiKeyGuard,
  SessionAuthGuard,
  CsrfGuard,
  RolesGuard,
  ThrottlerGuard,
].map((useClass) => ({ provide: APP_GUARD, useClass }));

const PROVIDERS: readonly Owned<Provider>[] = [
  ...guardProviders.map((provider) => owned('foundation' as const, provider)),
  owned('operations', RuntimeSettingsService),
  owned('turn-processing', AgentEventsService),
  // Kho LUOT — trung tinh. Bang Postgres van ten `Order` (khong di tru du lieu), nhung QUYEN SO
  // HUU thi khong: moi y dinh deu sinh mot ban ghi o day, ke ca o khach khong ban gi.
  owned('turn-processing', {
    provide: TurnRecordsRepository,
    useFactory: (prisma: PrismaService): TurnRecordsRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaOrdersRepository(prisma)
        : new InMemoryTurnRecordsRepository(),
    inject: [PrismaService],
  }),
  // `OrdersRepository` la CUNG MOT INSTANCE, doc bang ngon ngu don hang. `useExisting` chu khong
  // phai mot factory thu hai: hai kho tach roi la cach chac chan de don va luot lech nhau.
  owned('sales-order', { provide: OrdersRepository, useExisting: TurnRecordsRepository }),
  owned('turn-processing', TurnReplyService),
  owned('turn-processing', ConversationContextBuilder),
  owned('turn-processing', {
    provide: ConversationThreadsRepository,
    useFactory: (prisma: PrismaService): ConversationThreadsRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaConversationThreadsRepository(prisma)
        : new InMemoryConversationThreadsRepository(),
    inject: [PrismaService],
  }),
  owned('turn-processing', ConversationsService),
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
  owned('campaign', {
    provide: 'CAMPAIGN_WORKER_ID',
    useFactory: () => `campaign-worker-${randomUUID()}`,
  }),
  // Kho TIN — thuoc `messaging`: nhan mot tin thi phai luu duoc no, ke ca khi khach khong bat
  // duong xu ly luot nao (CLAUDE.md: "Luu moi tin nhan/don ve DB ngay khi nhan").
  owned('messaging', {
    provide: MessagesRepository,
    useFactory: (prisma: PrismaService): MessagesRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaMessagesRepository(prisma)
        : new InMemoryMessagesRepository(),
    inject: [PrismaService],
  }),
  owned('messaging', OutboundRecorder),
  owned('sales-order', erpProvider),
  owned('turn-processing', mediaStoreProvider),
  owned('knowledge', catalogStoreProvider),
  owned('turn-processing', mediaFetcherProvider),
  owned('turn-processing', parserProvider),
  // `foundation`, KHONG phai `messaging`: mot khach khong dung kenh Zalo van phai co `/health`
  // tra loi duoc — va cau tra loi dung cua no la `phase: 'disabled'`, chu khong phai mot khoi
  // vang mat. Mot cong suc khoe chi noi duoc su that khi no ton tai o moi ban trien khai.
  owned('foundation', ChannelHealthService),
  owned('messaging', ZaloUserClient),
  owned('messaging', BotIdentityService),
  ...namedChannelProviders.map((provider) => owned('messaging' as const, provider)),
  owned('messaging', channelProvider),
  owned('messaging', OutboundChannelRouter),
  owned('turn-processing', AgentOrchestrator),
  owned('turn-processing', PipelineService),
  owned('sales-order', OrdersService),
  owned('sales-order', SalesHandoffFollowupService),
  owned('sales-order', OrderAmendmentService),
  // CONG TU XAC NHAN DON — den cung `sales-order` va bien mat cung no.
  //
  // `turn-processing` cong bo mot cong TRUNG TINH (`TurnOutcomePort`: "co ai nhan luot nay
  // khong?"); ban hang la ben duy nhat hom nay cam vao do. Khach khong bat `sales-order` khong
  // co provider nao cho token nay, `PipelineService` nhan `undefined` qua `@Optional()`, va moi
  // luot di thang sang duong tra loi tu van — dung hanh vi cua mot khach khong ban gi.
  owned('sales-order', SalesOrderOutcomeService),
  owned('sales-order', { provide: TurnOutcomePort, useExisting: SalesOrderOutcomeService }),
  // Cong GHI cua agent. Dang ky RIENG khoi `AgentOrchestrator` de doc duoc tu day rang quyen
  // doi trang thai don la mot thu duoc CAP, khong phai mot thu orchestrator tu co.
  owned('sales-order', OrderCommandAdapter),
  owned('sales-order', { provide: ORDER_COMMANDS, useExisting: OrderCommandAdapter }),
  owned('messaging', BroadcastService),
  owned('campaign', CampaignService),
  owned('campaign', CampaignScheduler),
  // NGO VAO cua mot luot. Thuoc `turn-processing` chu khong phai `messaging` vi bang chung nam
  // trong chinh constructor: ca hai BAT BUOC co `PipelineService`. Mot listener khong co cho
  // giao tin la mot tien trinh doc PII roi vut di. `messaging` so huu ADAPTER (gui/nhan), con
  // ai NHAN VIEC tu adapter la chuyen cua duong xu ly luot.
  owned('turn-processing', BotPoller),
  owned('turn-processing', ZcaListener),
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
