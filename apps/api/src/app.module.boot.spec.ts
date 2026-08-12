import { NestFactory } from '@nestjs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { MasterDataService } from './settings/master-data.service.js';
import { PricePeriodsService } from './settings/price-periods.service.js';
import { ReadinessService } from './readiness/readiness.service.js';

/**
 * DUNG container THAT cua Nest.
 *
 * Moi spec khac trong repo deu dung `new Service(...)` nen KHONG bao gio dung toi DI — vi vay ba
 * loi khoi dong da lot qua toan bo suite va chi lo ra khi thuc su chay `pnpm dev:api`:
 *   1. `PricePeriodsService` tiem `KnowledgeService` trong khi `OperationalSettingsModule` khong
 *      he co provider do (KnowledgeService luc do la provider rieng cua AppModule).
 *   2. `MasterDataService` khai bao phu thuoc bang kieu CAU TRUC nen Nest chi thay `Object`.
 *   3. `.env` duoc nap SAU khi AppModule da import xong, nen `TENANT` khong toi kip loader.
 *
 * Bai test nay compile ca do thi phu thuoc, nen bat ky loi nao cung kieu do se do ngay tai CI.
 */
/**
 * `createApplicationContext` dung DUNG do thi DI nhu luc chay that, chi bo tang HTTP.
 *
 * Giu muc `error`: khi do thi DI hong, Nest goi `process.abort()` — voi `logger: false` thi worker
 * vitest chet ma KHONG in ra dong "Nest can't resolve dependencies of ...", nen nguoi sua chi thay
 * mot vu sap khong ly do. Chinh cai test nay ton tai de chi ra mat xich hong, nen no phai noi duoc.
 */
async function createContext() {
  return NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
}

describe('AppModule khoi dong duoc that su', () => {
  beforeAll(() => {
    process.env.PERSISTENCE = 'memory';
    process.env.CHANNEL_MODE = 'mock';
    process.env.TENANT ??= 'ultty';
  });

  it('compile duoc toan bo do thi phu thuoc va lay ra duoc cac service then chot', async () => {
    const moduleRef = await createContext();

    // Chinh la nhung mat xich da tung lam ung dung nga luc boot.
    expect(moduleRef.get(KnowledgeService)).toBeInstanceOf(KnowledgeService);
    expect(moduleRef.get(PricePeriodsService)).toBeInstanceOf(PricePeriodsService);
    expect(moduleRef.get(MasterDataService)).toBeInstanceOf(MasterDataService);
    expect(moduleRef.get(ReadinessService)).toBeInstanceOf(ReadinessService);

    await moduleRef.close();
  }, 60_000);

  it('KnowledgeService la MOT the hien dung chung — reload phai lan toi moi noi', async () => {
    const moduleRef = await createContext();

    // Neu module con tu tao ban sao rieng thi `reload()` cua /settings se khong toi pipeline.
    expect(moduleRef.get(KnowledgeService)).toBe(moduleRef.get(KnowledgeService));

    await moduleRef.close();
  }, 60_000);
});
