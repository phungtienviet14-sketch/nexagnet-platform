import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadEnv } from '@ultty/shared';
import { ApiKeyGuard } from './auth/api-key.guard.js';
import { PrismaModule } from './config/prisma.module.js';
import { PrismaService } from './config/prisma.service.js';
import { AgentEventsService } from './agents/agent-events.service.js';
import { AgentOrchestrator } from './agents/agent-orchestrator.service.js';
import { BroadcastController } from './broadcast/broadcast.controller.js';
import { BroadcastService } from './broadcast/broadcast.service.js';
import { channelProvider, namedChannelProviders } from './channels/channel.provider.js';
import { BotIdentityService } from './channels/bot-identity.service.js';
import { OutboundChannelRouter } from './channels/outbound-channel.router.js';
import { ZaloUserClient } from './channels/zalo-user.client.js';
import { ZaloController } from './channels/zalo.controller.js';
import { DemoController } from './demo/demo.controller.js';
import { HealthController } from './health/health.controller.js';
import { BotPoller } from './ingest/bot-poller.js';
import { ZcaListener } from './ingest/zca-listener.js';
import { KiotVietAdapter, KiotVietMockAdapter } from './kiotviet/kiotviet.adapter.js';
import { KiotVietController } from './kiotviet/kiotviet.controller.js';
import { KnowledgeController } from './knowledge/knowledge.controller.js';
import { KnowledgeRepository, SeedKnowledgeRepository } from './knowledge/knowledge.repository.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { PrismaKnowledgeRepository } from './knowledge/prisma-knowledge.repository.js';
import { InMemoryMessagesRepository, MessagesRepository } from './messages/messages.repository.js';
import { PrismaMessagesRepository } from './messages/prisma-messages.repository.js';
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
import { SourceTruthWriteService } from './settings/source-truth-write.service.js';
import { OperationalSettingsModule } from './settings/operational-settings.module.js';

@Module({
  imports: [
    PrismaModule,
    OperationalSettingsModule,
    GroupParticipantsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    HealthController,
    OrdersController,
    MessagesController,
    DemoController,
    KiotVietController,
    KnowledgeController,
    BroadcastController,
    StreamController,
    ZaloController,
    SettingsController,
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
      useClass: ThrottlerGuard,
    },
    KnowledgeService,
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
    SettingsQueryService,
    SourceTruthWriteService,
    {
      // Luu MOI tin ngay khi nhan (Phase 3): Postgres khi PERSISTENCE=prisma; memory mac dinh.
      provide: MessagesRepository,
      useFactory: (prisma: PrismaService): MessagesRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaMessagesRepository(prisma)
          : new InMemoryMessagesRepository(),
      inject: [PrismaService],
    },
    {
      // Nguon su that: Prisma (PERSISTENCE=prisma) hoac SEED in-memory (mac dinh).
      provide: KnowledgeRepository,
      useFactory: (prisma: PrismaService): KnowledgeRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaKnowledgeRepository(prisma)
          : new SeedKnowledgeRepository(),
      inject: [PrismaService],
    },
    { provide: KiotVietAdapter, useClass: KiotVietMockAdapter },
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
