import { Module } from '@nestjs/common';
import { loadTenantContentManifest } from '@netviet/tenant';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { AdvisorAgent, ClaudeAdvisorAgent, NoopAdvisorAgent } from '../advisor/advisor-agent.js';
import { DeepSeekAdvisorAgent } from '../advisor/deepseek-advisor.js';
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
    /**
     * Ban soan tu van di theo cong tac RIENG `ADVICE_COMPOSER`, khong bam theo PARSER_MODE.
     *
     * Ly do: pilot chay `PARSER_MODE=flowise` (noi bo). Neu bam theo parser thi hoac ban soan chet
     * hoan toan tren pilot, hoac Claude bi them vao luong du lieu nhu mot he qua PHU cua viec chon
     * parser. Ca hai deu sai: viec them mot ben nhan du lieu phai la quyet dinh co y cua nguoi van
     * hanh. Thieu cong tac hoac thieu API key -> Noop -> giu nguyen ban noi FAQ, khong sap.
     */
    {
      provide: AdvisorAgent,
      useFactory: (): AdvisorAgent => {
        const env = loadFoundationEnv();
        // Thieu khoa cua chinh nha cung cap da chon -> Noop, KHONG am tham roi sang nha cung cap
        // khac. Doi ben nhan du lieu phai la mot quyet dinh co y, khong phai mot fallback.
        if (env.ADVICE_COMPOSER === 'claude' && env.ANTHROPIC_API_KEY) {
          return new ClaudeAdvisorAgent(env.ANTHROPIC_API_KEY, env.ADVICE_MODEL);
        }
        if (env.ADVICE_COMPOSER === 'deepseek' && env.DEEPSEEK_API_KEY) {
          return new DeepSeekAdvisorAgent(env.DEEPSEEK_API_KEY, env.ADVICE_DEEPSEEK_MODEL);
        }
        return new NoopAdvisorAgent();
      },
    },
    ContentService,
    ContentImportService,
    ContentManagementService,
    TenantPackContentBootstrap,
  ],
  exports: [ContentService, ContentRepository, AdvisorAgent],
})
export class ContentModule {}
