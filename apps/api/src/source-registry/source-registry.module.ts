import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { InMemorySourceRegistryRepository } from './in-memory-source-registry.repository.js';
import { PrismaSourceRegistryRepository } from './prisma-source-registry.repository.js';
import { SourceReadinessService } from './source-readiness.service.js';
import { SourceRegistryRepository } from './source-registry.repository.js';
import { SourceRegistryService } from './source-registry.service.js';

/**
 * NGUON SU THAT — tang NEN TANG, khong phai mot capability.
 *
 * Cung ly do voi `ObservabilityModule`: MOI khach deu co nguon, deu co ban thay ban, va deu co
 * luc hai tai lieu noi nguoc nhau. Mot khach van tai can dieu do khong kem mot khach ban hang.
 * Cai khac nhau giua cac khach la NOI DUNG (`domain`/`key` la chuoi tu do), khong phai co tang
 * nay hay khong.
 *
 * Vi la nen tang nen module khong khai bao phu thuoc capability nao, va khong mot dong nao trong
 * `source-registry/` biet ten mot khach — co bai test khoa dieu do o `proofs/generic-api.proof.spec.ts`.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: SourceRegistryRepository,
      useFactory: (prisma: PrismaService): SourceRegistryRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaSourceRegistryRepository(prisma)
          : new InMemorySourceRegistryRepository(),
      inject: [PrismaService],
    },
    SourceRegistryService,
    SourceReadinessService,
  ],
  exports: [SourceRegistryService, SourceReadinessService, SourceRegistryRepository],
})
export class SourceRegistryModule {}
