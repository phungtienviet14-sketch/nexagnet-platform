/**
 * HOP DONG GIUA MA NGUON VA WORKFLOW — ba blocker cua PR #167, moi cai mot cai chan.
 *
 * Ba dieu duoi day khong the kiem bang bo test binh thuong, vi chung khong nam trong ma nguon —
 * chung nam trong YAML, va hau qua cua chung chi lo ra o LAN CHAY THAT SAU KHI MERGE
 * (`issue_comment` va `check_suite` chi chay ban workflow tren nhanh mac dinh). Tep nay keo chung
 * ve thanh thu do duoc trong PR.
 *
 *   B1 — `permissions:` phai du cho MOI loi goi API ma orchestrator thuc su thuc hien.
 *   B2 — `on:` phai lang du CA BA trigger hop dong #165 khai.
 *   B3 — `AUTOPILOT_REVIEWER_APP_SLUG` khong duoc co gia tri du phong ghi cung.
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
import { FORBIDDEN_GRANTS, REQUIRED_GRANTS } from '../src/permissions.mjs';

/**
 * Bo ky tu CR: tren Windows tep duoc checkout dang CRLF, va moi phep khang dinh duoi day cat theo
 * dong. Mot CR treo o cuoi dong lam bai kiem bao thieu mot quyen dang co that.
 */
const workflow = readFileSync(
  fileURLToPath(new URL('../../../.github/workflows/autopilot-orchestrator.yml', import.meta.url)),
  'utf8',
).replaceAll(String.fromCharCode(13), '');

const lines = workflow.split('\n');

/**
 * Cat mot khoi YAML cap cao nhat (`on:`, `permissions:`, ...) — tu dong tieu de den dong cap cao
 * nhat tiep theo. Du de doc mot tep 130 dong, va khong keo them mot phu thuoc nao.
 * @param {string} key
 */
function block(key) {
  const start = lines.findIndex((line) => line === `${key}:`);
  assert.notEqual(start, -1, `khong tim thay khoi \`${key}:\``);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.length > 0 && !/^[\s#]/.test(line));
  return (end === -1 ? rest : rest.slice(0, end))
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'))
    .map((line) => line.trim());
}

test('B1: `permissions:` khai DU cho moi loi goi API orchestrator thuc su thuc hien', () => {
  const declared = block('permissions');
  // `REQUIRED_GRANTS` dan xuat tu chinh bang probe cua `preflight.mjs`, nen bai nay khong the lech
  // khoi thuc te: them mot loi goi API la them mot probe, va them mot probe la bat buoc them quyen.
  for (const grant of REQUIRED_GRANTS) {
    assert.ok(
      declared.includes(grant),
      `thieu \`${grant}\` trong permissions: — mot khoi permissions tuong minh dat MOI quyen khong ` +
        `duoc ke thanh \`none\`, nen loi goi tuong ung se 403 o lan chay that sau khi merge`,
    );
  }
  // Hai dong nay la dung blocker B1. Ghi ten ro rang de mot lan xoa nham khong doc thanh loi chung.
  assert.ok(declared.includes('checks: read'), 'B1: thieu `checks: read` cho /check-runs');
  assert.ok(declared.includes('actions: read'), 'B1: thieu `actions: read` cho /actions/runs');
});

test('READ-ONLY duoc GITHUB cuong che: khong mot quyen ghi ma nguon nao', () => {
  const declared = block('permissions');
  for (const grant of FORBIDDEN_GRANTS) {
    assert.ok(!declared.includes(grant), `orchestrator khong duoc co \`${grant}\``);
  }
  // Khong chi `contents: write` — bat ky quyen ghi nao ngoai hai quyen can de dang comment/doi nhan.
  const writes = declared.filter((line) => line.endsWith(': write'));
  assert.deepEqual(writes.slice().sort(), ['issues: write', 'pull-requests: write']);
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

test('B3: reviewer app KHONG co gia tri du phong ghi cung', () => {
  const line = lines.find((entry) => entry.includes('AUTOPILOT_REVIEWER_APP_SLUG:'));
  assert.ok(line, 'workflow phai truyen AUTOPILOT_REVIEWER_APP_SLUG');
  assert.equal(
    line?.trim(),
    'AUTOPILOT_REVIEWER_APP_SLUG: ${{ vars.AUTOPILOT_REVIEWER_APP_SLUG }}',
    'mot gia tri du phong o day se LANG LE trao vai CHATGPT_REVIEWER — vai quyet dinh REVIEW_PASS ' +
      'cua ai duoc tinh — cho mot app ghi cung, ngay khi bien repo bi xoa hoac chua tung duoc dat',
  );
  // Noi rieng: khong duoc co `||` tren dong do, va khong duoc co slug nao ghi cung trong ca tep.
  assert.ok(!line?.includes('||'), 'B3: khong duoc co gia tri du phong `||` cho reviewer app');
  assert.ok(
    !workflow.includes('chatgpt-codex-connector'),
    'B3: khong duoc ghi cung slug cua app nguoi duyet trong workflow',
  );
});

test('preflight chay o dung trigger DUY NHAT co the chung minh quyen truoc khi merge', () => {
  // `issue_comment` va `check_suite` chay ban workflow tren nhanh mac dinh, nen mot thay doi
  // `permissions:` o do khong the tu kiem trong PR. `pull_request` chay ban cua chinh PR.
  assert.match(workflow, /^ {2}preflight:$/m, 'phai co job `preflight`');
  assert.match(
    workflow,
    /preflight:[\s\S]*?github\.event_name == 'pull_request'/,
    'job `preflight` phai bi chan o trigger `pull_request`',
  );
  assert.match(
    workflow,
    /node tools\/autopilot-orchestrator\/src\/preflight\.mjs/,
    'job `preflight` phai chay dung entrypoint do quyen',
  );
});

test('mac dinh DRY-RUN: bat that phai la mot hanh dong co chu dich', () => {
  const line = lines.find((entry) => entry.includes('AUTOPILOT_DRY_RUN:'));
  assert.equal(line?.trim(), "AUTOPILOT_DRY_RUN: ${{ vars.AUTOPILOT_DRY_RUN || 'true' }}");
});
