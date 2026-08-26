#!/usr/bin/env node
/**
 * TUONG THUAT lai mot lan deploy — KHONG phai mot cong chan.
 *
 * Tep nay LUON thoat 0, ke ca khi lan deploy that bai nang. Ly do: neu no tu lam cong thi mot
 * bao cao hong se lam do mot lan deploy tot, va ai do se go no ra khoi duong CD. Viec chan nam o
 * buoc GitHub Actions doc `deploy-signals.json` — xem `reusable-deploy-tenant.yml`.
 *
 * Ba noi ghi ra, ba doc gia khac nhau:
 *   - `$GITHUB_STEP_SUMMARY` -> NGUOI truc, doc trong vai giay;
 *   - `--json-out`           -> buoc sau cua workflow, va Fleet View sau nay;
 *   - `$GITHUB_OUTPUT`       -> dieu kien `if:` cua chinh workflow do.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  evaluateDeploySignals,
  formatDeploySummary,
  parseSignalJournal,
  toMachineResult,
} from './deploy-signals.mjs';

function parseArguments(argv) {
  const pairs = {};
  for (const [index, value] of argv.entries()) {
    if (!value.startsWith('--')) continue;
    pairs[value.slice(2)] = argv[index + 1];
  }
  return pairs;
}

/**
 * Doc so nhat ky. Khong doc duoc file la mot TRANG THAI CO NGHIA, khong phai mot su co cua bao
 * cao: no nghia la lan deploy chet truoc khi kip ghi dong nao — va evaluator se ket luan
 * `DEPLOY_SIGNAL_INCOMPLETE`, dung nhu no phai the.
 */
function readJournal(path) {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    process.stderr.write(`deploy-signals: khong doc duoc so nhat ky tai ${path}\n`);
    return '';
  }
}

function writeIfPossible(path, content, label) {
  if (!path) return;
  try {
    writeFileSync(path, content, { encoding: 'utf8', mode: 0o644 });
  } catch (error) {
    process.stderr.write(`deploy-signals: khong ghi duoc ${label}: ${String(error)}\n`);
  }
}

function appendIfPossible(path, content, label) {
  if (!path) return;
  try {
    appendFileSync(path, content, 'utf8');
  } catch (error) {
    process.stderr.write(`deploy-signals: khong ghi duoc ${label}: ${String(error)}\n`);
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const remoteExitCode = Number.parseInt(args['remote-exit-code'] ?? '0', 10);
  const journal = readJournal(args.journal);
  const parsed = parseSignalJournal(journal);
  const result = evaluateDeploySignals({
    entries: parsed.entries,
    remoteExitCode: Number.isFinite(remoteExitCode) ? remoteExitCode : 1,
  });
  const machine = toMachineResult(result);
  const summary = formatDeploySummary(result);

  writeIfPossible(args['json-out'], `${JSON.stringify(machine, null, 2)}\n`, 'ket qua may doc');
  appendIfPossible(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'step summary');
  appendIfPossible(
    process.env.GITHUB_OUTPUT,
    [
      `hard_failure=${String(result.hardFailure)}`,
      `live_ai_failure=${String(result.liveAiFailure)}`,
      `classification=${result.classification}`,
      `failed_layer=${result.failedLayer ?? ''}`,
      '',
    ].join('\n'),
    'github output',
  );

  process.stdout.write(`${summary}\n`);
  if (parsed.malformed.length > 0) {
    process.stderr.write(
      `deploy-signals: bo qua ${parsed.malformed.length} dong tin hieu hong khuon.\n`,
    );
  }
}

const isEntrypoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntrypoint) main();
