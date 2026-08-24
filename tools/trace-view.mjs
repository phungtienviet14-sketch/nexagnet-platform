#!/usr/bin/env node
/**
 * DOC MOT LUOT XU LY tu dong NDJSON, in ra CAY NGHIEP VU.
 *
 * VI SAO CO FILE NAY: muc 25 noi "khong xay trace viewer neu Grafana da lam tot". Ta KHONG dung
 * Grafana (xem docs/kien-truc/observability-review.md §13), nen phai co mot cach doc — va o quy mo
 * 10-20 don/ngay thi mot bo loc doc stdin la du. Khong co no, "quan sat duoc" chi la mot dong
 * JSON dai ma nguoi ta van phai tu ghep bang mat.
 *
 * DUNG:
 *   docker logs zalo-ultty-gd1-test-api-1 2>&1 | node tools/trace-view.mjs
 *   docker logs ... | node tools/trace-view.mjs --trace 4bf92f3577b34da6a3ce929d0e0e4736
 *   docker logs ... | node tools/trace-view.mjs --order don-abc
 *   docker logs ... | node tools/trace-view.mjs --denied      # chi luot co cong bi dong
 *
 * Doc dong KHONG phai JSON thi bo qua: log cua Prisma/Nest luc boot van tron trong cung mot luong.
 */

import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name) => args.includes(name);

const wantTrace = flag('--trace');
const wantOrder = flag('--order');
const wantChat = flag('--chat');
const deniedOnly = has('--denied');
const limit = Number(flag('--limit') ?? 20);

const COLOR = process.stdout.isTTY && !has('--no-color');
const paint = (code, text) => (COLOR ? `[${code}m${text}[0m` : text);
const dim = (text) => paint('2', text);
const bold = (text) => paint('1', text);
const red = (text) => paint('31', text);
const yellow = (text) => paint('33', text);
const green = (text) => paint('32', text);
const cyan = (text) => paint('36', text);

/** traceId -> ban ghi cua luot do, giu nguyen thu tu doc duoc. */
const traces = new Map();

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const start = line.indexOf('{');
  if (start < 0) continue;
  let record;
  try {
    record = JSON.parse(line.slice(start));
  } catch {
    continue; // Dong khong phai JSON — log boot, log Prisma, banner Nest.
  }
  if (!record.traceId) continue;
  if (wantTrace && record.traceId !== wantTrace) continue;
  if (wantOrder && record.orderId !== wantOrder) continue;
  if (wantChat && record.chatId !== wantChat) continue;
  if (!traces.has(record.traceId)) traces.set(record.traceId, []);
  traces.get(record.traceId).push(record);
}

const selected = [...traces.entries()]
  .filter(([, records]) =>
    deniedOnly ? records.some((record) => record.outcome === 'denied') : true,
  )
  .slice(-limit);

if (selected.length === 0) {
  process.stderr.write(
    'Khong tim thay luot nao khop.\n' +
      'Kiem tra: API co dang chay voi LOG_FORMAT=json khong? ' +
      '(khong co no thi log la text, khong phai JSON)\n',
  );
  process.exit(1);
}

for (const [traceId, records] of selected) {
  const first = records[0];
  const total = records
    .filter((record) => record.event === 'step')
    .reduce((max, record) => Math.max(max, record.durationMs ?? 0), 0);

  process.stdout.write('\n');
  process.stdout.write(
    `${bold('TRACE')} ${cyan(traceId)}` +
      (first.causationTraceId ? dim(` ← từ ${first.causationTraceId}`) : '') +
      '\n',
  );
  process.stdout.write(
    dim(
      `  ${first.tenant}/${first.environment}` +
        (first.release ? ` · release=${first.release}` : ' · release=?') +
        (first.chatId ? ` · nhom=${first.chatId}` : '') +
        (first.orderId ? ` · don=${first.orderId}` : '') +
        // Luot do NGUOI bam nut: ai bam, va luot nao da gay ra no. Thieu hai manh nay thi mot
        // luot "Duyet & gui" trong y het mot luot tu dong khong ro tu dau ra.
        (first.actor ? ` · nguoi=${first.actor}` : '') +
        (total ? ` · ${total}ms` : ''),
    ) + '\n',
  );

  // Dung cay theo parentSpanId. Ban ghi khong phai `step` treo vao span cha cua no.
  const bySpan = new Map();
  for (const record of records) {
    if (record.event === 'step') bySpan.set(record.spanId, record);
  }
  const childrenOf = (spanId) =>
    records.filter((record) =>
      record.event === 'step'
        ? record.parentSpanId === spanId
        : record.parentSpanId === spanId || (spanId === undefined && !record.parentSpanId),
    );

  const printed = new Set();
  const render = (record, depth) => {
    if (printed.has(record)) return;
    printed.add(record);
    process.stdout.write(`${'  '.repeat(depth + 1)}${describe(record)}\n`);
    if (record.event !== 'step') return;
    for (const child of childrenOf(record.spanId)) render(child, depth + 1);
  };

  const roots = records.filter(
    (record) => !record.parentSpanId || !bySpan.has(record.parentSpanId),
  );
  for (const root of roots) render(root, 0);
  // Bat ky ban ghi nao chua duoc in (cha bi mat) van phai hien ra — mot dau vet bi nuot
  // vi cay dung sai con te hon mot cay xau.
  for (const record of records) render(record, 0);
}

function describe(record) {
  switch (record.event) {
    case 'step': {
      const mark = record.status === 'error' ? red('x') : green('.');
      const ms = record.durationMs !== undefined ? dim(` ${record.durationMs}ms`) : '';
      const err = record.error ? red(` ${record.error.name}: ${record.error.message}`) : '';
      return `${mark} ${bold(record.step)}${ms}${err}`;
    }
    case 'decision': {
      const mark =
        record.outcome === 'denied'
          ? red('x')
          : record.outcome === 'degraded'
            ? yellow('~')
            : green('v');
      const detail = record.detail ? dim(` ${JSON.stringify(record.detail)}`) : '';
      return `${mark} ${record.decision} -> ${bold(record.outcome)} ${yellow(record.reason)}${detail}`;
    }
    case 'state_change':
      return `${cyan('>>')} ${record.entity} ${record.from ?? '(moi)'} -> ${bold(record.to)}${
        record.reason ? dim(` (${record.reason})`) : ''
      }`;
    case 'data_change':
      return `${cyan('~~')} ${record.entity}.${record.field}: ${JSON.stringify(
        record.from,
      )} -> ${bold(JSON.stringify(record.to))}`;
    case 'ai_call': {
      const mark = record.status === 'error' ? red('x') : green('*');
      const tokens =
        record['gen_ai.usage.input_tokens'] !== undefined
          ? dim(
              ` ${record['gen_ai.usage.input_tokens']}->${record['gen_ai.usage.output_tokens']} tok`,
            )
          : '';
      const tools = record.toolNames?.length ? dim(` cong cu=[${record.toolNames.join(',')}]`) : '';
      return `${mark} AI ${bold(record['gen_ai.operation.name'])} ${record['gen_ai.system']}/${
        record['gen_ai.request.model']
      }${dim(` ${record.durationMs}ms`)}${tokens}${tools}`;
    }
    default:
      // Dong log thuong cua Nest (co traceId nho `StructuredNestLogger`).
      return `${dim('|')} ${record.level === 'error' ? red(record.msg) : dim(record.msg ?? '')}`;
  }
}
