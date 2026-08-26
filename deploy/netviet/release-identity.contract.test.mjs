import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateDeploySignals, parseSignalJournal } from './deploy-signals.mjs';

/**
 * DUONG DI CUA DANH TINH RELEASE, tu tang deploy toi TIEN TRINH.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO TEP NAY TON TAI (26/08/2026):
 *
 * Tren `ultty-gd1-test`, `RELEASE_MANIFEST_PATH` RONG. `release.json` duoc ghi ra dia nhung chua
 * bao gio toi container, nen tien trinh phai lui ve `RELEASE_GIT_SHA` — mot du phong dung duoc
 * cho permalink, nhung khong phai nguon canonical.
 *
 * MOT BIEN "co trong secrets.env" KHONG CO NGHIA LA NO TOI DUOC TIEN TRINH. `compose.yaml` liet ke
 * bien TUONG MINH cho tung service; thieu o do thi bien khong bao gio den noi, va no hong IM LANG.
 * Da xay ra hai lan: `ADVICE_COMPOSER` (19/08 -> 21/08) va `DEPLOYMENT_ENVIRONMENT`.
 *
 * `secrets-passthrough.contract.test.mjs` bat "render ra ma khong ai dung". Tep nay hoi cau nguoc
 * lai va cu the hon: DICH VU NAO nhan bien nao, va cai gi chung minh no da toi noi luc CHAY.
 *
 * KHONG dung `compose.includes('PARSER_MODE')` lam bang chung: chuoi do co mat o mot service khac
 * cung lam bai xanh. O day compose duoc BOC TACH thanh so do dich vu -> moi truong -> mount.
 *
 * NEN TANG, KHONG PHAI CUA MOT KHACH: khong duoc nhac ten khach nao trong tep nay.
 * ---------------------------------------------------------------------------------------------
 */

const here = dirname(fileURLToPath(import.meta.url));
// `core.autocrlf=true` cho ban lam viec tren Windows ket thuc dong bang CRLF, trong khi CI
// (ubuntu-24.04) va kho git deu la LF. Chuan hoa o day de mot bai do khong con nghia la "tep sai"
// ma chi la "may khac".
const read = (name) => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n');

const compose = read('compose.yaml');
const deployRemote = read('deploy-remote.sh');
const deployStack = read('deploy-stack.sh');
const smokeTest = read('smoke-test.mjs');
const deterministicSmoke = read('deterministic-smoke.mjs');

const EXPECTED_SHA = '1'.repeat(40);
const MISMATCHED_SHA = '2'.repeat(40);

function withReleaseMismatchHarness(body) {
  const scratch = mkdtempSync(join(tmpdir(), 'release-mismatch-'));
  try {
    const runtime = join(scratch, '.runtime');
    const postgres = join(scratch, 'postgres');
    mkdirSync(runtime, { recursive: true });
    mkdirSync(postgres, { recursive: true });
    writeFileSync(
      join(runtime, 'secrets.env'),
      [
        'DEMO_DOMAIN=demo.example.test',
        'OPERATOR_DOMAIN=operator.example.test',
        'FLOWISE_DOMAIN=flowise.example.test',
        'APP_IMAGE=registry.example/app@sha256:aaaa',
        'FLOWISE_IMAGE=registry.example/flowise@sha256:bbbb',
        `RELEASE_GIT_SHA=${EXPECTED_SHA}`,
        'WORKFLOW_ENGINE=off',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(join(runtime, 'channel-mode.env'), 'CHANNEL_MODE=mock\n', 'utf8');
    writeFileSync(join(postgres, 'sync-passwords.sh'), '#!/bin/bash\n', 'utf8');

    const channelMode = join(scratch, 'channel-mode.sh');
    writeFileSync(channelMode, '#!/bin/bash\nprintf "mock\\n"\n', 'utf8');
    chmodSync(channelMode, 0o755);

    const bashEnvironment = join(scratch, 'harness-env.sh');
    writeFileSync(
      bashEnvironment,
      String.raw`flock() { return 0; }
docker() {
  local args="$*"
  if [[ "$1" == "compose" ]]; then
    case "$args" in
      *" exec -T api printenv RELEASE_GIT_SHA"*) printf '%s\n' "$HARNESS_EXPECTED_SHA" ;;
      *" exec -T api printenv RELEASE_MANIFEST_PATH"*) printf '%s\n' '/runtime/release.json' ;;
      *" exec -T api node -e "*) printf '%s\n' "$HARNESS_MANIFEST_SHA" ;;
      *" ps -q "*) printf '%s\n' 'harness-container' ;;
    esac
    return 0
  fi
  if [[ "$1" == "image" && "$2" == "inspect" ]]; then
    printf '%s\n' 'sha256:harness-image'
    return 0
  fi
  if [[ "$1" == "inspect" ]]; then
    printf '%s\n' 'sha256:harness-image'
    return 0
  fi
  return 0
}
`,
      'utf8',
    );

    return body({ scratch, bashEnvironment });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Duong dan manifest BEN TRONG container. Khong phai duong dan tren host — do la mot khac biet
 * quan trong: mot host path chi dung duoc tren mot VM thi khong len duoc khach thu hai.
 */
const MANIFEST_IN_CONTAINER = '/runtime/release.json';

/**
 * Boc tach `compose.yaml` thanh so do dich vu -> { environment, volumes }.
 *
 * Bo phan tich theo THUT LE, du cho dung khuon cua tep nay (2 dau cach cho dich vu, 4 cho khoi,
 * 6 cho phan tu). Doi la mot bo phan tich YAML day du thi phai them phu thuoc chi de doc mot tep
 * ma repo tu viet ra — khong dang.
 */
function parseComposeServices(yaml) {
  const services = {};
  let service = null;
  let block = null;
  let inServices = false;

  for (const line of yaml.split('\n')) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;
    // Mot khoa o cot 0 (vd `volumes:` o cuoi tep) ket thuc phan services.
    if (/^\S/.test(line)) break;

    const serviceMatch = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (serviceMatch) {
      service = serviceMatch[1];
      services[service] = { environment: {}, volumes: [] };
      block = null;
      continue;
    }
    if (!service) continue;

    const blockMatch = /^ {4}(environment|volumes):\s*$/.exec(line);
    if (blockMatch) {
      block = blockMatch[1];
      continue;
    }
    if (/^ {4}\S/.test(line)) {
      block = null;
      continue;
    }

    if (block === 'environment') {
      const entry = /^ {6}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
      if (entry) services[service].environment[entry[1]] = entry[2].trim();
    } else if (block === 'volumes') {
      const entry = /^ {6}- (.+)$/.exec(line);
      if (entry) services[service].volumes.push(entry[1].trim());
    }
  }
  return services;
}

const services = parseComposeServices(compose);

/**
 * Dich vu chay MA UNG DUNG va do do phai biet minh dang chay ban nao. `bootstrap` khong nam trong
 * danh sach: no la mot buoc cong cu mot lan, va bang chung ve ban phat hanh no bao cao phai HOI
 * API chu khong doc moi truong cua CHINH NO (hai nguon => hai su that).
 */
const RELEASE_AWARE_SERVICES = ['api', 'workflow-worker-v1', 'workflow-worker-sales-handoff-v1'];

test('so do compose boc tach duoc — neu khong thi moi khang dinh duoi day vo nghia', () => {
  for (const service of ['api', 'web', 'bootstrap', ...RELEASE_AWARE_SERVICES]) {
    assert.ok(services[service], `khong boc tach duoc service ${service} tu compose.yaml`);
  }
  assert.equal(services.api.environment.TENANT_DIR, '/srv/tenant');
});

// -------------------------------------------------------------- MANIFEST PHAI TOI DUOC TIEN TRINH

test('moi tien trinh mang danh tinh release deu duoc MOUNT manifest va duoc chi duong toi no', () => {
  for (const service of RELEASE_AWARE_SERVICES) {
    const { environment, volumes } = services[service];

    assert.equal(
      environment.RELEASE_MANIFEST_PATH,
      MANIFEST_IN_CONTAINER,
      `service ${service} thieu RELEASE_MANIFEST_PATH — danh tinh se lui ve du phong im lang`,
    );
    assert.ok(
      volumes.includes(`./.runtime/release.json:${MANIFEST_IN_CONTAINER}:ro`),
      `service ${service} khong mount release.json — bien tro toi mot tep khong ton tai`,
    );
  }
});

test('manifest duoc mount CHI DOC, va mount theo TEP chu khong theo thu muc', () => {
  for (const service of RELEASE_AWARE_SERVICES) {
    const mount = services[service].volumes.find((entry) => entry.includes('release.json'));
    assert.match(
      mount,
      /:ro$/,
      `${service}: manifest phai la :ro — tien trinh khong duoc ghi nguoc`,
    );
    // `./.runtime` chua `secrets.env`. Mount ca thu muc do vao mot tien trinh nghiep vu la dua
    // toan bo bi mat cua stack vao mot cho khong can chung.
    assert.doesNotMatch(
      mount,
      /^\.\/\.runtime:/,
      `${service}: khong duoc mount ca .runtime — trong do co secrets.env`,
    );
  }
});

test('bien neo release van toi du ca ba tien trinh (khong bi bo sot khi them worker)', () => {
  for (const service of RELEASE_AWARE_SERVICES) {
    for (const key of ['RELEASE_GIT_SHA', 'DEPLOYMENT_ENVIRONMENT', 'TENANT_DIR']) {
      assert.ok(
        services[service].environment[key] !== undefined,
        `service ${service} thieu ${key}`,
      );
    }
  }
});

// ------------------------------------------------------------------------------- KHONG DUOC CU

test('manifest duoc ghi TRUOC khi stack duoc dua len', () => {
  // Day la ca goc cua "release.json tung cu": ban cu ghi manifest SAU `deploy-stack.sh`, tuc sau
  // `docker compose up`. Container khoi dong truoc do se doc ban phat hanh TRUOC — hoac, neu tep
  // chua ton tai, Docker tao mot THU MUC trung ten va lan ghi ke tiep hong theo.
  const writeAt = deployRemote.indexOf('write-release-manifest.sh');
  const stackAt = deployRemote.indexOf('deploy-stack.sh"');

  assert.notEqual(writeAt, -1, 'deploy-remote.sh khong con goi write-release-manifest.sh');
  assert.notEqual(stackAt, -1, 'khong tim thay loi goi deploy-stack.sh');
  assert.ok(
    writeAt < stackAt,
    'manifest phai duoc ghi TRUOC deploy-stack.sh, neu khong container se doc ban cu',
  );
});

test('manifest chi duoc ghi MOT LAN moi lan deploy', () => {
  // Ghi lan hai SAU khi container da khoi dong la vo hinh voi no: bind-mount cua Docker neo vao
  // INODE, con `mv` tao inode moi — nen tien trinh se giu ban cu vinh vien. Cung cai bay da lam
  // Caddy chay cau hinh cu suot nam ngay (21/08/2026), va la ly do `rsync --inplace` o edge.
  const calls = deployRemote.match(/write-release-manifest\.sh/g) ?? [];

  assert.equal(calls.length, 1, `deploy-remote.sh goi trinh ghi manifest ${calls.length} lan`);
});

test('moc thoi gian trong manifest va trong bien moi truong la CUNG MOT gia tri', () => {
  // Hai lan goi `date` cach nhau ca mot lan deploy thi manifest va bien moi truong noi hai moc
  // khac nhau — va bat ky phep doi chieu nao giua chung cung tro nen vo nghia.
  assert.match(
    deployRemote,
    /release_deployed_at="\$\(date -u \+%Y-%m-%dT%H:%M:%SZ\)"/,
    'deploy-remote.sh phai chot moc thoi gian mot lan vao mot bien',
  );
  assert.match(
    deployRemote,
    /RELEASE_DEPLOYED_AT="\$release_deployed_at"/,
    'render-secrets.sh phai nhan dung moc thoi gian da chot',
  );
});

// -------------------------------------------------- CONG ROLLOUT DOC TU TIEN TRINH, KHONG TU DIA

test('cong ROLLOUT doi chieu manifest DOC TU TRONG CONTAINER', () => {
  // `sudo cat` tren host chi chung minh tep tren dia. Cau hoi that la "TIEN TRINH doc duoc gi",
  // va chi mot phep doc di qua `compose exec` moi tra loi duoc no.
  assert.match(
    deployStack,
    /exec -T api[\s\S]{0,200}RELEASE_MANIFEST_PATH/,
    'ROLLOUT phai doc manifest qua `compose exec api`, khong phai doc tep tren host',
  );
});

test('lech danh tinh co MA LY DO RIENG, khong gop vao mot loi chung', () => {
  // Ba duong tu choi cua cong ROLLOUT phai phan biet duoc: image sai, bien sai, manifest sai.
  for (const reason of [
    'RELEASE_DIGEST_MISMATCH',
    'RELEASE_SHA_MISMATCH',
    'RELEASE_IDENTITY_MISMATCH',
  ]) {
    assert.match(deployStack, new RegExp(reason), `thieu ma ly do ${reason}`);
  }
});

test('NEGATIVE CONTRACT: manifest lech env phat RELEASE_IDENTITY_MISMATCH va hard-fail rollout', () => {
  withReleaseMismatchHarness(({ scratch, bashEnvironment }) => {
    const run = spawnSync('bash', [join(here, 'deploy-stack.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        APP_DIR: scratch,
        EDGE_DIR: join(scratch, 'edge'),
        STACK_SLUG: 'tenant-x-gd1-test',
        TENANT_SLUG: 'tenant-x',
        BASH_ENV: bashEnvironment,
        HARNESS_EXPECTED_SHA: EXPECTED_SHA,
        HARNESS_MANIFEST_SHA: MISMATCHED_SHA,
      },
    });

    assert.notEqual(run.status, 0, 'mismatch phai lam deploy-stack thoat khac 0');
    const journal = parseSignalJournal(run.stdout);
    const result = evaluateDeploySignals({ entries: journal.entries, remoteExitCode: run.status });
    assert.equal(result.hardFailure, true);
    assert.equal(result.classification, 'ROLLOUT_FAILED');
    assert.equal(result.signals.rollout.reason, 'RELEASE_IDENTITY_MISMATCH');
    assert.match(run.stderr, new RegExp(MISMATCHED_SHA));
  });
});

test('runbook khong giu no manifest cu va dung zone cua deployment registry', () => {
  const repoRoot = join(here, '..', '..');
  const deploySignalsDoc = readFileSync(
    join(repoRoot, 'docs', 'phat-trien', 'van-hanh', 'tin-hieu-deploy.md'),
    'utf8',
  );
  const releaseIdentityDoc = readFileSync(
    join(repoRoot, 'docs', 'phat-trien', 'van-hanh', 'danh-tinh-release.md'),
    'utf8',
  );
  const targets = JSON.parse(
    readFileSync(join(repoRoot, '.github', 'deployment-targets.json'), 'utf8'),
  );
  const zone = targets.targets['current-shared-vm'].zone;

  assert.doesNotMatch(deploySignalsDoc, /RELEASE_MANIFEST_PATH` vẫn rỗng trên stack/i);
  assert.match(releaseIdentityDoc, new RegExp(`--zone ${zone}(?:\\s|$)`));
});

test('ROLLOUT doi manifest la CANONICAL tren stack, khong chap nhan du phong im lang', () => {
  assert.match(
    deployStack,
    /RELEASE_MANIFEST_MISSING/,
    'stack thieu manifest phai la mot ket qua co ten, khong phai mot buoc bi bo qua',
  );
});

// ---------------------------------------------------------- BANG CHUNG DOC TU TIEN TRINH THAT

test('bang chung live AI doc che do parser tu API, khong tu moi truong cua chinh no', () => {
  // `process.env.PARSER_MODE` trong container `bootstrap` LUON rong: khoi `environment` cua dich
  // vu do khong liet ke bien nay. Do la ly do `parserMode` trong bang chung deploy bang `null`.
  //
  // Cach sua KHONG phai la sao bien do sang mot service thu hai — luc do co hai nguon co the lech
  // nhau ma van bao "pass". Cach sua la HOI CHINH TIEN TRINH dang chay parser.
  // Khop dung DAU HIEU CUA LOI (`parserMode:` lay tu `process.env`) chu khong khop moi lan chuoi
  // `process.env.PARSER_MODE` xuat hien: khoi chu thich giai thich chinh cai bay nay co nhac ten
  // no, va mot bai do vi doc phai loi giai thich cua chinh minh la mot bai vo dung.
  assert.doesNotMatch(
    smokeTest,
    /parserMode:\s*process\.env/,
    'smoke doc moi truong cua CHINH NO — do la mot nguon thu hai, khong phai su that luc chay',
  );
  assert.match(smokeTest, /\/demo\/config/, 'smoke phai hoi API che do parser thuc su dang chay');
});

test('khong che do parser nao bi cam cung trong trinh bao cao', () => {
  for (const mode of ['deepseek', 'claude', 'flowise']) {
    assert.doesNotMatch(
      smokeTest,
      new RegExp(`parserMode[^\\n]*['"]${mode}['"]`),
      `trinh bao cao doan che do parser la ${mode} thay vi doc no`,
    );
  }
});

test('hop dong tat dinh kiem danh tinh release o CA HAI pha khoi dong lai', () => {
  // Sau `--force-recreate`, tien trinh moi phai doc lai dung manifest do. Mot phep kiem chi chay
  // truoc restart khong noi duoc gi ve tien trinh dang phuc vu sau do.
  assert.match(
    deterministicSmoke,
    /releaseIdentity|release-identity/i,
    'deterministic smoke phai co phep kiem danh tinh release',
  );
  assert.match(
    deterministicSmoke,
    /baseline\.releaseSha/,
    'danh tinh release phai nam trong baseline de pha post-restart doi chieu duoc',
  );
});

// -------------------------------------------------------------------------------------- DA KHACH

test('duong danh tinh khong cam mot duong dan host cua VM nao', () => {
  // Kiem tren SPEC MOUNT chu khong tren ca tep: mot loi giai thich trong chu thich duoc phep nhac
  // toi `/srv/netviet/...`, con mot mount thi khong — nguon mount phai tuong doi voi thu muc stack
  // de cung mot compose chay duoc cho khach thu hai tren mot VM khac.
  for (const service of RELEASE_AWARE_SERVICES) {
    const mount = services[service].volumes.find((entry) => entry.includes('release.json'));
    assert.match(mount, /^\.\//, `${service}: nguon mount phai tuong doi, dang la ${mount}`);
  }
});

test('danh tinh khong bam theo mot khach cu the — moi chieu deu la BIEN', () => {
  // `deploy/netviet` co mot mac dinh lich su mang ten khach dau tien (`TENANT_SLUG:-ultty`) va do
  // la chuyen cua tang khac. Cai duoc khoa o day hep hon va la thu milestone nay them vao: khong
  // mot chieu nao cua danh tinh release duoc suy ra tu mot ten khach viet cung.
  const writer = read('write-release-manifest.sh');
  for (const tenant of ['ultty', 'amico', 'wata']) {
    assert.doesNotMatch(
      writer,
      new RegExp(tenant, 'i'),
      `trinh ghi manifest nhac ten khach ${tenant}`,
    );
  }
  // Duong dan manifest la duong dan BEN TRONG container — no khong duoc mang slug nao.
  for (const service of RELEASE_AWARE_SERVICES) {
    assert.equal(services[service].environment.RELEASE_MANIFEST_PATH, MANIFEST_IN_CONTAINER);
  }
});
