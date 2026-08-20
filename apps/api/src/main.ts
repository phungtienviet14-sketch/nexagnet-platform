import 'reflect-metadata';
// PHAI dung ngay sau reflect-metadata va TRUOC moi import nghiep vu: AppModule keo theo
// knowledge/seed.ts, ma file do doc process.env.TENANT ngay luc import.
import './config/load-dotenv.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { setKnowledgeReloader } from './admin/knowledge-refresh.js';
import { AppModule, loadAppEnv } from './app.module.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { PrismaService } from './config/prisma.service.js';
import { configureSession } from './auth/session-bootstrap.js';

const logger = new Logger('Bootstrap');

// Validate env truoc khi lam bat ky viec gi khac - fail fast (CLAUDE.md).
const env = loadAppEnv();

// forRoot() dung module theo env: mount /admin (AdminJS) khi ADMIN_UI=on + PERSISTENCE=prisma.
const app = await NestFactory.create<NestExpressApplication>(await AppModule.forRoot());
configureSession(app, env, app.get(PrismaService));
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
