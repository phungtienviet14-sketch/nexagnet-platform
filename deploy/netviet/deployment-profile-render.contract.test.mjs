import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeRuntimeContract, DEPLOYMENT_PROFILES } from './deployment-profiles.mjs';

/**
 * HO SO TRIEN KHAI, DO TREN DUONG THAT — khong phai tren mot ham phu tro.
 *
 * `deployment-profiles.contract.test.mjs` chung minh danh muc SUY RA dung hop dong bi mat. Bai do
 * mot minh no khong tra loi duoc cau hoi cua #192 §3: "ban trien khai THAT co chay duoc mot ho so
 * khong Flowise / khong LLM / khong kenh khong?" — vi truoc ban nay cau tra loi la KHONG, va no
 * KHONG bat nguon tu hop dong bi mat ma tu ba cho khac:
 *
 *   C1  `compose.yaml`      — `api.depends_on.flowise: service_healthy`, ma `flowise` khong mang
 *                             `profiles:` => Flowise luon phai len truoc `api`;
 *   C2  `render-secrets.sh` — 13 loi goi `secret` VO DIEU KIEN, ke ca `deepseek-api-key`;
 *   C3  `render-secrets.sh` — nhanh gd1-test ghim `TENANT_SLUG == 'ultty'`.
 *
 * Nen bai nay CHAY THAT `render-secrets.sh` voi `gcloud` duoc thay bang mot ban ghi nhat ky ten
 * secret, roi doc lai `secrets.env` va manh cau hinh Caddy ma no de lai. Do chinh xac cai ma tang
 * VM se lam. Khong mot gia tri bi mat that nao duoc doc: stub tra ve mot chuoi tong hop, va bai
 * test chi khang dinh tren TEN.
 */

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_IP = '203.0.113.10';

/** `gcloud` gia: ghi lai ten secret duoc hoi roi tra ve mot gia tri tong hop. */
const GCLOUD_STUB = String.raw`flock() { return 0; }
chown() { return 0; }
# "install -d -m ..." va "chown" la hai lenh CUA HE DIEU HANH, khong phai cua ho so trien khai.
# Quyen tep co bo test rieng (workflow-isolation, observability-isolation); cai bai nay do la TEN
# bi mat va NOI DUNG duoc render. Thay chung bang mot ban tao thu muc thuan tuy de bai test cho ra
# cung mot ket qua tren moi may, thay vi xanh tren Linux va do tren NTFS.
install() {
  local target=""
  for arg in "$@"; do target="$arg"; done
  mkdir -p "$target"
}
gcloud() {
  local wanted=''
  local previous=''
  for arg in "$@"; do
    if [[ "$previous" == '--secret' ]]; then wanted="$arg"; fi
    previous="$arg"
  done
  if [[ -n "$wanted" ]]; then
    printf '%s\n' "$wanted" >>"$HARNESS_SECRET_LOG"
    printf '%s\n' "stub-value-for-$wanted"
    return 0
  fi
  return 0
}
`;

function renderWithProfile({
  profileId,
  tenant,
  stackSlug,
  environment,
  seedEdgeAcmeEmail = true,
}) {
  const scratch = mkdtempSync(join(tmpdir(), 'render-profile-'));
  try {
    const appDir = join(scratch, 'app');
    const edgeDir = join(scratch, 'edge');
    mkdirSync(join(appDir, 'observability'), { recursive: true });
    mkdirSync(join(edgeDir, '.runtime'), { recursive: true });

    // Duong THAT, khong phai mot ban chep rut gon: bai test phai do chinh tep se chay tren VM.
    copyFileSync(join(here, 'render-secrets.sh'), join(appDir, 'render-secrets.sh'));
    copyFileSync(join(here, 'channel-mode.sh'), join(appDir, 'channel-mode.sh'));
    chmodSync(join(appDir, 'channel-mode.sh'), 0o755);
    // Trinh sinh cau hinh collector thuoc mot mien KHAC (kho quan sat) va co bo test rieng; o day
    // no chi can ton tai de `render-secrets.sh` chay het.
    const otel = join(appDir, 'observability', 'render-otel-collector.sh');
    writeFileSync(otel, '#!/bin/bash\nprintf "stub\\n" >"$2"\n', 'utf8');
    chmodSync(otel, 0o755);

    // Edge DUNG CHUNG da co ACME email cua khach di truoc — day la trang thai that tren VM.
    if (seedEdgeAcmeEmail) {
      writeFileSync(
        join(edgeDir, '.runtime', 'caddy.env'),
        'ACME_EMAIL=someone@example.test\n',
        'utf8',
      );
    }

    const secretLog = join(scratch, 'secret-names.log');
    writeFileSync(secretLog, '', 'utf8');
    const bashEnvironment = join(scratch, 'harness-env.sh');
    writeFileSync(bashEnvironment, GCLOUD_STUB, 'utf8');

    const contract = profileId ? describeRuntimeContract(DEPLOYMENT_PROFILES[profileId]) : {};
    const run = spawnSync('bash', [join(appDir, 'render-secrets.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BASH_ENV: bashEnvironment,
        HARNESS_SECRET_LOG: secretLog,
        APP_DIR: appDir,
        EDGE_DIR: edgeDir,
        APP_IMAGE: 'registry.example/app@sha256:aaaa',
        FLOWISE_IMAGE: 'registry.example/flowise@sha256:bbbb',
        PUBLIC_IP,
        TENANT_SLUG: tenant,
        STACK_SLUG: stackSlug,
        DEPLOYMENT_ENVIRONMENT: environment,
        GCP_PROJECT_ID: 'example',
        BACKUP_BUCKET: 'gs://example-backups',
        DEPLOYMENT_PROFILE: profileId ?? '',
        ...contract,
      },
    });

    const runtimeEnvPath = join(appDir, '.runtime', 'secrets.env');
    const sitePath = join(edgeDir, 'tenants', `${stackSlug}.caddy`);
    return {
      status: run.status,
      stderr: run.stderr ?? '',
      secretNames: readFileSync(secretLog, 'utf8').split('\n').filter(Boolean),
      runtimeEnv: existsSync(runtimeEnvPath) ? readFileSync(runtimeEnvPath, 'utf8') : '',
      caddySite: existsSync(sitePath) ? readFileSync(sitePath, 'utf8') : '',
      acmeEnv: existsSync(join(edgeDir, '.runtime', 'caddy.env'))
        ? readFileSync(join(edgeDir, '.runtime', 'caddy.env'), 'utf8')
        : '',
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Doc mot khoa tu noi dung `secrets.env` — cung phep doc ma `deploy-stack.sh` dung. */
function runtimeValue(content, key) {
  const matches = [...content.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))];
  return matches.length > 0 ? matches[matches.length - 1][1] : undefined;
}

// --- 1. ULTTY KHONG DOI MOT LY -----------------------------------------------------------------

test('RENDER THAT: ho so Ultty van doi dung 13 bi mat va van ghim zca/deepseek/off/test', () => {
  const result = renderWithProfile({
    profileId: 'ultty-gd1-test',
    tenant: 'ultty',
    stackSlug: 'ultty-gd1-test',
    environment: 'gd1-test',
  });

  assert.equal(result.status, 0, result.stderr);
  const required = result.secretNames.filter((name) => name.startsWith('zalo-ultty-gd1-test-'));
  for (const suffix of [
    'postgres-admin-password',
    'zalo-db-password',
    'api-key',
    'operator-password',
    'flowise-db-password',
    'flowise-secretkey',
    'flowise-admin-email',
    'flowise-admin-password',
    'flowise-jwt-secret',
    'flowise-refresh-secret',
    'flowise-session-secret',
    'flowise-token-hash-secret',
    'deepseek-api-key',
  ]) {
    assert.ok(
      required.includes(`zalo-ultty-gd1-test-${suffix}`),
      `ho so Ultty phai van doc ${suffix} — day la hop dong hoi quy, khong phai vat lieu don dep`,
    );
  }

  assert.equal(runtimeValue(result.runtimeEnv, 'CHANNEL_MODE'), 'zca');
  assert.equal(runtimeValue(result.runtimeEnv, 'PARSER_MODE'), 'deepseek');
  assert.equal(runtimeValue(result.runtimeEnv, 'AUTO_SEND'), 'off');
  assert.equal(runtimeValue(result.runtimeEnv, 'DATA_CLASSIFICATION'), 'test');
  assert.equal(runtimeValue(result.runtimeEnv, 'ADVICE_COMPOSER'), 'deepseek');
  assert.equal(runtimeValue(result.runtimeEnv, 'FLOWISE_ENABLED'), 'on');
  // Route Flowise van duoc phat — khach nay that su chay Flowise.
  assert.match(result.caddySite, /flowise-ultty-gd1-test\.203-0-113-10\.sslip\.io/);
  assert.match(result.caddySite, /reverse_proxy flowise-ultty-gd1-test:3000/);
});

// --- 2. HO SO XEM TRUOC: BON TEN, VA KHONG MOT TEN NAO KHAC ------------------------------------

test('RENDER THAT: ho so khong Flowise / khong LLM chi doc DUNG bon bi mat nen tang', () => {
  const result = renderWithProfile({
    profileId: 'transport-preview-gd1-test',
    tenant: 'transport-preview',
    stackSlug: 'transport-preview-gd1-test',
    environment: 'gd1-test',
  });

  assert.equal(result.status, 0, result.stderr);

  const prefix = 'zalo-transport-preview-gd1-test-';
  // BAT BUOC: dung bon ten nen tang.
  const mandatory = result.secretNames.filter((name) =>
    [
      `${prefix}postgres-admin-password`,
      `${prefix}zalo-db-password`,
      `${prefix}api-key`,
      `${prefix}operator-password`,
    ].includes(name),
  );
  assert.equal(new Set(mandatory).size, 4, `chi thay: ${[...new Set(mandatory)].join(', ')}`);

  // CAM: khong mot ten Flowise/DeepSeek nao duoc hoi — day la ca diem cua #192 §4/§5. `secret()`
  // (khac `optional_secret`) lam ca lan deploy chet neu ten do chua ton tai, nen mot loi goi sot
  // lai o day dong nghia voi "phai tao mot bi mat cho mot he thong con khong chay".
  for (const forbidden of result.secretNames) {
    assert.doesNotMatch(
      forbidden,
      /flowise|deepseek/,
      `ho so xem truoc khong duoc hoi bi mat ${forbidden}`,
    );
  }

  // KHONG mot ten nao ngoai tien to cua chinh stack nay: cach ly o tang bi mat.
  for (const name of result.secretNames) {
    assert.ok(name.startsWith(prefix), `ten ${name} khong thuoc stack xem truoc`);
  }

  assert.equal(runtimeValue(result.runtimeEnv, 'FLOWISE_ENABLED'), 'off');
  assert.equal(runtimeValue(result.runtimeEnv, 'CHANNEL_MODE'), 'mock');
  assert.equal(runtimeValue(result.runtimeEnv, 'AUTO_SEND'), 'off');
  assert.equal(runtimeValue(result.runtimeEnv, 'DATA_CLASSIFICATION'), 'test');
  assert.equal(runtimeValue(result.runtimeEnv, 'ADVICE_COMPOSER'), 'off');
  assert.equal(runtimeValue(result.runtimeEnv, 'DEEPSEEK_API_KEY'), '');
  assert.equal(runtimeValue(result.runtimeEnv, 'FLOWISE_DB_PASSWORD'), '');

  // KHONG phat route Flowise: mot hostname cong khai tro toi mot service khong ton tai van lam
  // Caddy di xin chung chi ACME cho no.
  assert.doesNotMatch(result.caddySite, /reverse_proxy flowise-/);
  // Nhung hai route ung dung thi PHAI co — day moi la ban xem truoc.
  assert.match(result.caddySite, /operator-transport-preview-gd1-test\.203-0-113-10\.sslip\.io/);
  assert.match(result.caddySite, /demo-transport-preview-gd1-test\.203-0-113-10\.sslip\.io/);
});

// --- 3. EDGE DUNG CHUNG KHONG BI MOT HO SO KHONG-FLOWISE LAM HONG ------------------------------

test('RENDER THAT: ho so khong Flowise GIU NGUYEN ACME_EMAIL cua edge dung chung', () => {
  const result = renderWithProfile({
    profileId: 'transport-preview-gd1-test',
    tenant: 'transport-preview',
    stackSlug: 'transport-preview-gd1-test',
    environment: 'gd1-test',
  });

  assert.equal(result.status, 0, result.stderr);
  // Ghi de bang chuoi rong se lam `email {$ACME_EMAIL}` con ZERO tham so => Caddyfile khong parse
  // duoc => `caddy reload` that bai => duong lui la force-recreate, tuc rung het network
  // attachment va MOI khach tra 502 cung luc (da xay ra 21/08/2026 voi ca bon stack).
  assert.match(result.acmeEnv, /ACME_EMAIL=someone@example\.test/);
});

test('RENDER THAT: edge chua co ACME_EMAIL thi DUNG HAN, khong doan mot dia chi', () => {
  const result = renderWithProfile({
    profileId: 'transport-preview-gd1-test',
    tenant: 'transport-preview',
    stackSlug: 'transport-preview-gd1-test',
    environment: 'gd1-test',
    seedEdgeAcmeEmail: false,
  });

  assert.equal(result.status, 78);
  assert.match(result.stderr, /ACME_EMAIL/);
});

// --- 4. CONG TENANT VAN CHAN, CHI KHAC NEO ----------------------------------------------------

test('RENDER THAT: gd1-test tu choi mot tenant ma ho so khong phuc vu', () => {
  const result = renderWithProfile({
    profileId: 'ultty-gd1-test',
    tenant: 'wata',
    stackSlug: 'wata-gd1-test',
    environment: 'gd1-test',
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /khong duoc dang ky cho tenant 'wata'/);
});

test('RENDER THAT: gd1-test khong co ho so thi khong render gi ca', () => {
  const result = renderWithProfile({
    profileId: undefined,
    tenant: 'ultty',
    stackSlug: 'ultty-gd1-test',
    environment: 'gd1-test',
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /bat buoc co DEPLOYMENT_PROFILE/);
});

// --- 5. LOP PHU COMPOSE: RANG BUOC BIEN MAT CUNG SERVICE --------------------------------------

test('COMPOSE: ban goc khong con service flowise, va `api` khong con phu thuoc no', () => {
  const base = readFileSync(join(here, 'compose.yaml'), 'utf8');
  const overlay = readFileSync(join(here, 'compose.flowise.yaml'), 'utf8');

  // Trong ban goc khong co AI ten `flowise` de ma phu thuoc.
  assert.doesNotMatch(base, /^ {2}flowise:$/m);
  assert.doesNotMatch(base, /^ {2}flowise-volume-init:$/m);

  const apiBlock = base.slice(base.indexOf('\n  api:'), base.indexOf('\n  web:'));
  const apiDependsOn = apiBlock.slice(
    apiBlock.indexOf('depends_on:'),
    apiBlock.indexOf('env_file:'),
  );
  assert.match(apiDependsOn, /postgres:/);
  assert.doesNotMatch(apiDependsOn, /flowise:/);

  // Va lop phu dat lai DUNG rang buoc do — hop nhat theo anh xa nen dong `postgres` con nguyen.
  assert.match(overlay, /^ {2}flowise:$/m);
  assert.match(overlay, /^ {2}flowise-volume-init:$/m);
  /*
   * `\r?\n` chu khong phai `\n`: `.gitattributes` chi ghim `*.sh` va `Dockerfile` ve `eol=lf`, nen
   * mot ban checkout tren Windows (`core.autocrlf=true`) nhan `compose.flowise.yaml` duoi dang
   * CRLF — mot trang thai HOP LE ma bo test phai chiu duoc. Chi ky tu xuong dong VIET THANG trong
   * mau moi hong; `$` cua JS regex von da nhan ca `\r`. Phep khang dinh khong doi mot chut nao:
   * van la dung bon dong do, dung thu tu do, dung muc thut le do.
   */
  assert.match(
    overlay,
    /^ {2}api:\r?\n {4}depends_on:\r?\n {6}flowise:\r?\n {8}condition: service_healthy$/m,
  );
  assert.match(
    overlay,
    /^ {2}bootstrap:\r?\n {4}depends_on:\r?\n {6}flowise:\r?\n {8}condition: service_healthy$/m,
  );
  // Volume cua Flowise di cung service cua no; ban goc khong duoc khai mot volume mo coi.
  assert.match(overlay, /^ {2}flowise-data:$/m);
  assert.doesNotMatch(base, /^ {2}flowise-data:$/m);
});

test('DEPLOY-STACK: lop phu chi duoc keo vao khi ho so bat Flowise, va MAC DINH la on', () => {
  const stackCompose = readFileSync(join(here, 'stack-compose.sh'), 'utf8');
  const deployStack = readFileSync(join(here, 'deploy-stack.sh'), 'utf8');

  assert.match(stackCompose, /NETVIET_COMPOSE_FILES\+=\(-f compose\.flowise\.yaml\)/);
  // Mat dong `FLOWISE_ENABLED` (secrets.env render truoc ban nay) => `on` => hanh vi cu. Doan
  // nguoc lai se lam mot stack dang chay mat mot service.
  assert.match(stackCompose, /NETVIET_FLOWISE_ENABLED='on'/);
  // Va ba tang tren VM deu doc CUNG mot phep suy ra, khong ai tu viet lai.
  for (const script of ['deploy-stack.sh', 'backup.sh', 'health-check.sh']) {
    const source = readFileSync(join(here, script), 'utf8');
    assert.match(
      source,
      /source "\$\{APP_DIR\}\/stack-compose\.sh"/,
      `${script} phai dung chung phep suy ra thanh phan stack`,
    );
  }
  // Buoc dung Flowise len va bootstrap no deu nam sau cong.
  assert.match(
    deployStack,
    /if \[\[ "\$\{flowise_enabled\}" == 'on' \]\]; then\n {2}stage rollout ROLLOUT_FLOWISE_NOT_READY/,
  );
});

// --- 6. CSDL: MOT HE THONG CON KHONG DUOC CHAN LOP LUU TRU NEN TANG ---------------------------

test('POSTGRES: vai flowise chi duoc tao khi co mat khau, va `zalo` khong phu thuoc no', () => {
  const initDatabases = readFileSync(join(here, 'postgres', 'init-databases.sh'), 'utf8');
  const syncPasswords = readFileSync(join(here, 'postgres', 'sync-passwords.sh'), 'utf8');

  for (const [name, source] of [
    ['init-databases.sh', initDatabases],
    ['sync-passwords.sh', syncPasswords],
  ]) {
    // `:?` tren FLOWISE_DB_PASSWORD lam ca stack khong khoi tao noi PostgreSQL cua chinh no.
    assert.doesNotMatch(
      source,
      /FLOWISE_DB_PASSWORD:\?/,
      `${name}: mat khau Flowise khong duoc la dieu kien de PostgreSQL cua stack len`,
    );
    assert.match(source, /if \[ -n "\$\{FLOWISE_DB_PASSWORD:-\}" \]; then/, name);
    // Vai `zalo` — lop luu tru nen tang — van bat buoc.
    assert.match(source, /ZALO_DB_PASSWORD:\?/, name);
  }
});
