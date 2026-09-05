#!/usr/bin/env node
/**
 * SINH LAI hoac DOI CHIEU `fixtures/` tu mot ban clone gh-aw tai dung SHA da ghim.
 *
 *   node derive-fixtures.mjs <clone> --write   # doc clone, ghi de fixtures
 *   node derive-fixtures.mjs <clone>           # doc clone, so voi fixtures, LECH thi thoat 1
 *
 * Duong dan clone: doi so dau tien, hoac bien `GH_AW_REPO`.
 *
 * VI SAO TACH KHOI BAI KIEM
 *
 * Bai kiem trong `tests/` doc THANG `fixtures/` va khong can clone — nho vay CI chay duoc offline,
 * tat dinh, khong bi mat. Con tep nay la thu chung minh fixtures VAN DUNG voi upstream. Hai viec
 * do khac nhau: mot cai kiem KET LUAN, mot cai kiem NGUON CUA KET LUAN.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveCorpus, probeStandalone, probeValidationConfigStates } from './src/derive.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const upstream = JSON.parse(readFileSync(join(here, 'upstream.json'), 'utf8'));

const write = process.argv.includes('--write');
const repoRoot =
  process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? process.env.GH_AW_REPO;

if (!repoRoot || !existsSync(repoRoot)) {
  console.error(
    `Can mot ban clone github/gh-aw tai SHA ${upstream.auditedSha}.\n` +
      `  git clone https://github.com/github/gh-aw.git <dir>\n` +
      `  git -C <dir> checkout ${upstream.auditedSha}\n` +
      `  node derive-fixtures.mjs <dir>          (hoac dat GH_AW_REPO=<dir>)`,
  );
  process.exit(2);
}

// KHONG chap nhan mot clone o SHA khac: bang chung ghim SHA ma doc nham cay thi khong con la bang
// chung. Doc `.git/HEAD` truc tiep de khong phai goi `git`.
const headFile = join(repoRoot, '.git', 'HEAD');
const head = existsSync(headFile) ? readFileSync(headFile, 'utf8').trim() : '';
if (head.length > 0 && !head.startsWith(upstream.auditedSha)) {
  console.error(`Clone dang o \`${head}\`, khong phai SHA da ghim ${upstream.auditedSha}.`);
  process.exit(2);
}

const artefacts = {
  'permissions-corpus.json': deriveCorpus(repoRoot),
  'standalone-probe.json': probeStandalone(repoRoot),
  'validation-config-states.json': probeValidationConfigStates(repoRoot),
};

let drift = 0;
for (const [name, derived] of Object.entries(artefacts)) {
  const path = join(here, 'fixtures', name);
  const body = `${JSON.stringify({ auditedSha: upstream.auditedSha, ...derived }, null, 2)}\n`;
  if (write) {
    writeFileSync(path, body);
    console.log(`ghi   ${name}`);
    continue;
  }
  if (existsSync(path) && readFileSync(path, 'utf8') === body) {
    console.log(`khop  ${name}`);
    continue;
  }
  console.error(`LECH  ${name} — chay lai voi --write neu upstream that su da doi.`);
  drift += 1;
}

process.exit(drift === 0 ? 0 : 1);
