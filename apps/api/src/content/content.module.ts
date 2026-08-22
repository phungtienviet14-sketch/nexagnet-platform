import { Module } from '@nestjs/common';
import { loadTenantContentManifest } from '@netviet/tenant';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { AdvisorAgent } from '../advisor/advisor-agent.js';
import { advisorProvider } from '../advisor/advisor.provider.js';
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
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaContentRepository(prisma)
          : new InMemoryContentRepository(
              {},
              SEED.products.map((product) => product.sku),
            ),
    },
    { provide: ContentSourcePort, useClass: LocalManifestContentSource },
    { provide: TENANT_CONTENT_MANIFEST, useFactory: () => loadTenantContentManifest() },
    // Ban soan tu van di theo cong tac RIENG `ADVICE_COMPOSER` — xem `advisor/advisor.provider.ts`
    // de biet vi sao no khong bam theo `PARSER_MODE`, va vi sao no phai nam ngoai file nay.
    advisorProvider,
    ContentService,
    ContentImportService,
    ContentManagementService,
    TenantPackContentBootstrap,
  ],
  exports: [ContentService, ContentRepository, AdvisorAgent],
})
export class ContentModule {}
