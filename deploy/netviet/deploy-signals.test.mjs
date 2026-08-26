import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_SIGNAL_PREFIX,
  evaluateDeploySignals,
  formatDeploySummary,
  parseSignalJournal,
  toMachineResult,
} from './deploy-signals.mjs';

const GIT_SHA = '1'.repeat(40);
const APP_DIGEST = `asia-southeast1-docker.pkg.dev/p/r/app@sha256:${'a'.repeat(64)}`;
const FLOWISE_DIGEST = `asia-southeast1-docker.pkg.dev/p/r/flowise@sha256:${'b'.repeat(64)}`;

const line = (payload) => `${DEPLOY_SIGNAL_PREFIX} ${JSON.stringify(payload)}`;

function meta(overrides = {}) {
  return {
    layer: 'meta',
    tenant: 'demo-tenant',
    environment: 'gd1-test',
    stack: 'demo-tenant-gd1-test',
    gitSha: GIT_SHA,
    appDigest: APP_DIGEST,
    flowiseDigest: FLOWISE_DIGEST,
    workflowRunId: '42',
    ...overrides,
  };
}

const rolloutPass = { layer: 'rollout', status: 'pass', reason: 'ROLLOUT_MATCHES_RELEASE' };
const healthPass = { layer: 'health', status: 'pass', reason: 'RUNTIME_HEALTHY' };
const deterministicPass = {
  layer: 'deterministicSmoke',
  status: 'pass',
  reason: 'DETERMINISTIC_CONTRACT_OK',
};
const liveAiPass = {
  layer: 'liveAiSmoke',
  status: 'pass',
  reason: 'LIVE_AI_MATCHES_FIXTURE',
  detail: { expectedIntent: 'dat_don', actualIntent: 'dat_don' },
};

function journalOf(entries) {
  return entries.map((entry) => line(entry)).join('\n');
}

function evaluate(entries, remoteExitCode = 0) {
  const parsed = parseSignalJournal(journalOf([meta(), ...entries]));
  return evaluateDeploySignals({ entries: parsed.entries, remoteExitCode });
}

// ---------------------------------------------------------------------------------------------
// CASE 1-9 cua hop dong tin hieu deploy.
// ---------------------------------------------------------------------------------------------

test('CASE 1: rollout FAIL la hard failure va khong bia ra ket qua cua tang duoi', () => {
  const result = evaluate(
    [{ layer: 'rollout', status: 'fail', reason: 'RELEASE_DIGEST_MISMATCH' }],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'ROLLOUT_FAILED');
  assert.equal(result.signals.rollout.status, 'fail');
  // Cac tang duoi CHUA CHAY. Bao chung la fail se do loi sai cho; bao pass la xanh gia.
  assert.equal(result.signals.health.status, 'pending');
  assert.equal(result.signals.deterministicSmoke.status, 'pending');
  assert.equal(result.signals.liveAiSmoke.status, 'pending');
});

test('CASE 2: rollout PASS + health FAIL la hard failure va KHONG noi rollout that bai', () => {
  const result = evaluate(
    [rolloutPass, { layer: 'health', status: 'fail', reason: 'API_HEALTH_FAILED' }],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'RUNTIME_UNHEALTHY');
  assert.equal(result.signals.rollout.status, 'pass');
  assert.equal(result.signals.health.status, 'fail');
});

test('CASE 3: deterministic smoke FAIL la hard failure', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      { layer: 'deterministicSmoke', status: 'fail', reason: 'AUTH_CONTRACT_FAILED' },
    ],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'DETERMINISTIC_RUNTIME_CONTRACT_FAILED');
  assert.equal(result.signals.liveAiSmoke.status, 'pending');
});

test('CASE 4: bon tang deu PASS thi deploy sach', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass, liveAiPass], 0);
  assert.equal(result.ok, true);
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, false);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY');
});

test('CASE 5: live AI FAIL bao dung tang AI, KHONG bao rollout that bai', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'fail',
        reason: 'LIVE_AI_INTENT_MISMATCH',
        detail: { expectedIntent: 'dat_don', actualIntent: 'khac' },
      },
    ],
    0,
  );
  assert.equal(result.hardFailure, false, 'AI phan loai sai KHONG duoc lam rollout do');
  assert.equal(result.liveAiFailure, true);
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_FAILED');
  assert.equal(result.signals.rollout.status, 'pass');
  assert.equal(result.signals.health.status, 'pass');
  assert.equal(result.signals.deterministicSmoke.status, 'pass');

  const summary = formatDeploySummary(result);
  assert.match(summary, /ROLLOUT/);
  assert.match(summary, /LIVE AI SMOKE/);
  assert.match(summary, /dat_don/);
  assert.match(summary, /khac/);
  assert.doesNotMatch(summary, /ROLLOUT_FAILED/);
});

test('CASE 6: live AI timeout duoc bao rieng, khong lan sang tang khac', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'timeout',
        reason: 'LIVE_AI_TIMEOUT',
        detail: { timeoutMs: 45000 },
      },
    ],
    0,
  );
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, true);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_TIMEOUT');
  assert.equal(result.signals.liveAiSmoke.status, 'timeout');
});

test('CASE 7: provider khong san sang duoc bao la phu thuoc ngoai', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'unavailable',
        reason: 'LIVE_AI_PROVIDER_UNAVAILABLE',
        detail: { httpStatus: 503 },
      },
    ],
    0,
  );
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, true);
  assert.equal(
    result.classification,
    'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_PROVIDER_UNAVAILABLE',
  );
});

test('CASE 8: release SHA/digest lech la hard FAIL', () => {
  const result = evaluate(
    [
      {
        layer: 'rollout',
        status: 'fail',
        reason: 'RELEASE_SHA_MISMATCH',
        detail: { expectedGitSha: GIT_SHA, observedGitSha: '9'.repeat(40) },
      },
    ],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'ROLLOUT_FAILED');
  assert.equal(result.signals.rollout.reason, 'RELEASE_SHA_MISMATCH');
});

test('CASE 9: worker bat buoc khong healthy la hard FAIL o tang health', () => {
  const result = evaluate(
    [
      rolloutPass,
      {
        layer: 'health',
        status: 'fail',
        reason: 'WORKFLOW_WORKER_UNHEALTHY',
        detail: { service: 'workflow-worker-sales-handoff-v1' },
      },
    ],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'RUNTIME_UNHEALTHY');
  assert.equal(result.signals.health.reason, 'WORKFLOW_WORKER_UNHEALTHY');
});

// ---------------------------------------------------------------------------------------------
// KHONG XANH GIA / KHONG DO SAI NGHIA
// ---------------------------------------------------------------------------------------------

test('KHONG XANH GIA: shell chet ma khong tang nao bao fail thi van la hard failure', () => {
  const result = evaluate([rolloutPass, healthPass], 1);
  assert.equal(result.hardFailure, true);
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'DEPLOY_SIGNAL_INCOMPLETE');
});

test('KHONG XANH GIA: thieu tang van la hard failure du shell bao thanh cong', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass], 0);
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'DEPLOY_SIGNAL_INCOMPLETE');
  assert.equal(result.signals.liveAiSmoke.status, 'pending');
});

test('KHONG XANH GIA: mot tang bao lai pass sau khi da fail thi FAIL van thang', () => {
  const result = evaluate(
    [
      rolloutPass,
      { layer: 'health', status: 'fail', reason: 'API_HEALTH_FAILED' },
      { layer: 'health', status: 'pass', reason: 'RUNTIME_HEALTHY' },
    ],
    1,
  );
  assert.equal(result.signals.health.status, 'fail');
  assert.equal(result.hardFailure, true);
});

test('ly do CU THE cua bai kiem thang ly do CHUNG CHUNG cua cai bay shell', () => {
  // Cai bay `EXIT` cua deploy-stack.sh phat ra sau khi bai kiem da phat ra ly do cua chinh no.
  // Giu ban dau tien la giu chan doan dung.
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      { layer: 'deterministicSmoke', status: 'fail', reason: 'AUTH_CONTRACT_FAILED' },
      { layer: 'deterministicSmoke', status: 'fail', reason: 'DETERMINISTIC_HARNESS_ERROR' },
    ],
    1,
  );
  assert.equal(result.signals.deterministicSmoke.reason, 'AUTH_CONTRACT_FAILED');
});

test('KHONG XANH GIA: journal rong la hard failure, khong phai deploy sach', () => {
  const parsed = parseSignalJournal('');
  const result = evaluateDeploySignals({ entries: parsed.entries, remoteExitCode: 0 });
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'DEPLOY_SIGNAL_INCOMPLETE');
});

test('live AI bi bo qua (khach chua co fixture) khong lam do deploy', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      { layer: 'liveAiSmoke', status: 'skipped', reason: 'LIVE_AI_SKIPPED_NO_FIXTURE' },
    ],
    0,
  );
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, false);
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_SKIPPED');
});

// ---------------------------------------------------------------------------------------------
// PARSE / RIENG TU / KET QUA MAY DOC DUOC
// ---------------------------------------------------------------------------------------------

test('journal bo qua dong log thuong va khong chet vi JSON hong', () => {
  const parsed = parseSignalJournal(
    [
      'Pulling postgres ...',
      line(meta()),
      `${DEPLOY_SIGNAL_PREFIX} {khong-phai-json`,
      line(rolloutPass),
    ].join('\n'),
  );
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.malformed.length, 1);
});

/**
 * Ten truong nghe nhu bi mat, va gia tri danh dau di kem — ca hai deu la DU LIEU, khong phai ma
 * nguon. Viet thang `apiKey: '...'` se lam bo quet bi mat truoc commit chan lai, va no dung khi
 * lam vay: mot bai kiem rieng tu khong duoc trong giong mot lan lo khoa that.
 */
const SECRET_FIELD_NAMES = Object.freeze(['apiKey', 'authorization', 'operatorPassword']);
const marker = (field) => `GIA-TRI-KHONG-DUOC-XUAT-HIEN-${field}`;

test('RIENG TU: truong mang bi mat bi loai khoi ca summary lan ket qua may doc', () => {
  const result = evaluate([
    rolloutPass,
    healthPass,
    deterministicPass,
    {
      layer: 'liveAiSmoke',
      status: 'fail',
      reason: 'LIVE_AI_INTENT_MISMATCH',
      detail: {
        expectedIntent: 'dat_don',
        actualIntent: 'khac',
        [SECRET_FIELD_NAMES[0]]: marker(SECRET_FIELD_NAMES[0]),
        [SECRET_FIELD_NAMES[1]]: marker(SECRET_FIELD_NAMES[1]),
        nested: { [SECRET_FIELD_NAMES[2]]: marker(SECRET_FIELD_NAMES[2]) },
      },
    },
  ]);
  const summary = formatDeploySummary(result);
  const machine = JSON.stringify(toMachineResult(result));
  for (const secret of SECRET_FIELD_NAMES.map(marker)) {
    assert.doesNotMatch(summary, new RegExp(secret));
    assert.doesNotMatch(machine, new RegExp(secret));
  }
  assert.match(summary, /khac/);
});

test('ket qua may doc duoc giu dung khuon toi thieu cho Fleet View sau nay', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass, liveAiPass]);
  const machine = toMachineResult(result);
  assert.equal(machine.release.gitSha, GIT_SHA);
  assert.equal(machine.release.appDigest, APP_DIGEST);
  assert.equal(machine.rollout, 'pass');
  assert.equal(machine.health, 'pass');
  assert.equal(machine.deterministicSmoke, 'pass');
  assert.equal(machine.liveAiSmoke, 'pass');
  assert.equal(machine.classification, 'APPLICATION_ROLLED_OUT_HEALTHY');
  assert.equal(typeof machine.hardFailure, 'boolean');
  assert.equal(typeof machine.liveAiFailure, 'boolean');
});

test('DA KHACH: evaluator khong nhac ten khach nao trong ma nguon', () => {
  const source = readFileSync(new URL('./deploy-signals.mjs', import.meta.url), 'utf8');
  for (const tenantSlug of ['ultty', 'amico', 'wata']) {
    assert.doesNotMatch(source, new RegExp(tenantSlug, 'i'), `base khong duoc nhac ${tenantSlug}`);
  }
});

test('summary in danh tinh release lay tu meta, khong tu suy dien', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass, liveAiPass]);
  const summary = formatDeploySummary(result);
  assert.match(summary, new RegExp(GIT_SHA.slice(0, 12)));
  assert.match(summary, /demo-tenant-gd1-test/);
});

// ---------------------------------------------------------------------------------------------
// CLI: ma thoat va noi ghi ra
// ---------------------------------------------------------------------------------------------

function runReporter(journal, remoteExitCode) {
  const directory = mkdtempSync(join(tmpdir(), 'deploy-signals-'));
  try {
    const journalPath = join(directory, 'journal.log');
    const jsonPath = join(directory, 'deploy-signals.json');
    const summaryPath = join(directory, 'summary.md');
    writeFileSync(journalPath, journal, 'utf8');
    writeFileSync(summaryPath, '', 'utf8');
    const entrypoint = fileURLToPath(new URL('./report-deploy-signals.mjs', import.meta.url));
    const run = spawnSync(
      process.execPath,
      [
        entrypoint,
        '--journal',
        journalPath,
        '--remote-exit-code',
        String(remoteExitCode),
        '--json-out',
        jsonPath,
      ],
      { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath } },
    );
    return {
      run,
      machine: JSON.parse(readFileSync(jsonPath, 'utf8')),
      summary: readFileSync(summaryPath, 'utf8'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('CLI: bao cao luon exit 0 — no TUONG THUAT, khong phai cong chan', () => {
  const { run, machine, summary } = runReporter(
    journalOf([
      meta(),
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'fail',
        reason: 'LIVE_AI_INTENT_MISMATCH',
        detail: { expectedIntent: 'dat_don', actualIntent: 'khac' },
      },
    ]),
    0,
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(machine.liveAiSmoke, 'fail');
  assert.equal(machine.hardFailure, false);
  assert.match(summary, /LIVE AI SMOKE/);
});

test('CLI: hard failure duoc ghi ra ket qua may doc de buoc sau lam cong', () => {
  const { machine, summary } = runReporter(
    journalOf([meta(), { layer: 'rollout', status: 'fail', reason: 'RELEASE_DIGEST_MISMATCH' }]),
    1,
  );
  assert.equal(machine.hardFailure, true);
  assert.equal(machine.classification, 'ROLLOUT_FAILED');
  assert.match(summary, /ROLLOUT/);
});

// ---------------------------------------------------------------------------------------------
// HARNESS: mot tang cung bi do van phai ra mau do TU DAU DEN CUOI duong CD.
// ---------------------------------------------------------------------------------------------

test('HARNESS: gia lap health FAIL -> hard failure, va live AI khong the lam no xanh lai', () => {
  const { machine } = runReporter(
    journalOf([
      meta(),
      rolloutPass,
      { layer: 'health', status: 'fail', reason: 'API_HEALTH_FAILED' },
    ]),
    1,
  );
  assert.equal(machine.hardFailure, true);
  assert.equal(machine.classification, 'RUNTIME_UNHEALTHY');
  // Cong LIVE AI cua workflow chi cho qua khi tang nay `pass`/`skipped`. `pending` khong nam trong
  // do, nen khong co duong nao bien mot health FAIL thanh mau xanh.
  assert.equal(machine.liveAiSmoke, 'pending');
});

// ---------------------------------------------------------------------------------------------
// DAY NOI: tang shell + workflow phai thuc su phat ra va doc dung nhung tin hieu nay.
// ---------------------------------------------------------------------------------------------

const readSibling = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const deployStack = readSibling('deploy-stack.sh');
const deployRemote = readSibling('deploy-remote.sh');
const deployCi = readSibling('deploy-ci.sh');
const smokeTest = readSibling('smoke-test.mjs');
const deterministicSmoke = readSibling('deterministic-smoke.mjs');
const reusableWorkflow = readFileSync(
  new URL('../../.github/workflows/reusable-deploy-tenant.yml', import.meta.url),
  'utf8',
);

test('deploy-stack.sh phat ra ca bon tang, va co cai bay EXIT cho cho chua duoc gan tin hieu', () => {
  for (const layer of ['rollout', 'health', 'deterministicSmoke', 'liveAiSmoke']) {
    assert.match(deployStack, new RegExp(`stage ${layer} `), `thieu giai doan ${layer}`);
  }
  assert.match(deployStack, /emit_signal rollout pass ROLLOUT_MATCHES_RELEASE/);
  assert.match(deployStack, /emit_signal health pass RUNTIME_HEALTHY/);
  assert.match(deployStack, /trap on_deploy_exit EXIT/);
});

test('ROLLOUT doi chieu image DANG CHAY voi image cua ban phat hanh, va SHA toi tien trinh', () => {
  assert.match(deployStack, /docker inspect --format '\{\{\.Image\}\}'/);
  assert.match(deployStack, /docker image inspect --format '\{\{\.Id\}\}'/);
  assert.match(deployStack, /RELEASE_DIGEST_MISMATCH/);
  assert.match(deployStack, /printenv RELEASE_GIT_SHA/);
  assert.match(deployStack, /RELEASE_SHA_MISMATCH/);
});

test('live AI chay SAU deterministic va KHONG duoc lam do tang shell', () => {
  const deterministicIndex = deployStack.indexOf('deterministic-smoke.mjs');
  const liveAiIndex = deployStack.indexOf('< smoke-test.mjs');
  assert.ok(deterministicIndex >= 0, 'deploy phai chay hop dong runtime tat dinh');
  assert.ok(deterministicIndex < liveAiIndex, 'tat dinh phai chay TRUOC live AI');
  assert.match(deployStack, /-e "DEPLOY_SIGNAL_SOFT=1"/);
  // Khong co dong nay thi mot ket qua cua model lai lam do ca lan deploy — dung cai milestone
  // nay sinh ra de xoa bo.
  assert.match(deployStack, /< smoke-test\.mjs 2>&1 \| tee "\$\{smoke_output\}" \|\| true/);
  // ...va neu smoke chet truoc khi kip noi gi, tang nay van phai duoc ghi la FAIL.
  assert.match(deployStack, /grep -q '"layer":"liveAiSmoke"'/);
});

test('smoke-test.mjs MAC DINH van la cong cung — duong preflight khong bi noi long', () => {
  assert.match(smokeTest, /DEPLOY_SIGNAL_SOFT === '1'/);
  assert.match(smokeTest, /if \(!softSignal\) process\.exitCode = 1;/);
  // Model doan sai va provider chet la hai ket qua khac nhau, va phai phan biet duoc.
  assert.match(smokeTest, /LIVE_AI_INTENT_MISMATCH/);
  assert.match(smokeTest, /LIVE_AI_PROVIDER_UNAVAILABLE/);
  assert.match(smokeTest, /LIVE_AI_TIMEOUT/);
});

test('hop dong tat dinh khong goi mot duong nao cua model', () => {
  // Bo chu thich truoc khi kiem: chinh phan mo dau cua tep giai thich VI SAO no ton tai, nen no
  // co nhac `demo/simulate` va `dat_don` — mot phep kiem tren van ban tho se do vi mot cau van.
  const code = deterministicSmoke.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /demo\/simulate/);
  assert.doesNotMatch(code, /dat_don/);
  assert.doesNotMatch(code, /\bintent\b/i);
  // Cong thu hep theo NANG LUC, va khong doc duoc goi khach thi doi DAY DU.
  assert.match(deterministicSmoke, /capabilities === null \|\| capabilities\.includes/);
});

test('deploy-remote.sh phat danh tinh release TRUOC khi stack len', () => {
  const metaIndex = deployRemote.indexOf('"layer":"meta"');
  const stackIndex = deployRemote.indexOf('deploy-stack.sh"');
  assert.ok(metaIndex >= 0 && metaIndex < stackIndex, 'meta phai duoc phat truoc deploy-stack.sh');
});

test('deploy-ci.sh chep so nhat ky va VAN do khi lan deploy chua duoc chung minh', () => {
  assert.match(deployCi, /tee "\$\{DEPLOY_SIGNAL_LOG\}"/);
  assert.match(deployCi, /report-deploy-signals\.mjs/);
  assert.match(deployCi, /remote_status="\$\{PIPESTATUS\[0\]\}"/);
  // KHONG XANH GIA: cong nam o `hardFailure`, khong o ma thoat cua ssh.
  assert.match(deployCi, /hard_failure/);
  assert.match(deployCi, /if \[\[ "\$\{hard_failure\}" != 'false' \]\]; then/);
});

test('workflow tach buoc LIVE AI ra khoi buoc rollout, va khong nuot ket qua cua no', () => {
  assert.match(reusableWorkflow, /id: rollout/);
  assert.match(reusableWorkflow, /- name: LIVE AI SMOKE/);
  assert.match(reusableWorkflow, /result\.liveAiSmoke/);
  assert.match(reusableWorkflow, /deploy-signals\.json/);
  // `continue-on-error` bien mot tin hieu thanh mot dong log khong ai doc — cam o day.
  assert.doesNotMatch(reusableWorkflow, /continue-on-error/);
  // Duong dan cua khach phai in ra KE CA khi live AI do: ung dung da len va dang khoe.
  assert.match(reusableWorkflow, /!cancelled\(\) && steps\.rollout\.outcome == 'success'/);
});
