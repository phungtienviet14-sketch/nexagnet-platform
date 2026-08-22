/**
 * Diem cuoi HTTP CO KIEM SOAT — dong vai "he thong ngoai" (ERP/CRM/webhook) cho POC.
 *
 * Ly do ton tai: yeu cau POC noi ro "khong external production". Ta can mot dich den
 * that su tra 500/429/treo THEO YEU CAU, de chung minh retry/backoff cua engine chay
 * that chu khong phai chi doc tai lieu.
 *
 * Bo dem theo `idempotencyKey` — de kich ban "hong 2 lan dau roi thanh cong" tai lap duoc,
 * va de do xem mot tac dung co bi ap DUNG HAI LAN khi engine retry hay khong.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.POCWF_ENDPOINT_PORT ?? 8745);

/** So lan da NHAN request cho moi khoa idempotency. */
const attemptsByKey = new Map<string, number>();
/** Khoa da THUC SU tao tac dung — dung de chung minh at-least-once vs effectively-once. */
const appliedKeys = new Set<string>();
/** Nhat ky theo thu tu, de dan vao bao cao lam bang chung. */
const journal: Array<Record<string, unknown>> = [];

type ProofRequest = {
  mode?: 'ok' | 'fail_then_ok' | 'rate_limited' | 'timeout';
  failTimes?: number;
  idempotencyKey?: string;
  payload?: unknown;
};

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && req.url === '/_state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        {
          attemptsByKey: Object.fromEntries(attemptsByKey),
          appliedKeys: [...appliedKeys],
          journal,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let parsed: ProofRequest = {};
    try {
      parsed = JSON.parse(body || '{}') as ProofRequest;
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'BAD_JSON' }));
      return;
    }

    const key = parsed.idempotencyKey ?? 'no-key';
    const seen = (attemptsByKey.get(key) ?? 0) + 1;
    attemptsByKey.set(key, seen);

    // `traceparent` W3C — day chinh la thu can chung minh di duoc tu Nexagnet sang day.
    const traceparent = req.headers.traceparent as string | undefined;
    const mode = parsed.mode ?? 'ok';
    const at = new Date().toISOString();

    const line = { at, mode, key, attempt: seen, traceparent: traceparent ?? null };
    journal.push(line);
    console.log(`[endpoint] ${JSON.stringify(line)}`);

    if (mode === 'timeout') {
      return; // khong tra loi — de ben goi tu het gio
    }

    if (mode === 'rate_limited') {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
      res.end(JSON.stringify({ error: 'HTTP_RATE_LIMITED', attempt: seen }));
      return;
    }

    if (mode === 'fail_then_ok' && seen <= (parsed.failTimes ?? 2)) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE', attempt: seen }));
      return;
    }

    const appliedNow = !appliedKeys.has(key);
    appliedKeys.add(key);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        externalRef: `EXT-${key}`,
        attempt: seen,
        appliedNow,
        receivedTraceparent: traceparent ?? null,
        at,
      }),
    );
  });
});

server.listen(PORT, () => {
  console.log(`[endpoint] nghe tren http://localhost:${PORT}`);
});
