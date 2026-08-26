import { readFileSync } from 'node:fs';
import process from 'node:process';

/**
 * TANG LIVE AI cua mot lan deploy — duong dat hang that, di qua model that.
 *
 * TU 26/08/2026 TEP NAY CHI CON TRA LOI MOT CAU HOI: model/provider co hieu dung tin mau khong.
 * Moi thu KHONG phu thuoc model (API song, guard bat, nguon su that trong Postgres, SSE mo duoc,
 * du lieu con nguyen sau khi khoi dong lai) da chuyen sang `deterministic-smoke.mjs` va la mot
 * cong CUNG chay TRUOC tep nay.
 *
 * Ly do tach: truoc do mot lan model phan loai `khac` thay vi `dat_don` cho ra DUNG mot dau X do
 * nhu khi image chua len — nen "deploy do" mat het y nghia, va mot lan do that se bi bo qua.
 *
 * Ket qua duoc phat ra duoi dang mot dong tin hieu co MA LY DO (`##DEPLOY-SIGNAL##`), va
 * `deploy-signals.mjs` la noi duy nhat quyet dinh mau nao ung voi nghia gi.
 *
 * TIN NHAN MAU den tu GOI KHACH, khong cam cung trong file nay: parser lam viec trong tu dien
 * DONG cua tung khach, nen mot cau don hop le voi khach nay la `khac` voi khach kia.
 */
const SIGNAL_PREFIX = '##DEPLOY-SIGNAL##';
const LAYER = 'liveAiSmoke';

/**
 * `1` = tin hieu MEM: van phat ra ket qua nhung THOAT 0, de tang shell di tiep va de
 * `deploy-signals.mjs` phan xu. Mac dinh (khong dat) giu nguyen hanh vi cu — thoat khac 0 — vi
 * con mot noi goi khac: provider smoke cua `gd1-test-preflight.mjs`, o do day la mot cong CUNG
 * chay tren ban dang chay TRUOC khi deploy.
 */
const softSignal = process.env.DEPLOY_SIGNAL_SOFT === '1';

const tenantDir = (process.env.TENANT_DIR ?? '/srv/tenant').replace(/\/+$/, '');
function loadSmokeFixture() {
  try {
    const config = JSON.parse(readFileSync(`${tenantDir}/tenant.json`, 'utf8'));
    const fixture = config?.smoke;
    if (!fixture?.orderText) return null;
    return {
      orderText: String(fixture.orderText),
      expectedQuantity: Number(fixture.expectedQuantity ?? 0),
      tenant: String(config.slug ?? 'khong-ro'),
    };
  } catch {
    // Doc duoc goi khach hay khong la chuyen cua smoke; khong doc duoc thi coi nhu khong co mau
    // va di duong ha tang — cho bao to o duoi thay vi nem mot loi khong lien quan.
    return null;
  }
}
const smokeFixture = loadSmokeFixture();

/**
 * SSE `/events` thuoc nang luc `sales-order` (StreamController). Khach chi bat `knowledge` +
 * `operations` khong co endpoint do, nen doi mo duoc SSE la doi mot thu khong ton tai — deploy
 * WATA 21/08/2026 chet dung o day voi HTTP 404 du ca stack hoan toan binh thuong.
 *
 * Khong doc duoc goi khach -> GIU NGUYEN doi hoi cu. Bat bien 7 (ci-cd.md) cam lam yeu cong smoke:
 * mot goi khach khong doc duoc phai nga ve phia kiem NHIEU hon, khong phai kiem it hon.
 */
function loadTenantCapabilities() {
  try {
    const config = JSON.parse(readFileSync(`${tenantDir}/tenant.json`, 'utf8'));
    return Array.isArray(config?.capabilities) ? config.capabilities.map(String) : null;
  } catch {
    return null;
  }
}
const tenantCapabilities = loadTenantCapabilities();
const hasSalesOrder = tenantCapabilities === null || tenantCapabilities.includes('sales-order');

const baseUrl = (process.env.PILOT_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
const verifyOrderId = process.env.VERIFY_ORDER_ID?.trim();
const verifyOrderStatus = process.env.VERIFY_ORDER_STATUS?.trim();
const channelMode = process.env.CHANNEL_MODE?.trim() ?? 'zca';
const liveZaloTransport = ['bot', 'zca', 'hybrid'].includes(channelMode);
const authMode = process.env.PILOT_AUTH_MODE?.trim() ?? 'none';
const finalizeTimeoutMs = Number(process.env.LIVE_AI_TIMEOUT_MS ?? 45_000);
let sessionCookie;
let csrfToken;

/**
 * Ket qua co PHAN LOAI. Mot cong nghiep vu co N duong khong dat thi phai phan biet duoc N ly do —
 * gop "model doan sai" voi "provider chet" thanh mot chu `fail` la dung cai lam nguoi truc mat
 * long tin vao mau do.
 */
class LiveAiOutcome extends Error {
  constructor(status, reason, detail = {}) {
    super(`${reason}: ${JSON.stringify(detail)}`);
    this.status = status;
    this.reason = reason;
    this.detail = detail;
  }
}

class HttpError extends Error {
  constructor(path, status, body) {
    super(`${path} tra HTTP ${status}: ${body.slice(0, 200)}`);
    this.path = path;
    this.status = status;
  }
}

function emitLiveAi(status, reason, detail) {
  process.stdout.write(
    `${SIGNAL_PREFIX} ${JSON.stringify({ layer: LAYER, status, reason, detail })}\n`,
  );
}

/**
 * Provider chet va model doan sai la HAI viec khac nhau, va chung phan biet duoc bang MA HTTP:
 * parser nem loi -> `/demo/simulate` tra 5xx; parser tra loi binh thuong nhung phan loai khac ->
 * HTTP 200 kem `intent: 'khac'`. Loi tang mang cung xep vao "phu thuoc ngoai khong san sang".
 */
function classifyTransportError(error) {
  if (error instanceof LiveAiOutcome) return error;
  if (error instanceof HttpError) {
    return error.status >= 500
      ? new LiveAiOutcome('unavailable', 'LIVE_AI_PROVIDER_UNAVAILABLE', {
          path: error.path,
          httpStatus: error.status,
        })
      : new LiveAiOutcome('fail', 'LIVE_AI_HARNESS_ERROR', {
          path: error.path,
          httpStatus: error.status,
        });
  }
  if (error instanceof TypeError) {
    return new LiveAiOutcome('unavailable', 'LIVE_AI_PROVIDER_UNAVAILABLE', {
      message: String(error.message ?? error),
    });
  }
  return new LiveAiOutcome('fail', 'LIVE_AI_HARNESS_ERROR', {
    message: error instanceof Error ? error.message : String(error),
  });
}

async function main() {
  await expectOk('/health');
  if (authMode === 'session') await authenticate();

  if (verifyOrderId) {
    const persisted = await getJson(`/orders/${encodeURIComponent(verifyOrderId)}`);
    assertPilotOrder(persisted, verifyOrderId);
    const expectedStatus = verifyOrderStatus ?? (liveZaloTransport ? 'needs_edit' : 'sent');
    if (persisted.status !== expectedStatus) {
      throw new LiveAiOutcome('fail', 'LIVE_AI_PERSISTED_STATUS_MISMATCH', {
        expectedStatus,
        actualStatus: persisted.status,
      });
    }
    process.stdout.write(`Persistence smoke OK: ${verifyOrderId}\n`);
    emitLiveAi('pass', 'LIVE_AI_MATCHES_FIXTURE', { mode: 'verify-persisted' });
    return;
  }

  if (!smokeFixture) {
    // GOI KHACH CHUA CO TIN NHAN MAU -> khong the kiem duong dat hang. BAO TO ra stdout: mot cong
    // kiem tra bi thu hep ma im lang thi lan deploy xanh se bi doc nham la "da kiem het".
    const skippedSse = hasSalesOrder ? '' : 'SMOKE_SKIPPED_SSE=1\n';
    process.stdout.write(
      'CANH BAO: khong co tin nhan mau `smoke` trong goi khach nen KHONG kiem duoc duong dat hang ' +
        '(parse -> tinh gia -> duyet -> gui). Hop dong runtime tat dinh da duoc kiem rieng.\n' +
        `Nang luc khai bao: ${(tenantCapabilities ?? []).join(', ') || 'khong ro'}.\n` +
        'SMOKE_SKIPPED_ORDER_PATH=1\n' +
        skippedSse,
    );
    emitLiveAi('skipped', 'LIVE_AI_SKIPPED_NO_FIXTURE', {
      capabilities: tenantCapabilities ?? [],
    });
    return;
  }

  await runOrderPath();
}

async function runOrderPath() {
  const marker = `NETVIET-SMOKE-${Date.now()}`;
  const abort = new AbortController();
  const events = [];
  const stream = await fetch(`${baseUrl}/events`, {
    headers: authenticatedHeaders({ Accept: 'text/event-stream' }),
    signal: abort.signal,
  });
  if (!stream.ok || !stream.body) {
    throw new LiveAiOutcome('fail', 'LIVE_AI_HARNESS_ERROR', {
      message: `Khong mo duoc SSE: HTTP ${stream.status}`,
    });
  }
  const readerTask = collectSse(stream.body, events, abort.signal);

  try {
    const order = await postJson('/demo/simulate', {
      text: `${smokeFixture.orderText} ${marker}`,
    });
    assertPilotOrder(order, order.id);

    const finalized = await waitFor(
      () => events.find((event) => event.type === 'order.finalized' && event.order?.id === order.id),
      finalizeTimeoutMs,
      'SSE order.finalized',
    );
    assertPilotOrder(finalized.order, order.id);

    const rolePhases = new Set(
      events
        .filter((event) => event.type === 'agent.progress' && event.orderId === order.id)
        .map((event) => `${event.role}:${event.phase}`),
    );
    for (const expected of [
      'router:active',
      'router:done',
      'sales:active',
      'sales:done',
      'supervisor:active',
      'supervisor:done',
    ]) {
      if (!rolePhases.has(expected)) {
        throw new LiveAiOutcome('fail', 'LIVE_AI_AGENT_TRACE_INCOMPLETE', {
          missingPhase: expected,
          orderId: order.id,
        });
      }
    }

    // HOP DONG GD1: duyet -> GUI XAC NHAN vao nhom roi DUNG o `sent`, kem mot hang viec bao Sale
    // tu nhap ERP. KHONG co buoc dong bo ERP nao trong GD1 (CLAUDE.md quyet dinh 4 va 7).
    if (!liveZaloTransport) {
      const approved = await postJson(`/orders/${encodeURIComponent(order.id)}/approve`);
      if (approved.status !== 'sent') {
        throw new LiveAiOutcome('fail', 'LIVE_AI_APPROVE_CONTRACT_FAILED', {
          orderId: order.id,
          actualStatus: approved.status,
        });
      }
      if (approved.salesHandoff?.status !== 'pending') {
        throw new LiveAiOutcome('fail', 'LIVE_AI_APPROVE_CONTRACT_FAILED', {
          orderId: order.id,
          message: 'da gui nhung khong tao hang viec nhap ERP cho Sale',
        });
      }
      if (approved.erpCode) {
        throw new LiveAiOutcome('fail', 'LIVE_AI_APPROVE_CONTRACT_FAILED', {
          orderId: order.id,
          message: 'don co ma ERP — GD1 khong duoc goi ERP',
        });
      }
    }

    const saved = await getJson(`/orders/${encodeURIComponent(order.id)}`);
    const expectedStatuses = liveZaloTransport ? ['pending_review', 'needs_edit'] : ['sent'];
    if (!expectedStatuses.includes(saved.status)) {
      throw new LiveAiOutcome('fail', 'LIVE_AI_ORDER_STATUS_UNEXPECTED', {
        orderId: order.id,
        expectedStatuses,
        actualStatus: saved.status,
      });
    }

    const scope = liveZaloTransport ? 'draft (API dang dung kenh Zalo that)' : 'approve mock';
    process.stdout.write(
      `Pilot smoke OK: SSE + 6-agent trace + ${scope}; SMOKE_ORDER_ID=${order.id}; SMOKE_ORDER_STATUS=${saved.status}\n`,
    );
    emitLiveAi('pass', 'LIVE_AI_MATCHES_FIXTURE', {
      expectedIntent: 'dat_don',
      actualIntent: 'dat_don',
      parserMode: process.env.PARSER_MODE ?? null,
      orderId: order.id,
      orderStatus: saved.status,
      fixture: smokeFixture.orderText,
    });
  } finally {
    abort.abort();
    await readerTask.catch((error) => {
      if (error?.name !== 'AbortError') throw error;
    });
  }
}

async function collectSse(body, target, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const payload = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (payload) target.push(JSON.parse(payload));
    }
  }
}

function assertPilotOrder(order, expectedId) {
  if (!order || order.id !== expectedId) {
    throw new LiveAiOutcome('fail', 'LIVE_AI_HARNESS_ERROR', {
      message: `Order response sai id: ${order?.id ?? 'missing'}`,
    });
  }
  // DAY LA CAU HOI CUA TANG NAY, va chi cua tang nay: model co doc ra `dat_don` khong.
  if (order.intent !== 'dat_don' || !order.priced) {
    throw new LiveAiOutcome('fail', 'LIVE_AI_INTENT_MISMATCH', {
      expectedIntent: 'dat_don',
      actualIntent: order.intent ?? 'khong-ro',
      priced: Boolean(order.priced),
      parserMode: process.env.PARSER_MODE ?? null,
      orderId: order.id,
      fixture: smokeFixture?.orderText,
    });
  }
  if (!order.trace || order.trace.steps?.length !== 6 || order.trace.llmCalls !== 1) {
    throw new LiveAiOutcome('fail', 'LIVE_AI_AGENT_TRACE_INCOMPLETE', {
      orderId: order.id,
      steps: order.trace?.steps?.length ?? 0,
      llmCalls: order.trace?.llmCalls ?? 0,
    });
  }
  // So luong ky vong den tu goi khach: moi khach mot cau don mau khac nhau nen con so nay khong
  // the la hang so trong base. Trich xuat sai so luong VAN la loi cua tang AI, khong phai ha tang.
  const expectedQuantity = smokeFixture?.expectedQuantity;
  if (order.priced.lines?.length !== 1 || order.priced.lines[0]?.quantity !== expectedQuantity) {
    throw new LiveAiOutcome('fail', 'LIVE_AI_EXTRACTION_MISMATCH', {
      orderId: order.id,
      expectedQuantity,
      actualLineCount: order.priced.lines?.length ?? 0,
      actualQuantity: order.priced.lines?.[0]?.quantity ?? null,
      parserMode: process.env.PARSER_MODE ?? null,
    });
  }
}

async function expectOk(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new HttpError(path, response.status, '');
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: authenticatedHeaders() });
  return parseJson(response, path);
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: authenticatedHeaders(body ? { 'Content-Type': 'application/json' } : undefined, true),
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseJson(response, path);
}

async function authenticate() {
  const username = process.env.PILOT_OPERATOR_USERNAME?.trim();
  const password = process.env.PILOT_OPERATOR_PASSWORD;
  if (!username || !password) throw new Error('Thieu credential smoke session.');

  const csrfResponse = await fetch(`${baseUrl}/auth/csrf`);
  const csrf = await parseJson(csrfResponse, '/auth/csrf');
  sessionCookie = responseCookie(csrfResponse);
  csrfToken = csrf.csrfToken;
  if (!sessionCookie || !csrfToken) throw new Error('Khong tao duoc pre-login session/CSRF.');

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: authenticatedHeaders({ 'Content-Type': 'application/json' }, true),
    body: JSON.stringify({ username, password }),
  });
  const login = await parseJson(loginResponse, '/auth/login');
  sessionCookie = responseCookie(loginResponse) ?? sessionCookie;
  csrfToken = login.csrfToken;
  if (!csrfToken) throw new Error('Login khong tra CSRF token.');
}

function authenticatedHeaders(initial = undefined, mutation = false) {
  const headers = new Headers(initial);
  if (sessionCookie) headers.set('cookie', sessionCookie);
  if (mutation && csrfToken) headers.set('x-csrf-token', csrfToken);
  return headers;
}

function responseCookie(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0];
}

async function parseJson(response, path) {
  const text = await response.text();
  if (!response.ok) throw new HttpError(path, response.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} khong tra JSON hop le`);
  }
}

async function waitFor(find, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = find();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Qua han cho la mot KET QUA rieng, khong phai mot loi chung: no phan biet "provider cham/treo"
  // voi "provider tra loi sai".
  throw new LiveAiOutcome('timeout', 'LIVE_AI_TIMEOUT', { waitingFor: label, timeoutMs });
}

main().catch((error) => {
  const outcome = classifyTransportError(error);
  emitLiveAi(outcome.status, outcome.reason, outcome.detail);
  process.stderr.write(`Live AI smoke ${outcome.status} (${outcome.reason}): ${error}\n`);
  // MEM: van bao ket qua nhung khong lam do tang shell — `deploy-signals.mjs` moi la noi phan xu.
  if (!softSignal) process.exitCode = 1;
});
