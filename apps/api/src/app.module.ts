import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { loadTenantConfig } from '@netviet/tenant';
import { buildAppComposition } from './app-composition.js';

export function loadAppEnv() {
  const tenant = loadTenantConfig();
  const parser = tenant.capabilities.includes('sales-order')
    ? { allowedModes: tenant.integrations.parser?.allowedAdapters ?? [] }
    : false;
  const channel = tenant.capabilities.includes('messaging')
    ? { allowedModes: tenant.integrations.channel?.allowedAdapters ?? [] }
    : false;
  return loadEnv(process.env, { parser, channel });
}

@Module({})
export class AppModule {
  /** Compose capabilities at the Nest root; provider resolution remains standard Nest DI. */
  static async forRoot(): Promise<DynamicModule> {
    const tenant = loadTenantConfig();
    const env = loadAppEnv();
    const composition = buildAppComposition(tenant.capabilities);
    const imports = [...composition.imports];

    if (env.ADMIN_UI === 'on') {
      if (env.PERSISTENCE !== 'prisma') {
        new Logger('AppModule').warn(
          'ADMIN_UI=on nhưng PERSISTENCE!=prisma → bỏ qua /admin (AdminJS cần Postgres).',
        );
      } else {
        const { buildAdminModule } = await import('./admin/admin.module.js');
        imports.push(await buildAdminModule(env));
      }
    }

    return {
      module: AppModule,
      imports,
      controllers: composition.controllers,
      providers: composition.providers,
    };
  }
}
