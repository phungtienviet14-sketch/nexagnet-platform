import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caddyfile = await readFile(new URL('./Caddyfile', import.meta.url), 'utf8');
const deployStack = await readFile(new URL('./deploy-stack.sh', import.meta.url), 'utf8');

test('operator page /zalo goes to Next.js while /zalo/* stays on the API', () => {
  const apiMatcher = caddyfile.match(/\(app_routes\)[\s\S]*?@api path ([^\r\n]+)/)?.[1] ?? '';
  const demoBlockMatcher = caddyfile.match(/\{\$DEMO_DOMAIN\}[\s\S]*?@blocked path ([^\r\n]+)/)?.[1] ?? '';

  assert.match(apiMatcher, /(?:^|\s)\/zalo\/\*(?:\s|$)/);
  assert.doesNotMatch(apiMatcher, /(?:^|\s)\/zalo\*(?:\s|$)/);
  assert.match(demoBlockMatcher, /(?:^|\s)\/zalo\*(?:\s|$)/);
  assert.match(caddyfile, /\{\$OPERATOR_DOMAIN\}\s*\{[\s\S]*?basic_auth\s*\{/);
});

test('deployment smoke checks both the operator page and Zalo status API', () => {
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo"/);
  assert.match(deployStack, /"https:\/\/\$\{OPERATOR_DOMAIN\}\/zalo\/status"/);
});
