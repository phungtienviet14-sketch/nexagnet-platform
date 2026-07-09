import { Module } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { PrismaService } from './config/prisma.service.js';
import { AgentEventsService } from './agents/agent-events.service.js';
import { AgentOrchestrator } from './agents/agent-orchestrator.service.js';
import { BroadcastController } from './broadcast/broadcast.controller.js';
import { BroadcastService } from './broadcast/broadcast.service.js';
import { channelProvider } from './channels/channel.provider.js';
import { ZaloUserClient } from './channels/zalo-user.client.js';
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
import { MessagesController, OrdersController } from './orders/orders.controller.js';
import { InMemoryOrdersRepository, OrdersRepository } from './orders/orders.repository.js';
import { PrismaOrdersRepository } from './orders/prisma-orders.repository.js';
import { OrdersService } from './orders/orders.service.js';
import { parserProvider } from './pipeline/parser.provider.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { StreamController } from './stream/stream.controller.js';

@Module({
  controllers: [
    HealthController,
    OrdersController,
    MessagesController,
    DemoController,
    KiotVietController,
    KnowledgeController,
    BroadcastController,
    StreamController,
  ],
  providers: [
    KnowledgeService,
    AgentEventsService,
    PrismaService,
    {
      // PERSISTENCE=prisma -> Postgres; mac dinh memory (demo/CI khong can DB).
      provide: OrdersRepository,
      useFactory: (prisma: PrismaService): OrdersRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaOrdersRepository(prisma)
          : new InMemoryOrdersRepository(),
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
    channelProvider,
    AgentOrchestrator,
    PipelineService,
    OrdersService,
    BroadcastService,
    BotPoller,
    ZcaListener,
  ],
})
export class AppModule {}
