import process from 'node:process';

const baseUrl = (process.env.PILOT_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
const verifyOrderId = process.env.VERIFY_ORDER_ID?.trim();
const verifyOrderStatus = process.env.VERIFY_ORDER_STATUS?.trim();
const channelMode = process.env.CHANNEL_MODE?.trim() ?? 'mock';
const liveZaloTransport = ['bot', 'zca', 'hybrid'].includes(channelMode);
const authMode = process.env.PILOT_AUTH_MODE?.trim() ?? 'none';
let sessionCookie;
let csrfToken;

await expectOk('/health');
if (authMode === 'session') await authenticate();

if (verifyOrderId) {
  const persisted = await getJson(`/orders/${encodeURIComponent(verifyOrderId)}`);
  assertPilotOrder(persisted, verifyOrderId);
  const expectedStatus = verifyOrderStatus ?? (liveZaloTransport ? 'needs_edit' : 'sent');
  if (persisted.status !== expectedStatus) {
    throw new Error(`Don sau restart sai trang thai ${expectedStatus}: ${persisted.status}`);
  }
  process.stdout.write(`Persistence smoke OK: ${verifyOrderId}\n`);
} else {
  const marker = `NETVIET-SMOKE-${Date.now()}`;
  const abort = new AbortController();
  const events = [];
  const stream = await fetch(`${baseUrl}/events`, {
    headers: authenticatedHeaders({ Accept: 'text/event-stream' }),
    signal: abort.signal,
  });
  if (!stream.ok || !stream.body) {
    throw new Error(`Khong mo duoc SSE: HTTP ${stream.status}`);
  }
  const readerTask = collectSse(stream.body, events, abort.signal);

  try {
    const order = await postJson('/demo/simulate', {
      text: `HN_31.7_Meta HN, 2 x Ghe Felix ${marker}`,
    });
    assertPilotOrder(order, order.id);

    const finalized = await waitFor(
      () => events.find((event) => event.type === 'order.finalized' && event.order?.id === order.id),
      45_000,
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
        throw new Error(`SSE thieu buoc ${expected} cho don ${order.id}`);
      }
    }

    // HOP DONG GD1: duyet -> GUI XAC NHAN vao nhom roi DUNG o `sent`, kem mot hang viec bao Sale
    // tu nhap ERP. KHONG co buoc dong bo ERP nao trong GD1 (CLAUDE.md quyet dinh 4 va 7), nen
    // `synced` + ma ERP la hop dong CU. Bai nay van doi hop dong cu va vi vay chan MOI lan deploy
    // ke tu G1-12 — lan deploy dau tien sau do moi lo ra (13/08/2026).
    if (!liveZaloTransport) {
      const approved = await postJson(`/orders/${encodeURIComponent(order.id)}/approve`);
      if (approved.status !== 'sent') {
        throw new Error(`Sale approve khong gui duoc xac nhan don ${order.id}: ${approved.status}`);
      }
      if (approved.salesHandoff?.status !== 'pending') {
        throw new Error(`Don ${order.id} da gui nhung khong tao hang viec nhap ERP cho Sale`);
      }
      if (approved.erpCode) {
        throw new Error(`Don ${order.id} co ma ERP — GD1 khong duoc goi ERP`);
      }
    }

    const saved = await getJson(`/orders/${encodeURIComponent(order.id)}`);
    const expectedStatuses = liveZaloTransport ? ['pending_review', 'needs_edit'] : ['sent'];
    if (!expectedStatuses.includes(saved.status)) {
      throw new Error(`Don ${order.id} co trang thai ngoai du kien: ${saved.status}`);
    }

    const scope = liveZaloTransport ? 'draft (API dang dung kenh Zalo that)' : 'approve mock';
    process.stdout.write(
      `Pilot smoke OK: SSE + 6-agent trace + ${scope}; SMOKE_ORDER_ID=${order.id}; SMOKE_ORDER_STATUS=${saved.status}\n`,
    );
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
    throw new Error(`Order response sai id: ${order?.id ?? 'missing'}`);
  }
  if (order.intent !== 'dat_don' || !order.priced) {
    throw new Error(`Flowise khong tao duoc don dat_don: ${order.intent}`);
  }
  if (!order.trace || order.trace.steps?.length !== 6 || order.trace.llmCalls !== 1) {
    throw new Error(`Trace khong dung 6 vai/1 LLM call cho don ${order.id}`);
  }
  if (order.priced.lines?.length !== 1 || order.priced.lines[0]?.quantity !== 2) {
    throw new Error(`Rules engine khong giu dung 2 san pham cho don ${order.id}`);
  }
}

async function expectOk(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} tra HTTP ${response.status}`);
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
  if (!response.ok) {
    throw new Error(`${path} tra HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
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
  throw new Error(`Qua thoi gian cho ${label}`);
}
