#!/usr/bin/env node
/**
 * CAI BAY TREN DAY — mot proxy OTLP/HTTP ghi lai NGUYEN VAN moi byte roi khoi tien trinh API,
 * roi chuyen tiep sang ClickStack.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CAN THU NAY, khi da co bai unit test cho bo loc rieng tu:
 *
 * Bai unit test chung minh QUY TAC dung. No khong chung minh quy tac do duoc AP DUNG tren duong
 * ra that: mot processor quen dang ky, mot exporter thu hai ai do them vao, mot thuoc tinh do
 * instrumentation dat SAU khi bo loc chay — ba loi do deu di qua duoc moi bai unit test.
 *
 * Cach duy nhat de biet chac la doc thu DA GUI. File nay lam dung viec do: nhat het body vao
 * dia, de `grep-secrets.mjs` quet tren du lieu THAT chu khong tren du lieu ta tin la minh gui.
 *
 * `@opentelemetry/exporter-trace-otlp-http` gui JSON (khong phai protobuf), nen thu bat duoc doc
 * duoc bang mat va grep duoc bang chuoi thuong.
 *
 * Chay:  node src/otlp-capture.mjs --port 4788 --forward http://127.0.0.1:4766 --out ./evidence/otlp
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(arg('port', '4788'));
const forward = arg('forward', 'http://127.0.0.1:4766');
const outDir = arg('out', join(process.cwd(), 'evidence', 'otlp'));

mkdirSync(outDir, { recursive: true });
const indexPath = join(outDir, 'index.ndjson');

let batch = 0;
let spanTotal = 0;

/** Dem span trong mot goi OTLP/JSON — de bao ngan sach span ma khong phai mo ClickHouse. */
function countSpans(text) {
  try {
    const payload = JSON.parse(text);
    let total = 0;
    for (const resource of payload.resourceSpans ?? []) {
      for (const scope of resource.scopeSpans ?? []) total += (scope.spans ?? []).length;
    }
    return total;
  } catch {
    return 0;
  }
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    if (req.url?.startsWith('/v1/traces')) {
      batch += 1;
      const text = body.toString('utf8');
      const spans = countSpans(text);
      spanTotal += spans;
      writeFileSync(join(outDir, `batch-${String(batch).padStart(4, '0')}.json`), text, 'utf8');
      appendFileSync(
        indexPath,
        `${JSON.stringify({ batch, at: new Date().toISOString(), bytes: body.length, spans })}\n`,
        'utf8',
      );
      process.stdout.write(
        `[capture] lo ${batch}: ${spans} span, ${body.length} byte (tong ${spanTotal})\n`,
      );
    }

    // CHUYEN TIEP. Loi o day KHONG duoc lam hong lan bat: bang chung tren dia quan trong hon
    // viec ClickStack co nhan duoc hay khong, va ca hai tinh huong deu la du lieu cua POC.
    try {
      const upstream = await fetch(`${forward}${req.url}`, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
        body: body.length > 0 ? body : undefined,
      });
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(await upstream.text());
    } catch (error) {
      process.stdout.write(`[capture] chuyen tiep hong: ${error.message}\n`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`[capture] nghe http://127.0.0.1:${port} -> ${forward}, ghi vao ${outDir}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    process.stdout.write(`[capture] tong ket: ${batch} lo, ${spanTotal} span\n`);
    server.close(() => process.exit(0));
  });
}
