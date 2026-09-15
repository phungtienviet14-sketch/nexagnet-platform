/**
 * PoC B — PARITY QUYEN: gh-aw suy quyen tu loai Safe Output nhu the nao?
 *
 * Do tren 299 workflow DA SINH RA cua chinh kho gh-aw tai SHA da ghim — khong phai mot fixture tu
 * nghi ra. Ve trai la cai workflow KHAI BAO trong frontmatter; ve phai la khoi `permissions:` ma
 * trinh bien dich phat ra cho job `safe_outputs`.
 *
 * KET QUA QUAN TRONG NHAT, va no tra loi thang cau hoi cua su co #188:
 *
 *   `add-comment`  ->  `issues: write` VA `pull-requests: write`  (LUON CA HAI)
 *   `create-issue` ->  `issues: write`                            (mot minh)
 *
 * gh-aw KHONG phan biet muc tieu la Issue hay PR khi cap quyen cho comment; no cap CA HAI vi luc
 * bien dich no chua biet muc tieu se la gi (`pkg/workflow/add_comment.go:129-141` khong doc
 * `config.Target`). Do la mot lua chon THUA QUYEN de tranh thieu quyen — nguoc voi huong
 * `WRITE_CALLS` cua Orchestrator V0, von suy quyen tu tung endpoint co that.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(
  readFileSync(join(here, '..', 'fixtures', 'permissions-corpus.json'), 'utf8'),
);

/** Bo quyen ma mot khai bao dan toi, khi va chi khi chi co DUY NHAT mot bo. */
const soleOutcomeFor = (declared) => {
  const outcomes = corpus.declaredToPermissions[JSON.stringify(declared)];
  assert.ok(outcomes, `khong co workflow nao khai dung ${JSON.stringify(declared)}`);
  const keys = Object.keys(outcomes);
  assert.equal(keys.length, 1, `${JSON.stringify(declared)} cho ra nhieu bo quyen: ${keys}`);
  return JSON.parse(keys[0]);
};

test('kho bang chung du lon de ket luan', () => {
  assert.equal(corpus.lockFilesScanned, 299);
  assert.equal(corpus.withSafeOutputsJob, 299, 'moi workflow deu co job safe_outputs');
});

test('add-comment => CA `issues: write` LAN `pull-requests: write`', () => {
  assert.deepEqual(soleOutcomeFor(['add-comment']), ['issues: write', 'pull-requests: write']);
});

test('thao tac chi dung toi Issue => khong keo theo quyen ghi PR', () => {
  // `create-issue` co hai ket cuc (mot so workflow con khai them discussions), nen kiem theo huong
  // khac: KHONG bo nao chua `pull-requests: write`.
  const outcomes = corpus.declaredToPermissions[JSON.stringify(['create-issue'])];
  for (const key of Object.keys(outcomes)) {
    assert.ok(
      !JSON.parse(key).includes('pull-requests: write'),
      `create-issue khong duoc keo theo pull-requests: write, nhung thay ${key}`,
    );
  }
});

test('close-issue + create-issue van chi `issues: write`', () => {
  assert.deepEqual(soleOutcomeFor(['close-issue', 'create-issue']), ['issues: write']);
});

test('MOI workflow co add-comment deu duoc cap `pull-requests: write`', () => {
  // Day la dieu khien `add-comment` khac han cac thao tac Issue: no LUON keo theo quyen ghi PR,
  // du workflow do co bao gio cham vao mot PR hay khong.
  //
  // Tru `staged` — che do chay kho cua gh-aw, xem bai kiem duoi. Loai no ra o day de bai kiem nay
  // do dung mot thu: luat suy quyen. Gop hai thu vao mot bai kiem lam ca hai kho doc.
  const withAddComment = Object.entries(corpus.declaredToPermissions).filter(([declared]) => {
    const keys = JSON.parse(declared);
    return keys.includes('add-comment') && !keys.includes('staged');
  });
  assert.ok(withAddComment.length >= 5, 'can du mau de ket luan');
  for (const [declared, outcomes] of withAddComment) {
    for (const key of Object.keys(outcomes)) {
      assert.ok(
        JSON.parse(key).includes('pull-requests: write'),
        `${declared} -> ${key} thieu pull-requests: write`,
      );
    }
  }
});

test('`staged` => KHONG mot quyen nao ca — che do chay kho cua gh-aw', () => {
  // Doi ung cua `AUTOPILOT_DRY_RUN`, nhung manh hon o mot diem dang hoc: Nexagent chan bang mot
  // bien moi truong ma ma nguon co the bo qua, con gh-aw chan bang khoi `permissions:` RONG —
  // tuc bang chinh ranh gioi GitHub cuong che, khong bang mot loi hua trong ma nguon.
  const staged = Object.entries(corpus.declaredToPermissions).filter(([declared]) =>
    JSON.parse(declared).includes('staged'),
  );
  assert.ok(staged.length > 0, 'phai co workflow dung staged de ket luan');
  for (const [declared, outcomes] of staged) {
    for (const key of Object.keys(outcomes)) {
      assert.deepEqual(JSON.parse(key), [], `${declared} o che do staged van duoc cap ${key}`);
    }
  }
});

test('create-pull-request keo theo `contents: write` — quyen Orchestrator V0 CAM tuyet doi', () => {
  // `FORBIDDEN_GRANTS` cua `src/permissions.mjs` cam `contents: write` o MOI job. Dung Safe Outputs
  // de tao PR se pha bat bien do, nen day la mot ranh gioi cua bat ky ban hybrid nao.
  assert.ok(soleOutcomeFor(['create-pull-request']).includes('contents: write'));
});
