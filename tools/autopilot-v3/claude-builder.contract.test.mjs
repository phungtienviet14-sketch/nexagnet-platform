// KHOA CAU HINH cua `.github/workflows/claude-builder.yml` — chi nhung bat bien ma CHINH repo nay
// quyet dinh (#361: "tests for repository-owned invariants only"). Khong kiem hanh vi cua GitHub hay
// Anthropic; kiem rang ta KHONG noi long cai ma ranh gioi an ninh dua vao.
//
// Doc bang van ban, khong dung thu vien YAML — cung ly do voi `deploy/netviet/*.contract.test.mjs`:
// khong phu thuoc goi ngoai, de cai chan khong im lang bien mat sau mot lan doi dependency. Doi lai,
// bo tach khoi ben duoi chi hieu thut le 2 dau cach cua CHINH tep nay; tep doi dang thi test do, dung
// lam bo tach thong minh hon.
//
// Duong dan doi duoc bang bien moi truong de chay dot bien tren BAN SAO (khong dong vao working tree —
// pre-push kiem working tree, khong kiem commit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoFile = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const WORKFLOW =
  process.env.AUTOPILOT_V3_WORKFLOW ?? repoFile('.github/workflows/claude-builder.yml');
const TEMPLATES = process.env.AUTOPILOT_V3_TEMPLATES ?? repoFile('.github/ISSUE_TEMPLATE');
const RUNBOOK = repoFile('docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md');

/** Ban ghim da audit (22/09/2026). Nang ban = sua o day + tai lieu van hanh, co y va qua review. */
const AUDITED_PINS = {
  'anthropics/claude-code-action': ['cfc3eb22bfed5c26ef66e3223c982af27e4524de', 'v1.0.231'],
  'actions/create-github-app-token': ['bcd2ba49218906704ab6c1aa796996da409d3eb1', 'v3.2.0'],
  'actions/checkout': ['3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
};

const ALLOWED_SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'NEXAGENT_AUTOPILOT_PRIVATE_KEY'];

// --- doc + tach khoi -------------------------------------------------------------------------

const lines = readFileSync(WORKFLOW, 'utf8').replaceAll('\r', '').split('\n');
/** Bo dong chu thich tron dong. Chu thich cuoi dong (`uses: x@sha # v1`) duoc giu. */
const code = lines.filter((l) => !/^\s*#/u.test(l));
const text = code.join('\n');
const indentOf = (l) => l.length - l.trimStart().length;

/** Cac dong con cua dong `start` — dung o dong dau tien co thut le <= dong `start`. */
function childrenOf(arr, start) {
  const out = [];
  for (let i = start + 1; i < arr.length; i += 1) {
    const l = arr[i];
    if (l.trim() !== '' && indentOf(l) <= indentOf(arr[start])) break;
    out.push(l);
  }
  return out;
}

function topLevel(key) {
  const i = code.findIndex((l) => new RegExp(`^${key}:`, 'u').test(l));
  assert.ok(i >= 0, `thieu khoa goc \`${key}:\``);
  return { head: code[i], body: childrenOf(code, i) };
}

function job(name) {
  const i = code.findIndex((l) => new RegExp(`^ {2}${name}:\\s*$`, 'u').test(l));
  assert.ok(i >= 0, `thieu job \`${name}\``);
  return childrenOf(code, i);
}

function stepsOf(jobLines) {
  const steps = [];
  for (const l of jobLines) {
    if (/^ {6}- /u.test(l)) steps.push([l]);
    else if (steps.length > 0) steps.at(-1).push(l);
  }
  return steps;
}

/** Noi dung mot khoi `key: |` hoac `key: >-` trong mot tap dong. */
function blockScalar(arr, key) {
  const i = arr.findIndex((l) => new RegExp(`^\\s*${key}: [|>]-?\\s*$`, 'u').test(l));
  assert.ok(i >= 0, `thieu khoi \`${key}:\``);
  return childrenOf(arr, i)
    .map((l) => l.trim())
    .join('\n');
}

const valueOf = (arr, key) => {
  const hit = arr.map((l) => new RegExp(`^\\s*${key}:\\s*(.*)$`, 'u').exec(l)).find(Boolean);
  return hit ? hit[1].trim() : undefined;
};

const gate = job('gate');
const build = job('build');
const buildSteps = stepsOf(build);
const claudeIdx = buildSteps.findIndex((s) =>
  s.some((l) => l.includes('anthropics/claude-code-action@')),
);
const claudeStep = buildSteps[claudeIdx] ?? [];
const appTokenStep =
  buildSteps.find((s) => s.some((l) => l.includes('actions/create-github-app-token@'))) ?? [];
const gateIf = blockScalar(gate, 'if');
const LABEL = /github\.event\.label\.name == '([^']+)'/u.exec(gateIf)?.[1];

// --- bat bien --------------------------------------------------------------------------------

test('kenh kich hoat DUY NHAT la issues.labeled — khong comment, khong PR, khong dispatch', () => {
  const on = topLevel('on');
  const keys = on.body.filter((l) => l.trim() !== '' && indentOf(l) === 2).map((l) => l.trim());
  assert.deepEqual(keys, ['issues:']);
  assert.match(on.body.join('\n'), /types: \[labeled\]/u);
  assert.doesNotMatch(
    text,
    /\b(pull_request_target|pull_request|issue_comment|workflow_run|workflow_dispatch|repository_dispatch|schedule|push)\s*:/u,
  );
});

test('quyen mac dinh rong; gate chi doc; build khong quyen; KHONG id-token o bat ky dau', () => {
  assert.ok(code.includes('permissions: {}'), 'goc phai khai `permissions: {}`');
  assert.ok(build.includes('    permissions: {}'), 'job build phai khai `permissions: {}`');
  const gatePerms = childrenOf(
    gate,
    gate.findIndex((l) => /^ {4}permissions:\s*$/u.test(l)),
  );
  assert.ok(gatePerms.length > 0, 'job gate phai khai quyen tuong minh');
  for (const l of gatePerms) assert.doesNotMatch(l, /write/u, `gate xin quyen ghi: ${l.trim()}`);
  assert.doesNotMatch(text, /id-token/u, 'job chua agent khong duoc dut token OIDC (GCP WIF)');
  assert.doesNotMatch(text, /write-all|read-all/u);
});

test('cong lop 1: nhan dung, nguoi gan la User VA la chu repo theo ID, Issue cua chu repo', () => {
  assert.ok(LABEL, 'if: cua gate phai so ten nhan');
  for (const clause of [
    "github.event.sender.type == 'User'",
    "format('{0}', github.event.sender.id) == github.repository_owner_id",
    "format('{0}', github.event.issue.user.id) == github.repository_owner_id",
    'github.triggering_actor == github.repository_owner',
    "github.event.issue.state == 'open'",
  ]) {
    assert.ok(gateIf.includes(clause), `if: cua gate thieu dieu kien: ${clause}`);
  }
  assert.doesNotMatch(
    gateIf,
    /\|\||!=/u,
    'if: cua gate chi duoc noi bang && (mot || la mot cua hau)',
  );
});

test('cong lop 2 chay trong job RIENG khong secret; build chi chay khi cong noi `true`', () => {
  assert.match(gate.join('\n'), /run: node tools\/autopilot-v3\/gate\.mjs/u);
  assert.doesNotMatch(gate.join('\n'), /secrets\./u, 'job gate khong duoc cham secret');
  assert.equal(valueOf(build, 'needs'), 'gate');
  assert.equal(
    valueOf(
      build.filter((l) => indentOf(l) === 4),
      'if',
    ),
    "needs.gate.outputs.authorized == 'true'",
  );
});

test('secret chi xuat hien trong job build, va chi hai secret da biet (dung chinh ta NEXAGENT)', () => {
  const used = [...text.matchAll(/secrets\.([A-Za-z0-9_]+)/gu)].map((m) => m[1]);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(ALLOWED_SECRETS.includes(name), `secret la: ${name}`);
  const inBuild = [...build.join('\n').matchAll(/secrets\.([A-Za-z0-9_]+)/gu)].length;
  assert.equal(inBuild, used.length, 'co secret nam ngoai job build');
  assert.doesNotMatch(text, /NEXAGNET/u, 'sai chinh ta: App/secret ten la NEXAGENT_*');
});

test('moi `uses:` ghim SHA 40 hex, dung ban da audit, tai lieu van hanh ghi cung ban ghim', () => {
  const uses = code
    .filter((l) => /^\s*(- )?uses:/u.test(l))
    .map((l) => l.replace(/^\s*(- )?uses:\s*/u, ''));
  assert.ok(uses.length >= 4);
  const runbook = readFileSync(RUNBOOK, 'utf8');
  for (const u of uses) {
    const m = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40}) # (v[\w.]+)$/u.exec(u);
    assert.ok(m, `uses khong ghim SHA 40 hex kem chu thich phien ban: ${u}`);
    const pin = AUDITED_PINS[m[1]];
    assert.ok(pin, `action chua duoc audit: ${m[1]}`);
    assert.deepEqual([m[2], m[3]], pin, `${m[1]} lech ban da audit`);
    assert.ok(runbook.includes(pin[0]), `tai lieu van hanh khong ghi SHA ${pin[0]} cua ${m[1]}`);
  }
});

test('token App xin DUNG contents/issues/pull-requests: write — khong workflows, khong gi khac', () => {
  const perms = appTokenStep
    .map((l) => /^\s*permission-([a-z-]+):\s*(\S+)/u.exec(l))
    .filter(Boolean)
    .map((m) => `${m[1]}=${m[2]}`)
    .sort();
  assert.deepEqual(perms, ['contents=write', 'issues=write', 'pull-requests=write']);
  assert.equal(valueOf(appTokenStep, 'client-id'), '${{ vars.NEXAGENT_AUTOPILOT_CLIENT_ID }}');
  assert.equal(
    valueOf(appTokenStep, 'private-key'),
    '${{ secrets.NEXAGENT_AUTOPILOT_PRIVATE_KEY }}',
  );
});

test('action Claude: ghi bang token App, chi doc comment cua chu repo, khong mo cua non-write/bot', () => {
  assert.ok(claudeStep.length > 0, 'thieu buoc anthropics/claude-code-action');
  assert.equal(valueOf(claudeStep, 'github_token'), '${{ steps.app-token.outputs.token }}');
  assert.equal(
    valueOf(claudeStep, 'claude_code_oauth_token'),
    '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
  );
  assert.equal(valueOf(claudeStep, 'include_comments_by_actor'), '${{ github.repository_owner }}');
  assert.equal(valueOf(claudeStep, 'use_commit_signing'), 'true');
  for (const risky of [
    'allowed_non_write_users',
    'allowed_bots',
    'show_full_output',
    'display_report',
    'additional_permissions',
    'anthropic_api_key',
    'path_to_claude_code_executable',
  ]) {
    assert.equal(valueOf(claudeStep, risky), undefined, `khong duoc khai \`${risky}\``);
  }
  assert.match(blockScalar(claudeStep, 'claude_args'), /--max-turns \d+/u);
});

test('phien Claude: chan doc ngoai workspace, cam Bash/Web va sua mat phang dieu khien', () => {
  const settings = JSON.parse(blockScalar(claudeStep, 'settings'));
  assert.equal(settings.permissions?.blockReadsOutsideWorkingDirectories, true);
  const deny = settings.permissions?.deny ?? [];
  for (const rule of [
    'Bash',
    'WebFetch',
    'WebSearch',
    'Read(.git/**)',
    'Edit(.github/**)',
    'Edit(deploy/**)',
    'Edit(tenants/**)',
    // mat phang dieu khien cua CHINH agent — mot lan chay khong duoc noi long lan chay sau
    'Edit(.claude/**)',
    'Edit(.mcp.json)',
    'Edit(tools/autopilot-v3/**)',
  ]) {
    assert.ok(deny.includes(rule), `settings.permissions.deny thieu ${rule}`);
  }
  // Tai lieu permissions cua Claude Code: luat duong dan chi xet `Edit(path)`/`Read(path)`; mot luat
  // `Write(path)`/`MultiEdit(path)`/`NotebookEdit(path)`/`Glob(path)` duoc nhan nhung KHONG BAO GIO
  // duoc xet. Co mat no la mot cam giac an toan gia — va la dau hieu ai do tuong no dang chan.
  for (const rule of deny) {
    assert.doesNotMatch(
      rule,
      /^(Write|MultiEdit|NotebookEdit|Glob)\(/u,
      `luat ${rule} khong bao gio duoc xet — dung Edit(...) hoac Read(...)`,
    );
  }
  assert.equal(
    settings.permissions?.defaultMode,
    undefined,
    'khong dat defaultMode cho phien agent',
  );
  assert.equal(settings.permissions?.allow, undefined, 'khong noi quyen bang allow');
});

test('khong buoc nao SAU agent chay ma tu workspace (workspace luc do la cay agent vua sua)', () => {
  assert.ok(claudeIdx >= 0);
  const after = buildSteps.slice(claudeIdx + 1);
  assert.ok(after.length > 0, 'phai co buoc mo PR sau agent');
  for (const step of after) {
    const body = step.join('\n');
    assert.doesNotMatch(body, /^\s*(- )?uses:/mu, 'sau agent khong goi action nao');
    assert.doesNotMatch(
      body,
      /(^|[\s;&|(])(node|npm|npx|pnpm|yarn|bun|python3?|make|bash|sh|source)\s/mu,
      'sau agent khong chay trinh thong dich/goi lenh tu workspace',
    );
    assert.doesNotMatch(body, /(^|[\s"'])\.{1,2}\//mu, 'sau agent khong chay duong dan tuong doi');
  }
});

test('nhan kich hoat khai nhat quan: if: cua gate = ACTIVATION_LABEL = label_trigger', () => {
  const declared = code
    .map((l) => /^\s*(ACTIVATION_LABEL|label_trigger):\s*(\S+)\s*$/u.exec(l))
    .filter(Boolean)
    .map((m) => m[2]);
  assert.ok(declared.length >= 3, 'thieu mot trong ba cho khai nhan');
  for (const value of declared) assert.equal(value, LABEL);
  assert.notEqual(
    LABEL,
    'agent:ready',
    'agent:ready thuoc pilot V2 va dang duoc dung cho Issue Transport',
  );
});

test('khong bieu mau Issue nao TU GAN nhan kich hoat (nguoi la tao Issue -> sender la nguoi la)', () => {
  for (const name of readdirSync(TEMPLATES).filter((n) => /\.ya?ml$/u.test(n))) {
    const tpl = readFileSync(join(TEMPLATES, name), 'utf8').replaceAll('\r', '').split('\n');
    const i = tpl.findIndex((l) => /^labels:/u.test(l));
    if (i < 0) continue;
    const listed = [tpl[i], ...childrenOf(tpl, i)].join(' ');
    assert.ok(!listed.includes(LABEL), `${name} tu gan ${LABEL}`);
  }
});

test('runner GitHub-hosted dung mot lan, co timeout; concurrency theo Issue va khong huy lan dang chay', () => {
  const runsOn = code.filter((l) => /^\s*runs-on:/u.test(l)).map((l) => l.split(':')[1].trim());
  assert.deepEqual(runsOn, ['ubuntu-24.04', 'ubuntu-24.04']);
  for (const jobLines of [gate, build]) {
    const minutes = Number(
      valueOf(
        jobLines.filter((l) => indentOf(l) === 4),
        'timeout-minutes',
      ),
    );
    assert.ok(minutes > 0 && minutes <= 30, `timeout-minutes khong hop le: ${minutes}`);
  }
  assert.ok(
    build.join('\n').includes('group: claude-builder-issue-${{ github.event.issue.number }}'),
  );
  assert.equal(valueOf(build, 'cancel-in-progress'), 'false');
});
