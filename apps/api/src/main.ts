import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@ultty/shared';
import dotenv from 'dotenv';
import { setKnowledgeReloader } from './admin/knowledge-refresh.js';
import { AppModule } from './app.module.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';

// Nap .env (o goc repo) truoc khi validate env.
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const logger = new Logger('Bootstrap');

// Validate env truoc khi lam bat ky viec gi khac - fail fast (CLAUDE.md).
const env = loadEnv();

// forRoot() dung module theo env: mount /admin (AdminJS) khi ADMIN_UI=on + PERSISTENCE=prisma.
const app = await NestFactory.create(await AppModule.forRoot());
// AUTH_MODE=none (VM dev/demo): khong con xac thuc nao de bao ve -> CORS khoa theo mot origin chi
// gay ket khi mo qua IP/loopback/tunnel. Phan anh dung origin goi den de trinh duyet nao cung dung duoc.
app.enableCors(
  env.AUTH_MODE === 'none'
    ? { origin: true, credentials: true }
    : { origin: env.CORS_ORIGIN, credentials: true },
);
app.enableShutdownHooks();

// Cau noi cho hook AdminJS nap lai nguon su that (in-memory snapshot) sau khi CRUD qua /admin.
if (env.ADMIN_UI === 'on' && env.PERSISTENCE === 'prisma') {
  setKnowledgeReloader(app.get(KnowledgeService));
}

await app.listen(env.PORT);
logger.log(`API dang chay tai http://localhost:${env.PORT} (${env.NODE_ENV})`);
logger.log(`Parser=${env.PARSER_MODE} · Kenh=${env.CHANNEL_MODE} · CORS=${env.CORS_ORIGIN}`);
if (env.AUTH_MODE === 'none') {
  logger.warn(
    'AUTH_MODE=none · API KHONG co xac thuc (che do dev/demo) — KHONG dung voi du lieu khach THAT.',
  );
}
if (env.ADMIN_UI === 'on' && env.PERSISTENCE === 'prisma') {
  logger.log(`Panel Nguồn sự thật: http://localhost:${env.PORT}/admin (đăng nhập: ${env.ADMIN_EMAIL})`);
}
