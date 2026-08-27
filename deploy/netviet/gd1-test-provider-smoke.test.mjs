import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  collectGd1TestPreflight,
  hashZaloGroupId,
  remoteProviderSmokeCommand,
} from './gd1-test-preflight.mjs';

/**
 * CONG PROVIDER SMOKE PHAI THAT SU CHAY, KHONG CHI "TRONG GIONG NHU CHAY".
 *
 * Cong nay tung im lang khong lam gi: chuoi lenh sinh ra bi noi bang DAU CACH nen
 * `set -euo pipefail cd '<appDir>' docker compose ...` gop thanh DUNG MOT lenh `set` —
 * `cd` va `docker` chi con la tham so vi tri cua `set`, khong bao gio duoc thuc thi.
 * Hau qua hai chieu, va chieu nguy hiem hon la chieu XANH:
 *   - `smoke-test.mjs` khong co trong CWD dang nhap -> chuyen huong hong -> thoat 1 -> chan deploy
 *     voi mot ly do SAI ("provider khong khoe" trong khi provider chua he duoc hoi).
 *   - `smoke-test.mjs` tinh co co trong CWD        -> `set` thoat 0 -> cong BAO PASS ma khong
 *     mot byte nao di den provider. Mot cong chung minh rong.
 *
 * Vi vay bai kiem tra o day KHONG doc chuoi lenh bang regex — doc chuoi khong phan biet duoc hai
 * chieu tren. No CHAY chuoi do bang bash that, voi `docker`/`sudo` gia, roi hoi mot cau duy nhat:
 * `docker compose` co that su duoc goi khong.
 */

const APP_DIR = 'zalo-ultty-gd1-test';
const HOSTNAME = 'ultty-gd1-test.203-0-113-10.sslip.io';

function withSmokeHarness(run) {
  const sandbox = mkdtempSync(join(tmpdir(), 'provider-smoke-'));
  try {
    // CWD luc dang nhap SSH — KHONG phai appDir. `cd` phai that su chay thi docker moi thay
    // compose.yaml. Dat `smoke-test.mjs` o CA HAI noi la co y: no lam chieu XANH GIA cua loi cu
    // tro thanh kha thi, nen bai test bat duoc ca chieu do chu khong chi chieu do.
    const home = join(sandbox, 'home');
    const appDir = join(sandbox, APP_DIR);
    for (const dir of [home, appDir]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'smoke-test.mjs'), "console.log('fixture');\n", 'utf8');
    }

    const dockerLog = join(sandbox, 'docker-invocations.log');
    const bashEnv = join(sandbox, 'stubs.sh');
    writeFileSync(
      bashEnv,
      [
        // `sudo -n` gia: bo cac co roi chay tiep, de lenh that ben trong van duoc thuc thi.
        'sudo() { while [ "$1" = "-n" ]; do shift; done; "$@"; }',
        // `docker` gia: ghi lai DUNG nhung gi no duoc goi, roi tra ma thoat theo kich ban.
        'docker() { printf "%s\n" "$*" >> "$DOCKER_LOG"; return "${DOCKER_EXIT:-0}"; }',
        'export -f sudo docker',
      ].join('\n') + '\n',
      'utf8',
    );

    return run({
      appDir,
      execute: ({ dockerExit = '0' } = {}) => {
        const command = remoteProviderSmokeCommand(appDir, HOSTNAME);
        const result = spawnSync('bash', ['-c', command], {
          encoding: 'utf8',
          cwd: home,
          env: {
            ...process.env,
            BASH_ENV: bashEnv,
            DOCKER_LOG: dockerLog,
            DOCKER_EXIT: dockerExit,
          },
        });
        return {
          status: result.status,
          stderr: result.stderr ?? '',
          dockerInvocations: existsSync(dockerLog) ? readFileSync(dockerLog, 'utf8') : '',
        };
      },
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

test('provider smoke that su goi docker compose tren VM, khong dung lai o mot lenh set', () => {
  withSmokeHarness(({ execute }) => {
    const { status, dockerInvocations, stderr } = execute();

    assert.notEqual(
      dockerInvocations,
      '',
      `cong provider smoke khong he goi docker — no khong chung minh gi ca. stderr: ${stderr}`,
    );
    assert.match(dockerInvocations, /(^|\n)compose /, 'phai goi `docker compose`');
    assert.match(dockerInvocations, /--profile tools run --rm --no-deps/);
    assert.match(dockerInvocations, /bootstrap node --input-type=module/);
    assert.equal(status, 0, `smoke thanh cong phai thoat 0. stderr: ${stderr}`);
  });
});

test('provider smoke chay TRONG appDir, vi compose.yaml chi ton tai o do', () => {
  withSmokeHarness(({ appDir, execute }) => {
    const { dockerInvocations } = execute();

    // `--env-file .runtime/secrets.env` va `-f compose.yaml` deu la duong dan TUONG DOI: neu `cd`
    // khong chay thi docker se doc nham thu muc dang nhap.
    assert.match(dockerInvocations, /--env-file \.runtime\/secrets\.env/);
    assert.match(dockerInvocations, /-f compose\.yaml/);
    assert.ok(existsSync(join(appDir, 'smoke-test.mjs')));
  });
});

test('FAIL-CLOSED: docker that bai thi lenh phai thoat khac 0, khong duoc bao xanh', () => {
  withSmokeHarness(({ execute }) => {
    const { status, dockerInvocations } = execute({ dockerExit: '17' });

    assert.notEqual(dockerInvocations, '', 'docker van phai duoc goi');
    assert.notEqual(
      status,
      0,
      'provider smoke hong ma thoat 0 la mot cong xanh gia — dung thu bi cam o day',
    );
  });
});

test('provider smoke mang dung ngu canh runtime: base URL cua tenant va kenh da xac thuc', () => {
  withSmokeHarness(({ execute }) => {
    const { dockerInvocations } = execute();

    assert.match(dockerInvocations, new RegExp(`PILOT_BASE_URL=https://${HOSTNAME}`));
    assert.match(dockerInvocations, /CHANNEL_MODE=zca/);
  });
});

/**
 * HAI THAT BAI KHAC NHAU VE BAN CHAT, TRUOC DAY BAO CAO GIONG HET NHAU.
 *
 * `safeRun` bat loi roi VUT BO no, nen ca hai truong hop deu chi hien ra dung mot cau
 * "parser provider proof healthPassed must be true". Nguoi truc doc cau do se di kiem tra
 * DeepSeek — trong khi su that co the la probe cua chinh chung ta khong chay noi. Ngay
 * 26/08/2026 dieu do da lam mat hai vong deploy.
 *
 * Mot cong nghiep vu co N duong tu choi thi phai phan biet duoc N ly do (rule ECC code-review).
 */

const LIVE_AI_SIGNAL =
  '##DEPLOY-SIGNAL## {"layer":"liveAiSmoke","status":"fail","reason":"LIVE_AI_FIXTURE_MISMATCH"}';

function collectorHarness({ smokeBehaviour }) {
  const rawGroups = ['5418371951945064288', '6732452832330077759'];
  const env = {
    TENANT: 'ultty',
    ENVIRONMENT: 'gd1-test',
    GCP_PROJECT_ID: 'example',
    GCP_REGION: 'asia-southeast1',
    GCP_ZONE: 'asia-southeast1-b',
    VM_NAME: 'netviet',
    GIT_SHA: 'a'.repeat(40),
    GITHUB_REF: 'refs/heads/main',
    GD1_TEST_TARGET_CONFIRMED: '1',
    GD1_TEST_CI_CONCLUSION: 'success',
    GD1_TEST_APPROVED_GROUP_HASHES: rawGroups.map(hashZaloGroupId).join(','),
  };
  const run = async (_program, args) => {
    const commandText = args.join(' ');
    if (commandText.includes('addresses describe')) return '203.0.113.10\n';
    if (commandText.includes('.runtime/secrets.env') && commandText.includes('test -f')) {
      return '__NETVIET_STACK_STATE__=present\n';
    }
    if (commandText.includes('exec -T api node')) {
      return [
        'PERSISTENCE=prisma',
        'CHANNEL_MODE=zca',
        'PARSER_MODE=deepseek',
        'MEDIA_STORE=gcs',
        'AUTH_MODE=session',
        'AUTO_SEND=off',
        'DATA_CLASSIFICATION=test',
      ].join('\n');
    }
    if (commandText.includes('zalo-allowed-groups.json')) {
      return rawGroups.map(hashZaloGroupId).join('\n');
    }
    if (commandText.includes('zalo-cred.json')) return 'regular file|600|512\n';
    if (commandText.includes('runtime_value APP_IMAGE')) return `${digestFixture('d')}\n`;
    if (commandText.includes('runtime_value FLOWISE_IMAGE')) return `${digestFixture('e')}\n`;
    if (commandText.includes('secrets versions access')) {
      return Array.from({ length: 13 }, (_, index) => `${index}|nonempty|0|0`).join('\n') + '\n';
    }
    if (commandText.includes('smoke-test.mjs')) return smokeBehaviour();
    throw new Error(`unexpected command: ${commandText}`);
  };
  return { env, run };
}

const digestFixture = (character) =>
  `asia-southeast1-docker.pkg.dev/example/netviet/app@sha256:${character.repeat(64)}`;

function smokeExitError(stdout) {
  const error = new Error('Command failed: gcloud compute ssh');
  error.stdout = stdout;
  error.stderr = '';
  return error;
}

test('probe khong chay duoc thi bao PROVIDER_SMOKE_HARNESS_ERROR, khong do loi cho provider', async () => {
  const { env, run } = collectorHarness({
    smokeBehaviour: () => {
      // Khong mot tin hieu nao duoc phat ra: container chua kip chay, hoac lenh sai cu phap.
      throw smokeExitError('');
    },
  });

  const result = await collectGd1TestPreflight({ env, run });
  const report = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(report, /PROVIDER_SMOKE_HARNESS_ERROR/);
  assert.doesNotMatch(report, /PROVIDER_FIXTURE_MISMATCH/);
});

test('provider tra loi sai fixture thi bao PROVIDER_FIXTURE_MISMATCH — day moi la loi cua model', async () => {
  const { env, run } = collectorHarness({
    smokeBehaviour: () => {
      // Smoke DA chay den noi den chon va DA phat tin hieu, roi thoat khac 0 vi model doan sai.
      throw smokeExitError(`${LIVE_AI_SIGNAL}\n`);
    },
  });

  const result = await collectGd1TestPreflight({ env, run });
  const report = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(report, /PROVIDER_FIXTURE_MISMATCH/);
  assert.doesNotMatch(report, /PROVIDER_SMOKE_HARNESS_ERROR/);
});
