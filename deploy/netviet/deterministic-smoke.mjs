/**
 * HOP DONG RUNTIME TAT DINH — duong that, khong co LLM.
 *
 * VI SAO CAN MOT TANG RIENG: `smoke-test.mjs` la bang chung runtime duy nhat cua mot lan deploy,
 * va MOI khang dinh cua no deu treo tren mot lan phan loai cua model (`order.intent === 'dat_don'`).
 * Nen khi model tra `khac`, ca lan deploy do — giong het nhu khi image chua len. Tang nay tra loi
 * cau hoi con lai: "ha tang + hop dong nen tang co con dung khong", va tra loi no MOT CACH TAT DINH.
 *
 * Di qua CODE THAT, khong mock gi:
 *   HTTPS -> Caddy -> guard (session/CSRF/roles) -> Nest -> Prisma -> PostgreSQL -> goi khach.
 * Khong mo mot cua hau nao: moi duong o day deu la duong san co ma console van hanh dang dung.
 *
 * NANG LUC QUYET DINH DUONG NAO TON TAI. Mot khach khong bat `sales-order` thi `/orders` khong
 * duoc dang ky, va doi no tra 200 la doi mot thu khong ton tai — dung cai bay da lam lan deploy
 * 21/08/2026 chet du ca stack binh thuong. Khong doc duoc goi khach -> doi DAY DU (bat bien 7:
 * khong duoc lam yeu cong kiem).
 *
 * NEN TANG, KHONG PHAI CUA MOT KHACH: khong duoc nhac ten khach nao trong tep nay.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

const SIGNAL_PREFIX = '##DEPLOY-SIGNAL##';
const LAYER = 'deterministicSmoke';

const baseUrl = (process.env.PILOT_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
const tenantDir = (process.env.TENANT_DIR ?? '/srv/tenant').replace(/\/+$/, '');
const authMode = process.env.PILOT_AUTH_MODE?.trim() ?? 'none';
const phase = process.env.DETERMINISTIC_PHASE?.trim() === 'post-restart' ? 'post-restart' : 'pre';
const baseline = parseBaseline(process.env.DETERMINISTIC_BASELINE);

let sessionCookie;
let csrfToken;

/** Moi buoc da chay, de bao cao noi duoc "kiem cai gi" chu khong chi "pass". */
const probes = [];

function parseBaseline(raw) {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Doc nang luc tu goi khach dang mount. Khong doc duoc -> `null` -> nga ve phia doi DAY DU. */
function loadCapabilities() {
  try {
    const config = JSON.parse(readFileSync(`${tenantDir}/tenant.json`, 'utf8'));
    return Array.isArray(config?.capabilities) ? config.capabilities.map(String) : null;
  } catch {
    return null;
  }
}

const capabilities = loadCapabilities();
const has = (capability) => capabilities === null || capabilities.includes(capability);

class SmokeFailure extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

function emit(status, reason, detail) {
  process.stdout.write(
    `${SIGNAL_PREFIX} ${JSON.stringify({ layer: LAYER, status, reason, detail })}\n`,
  );
}

function headers(initial = undefined, mutation = false) {
  const result = new Headers(initial);
  if (sessionCookie) result.set('cookie', sessionCookie);
  if (mutation && csrfToken) result.set('x-csrf-token', csrfToken);
  return result;
}

function responseCookie(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0];
}

async function getJson(path, label) {
  const response = await fetch(`${baseUrl}${path}`, { headers: headers() });
  const text = await response.text();
  if (!response.ok) throw new SmokeFailure(label, `${path} tra HTTP ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new SmokeFailure(label, `${path} khong tra JSON hop le`);
  }
}

function record(name, detail) {
  probes.push(detail === undefined ? name : `${name}=${detail}`);
}

// --- Cac buoc kiem ------------------------------------------------------------------------------

/** NEN TANG: API song va tu nhan la khoe. */
async function probeHealth() {
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new SmokeFailure('API_HEALTH_FAILED', `/health tra HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body?.status !== 'ok') {
    throw new SmokeFailure('API_HEALTH_FAILED', '/health khong tra status=ok');
  }
  record('health');
}

/**
 * GUARD THUC SU DANG BAT. Mot lan deploy lam roi guard se cho ra mot he thong "chay tot" ma ai
 * cung doc duoc don cua khach — nen buoc nay la mot cong CUNG, khong phai mot phep lich su.
 */
async function probeAnonymousRejected() {
  if (authMode !== 'session') {
    record('anonymous-401', 'bo-qua(auth=none)');
    return;
  }
  const response = await fetch(`${baseUrl}/observability/traces`);
  if (response.status !== 401) {
    throw new SmokeFailure(
      'AUTH_CONTRACT_FAILED',
      `Duong bao ve tra HTTP ${response.status} cho yeu cau nac danh, doi 401`,
    );
  }
  record('anonymous-401');
}

/** Dang nhap that: cookie phien + CSRF + doc ho so nguoi dung tu PostgreSQL. */
async function probeSession() {
  if (authMode !== 'session') {
    record('session', 'bo-qua(auth=none)');
    return;
  }
  const username = process.env.PILOT_OPERATOR_USERNAME?.trim();
  const password = process.env.PILOT_OPERATOR_PASSWORD;
  if (!username || !password) {
    throw new SmokeFailure('AUTH_CONTRACT_FAILED', 'Thieu thong tin dang nhap cua smoke');
  }

  const csrfResponse = await fetch(`${baseUrl}/auth/csrf`);
  if (!csrfResponse.ok) {
    throw new SmokeFailure('AUTH_CONTRACT_FAILED', `/auth/csrf tra HTTP ${csrfResponse.status}`);
  }
  const csrf = await csrfResponse.json();
  sessionCookie = responseCookie(csrfResponse);
  csrfToken = csrf?.csrfToken;
  if (!sessionCookie || !csrfToken) {
    throw new SmokeFailure('AUTH_CONTRACT_FAILED', 'Khong tao duoc phien truoc dang nhap');
  }

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }, true),
    body: JSON.stringify({ username, password }),
  });
  if (!loginResponse.ok) {
    throw new SmokeFailure('AUTH_CONTRACT_FAILED', `/auth/login tra HTTP ${loginResponse.status}`);
  }
  const login = await loginResponse.json();
  sessionCookie = responseCookie(loginResponse) ?? sessionCookie;
  csrfToken = login?.csrfToken ?? csrfToken;

  const me = await getJson('/auth/me', 'AUTH_CONTRACT_FAILED');
  if (!me?.user?.username) {
    throw new SmokeFailure('AUTH_CONTRACT_FAILED', '/auth/me khong tra nguoi dung');
  }
  record('session');
}

/** Duong chan doan cua nen tang. Route nay tung bi 404 vi cau hinh Caddy cu (21/08/2026). */
async function probeObservability() {
  const body = await getJson('/observability/traces?limit=1', 'OBSERVABILITY_CONTRACT_FAILED');
  if (!Array.isArray(body?.traces) || typeof body?.stats !== 'object') {
    throw new SmokeFailure('OBSERVABILITY_CONTRACT_FAILED', '/observability/traces sai khuon');
  }
  record('observability');
}

/**
 * DANH TINH BAN PHAT HANH, DOC TU TIEN TRINH — khong phai tu tep tren host.
 *
 * ---------------------------------------------------------------------------------------------
 * `sudo cat .runtime/release.json` chi chung minh mot tep tren dia. Cau hoi that la: TIEN TRINH
 * dang phuc vu doc duoc gi? Hai cau nay tach nhau o dung cho hay hong nhat — bind-mount. Ban
 * truoc 26/08/2026 khong mount tep do vao container, nen tren dia no dung con trong tien trinh
 * no khong ton tai, va khong mot phep kiem nao thay duoc dieu do.
 *
 * VA PHAI KIEM O CA HAI PHA. `deploy-stack.sh` chay `--force-recreate api web` roi chay lai tep
 * nay voi `DETERMINISTIC_PHASE=post-restart`. Mot tien trinh MOI phai doc lai DUNG ban phat hanh
 * do; doc ra mot SHA khac nghia la manifest da bi thay duoi chan no.
 * ---------------------------------------------------------------------------------------------
 */
async function probeReleaseIdentity() {
  const body = await getJson('/observability/traces?limit=1', 'RELEASE_IDENTITY_CONTRACT_FAILED');
  const release = body?.release;
  if (!release || typeof release.gitSha !== 'string' || typeof release.source !== 'string') {
    throw new SmokeFailure(
      'RELEASE_IDENTITY_CONTRACT_FAILED',
      'API khong bao duoc danh tinh ban phat hanh dang chay',
    );
  }

  // XUNG DOT LA MOT KET QUA RIENG, khong phai mot dang "khong biet". Manifest va bien moi truong
  // dang noi hai commit khac nhau, va tien trinh da chu dong tu choi chon mot ben.
  if (release.source === 'conflict') {
    throw new SmokeFailure(
      'RELEASE_IDENTITY_MISMATCH',
      `Danh tinh xung dot: manifest=${release.mismatch?.manifestGitSha} env=${release.mismatch?.envGitSha}`,
    );
  }

  // TREN STACK, manifest la nguon CANONICAL. `env`/`none` van chay duoc, nhung chung co nghia la
  // manifest chua toi duoc tien trinh — dung trieu chung ma milestone nay dong lai. O local/CI
  // (`EXPECTED_RELEASE_SHA` khong duoc truyen) thi du phong la binh thuong va khong bi phan xu.
  const expectedSha = process.env.EXPECTED_RELEASE_SHA?.trim();
  if (expectedSha) {
    if (release.source !== 'manifest') {
      throw new SmokeFailure(
        'RELEASE_IDENTITY_CONTRACT_FAILED',
        `Danh tinh den tu '${release.source}' chu khong tu manifest — kiem mount .runtime/release.json`,
      );
    }
    if (release.gitSha !== expectedSha) {
      throw new SmokeFailure(
        'RELEASE_IDENTITY_MISMATCH',
        `Tien trinh doc ban phat hanh '${release.gitSha}', lan deploy nay la '${expectedSha}'`,
      );
    }
  }

  record('release-identity', `${release.source}:${release.gitSha.slice(0, 7)}`);
  return { releaseSha: release.gitSha, releaseSource: release.source };
}

/** Bo cong san sang van hanh — mot bo kiem TAT DINH doc thang tu nguon su that trong DB. */
async function probeReadiness() {
  if (!has('operations')) {
    record('readiness', 'bo-qua(khong-co-operations)');
    return null;
  }
  const body = await getJson('/settings/readiness', 'READINESS_CONTRACT_FAILED');
  if (!Array.isArray(body?.checks) || body.checks.length === 0) {
    throw new SmokeFailure('READINESS_CONTRACT_FAILED', '/settings/readiness khong tra cong nao');
  }
  if (typeof body?.goLiveReady !== 'boolean') {
    throw new SmokeFailure('READINESS_CONTRACT_FAILED', '/settings/readiness thieu goLiveReady');
  }
  record('readiness', `${body.checks.length}-cong`);
  return body.checks.length;
}

/**
 * NGUON SU THAT DA VAO POSTGRES. Day la phep do quan trong nhat cua tang nay: no chung minh
 * migration da chay, seed goi khach da vao, va API doc lai duoc — tuc chinh nhung thu ma rules
 * engine can de tinh gia. Va no khong can mot cau van nao di qua model.
 */
async function probeKnowledge() {
  if (!has('knowledge')) {
    record('knowledge', 'bo-qua(khong-co-knowledge)');
    return null;
  }
  const body = await getJson('/knowledge/summary', 'KNOWLEDGE_CONTRACT_FAILED');
  const products = Number(body?.productCount ?? body?.products ?? Number.NaN);
  if (!Number.isFinite(products)) {
    throw new SmokeFailure('KNOWLEDGE_CONTRACT_FAILED', '/knowledge/summary khong tra so san pham');
  }
  record('knowledge', `${products}-san-pham`);
  return products;
}

/** Duong doc ban ghi luot/don — chung minh kho ben vung tra loi duoc. */
async function probeTurnRecords() {
  if (!has('sales-order')) {
    record('orders', 'bo-qua(khong-co-sales-order)');
    return;
  }
  const body = await getJson('/orders', 'PERSISTENCE_CONTRACT_FAILED');
  const rows = Array.isArray(body) ? body : body?.orders;
  if (!Array.isArray(rows)) {
    throw new SmokeFailure('PERSISTENCE_CONTRACT_FAILED', '/orders khong tra danh sach');
  }
  record('orders', `${rows.length}-ban-ghi`);
}

/** SSE cua console. Mo duoc la du: noi dung su kien thuoc duong co LLM, khong thuoc tang nay. */
async function probeStream() {
  if (!has('turn-processing')) {
    record('sse', 'bo-qua(khong-co-turn-processing)');
    return;
  }
  const abort = new AbortController();
  try {
    const stream = await fetch(`${baseUrl}/events`, {
      headers: headers({ Accept: 'text/event-stream' }),
      signal: abort.signal,
    });
    if (!stream.ok || !stream.body) {
      throw new SmokeFailure('STREAM_CONTRACT_FAILED', `Khong mo duoc SSE: HTTP ${stream.status}`);
    }
    record('sse');
  } finally {
    abort.abort();
  }
}

// --- Chay ---------------------------------------------------------------------------------------

async function main() {
  await probeHealth();
  await probeAnonymousRejected();
  await probeSession();
  await probeObservability();
  const { releaseSha, releaseSource } = await probeReleaseIdentity();
  const readinessChecks = await probeReadiness();
  const knowledgeProducts = await probeKnowledge();
  await probeTurnRecords();
  await probeStream();

  // PHA SAU KHOI DONG LAI: du lieu phai con y nguyen. Day la phep do ben vung duy nhat khong can
  // toi mot don do model tao ra — truoc day no bam vao `VERIFY_ORDER_ID`, tuc bam vao LLM.
  if (phase === 'post-restart' && baseline) {
    if (baseline.knowledgeProducts != null && baseline.knowledgeProducts !== knowledgeProducts) {
      throw new SmokeFailure(
        'PERSISTENCE_CONTRACT_FAILED',
        `Nguon su that doi sau khi khoi dong lai: ${baseline.knowledgeProducts} -> ${knowledgeProducts}`,
      );
    }
    if (baseline.readinessChecks != null && baseline.readinessChecks !== readinessChecks) {
      throw new SmokeFailure(
        'READINESS_CONTRACT_FAILED',
        `So cong san sang doi sau khi khoi dong lai: ${baseline.readinessChecks} -> ${readinessChecks}`,
      );
    }
    // TIEN TRINH MOI, CUNG MOT BAN PHAT HANH. `--force-recreate` dung tien trinh cu va dung mot
    // tien trinh khac len; neu no doc ra mot SHA khac thi manifest da bi thay duoi chan no giua
    // hai pha — dung cai bay "release.json cu" ma mount + thu tu ghi phai loai bo.
    if (baseline.releaseSha != null && baseline.releaseSha !== releaseSha) {
      throw new SmokeFailure(
        'RELEASE_IDENTITY_MISMATCH',
        `Ban phat hanh doi sau khi khoi dong lai: ${baseline.releaseSha} -> ${releaseSha}`,
      );
    }
    record('con-nguyen-sau-restart');
  }

  emit('pass', 'DETERMINISTIC_CONTRACT_OK', { phase, probes, releaseSha, releaseSource });
  process.stdout.write(
    `DETERMINISTIC_BASELINE=${JSON.stringify({ knowledgeProducts, readinessChecks, releaseSha, releaseSource })}\n`,
  );
}

main().catch((error) => {
  const reason = error instanceof SmokeFailure ? error.reason : 'DETERMINISTIC_HARNESS_ERROR';
  emit('fail', reason, {
    phase,
    probes,
    message: error instanceof Error ? error.message : String(error),
  });
  process.stderr.write(`Deterministic smoke FAILED (${reason}): ${String(error)}\n`);
  process.exitCode = 1;
});
