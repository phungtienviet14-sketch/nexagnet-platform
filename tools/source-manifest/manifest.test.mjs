import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, renderModule, MANIFEST_MODULE_PATH } from './generate.mjs';

/**
 * BAI KIEM CHONG TROI DAT cua bang vi tri ma nguon.
 *
 * Bang duoc SINH RA tu AST roi COMMIT vao repo. Hai trang thai do co the lech nhau — va neu
 * khong ai kiem, chung se lech: doi ten mot buoc, chen mot dong phia tren mot quyet dinh, doi
 * mot tep sang thu muc khac. Man hinh chan doan van chay, van hien mot duong dan nghe rat that,
 * va chi ve nham cho.
 *
 * Do la kieu hong nguy hiem nhat cua ca tinh nang nay: mot cong cu chan doan SAI con te hon
 * khong co cong cu, vi no tieu thoi gian cua nguoi debug o dung luc ho it thoi gian nhat.
 *
 * Nen bang phai duoc sinh lai va so lai o CI. Lech -> do -> sinh lai. Khong co duong nao khac.
 */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('bang vi tri ma nguon da commit khop voi ma nguon hien tai', () => {
  const { manifest } = buildManifest(REPO_ROOT);
  const expected = renderModule(manifest);
  const actual = readFileSync(join(REPO_ROOT, MANIFEST_MODULE_PATH), 'utf8');

  assert.equal(
    actual.replace(/\r\n/g, '\n'),
    expected.replace(/\r\n/g, '\n'),
    `Bang vi tri ma nguon da troi khoi ma nguon.\n` +
      `Chay lai:  node tools/source-manifest/generate.mjs\n` +
      `roi commit ${MANIFEST_MODULE_PATH}.`,
  );
});

test('moi duong dan trong bang deu la repo-relative, khong ro ri ha tang', () => {
  const { manifest } = buildManifest(REPO_ROOT);
  const entries = [...Object.values(manifest.names), ...Object.values(manifest.decisions)];

  assert.ok(entries.length > 0, 'bang rong — quet khong ra ranh gioi nao');

  for (const entry of entries) {
    const path = entry.filePath;
    assert.ok(!path.includes(':'), `duong dan tuyet doi hoac co lo trinh: ${path}`);
    assert.ok(!path.startsWith('/'), `duong dan tuyet doi POSIX: ${path}`);
    assert.ok(!path.includes('..'), `duong dan vuot thu muc: ${path}`);
    assert.ok(!path.includes('node_modules'), `duong dan trong node_modules: ${path}`);
    assert.ok(!path.includes('/dist/'), `duong dan tro vao ban da bien dich: ${path}`);
    assert.ok(path.startsWith('apps/'), `duong dan ngoai vung quet: ${path}`);
    if (entry.line !== undefined) {
      assert.ok(Number.isInteger(entry.line) && entry.line > 0, `so dong hong: ${entry.line}`);
    }
  }
});

test('bang giu duoc cac ranh gioi nghiep vu dang gia nhat', () => {
  const { manifest } = buildManifest(REPO_ROOT);

  // Ba ranh gioi nay la duong di cua MOT tin nhan tro thanh MOT don: nhan tin, dung mach hoi
  // thoai, chay doi agent. Mat bat ky cai nao thi cau hoi "don nay hong o dau" mat mot chang.
  for (const name of ['message.persist', 'conversation.resolve', 'agent.run']) {
    const entry = manifest.names[name];
    assert.ok(entry, `mat ranh gioi "${name}"`);
    assert.ok(entry.line, `"${name}" mat so dong`);
  }

  // Mot diem quyet dinh co N duong tu choi phai phan biet duoc N dong khac nhau (muc 19).
  const intake = ['ACCEPTED', 'DUPLICATE_MESSAGE', 'GROUP_NOT_MAPPED', 'PARTICIPANT_IGNORED'].map(
    (reason) => manifest.decisions[`message.intake|${reason}`],
  );
  assert.ok(
    intake.every((entry) => entry?.line),
    'thieu mot nhanh cua message.intake',
  );
  assert.equal(
    new Set(intake.map((entry) => entry.line)).size,
    intake.length,
    'bon nhanh cua message.intake tro ve cung mot dong — khoa tra cuu dang gop nham',
  );
});
