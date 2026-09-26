#!/usr/bin/env node
/**
 * MAY CHU PWA CHO E2E — cung hinh dang voi `deploy/pwa/Caddyfile`, khong can Caddy.
 *
 *   PWA_ROOT=dist-web API_UPSTREAM=http://127.0.0.1:3001 PORT=8098 node e2e/pwa-server.mjs
 *
 * Hai viec, dung nhu Caddy lam o san xuat:
 *   · `/auth* /transport* /files* /health*` -> chuyen nguyen yeu cau (ke ca cookie phien + CSRF) toi
 *     API. PWA chay che do COOKIE cung origin (`auth-carrier.web.ts`), nen API PHAI o cung origin voi
 *     trang — mot cong API rieng se lam trinh duyet bo cookie;
 *   · con lai -> tep tinh trong ban xuat web; duong khong co tep -> `index.html` (expo-router SPA).
 *
 * CHI dung cho E2E cuc bo/CI. Khong co TLS, khong co CSP — do la viec cua Caddy o san xuat.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(process.env.PWA_ROOT ?? 'dist-web');
const UPSTREAM = new URL(process.env.API_UPSTREAM ?? 'http://127.0.0.1:3001');
const PORT = Number(process.env.PORT ?? 8098);
const API_PREFIXES = ['/auth', '/transport', '/files', '/health'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  process.stderr.write(`[pwa-server] Khong thay ${ROOT}/index.html — chay export:web truoc.\n`);
  process.exit(1);
}

function proxy(req, res) {
  const upstream = http.request(
    {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: UPSTREAM.host },
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`API khong tra loi: ${error.message}`);
  });
  req.pipe(upstream);
}

function serveFile(req, res) {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const candidate = normalize(join(ROOT, path));
  const safe = candidate.startsWith(ROOT) ? candidate : join(ROOT, 'index.html');
  const file =
    existsSync(safe) && statSync(safe).isFile()
      ? safe
      : existsSync(`${safe}.html`)
        ? `${safe}.html`
        : join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (
      API_PREFIXES.some(
        (prefix) =>
          path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
      )
    ) {
      proxy(req, res);
      return;
    }
    serveFile(req, res);
  })
  .listen(PORT, '127.0.0.1', () => {
    process.stdout.write(
      `[pwa-server] http://127.0.0.1:${PORT} -> ${ROOT} | API ${UPSTREAM.origin}\n`,
    );
  });
