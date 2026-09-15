/**
 * PoC C — RANH GIOI KHONG-TIN-CAY / DUOC-GHI.
 *
 * Bat bien B4 cua Orchestrator V0: ma nguon chua duyet KHONG duoc cam quyen ghi vao mat phang
 * trang thai ma chinh no dang xin duyet. Cau hoi cua §4.3 la gh-aw co giu duoc mot ranh gioi
 * TUONG DUONG khong — va cau tra loi, do tren 299 workflow da sinh ra, la CO.
 *
 * Job `agent` la noi noi dung khong tin cay di qua (prompt, noi dung Issue/PR, ket qua cong cu).
 * Tren toan bo 299 workflow, job do KHONG BAO GIO cam `issues: write`, `pull-requests: write` hay
 * `contents: write`. Quyen ghi chi nam o job `safe_outputs` rieng biet.
 *
 * Day la KET LUAN MANH NHAT nghieng ve phia gh-aw trong ca cuoc danh gia: no la dung mot bat bien
 * ma Nexagent da phai tu phat hien qua blocker B4, va gh-aw cuong che no bang chinh trinh bien dich
 * chu khong bang mot loi hua trong tai lieu.
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

/** Quyen ghi ma mot job chay noi dung khong tin cay tuyet doi khong duoc cam. */
const MUTATION_GRANTS = Object.freeze([
  'issues: write',
  'pull-requests: write',
  'contents: write',
  'discussions: write',
]);

test('job `agent` KHONG BAO GIO cam quyen ghi vao mat phang trang thai', () => {
  const granted = Object.keys(corpus.agentWriteGrants);
  const forbidden = granted.filter((grant) => MUTATION_GRANTS.includes(grant));
  assert.deepEqual(
    forbidden,
    [],
    `job agent khong duoc cam quyen ghi, nhung thay: ${forbidden.join(', ')}`,
  );
});

test('quyen ghi DUY NHAT tren job `agent` la thu khong sua duoc repo', () => {
  // `copilot-requests: write` la quyen goi suy dien LLM, `id-token: write` la OIDC. Ca hai deu
  // KHONG ghi duoc gi vao Issue/PR/ma nguon — nen chung khong pha ranh gioi B4.
  assert.deepEqual(Object.keys(corpus.agentWriteGrants).sort(), [
    'copilot-requests: write',
    'id-token: write',
  ]);
});

test('quyen ghi that su ton tai — o job khac, khong o job `agent`', () => {
  // Neu khong co bai kiem nay thi bai tren se van XANH khi khong workflow nao ghi gi ca, va ranh
  // gioi se duoc "chung minh" boi mot kho rong. Phai co ben CO quyen ghi thi moi co ranh gioi.
  const writing = Object.keys(corpus.safeOutputsPermissionSets).filter((key) =>
    JSON.parse(key).some((grant) => MUTATION_GRANTS.includes(grant)),
  );
  assert.ok(writing.length > 0, 'phai co job safe_outputs thuc su cam quyen ghi');
});

test('job `safe_outputs` co mat o moi workflow — ranh gioi khong the bi bo qua', () => {
  // 299/299 workflow deu co job safe_outputs, va no luon `needs: agent`. Do la mat trai cua cung
  // mot su gan ket: no vua giu ranh gioi, vua khien Safe Outputs KHONG chay doc lap duoc (PoC A).
  assert.equal(corpus.withSafeOutputsJob, corpus.lockFilesScanned);
});
