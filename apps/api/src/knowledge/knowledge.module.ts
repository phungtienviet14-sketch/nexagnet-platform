import { Global, Module } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { KnowledgeRepository, SeedKnowledgeRepository } from './knowledge.repository.js';
import { KnowledgeService } from './knowledge.service.js';
import { PrismaKnowledgeRepository } from './prisma-knowledge.repository.js';

/**
 * Nguon su that chay (SKU/gia/dai ly/map nhom) duoi dang MOT module dung chung.
 *
 * Truoc day `KnowledgeService` la provider cua rieng `AppModule`, nen bat ky module con nao
 * (vd `OperationalSettingsModule` voi `PricePeriodsService`) tiem no deu khong resolve duoc —
 * ung dung nga ngay luc khoi dong. Unit test khong bat duoc vi chung dung `new Service(...)`
 * chu khong dung container cua Nest.
 *
 * `@Global` + export de moi noi dung DUNG MOT the hien: `reload()` sau khi Sale sua nguon su
 * that phai duoc pipeline, MCP va /settings nhin thay cung luc.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      // PERSISTENCE=prisma -> Postgres; mac dinh memory (demo/CI khong can DB).
      provide: KnowledgeRepository,
      useFactory: (prisma: PrismaService): KnowledgeRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaKnowledgeRepository(prisma)
          : new SeedKnowledgeRepository(),
      inject: [PrismaService],
    },
    KnowledgeService,
  ],
  exports: [KnowledgeRepository, KnowledgeService],
})
export class KnowledgeModule {}
