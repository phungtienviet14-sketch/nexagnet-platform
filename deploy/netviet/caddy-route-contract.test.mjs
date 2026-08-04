import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caddyfile = await readFile(new URL('./Caddyfile', import.meta.url), 'utf8');
const deployStack = await readFile(new URL('./deploy-stack.sh', import.meta.url), 'utf8');
const compose = await readFile(new URL('./compose.yaml', import.meta.url), 'utf8');

test('operator page /zalo goes to Next.js while /zalo/* stays on the API', () => {
  const apiMatcher = caddyfile.match(/\(app_routes\)[\s\S]*?@api path ([^\r\n]+)/)?.[1] ?? '';
  const demoBlockMatcher = caddyfile.match(/\{\$DEMO_DOMAIN\}[\s\S]*?@blocked path ([^\r\n]+)/)?.[1] ?? '';

  assert.match(apiMatcher, /(?:^|\s)\/zalo\/\*(?:\s|$)/);
  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/zalo\*(?:\s|$)/);
  assert.match(demoBlockMatcher, /(?:^|\s)\/zalo\*(?:\s|$)/);
});

// Quyet dinh van hanh 04/08/2026: VM la moi truong dev/demo, TAT HET xac thuc de he thong luon
// vao duoc. Test nay khoa quyet dinh do: khong con Basic Auth, va API chay AUTH_MODE=none.
// Neu sau nay bat lai bao ve (du lieu khach that), sua ca test nay cung luc voi Caddyfile.
test('dev/demo VM serves both hostnames without any authentication', () => {
  // Bo dong comment truoc khi kiem: chinh comment cua khoi nay co nhac `basic_auth` de huong dan
  // bat lai — chi directive THAT (dong khong bat dau bang #) moi tinh la co xac thuc.
  const directives = caddyfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  assert.doesNotMatch(directives, /basic_auth/);
  assert.doesNotMatch(directives, /PASSWORD_HASH/);
  assert.match(compose, /AUTH_MODE:\s*\$\{AUTH_MODE:-none\}/);
});

test('settings UI stays on Next.js while settings, participants and AdminJS APIs reach NestJS', () => {
  const apiMatcher = caddyfile.match(/\(app_routes\)[\s\S]*?@api path ([^\r\n]+)/)?.[1] ?? '';
  const demoBlockMatcher = caddyfile.match(/\{\$DEMO_DOMAIN\}[\s\S]*?@blocked path ([^\r\n]+)/)?.[1] ?? '';

  assert.match(apiMatcher, /(?:^|\s)\/settings\/\*(?:\s|$)/);
  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/settings\*(?:\s|$)/);
  assert.match(apiMatcher, /(?:^|\s)\/groups\/\*(?:\s|$)/);
  assert.match(apiMatcher, /(?:^|\s)\/admin\*(?:\s|$)/);
  assert.match(demoBlockMatcher, /(?:^|\s)\/settings\*(?:\s|$)/);
  assert.match(demoBlockMatcher, /(?:^|\s)\/groups\*(?:\s|$)/);
  assert.match(demoBlockMatcher, /(?:^|\s)\/admin\*(?:\s|$)/);
});

test('AUTO_SEND has a single mutation surface behind the blocked settings prefix', () => {
  const demoBlockMatcher = caddyfile.match(/\{\$DEMO_DOMAIN\}[\s\S]*?@blocked path ([^\r\n]+)/)?.[1] ?? '';

  // Cong tac AUTO_SEND nay chi con o PUT /settings/automation/auto-send (co audit) — nam trong
  // tien to /settings* da bi chan tren domain demo. Namespace /demo khong duoc mo lai loi ghi nao.
  assert.match(demoBlockMatcher, /(?:^|\s)\/settings\*(?:\s|$)/);
  assert.doesNotMatch(caddyfile, /\/demo\/auto-send/);
});

test('deployment smoke checks both the operator page and Zalo status API', () => {
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo"/);
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo\/status"/);
});
