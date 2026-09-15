// Khoa CAU HINH CUA REPO NAY, khong khoa cai dat cua GitHub/Anthropic/OpenAI.
//
// Ranh gioi do la co y va la yeu cau §9 cua Issue #309: dung dot thoi gian chung minh lai thu vien
// cua nguoi khac. Moi bai duoi day chi tra loi mot cau: "cau hinh ma CHUNG TA commit co con dung
// khong". Khong bai nao goi mang, khong bai nao can secret.

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  PATHS,
  REPO_ROOT,
  linesWithKey,
  pilotLockExists,
  readDocPin,
  readGhAwPin,
  readPilotFrontmatter,
  readRuleset,
  usesRefs,
} from '../src/read-config.mjs';

/** Bay check bat buoc do duoc tren `/rules/branches/main` ngay 15/09/2026. */
const REQUIRED_CHECKS = [
  'verify',
  'integration',
  'workflow-integration',
  'tenant-packs',
  'e2e',
  'audit',
  'images',
];

/** Ba pham vi ma strict mode cua gh-aw tu choi bien dich neu job agent xin quyen ghi. */
const MUTATING_SCOPES = ['contents', 'issues', 'pull-requests'];

/**
 * Cac dong nam duoi mot khoa, nhan ra bang THUT LE lon hon.
 *
 * @param {import('../src/read-config.mjs').Frontmatter} frontmatter
 * @param {string} key
 * @returns {import('../src/read-config.mjs').FrontmatterLine[]}
 */
function blockUnder(frontmatter, key) {
  const start = frontmatter.lines.findIndex((line) => line.key === key);
  if (start === -1) return [];
  const parentIndent = frontmatter.lines[start].indent;
  const block = [];
  for (const line of frontmatter.lines.slice(start + 1)) {
    if (line.indent <= parentIndent) break;
    block.push(line);
  }
  return block;
}

// ---------------------------------------------------------------------------------------------
// 1. Pilot phai o che do staged.
// ---------------------------------------------------------------------------------------------
test('pilot khai safe-outputs.staged: true', () => {
  const frontmatter = readPilotFrontmatter();
  const safeOutputs = blockUnder(frontmatter, 'safe-outputs');

  assert.notEqual(safeOutputs.length, 0, 'khong tim thay khoi `safe-outputs:` trong frontmatter');

  const staged = safeOutputs.find((line) => line.key === 'staged');
  assert.notEqual(
    staged,
    undefined,
    'khoi `safe-outputs:` khong khai `staged`. Bo dong do la mot quyet dinh phai qua cong §14 cua #309, khong phai mot lan don dep',
  );
  assert.equal(
    staged?.value,
    'true',
    `\`safe-outputs.staged\` phai la \`true\` cho toi khi qua cong §14; dang la \`${staged?.value}\``,
  );
});

// ---------------------------------------------------------------------------------------------
// 2. Pilot chua duoc bien dich — day la thu CUONG CHE cong §14, khong phai mot lo hong.
// ---------------------------------------------------------------------------------------------
test('pilot chua co .lock.yml, nen GitHub Actions khong the chay no', () => {
  assert.equal(
    pilotLockExists(),
    false,
    'Da xuat hien `agent-builder.lock.yml`. GitHub Actions CHI chay `.lock.yml`, nen tep do bien pilot thanh mot workflow tu tri that. Viec do phai qua review doc lap theo §14 cua #309 truoc, va khi do hay cap nhat bai test nay cung mot luc',
  );
});

// ---------------------------------------------------------------------------------------------
// 3. Ban gh-aw duoc ghim chinh xac, khong troi theo ban preview hang tuan.
// ---------------------------------------------------------------------------------------------
test('pilot ghim gh-aw bang ca tag, SHA 40 ky tu, lan ngay re-audit', () => {
  const { tag, sha, audit } = readGhAwPin(readPilotFrontmatter());

  assert.match(
    tag ?? '',
    /^v\d+\.\d+\.\d+$/u,
    `thieu hoac sai dinh dang \`# gh-aw-pin: vX.Y.Z\`; doc duoc: ${JSON.stringify(tag)}`,
  );
  assert.match(
    sha ?? '',
    /^[0-9a-f]{40}$/u,
    `thieu hoac sai dinh dang \`# gh-aw-sha: <40 hex>\`; doc duoc: ${JSON.stringify(sha)}`,
  );
  assert.match(
    audit ?? '',
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u,
    `thieu hoac sai dinh dang \`# gh-aw-audit: YYYY-MM-DD\`. Mot ban ghim khong kem ngay do lai thi khong phan biet duoc "van la ban stable moi nhat" voi "khong ai kiem lai tu thang truoc"; doc duoc: ${JSON.stringify(audit)}`,
  );
});

// ---------------------------------------------------------------------------------------------
// 4. Job agent khong duoc cam quyen ghi.
// ---------------------------------------------------------------------------------------------
test('frontmatter cua pilot khong xin quyen ghi o ba pham vi bien doi', () => {
  const frontmatter = readPilotFrontmatter();
  const permissions = blockUnder(frontmatter, 'permissions');

  assert.notEqual(permissions.length, 0, 'pilot khong khai khoi `permissions:` tuong minh');

  for (const line of permissions) {
    if (!MUTATING_SCOPES.includes(line.key)) continue;
    assert.notEqual(
      line.value,
      'write',
      `\`${line.key}: write\` o tang workflow. gh-aw strict mode tu choi bien dich dieu nay, va §4A cua #309 cam no. Moi thao tac ghi phai di qua \`safe-outputs\``,
    );
  }

  assert.equal(
    frontmatter.raw.includes('write-all'),
    false,
    '`write-all` xuat hien trong frontmatter cua pilot',
  );
});

// ---------------------------------------------------------------------------------------------
// 5. Chi mot nhan do nguoi co quyen gan moi khoi dong duoc agent. Repo nay PUBLIC.
// ---------------------------------------------------------------------------------------------
test('pilot chi kich hoat bang nhan, va khong mo cho vai `write`', () => {
  const frontmatter = readPilotFrontmatter();
  const triggers = blockUnder(frontmatter, 'on');
  const triggerKeys = triggers.filter((line) => line.indent === 2).map((line) => line.key);

  assert.ok(
    triggerKeys.includes('label_command'),
    `pilot phai kich hoat bang \`label_command\`; cac khoa doc duoc: ${triggerKeys.join(', ')}`,
  );

  for (const forbidden of ['issue_comment', 'slash_command', 'pull_request_target']) {
    assert.equal(
      triggerKeys.includes(forbidden),
      false,
      `\`${forbidden}\` bien van ban ai cung go duoc tren mot repo public thanh mot lan chay agent`,
    );
  }

  const roles = linesWithKey(frontmatter, 'roles');
  assert.equal(roles.length, 1, 'pilot phai khai dung mot dong `roles:`');
  assert.equal(
    /\bwrite\b/u.test(roles[0].value),
    false,
    `\`roles\` khong duoc chua \`write\`: day la danh sach khop chinh xac, khong phai mot nguong dac quyen. Dang la \`${roles[0].value}\``,
  );
});

// ---------------------------------------------------------------------------------------------
// 6. Khi pilot duoc bien dich, moi action trong lock phai ghim SHA (#309 §13).
// ---------------------------------------------------------------------------------------------
test('lock cua pilot — neu ton tai — ghim moi action bang SHA 40 ky tu', (t) => {
  if (!pilotLockExists()) {
    t.skip(
      'Chua co `agent-builder.lock.yml` (bai 2 khoa dieu do). Bai nay tu kich hoat ngay khi lock duoc commit',
    );
    return;
  }

  for (const ref of usesRefs(readFileSync(PATHS.pilotLock, 'utf8'))) {
    assert.match(
      ref,
      /@[0-9a-f]{40}$/u,
      `\`uses: ${ref}\` la mot ref troi. §13 cua #309 cam ref troi trong workflow duoc chon dung`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// 7. Cong CI khong duoc noi long trong lan migration nay.
// ---------------------------------------------------------------------------------------------
test('ruleset giu du bay check bat buoc, strict, va khong ai duoc bypass', () => {
  const { requiredChecks, strict, bypassActors } = readRuleset();

  assert.deepEqual(
    [...requiredChecks].sort(),
    [...REQUIRED_CHECKS].sort(),
    'danh sach check bat buoc da doi. §13 cua #309: khong duoc lam yeu CI/ruleset hien co',
  );
  assert.equal(strict, true, '`strict_required_status_checks_policy` phai la `true`');
  assert.deepEqual(
    bypassActors,
    [],
    '`bypass_actors` phai rong. Tai lieu cua Copilot cloud agent goi y them agent lam bypass actor khi ruleset khong tuong thich — day la cho tu choi dieu do',
  );
});

// ---------------------------------------------------------------------------------------------
// 8. Kenh may doc (nhan) phai duoc bieu mau noi ro cho nguoi tao Issue.
// ---------------------------------------------------------------------------------------------
test('bieu mau Issue khai du bo nhan rui ro va nhan kich hoat', () => {
  const form = readFileSync(PATHS.issueForm, 'utf8');

  for (const label of ['risk:low', 'risk:medium', 'risk:high', 'agent:ready']) {
    assert.ok(
      form.includes(label),
      `bieu mau khong nhac \`${label}\`. Nhan la kenh may doc; than Issue chi la van xuoi`,
    );
  }

  const labels = [...form.matchAll(/^labels:\s*(.+)$/gmu)].map((match) => match[1].trim());
  assert.equal(labels.length, 1, 'bieu mau phai gan san dung mot bo `labels:`');
  assert.equal(
    labels[0].includes('agent:ready'),
    false,
    'bieu mau KHONG duoc tu gan `agent:ready`: nhan do la uy quyen chay, phai do nguoi gan sau khi doc',
  );
});

// ---------------------------------------------------------------------------------------------
// 10. Loi thoat CI-trigger khong duoc fail-open.
//
//     `github-token-for-extra-empty-commit: app` duoc gh-aw bien dich thanh DUNG mot bieu thuc:
//         GH_AW_CI_TRIGGER_TOKEN: ${{ steps.safe-outputs-app-token.outputs.token || '' }}
//     Buoc mint token do CHI ton tai khi co khoi `safe-outputs.github-app`. Thieu khoi do — hoac
//     go sai ten bien/secret — thi bieu thuc ra CHUOI RONG, commit rong quay ve GITHUB_TOKEN, va
//     KHONG co thong bao loi nao. Bai nay khoa cap doi (co token-for-extra-empty-commit) <=> (co
//     github-app day du), va TU KICH HOAT khi ai do them truong do lan dau.
// ---------------------------------------------------------------------------------------------
test('neu pilot dung loi thoat CI-trigger thi khoi github-app phai day du', () => {
  const frontmatter = readPilotFrontmatter();
  const ciTrigger = linesWithKey(frontmatter, 'github-token-for-extra-empty-commit');

  if (ciTrigger.length === 0) {
    // Chua khai loi thoat nay thi khong co gi de khoa — va cung khong co bay fail-open nao.
    return;
  }

  assert.equal(
    ciTrigger.length,
    1,
    'chi duoc khai dung mot `github-token-for-extra-empty-commit`',
  );
  assert.equal(
    ciTrigger[0].value,
    'app',
    `repo nay dong y dung DANH TINH GitHub App lam loi thoat CI-trigger, khong dung PAT ca nhan. Dang la \`${ciTrigger[0].value}\``,
  );

  const app = blockUnder(frontmatter, 'github-app');
  assert.notEqual(
    app.length,
    0,
    'khai `github-token-for-extra-empty-commit: app` ma KHONG co khoi `safe-outputs.github-app`. gh-aw se sinh ra mot token rong va lang le day commit bang GITHUB_TOKEN — dung cai rao dang muon vuot',
  );

  for (const key of ['client-id', 'private-key']) {
    const field = app.find((line) => line.key === key);
    assert.notEqual(field, undefined, `khoi \`github-app\` thieu \`${key}\``);
    assert.match(
      field?.value ?? '',
      /^\$\{\{\s*(vars|secrets)\.[A-Z0-9_]+\s*\}\}$/u,
      `\`github-app.${key}\` phai la mot bieu thuc \`vars.*\`/\`secrets.*\`, khong phai gia tri viet thang; dang la \`${field?.value}\``,
    );
    assert.equal(
      /NEXAGNET/u.test(field?.value ?? ''),
      false,
      `\`github-app.${key}\` tro vao \`NEXAGNET_*\`. Bien va secret that ten \`NEXAGENT_*\` (do bang \`gh api .../actions/variables\` va \`.../actions/secrets\` ngay 15/09/2026). Lech mot chu thi bieu thuc ra chuoi rong va khong ai bao loi`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// 11. Mot lan nang ban gh-aw khong duoc rot nua chung.
//
//     Ban ghim xuat hien o ba cho: workflow pilot (chu thich frontmatter), ADR, va tai lieu bang
//     chung (chu thich HTML). Sua mot cho roi quen hai cho kia de lai mot ban ghim ma nguoi review
//     TIN nhung khong con dung. Bai nay bat ca ba trung nhau tung ky tu.
// ---------------------------------------------------------------------------------------------
test('ban ghim gh-aw trung nhau giua pilot, ADR va tai lieu bang chung', () => {
  const pilot = readGhAwPin(readPilotFrontmatter());
  const docs = [
    ['ADR', readDocPin(PATHS.adr)],
    ['tai lieu bang chung', readDocPin(PATHS.evidence)],
  ];

  for (const [name, pin] of docs) {
    for (const field of ['tag', 'sha', 'audit']) {
      const marker = field === 'tag' ? 'gh-aw-pin' : `gh-aw-${field}`;
      assert.notEqual(
        pin[field],
        null,
        `${name} khong khai \`<!-- ${marker}: ... -->\`. Van xuoi doc duoc nhung khong do duoc`,
      );
      assert.equal(
        pin[field],
        pilot[field],
        `${name} khai \`${field}\` = \`${pin[field]}\` trong khi pilot ghim \`${pilot[field]}\`. Mot lan nang ban da rot nua chung`,
      );
    }
  }
});

// ---------------------------------------------------------------------------------------------
// 9. Sau khi xoa, giao thuc cu khong duoc song lai lang le.
//     Bai nay TU KICH HOAT khi `tools/autopilot-protocol/` bien mat.
// ---------------------------------------------------------------------------------------------
test('giao thuc AUTOPILOT_TASK_V0 khong con dau vet sau khi xoa', (t) => {
  if (existsSync(join(REPO_ROOT, 'tools', 'autopilot-protocol'))) {
    t.skip(
      'Buoc xoa (§10 cua autopilot-v2-official-first.md) chua chay — no nam SAU cong §14. Bai nay tu kich hoat khi `tools/autopilot-protocol/` bien mat',
    );
    return;
  }

  const stale = readdirSync(PATHS.workflowsDir).filter((name) =>
    readFileSync(join(PATHS.workflowsDir, name), 'utf8').includes('AUTOPILOT_TASK_V0'),
  );
  assert.deepEqual(stale, [], `workflow con nhac giao thuc da xoa: ${stale.join(', ')}`);
});
