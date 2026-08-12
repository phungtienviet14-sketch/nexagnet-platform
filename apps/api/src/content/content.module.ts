import { Module } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { loadTenantContentManifest } from '@netviet/tenant';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
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
    ContentService,
    ContentImportService,
    ContentManagementService,
    TenantPackContentBootstrap,
  ],
  exports: [ContentService, ContentRepository],
})
export class ContentModule {}
