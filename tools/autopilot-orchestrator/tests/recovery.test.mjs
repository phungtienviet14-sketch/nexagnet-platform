/**
 * HONG GIUA CHUNG ROI CHAY LAI — blocker B5 cua PR #167, do qua chinh entrypoint.
 *
 * VI SAO KHONG THE DO BANG MOT HAM
 *
 * Cai hong cua B5 khong nam trong `reconcileLabels`, cung khong nam trong `findPostedClaim`. No nam
 * o CHO NOI ba thu, va no chi hien ra khi co HAI lan chay:
 *
 *   lan 1: POST comment -> 201.  POST labels -> 500 (hoac job het gio, hoac runner chet).
 *   lan 2: cong chong trung thay comment cua lan 1 -> dung -> KHONG BAO GIO ve toi phan nhan.
 *   ket qua: nhan ket o trang thai cu VINH VIEN, va chinh cong chong trung la cai chan duong sua.
 *
 * Nen bai o day chay `node src/main.mjs` HAI LAN nhu Actions chay no, va so ledger cua lan hai mang
 * dung comment ma lan mot da dang — lay tu than cua chinh loi goi POST lan mot, khong phai mot ban
 * chep tay. Mang duoc dung lai bang `tests/helpers/http-stub.mjs`.
 *
 * DU LIEU LA THAT: `pull-155.json`, `branch-rules-main.json`, `check-runs-c86219b.json` bat truc
 * tiep tu REST cua chinh repo nay; `issue-165.json` la than Issue #165 — dung hop dong task ma PR
 * nay thuc hien.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const MAIN = fileURLToPath(new URL('../src/main.mjs', import.meta.url));
const STUB = pathToFileURL(fileURLToPath(new URL('./helpers/http-stub.mjs', import.meta.url))).href;

/** @param {string} name */
const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const REPO = 'phungtienviet14-sketch/nexagnet-platform';
const OWNER = 'phungtienviet14-sketch';
const PR = 155;
const ISSUE = 165;
const HEAD = 'c86219b22be19ce3db7a9753bd9866316b654cbe';
const CI_RUN = 33834237024;
const POSTED_COMMENT_ID = 5538400001;

const BUILD_READY_COMMENT = {
  id: 5535424344,
  user: { login: OWNER },
  performed_via_github_app: null,
  body: [
    '<!-- AUTOPILOT_BUILD_READY_V0 -->',
    'BUILD_READY',
    `ISSUE=${ISSUE}`,
    `PR=${PR}`,
    `HEAD_SHA=${HEAD}`,
    'BASE_SHA=b9ead7e0c238bea417763857ee85ae3714963be8',
  ].join('\n'),
};

const EVENT = {
  action: 'created',
  issue: { number: PR, pull_request: { url: `https://api.github.com/repos/${REPO}/pulls/${PR}` } },
  comment: BUILD_READY_COMMENT,
};

const COMMENTS_PATH = `^/repos/[^/]+/[^/]+/issues/${PR}/comments`;
const LABELS_PATH = `^/repos/[^/]+/[^/]+/issues/${PR}/labels`;

/**
 * Bang tuyen duong cho MOT lan chay: sau duong doc luon thanh cong, ba duong ghi thi tuy bai.
 *
 * @param {object} at
 * @param {Array<Record<string, unknown>>} at.ledger Luong comment ma lan chay nay se doc duoc.
 * @param {number} [at.labelAddStatus]
 * @param {number} [at.labelRemoveStatus]
 */
const routesFor = ({ ledger, labelAddStatus = 200, labelRemoveStatus = 200 }) => [
  {
    method: 'GET',
    path: `^/repos/[^/]+/[^/]+/pulls/${PR}$`,
    status: 200,
    body: fixture('pull-155.json'),
  },
  { method: 'GET', path: `${COMMENTS_PATH}\\?`, status: 200, body: ledger },
  {
    method: 'GET',
    path: `^/repos/[^/]+/[^/]+/issues/${ISSUE}$`,
    status: 200,
    body: fixture('issue-165.json'),
  },
  {
    method: 'GET',
    path: '^/repos/[^/]+/[^/]+/rules/branches/main$',
    status: 200,
    body: fixture('branch-rules-main.json'),
  },
  {
    method: 'GET',
    path: '^/repos/[^/]+/[^/]+/commits/[0-9a-f]{40}/check-runs',
    status: 200,
    body: fixture('check-runs-c86219b.json'),
  },
  {
    method: 'GET',
    path: '^/repos/[^/]+/[^/]+/actions/runs\\?',
    status: 200,
    body: { workflow_runs: [{ id: CI_RUN, name: 'ci' }] },
  },
  { method: 'POST', path: `${COMMENTS_PATH}$`, status: 201, body: { id: POSTED_COMMENT_ID } },
  { method: 'DELETE', path: `${LABELS_PATH}/`, status: labelRemoveStatus },
  { method: 'POST', path: `${LABELS_PATH}$`, status: labelAddStatus },
];

/**
 * Chay `main.mjs` nhu Actions chay no: mot tep su kien tren dia, mot bo bien moi truong, mang
 * duoc dung lai bang bang tuyen duong.
 *
 * @param {object} at
 * @param {ReturnType<typeof routesFor>} at.routes
 * @param {Record<string, string | undefined>} [at.env]
 */
function runMain({ routes, env: over }) {
  const dir = mkdtempSync(join(tmpdir(), 'autopilot-recovery-'));
  const eventPath = join(dir, 'event.json');
  const routesPath = join(dir, 'routes.json');
  const callsPath = join(dir, 'calls.jsonl');
  writeFileSync(eventPath, JSON.stringify(EVENT), 'utf8');
  writeFileSync(routesPath, JSON.stringify(routes), 'utf8');
  writeFileSync(callsPath, '', 'utf8');

  /** @type {Record<string, string>} */
  const env = {};
  for (const [key, value] of Object.entries({
    ...process.env,
    GITHUB_TOKEN: 'khong-that-nhung-khong-ai-goi-that',
    GITHUB_REPOSITORY: REPO,
    GITHUB_EVENT_NAME: 'issue_comment',
    GITHUB_EVENT_PATH: eventPath,
    AUTOPILOT_REPO_OWNER_LOGIN: OWNER,
    AUTOPILOT_REVIEWER_APP_SLUG: 'mot-app-nguoi-duyet',
    AUTOPILOT_DRY_RUN: 'false',
    AUTOPILOT_MUTATIONS: 'allowed',
    AUTOPILOT_TEST_ROUTES: routesPath,
    AUTOPILOT_TEST_CALLS: callsPath,
    ...over,
  })) {
    if (typeof value === 'string') env[key] = value;
  }

  const result = spawnSync(process.execPath, ['--import', STUB, MAIN], {
    encoding: 'utf8',
    timeout: 60_000,
    env,
  });

  /** @param {string} text */
  const jsonLines = (text) =>
    text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));

  return {
    status: result.status,
    stderr: String(result.stderr),
    logs: jsonLines(String(result.stdout)),
    calls: /** @type {Array<Record<string, any>>} */ (jsonLines(readFileSync(callsPath, 'utf8'))),
  };
}

/** @param {Array<Record<string, any>>} calls */
const writeCalls = (calls) => calls.filter((call) => call.method !== 'GET');

test('DOI CHUNG: duong day du chay tron — dang comment MOT lan, roi doi du nhan', () => {
  const run = runMain({ routes: routesFor({ ledger: [BUILD_READY_COMMENT] }) });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);

  assert.ok(
    run.calls.every((call) => call.matched),
    `duong dan khong khop bang tuyen duong: ${JSON.stringify(run.calls.filter((c) => !c.matched))}`,
  );

  const decision = run.logs.find((entry) => entry.orchestrator === 'decision');
  assert.equal(decision?.action, 'POST_REVIEW_REQUEST');
  assert.equal(decision?.headSha, HEAD);
  assert.equal(decision?.ciRunId, CI_RUN);
  assert.equal(decision?.mutationRole, 'allowed');

  assert.ok(run.logs.find((entry) => entry.orchestrator === 'posted'));
  const labels = run.logs.find((entry) => entry.orchestrator === 'labels');
  assert.ok(labels, 'phai co dong log ket qua doi nhan');
  // `decide.mjs` go HET nhan trang thai roi gan lai dung mot cai: 7 nhan bi go + 1 nhan duoc gan.
  assert.equal(labels.applied.length, 8);
  assert.equal(
    labels.applied.filter((/** @type {{ outcome: string }} */ e) => e.outcome === 'ADDED').length,
    1,
  );
  assert.equal(
    run.logs.find((entry) => entry.orchestrator === 'abort'),
    undefined,
  );
});

test('B5: hong GIUA comment va nhan => lan sau HOA GIAI nhan, khong dang comment lan hai', () => {
  // ---------------------------------------------------------------------------------------------
  // LAN 1 — comment dang duoc, nhan hong. Day dung la khoang thoi gian ma ban truoc khong ra khoi.
  // ---------------------------------------------------------------------------------------------
  const first = runMain({
    routes: routesFor({ ledger: [BUILD_READY_COMMENT], labelAddStatus: 500 }),
  });

  assert.equal(first.status, 1, `mot lan doi nhan hong phai lam DO job; stderr: ${first.stderr}`);
  const abort = first.logs.find((entry) => entry.orchestrator === 'abort');
  assert.equal(abort?.reason, 'LABEL_WRITE_FAILED');
  assert.equal(abort?.op, 'add');
  assert.equal(abort?.status, 500);

  const posted = writeCalls(first.calls).find((call) => call.path.endsWith('/comments'));
  assert.ok(posted, 'lan 1 phai da dang duoc comment — do la tien de cua ca bai nay');
  const postedBody = String(JSON.parse(String(posted.body)).body);
  assert.match(postedBody, /^<!-- AUTOPILOT_REVIEW_REQUEST_V0 -->/);

  // ---------------------------------------------------------------------------------------------
  // LAN 2 — so ledger gio DA CO comment cua lan 1. Ban truoc dung ngay tai day va bo nhan lai sai.
  // ---------------------------------------------------------------------------------------------
  const second = runMain({
    routes: routesFor({
      ledger: [
        BUILD_READY_COMMENT,
        {
          id: POSTED_COMMENT_ID,
          user: { login: OWNER },
          performed_via_github_app: null,
          body: postedBody,
        },
      ],
    }),
  });

  assert.equal(second.status, 0, `lan sua chua phai chay tron; stderr: ${second.stderr}`);

  // KHONG dang comment lan hai: cong chong trung van lam dung viec cua no.
  assert.deepEqual(
    writeCalls(second.calls).filter((call) => call.path.endsWith('/comments')),
    [],
    'mot HEAD khong duoc lanh hai comment giong het nhau',
  );
  assert.equal(
    second.logs.find((entry) => entry.orchestrator === 'posted'),
    undefined,
  );

  // NHUNG nhan thi VAN duoc hoa giai — day la ca sua chua ma ban truoc khong co.
  const labels = second.logs.find((entry) => entry.orchestrator === 'labels');
  assert.ok(labels, 'lan chay sau phai hoa giai nhan du comment da ton tai');
  assert.equal(labels.applied.length, 8);
  assert.ok(
    writeCalls(second.calls).some((call) => call.method === 'DELETE'),
    'phai co loi goi go nhan that, khong chi mot dong log',
  );
  assert.ok(
    writeCalls(second.calls).some(
      (call) => call.method === 'POST' && call.path.endsWith('/labels'),
    ),
    'phai gan lai nhan trang thai dung',
  );

  // Va lan chay ket thuc bang dung ma ly do cu — dung SAU khi da don xong, khong phai truoc.
  const stop = second.logs.find((entry) => entry.orchestrator === 'stop');
  assert.equal(stop?.reason, 'ALREADY_POSTED_AT_HEAD');
  assert.equal(stop?.commentId, POSTED_COMMENT_ID);
  assert.equal(stop?.labelsReconciled, 8);
});

test('B5: go mot nhan da vang (`404`) khong lam do lan sua chua', () => {
  // Lan sua chua thu hai chay tren mot PR gan nhu da dung trang thai: moi nhan can go deu khong con.
  const run = runMain({
    routes: routesFor({ ledger: [BUILD_READY_COMMENT], labelRemoveStatus: 404 }),
  });

  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  const labels = run.logs.find((entry) => entry.orchestrator === 'labels');
  assert.equal(
    labels?.applied.filter(
      (/** @type {{ outcome: string }} */ e) => e.outcome === 'ALREADY_ABSENT',
    ).length,
    7,
  );
});

test('B5: go nhan hong voi status KHAC 404 thi PHAI do — khong nuot nhu ban truoc', () => {
  const run = runMain({
    routes: routesFor({ ledger: [BUILD_READY_COMMENT], labelRemoveStatus: 403 }),
  });

  assert.equal(run.status, 1);
  const abort = run.logs.find((entry) => entry.orchestrator === 'abort');
  assert.equal(abort?.reason, 'LABEL_WRITE_FAILED');
  assert.equal(abort?.op, 'remove');
  assert.equal(abort?.status, 403);
});

test('B4: `AUTOPILOT_MUTATIONS=forbidden` => quyet dinh day du, KHONG mot loi goi ghi nao', () => {
  // Day la lan chay cua job `orchestrate-readonly`, tuc lan chay tren MA NGUON CUA PR. No phai di
  // het duong quyet dinh (de mot hong hoc lo ra ngay trong PR) nhung khong duoc cham vao mat phang
  // trang thai. Luu y `AUTOPILOT_DRY_RUN=false` o day — bai nay do dung bien MUTATIONS, khong phai
  // do cong tac van hanh.
  const run = runMain({
    routes: routesFor({ ledger: [BUILD_READY_COMMENT] }),
    env: { AUTOPILOT_MUTATIONS: 'forbidden' },
  });

  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  const decision = run.logs.find((entry) => entry.orchestrator === 'decision');
  assert.equal(decision?.action, 'POST_REVIEW_REQUEST', 'van phai quyet dinh day du');
  assert.equal(decision?.mutationRole, 'forbidden');

  const noWrite = run.logs.find((entry) => entry.orchestrator === 'no-write');
  assert.equal(noWrite?.reason, 'MUTATIONS_FORBIDDEN');
  assert.equal(noWrite?.alreadyPosted, false);
  assert.deepEqual(writeCalls(run.calls), [], 'khong duoc goi mot duong ghi nao');
});

test('bien MUTATIONS khong dat => fail-closed, coi nhu `forbidden`', () => {
  const run = runMain({
    routes: routesFor({ ledger: [BUILD_READY_COMMENT] }),
    env: { AUTOPILOT_MUTATIONS: undefined },
  });

  assert.equal(run.status, 0);
  assert.equal(
    run.logs.find((entry) => entry.orchestrator === 'no-write')?.reason,
    'MUTATIONS_FORBIDDEN',
  );
  assert.deepEqual(writeCalls(run.calls), []);
});

test('DRY-RUN van la cong tac van hanh rieng — bat mutations khong bo qua duoc no', () => {
  const run = runMain({
    routes: routesFor({ ledger: [BUILD_READY_COMMENT] }),
    env: { AUTOPILOT_DRY_RUN: 'true' },
  });

  assert.equal(run.status, 0);
  const noWrite = run.logs.find((entry) => entry.orchestrator === 'no-write');
  assert.equal(noWrite?.reason, 'DRY_RUN');
  assert.equal(noWrite?.mutationRole, 'allowed');
  assert.deepEqual(writeCalls(run.calls), []);
});

test('B6: `main.mjs` doc so ledger bang PHAN TRANG, khong bang mot loi goi tron', () => {
  // Doi chieu o tang entrypoint: neu ai do doi `fetchAllComments` ve lai mot loi goi `per_page=100`
  // thi bai nay do — duong dan se khong con mang `page=`.
  const run = runMain({ routes: routesFor({ ledger: [BUILD_READY_COMMENT] }) });
  const ledgerCalls = run.calls.filter(
    (call) => call.method === 'GET' && call.path.includes('/comments?'),
  );
  assert.equal(ledgerCalls.length, 1, 'mot trang ngan la du — nhung phai la mot TRANG');
  assert.match(ledgerCalls[0].path, /[?&]page=1(&|$)/);
  assert.match(ledgerCalls[0].path, /[?&]per_page=100(&|$)/);
});
