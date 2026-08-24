#!/usr/bin/env node
/**
 * QUET BAY DO tren TOAN BO du lieu DA GUI.
 *
 * Doc moi byte ma `otlp-capture.mjs` bat duoc va tim cac chuoi bi mat / PII da cai san trong
 * `.env.poc` va trong noi dung tin test. Mot lan khop la mot lan ro ri THAT — khong phai mot bai
 * test do, ma la mot su co bao mat da xay ra tren duong ra.
 *
 * IN RA SO LAN KHOP, KHONG IN RA CHUOI KHOP. Mot cong cu kiem ro ri ma tu in bi mat ra man hinh
 * (roi vao log CI, roi vao transcript) la mot duong ro ri thu hai.
 *
 * Chay:  node src/grep-secrets.mjs --dir ./evidence/otlp
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIXTURE_ANTHROPIC_KEY,
  FIXTURE_DEEPSEEK_KEY,
  FIXTURE_FLOWISE_KEY,
  FIXTURE_ZALO_BOT_TOKEN,
  literalPattern,
} from './fixture-secrets.mjs';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const dir = arg('dir', join(process.cwd(), 'evidence', 'otlp'));

/**
 * `mustBeZero: true`  -> BAT BUOC 0 lan khop, du o muc rieng tu nao.
 * `mustBeZero: false` -> chi bao so lieu; o `DATA_CLASSIFICATION=test` (muc `full`) noi dung
 *                        khach DUOC PHEP giu, nen mot lan khop o day khong phai loi.
 */
const PROBES = [
  {
    name: 'khoa Flowise (Bearer)',
    pattern: literalPattern(FIXTURE_FLOWISE_KEY),
    mustBeZero: true,
  },
  {
    name: 'khoa Anthropic',
    pattern: literalPattern(FIXTURE_ANTHROPIC_KEY),
    mustBeZero: true,
  },
  { name: 'khoa DeepSeek', pattern: literalPattern(FIXTURE_DEEPSEEK_KEY), mustBeZero: true },
  { name: 'token Zalo bot', pattern: literalPattern(FIXTURE_ZALO_BOT_TOKEN), mustBeZero: true },
  { name: 'mat khau DB', pattern: /netviet_local/g, mustBeZero: true },
  { name: 'chuoi ket noi Postgres', pattern: /postgresql:\/\/[^\s"]*:[^\s"@]+@/g, mustBeZero: true },
  {
    name: 'header Authorization',
    pattern: /"http\.request\.header\.authorization"/gi,
    mustBeZero: true,
  },
  { name: 'header Cookie', pattern: /"http\.request\.header\.cookie"/gi, mustBeZero: true },
  { name: 'Bearer <token>', pattern: /Bearer\s+[A-Za-z0-9._~+/-]{8,}/g, mustBeZero: true },
  { name: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./g, mustBeZero: true },
  {
    name: 'tham so SQL (db.query.parameter.*)',
    pattern: /db\.query\.parameter\./g,
    mustBeZero: true,
  },
  { name: 'than request/response', pattern: /"http\.(request|response)\.body"/g, mustBeZero: true },
  { name: 'query string trong URL', pattern: /"url\.query"/g, mustBeZero: true },
  { name: 'bat ky khoa kieu sk- nao', pattern: /\bsk-[A-Za-z0-9]{16,}/g, mustBeZero: true },
  // Duoi day la NOI DUNG KHACH, khong phai bi mat. O muc `full` (stack test) chung duoc phep co.
  { name: 'SDT bay do (noi dung khach)', pattern: /0912345678/g, mustBeZero: false },
  { name: 'email bay do (noi dung khach)', pattern: /poc-fixture@example\.com/g, mustBeZero: false },
];

let bytes = 0;
const counts = new Map(PROBES.map((probe) => [probe.name, 0]));
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  bytes += Buffer.byteLength(text);
  for (const probe of PROBES) {
    const matches = text.match(probe.pattern);
    if (matches) counts.set(probe.name, counts.get(probe.name) + matches.length);
  }
}

process.stdout.write(`quet ${files.length} lo OTLP, ${(bytes / 1024).toFixed(0)} KiB\n\n`);
let failed = 0;
for (const probe of PROBES) {
  const hits = counts.get(probe.name);
  const verdict = probe.mustBeZero ? (hits === 0 ? 'DAT' : 'RO RI') : 'thong tin';
  if (probe.mustBeZero && hits > 0) failed += 1;
  process.stdout.write(`  ${verdict.padEnd(9)} ${String(hits).padStart(5)}  ${probe.name}\n`);
}
process.stdout.write(
  failed === 0
    ? '\nKET LUAN: 0 bay do bi mat lot ra.\n'
    : `\nKET LUAN: ${failed} bay do BI LOT — dung lai, khong duoc bat tiep.\n`,
);
process.exit(failed === 0 ? 0 : 1);
