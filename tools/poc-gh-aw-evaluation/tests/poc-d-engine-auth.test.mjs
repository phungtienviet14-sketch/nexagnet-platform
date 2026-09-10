/**
 * PoC D — CLAUDE MAX OAUTH TRONG gh-aw: HAI DUONG, HAI KET QUA KHAC NHAU.
 *
 * Ban danh gia dau tien ket luan "gh-aw khong ho tro Claude Max OAuth" tu mot phep dem chuoi:
 * `CLAUDE_CODE_OAUTH_TOKEN` xuat hien 0 lan trong ma nguon. Phep dem do dung, nhung KET LUAN RUT
 * RA TU NO THI SAI: no do su co mat cua mot chuoi, khong do kha nang cua khung.
 *
 * Cac bai kiem duoi day doc ket qua cua mot lan BIEN DICH THAT bang trinh bien dich gh-aw tai SHA
 * da ghim (`fixtures/engine-auth-paths.json`, sinh boi `derive-fixtures.mjs` voi `GH_AW_BIN`).
 * Chung ghi lai mot su that lam dich chuyen lap luan, va mot su that giu nguyen ket luan:
 *
 *   DUONG A (behavior-defined engine) — CHAY DUOC. gh-aw giao dung `CLAUDE_CODE_OAUTH_TOKEN`.
 *   DUONG B (engine `claude` + `engine.env`) — BI TU CHOI LUC BIEN DICH, co chu dich.
 *
 * Vi vay `CLAUDE_MAX_OAUTH` khong con la mot ly do de chon KEEP_CUSTOM. Ket luan KEEP_CUSTOM van
 * dung, nhung phai dung tren nhung chan khac (PoC A/B/C), khong dung tren chan nay.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const probe = JSON.parse(
  readFileSync(join(here, '..', 'fixtures', 'engine-auth-paths.json'), 'utf8'),
);

const behavior = probe.behaviorDefinedEngine;

test('behavior-defined engine gan `CLAUDE_CODE_OAUTH_TOKEN` BIEN DICH DUOC', () => {
  assert.equal(behavior.compiled, true, 'trinh bien dich phai sinh ra duoc tep .lock.yml');
});

test('tep sinh ra GIAO token OAuth cho buoc chay tac nhan', () => {
  // Day la phep do quyet dinh: khong phai "co nhac den ten bi mat" ma la "co mot rang buoc
  // `CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` trong env cua job `agent`".
  assert.ok(
    behavior.oauthSecretSightings.includes('agent:env-binding'),
    `job agent phai nhan token; thay: ${behavior.oauthSecretSightings.join(', ')}`,
  );
});

test('khong con dau vet cua `ANTHROPIC_API_KEY` — duong nay khong di qua Anthropic billing', () => {
  // Neu con du mot lan, nghia la trinh bien dich van gai duong xac thuc cu vao dau do, va ket luan
  // "khong dung API key" se khong con dung.
  assert.equal(behavior.anthropicApiKeyOccurrences, 0);
});

test('token cung duoc dua vao danh sach che bi mat cua tuong lua', () => {
  // gh-aw khong chi tiem bi mat roi thoi: no dang ky ten bi mat de lop tuong lua/redaction biet ma
  // che. Thieu buoc nay thi "giao duoc token" van chua phai mot duong dung duoc.
  assert.ok(behavior.oauthSecretSightings.includes('agent:firewall-redaction-list'));
  assert.ok(behavior.oauthSecretSightings.includes('agent:firewall-redaction-copy'));
});

test('bi mat moi VAN kich hoat cong soat xet an ninh cua trinh bien dich', () => {
  // "Bien dich duoc" khong dong nghia "im lang cho qua". gh-aw bao la co bi mat han che MOI va doi
  // nguoi duyet. Ghi lai vi day la mot diem gh-aw manh, khong phai mot tro ngai.
  assert.equal(behavior.warnsNewRestrictedSecret, true);
});

test('engine `claude` dung san TU CHOI nhan bi mat qua `engine.env`', () => {
  // Duong thu hai — giu engine dung san, tiem bi mat tu ngoai — bi chan ngay luc bien dich. Do la
  // ly do mot phep do chi thu duong nay se ket luan nham la "khung khong ho tro OAuth".
  assert.equal(probe.builtinEngineEnvOverride.compiled, false);
  assert.equal(probe.builtinEngineEnvOverride.rejectsSecretInEngineEnv, true);
});

test('doi engine KHONG lam Safe Outputs yeu di — va cung KHONG go duoc su gan ket voi job agent', () => {
  // Hai mat cua cung mot phep do, va la ly do KEEP_CUSTOM van dung sau khi chan OAuth bi go:
  //   1. ranh gioi B4 van con: job `agent` khong cam quyen ghi vao mat phang trang thai;
  //   2. `safe_outputs` VAN `needs: agent` — muon dung Safe Outputs thi phai chay ca agent job.
  assert.deepEqual(behavior.jobPermissions.agent, ['read-all']);
  assert.deepEqual(behavior.jobPermissions.safe_outputs, ['issues: write', 'pull-requests: write']);
  assert.ok(
    behavior.safeOutputsNeeds.includes('agent'),
    'safe_outputs van phu thuoc agent — Safe Outputs khong tach ra duoc',
  );
});

test('bo cong cu Safe Outputs giu nguyen qua duong engine tu dinh nghia', () => {
  // Neu doi engine ma mat `add_comment`/`add_labels` thi phep so sanh o tren se vo nghia.
  assert.ok(behavior.safeOutputTools.includes('add_comment'));
  assert.ok(behavior.safeOutputTools.includes('add_labels'));
});
