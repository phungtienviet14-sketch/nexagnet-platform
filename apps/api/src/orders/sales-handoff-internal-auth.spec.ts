import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderView } from '@netviet/shared';
import { resolve } from 'node:path';

/**
 * XAC THUC DUONG NOI BO — o DUNG che do ma ban deploy that dang chay.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BO TEST NAY PHAI TON TAI, va vi sao bo IT cua workflow KHONG thay the duoc no:
 *
 * `sales-handoff-followup.int.spec.ts` chay voi `AUTH_MODE` mac dinh (`api-key`) va `API_KEY`
 * RONG — o cau hinh do `ApiKeyGuard` MO TOAN BO, nen no chung minh duoc duong day nghiep vu
 * nhung KHONG chung minh duoc gi ve xac thuc.
 *
 * Ban deploy that thi chay `AUTH_MODE: ${AUTH_MODE:-session}` (`compose.yaml:186`). O che do do:
 *
 *   ApiKeyGuard      `authMode !== 'api-key'` -> tra `true`, tuc KHONG kiem `x-api-key` nua
 *   SessionAuthGuard doi `request.session.user` -> worker khong co cookie -> 401
 *   RolesGuard       doi `authUser.role`
 *   CsrfGuard        POST khong co token CSRF -> 403
 *
 * Ma worker la mot TIEN TRINH, khong phai mot trinh duyet: no khong co cookie, khong co phien,
 * khong co token CSRF, va KHONG DUOC PHEP gia lam mot cai nao trong ba thu do.
 *
 * Nen bo test nay chay o `session` — che do that — va hoi dung cau ma ban IT kia khong hoi duoc.
 */

const FIXTURE = resolve(
  new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  '../../packages/tenant/src/__tests__/fixtures/sales-handoff-followup',
);

/** Khoa dich vu cua bai kiem. Du dai de khong dung nham voi mot gia tri that. */
const SERVICE_KEY = 'test-internal-service-key-0123456789';

interface Harness {
  readonly base: string;
  readonly orderId: string;
  readonly close: () => Promise<void>;
}

async function bootSessionModeApi(): Promise<Harness> {
  Object.assign(process.env, {
    TENANT_DIR: FIXTURE,
    PERSISTENCE: 'memory',
    CHANNEL_MODE: 'mock',
    NODE_ENV: 'test',
    // CHE DO THAT cua ban deploy — day la toan bo diem cua tep nay.
    AUTH_MODE: 'session',
    API_KEY: SERVICE_KEY,
    // BAT BUOC khi `AUTH_MODE=session` — khong dat thi `loadEnv` nem ngay luc boot.
    SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
    WORKFLOW_ENGINE: 'off',
  });
  delete process.env.TENANT;

  const { resetTenantCache } = await import('@netviet/tenant');
  resetTenantCache();
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { OrdersRepository } = await import('./orders.repository.js');

  const app = await NestFactory.create(await AppModule.forRoot(), {
    logger: ['error'],
    abortOnError: false,
  });
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const repo = app.get(OrdersRepository as never, { strict: false }) as {
    create: (view: OrderView) => Promise<OrderView>;
  };
  const order = await repo.create({
    id: 'auth-ord-1',
    status: 'sent',
    intent: 'dat_don',
    chatId: 'IT-handoff-followup',
    rawText: 'lay 1 aaa',
    createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
    salesHandoff: {
      action: 'manual_erp_entry',
      status: 'pending',
      createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
    },
  } as unknown as OrderView);

  return { base: url, orderId: order.id, close: () => app.close() };
}

describe('duong noi bo `internal/*` duoi AUTH_MODE=session', () => {
  let api: Harness;

  beforeAll(async () => {
    api = await bootSessionModeApi();
  }, 120_000);

  afterAll(async () => {
    await api?.close();
  });

  const get = (headers: Record<string, string> = {}): Promise<Response> =>
    fetch(`${api.base}/internal/sales-handoff/${api.orderId}`, { headers });

  const post = (headers: Record<string, string> = {}): Promise<Response> =>
    fetch(`${api.base}/internal/sales-handoff/${api.orderId}/followup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ stage: 'reminder' }),
    });

  it('KHONG co khoa dich vu -> tu choi', async () => {
    expect((await get()).status).toBe(401);
    expect([401, 403]).toContain((await post()).status);
  });

  it('khoa dich vu SAI -> tu choi', async () => {
    expect((await get({ 'x-api-key': 'sai-be-bet' })).status).toBe(401);
    expect([401, 403]).toContain((await post({ 'x-api-key': 'sai-be-bet' })).status);
  });

  /**
   * HAI BAI DUOI DAY LA CHO BAN va chinh la thu dang hong.
   *
   * Worker chi mang duoc mot khoa dich vu. Neu hai bai nay do thi tren ban deploy that
   * (`AUTH_MODE=session`) workflow se khong doc duoc trang thai va khong danh dau duoc gi —
   * tuc toan bo khuon nay im lang khong lam gi, dung kieu hong ma no sinh ra de xoa bo.
   */
  it('khoa dich vu DUNG -> GET doc duoc trang thai', async () => {
    const response = await get({ 'x-api-key': SERVICE_KEY });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: 'pending' });
  });

  it('khoa dich vu DUNG -> POST chay duoc MA KHONG can CSRF cua trinh duyet', async () => {
    const response = await post({ 'x-api-key': SERVICE_KEY });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ applied: true, stage: 'reminder' });
  });

  /**
   * MAT KIA: mo duong cho dich vu KHONG duoc noi long duong cua nguoi dung.
   *
   * Neu bai nay do (tra 200) thi ta vua bien mot khoa dich vu thanh chia khoa van nang cho toan
   * bo API — dat hon han van de dang di sua.
   */
  it('duong NGUOI DUNG khong bi noi long: /orders van doi phien dang nhap', async () => {
    const withServiceKey = await fetch(`${api.base}/orders`, {
      headers: { 'x-api-key': SERVICE_KEY },
    });

    expect(withServiceKey.status).toBe(401);
  });
});
