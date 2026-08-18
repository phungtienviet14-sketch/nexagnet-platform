import { Module } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { loadTenantContentManifest } from '@netviet/tenant';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { AdviceComposer, ClaudeAdviceComposer, NoopAdviceComposer } from './advice-composer.js';
import { ContentController } from './content.controller.js';
import { ContentImportService } from './content-import.service.js';
import { ContentManagementService } from './content-management.service.js';
import { ContentRepository, InMemoryContentRepository } from './content.repository.js';
import { ContentService } from './content.service.js';
import { ContentSourcePort } from './content-source.port.js';
import { LocalManifestContentSource } from './local-manifest-content.source.js';
import { PrismaContentRepository } from './prisma-content.repository.js';
import {
  TENANT_CONTENT_MANIFEST,
  TenantPackContentBootstrap,
} from './tenant-pack-content.bootstrap.js';
import { SEED } from '../knowledge/seed.js';

@Module({
  imports: [PrismaModule],
  controllers: [ContentController],
  providers: [
    {
      provide: ContentRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ContentRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaContentRepository(prisma)
          : new InMemoryContentRepository(
              {},
              SEED.products.map((product) => product.sku),
            ),
    },
    { provide: ContentSourcePort, useClass: LocalManifestContentSource },
    { provide: TENANT_CONTENT_MANIFEST, useFactory: () => loadTenantContentManifest() },
    /**
     * Ban soan tu van di theo cong tac RIENG `ADVICE_COMPOSER`, khong bam theo PARSER_MODE.
     *
     * Ly do: pilot chay `PARSER_MODE=flowise` (noi bo). Neu bam theo parser thi hoac ban soan chet
     * hoan toan tren pilot, hoac Claude bi them vao luong du lieu nhu mot he qua PHU cua viec chon
     * parser. Ca hai deu sai: viec them mot ben nhan du lieu phai la quyet dinh co y cua nguoi van
     * hanh. Thieu cong tac hoac thieu API key -> Noop -> giu nguyen ban noi FAQ, khong sap.
     */
    {
      provide: AdviceComposer,
      useFactory: (): AdviceComposer => {
        const env = loadEnv();
        return env.ADVICE_COMPOSER === 'claude' && env.ANTHROPIC_API_KEY
          ? new ClaudeAdviceComposer(env.ANTHROPIC_API_KEY, env.ADVICE_MODEL)
          : new NoopAdviceComposer();
      },
    },
    ContentService,
    ContentImportService,
    ContentManagementService,
    TenantPackContentBootstrap,
  ],
  exports: [ContentService, ContentRepository, AdviceComposer],
})
export class ContentModule {}
