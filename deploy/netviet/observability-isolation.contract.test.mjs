import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * CACH LY QUAN SAT THEO TENANT — HOP DONG, khong phai mot y dinh.
 *
 * ==============================================================================================
 * VI SAO BAI NAY TON TAI:
 *
 * Telemetry la thu chua NHIEU NHAT ve nghiep vu cua mot khach: noi dung tin nhan, ma don, gia,
 * doi khi ca du lieu ca nhan. Mot ro ri cheo o day khong phai "mot bug quan sat" — do la du lieu
 * thuong mai cua khach A hien ra cho khach B.
 *
 * `docs/kien-truc/reference-platform-stack.md` §8 chon cach ly BANG KIEN TRUC: pipeline duoc chon
 * boi LISTENER da nhan ket noi, ma listener do doi dung credential cua tenant do. Cai bi loai la
 * cach ai cung chon dau tien — `routingconnector` doc header `X-Tenant` roi loc.
 *
 * Khac biet giua hai cach KHONG nhin thay duoc luc chay: ca hai deu "hoat dong". No chi lo ra khi
 * co ke thu hai, hoac khi ai do gui sai header. Nen no phai la mau do o day.
 *
 * ==============================================================================================
 * BAI NAY DUNG DUOC KE CA KHI COLLECTOR CHUA DUNG CHUNG.
 *
 * Hom nay moi stack co collector cua rieng no (mat phang dieu khien dung chung thuoc P4/P6, va P2
 * bi cam bat dau no). Nhung khuon cau hinh giu nguyen hinh dang §8.3 — moi khoi mang ten rieng
 * theo stack — nen phep gop N tep lai la mot phep NOI CHUOI. Bai duoi day dung dung phep noi do
 * de kiem: no render HAI cau hinh, ghep lai, va hoi "co duong nao tu A sang B khong".
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER = resolve(HERE, 'observability/render-otel-collector.sh');
const TEMPLATE = resolve(HERE, 'observability/otel-collector.template.yaml');

/** Hai stack TRUNG TINH — base khong duoc nhac ten khach nao (CLAUDE.md QD#6). */
const STACK_A = 'acme-gd1-test';
const STACK_B = 'globex-pilot';

const scratch = mkdtempSync(join(tmpdir(), 'obs-isolation-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

function render(slug) {
  const out = join(scratch, `${slug}.yaml`);
  const result = spawnSync('bash', [RENDER, slug, out], { encoding: 'utf8' });
  strictEqual(result.status, 0, `render that bai cho ${slug}: ${result.stderr}`);
  return readFileSync(out, 'utf8');
}

/** Bo chu thich — moi khang dinh duoi day noi ve CAU HINH, khong ve van xuoi. */
function configOnly(yaml) {
  return yaml
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

const configA = configOnly(render(STACK_A));
const configB = configOnly(render(STACK_B));

describe('cach ly quan sat: dinh tuyen bang listener + credential, khong bang bo loc', () => {
  it('KHONG co `default_pipelines` — mot tai trong khong khop khong duoc di tiep', () => {
    // `default_pipelines` la fail-OPEN: khong khop route nao thi VAN xuat. Do la duong ma mot tai
    // trong khong xac thuc duoc van toi duoc mot kho nao do.
    ok(!configA.includes('default_pipelines'), 'cau hinh khong duoc co default_pipelines');
  });

  it('KHONG dinh tuyen theo header hay metadata do ben gui khai', () => {
    const banned = ['routingconnector', 'X-Tenant', 'otelcol.client.metadata', 'from_attribute'];
    for (const term of banned) {
      ok(!configA.includes(term), `cau hinh khong duoc nhac toi ${term}`);
    }
  });

  it('MOI receiver deu doi mot authenticator — khong co cua khong khoa', () => {
    const receivers = [...configA.matchAll(/^ {2}(otlp\/[a-z0-9-]+):/gm)].map((match) => match[1]);
    ok(receivers.length > 0, 'phai co it nhat mot receiver');

    for (const receiver of receivers) {
      const from = configA.indexOf(`  ${receiver}:`);
      const body = configA.slice(from, configA.indexOf('\nprocessors:', from));
      ok(
        /authenticator:\s*bearertokenauth\//.test(body),
        `receiver ${receiver} phai gan mot bearertokenauth`,
      );
    }
  });

  it('khoa doc tu TEP DUOC MOUNT, khong tu bien moi truong cua tien trinh', () => {
    // `token:`/`tokens:` dat khoa THANG vao cau hinh; bien moi truong thi lam no lo ra trong
    // `docker inspect`. `filename` la duong ma `secrets.env` va `release.json` da di.
    ok(/filename:\s*\/run\/otlp-keys\//.test(configA), 'phai dung `filename`');
    ok(!/^\s*tokens?:/m.test(configA), 'khong duoc dat khoa truc tiep trong cau hinh');
  });

  it('mat khau ghi cua ClickHouse den tu bien moi truong luc trien khai, khong nam trong repo', () => {
    ok(configA.includes('password: ${env:CLICKHOUSE_WRITER_PASSWORD}'));
    // `password_file` KHONG ton tai o `clickhouseexporter` — viet ra mot khoa khong co thuc la tu
    // tao mot cam giac an toan gia.
    ok(!configA.includes('password_file'), 'clickhouseexporter khong co khoa `password_file`');
  });

  it('retention duoc dat THEO exporter, tuc theo tenant', () => {
    ok(/ttl:\s*\d+h/.test(configA), 'exporter phai khai ttl');
  });
});

/** Doc so do `traces/<slug>: { receivers: [...], exporters: [...] }` tu khoi `service.pipelines`. */
function pipelines(config) {
  const section = config.slice(config.indexOf('  pipelines:'));
  const names = [...section.matchAll(/^ {4}(traces\/[a-z0-9-]+):/gm)].map((match) => match[1]);

  return names.map((name) => {
    const block = section.slice(section.indexOf(`    ${name}:`));
    const list = (key) =>
      (new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(block)?.[1] ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return { name, receivers: list('receivers'), exporters: list('exporters') };
  });
}

describe('hai stack ghep chung mot cau hinh: KHONG ton tai duong A -> B', () => {
  const all = [...pipelines(configA), ...pipelines(configB)];

  it('moi pipeline chi noi receiver va exporter CUNG MOT stack', () => {
    strictEqual(all.length, 2, `phai co dung 2 pipeline, dang co ${all.length}`);

    const crossings = all.filter(({ name, receivers, exporters }) => {
      const slug = name.slice('traces/'.length);
      const sameSide = (component) => component.endsWith(`/${slug}`);
      return !receivers.every(sameSide) || !exporters.every(sameSide);
    });

    deepStrictEqual(crossings, [], 'khong pipeline nao duoc noi cheo hai stack');
  });

  it('hai stack dung hai khoa khac nhau va hai database khac nhau', () => {
    const keyA = /filename:\s*(\S+)/.exec(configA)?.[1];
    const keyB = /filename:\s*(\S+)/.exec(configB)?.[1];
    ok(keyA && keyB && keyA !== keyB, `khoa phai khac nhau: ${keyA} vs ${keyB}`);

    const dbA = /database:\s*(\S+)/.exec(configA)?.[1];
    const dbB = /database:\s*(\S+)/.exec(configB)?.[1];
    ok(dbA && dbB && dbA !== dbB, `database phai khac nhau: ${dbA} vs ${dbB}`);
  });

  it('ten database/user cua ClickHouse khong mang dau `-` (ClickHouse khong nhan)', () => {
    for (const config of [configA, configB]) {
      const db = /database:\s*(\S+)/.exec(config)?.[1];
      ok(db && !db.includes('-'), `ten database khong duoc co dau '-': ${db}`);
      const user = /username:\s*(\S+)/.exec(config)?.[1];
      ok(user && !user.includes('-'), `ten user khong duoc co dau '-': ${user}`);
    }
  });
});

describe('renderer tu choi dau vao xau', () => {
  it('slug co ky tu la -> dung han, khong ghi ra cau hinh nao', () => {
    const bad = ['../escape', 'has space', 'Upper', '$(whoami)', ''];
    for (const slug of bad) {
      const result = spawnSync('bash', [RENDER, slug, join(scratch, 'khong-duoc-tao.yaml')], {
        encoding: 'utf8',
      });
      ok(result.status !== 0, `slug '${slug}' phai bi tu choi`);
    }
  });

  it('khong nhac ten khach nao trong PHAN CAU HINH cua khuon — day la nen tang', () => {
    const template = configOnly(readFileSync(TEMPLATE, 'utf8')).toLowerCase();
    for (const name of ['ultty', 'amico', 'netviet']) {
      ok(!template.includes(name), `khuon khong duoc nhac ${name} trong phan cau hinh`);
    }
  });
});

/**
 * ==============================================================================================
 * DUONG DOC — chieu nguoc lai cua ca tep tren.
 *
 * Cac bai o tren khoa duong GHI: telemetry cua khach nay khong the roi vao kho cua khach kia.
 * Bai duoi day khoa duong DOC: `api` phai co du manh de lui ve kho lich su, va no phai lui bang
 * mot credential CHI DOC.
 *
 * Vi sao dang mot hop dong chu khong phai mot bai unit: ca ba tang deu co the dung rieng le ma
 * van hong chung — bien duoc render nhung khong vao compose, hoac vao compose cua SAI service.
 * Ca hai hinh dang do da xay ra that (`ADVICE_COMPOSER`, 19-21/08), va ca hai deu hong IM LANG:
 * khong loi, khong canh bao, chi la mot Debug View mai mai bao "khong con luu".
 */
describe('duong doc lich su cua Debug View', () => {
  const compose = readFileSync(join(HERE, 'compose.yaml'), 'utf8');
  const renderSecrets = readFileSync(join(HERE, 'render-secrets.sh'), 'utf8');
  // Cat dung khoi cua service `api`: mot bien nam trong compose nhung o service KHAC thi khong
  // bao gio toi tien trinh can no.
  const apiService = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  web:'));

  it('service `api` nhan du bon manh de mo duoc duong doc', () => {
    for (const key of [
      'CLICKHOUSE_READER_ENDPOINT',
      'CLICKHOUSE_READER_USER',
      'CLICKHOUSE_READER_PASSWORD',
      'CLICKHOUSE_DATABASE',
    ]) {
      ok(
        new RegExp(`^[ \t]+${key}:`, 'm').test(apiService),
        `service api thieu ${key} — Debug View se mai mai bao "khong con luu" du kho van con`,
      );
    }
  });

  it('credential DOC di toi `api`, credential GHI thi khong', () => {
    ok(
      !/^[ \t]+CLICKHOUSE_WRITER_PASSWORD:/m.test(apiService),
      'api KHONG duoc nhan mat khau GHI: mot loi o tang doc khi do co the thanh mot phep ghi',
    );
  });

  it('user doc chi duoc cap SELECT, va khac user ghi', () => {
    ok(
      /GRANT SELECT ON \$\{CLICKHOUSE_DATABASE\}\.\* TO \$\{CLICKHOUSE_READER_USER\}/.test(
        renderSecrets,
      ),
      'user doc phai duoc cap dung SELECT — day la lop cach ly khong go duoc tu phia ung dung',
    );
    ok(
      /CLICKHOUSE_READER_USER="\$\{CLICKHOUSE_DB_SLUG\}_reader"/.test(renderSecrets) &&
        /CLICKHOUSE_WRITER_USER="\$\{CLICKHOUSE_DB_SLUG\}_writer"/.test(renderSecrets),
      'user doc va user ghi phai la hai user khac nhau (§8.1 dieu 3)',
    );
  });

  it('hai khoa den tu hai secret KHAC NHAU, deu mang slug cua stack', () => {
    ok(
      /CLICKHOUSE_READER_PASSWORD="\$\(optional_secret zalo-\$\{STACK_SLUG\}-clickhouse-reader-password\)"/.test(
        renderSecrets,
      ),
      'khoa doc phai den tu secret rieng cua stack, khong dung chung voi khoa ghi',
    );
  });

  it('dia chi kho GHI CUNG trong compose, khong doc tu secrets.env', () => {
    ok(
      /CLICKHOUSE_READER_ENDPOINT:[ \t]+http:\/\/clickhouse:8123/.test(apiService),
      'dia chi kho la su that ve TOPO cua compose — mot gia tri sai o secrets.env se tro duong ' +
        'doc cua stack nay vao kho cua stack khac',
    );
  });
});
