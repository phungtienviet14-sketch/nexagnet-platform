#!/usr/bin/env node
/**
 * DUNG MOT BAI TAP GO ROI CHO NGUOI — hai loi CO KIEM SOAT, do vao ClickStack, roi bien mat.
 *
 * ---------------------------------------------------------------------------
 * CAU HOI MA BAI TAP NAY DO: mot nguoi CHI CO ClickStack — khong source code, khong `docker
 * logs`, khong SQL — co xac dinh duoc "hong o buoc nao, nguyen nhan chinh la gi" trong 10 phut
 * khong?
 *
 * Do la cau hoi ve TANG QUAN SAT, khong phai ve nguoi lam bai. Neu ho khong tim ra, thu can sua
 * la du lieu ta phat ra, khong phai bai tap.
 *
 *   --case a   AI LOI  — tang LLM tra 500. Duong hong: `fetch` ra Flowise.
 *   --case b   DB LOI  — Postgres bien mat GIUA CHUNG. Duong hong: Prisma.
 *
 * ---------------------------------------------------------------------------
 * MOI CA DEU CO MOT DOAN "KHOE" TRUOC KHI HONG, va do khong phai de dep:
 *
 * Mot trace hong doc mot minh chi noi duoc "co gi do do". Doc canh mot trace KHOE cua cung mot
 * viec thi no noi duoc "buoc NAY dang mat 4000ms trong khi binh thuong la 40ms" — va do moi la
 * thu dan nguoi ta toi nguyen nhan. Nen moi ca deu ban vai tin o che do binh thuong TRUOC.
 *
 * ---------------------------------------------------------------------------
 * DAP AN KHONG DUOC IN RA MAN HINH. No di vao `evidence/human-debug-answer-<case>.md`
 * (`evidence/` da nam trong `.gitignore`). Nguoi ra de va nguoi lam bai co the la mot nguoi, va
 * dieu do khong sao — mien la ho khong doc dap an TRUOC.
 *
 * ---------------------------------------------------------------------------
 * DIEU KIEN: ClickStack dang chay (`clickstack.compose.yml`), Postgres dev dang chay o 5432.
 *
 *   node tools/poc-observability/src/human-debug-case.mjs --case a
 */
import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FIXTURE_FLOWISE_KEY } from './fixture-secrets.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const apiDir = join(repoRoot, 'apps/api');
const evidenceDir = join(here, '../evidence');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const which = arg('case', 'a').toLowerCase();
const messages = Number(arg('messages', '3'));
const apiPort = Number(arg('port', '3399'));
const faultPort = Number(arg('fault-port', '4799'));
const dbGatePort = Number(arg('db-gate-port', '55432'));
const clickstack = arg('otlp', 'http://127.0.0.1:4766');
const hyperdx = arg('ui', 'http://127.0.0.1:8766');

if (which !== 'a' && which !== 'b') {
  process.stderr.write("--case chi nhan 'a' (AI loi) hoac 'b' (DB loi)\n");
  process.exit(2);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// --------------------------------------------------------------- CONG TCP toi Postgres
/**
 * Mot cong TCP dung truoc Postgres, DONG DUOC luc dang chay.
 *
 * VI SAO KHONG `docker stop postgres`: cai DB do dung chung voi moi thu khac tren may — bo kiem
 * tich hop, stack dev, mot phien lam viec khac. Mot bai tap go roi khong duoc phep lam sap moi
 * thu xung quanh no. Cong nay chi cat DUONG CUA RIENG tien trinh API cua bai tap.
 *
 * DONG = huy moi ket noi dang mo VA tu choi ket noi moi. Chi lam mot trong hai la khong du:
 * Prisma giu mot be ket noi, nen neu khong huy ket noi cu thi truy van tiep theo van chay tren
 * mot socket con song va bai tap se khong co loi nao.
 */
function openDbGate(listenPort, upstreamPort) {
  const sockets = new Set();
  let accepting = true;

  const server = createServer((client) => {
    if (!accepting) {
      client.destroy();
      return;
    }
    const upstream = createConnection({ host: '127.0.0.1', port: upstreamPort });
    sockets.add(client);
    sockets.add(upstream);
    client.pipe(upstream);
    upstream.pipe(client);
    const drop = () => {
      sockets.delete(client);
      sockets.delete(upstream);
      client.destroy();
      upstream.destroy();
    };
    client.on('error', drop);
    upstream.on('error', drop);
    client.on('close', drop);
    upstream.on('close', drop);
  });

  return {
    listen: () =>
      new Promise((done) => {
        server.listen(listenPort, '127.0.0.1', done);
      }),
    close: () => {
      accepting = false;
      for (const socket of sockets) socket.destroy();
      sockets.clear();
    },
    stop: () =>
      new Promise((done) => {
        accepting = false;
        for (const socket of sockets) socket.destroy();
        server.close(() => done());
      }),
  };
}

// --------------------------------------------------------------- tien trinh con
function run(command, args, options) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', () => undefined);
  return child;
}

async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      /* chua len */
    }
    await sleep(500);
  }
  throw new Error(`HET GIO cho ${label} (${url})`);
}

async function control(mode) {
  await fetch(`http://127.0.0.1:${faultPort}/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mode),
  });
}

// --------------------------------------------------------------- bai tap
const DRILL = `DRILL-${which.toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const TENANT = 'ultty';
const ENVIRONMENT = 'debug-drill';

const SAMPLES = [
  'HN_24.8_Meta HN, 3 x V08',
  'cho a 2 cai V08 ve TN',
  'gui nhe 4 x V08',
  'HN_24.8_Meta HN, 6 x ELNI',
];

async function simulate(chatId, index) {
  const text = `${SAMPLES[index % SAMPLES.length]} ${DRILL}`;
  const startedAt = Date.now();
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/demo/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, chatId }),
    });
    const payload = await response.json().catch(() => ({}));
    return {
      status: response.status,
      ms: Date.now() - startedAt,
      traceId: payload?.trace?.traceId ?? payload?.traceId ?? '',
      orderStatus: payload?.status ?? '',
      text,
    };
  } catch (error) {
    return {
      status: -1,
      ms: Date.now() - startedAt,
      traceId: '',
      orderStatus: '',
      text,
      error: String(error),
    };
  }
}

async function main() {
  mkdirSync(evidenceDir, { recursive: true });

  const gate = which === 'b' ? openDbGate(dbGatePort, 5432) : undefined;
  if (gate) await gate.listen();

  const fault = run('node', [join(here, 'fault-endpoint.mjs'), '--port', String(faultPort)], {
    cwd: repoRoot,
  });
  await waitForHttp(`http://127.0.0.1:${faultPort}/state`, 15_000, 'may chu gay loi');
  await control({ llmMode: 'ok', reset: true });

  const api = run(
    'node',
    [
      '--import',
      '@swc-node/register/esm-register',
      '--import',
      pathToFileURL(join(apiDir, 'src/observability/otel/otel-preload.ts')).href,
      'src/main.ts',
    ],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: String(apiPort),
        TENANT,
        DATA_CLASSIFICATION: 'test',
        DEPLOYMENT_ENVIRONMENT: ENVIRONMENT,
        RELEASE_GIT_SHA: 'debug-drill',
        AUTH_MODE: 'none',
        ADMIN_UI: 'off',
        CHANNEL_MODE: 'mock',
        BOT_MODE: 'off',
        // KILL SWITCH VAN HANH — bai tap nay khong duoc gui mot tin nao ra ngoai.
        AUTO_SEND: 'off',
        STREAM_MODE: 'off',
        LOG_FORMAT: 'json',
        // CA B can Prisma that (de co loi Prisma that); ca A khong can DB de chay.
        PERSISTENCE: which === 'b' ? 'prisma' : 'memory',
        DATABASE_URL: `postgresql://netviet:netviet_local@127.0.0.1:${
          which === 'b' ? dbGatePort : 5432
        }/netviet?schema=public`,
        // Tang LLM tro vao may chu gay loi — KHONG goi mot nha cung cap that nao.
        PARSER_MODE: 'flowise',
        FLOWISE_BASE_URL: `http://127.0.0.1:${faultPort}`,
        FLOWISE_FLOW_ID: 'drill-flow',
        FLOWISE_API_KEY: FIXTURE_FLOWISE_KEY,
        FLOWISE_TIMEOUT_MS: '4000',
        OTEL_TRACING: 'on',
        OTEL_SERVICE_NAME: 'nexagnet-api',
        OTEL_EXPORTER_OTLP_ENDPOINT: clickstack,
        OTEL_TRACES_SAMPLER_ARG: '1',
      },
    },
  );

  await waitForHttp(`http://127.0.0.1:${apiPort}/demo/settings`, 180_000, 'API');

  const groups = await fetch(`http://127.0.0.1:${apiPort}/demo/groups`).then((r) => r.json());
  const chatId = groups?.[0]?.chatId;
  if (!chatId) throw new Error('goi khach khong co nhom nao duoc map — khong dung duoc bai tap');

  const windowStart = new Date().toISOString();
  const healthy = [];
  for (let i = 0; i < messages; i += 1) healthy.push(await simulate(chatId, i));

  // ------------------------------------------------------------- GAY LOI
  const brokeAt = new Date().toISOString();
  if (which === 'a') await control({ llmMode: 'http500' });
  else gate.close();

  const broken = [];
  for (let i = 0; i < messages; i += 1) broken.push(await simulate(chatId, i));
  const windowEnd = new Date().toISOString();

  // `BatchSpanProcessor` gom span 2 giay mot lo. Cho HON the roi moi tat — tren Windows
  // `kill('SIGTERM')` la TerminateProcess, khong hook nao chay, nen lo cuoi se mat neu ta tat
  // ngay. Doi la cach duy nhat chac chan o day.
  await sleep(8_000);

  api.kill('SIGKILL');
  fault.kill('SIGKILL');
  if (gate) await gate.stop();

  // ------------------------------------------------------------- PHIEU DE (cho nguoi lam bai)
  const card = [
    '',
    '='.repeat(78),
    `PHIEU DE — CASE ${which.toUpperCase()}`,
    '='.repeat(78),
    `  tenant            ${TENANT}`,
    `  environment       ${ENVIRONMENT}`,
    `  chatId            ${chatId}`,
    `  dau moc trong tin ${DRILL}`,
    `  khoang thoi gian  ${windowStart}  ->  ${windowEnd}`,
    `  ClickStack        ${hyperdx}`,
    '',
    '  CAU HOI: he thong hong o buoc nao, va nguyen nhan chinh la gi?',
    '',
    `  Trong khoang tren co ${messages} luot BINH THUONG truoc, roi ${messages} luot HONG sau.`,
    `  Moc chuyen: ${brokeAt}`,
    '',
    '  DUOC dung: ClickStack / HyperDX.',
    '  KHONG dung: source code, docker logs, SQL truc tiep, hoi Claude trong luc lam bai.',
    '='.repeat(78),
    '',
  ].join('\n');
  process.stdout.write(card);

  // ------------------------------------------------------------- DAP AN (khong in ra)
  const answer = [
    `# Dap an — CASE ${which.toUpperCase()} (${DRILL})`,
    '',
    `> Sinh luc ${windowStart}. KHONG dua file nay cho nguoi lam bai truoc khi ho tra loi.`,
    '',
    '## Cau tra loi dung',
    '',
    which === 'a'
      ? [
          '- **Tang hong:** goi LLM (parser) ra ngoai — span HTTP con cua buoc parse,',
          '  `http.response.status_code = 500`, dich `127.0.0.1:4799`.',
          '- **Nguyen nhan chinh:** he LLM thuong nguon tra **HTTP 500**; parser khong lay duoc',
          '  ket qua nen luot ket thuc bang loi / khong trich xuat duoc don.',
          '- **Doc ra tu dau:** buoc parse chuyen sang ERROR, va thoi luong lech han so voi cac',
          '  luot binh thuong ngay truoc do trong cung `chatId`.',
        ].join('\n')
      : [
          '- **Tang hong:** truy cap CSDL. Buoc nghiep vu `conversation.resolve` chuyen sang',
          '  ERROR, va `StatusMessage` cua no mang nguyen van loi cua Prisma:',
          '  `PrismaClientKnownRequestError: Invalid prisma.message.findMany() invocation:',
          '  Server has closed the connection.`',
          '- **Nguyen nhan chinh:** MAT KET NOI toi Postgres giua chung.',
          '  · Ket noi DANG MO trong be bi cat -> `Server has closed the connection`;',
          "  · ket noi MOI khong mo duoc       -> `P1001 Can't reach database server`.",
          '  Tuy thoi diem ma nguoi lam bai gap ma nao; ca hai deu la CUNG mot nguyen nhan.',
          '- **Doc ra tu dau:** cac luot truoc do trong cung `chatId` co day span',
          '  `prisma:client:operation` binh thuong; tu moc chuyen tro di span Prisma bien mat va',
          '  buoc nghiep vu bao loi ket noi. So span moi luot tut han xuong.',
        ].join('\n'),
    '',
    '## Neo tra cuu',
    '',
    `- tenant \`${TENANT}\` · environment \`${ENVIRONMENT}\` · chatId \`${chatId}\``,
    `- khoang: ${windowStart} -> ${windowEnd} · moc gay loi: ${brokeAt}`,
    '',
    '## Cac luot BINH THUONG',
    '',
    ...healthy.map(
      (r) => `- HTTP ${r.status} · ${r.ms}ms · trace \`${r.traceId || '(khong co)'}\` · ${r.text}`,
    ),
    '',
    '## Cac luot HONG',
    '',
    ...broken.map(
      (r) => `- HTTP ${r.status} · ${r.ms}ms · trace \`${r.traceId || '(khong co)'}\` · ${r.text}`,
    ),
    '',
  ].join('\n');

  const answerPath = join(evidenceDir, `human-debug-answer-${which}.md`);
  writeFileSync(answerPath, answer, 'utf8');
  process.stdout.write(`(dap an da ghi vao ${answerPath} — dung mo truoc khi lam bai)\n`);
}

await main();
