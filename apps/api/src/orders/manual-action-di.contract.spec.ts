import { NestFactory } from '@nestjs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { OrdersService } from './orders.service.js';

/*
 * HOP DONG DI cho duong NGUOI BAM NUT.
 *
 * VI SAO KHONG DU khi chi co `manual-action-observability.spec.ts`: file do dung
 * `new OrdersService(repo, router, undefined, telemetry, audit)` — no chung minh code CHAY DUNG
 * khi duoc tiem dung, chu khong chung minh production CO tiem.
 *
 * Va o day `telemetry`/`audit` la `@Optional()`. Mot phu thuoc `@Optional()` khong duoc noi day
 * KHONG lam Nest bao loi — no lang le thanh `undefined`, va moi lenh goi telemetry im lang khong
 * chay. Do dung la hinh dang cua su co `NoopAdvisorAgent` (19–21/08/2026): test xanh, stack sai,
 * hai ngay khong ai biet. Bai test nay dung container THAT cua Nest de dong cua do lai.
 */

async function createContext() {
  // Giu muc `error`: do thi DI hong thi Nest goi `process.abort()`, va voi `logger: false` worker
  // vitest chet ma khong in ra mat xich hong.
  return NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
}

/**
 * Doc mot phu thuoc `private readonly` qua chi muc. Co y dung `unknown` roi ep mot lan o day
 * thay vi noi long kieu cua `OrdersService`: khong ai nen doc duoc hai truong nay tu ben ngoai
 * TRU bai test dang chung minh chung ton tai.
 */
function injected(orders: OrdersService, key: 'telemetry' | 'audit'): unknown {
  return (orders as unknown as Record<string, unknown>)[key];
}

describe('HOP DONG DI — thao tac cua nguoi van hanh phai quan sat duoc tren stack that', () => {
  beforeAll(() => {
    process.env.PERSISTENCE = 'memory';
    process.env.CHANNEL_MODE = 'mock';
    process.env.TENANT ??= 'ultty';
  });

  it('OrdersService duoc tiem CA TelemetryService lan AuditLogService bang day noi that', async () => {
    const moduleRef = await createContext();
    const orders = moduleRef.get(OrdersService);

    // `toBeInstanceOf` chu khong phai `toBeDefined`: mot `@Optional()` khong noi day tra
    // `undefined`, va `toBeDefined` la dung cai kiem tra bo sot no.
    expect(injected(orders, 'telemetry')).toBeInstanceOf(TelemetryService);
    expect(injected(orders, 'audit')).toBeInstanceOf(AuditLogService);

    await moduleRef.close();
  }, 60_000);

  it('telemetry cua OrdersService la CUNG the hien voi cua ca ung dung — mot soi chi, khong hai', async () => {
    const moduleRef = await createContext();

    // Hai the hien nghia la hai cau hinh `configure()` khac nhau: mot ban ghi co the roi vao mot
    // sink khong ai doc, hoac mang nhan release/tenant sai.
    expect(injected(moduleRef.get(OrdersService), 'telemetry')).toBe(
      moduleRef.get(TelemetryService),
    );

    await moduleRef.close();
  }, 60_000);
});
