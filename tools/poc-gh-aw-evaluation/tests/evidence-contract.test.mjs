/**
 * HOP DONG BANG CHUNG — bao cao KHONG duoc lang le mat mot permalink.
 *
 * §3 cua hop dong task #194: moi khang dinh quan trong ve gh-aw phai co permalink ghim SHA. Mot cau
 * chu trong tai lieu khong the cuong che dieu do; mot bai kiem thi co.
 *
 * Cong viec chia lam hai nua, va day la nua thu hai:
 *
 *   `src/evidence-index.mjs`  — doi soat `anchor` con dung `line` trong clone tai SHA da ghim,
 *                               roi dung permalink. Do o phia UPSTREAM.
 *   tep nay                   — doi soat bao cao THUC SU chua tung permalink do. Do o phia BAO CAO.
 *
 * Thieu nua nay thi chi muc van xanh trong khi bao cao da bo het link — dung loai truot ma §18 cua
 * hop dong bat phai tu hoi truoc khi BUILD_READY ("Co claim nao ve gh-aw khong co permalink khong?").
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const index = JSON.parse(
  readFileSync(join(packageRoot, 'fixtures', 'evidence-index.json'), 'utf8'),
);
const upstream = JSON.parse(readFileSync(join(packageRoot, 'upstream.json'), 'utf8'));
const report = readFileSync(
  join(packageRoot, '..', '..', 'docs', 'phat-trien', 'van-hanh', 'gh-aw-evaluation-v0.md'),
  'utf8',
);

test('moi khang dinh dan den quyet dinh deu co mat trong bao cao, duoi dang permalink', () => {
  const missing = index.claims.filter((claim) => !report.includes(claim.permalink));
  assert.deepEqual(
    missing.map((claim) => claim.id),
    [],
    `bao cao thieu permalink cho: ${missing.map((claim) => claim.id).join(', ')}`,
  );
});

test('sau khoi bang chung deu duoc phu — khong mien tru mien nao', () => {
  // Reviewer doc lap liet ke dung sau mien nay. Bai kiem giu chung o day de mot lan don dep tai lieu
  // khong the lam bien mat ca mot mien bang chung ma van xanh.
  assert.deepEqual([...new Set(index.claims.map((claim) => claim.area))].sort(), [
    'agent-read-only',
    'idempotency',
    'oauth',
    'permission-derivation',
    'privileged-checkout',
    'safe-outputs-coupling',
    'validation-fail-open',
  ]);
});

test('moi permalink ghim DUNG SHA da audit — khong tep nao tro vao `main` troi', () => {
  for (const claim of index.claims) {
    assert.ok(
      claim.permalink.startsWith(`https://github.com/github/gh-aw/blob/${upstream.auditedSha}/`),
      `${claim.id} khong ghim SHA da audit: ${claim.permalink}`,
    );
  }
  assert.equal(index.auditedSha, upstream.auditedSha);
});

test('bao cao khong con link `blob/main` nao cua gh-aw', () => {
  // Mot link troi giua mot rung link ghim SHA thi rat kho thay bang mat — va no chinh la thu §3 cam.
  assert.equal(report.includes('github.com/github/gh-aw/blob/main'), false);
});
