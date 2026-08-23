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
