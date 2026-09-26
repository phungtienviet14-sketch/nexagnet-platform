#!/usr/bin/env node
/**
 * KIEM LAI QUA API sau smoke Maestro/PWA cua #398 — nhung dieu mot man hinh khong dem duoc.
 *
 *   SMOKE_API_URL=http://127.0.0.1:3001 SMOKE_PASSWORD=… SMOKE_FIXTURE=<mobile-smoke.json> \
 *     node tools/mobile-smoke/verify-driver-direct.mjs
 *
 * Doc (KHONG ghi) bang phien Giam doc va khang dinh:
 *
 *   1. don tu tao cua lai xe "duong thuong" nam trong ban tin "Don moi tu tai xe" DUNG mot lan;
 *   2. don do NHAN LAI dung chang cua lan nhan viec: DUNG mot chang mang don, chinh la chang cua lan
 *      nhan viec; DUNG mot ke hoach `ADOPTED` tro vao chang do;
 *   3. hang "Can xu ly" KHONG co viec nao cua lan nhan viec da thanh don (don binh thuong khong phai
 *      viec can quyet), va CO viec thieu diem giao cua lai xe con lai;
 *   4. khong tien nao bi bia: don tu tao co `freightAmount` va `customerId` la `null`.
 *
 * In JSON ket qua ra stdout (+ `SMOKE_VERIFY_OUTPUT` neu dat) de lam bang chung.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const API = (process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');
const PASSWORD = process.env.SMOKE_PASSWORD ?? '';
const FIXTURE = process.env.SMOKE_FIXTURE ?? '';

function fail(message) {
  process.stderr.write(`[mobile-smoke/verify-driver-direct] ${message}\n`);
  process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) fail(`Chi doc tu localhost: ${API}`);
if (PASSWORD.length < 12) fail('Thieu SMOKE_PASSWORD.');
if (!FIXTURE) fail('Thieu SMOKE_FIXTURE (JSON cua prepare.mjs).');

async function request(method, path, { token = null, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-nexagnet-client': 'mobile-smoke/verify-driver-direct',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const { driver, reviewDriver } = fixture.intake;
  const session = await request('POST', '/auth/native/session', {
    body: { username: fixture.director, password: PASSWORD },
  });
  const token = session.sessionToken;

  // 1. Ban tin "Don moi tu tai xe".
  const activity = await request('GET', '/transport/site-intakes/activity?hours=24', { token });
  const mine = activity.filter((item) => item.driverName === driver.name);
  if (mine.length !== 1) fail(`Mong DUNG 1 don moi tu ${driver.name}, thay ${mine.length}.`);
  const news = mine[0];
  if (news.bindingMode !== 'AUTO_CREATED')
    fail(`Don cua ${driver.name} khong tu tao: ${news.bindingMode}`);

  // 2. Nhan lai DUNG chang + ke hoach ADOPTED.
  const intake = await request('GET', `/transport/site-intakes/${news.intakeId}`, { token });
  const legs = await request('GET', `/transport/orders/${news.orderId}/legs`, { token });
  if (legs.length !== 1 || legs[0].id !== intake.leg.id) {
    fail(`Don ${news.orderCode} mang ${legs.length} chang, mong DUNG chang ${intake.leg.id}.`);
  }
  const plans = await request('GET', `/transport/planning/orders/${news.orderId}/plans`, { token });
  const active = plans.filter((plan) => plan.cancelledAt === null);
  if (
    active.length !== 1 ||
    active[0].outcome !== 'ADOPTED' ||
    active[0].loadedLegId !== intake.leg.id
  ) {
    fail(`Ke hoach cua ${news.orderCode} sai: ${JSON.stringify(active)}`);
  }
  if (active[0].runId !== intake.run.id)
    fail('Ke hoach tro sang vong chay KHAC vong chay nhan viec.');

  // 4. Khong tien nao bi bia.
  const order = await request('GET', `/transport/orders/${news.orderId}`, { token });
  if (order.freightAmount !== null || order.customerId !== null) {
    fail(
      `Don tu tao mang tien/khach bia: freight=${order.freightAmount} customer=${order.customerId}`,
    );
  }

  // 3. Hang "Can xu ly".
  const tower = await request('GET', '/transport/control-tower', { token });
  const intakeItems = tower.queue.filter((item) => item.kind === 'SITE_INTAKE_NEEDS_REVIEW');
  if (intakeItems.some((item) => item.subject.id === news.intakeId)) {
    fail('Don tu tao binh thuong lai nam trong hang "Can xu ly".');
  }
  const reviewItems = [];
  for (const item of intakeItems) {
    const view = await request('GET', `/transport/site-intakes/${item.subject.id}`, { token });
    if (view.driver.name === reviewDriver.name) reviewItems.push({ item, view });
  }
  if (reviewItems.length !== 1) {
    fail(`Mong DUNG 1 viec can xu ly cua ${reviewDriver.name}, thay ${reviewItems.length}.`);
  }
  const review = reviewItems[0];
  if (!String(review.item.detail.reasons).split(',').includes('DESTINATION_MISSING')) {
    fail(`Viec cua ${reviewDriver.name} khong noi thieu diem giao: ${review.item.detail.reasons}`);
  }
  if (review.view.order !== null)
    fail(`Viec thieu diem giao da co don bia: ${review.view.order.code}`);

  const result = {
    normal: {
      driver: driver.name,
      orderCode: news.orderCode,
      orderId: news.orderId,
      intakeId: news.intakeId,
      runCode: intake.run.code,
      legId: intake.leg.id,
      plan: {
        outcome: active[0].outcome,
        loadedLegId: active[0].loadedLegId,
        runId: active[0].runId,
      },
      freightAmount: order.freightAmount,
      customerId: order.customerId,
      inDecisionQueue: false,
    },
    needsReview: {
      driver: reviewDriver.name,
      intakeId: review.view.intakeId,
      reasons: review.view.readiness.reasons,
      order: review.view.order,
    },
    siteIntakeQueueItems: intakeItems.length,
    queueTotal: tower.queueTotal,
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (process.env.SMOKE_VERIFY_OUTPUT) writeFileSync(process.env.SMOKE_VERIFY_OUTPUT, json);
  process.stdout.write(json);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
