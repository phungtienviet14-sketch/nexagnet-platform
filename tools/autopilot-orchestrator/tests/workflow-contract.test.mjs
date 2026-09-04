/**
 * HOP DONG GIUA MA NGUON VA WORKFLOW — bon blocker cua PR #167, moi cai mot cai chan.
 *
 * Bon dieu duoi day khong the kiem bang bo test binh thuong, vi chung khong nam trong ma nguon —
 * chung nam trong YAML, va hau qua cua chung chi lo ra o LAN CHAY THAT SAU KHI MERGE
 * (`issue_comment` va `check_suite` chi chay ban workflow tren nhanh mac dinh). Tep nay keo chung
 * ve thanh thu do duoc trong PR.
 *
 *   B1 — `permissions:` phai du cho MOI loi goi API ma orchestrator thuc su thuc hien.
 *   B2 — `on:` phai lang du CA BA trigger hop dong #165 khai.
 *   B3 — `AUTOPILOT_REVIEWER_APP_SLUG` khong duoc co gia tri du phong ghi cung.
 *   B4 — job nao chay MA NGUON CUA PR thi khong duoc cam mot quyen ghi nao.
 *
 * B4 la cai duy nhat trong bon cai KHONG THE do bang mot lan chay: mot lan chay chi chung minh
 * duoc bo quyen NO nhan, chu khong chung minh duoc bo quyen mot job KHAC se nhan. Nen hop dong o
 * day la hop dong TINH — no doc so do job va so do quyen truc tiep tu YAML.
 *
 * KIEM BANG VAN BAN, KHONG BANG THU VIEN YAML — dung theo le cua cac `*.contract.test.mjs` trong
 * `deploy/netviet/`: `yaml` chi co trong kho pnpm nhu mot phu thuoc bac hai, no co the bien mat sau
 * mot lan doi dependency va luc do cai chan nay se im lang bien mat cung.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { EVENT_NAMES } from '../src/events.mjs';
import { MUTATION_ENV, MUTATION_ROLES } from '../src/mutations.mjs';
import { FORBIDDEN_GRANTS, MUTATION_GRANTS, READ_GRANTS } from '../src/permissions.mjs';

/**
 * Bo ky tu CR: tren Windows tep duoc checkout dang CRLF, va moi phep khang dinh duoi day cat theo
 * dong. Mot CR treo o cuoi dong lam bai kiem bao thieu mot quyen dang co that.
 */
const workflow = readFileSync(
  fileURLToPath(new URL('../../../.github/workflows/autopilot-orchestrator.yml', import.meta.url)),
  'utf8',
).replaceAll(String.fromCharCode(13), '');

const lines = workflow.split('\n');

/** Chi cac dong CO NOI DUNG. Cat comment ra mot lan o day de moi phep cat khoi ben duoi don gian. */
const content = lines.filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));

/** @param {string} line */
const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Cat mot khoi bat dau tu dong `start` trong `source`: moi dong THUT SAU HON dong do, dung lai o
 * dong dau tien thut bang hoac it hon.
 * @param {string[]} source
 * @param {number} start
 */
function bodyAfter(source, start) {
  const base = indentOf(source[start]);
  const rest = source.slice(start + 1);
  const end = rest.findIndex((line) => indentOf(line) <= base);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Cat mot khoi YAML cap cao nhat (`on:`, `permissions:`, ...).
 * @param {string} key
 */
function block(key) {
  const start = content.findIndex((line) => line === `${key}:`);
  assert.notEqual(start, -1, `khong tim thay khoi \`${key}:\``);
  return bodyAfter(content, start).map((line) => line.trim());
}

const JOBS_INDEX = content.findIndex((line) => line === 'jobs:');
const JOB_HEADER = /^ {2}([a-z0-9][a-z0-9-]*):$/;

/** Ten moi job, theo thu tu khai bao. */
const JOB_NAMES = /** @type {string[]} */ (
  content
    .slice(JOBS_INDEX + 1)
    .map((line) => JOB_HEADER.exec(line)?.[1])
    .filter((name) => typeof name === 'string')
);

/** @param {string} name */
function jobBody(name) {
  const start = content.findIndex((line, i) => i > JOBS_INDEX && line === `  ${name}:`);
  assert.notEqual(start, -1, `khong tim thay job \`${name}\``);
  return bodyAfter(content, start);
}

/**
 * Khoi `permissions:` CUA RIENG mot job, hoac `null` neu job khong khai (tuc thua khoi cap
 * workflow).
 * @param {string} name
 * @returns {string[] | null}
 */
function jobPermissions(name) {
  const body = jobBody(name);
  const start = body.findIndex((line) => line.trim() === 'permissions:');
  if (start === -1) return null;
  return bodyAfter(body, start).map((line) => line.trim());
}

/**
 * Bieu thuc `if:` cua mot job, gop ve mot dong (no duoc viet nhieu dong bang `>-`).
 * @param {string} name
 */
function jobIf(name) {
  const body = jobBody(name);
  const start = body.findIndex((line) => line.trim().startsWith('if:'));
  if (start === -1) return '';
  return [body[start], ...bodyAfter(body, start)].map((line) => line.trim()).join(' ');
}

/**
 * @param {string} name
 * @param {string} key
 */
function jobEnvLine(name, key) {
  return (
    jobBody(name)
      .map((line) => line.trim())
      .find((line) => line.startsWith(`${key}:`)) ?? null
  );
}

/** Mot quyen `x: read` duoc THOA khi khai `x: read` HOAC `x: write` — ghi bao gom doc. */
const satisfies = (/** @type {string[]} */ declared, /** @type {string} */ grant) =>
  declared.includes(grant) || declared.includes(grant.replace(/: read$/, ': write'));

const writeGrantsIn = (/** @type {string[]} */ declared) =>
  declared.filter((line) => line.endsWith(': write'));

/** Job chay MA NGUON CUA PR = job co the kich hoat boi `pull_request`. */
const runsPrCode = (/** @type {string} */ name) =>
  jobIf(name).includes("github.event_name == 'pull_request'");

const MUTATING_JOB = 'orchestrate';

test('B1: job chay that khai DU quyen cho moi loi goi API orchestrator thuc su thuc hien', () => {
  const declared = jobPermissions(MUTATING_JOB);
  assert.ok(declared, `job \`${MUTATING_JOB}\` phai khai khoi permissions: cua rieng no`);
  // `READ_GRANTS` dan xuat tu chinh bang probe cua `preflight.mjs`, nen bai nay khong the lech
  // khoi thuc te: them mot loi goi API la them mot probe, va them mot probe la bat buoc them quyen.
  for (const grant of READ_GRANTS) {
    assert.ok(
      satisfies(declared, grant),
      `thieu \`${grant}\` trong permissions: cua job \`${MUTATING_JOB}\` — mot khoi permissions ` +
        `tuong minh dat MOI quyen khong duoc ke thanh \`none\`, nen loi goi tuong ung se 403 o lan ` +
        `chay that sau khi merge`,
    );
  }
  // Hai dong nay la dung blocker B1. Ghi ten ro rang de mot lan xoa nham khong doc thanh loi chung.
  assert.ok(declared.includes('checks: read'), 'B1: thieu `checks: read` cho /check-runs');
  assert.ok(declared.includes('actions: read'), 'B1: thieu `actions: read` cho /actions/runs');
  // Va hai quyen GHI — hai viec duy nhat orchestrator lam: dang comment, doi nhan.
  for (const grant of MUTATION_GRANTS) {
    assert.ok(declared.includes(grant), `job \`${MUTATING_JOB}\` thieu \`${grant}\``);
  }
});

test('B1: job read-only van khai DU quyen doc — preflight phai do duoc ca nam duong', () => {
  for (const name of JOB_NAMES.filter(runsPrCode)) {
    const declared = jobPermissions(name);
    assert.ok(declared, `job \`${name}\` phai khai khoi permissions: cua rieng no`);
    for (const grant of READ_GRANTS) {
      assert.ok(satisfies(declared, grant), `job \`${name}\` thieu \`${grant}\``);
    }
  }
});

test('READ-ONLY duoc GITHUB cuong che: khong mot quyen ghi ma nguon nao, o BAT KY job nao', () => {
  const blocks = [block('permissions'), ...JOB_NAMES.map(jobPermissions)];
  for (const declared of blocks) {
    if (declared === null) continue;
    for (const grant of FORBIDDEN_GRANTS) {
      assert.ok(!declared.includes(grant), `orchestrator khong duoc co \`${grant}\``);
    }
  }
});

// ------------------------------------------------------------------------------------------------
// B4 — RANH GIOI UY QUYEN. Sau phep khang dinh, va chung phai dung DONG THOI: bo mot cai la mo lai
// dung lo hong. `pull_request` chay ma nguon CUA PR — ke ca chinh tep YAML nay — nen bat cu quyen
// ghi nao chay tren trigger do la quyen ghi trao cho ma nguon chua duyet.
// ------------------------------------------------------------------------------------------------

test('B4: san mac dinh cua workflow KHONG co quyen ghi — job phai xin tuong minh', () => {
  assert.deepEqual(
    writeGrantsIn(block('permissions')),
    [],
    'khoi `permissions:` cap workflow duoc MOI job thua. Mot quyen ghi o day la mot quyen ghi trao ' +
      'cho ca job chay ma nguon cua PR',
  );
});

test('B4: MOI job khai khoi `permissions:` cua rieng no — khong thua ngam', () => {
  for (const name of JOB_NAMES) {
    assert.ok(
      jobPermissions(name),
      `job \`${name}\` khong khai \`permissions:\` — mot job thua ngam la mot job ma bai kiem nay ` +
        `khong the noi gi ve quyen cua no`,
    );
  }
});

test('B4: KHONG job nao chay ma nguon cua PR ma co quyen ghi', () => {
  const prCodeJobs = JOB_NAMES.filter(runsPrCode);
  assert.ok(prCodeJobs.length > 0, 'phai co it nhat mot job chay tren `pull_request`');
  for (const name of prCodeJobs) {
    assert.deepEqual(
      writeGrantsIn(jobPermissions(name) ?? []),
      [],
      `job \`${name}\` chay tren \`pull_request\`, tuc chay ma nguon cua PR chua duyet — ` +
        `no khong duoc cam mot quyen ghi nao`,
    );
  }
});

test('B4: job chay ma nguon PR con bao chinh ma nguon dung lai truoc loi goi ghi', () => {
  // Ranh gioi that la `permissions:` o bai tren. Bien nay la lop thu hai, va no co ly do VAN HANH:
  // ngay `AUTOPILOT_DRY_RUN` duoc tat, mot job read-only khong co bien nay se thu `POST` va an 403
  // tren MOI PR — CI do vi mot thu dung theo thiet ke.
  const runsMain = JOB_NAMES.filter(
    (name) => runsPrCode(name) && jobBody(name).some((line) => line.includes('src/main.mjs')),
  );
  assert.ok(runsMain.length > 0, 'phai co it nhat mot job chay `main.mjs` tren ma nguon PR');
  for (const name of runsMain) {
    assert.equal(
      jobEnvLine(name, MUTATION_ENV),
      `${MUTATION_ENV}: ${MUTATION_ROLES.FORBIDDEN}`,
      `job \`${name}\` chay \`main.mjs\` tren ma nguon PR nen phai khai \`${MUTATION_ENV}\``,
    );
  }
});

test('B4: quyen ghi nam o DUNG MOT job, va job do khong chay tren `pull_request`', () => {
  const writeJobs = JOB_NAMES.filter((name) => writeGrantsIn(jobPermissions(name) ?? []).length > 0);
  assert.deepEqual(
    writeJobs,
    [MUTATING_JOB],
    'chi duoc mot duong ghi duy nhat — nhieu duong ghi la nhieu cho phai kiem lai',
  );

  const condition = jobIf(MUTATING_JOB);
  // So voi `github.event_name == 'pull_request'` chu khong voi chuoi `pull_request` tran: dieu kien
  // nay CO nhac `github.event.issue.pull_request`, va do la mot TRUONG cua payload
  // `issue_comment` — thu de phan biet comment tren PR voi comment tren Issue thuong, khong phai
  // ten mot trigger.
  assert.ok(
    !condition.includes("github.event_name == 'pull_request'"),
    `\`if:\` cua job \`${MUTATING_JOB}\` khong duoc chay tren trigger \`pull_request\`: do la ` +
      `trigger DUY NHAT chay ban workflow cua chinh PR`,
  );
  for (const eventName of [EVENT_NAMES.ISSUE_COMMENT, EVENT_NAMES.CHECK_SUITE]) {
    assert.ok(
      condition.includes(`github.event_name == '${eventName}'`),
      `job \`${MUTATING_JOB}\` phai chay tren \`${eventName}\` — GitHub bat buoc ban tren nhanh mac dinh`,
    );
  }
  assert.equal(jobEnvLine(MUTATING_JOB, MUTATION_ENV), `${MUTATION_ENV}: ${MUTATION_ROLES.ALLOWED}`);
});

test('B4: job co quyen ghi GHIM checkout vao nhanh mac dinh', () => {
  const body = jobBody(MUTATING_JOB).map((line) => line.trim());
  const checkout = body.indexOf('- uses: actions/checkout@v4');
  assert.notEqual(checkout, -1, `job \`${MUTATING_JOB}\` phai checkout`);
  assert.ok(
    body
      .slice(checkout, checkout + 4)
      .includes('ref: ${{ github.event.repository.default_branch }}'),
    'khong duoc dua vao checkout mac dinh: neu `github.sha` cua `check_suite` co luc tro ve ' +
      '`head_sha` cua mot PR thi job dang cam quyen ghi se keo ma nguon PR ve',
  );
});

test('B4: khong duoc dung `pull_request_target`', () => {
  // Do tren `content` (da bo comment), khong tren van ban tho: chinh tep YAML co mot comment GIAI
  // THICH vi sao khong duoc dung `pull_request_target`, va mot phep do tren van ban tho se doc
  // loi giai thich ay thanh vi pham.
  assert.ok(
    !content.join('\n').includes('pull_request_target'),
    '`pull_request_target` roi checkout ma nguon PR la dung lo hong B4 doi ten trigger',
  );
});

test('B2: `on:` lang DU ca ba trigger hop dong #165 khai', () => {
  const declared = block('on');
  for (const eventName of Object.values(EVENT_NAMES)) {
    assert.ok(
      declared.includes(`${eventName}:`),
      `thieu trigger \`${eventName}\` — hop dong #165 khai ca ba, thu hep trong PR la thu hep hop dong`,
    );
  }
});

test('B2: ba trigger cua workflow va ba trigger ma MA NGUON xu ly la MOT tap', () => {
  const subscribed = block('on')
    .filter((line) => line.endsWith(':'))
    .map((line) => line.slice(0, -1));
  // Lang mot su kien ma khong xu ly no la mot job chay roi khong lam gi; xu ly mot su kien khong
  // lang duoc la ma chet. Ca hai deu la lech, va bai nay bat ca hai chieu.
  assert.deepEqual(subscribed.slice().sort(), Object.values(EVENT_NAMES).slice().sort());
});

test('B2: ca ba trigger van co mot job chay — B4 tach duong ghi, khong bo mot trigger nao', () => {
  const conditions = JOB_NAMES.map(jobIf);
  for (const eventName of Object.values(EVENT_NAMES)) {
    assert.ok(
      conditions.some((condition) => condition.includes(`github.event_name == '${eventName}'`)),
      `khong job nao chay tren \`${eventName}\` — tach duong ghi khong duoc bien thanh bo trigger`,
    );
  }
});

test('B3: reviewer app KHONG co gia tri du phong ghi cung', () => {
  const found = lines.filter((entry) => entry.includes('AUTOPILOT_REVIEWER_APP_SLUG:'));
  assert.ok(found.length > 0, 'workflow phai truyen AUTOPILOT_REVIEWER_APP_SLUG');
  for (const line of found) {
    assert.equal(
      line.trim(),
      'AUTOPILOT_REVIEWER_APP_SLUG: ${{ vars.AUTOPILOT_REVIEWER_APP_SLUG }}',
      'mot gia tri du phong o day se LANG LE trao vai CHATGPT_REVIEWER — vai quyet dinh REVIEW_PASS ' +
        'cua ai duoc tinh — cho mot app ghi cung, ngay khi bien repo bi xoa hoac chua tung duoc dat',
    );
    assert.ok(!line.includes('||'), 'B3: khong duoc co gia tri du phong `||` cho reviewer app');
  }
  assert.ok(
    !workflow.includes('chatgpt-codex-connector'),
    'B3: khong duoc ghi cung slug cua app nguoi duyet trong workflow',
  );
});

test('preflight chay o dung trigger DUY NHAT co the chung minh quyen truoc khi merge', () => {
  // `issue_comment` va `check_suite` chay ban workflow tren nhanh mac dinh, nen mot thay doi
  // `permissions:` o do khong the tu kiem trong PR. `pull_request` chay ban cua chinh PR.
  assert.match(workflow, /^ {2}preflight:$/m, 'phai co job `preflight`');
  assert.ok(runsPrCode('preflight'), 'job `preflight` phai bi chan o trigger `pull_request`');
  assert.match(
    workflow,
    /node tools\/autopilot-orchestrator\/src\/preflight\.mjs/,
    'job `preflight` phai chay dung entrypoint do quyen',
  );
});

test('mac dinh DRY-RUN: bat that phai la mot hanh dong co chu dich, o MOI job', () => {
  const found = lines.filter((entry) => entry.includes('AUTOPILOT_DRY_RUN:'));
  assert.ok(found.length > 0, 'workflow phai truyen AUTOPILOT_DRY_RUN');
  for (const line of found) {
    assert.equal(line.trim(), "AUTOPILOT_DRY_RUN: ${{ vars.AUTOPILOT_DRY_RUN || 'true' }}");
  }
});
