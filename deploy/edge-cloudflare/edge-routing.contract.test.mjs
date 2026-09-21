import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeFor } from './src/index.js';

/**
 * HOP DONG: Worker Cloudflare phai dinh tuyen GIONG HET bo so khop `@api` cua Caddy.
 *
 * VI SAO DOC NGUOC TU CADDYFILE thay vi chep mot danh sach vao day: hai ban sao cua cung mot su
 * that se lech nhau, va kieu lech nay hong IM LANG. Mot route co trong Caddy ma thieu o Worker se
 * roi xuong Next.js va tra 404 — dung hinh dang su co 04/08/2026 ("giao dien co du, chi la khong
 * co duong di toi"), chi khac la lan nay no chi xay ra tren ban Cloudflare. Doc tu tep goc nghia
 * la them mot route vao Caddy ma quen Worker se lam CI do ngay.
 */
const here = dirname(fileURLToPath(import.meta.url));
const caddyfile = readFileSync(join(here, '..', 'netviet', 'edge', 'Caddyfile'), 'utf8');

function readCaddyApiMatchers() {
  const line = caddyfile
    .split('\n')
    .map((raw) => raw.trim())
    .find((raw) => raw.startsWith('@api path '));
  assert.ok(
    line,
    'Khong tim thay dong `@api path ...` trong Caddyfile — hop dong da doi hinh dang',
  );
  return line.slice('@api path '.length).trim().split(/\s+/).filter(Boolean);
}

const matchers = readCaddyApiMatchers();

test('Caddyfile van co dang ma bo test nay biet doc', () => {
  // Neu con so nay tut ve 0 hoac mot gia tri ti hon thi cac khang dinh duoi se "xanh" ma khong
  // kiem gi ca. Chan trang thai do truoc, dung de no lam ca tep test thanh vo nghia.
  assert.ok(matchers.length >= 30, `Chi doc duoc ${matchers.length} matcher tu Caddyfile`);
});

test('moi matcher cua Caddy deu duoc Worker dua sang API', () => {
  for (const matcher of matchers) {
    if (matcher.endsWith('*')) {
      const prefix = matcher.slice(0, -1);
      // `*` cua Caddy khop moi thu ke ca dau `/`, nen ca hai hinh dang duoi deu phai ve API.
      assert.equal(routeFor(prefix), 'api', `tien to ${matcher}: chinh tien to`);
      assert.equal(routeFor(`${prefix}sample/child`), 'api', `tien to ${matcher}: duong con`);
    } else {
      assert.equal(routeFor(matcher), 'api', `khop chinh xac ${matcher}`);
    }
  }
});

test('be mat web cua Next.js khong bi keo sang API', () => {
  // Day la toan bo route ma `apps/web/app` that su phuc vu, cong tai san tinh.
  for (const path of [
    '/',
    '/login',
    '/settings',
    '/zalo',
    '/icon.svg',
    '/manifest.webmanifest',
    '/netviet-logo.png',
    '/_next/static/chunks/main.js',
  ]) {
    assert.equal(routeFor(path), 'web', path);
  }
});

test('duong tran `/zalo` va `/settings` o lai web, duong con cua chung sang API', () => {
  // Day la cap phan biet de mat nhat trong ca hop dong: chi mot dau `/` ngan cach mot trang nguoi
  // dung mo hang ngay voi mot nhom endpoint API.
  assert.equal(routeFor('/zalo'), 'web');
  assert.equal(routeFor('/zalo/'), 'api');
  assert.equal(routeFor('/zalo/groups'), 'api');
  assert.equal(routeFor('/settings'), 'web');
  assert.equal(routeFor('/settings/'), 'web');
  assert.equal(routeFor('/settings/summary'), 'api');
  assert.equal(routeFor('/settings/users/42'), 'api');
});

test('`/internal/*` khong bao gio den duoc API qua Worker', () => {
  // Khang dinh PHU DINH, cung tinh than voi `caddy-route-contract.test.mjs`: duong dich vu-dich vu
  // khong duoc di qua edge. `InternalServiceGuard` xac thuc bang `x-api-key`, nen mot edge phuc vu
  // trinh duyet ma cam duoc khoa do la mot cua mo, khong phai mot lop bao ve.
  for (const path of [
    '/internal',
    '/internal/',
    '/internal/sales-handoff',
    '/INTERNAL/sales-handoff',
    '/internal/anything/deeper',
  ]) {
    assert.equal(routeFor(path), 'deny', path);
    assert.notEqual(routeFor(path), 'api', path);
  }
});

test('so khop khong phan biet HOA thuong, giong Caddy', () => {
  assert.equal(routeFor('/AUTH/login'), 'api');
  assert.equal(routeFor('/Health'), 'api');
  assert.equal(routeFor('/Login'), 'web');
});
