/* global self, caches */
/**
 * SERVICE WORKER cua PWA Nexagent Transport — CHI giu VO UNG DUNG de mo duoc khi mat song. Du lieu
 * nghiep vu KHONG BAO GIO qua cache nay: viec bam ngoai tuyen nam trong IndexedDB (hang doi), con
 * moi yeu cau API (`/auth`, `/transport`, `/files`, `/health`) va moi yeu cau khong phai GET di
 * thang ra mang — mot phan hoi API cu tra tu cache la mot so lieu sai hien nhu so lieu that.
 *
 * `BUILD` duoc `scripts/pwa-postexport.mjs` thay sau `expo export`: ma ban dung (bam cua index.html
 * + moi tep tien nap) va danh sach tien nap. Ban dung moi = ten cache moi = SW moi; ban cu bi xoa
 * khi ban moi len ngoi.
 *
 * CAP NHAT AN TOAN: SW moi cai xong thi CHO (khong tu `skipWaiting`). Trang hoi nguoi dung
 * (src/pwa/PwaUpdatePrompt.web.tsx), doi hang doi gui xong luot dang chay, roi moi gui
 * `SKIP_WAITING` va tai lai — khong bao gio thay ma giua chung mot lan bam.
 */
'use strict';

const BUILD = /* __PWA_BUILD__ */ { id: 'dev', precache: [] }; /* __PWA_BUILD_END__ */

const CACHE_PREFIX = 'nexagent-shell-';
const CACHE = CACHE_PREFIX + BUILD.id;
const SHELL = '/index.html';
/** Trung tien to voi matcher `@api` cua deploy/pwa/Caddyfile — hai noi phai khop. */
const API_PREFIXES = ['/auth', '/transport', '/files', '/health'];
/** Tep co bam trong ten (khong bao gio doi noi dung) — cache truoc, mang sau. */
const IMMUTABLE_PREFIXES = ['/_expo/static/', '/assets/'];
/** Song yeu qua thi dung vo da luu sau chung nay mili giay, khong de lai xe nhin man trang. */
const NAVIGATION_TIMEOUT_MS = 4000;

function isApi(pathname) {
  return API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isImmutable(pathname) {
  return IMMUTABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(BUILD.precache.map((path) => new Request(path, { cache: 'reload' }))),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Trang bao nhung tep no DA nap (font, anh) — luu lai de lan mo ngoai tuyen sau co du. */
async function warm(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(
    urls.map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin);
        if (url.origin !== self.location.origin || !isImmutable(url.pathname)) return;
        if (await cache.match(url.href)) return;
        const response = await fetch(url.href);
        if (response.ok && response.type === 'basic') await cache.put(url.href, response);
      } catch {
        // Mot tep khong luu duoc khong lam hong cac tep khac.
      }
    }),
  );
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) event.waitUntil(warm(data.urls));
});

async function cachedShell() {
  const cache = await caches.open(CACHE);
  return (await cache.match(SHELL)) || (await cache.match('/'));
}

/**
 * Dieu huong: MANG TRUOC (ban moi nhat khi co song), het gio/loi/5xx thi tra vo da luu. KHONG ghi
 * de vo da luu bang ban tai tu mang: vo do tro toi dung bo JS da tien nap cua ban nay.
 */
async function navigate(request) {
  const network = fetch(request);
  // Da tra vo luu ma mang loi SAU do: khong de mot Promise bi tu choi treo lo lung trong SW.
  network.catch(() => null);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    if (response && response.status < 500) return response;
    const shell = await cachedShell();
    if (shell) return shell;
    return response || (await network);
  } catch {
    const shell = await cachedShell();
    if (shell) return shell;
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

async function networkThenCache(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const hit = await caches.match(request, { cacheName: CACHE });
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApi(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (isImmutable(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (BUILD.precache.includes(url.pathname)) event.respondWith(networkThenCache(request));
});
