import { Module } from '@nestjs/common';
import { channelProvider } from './channels/channel.provider.js';
import { DemoController } from './demo/demo.controller.js';
import { HealthController } from './health/health.controller.js';
import { BotPoller } from './ingest/bot-poller.js';
import { KiotVietAdapter, KiotVietMockAdapter } from './kiotviet/kiotviet.adapter.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { MessagesController, OrdersController } from './orders/orders.controller.js';
import { InMemoryOrdersRepository, OrdersRepository } from './orders/orders.repository.js';
import { OrdersService } from './orders/orders.service.js';
import { parserProvider } from './pipeline/parser.provider.js';
import { PipelineService } from './pipeline/pipeline.service.js';

@Module({
  controllers: [HealthController, OrdersController, MessagesController, DemoController],
  providers: [
    KnowledgeService,
    { provide: OrdersRepository, useClass: InMemoryOrdersRepository },
    { provide: KiotVietAdapter, useClass: KiotVietMockAdapter },
    parserProvider,
    channelProvider,
    PipelineService,
    OrdersService,
    BotPoller,
  ],
})
export class AppModule {}
