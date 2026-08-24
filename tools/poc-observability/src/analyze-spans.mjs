#!/usr/bin/env node
/**
 * DOC LAI THU DA GUI. Dem span theo TRACE, khong theo lo — vi ngan sach cua muc 10 la
 * "5-15 buoc cho MOT LUOT", con lo chi la don vi dong goi cua exporter.
 *
 * In ra:
 *   · trung vi / p95 so span moi trace, va so trace vuot nguong;
 *   · bang ten span (de thay ngay instrumentation nao dang no ra hang tram span);
 *   · cay cua mot trace cu the khi truyen `--trace <id>`.
 *
 * Chay:  node src/analyze-spans.mjs --dir ./evidence/otlp [--trace <traceId>] [--since <ISO>]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const dir = arg('dir', join(process.cwd(), 'evidence', 'otlp'));
const wanted = arg('trace', '');
const since = arg('since', '');
const sinceNs = since ? BigInt(new Date(since).getTime()) * 1_000_000n : 0n;

/** Mot span da phang hoa — chi giu thu can de dem va dung cay. */
const spans = [];

for (const file of readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  let payload;
  try {
    payload = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch {
    continue;
  }
  for (const resource of payload.resourceSpans ?? []) {
    const resourceAttributes = Object.fromEntries(
      (resource.resource?.attributes ?? []).map((a) => [a.key, Object.values(a.value ?? {})[0]]),
    );
    for (const scope of resource.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        if (sinceNs > 0n && BigInt(span.startTimeUnixNano ?? '0') < sinceNs) continue;
        spans.push({
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId ?? '',
          name: span.name,
          scope: scope.scope?.name ?? '?',
          status: span.status?.code ?? 0,
          startNs: BigInt(span.startTimeUnixNano ?? '0'),
          endNs: BigInt(span.endTimeUnixNano ?? '0'),
          attributes: Object.fromEntries(
            (span.attributes ?? []).map((a) => [a.key, Object.values(a.value ?? {})[0]]),
          ),
          events: (span.events ?? []).map((event) => ({
            name: event.name,
            attributes: Object.fromEntries(
              (event.attributes ?? []).map((a) => [a.key, Object.values(a.value ?? {})[0]]),
            ),
          })),
          service: resourceAttributes['service.name'],
        });
      }
    }
  }
}

const byTrace = new Map();
for (const span of spans) {
  if (!byTrace.has(span.traceId)) byTrace.set(span.traceId, []);
  byTrace.get(span.traceId).push(span);
}

function quantile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[index];
}

if (wanted) {
  const tree = byTrace.get(wanted);
  if (!tree) {
    process.stdout.write(`khong tim thay trace ${wanted}\n`);
    process.exit(1);
  }
  const children = new Map();
  for (const span of tree) {
    const key = span.parentSpanId || '(goc)';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(span);
  }
  const roots = tree.filter(
    (s) => !s.parentSpanId || !tree.some((o) => o.spanId === s.parentSpanId),
  );
  const print = (span, depth) => {
    const ms = Number(span.endNs - span.startNs) / 1e6;
    const mark = span.status === 2 ? ' [LOI]' : '';
    process.stdout.write(
      `${'  '.repeat(depth)}${span.name}  ${ms.toFixed(0)}ms  <${span.scope}>${mark}\n`,
    );
    for (const event of span.events) {
      const reason =
        event.attributes['nexagnet.decision.reason'] ??
        event.attributes['nexagnet.to'] ??
        event.attributes['exception.type'] ??
        '';
      const point = event.attributes['nexagnet.decision.point'] ?? '';
      process.stdout.write(
        `${'  '.repeat(depth + 1)}· ${event.name}${point ? ` ${point}` : ''}${reason ? ` -> ${reason}` : ''}\n`,
      );
    }
    for (const child of (children.get(span.spanId) ?? []).sort((a, b) =>
      a.startNs < b.startNs ? -1 : 1,
    )) {
      print(child, depth + 1);
    }
  };
  for (const root of roots.sort((a, b) => (a.startNs < b.startNs ? -1 : 1))) print(root, 0);
  process.stdout.write(`\ntong: ${tree.length} span\n`);
  process.exit(0);
}

const counts = [...byTrace.values()].map((list) => list.length);
const nameCount = new Map();
const scopeCount = new Map();
for (const span of spans) {
  nameCount.set(span.name, (nameCount.get(span.name) ?? 0) + 1);
  scopeCount.set(span.scope, (scopeCount.get(span.scope) ?? 0) + 1);
}

process.stdout.write(`span: ${spans.length} · trace: ${byTrace.size}\n`);
process.stdout.write(
  `span/trace — trung vi ${quantile(counts, 0.5)} · p95 ${quantile(counts, 0.95)} · max ${Math.max(0, ...counts)}\n`,
);
process.stdout.write(`trace >18 span: ${counts.filter((c) => c > 18).length}\n\n`);

process.stdout.write('theo instrumentation:\n');
for (const [scope, count] of [...scopeCount].sort((a, b) => b[1] - a[1])) {
  process.stdout.write(`  ${String(count).padStart(5)}  ${scope}\n`);
}
process.stdout.write('\n15 ten span nhieu nhat:\n');
for (const [name, count] of [...nameCount].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  process.stdout.write(`  ${String(count).padStart(5)}  ${name}\n`);
}

process.stdout.write('\ntrace lon nhat:\n');
for (const [traceId, list] of [...byTrace].sort((a, b) => b[1].length - a[1].length).slice(0, 5)) {
  const root = list.find((s) => !list.some((o) => o.spanId === s.parentSpanId));
  process.stdout.write(
    `  ${traceId}  ${String(list.length).padStart(4)} span  goc=${root?.name ?? '?'}\n`,
  );
}
