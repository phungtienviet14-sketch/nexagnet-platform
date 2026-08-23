import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * HOP DONG CACH LY: MOI STACK MOT WORKFLOW ENGINE RIENG.
 *
 * ---------------------------------------------------------------------------
 * DAY KHONG PHAI MOT "BEST PRACTICE" — no la mot loi DA DO DUOC.
 *
 * §26 cua ban giao chung minh chay duoc: hai ban trien khai tro vao CUNG MOT engine thi
 *   · cuop run cua nhau (worker cua stack A nhan viec cua stack B), va
 *   · gui du lieu cua nhau ra ngoai (buoc ban giao chay voi input cua khach khac).
 *
 * Do la LOI CACH LY DU LIEU giua cac KHACH HANG, khong phai mot bat tien van hanh. Trong mot nen
 * tang phuc vu nhieu khach (Ultty, Amico, ...) day la hong nghiem trong nhat co the xay ra.
 *
 * Bo test IT phai chay `--no-file-parallelism` chinh vi bat bien nay: chay song song thi 9 bai
 * DO, chay tuan tu thi 154/154. Do KHONG phai test mong manh — do la bat bien dang tu bao ve.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KIEM BANG VAN BAN, KHONG BANG `docker compose config`:
 *
 * Bo test nay phai chay duoc tren may khong co Docker (CI, may cua nguoi review). Va nhu moi
 * `*.contract.test.mjs` khac trong thu muc nay: KHONG phu thuoc goi ngoai — `yaml` chi co trong
 * kho pnpm nhu mot phu thuoc bac hai, no co the bien mat sau mot lan doi dependency va luc do
 * cai chan nay se im lang bien mat cung.
 */

const here = dirname(fileURLToPath(import.meta.url));
const compose = readFileSync(join(here, 'compose.yaml'), 'utf8');
const renderSecrets = readFileSync(join(here, 'render-secrets.sh'), 'utf8');

/** Cac service thuoc cum workflow — chung chia chung mot bo luat cach ly. */
const ENGINE_SIDE = ['hatchet-postgres', 'hatchet-engine'];
const WORKFLOW_CLUSTER = [
  'hatchet-postgres',
  'hatchet-migration',
  'hatchet-setup-config',
  'hatchet-engine',
  'hatchet-dashboard',
  'workflow-worker-v1',
];

/** Dia chi DUY NHAT ma mot ban trien khai duoc phep goi engine. */
const ONLY_ALLOWED_ENGINE_ADDRESS = 'hatchet-engine:7070';

/**
 * Cat `services:` thanh tung khoi theo ten service (thut 2 space). Chu thich cung nam o thut 2
 * space nen phai doi ten service KET THUC bang dau hai cham va het dong — neu khong, moi dong
 * `# ===...` se bi hieu la mot service.
 */
function serviceBlocks(yaml) {
  const start = yaml.indexOf('\nservices:\n');
  if (start === -1) return new Map();
  const body = yaml.slice(start + '\nservices:\n'.length);
  const end = body.search(/^(?:volumes|networks):/m);
  const scoped = end === -1 ? body : body.slice(0, end);

  const blocks = new Map();
  let current = null;
  for (const line of scoped.split(/\r?\n/)) {
    const header = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (header) {
      current = header[1];
      blocks.set(current, []);
      continue;
    }
    if (current) blocks.get(current).push(line);
  }
  return new Map([...blocks].map(([name, lines]) => [name, lines.join('\n')]));
}

/** Mot dong `KEY: value` khong nam trong chu thich. */
function valuesOf(block, key) {
  return [...block.matchAll(new RegExp(`^\\s+${key}:\\s*(.+?)\\s*$`, 'gm'))]
    .map((match) => match[1])
    .filter((value) => !value.startsWith('#'));
}

/**
 * Danh sach VI PHAM co ma, khong phai mot `boolean`.
 *
 * Cung ly do voi `workflow-dispatch-failures.ts`: mot cong co N duong hong phai phan biet duoc N
 * ly do. "Cach ly hong" khong sua duoc; "DIA_CHI_ENGINE_LA:..." thi sua duoc trong mot phut.
 */
export function isolationViolations(yaml) {
  const blocks = serviceBlocks(yaml);
  const problems = [];

  for (const name of WORKFLOW_CLUSTER) {
    const block = blocks.get(name);
    if (block === undefined) {
      problems.push(`THIEU_SERVICE:${name}`);
      continue;
    }

    // ① Khong cong nao ra host. Mot `ports:` o day vua cho khach khac tren cung VM goi vao,
    //    vua bien engine noi bo thanh mot dich vu co dia chi tren host.
    if (/^\s{4}ports:/m.test(block)) problems.push(`CO_CONG_RA_HOST:${name}`);

    // ② Ca cum phai sau `profiles: ["workflow"]` — neu khong, production moc them container cho
    //    mot tinh nang khong ai bat.
    if (!/^\s+profiles:\s*\["workflow"\]\s*$/m.test(block)) {
      problems.push(`THIEU_PROFILE_WORKFLOW:${name}`);
    }
  }

  // ③ Engine va Postgres cua no KHONG duoc cham mang co duong ra ngoai. `backend` la mang ma edge
  //    di nguoc vao; de engine o do la mo mot duong tu ngoai vao engine.
  for (const name of ENGINE_SIDE) {
    const block = blocks.get(name);
    if (block === undefined) continue;
    const networks = block.split('    networks:')[1] ?? '';
    if (/^\s+-?\s*backend:?\s*$/m.test(networks)) {
      problems.push(`ENGINE_TREN_MANG_NGOAI:${name}`);
    }
  }

  // ④ Mang mang engine phai `internal: true` — do la ranh gioi mang lam co so cho quyet dinh
  //    Q2-A (gRPC noi bo chay khong TLS). Bo `internal` di thi ly do cua Q2-A khong con dung.
  if (!/^\s{2}data:\s*\n\s{4}internal:\s*true\s*$/m.test(yaml)) {
    problems.push('MANG_DATA_KHONG_INTERNAL');
  }

  // ⑤ Dia chi engine phai GHI CUNG. Mot `${BIEN}` o day la dung cai lo hong nay: hai stack lay
  //    cung mot gia tri tu secrets.env se cung goi vao MOT engine — dung §26.
  const addresses = [...blocks.values()].flatMap((block) =>
    valuesOf(block, 'WORKFLOW_ENGINE_HOST_PORT'),
  );
  if (addresses.length === 0) problems.push('KHONG_AI_KHAI_DIA_CHI_ENGINE');
  for (const address of addresses) {
    if (address !== ONLY_ALLOWED_ENGINE_ADDRESS) problems.push(`DIA_CHI_ENGINE_LA:${address}`);
  }

  // ⑥ Volume cua engine phai khai trong CHINH file nay va khong `external` — co the compose moi
  //    dat ten volume theo project, ma project mang stack slug. Mot volume `external: true` la
  //    volume nam ngoai stack, tuc la hai stack co the tro vao cung mot cho.
  const volumesAt = yaml.search(/^volumes:$/m);
  const volumesSection = volumesAt === -1 ? '' : yaml.slice(volumesAt);
  for (const volume of ['hatchet-postgres-data', 'hatchet-config', 'hatchet-certs']) {
    if (!new RegExp(`^\\s{2}${volume}:\\s*$`, 'm').test(volumesSection)) {
      problems.push(`VOLUME_KHONG_KHAI_TRONG_FILE_NAY:${volume}`);
    }
  }
  if (/^\s+external:\s*true/m.test(volumesSection)) problems.push('VOLUME_EXTERNAL');

  // ⑦ Dashboard ra ngoai bang ALIAS MANG SLUG. Goi bang ten service se lap lai su co 17/08/2026:
  //    tren mot mang ma edge tham gia, moi khach deu tra loi cho cung mot ten.
  const dashboard = blocks.get('hatchet-dashboard') ?? '';
  if (!/- hatchet-\$\{STACK_SLUG/.test(dashboard)) problems.push('DASHBOARD_THIEU_ALIAS_SLUG');

  return problems;
}

// =============================================================================== file that

test('compose.yaml that su cach ly workflow engine theo tung stack', () => {
  assert.deepEqual(
    isolationViolations(compose),
    [],
    'Vi pham cach ly workflow engine. §26 da chung minh: hai ban trien khai dung chung mot ' +
      'engine cuop run cua nhau VA gui du lieu cua nhau ra ngoai.',
  );
});

test('khong service workflow nao publish cong ra host', () => {
  const blocks = serviceBlocks(compose);
  for (const name of WORKFLOW_CLUSTER) {
    assert.doesNotMatch(
      blocks.get(name) ?? '',
      /^\s{4}ports:/m,
      `${name} publish cong ra host — compose POC lam the (5744/7744/8744) va do la mot trong ` +
        'ba ly do KHONG duoc copy no len production.',
    );
  }
});

test('khong con mat khau `hatchet/hatchet` viet cung nhu ban POC', () => {
  assert.doesNotMatch(
    compose,
    /hatchet:hatchet@/,
    'Mat khau viet cung cua POC da lot len production.',
  );
});

test('cookie phien cua dashboard khong duoc chay che do insecure', () => {
  const blocks = serviceBlocks(compose);
  for (const name of ['hatchet-engine', 'hatchet-dashboard', 'hatchet-setup-config']) {
    assert.deepEqual(
      valuesOf(blocks.get(name) ?? '', 'SERVER_AUTH_COOKIE_INSECURE'),
      ['"f"'],
      `${name}: POC dat "t" de chay tren localhost. Tren production dieu do bo co Secure khoi ` +
        'cookie phien cua dashboard.',
    );
  }
});

// =========================================================== cach ly o TANG BI MAT va TANG EDGE

test('moi secret cua workflow engine deu mang STACK SLUG, khong phai tenant slug', () => {
  // Cach ly o tang bi mat, cung mot lop voi ten volume va alias mang. `zalo-ultty-...` va
  // `zalo-ultty-gd1-test-...` phai la hai thu khac nhau, neu khong thi mot moi truong ky thuat
  // va production dung chung mot Postgres cua engine.
  const names = [...renderSecrets.matchAll(/optional_secret zalo-(\$\{[A-Z_]+\})-([a-z0-9-]+)/g)];
  const workflowSecrets = names.filter(([, , suffix]) =>
    /^(hatchet-db-password|workflow-engine-token|workflow-dashboard-htpasswd)$/.test(suffix),
  );

  assert.equal(
    workflowSecrets.length,
    3,
    'Mong doi dung 3 secret cua workflow engine trong render-secrets.sh.',
  );
  for (const [, slugVar, suffix] of workflowSecrets) {
    assert.equal(
      slugVar,
      '${STACK_SLUG}',
      `secret zalo-...-${suffix} phai keyed theo STACK_SLUG. Dung TENANT_SLUG se lam ` +
        '`ultty` (production) va `ultty-gd1-test` doc CUNG mot bi mat.',
    );
  }
});

test('route dashboard chi duoc phat khi cong tac BAT, va phai co cong xac thuc', () => {
  const routeAt = renderSecrets.indexOf('${WORKFLOW_DOMAIN} {');
  assert.notEqual(routeAt, -1, 'khong tim thay khoi route cua dashboard trong render-secrets.sh');

  // Phat vo dieu kien = moi khach moc them mot hostname cong khai tra 502, va Caddy di xin chung
  // chi ACME cho mot ten khong phuc vu gi.
  const before = renderSecrets.slice(0, routeAt);
  const guardAt = before.lastIndexOf("if [[ \"${WORKFLOW_ENGINE}\" == 'on' ]]; then");
  assert.notEqual(guardAt, -1, 'route dashboard khong nam trong nhanh `WORKFLOW_ENGINE == on`');
  assert.equal(
    before.slice(guardAt).includes('\nfi\n'),
    false,
    'nhanh bao ve da dong TRUOC khi toi route — route dang duoc phat vo dieu kien',
  );

  // Cat toi `EOF` dong heredoc, KHONG toi dau `}` dau tien: `${WORKFLOW_DOMAIN}` tu no da chua
  // mot `}` nen cach do se cat ra mot manh rong roi "chung minh" duoc bat ky dieu gi.
  const route = renderSecrets.slice(routeAt, renderSecrets.indexOf('\nEOF', routeAt));
  // Caddy 2.11: directive la `basic_auth` (`basicauth` la ten cu).
  assert.match(route, /basic_auth \{/, 'route dashboard thieu cong xac thuc o edge');
  assert.match(route, /reverse_proxy hatchet-\$\{STACK_SLUG\}:80/);
  assert.match(route, /import secure_headers/);
});

test('cong tac CHI duoc bat cho gd1-test — production khong the bat nham', () => {
  // Cong tac mot minh no bao ve khoi "bat nham vi goi khach khai binding". No KHONG bao ve khoi
  // "go nham ten moi truong luc deploy": `tenants/ultty/tenant.json` dung chung cho ca hai stack,
  // nen mot lan `WORKFLOW_ENGINE=on ./render-secrets.sh` chay nham vao production se vu trang
  // dispatcher tren stack that cua khach — noi khong co engine nao de goi.
  const guardAt = renderSecrets.indexOf("if [[ \"${WORKFLOW_ENGINE}\" == 'on' ]]; then");
  assert.notEqual(guardAt, -1, 'khong tim thay nhanh bat cong tac');

  // Cai chan phai nam NGAY trong nhanh do, TRUOC moi thu khac — ke ca truoc cac kiem tra secret.
  // Cat toi dong `fi` dau tien sau nhanh — dung de soi dung than cua nhanh, khong lan sang
  // phan con lai cua script.
  const branch = renderSecrets.slice(guardAt, renderSecrets.indexOf('\nfi\n', guardAt) + 1);
  assert.match(
    branch,
    /DEPLOYMENT_ENVIRONMENT\}" != 'gd1-test'/,
    'render-secrets.sh cho phep bat workflow engine o moi truong khac gd1-test',
  );
  assert.match(branch, /exit 64/, 'chan moi truong sai phai DUNG HAN, khong phai canh bao');
});
test('bam mat khau cua dashboard KHONG duoc phat vao secrets.env', () => {
  // secrets.env di vao `--env-file` cua compose, tuc la toi MOI container cua stack. Bam mat khau
  // cua edge khong co viec gi o do; no thuoc ve manh cau hinh Caddy.
  const heredocAt = renderSecrets.indexOf('cat >"${RUNTIME_DIR}/secrets.env"');
  const heredoc = renderSecrets.slice(heredocAt, renderSecrets.indexOf('\nEOF', heredocAt));
  // Chi soi DONG PHAT BIEN, bo qua chu thich — chinh khoi chu thich trong heredoc giai thich vi
  // sao bien nay khong duoc o day, va mot bo quet to cao loi giai thich cua chinh no se bi "sua"
  // bang cach xoa loi giai thich di.
  const emitted = heredoc
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(emitted, /WORKFLOW_DASHBOARD_HTPASSWD/);
  // CHONG XANH GIA: bo loc phai van con giu lai cac bien that.
  assert.match(emitted, /^WORKFLOW_ENGINE_TOKEN=/m);
});

// =========================================================== chuoi truyen bien qua duong CD

test('WORKFLOW_ENGINE di DU NAM TANG tu nut bam CI xuong render-secrets', () => {
  // Cung triet ly voi `secrets-passthrough.contract.test.mjs`: bo MOT tang la tinh nang im lang
  // khong chay. Da xay ra that hai lan (`ADVICE_COMPOSER`, `DEPLOYMENT_ENVIRONMENT`), va ca hai
  // lan deu deploy XANH roi khong ai biet gi trong nhieu ngay.
  const tiers = [
    ['deploy-tenant.yml', 'workflow_engine:'],
    ['deploy-tenant.yml', 'workflow_engine: ${{ inputs.workflow_engine }}'],
    ['reusable-deploy-tenant.yml', 'workflow_engine:'],
    ['reusable-deploy-tenant.yml', 'WORKFLOW_ENGINE: ${{ inputs.workflow_engine }}'],
    ['../../deploy/netviet/deploy-ci.sh', "WORKFLOW_ENGINE='${WORKFLOW_ENGINE:-off}'"],
    ['../../deploy/netviet/deploy-remote.sh', 'WORKFLOW_ENGINE="${WORKFLOW_ENGINE:-off}"'],
  ];

  for (const [file, needle] of tiers) {
    const full = file.startsWith('..')
      ? join(here, file.replace('../../deploy/netviet/', ''))
      : join(here, '../../.github/workflows', file);
    assert.ok(
      readFileSync(full, 'utf8').includes(needle),
      `${file} thieu \`${needle}\` — chuoi truyen bien dut o day, va hau qua la nut bam tren CI` +
        ' se khong bat duoc gi ma cung khong bao loi.',
    );
  }
});

test('mac dinh cua nut bam CI la `off`, khong phai `on`', () => {
  const dispatch = readFileSync(join(here, '../../.github/workflows/deploy-tenant.yml'), 'utf8');
  const at = dispatch.indexOf('workflow_engine:');
  assert.notEqual(at, -1);
  // Mot input mac dinh `on` bien moi lan bam deploy thanh mot lan bat engine.
  assert.match(dispatch.slice(at, at + 700), /default: 'off'/);
});

// =============================================================================== ca AM TINH
//
// Mot bo quet chua bao gio DO thi khong chung minh duoc gi. Cac ca duoi day dung compose GIA,
// moi ca hong dung MOT duong, va deu phai lam `isolationViolations` len tieng.

const MINIMAL = `
name: zalo-\${STACK_SLUG}

services:
  hatchet-postgres:
    profiles: ["workflow"]
    networks:
      - data
  hatchet-migration:
    profiles: ["workflow"]
  hatchet-setup-config:
    profiles: ["workflow"]
  hatchet-engine:
    profiles: ["workflow"]
    networks:
      - data
  hatchet-dashboard:
    profiles: ["workflow"]
    networks:
      backend:
        aliases:
          - hatchet-\${STACK_SLUG:-\${TENANT_SLUG}}
      data:
  workflow-worker-v1:
    profiles: ["workflow"]
    environment:
      WORKFLOW_ENGINE_HOST_PORT: hatchet-engine:7070
    networks:
      - backend
      - data

volumes:
  hatchet-postgres-data:
  hatchet-config:
  hatchet-certs:

networks:
  backend:
  data:
    internal: true
`;

test('CHONG XANH GIA: compose gia toi thieu phai SACH', () => {
  // Neu ca nay khong sach thi moi ca am tinh ben duoi deu "do" vi mot ly do khac — va bo quet se
  // trong nhu dang lam viec trong khi no chi dang do chinh cai compose gia.
  assert.deepEqual(isolationViolations(MINIMAL), []);
});

test('ca am tinh: hai stack tro vao MOT engine dung chung phai lam test DO', () => {
  // Day chinh la §26 duoi dang cau hinh: dia chi engine tro ra mot host NGOAI stack.
  const shared = MINIMAL.replace(
    'WORKFLOW_ENGINE_HOST_PORT: hatchet-engine:7070',
    'WORKFLOW_ENGINE_HOST_PORT: hatchet-dung-chung.netviet.internal:7070',
  );
  assert.deepEqual(isolationViolations(shared), [
    'DIA_CHI_ENGINE_LA:hatchet-dung-chung.netviet.internal:7070',
  ]);
});

test('ca am tinh: bien dia chi engine cung phai DO, khong chi host la va', () => {
  // Mot `${BIEN}` doc thi vo hai, nhung no cho phep hai stack nhan cung mot gia tri tu
  // secrets.env — cung cai lo hong, chi la mo cham hon mot buoc.
  const variable = MINIMAL.replace(
    'WORKFLOW_ENGINE_HOST_PORT: hatchet-engine:7070',
    'WORKFLOW_ENGINE_HOST_PORT: ${WORKFLOW_ENGINE_HOST_PORT}',
  );
  assert.deepEqual(isolationViolations(variable), [
    'DIA_CHI_ENGINE_LA:${WORKFLOW_ENGINE_HOST_PORT}',
  ]);
});

test('ca am tinh: mo cong engine ra host phai DO', () => {
  const published = MINIMAL.replace(
    '  hatchet-engine:\n    profiles: ["workflow"]\n',
    '  hatchet-engine:\n    profiles: ["workflow"]\n    ports:\n      - "7744:7070"\n',
  );
  assert.deepEqual(isolationViolations(published), ['CO_CONG_RA_HOST:hatchet-engine']);
});

test('ca am tinh: bo `internal: true` khoi mang data phai DO', () => {
  // Ranh gioi mang la LY DO cua quyet dinh Q2-A (gRPC noi bo khong TLS). Bo no di ma van giu
  // `tls none` la doi mot quyet dinh da can nhac thanh mot lo hong.
  const leaky = MINIMAL.replace('  data:\n    internal: true', '  data:');
  assert.deepEqual(isolationViolations(leaky), ['MANG_DATA_KHONG_INTERNAL']);
});

test('ca am tinh: volume `external` phai DO — no nam ngoai stack', () => {
  const external = MINIMAL.replace(
    'volumes:\n  hatchet-postgres-data:',
    'volumes:\n  hatchet-postgres-data:\n    external: true',
  );
  assert.deepEqual(isolationViolations(external), ['VOLUME_EXTERNAL']);
});

test('ca am tinh: bo profile workflow phai DO — production se moc them container', () => {
  const noProfile = MINIMAL.replace(
    '  hatchet-engine:\n    profiles: ["workflow"]\n',
    '  hatchet-engine:\n',
  );
  assert.deepEqual(isolationViolations(noProfile), ['THIEU_PROFILE_WORKFLOW:hatchet-engine']);
});

test('ca am tinh: dashboard mat alias slug phai DO', () => {
  const noAlias = MINIMAL.replace('- hatchet-${STACK_SLUG:-${TENANT_SLUG}}', '- hatchet-dashboard');
  assert.deepEqual(isolationViolations(noAlias), ['DASHBOARD_THIEU_ALIAS_SLUG']);
});
