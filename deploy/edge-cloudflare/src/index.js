/**
 * `nexagnet-dev-edge` — MOT origin cong khai duy nhat cho stack dev/test tren Northflank.
 *
 * VI SAO TON TAI: tren VM, Caddy giu :443 va api/web khong he co dia chi cong. Northflank khong
 * cho mot tien trinh giu cong chung nhu vay, va goi Sandbox mien phi khong cho dat security policy
 * theo header o tang cong. Nen edge chuyen ra ngoai — mot Worker tren goi Cloudflare Free — va
 * khoa origin chuyen vao trong ung dung (`EDGE_PROXY_SECRET`).
 *
 * BANG DINH TUYEN DUOI DAY KHONG PHAI DO SUY DOAN. No la ban chep cua bo so khop `@api` trong
 * `deploy/netviet/edge/Caddyfile`, va `edge-routing.contract.test.mjs` doc NGUOC tu chinh tep
 * Caddyfile do de bat CI do neu hai ben lech nhau. Caddy phan biet hai ngu nghia:
 *   - muc KHONG co `*` o cuoi  -> khop CHINH XAC ca duong
 *   - muc CO `*` o cuoi        -> khop TIEN TO
 * Gop hai loai lam mot se day nhung duong von thuoc Next.js sang NestJS va tra 404 o dung cho
 * nguoi van hanh tuong la "giao dien co du, chi la khong co duong di toi" (su co 04/08/2026).
 * Caddy so khop khong phan biet HOA/thuong, nen ham duoi cung ha ve chu thuong truoc khi so.
 */

/** Cac muc Caddy viet KHONG kem `*`: khop dung ca duong, khong khop duong con. */
const API_EXACT = new Set([
  '/events',
  '/health',
  '/health/media',
  '/settings/summary',
  '/settings/readiness',
]);

/**
 * Cac muc Caddy viet kem `*`. Dau `/` cuoi la MOT PHAN cua hop dong o moi cho Caddy co viet no:
 * `/zalo/*` day `/zalo/groups` sang API trong khi van de trang `/zalo` tran o web, va
 * `/settings/groups/*` cung the so voi trang `/settings`.
 */
const API_PREFIX = [
  '/orders',
  '/messages',
  '/notifications',
  '/demo',
  '/erp',
  '/kiotviet',
  '/knowledge',
  '/broadcast',
  '/campaigns',
  '/auth',
  '/media/catalog/',
  '/zalo/',
  '/groups/',
  '/observability/traces',
  '/observability/debug',
  '/settings/source-truth',
  '/settings/groups/',
  '/settings/rules',
  '/settings/automation',
  '/settings/notifications',
  '/settings/audit',
  '/settings/price-periods',
  '/settings/dealers/',
  '/settings/deals/',
  '/settings/content',
  '/settings/master-data',
  '/settings/users',
  '/transport',
  '/admin',
];

/**
 * `internal/*` la be mat dich vu-dich vu. Ben API no do `InternalServiceGuard` giu, va guard do
 * xac thuc nguoi goi bang `x-api-key` khop `API_KEY` — nghia la edge TUYET DOI khong duoc cam
 * khoa do ho mot trinh duyet. Hai lop khoa doc lap:
 *   1. edge tu choi thang duong nay (o day),
 *   2. request len API khong bao gio mang `x-api-key` (xem STRIPPED_REQUEST_HEADERS).
 * Caddy dat duoc dieu tuong duong bang cach don gian la khong liet `internal` vao `@api`; ban nay
 * tu choi tuong minh vi bai nghiem thu doi mot cau tra loi quan sat duoc, khong phai mot su vang
 * mat.
 */
const DENY_PREFIX = '/internal';

/** Gia tri do client gui ma khong bao gio duoc di tiep len upstream. */
const STRIPPED_REQUEST_HEADERS = ['authorization', 'x-api-key', 'x-nexagnet-edge-key'];

const EDGE_HEADER = 'X-Nexagnet-Edge-Key';

/** @returns {'api' | 'web' | 'deny'} */
export function routeFor(pathname) {
  const p = pathname.toLowerCase();
  if (p.startsWith(DENY_PREFIX)) return 'deny';
  if (API_EXACT.has(p)) return 'api';
  for (const prefix of API_PREFIX) {
    if (p.startsWith(prefix)) return 'api';
  }
  return 'web';
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = routeFor(url.pathname);

    if (route === 'deny') {
      console.log(JSON.stringify({ msg: 'edge.denied', path: url.pathname }));
      return jsonResponse(404, { error: 'not_found', path: url.pathname });
    }

    const origin = route === 'api' ? env.API_ORIGIN : env.WEB_ORIGIN;
    if (!origin || !env.EDGE_KEY) {
      console.error(JSON.stringify({ msg: 'edge.misconfigured', route }));
      return jsonResponse(503, { error: 'edge_misconfigured' });
    }

    // Duong dan VA chuoi truy van giu nguyen tung ky tu; chi phan authority doi.
    const target = new URL(url.pathname + url.search, origin);

    // Dung lai tu Request goc de giu method, bo header, cookie, header `Origin`, va — quan trong
    // voi tai len — giu than yeu cau o dang DONG thay vi nap het vao bo nho.
    const upstream = new Request(target, request);
    for (const name of STRIPPED_REQUEST_HEADERS) upstream.headers.delete(name);
    upstream.headers.set(EDGE_HEADER, env.EDGE_KEY);

    let response;
    try {
      // `redirect: 'manual'` de mot 3xx cua ung dung den thang trinh duyet tren chinh origin
      // workers.dev, thay vi edge duoi theo no vao hostname code.run va lam lo hostname do.
      response = await fetch(upstream, { redirect: 'manual' });
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: 'edge.upstream_failed',
          route,
          path: url.pathname,
          error: String(error),
        }),
      );
      return jsonResponse(502, { error: 'bad_gateway', route });
    }

    // Chuyen than o dang dong. `/events` la Server-Sent Events: doc no bang `.text()` o day se giu
    // ca cuoc hoi thoai trong bo nho va khong giao gi cho toi khi dong dong — ma mot dong khong
    // bao gio dong nghia la khong giao gi ca.
    const out = new Response(response.body, response);
    // Bi mat xac thuc edge voi Northflank. No khong duoc di nguoc ra trinh duyet.
    out.headers.delete(EDGE_HEADER);
    return out;
  },
};
