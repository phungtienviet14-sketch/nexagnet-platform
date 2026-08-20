import type { DynamicModule } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { AppEnv } from '@netviet/shared';
import { tenantIdentity } from '@netviet/tenant';
import { PrismaService } from '../config/prisma.service.js';
import { buildKnowledgeResources } from './admin-resources.js';

/**
 * Panel quan tri "Nguon su that" (AdminJS 7 mount tai /admin) — dung @adminjs/nestjs + @adminjs/prisma.
 *
 * ESM: AdminJS 7 la ESM-only -> BAT BUOC dynamic import() (khong static import) trong ham async nay,
 * nen o che do memory/CI (ADMIN_UI=off) thu vien AdminJS KHONG bao gio duoc nap -> boot khong doi.
 *
 * PrismaClient dung chung: inject PrismaService (provider @Global qua PrismaModule) -> AdminJS ghi
 * cung 1 connection/DB voi pipeline (dung yeu cau "same instance").
 */
export async function buildAdminModule(env: AppEnv): Promise<DynamicModule> {
  const { default: AdminJS } = await import('adminjs');
  const { Database, Resource, getModelByName } = await import('@adminjs/prisma');
  const { AdminModule } = await import('@adminjs/nestjs');

  // Dang ky adapter Prisma 1 lan (idempotent — AdminJS bo qua neu da dang ky).
  AdminJS.registerAdapter({ Database, Resource });

  const logger = new Logger('AdminModule');
  // AUTH_MODE=none (VM dev/demo): panel mount KHONG co man hinh dang nhap. @adminjs/nestjs coi
  // `auth`/`sessionOptions` la tuy chon — bo han hai khoi thay vi de credential rong.
  const authDisabled = env.AUTH_MODE === 'none';
  logger.log(
    `Mount AdminJS tai /admin (PERSISTENCE=prisma, ADMIN_UI=on)${authDisabled ? ' — KHONG dang nhap (AUTH_MODE=none)' : ''}.`,
  );

  return AdminModule.createAdminAsync({
    inject: [PrismaService],
    useFactory: (prisma: PrismaService) => ({
      adminJsOptions: {
        rootPath: '/admin',
        branding: {
          companyName: `${tenantIdentity().shortName} — Nguồn sự thật`,
          withMadeWithLove: false,
        },
        resources: buildKnowledgeResources(prisma, getModelByName),
      },
      ...(authDisabled
        ? {}
        : {
            auth: {
              authenticate: async (email: string, password: string) =>
                email === env.ADMIN_EMAIL && password === env.ADMIN_PASSWORD ? { email } : null,
              cookieName: 'netviet-adminjs',
              cookiePassword: env.ADMIN_COOKIE_SECRET,
            },
            sessionOptions: {
              resave: false,
              saveUninitialized: false,
              secret: env.ADMIN_COOKIE_SECRET,
            },
          }),
    }),
  });
}
