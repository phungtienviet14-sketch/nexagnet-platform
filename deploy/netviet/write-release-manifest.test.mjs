import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * BAN GHI DANH TINH RELEASE — chay THAT cai script ghi no, khong suy luan tu doc ma nguon.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO TEP NAY TON TAI (26/08/2026):
 *
 * `release.json` TUNG CU. Ban cu cua `deploy-remote.sh` goi `write_release_json` SAU
 * `deploy-stack.sh`, tuc SAU `docker compose up` — nen tai thoi diem container khoi dong, tep tren
 * dia van dang giu ban phat hanh TRUOC. Chinh vi vay `render-secrets.sh` da chon "dung bien, khong
 * mount": mount mot tep chua ton tai thi Docker tao ra mot THU MUC trung ten.
 *
 * Sua thu tu roi noi "chac la xong" thi khong chung minh duoc gi. Tep nay chay dung cai script se
 * chay tren VM, tren mot thu muc that, va hoi ba cau ma mot lan doc ma nguon khong tra loi duoc:
 *
 *   1. Ghi de len mot manifest CU thi ban moi co thuc su thay the ban cu khong?
 *   2. Mot lan ghi HONG (SHA sai) co lam hong manifest dang co khong?
 *   3. Tep co doc duoc tu trong container khong, va no co sach khong?
 *
 * NEN TANG, KHONG PHAI CUA MOT KHACH: khong duoc nhac ten khach nao trong tep nay.
 * ---------------------------------------------------------------------------------------------
 */

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'write-release-manifest.sh');

/** SHA cua "ban truoc" va "ban dang deploy" — 40 ky tu, khac nhau tu ky tu dau. */
const OLD_SHA = '1111111111111111111111111111111111111111';
const NEW_SHA = '2222222222222222222222222222222222222222';

const BASE_ENV = Object.freeze({
  TENANT_SLUG: 'khach-x',
  DEPLOYMENT_ENVIRONMENT: 'gd1-test',
  STACK_SLUG: 'khach-x-gd1-test',
  DEPLOYMENT_TARGET_ID: 'khach-x/gd1-test',
  APP_IMAGE: 'registry.example/app@sha256:aaaa',
  FLOWISE_IMAGE: 'registry.example/flowise@sha256:bbbb',
  TENANT_SCHEMA_VERSION: '3',
  RELEASE_WORKFLOW_RUN_ID: '32941114989',
  RELEASE_DEPLOYED_AT: '2026-08-26T09:00:00Z',
});

function runWriter({ destination, env = {} }) {
  return spawnSync('bash', [script, destination], {
    encoding: 'utf8',
    env: { ...process.env, ...BASE_ENV, ...env },
  });
}

function withScratch(body) {
  const scratch = mkdtempSync(join(tmpdir(), 'release-manifest-'));
  try {
    return body(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test('ghi ra dung bo truong ma tang doc ky vong', () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');

    const result = runWriter({ destination, env: { RELEASE_GIT_SHA: NEW_SHA } });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), {
      tenant: 'khach-x',
      environment: 'gd1-test',
      stack: 'khach-x-gd1-test',
      target: 'khach-x/gd1-test',
      gitSha: NEW_SHA,
      appDigest: 'registry.example/app@sha256:aaaa',
      flowiseDigest: 'registry.example/flowise@sha256:bbbb',
      tenantSchemaVersion: 3,
      workflowRunId: '32941114989',
      deployedAt: '2026-08-26T09:00:00Z',
    });
  });
});

// ------------------------------------------------------------------------------ KHONG DUOC CU

test('manifest CU bi thay the hoan toan boi ban moi', () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');
    writeFileSync(destination, JSON.stringify({ gitSha: OLD_SHA, deployedAt: 'hom-qua' }));

    const result = runWriter({ destination, env: { RELEASE_GIT_SHA: NEW_SHA } });

    assert.equal(result.status, 0, result.stderr);
    const written = JSON.parse(readFileSync(destination, 'utf8'));
    assert.equal(written.gitSha, NEW_SHA);
    assert.notEqual(written.deployedAt, 'hom-qua');
  });
});

test('thay the la MOT BUOC: khong de lai tep tam nao trong thu muc', () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');

    runWriter({ destination, env: { RELEASE_GIT_SHA: NEW_SHA } });

    // Mot tep tam sot lai nghia la lan ghi khong nguyen khoi — va thu muc nay cung la noi
    // `deploy-remote.sh` giu `rollback-release.json`, nen rac o day khong vo hai.
    assert.deepEqual(readdirSync(scratch), ['release.json']);
  });
});

// -------------------------------------------------------------------- GHI HONG KHONG DUOC PHA

test('SHA khong du 40 ky tu -> tu choi ghi, va KHONG dung toi manifest dang co', () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');
    const existing = JSON.stringify({ gitSha: OLD_SHA });
    writeFileSync(destination, existing);

    const result = runWriter({ destination, env: { RELEASE_GIT_SHA: 'abc1234' } });

    assert.notEqual(result.status, 0, 'SHA cut phai lam script that bai');
    assert.equal(
      readFileSync(destination, 'utf8'),
      existing,
      'lan ghi hong da lam hong manifest dang phuc vu',
    );
  });
});

test('thieu SHA hoan toan -> tu choi ghi', () => {
  withScratch((scratch) => {
    const result = runWriter({
      destination: join(scratch, 'release.json'),
      env: { RELEASE_GIT_SHA: '' },
    });

    assert.notEqual(result.status, 0);
  });
});

test('SHA chu HOA bi tu choi — tang doc so sanh o dang chu thuong', () => {
  withScratch((scratch) => {
    const result = runWriter({
      destination: join(scratch, 'release.json'),
      env: { RELEASE_GIT_SHA: NEW_SHA.replace(/2/g, 'A') },
    });

    assert.notEqual(result.status, 0);
  });
});

// --------------------------------------------------------- XAC MOUNT CUA DOCKER KHONG CHAN DUONG

test('thu muc rong do Docker tao tai duong dan manifest duoc don, khong lam hong lan deploy', () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');
    // Dung cai Docker tao ra khi mount mot tep nguon chua ton tai: mot THU MUC rong trung ten.
    mkdirSync(destination);

    const result = runWriter({ destination, env: { RELEASE_GIT_SHA: NEW_SHA } });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(destination, 'utf8')).gitSha, NEW_SHA);
  });
});

test('thu muc KHONG rong o duong dan manifest -> dung lai, khong xoa bua', () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');
    mkdirSync(destination);
    writeFileSync(join(destination, 'khong-ro-la-gi'), 'x');

    const result = runWriter({ destination, env: { RELEASE_GIT_SHA: NEW_SHA } });

    // Day khong phai tinh huong ta hieu. Dung lai on hon la `rm -rf` mot thu khong ro la gi.
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(destination, 'khong-ro-la-gi'), 'utf8'), 'x');
  });
});

// ---------------------------------------------------------------------- DOC DUOC + KHONG RO RI

// NTFS khong bieu dien duoc quyen POSIX: `statSync` tren Windows tra 0666 du `chmod` da chay dung.
// Bo qua o do thay vi noi long khang dinh — CI (ubuntu-24.04) va VM deu la Linux, tuc bai nay van
// chay o dung noi ma quyen tep quyet dinh container co doc duoc manifest hay khong.
const skipPosixMode = process.platform === 'win32' && 'quyen POSIX khong bieu dien duoc tren NTFS';

test('quyen tep cho phep tien trinh trong container doc duoc', { skip: skipPosixMode }, () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');

    runWriter({ destination, env: { RELEASE_GIT_SHA: NEW_SHA } });

    // 0600 (ban cu) song duoc chi vi image hien tai chay bang root. Mot ngay nao do them mot
    // `USER` vao Dockerfile la manifest tat tho — im lang, va danh tinh lui ve du phong.
    const mode = statSync(destination).mode & 0o777;
    assert.equal(
      mode & 0o044,
      0o044,
      `manifest phai doc duoc ngoai chu so huu, dang la ${mode.toString(8)}`,
    );
    assert.equal(
      mode & 0o022,
      0,
      `manifest khong duoc ghi duoc boi nguoi khac, dang la ${mode.toString(8)}`,
    );
  });
});

test('khong co truong nao nghe nhu bi mat lot vao manifest', () => {
  withScratch((scratch) => {
    const destination = join(scratch, 'release.json');

    runWriter({
      destination,
      env: {
        RELEASE_GIT_SHA: NEW_SHA,
        // Cac bien nay co mat trong moi truong cua `deploy-remote.sh`. Manifest duoc mount vao
        // container va duoc doc lai boi cong cu thu bang chung, nen no khong duoc mang gi ngoai
        // danh tinh.
        API_KEY: 'ro-ri-1',
        SESSION_SECRET: 'ro-ri-2',
        DEEPSEEK_API_KEY: 'ro-ri-3',
      },
    });

    const raw = readFileSync(destination, 'utf8');
    assert.doesNotMatch(raw, /ro-ri-1|ro-ri-2|ro-ri-3/);
    assert.doesNotMatch(raw, /password|secret|token|apiKey|credential/i);
  });
});

test('khong nhac ten khach nao trong ma nguon — day la nen tang', () => {
  const source = readFileSync(script, 'utf8');

  for (const tenant of ['ultty', 'amico', 'wata']) {
    assert.doesNotMatch(source, new RegExp(tenant, 'i'), `script nhac ten khach ${tenant}`);
  }
});
