import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadEnv } from '@netviet/shared';
import { tenantCampaignConfig } from '@netviet/tenant';
import { ApiKeyGuard } from './auth/api-key.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { SessionAuthGuard } from './auth/session-auth.guard.js';
import { PrismaModule } from './config/prisma.module.js';
import { PrismaService } from './config/prisma.service.js';
import { ContentModule } from './content/content.module.js';
import { AgentEventsService } from './agents/agent-events.service.js';
import { AgentOrchestrator } from './agents/agent-orchestrator.service.js';
import { BroadcastController } from './broadcast/broadcast.controller.js';
import { BroadcastService } from './broadcast/broadcast.service.js';
import { CampaignController } from './campaigns/campaign.controller.js';
import { CampaignRepository, InMemoryCampaignRepository } from './campaigns/campaign.repository.js';
import { CampaignScheduler } from './campaigns/campaign.scheduler.js';
import { CampaignService } from './campaigns/campaign.service.js';
import { CAMPAIGN_POLICY } from './campaigns/campaign.tokens.js';
import { PrismaCampaignRepository } from './campaigns/prisma-campaign.repository.js';
import { channelProvider, namedChannelProviders } from './channels/channel.provider.js';
import { BotIdentityService } from './channels/bot-identity.service.js';
import { OutboundChannelRouter } from './channels/outbound-channel.router.js';
import { ZaloUserClient } from './channels/zalo-user.client.js';
import { ZaloController } from './channels/zalo.controller.js';
import { DemoController } from './demo/demo.controller.js';
import { HealthController } from './health/health.controller.js';
import { BotPoller } from './ingest/bot-poller.js';
import { ZcaListener } from './ingest/zca-listener.js';
import { erpProvider } from './erp/erp.provider.js';
import { ErpController } from './erp/erp.controller.js';
import { KnowledgeController } from './knowledge/knowledge.controller.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import {
  catalogStoreProvider,
  mediaFetcherProvider,
  mediaStoreProvider,
} from './media/media.provider.js';
import { MediaHealthController } from './media/media-health.controller.js';
import { CatalogMediaController } from './media/catalog-media.controller.js';
import { InMemoryMessagesRepository, MessagesRepository } from './messages/messages.repository.js';
import { PrismaMessagesRepository } from './messages/prisma-messages.repository.js';
import { ConversationContextBuilder } from './messages/conversation-context.js';
import { OutboundRecorder } from './messages/outbound-recorder.js';
import { MessagesController, OrdersController } from './orders/orders.controller.js';
import { InMemoryOrdersRepository, OrdersRepository } from './orders/orders.repository.js';
import { PrismaOrdersRepository } from './orders/prisma-orders.repository.js';
import { OrdersService } from './orders/orders.service.js';
import { parserProvider } from './pipeline/parser.provider.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { StreamController } from './stream/stream.controller.js';
import { RuntimeSettingsService } from './runtime/runtime-settings.service.js';
import { GroupParticipantsModule } from './groups/group-participants.module.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsQueryService } from './settings/settings-query.service.js';
import { GroupMappingService } from './settings/group-mapping.service.js';
import { SourceTruthWriteService } from './settings/source-truth-write.service.js';
import { OperationalSettingsModule } from './settings/operational-settings.module.js';
import { MasterDataController } from './settings/master-data.controller.js';
import { MasterDataService } from './settings/master-data.service.js';
import { AuditLogService } from './audit/audit-log.service.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { ReadinessController } from './readiness/readiness.controller.js';
import { ReadinessService } from './readiness/readiness.service.js';
import { GroupIdentityService } from './groups/group-identity.service.js';

@Module({
  imports: [
    PrismaModule,
    KnowledgeModule,
    AuthModule,
    OperationalSettingsModule,
    GroupParticipantsModule,
    ContentModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    HealthController,
    OrdersController,
    MessagesController,
    DemoController,
    ErpController,
    KnowledgeController,
    BroadcastController,
    StreamController,
    ZaloController,
    SettingsController,
    CampaignController,
    MediaHealthController,
    CatalogMediaController,
    MasterDataController,
    ReadinessController,
  ],
  providers: [
    {
      // Xac thuc TOAN CUC: chan moi route tru @Public khi da dat API_KEY.
      // API_KEY bo trong (mac dinh) -> guard mo, demo/CI/HF chay nhu cu.
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    RuntimeSettingsService,
    AgentEventsService,
    {
      // PERSISTENCE=prisma -> Postgres; mac dinh memory (demo/CI khong can DB).
      provide: OrdersRepository,
      useFactory: (prisma: PrismaService): OrdersRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaOrdersRepository(prisma)
          : new InMemoryOrdersRepository(),
      inject: [PrismaService],
    },
    ConversationContextBuilder,
    SettingsQueryService,
    GroupMappingService,
    GroupIdentityService,
    SourceTruthWriteService,
    {
      // MasterDataService CO Y nhan phu thuoc bang kieu CAU TRUC (de test khong can Nest), nen
      // Nest khong tu resolve duoc — phai dung factory chi ro the hien that.
      provide: MasterDataService,
      useFactory: (
        prisma: PrismaService,
        knowledge: KnowledgeService,
        audit: AuditLogService,
      ): MasterDataService =>
        new MasterDataService(prisma, knowledge, audit, loadEnv().PERSISTENCE),
      inject: [PrismaService, KnowledgeService, AuditLogService],
    },
    ReadinessService,
    {
      provide: CampaignRepository,
      useFactory: (prisma: PrismaService): CampaignRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaCampaignRepository(prisma)
          : new InMemoryCampaignRepository(),
      inject: [PrismaService],
    },
    { provide: CAMPAIGN_POLICY, useFactory: tenantCampaignConfig },
    { provide: 'CAMPAIGN_WORKER_ID', useFactory: () => `campaign-worker-${randomUUID()}` },
    {
      // Luu MOI tin ngay khi nhan (Phase 3): Postgres khi PERSISTENCE=prisma; memory mac dinh.
      provide: MessagesRepository,
      useFactory: (prisma: PrismaService): MessagesRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaMessagesRepository(prisma)
          : new InMemoryMessagesRepository(),
      inject: [PrismaService],
    },
    // Ghi lai tin HE THONG DA GUI (Pha 1) — de vong sau bot doc duoc chinh cau tra loi cua no.
    OutboundRecorder,
    // Cong ERP chon theo goi khach (G1-12) — nhan khong biet ten nha cung cap nao.
    erpProvider,
    // Kho luu anh + worker tai anh (Dot A' Task 2). Mac dinh MEDIA_STORE=none -> khong I/O gi,
    // demo/CI chay y nhu truoc; bat bang MEDIA_STORE=s3 khi co bucket.
    mediaStoreProvider,
    catalogStoreProvider,
    mediaFetcherProvider,
    parserProvider,
    ZaloUserClient,
    BotIdentityService,
    ...namedChannelProviders,
    channelProvider,
    OutboundChannelRouter,
    AgentOrchestrator,
    PipelineService,
    OrdersService,
    BroadcastService,
    CampaignService,
    CampaignScheduler,
    BotPoller,
    ZcaListener,
  ],
})
export class AppModule {
  /**
   * Boot dong: chi mount panel /admin (AdminJS) khi ADMIN_UI=on VA PERSISTENCE=prisma.
   * O che do memory/CI (mac dinh) tra ve module KHONG co admin -> khong nap thu vien AdminJS ESM,
   * boot va toan bo test giu nguyen. Metadata @Module (controllers/providers/PrismaModule) van gop vao.
   */
  static async forRoot(): Promise<DynamicModule> {
    const env = loadEnv();
    const imports: NonNullable<DynamicModule['imports']> = [];
    if (env.ADMIN_UI === 'on') {
      if (env.PERSISTENCE !== 'prisma') {
        new Logger('AppModule').warn(
          'ADMIN_UI=on nhưng PERSISTENCE!=prisma → bỏ qua /admin (AdminJS cần Postgres).',
        );
      } else {
        const { buildAdminModule } = await import('./admin/admin.module.js');
        imports.push(await buildAdminModule(env));
      }
    }
    return { module: AppModule, imports };
  }
}
