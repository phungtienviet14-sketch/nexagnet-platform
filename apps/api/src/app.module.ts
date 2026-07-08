import { Module } from '@nestjs/common';
import { AgentEventsService } from './agents/agent-events.service.js';
import { AgentOrchestrator } from './agents/agent-orchestrator.service.js';
import { BroadcastController } from './broadcast/broadcast.controller.js';
import { BroadcastService } from './broadcast/broadcast.service.js';
import { channelProvider } from './channels/channel.provider.js';
import { DemoController } from './demo/demo.controller.js';
import { HealthController } from './health/health.controller.js';
import { BotPoller } from './ingest/bot-poller.js';
import { KiotVietAdapter, KiotVietMockAdapter } from './kiotviet/kiotviet.adapter.js';
import { KiotVietController } from './kiotviet/kiotviet.controller.js';
import { KnowledgeController } from './knowledge/knowledge.controller.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { MessagesController, OrdersController } from './orders/orders.controller.js';
import { InMemoryOrdersRepository, OrdersRepository } from './orders/orders.repository.js';
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
    { provide: OrdersRepository, useClass: InMemoryOrdersRepository },
    { provide: KiotVietAdapter, useClass: KiotVietMockAdapter },
    parserProvider,
    channelProvider,
    AgentOrchestrator,
    PipelineService,
    OrdersService,
    BroadcastService,
    BotPoller,
  ],
})
export class AppModule {}
