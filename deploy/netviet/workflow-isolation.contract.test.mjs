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

/**
 * Doc mot tep cau hinh va BO ky tu CR.
 *
 * Moi phep khang dinh ben duoi cat theo dong hoac neo `^...$`. Tren may Windows cac tep nay
 * duoc checkout dang CRLF, nen mot ky tu CR treo o cuoi moi dong lam LECH het: bai kiem bao
 * "THIEU_SERVICE:hatchet-engine" trong khi service do co that. Do la canh bao GIA — dung loai
 * loi ma ca tep nay duoc viet ra de chan — va no chi xuat hien tren may dev, khong tren runner.
 */
const readConfig = (name) =>
  readFileSync(join(here, name), 'utf8').replaceAll(String.fromCharCode(13), '');

const compose = readConfig('compose.yaml');
const renderSecrets = readConfig('render-secrets.sh');

/** Cac service thuoc cum workflow — chung chia chung mot bo luat cach ly. */
const ENGINE_SIDE = ['hatchet-postgres', 'hatchet-engine'];
/**
 * MOI KHUON MOT CONTAINER — nen danh sach nay dai them mot dong moi lan co khuon moi.
 *
 * Khong phai lua chon kien truc ma la he qua: engine dinh tuyen viec theo
 * `actionId = <tenWorkflow>:<tenBuoc>` va mot worker chi nhan viec cua action CHINH NO dang ky.
 * Mot tien trinh om hai khuon lam duong bien giua chung tan bien, va DRAIN cua khuon nay phai
 * doi khuon kia ngu day.
 */
const WORKER_SERVICES = ['workflow-worker-v1', 'workflow-worker-sales-handoff-v1'];

const WORKFLOW_CLUSTER = [
  'hatchet-postgres',
  'hatchet-migration',
  'hatchet-setup-config',
  'hatchet-engine',
  'hatchet-dashboard',
  ...WORKER_SERVICES,
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

/**
 * VI PHAM DAY DIEN cua CAC TIEN TRINH WORKER — tach khoi `isolationViolations` co chu y.
 *
 * `isolationViolations` tra loi "hai khach co dam vao nhau khong". Ham nay tra loi mot cau khac:
 * "moi khuon co THUC SU co mot tien trinh phuc vu no khong, va tien trinh do co du thu de lam
 * viec khong".
 *
 * CHE DO HONG MA NO CHAN, do duoc trong lan audit 25/08/2026: `workflow-worker-v1` KHONG khai
 * `WORKFLOW_WORKER_TEMPLATE`, nen no roi ve mac dinh `integration-handoff`. Tuc la sau khi
 * `sales-handoff-followup.v1` len main, KHONG CO tien trinh nao phuc vu khuon do — nhung ca
 * stack van xanh: container chay, healthcheck 200, dashboard co worker. Moi run cua khuon moi
 * chi nam trong hang doi, vinh vien, khong mot dong canh bao.
 *
 * Do la ly do moi khang dinh o day deu la mot MA VI PHAM chu khong phai mot `boolean`: "day
 * dien worker hong" khong sua duoc; `THIEU_KHUON:workflow-worker-v1` thi sua trong mot phut.
 */
export function workerWiringViolations(yaml) {
  const blocks = serviceBlocks(yaml);
  const problems = [];
  const seenTemplates = new Map();
  const seenPorts = new Map();

  for (const name of WORKER_SERVICES) {
    const block = blocks.get(name);
    if (block === undefined) {
      problems.push(`THIEU_SERVICE:${name}`);
      continue;
    }

    // ① KHUON GHI TUONG MINH. `resolveWorkerRegistration` CO mac dinh (`integration-handoff`) va
    //    mac dinh do phai giu — no la thu giu container dang chay tren gd1-test khoi chet o lan
    //    deploy ke tiep. Nhung dua vao mac dinh trong FILE NAY thi khac: khi da co hai khuon,
    //    mot service khong khai khuon la mot worker `integration-handoff` thu hai tra hinh.
    const [template] = valuesOf(block, 'WORKFLOW_WORKER_TEMPLATE');
    const [version] = valuesOf(block, 'WORKFLOW_WORKER_VERSION');
    if (!template) problems.push(`THIEU_KHUON:${name}`);
    if (!version) problems.push(`THIEU_PHIEN_BAN:${name}`);

    // ② MOT KHUON = MOT CONTAINER. Hai service cung `<khuon>.<phien ban>` la hai tien trinh dang
    //    ky CUNG mot ten voi engine — chung cuop viec cua nhau, va DRAIN khong con dem duoc gi.
    if (template && version) {
      const engineName = `${template}.${version}`;
      const owner = seenTemplates.get(engineName);
      if (owner) problems.push(`HAI_WORKER_CUNG_KHUON:${engineName}`);
      else seenTemplates.set(engineName, name);
    }

    // ③ KHOA DICH VU. `InternalServiceGuard` FAIL-CLOSED va ban deploy chay `AUTH_MODE=session`,
    //    nen mot worker khong mang `API_KEY` se chay tron roi an 401 o MOI lan goi ve.
    if (valuesOf(block, 'API_KEY').length === 0) problems.push(`THIEU_KHOA_DICH_VU:${name}`);

    // ④ KHONG CAP DB CHO WORKER. `WorkflowWorkerModule` co y khong co Prisma: boot `AppModule` o
    //    tien trinh worker se mo mot listener zca THU HAI tren cung tai khoan Zalo va da ra
    //    listener cua `api`. Mot `DATABASE_URL` o day la buoc dau tien di nguoc lai quyet dinh do.
    if (valuesOf(block, 'DATABASE_URL').length > 0) problems.push(`WORKER_CO_DB:${name}`);

    // ⑤ CONG SUC KHOE RIENG. `worker-health.server.ts` nem `..._HEALTH_PORT_UNAVAILABLE` khi cong
    //    da bi dung — mot thong bao dung nhung chi doc duoc SAU khi container chet.
    const [port] = valuesOf(block, 'WORKFLOW_WORKER_HEALTH_PORT');
    if (port) {
      const owner = seenPorts.get(port);
      if (owner) problems.push(`TRUNG_CONG_SUC_KHOE:${port}`);
      else seenPorts.set(port, name);
    }

    // ⑥ Khuon `sales-handoff-followup` GOI NGUOC API, nen no phai biet goi vao dau. Thieu bien
    //    nay thi buoc dau tien nem `DESTINATION_NOT_CONFIGURED` voi `retryable: false`.
    if (template === 'sales-handoff-followup') {
      if (valuesOf(block, 'WORKFLOW_DESTINATION_SELF_API').length === 0) {
        problems.push(`THIEU_DICH_DEN:${name}`);
      }
    }
  }

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

// ================================================ MOI KHUON PHAI CO MOT TIEN TRINH PHUC VU NO

test('day dien worker: moi khuon mot container, du khoa, khong DB, cong suc khoe rieng', () => {
  assert.deepEqual(
    workerWiringViolations(compose),
    [],
    'Day dien worker hong. Che do hong te nhat o day KHONG phai mot container do — ma la mot ' +
      'stack XANH toan bo trong khi mot khuon khong co ai phuc vu, va moi run cua no nam trong ' +
      'hang doi vinh vien.',
  );
});

test('`sales-handoff-followup.v1` co DUNG mot tien trinh phuc vu, khai tuong minh', () => {
  // Bai nay doc CU THE, khong chi "khong co vi pham": mot bo quet chung chung se van xanh neu
  // ai do doi khuon cua service nay sang mot ten khac cung hop le.
  const block = serviceBlocks(compose).get('workflow-worker-sales-handoff-v1') ?? '';

  assert.deepEqual(valuesOf(block, 'WORKFLOW_WORKER_TEMPLATE'), ['sales-handoff-followup']);
  assert.deepEqual(valuesOf(block, 'WORKFLOW_WORKER_VERSION'), ['v1']);
  // Goi khach PHAI duoc mount: nguong "viec ban giao bi bo quen" (`tenantSalesHandoffFollowup()`)
  // la chinh sach cua KHACH va duoc doc luc dang ky khuon.
  assert.deepEqual(valuesOf(block, 'TENANT_DIR'), ['/srv/tenant']);
  assert.match(block, /- \.\/tenant-pack:\/srv\/tenant:ro/);
});

test('dich den `self-api` tro vao MANG NOI BO, va DUNG cong ma service `api` dang nghe', () => {
  /*
   * HAI CACH SAI, ca hai deu deploy XANH roi hong luc chay:
   *
   *   sai cong   -> `http://api:3000/...`. Ba chu thich trong repo tung ghi so nay, va no SAI:
   *                 service `api` nghe `PORT: 3001`. Sai cong thi moi lan goi ve chet o tang mang.
   *   ra edge    -> `https://${OPERATOR_DOMAIN}/...`. Chay duoc, va do moi la cho nguy: no cong
   *                 mot endpoint GHI trang thai don hang ra Internet, trong khi thu duy nhat can
   *                 no dang nam ngay ben trong cung mot mang Docker.
   */
  const blocks = serviceBlocks(compose);
  const worker = blocks.get('workflow-worker-sales-handoff-v1') ?? '';
  const [destination] = valuesOf(worker, 'WORKFLOW_DESTINATION_SELF_API');

  assert.ok(destination, 'worker sales-handoff khong khai WORKFLOW_DESTINATION_SELF_API');

  // Cong doc TU service `api`, khong go lai hang so — hai noi lech nhau la dung loi can chan.
  const [apiPort] = valuesOf(blocks.get('api') ?? '', 'PORT');
  assert.ok(apiPort, 'khong doc duoc `PORT` cua service `api`');
  assert.equal(
    destination,
    `http://api:${apiPort}/internal/sales-handoff`,
    `dich den phai tro thang toi service \`api\` tren cong ${apiPort} qua mang Docker cua khach.`,
  );

  // Khang dinh PHU DINH, cung tinh than voi `caddy-route-contract.test.mjs`: khong duoc di qua edge.
  assert.doesNotMatch(destination, /^https:/, 'dich den noi bo khong duoc dung https qua edge');
  assert.doesNotMatch(destination, /OPERATOR_DOMAIN|WORKFLOW_DOMAIN/);
});

test('deploy-stack.sh THUC SU khoi dong moi worker co trong compose', () => {
  /*
   * TANG THU HAI cua cung mot cai bay, va no suyt lot trong chinh lan sua nay.
   *
   * `deploy-stack.sh` khong bat ca profile len — no LIET KE TUNG SERVICE:
   *
   *     compose --profile workflow up -d --wait ... hatchet-engine hatchet-dashboard <cac worker>
   *
   * Nen mot service co day du trong `compose.yaml`, dung khuon, dung khoa, dung dich den — ma
   * vang o dong do — se KHONG BAO GIO duoc khoi dong. Deploy van xanh. Khuon van khong co ai
   * phuc vu. Y het trieu chung cua mac dinh `WORKFLOW_WORKER_TEMPLATE`, chi khac tang.
   *
   * Bai nay doi chieu HAI NGUON: danh sach worker trong compose vs danh sach worker trong script.
   * Them worker ma quen mot trong hai ben deu DO o day.
   */
  const deployStack = readConfig('deploy-stack.sh');
  const workersInCompose = [...serviceBlocks(compose).keys()].filter((name) =>
    name.startsWith('workflow-worker'),
  );

  assert.ok(workersInCompose.length >= 2, 'khong doc duoc danh sach worker tu compose.yaml');

  const startedAt = deployStack.indexOf('--profile workflow up -d');
  assert.notEqual(startedAt, -1, 'deploy-stack.sh khong con lenh khoi dong cum workflow');
  // Cat toi `ps` — dung than cua lenh `up`, khong lan sang phan con lai cua script.
  const startCommand = deployStack.slice(startedAt, deployStack.indexOf('--profile workflow ps'));

  const missing = workersInCompose.filter((name) => !startCommand.includes(name));
  assert.deepEqual(
    missing,
    [],
    `deploy-stack.sh khong khoi dong: ${missing.join(', ')}. Service co trong compose ma vang o ` +
      'lenh `up` thi khong bao gio chay, va deploy VAN XANH.',
  );
});

test('KHONG lam hong worker `integration-handoff` dang chay', () => {
  // Worker cu dang phuc vu tren gd1-test. Doi ten service = huy container dang chay va moi run
  // `.v1` dang do nam cho vinh vien (runbook §2). Ten no phai giu nguyen, va khuon no phuc vu
  // phai van la `integration-handoff` — them khuon thu hai KHONG duoc dong vao khuon thu nhat.
  const block = serviceBlocks(compose).get('workflow-worker-v1');

  assert.ok(block !== undefined, 'service `workflow-worker-v1` bi doi ten hoac bi xoa');
  assert.deepEqual(valuesOf(block, 'WORKFLOW_WORKER_TEMPLATE'), ['integration-handoff']);
  assert.deepEqual(valuesOf(block, 'WORKFLOW_WORKER_VERSION'), ['v1']);
  // Worker cu KHONG duoc nhan dich den cua khuon moi — no khong goi `internal/*` bao gio.
  assert.deepEqual(valuesOf(block, 'WORKFLOW_DESTINATION_SELF_API'), []);
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
  const guardAt = before.lastIndexOf('if [[ "${WORKFLOW_ENGINE}" == \'on\' ]]; then');
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
  const guardAt = renderSecrets.indexOf('if [[ "${WORKFLOW_ENGINE}" == \'on\' ]]; then');
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

// ============================== CI PHAI THAT SU CHAY 24 BAI IT DO, KHONG CHI CO MOT JOB TEN DEP

/** Cat mot job ra khoi `ci.yml` de khang dinh nam DUNG trong job do, khong bat nham job ben canh. */
function ciJobBlock(name) {
  // Bo ky tu CR TRUOC khi tim. Tren may Windows `ci.yml` duoc checkout dang CRLF, nen phep tim
  // mot khoi job theo ky tu xuong dong khong bao gio khop, va bai nay bao "ci.yml khong con
  // job <ten>" — mot CANH BAO GIA, dung loai loi ma ca tep nay duoc viet ra de chan.
  const ci = readFileSync(join(here, '../../.github/workflows/ci.yml'), 'utf8').replaceAll(
    String.fromCharCode(13),
    '',
  );
  const start = ci.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `ci.yml khong con job \`${name}\``);
  const rest = ci.slice(start + 1);
  const next = rest.slice(1).search(/^ {2}[a-z][a-z0-9-]*:$/m);
  const block = next === -1 ? rest : rest.slice(0, next + 1);
  // Cat duoi cac dong trong + chu thich cuoi khoi: chung thuoc ve job KE TIEP (chu thich dan cho
  // mot job nam TREN ten no). Khong cat thi mot chu thich cua job ben canh co the lam khang dinh
  // duoi day XANH GIA — dung loai loi ma ca tep nay duoc viet ra de chan.
  const lines = block.split(/\r?\n/);
  while (lines.length > 0 && /^\s*(#.*)?$/.test(lines.at(-1))) lines.pop();
  return lines.join('\n');
}

test('job `workflow-integration` bat DU HAI co va chay TUAN TU', () => {
  // Do duoc tren merge SHA `302d5b1e` (23/08/2026): khi `RUN_WORKFLOW_IT` khong xuat hien o dong
  // nao trong `ci.yml`, dung 6 tep / 24 bai IT tu bo qua CHINH CHUNG o ca `verify` lan
  // `integration` — khong mot dong canh bao. Do la kieu xanh gia te nhat: no dat ten cho mot bang
  // chung khong ton tai, va "CI xanh" duoc trich dan nhu the no da chung minh engine.
  const job = ciJobBlock('workflow-integration');

  assert.match(
    job,
    /RUN_WORKFLOW_IT: '1'/,
    'Thieu `RUN_WORKFLOW_IT` thi ca 24 bai IT tu bo qua va job nay xanh ma khong chay gi.',
  );
  assert.match(
    job,
    /RUN_PRISMA_IT: '1'/,
    '18/24 bai gate CA HAI co (do ben outbox doc hang tu Postgres bang mot tien trinh KHAC). ' +
      'Thieu co nay thi 6 bai chay va 18 bai im lang bo qua.',
  );
  assert.match(
    job,
    /vitest run src\/workflow --no-file-parallelism/,
    'Bo `--no-file-parallelism` la 9 bai DO: nam tep dang ky CUNG ten `integration-handoff.v1` ' +
      'voi CUNG mot engine, nen worker cua tep nay nhan run cua tep kia. Do la chinh bat bien ' +
      'ma tep nay canh gac, dang tu bao ve.',
  );
});

test('CI, script dung engine va hai bai IT phai tro cung MOT cum Hatchet', () => {
  // `worker-readiness.int.spec.ts` va `workflow-recovery.int.spec.ts` GOI `docker compose ... stop|
  // start hatchet-engine` de mo phong engine chet. Neu CI dung ten project khac hoac file compose
  // khac, hai bai do se dieu khien mot project KHONG TON TAI: `docker compose start` im lang khong
  // lam gi, engine that van chay, va bai "engine chet roi song lai" do vi mot ly do khong lien
  // quan gi den code. Bon tep duoi day phai doi CUNG MOT LUC.
  const COMPOSE_PATH = 'tools/poc-workflow-engine/compose/hatchet.compose.yml';
  const files = [
    '../../.github/workflows/ci.yml',
    '../../tools/poc-workflow-engine/start-engine.sh',
    '../../apps/api/src/workflow/worker-readiness.int.spec.ts',
    '../../apps/api/src/workflow/workflow-recovery.int.spec.ts',
  ];

  for (const file of files) {
    const src = readFileSync(join(here, file), 'utf8');
    assert.ok(src.includes('pocwf'), `${file} khong con nhac ten compose project \`pocwf\`.`);
    assert.ok(src.includes(COMPOSE_PATH), `${file} khong con tro toi \`${COMPOSE_PATH}\`.`);
  }
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
      WORKFLOW_WORKER_TEMPLATE: integration-handoff
      WORKFLOW_WORKER_VERSION: v1
      WORKFLOW_WORKER_HEALTH_PORT: "8085"
      API_KEY: \${API_KEY}
    networks:
      - backend
      - data
  workflow-worker-sales-handoff-v1:
    profiles: ["workflow"]
    environment:
      WORKFLOW_ENGINE_HOST_PORT: hatchet-engine:7070
      WORKFLOW_WORKER_TEMPLATE: sales-handoff-followup
      WORKFLOW_WORKER_VERSION: v1
      WORKFLOW_WORKER_HEALTH_PORT: "8086"
      WORKFLOW_DESTINATION_SELF_API: http://api:3001/internal/sales-handoff
      API_KEY: \${API_KEY}
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

// ============================================= ca AM TINH cho day dien worker
//
// Moi ca duoi day la mot cach hong DA CO THAT hoac chi cach mot dong go nham. Cai chung deu
// deploy XANH: container len, healthcheck 200, dashboard co worker — va mot khuon khong ai phuc vu.

test('CHONG XANH GIA: day dien worker cua compose gia toi thieu phai SACH', () => {
  assert.deepEqual(workerWiringViolations(MINIMAL), []);
});

test('ca am tinh: worker KHONG khai khuon phai DO — day chinh la loi cua ban 24/08', () => {
  // Truoc 25/08/2026 `workflow-worker-v1` dung y nhu the nay. No roi ve mac dinh
  // `integration-handoff`, nen khi khuon thu hai len main thi khong ai phuc vu no.
  const noTemplate = MINIMAL.replace(
    '      WORKFLOW_WORKER_TEMPLATE: sales-handoff-followup\n',
    '',
  );

  // CHI `THIEU_KHUON`, va thu tu do la co y: cai kiem dich den bam theo khuon DA KHAI. Khong
  // khai khuon thi khong ai biet service nay le ra phuc vu cai gi — nen doi hoi no mot dich den
  // la doan mo. Sua khuon truoc, roi cai kiem kia moi len tieng.
  assert.deepEqual(workerWiringViolations(noTemplate), [
    'THIEU_KHUON:workflow-worker-sales-handoff-v1',
  ]);
});

test('ca am tinh: hai worker CUNG khuon + phien ban phai DO', () => {
  // Chung dang ky CUNG mot ten voi engine -> cuop viec cua nhau, va DRAIN khong dem duoc gi.
  const clash = MINIMAL.replace(
    'WORKFLOW_WORKER_TEMPLATE: sales-handoff-followup',
    'WORKFLOW_WORKER_TEMPLATE: integration-handoff',
  );
  assert.deepEqual(workerWiringViolations(clash), [
    'HAI_WORKER_CUNG_KHUON:integration-handoff.v1',
  ]);
});

test('ca am tinh: worker sales-handoff mat dich den phai DO', () => {
  const noDestination = MINIMAL.replace(
    '      WORKFLOW_DESTINATION_SELF_API: http://api:3001/internal/sales-handoff\n',
    '',
  );
  assert.deepEqual(workerWiringViolations(noDestination), [
    'THIEU_DICH_DEN:workflow-worker-sales-handoff-v1',
  ]);
});

test('ca am tinh: worker mat API_KEY phai DO — o AUTH_MODE=session no se an 401', () => {
  const noKey = MINIMAL.replace(
    '      WORKFLOW_WORKER_HEALTH_PORT: "8086"\n      WORKFLOW_DESTINATION_SELF_API: http://api:3001/internal/sales-handoff\n      API_KEY: ${API_KEY}\n',
    '      WORKFLOW_WORKER_HEALTH_PORT: "8086"\n      WORKFLOW_DESTINATION_SELF_API: http://api:3001/internal/sales-handoff\n',
  );
  assert.deepEqual(workerWiringViolations(noKey), [
    'THIEU_KHOA_DICH_VU:workflow-worker-sales-handoff-v1',
  ]);
});

test('ca am tinh: cap DATABASE_URL cho worker phai DO — do la duong toi listener zca thu hai', () => {
  const withDb = MINIMAL.replace(
    '      WORKFLOW_WORKER_TEMPLATE: sales-handoff-followup',
    '      DATABASE_URL: postgresql://zalo:x@postgres:5432/zalo\n      WORKFLOW_WORKER_TEMPLATE: sales-handoff-followup',
  );
  assert.deepEqual(workerWiringViolations(withDb), [
    'WORKER_CO_DB:workflow-worker-sales-handoff-v1',
  ]);
});

test('ca am tinh: hai worker dung chung cong suc khoe phai DO', () => {
  const samePort = MINIMAL.replace('WORKFLOW_WORKER_HEALTH_PORT: "8086"', 'WORKFLOW_WORKER_HEALTH_PORT: "8085"');
  assert.deepEqual(workerWiringViolations(samePort), ['TRUNG_CONG_SUC_KHOE:"8085"']);
});

test('ca am tinh: worker moi mo cong ra host phai DO', () => {
  // Cung luat voi ca cum — nhac lai o day vi service nay MOI, va mot service moi la luc de nhat
  // de ai do them `ports:` "cho tien debug".
  const published = MINIMAL.replace(
    '  workflow-worker-sales-handoff-v1:\n    profiles: ["workflow"]\n',
    '  workflow-worker-sales-handoff-v1:\n    profiles: ["workflow"]\n    ports:\n      - "8086:8086"\n',
  );
  assert.deepEqual(isolationViolations(published), [
    'CO_CONG_RA_HOST:workflow-worker-sales-handoff-v1',
  ]);
});
