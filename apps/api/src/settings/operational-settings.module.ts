import { Global, Module } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { AuditLogRepository, InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../audit/prisma-audit-log.repository.js';
import { PrismaModule } from '../config/prisma.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaRuleConfigRepository } from '../rule-config/prisma-rule-config.repository.js';
import {
  InMemoryRuleConfigRepository,
  RuleConfigRepository,
} from '../rule-config/rule-config.repository.js';
import { RuleConfigService } from '../rule-config/rule-config.service.js';
import { PricePeriodsService } from './price-periods.service.js';

@Global()
@Module({
  imports: [PrismaModule, KnowledgeModule],
  providers: [
    {
      provide: RuleConfigRepository,
      useFactory: (prisma: PrismaService): RuleConfigRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaRuleConfigRepository(prisma)
          : new InMemoryRuleConfigRepository(),
      inject: [PrismaService],
    },
    {
      provide: AuditLogRepository,
      useFactory: (prisma: PrismaService): AuditLogRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaAuditLogRepository(prisma)
          : new InMemoryAuditLogRepository(),
      inject: [PrismaService],
    },
    RuleConfigService,
    AuditLogService,
    PricePeriodsService,
  ],
  exports: [
    RuleConfigRepository,
    RuleConfigService,
    AuditLogRepository,
    AuditLogService,
    PricePeriodsService,
  ],
})
export class OperationalSettingsModule {}
