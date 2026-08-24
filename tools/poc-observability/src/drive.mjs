#!/usr/bin/env node
/**
 * BOM TIN VAO PIPELINE va do do tre.
 *
 * Do `POST /demo/simulate` — cong duy nhat chay TRON pipeline that ma khong can Zalo. Do tre o
 * day gom ca vao/ra HTTP cua chinh phep do, nhung ca hai lan do (co OTel va khong) deu chiu cung
 * mot khoan do, nen phan tram chenh lech van doc duoc.
 *
 * WARMUP la bat buoc, khong phai lam dep so: lan goi dau tien phai nap engine Prisma, mo ket noi,
 * va JIT chua nong. Tinh no vao p95 la do JIT chu khong phai do OTel.
 *
 * Chay:  node src/drive.mjs --base http://127.0.0.1:3399 --n 60 --label baseline --out ./evidence
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const base = arg('base', 'http://127.0.0.1:3399');
const total = Number(arg('n', '60'));
const warmup = Number(arg('warmup', '8'));
const label = arg('label', 'run');
const outDir = arg('out', join(process.cwd(), 'evidence'));
const text = arg('text', '');
const chatId = arg('chat', '');

mkdirSync(outDir, { recursive: true });

const SAMPLES = [
  'HN_24.8_Meta HN, 3 x V08',
  'HN_24.8_Meta HN, 5 x ELNI',
  'cho a 2 cai V08 ve TN',
  'HERCULES bao nhieu tien a',
  'gui nhe 4 x V08',
];

async function once(index) {
  const body = {
    text: text || SAMPLES[index % SAMPLES.length],
    ...(chatId ? { chatId } : {}),
  };
  const startedAt = process.hrtime.bigint();
  let status = 0;
  let traceId = '';
  let orderId = '';
  try {
    const response = await fetch(`${base}/demo/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    status = response.status;
    const payload = await response.json().catch(() => ({}));
    traceId = payload?.trace?.traceId ?? payload?.traceId ?? '';
    orderId = payload?.id ?? '';
  } catch (error) {
    status = -1;
    orderId = error.message.slice(0, 60);
  }
  const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
  return { ms, status, traceId, orderId, text: body.text };
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

for (let i = 0; i < warmup; i += 1) await once(i);

const results = [];
for (let i = 0; i < total; i += 1) results.push(await once(i));

const ok = results.filter((r) => r.status >= 200 && r.status < 300);
const durations = ok.map((r) => r.ms);
const summary = {
  label,
  at: new Date().toISOString(),
  requested: total,
  ok: ok.length,
  failed: results.length - ok.length,
  p50: Number(quantile(durations, 0.5).toFixed(1)),
  p95: Number(quantile(durations, 0.95).toFixed(1)),
  p99: Number(quantile(durations, 0.99).toFixed(1)),
  mean: Number((durations.reduce((a, b) => a + b, 0) / Math.max(durations.length, 1)).toFixed(1)),
};

appendFileSync(join(outDir, 'latency.ndjson'), `${JSON.stringify(summary)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (results.length > 0) {
  process.stdout.write(`vi du: ${JSON.stringify(results[results.length - 1])}\n`);
}
