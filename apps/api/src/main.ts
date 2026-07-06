import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@ultty/shared';
import { AppModule } from './app.module.js';

const logger = new Logger('Bootstrap');

// Validate env truoc khi lam bat ky viec gi khac - fail fast (CLAUDE.md).
const env = loadEnv();

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(env.PORT);
logger.log(`API dang chay tai http://localhost:${env.PORT} (${env.NODE_ENV})`);
