import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@ultty/shared';
import dotenv from 'dotenv';
import { AppModule } from './app.module.js';

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

const app = await NestFactory.create(AppModule);
app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
app.enableShutdownHooks();
await app.listen(env.PORT);
logger.log(`API dang chay tai http://localhost:${env.PORT} (${env.NODE_ENV})`);
logger.log(`Parser=${env.PARSER_MODE} · Kenh=${env.CHANNEL_MODE} · CORS=${env.CORS_ORIGIN}`);
