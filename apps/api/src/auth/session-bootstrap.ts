import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import type { AppEnv } from '@netviet/shared';
import session, { type Store } from 'express-session';
import { PrismaService } from '../config/prisma.service.js';

const SESSION_PRUNE_INTERVAL_MS = 2 * 60 * 1_000;

export function configureSession(
  app: NestExpressApplication,
  env: AppEnv,
  prisma: PrismaService,
): void {
  if (env.AUTH_MODE !== 'session') return;
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET must be validated before bootstrap');
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  const store = createSessionStore(env, prisma);
  app.use(
    session({
      name: env.SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: env.NODE_ENV === 'production',
      cookie: {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: env.SESSION_MAX_AGE_MS,
      },
    }),
  );
}

export function createSessionStore(env: AppEnv, prisma: PrismaService): Store | undefined {
  if (env.PERSISTENCE === 'prisma') {
    return new PrismaSessionStore(prisma, {
      checkPeriod: SESSION_PRUNE_INTERVAL_MS,
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    });
  }
  if (env.NODE_ENV === 'production' || env.DATA_CLASSIFICATION === 'customer') {
    throw new Error('Persistent Prisma session store is required for production/customer data');
  }
  new Logger('SessionBootstrap').warn(
    'AUTH_MODE=session + PERSISTENCE=memory: MemoryStore chỉ dành cho dev/test, không dùng production.',
  );
  return undefined;
}
