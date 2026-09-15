#!/usr/bin/env node
/**
 * Giao dien dong lenh cua dispatcher.
 *
 * MAC DINH AN TOAN o hai tang doc lap, va can CA HAI moi chay that:
 *   - `plan` la lenh mac dinh; `once` khong lam gi neu thieu `--execute`;
 *   - cau hinh phai co `enabled: true` (`assertArmed`).
 *
 * Mot tang thi de bi vo tinh vuot qua. Hai tang thi phai co y: nguoi van hanh vua sua cau hinh
 * vua go them mot co.
 *
 * KHONG co lenh nao cai dat dich vu, khong co lenh nao ghi Task Scheduler, va khong co lenh nao
 * nhan chuoi tu GitHub lam doi so. Chi mot duong: doc cau hinh cuc bo -> chay `runOnce`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadConfig } from './config.mjs';
import { createGh } from './gh.mjs';
import { createGit } from './worktree-manager.mjs';
import { createLedger } from './ledger.mjs';
import { createLogger } from './logger.mjs';
import { execFile, spawnProcess } from './exec.mjs';
import { MODES, runOnce } from './run.mjs';

const USAGE = `autopilot-dispatcher — mat phang thuc thi cuc bo cua Nexagent Autopilot V0

  autopilot-dispatcher plan   --config <file> [--issue <n>]
  autopilot-dispatcher once   --config <file> [--issue <n>] --execute
  autopilot-dispatcher status --config <file>

  plan     do het moi cong roi IN ra ke hoach. Khong tao worktree, khong phong Claude.
  once     nhu tren, nhung co --execute thi thuc su tao worktree va phong DUNG MOT lan.
  status   doc so cai cuc bo va in trang thai cac lan dieu phoi da biet.

Prompt di qua stdin cua tien trinh con, khong bao gio qua dong lenh. Model bi khoa o Opus va
effort bi khoa o max; khong co duong ha cap im lang.`;

/** @param {ReadonlyArray<string>} argv */
export function parseArgs(argv) {
  const [command = 'plan', ...rest] = argv;
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    i += 1;
  }
  return { command, flags };
}

/** @param {Record<string, string | boolean>} flags */
function configPathFrom(flags) {
  const value = flags.config;
  if (typeof value !== 'string' || value.trim() === '') return null;
  return path.resolve(value);
}

/**
 * @param {ReadonlyArray<string>} argv
 * @param {{ stdout?: (line: string) => void, stderr?: (line: string) => void }} [io]
 * @param {{ deps?: Record<string, unknown> }} [overrides] chi de TEST thay the bien gioi I/O.
 *   Khong doc tu moi truong, khong doc tu cau hinh, va tuyet doi khong den tu GitHub.
 */
export async function main(argv, io = {}, overrides = {}) {
  const out = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const err = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  const { command, flags } = parseArgs(argv);

  if (command === 'help' || flags.help === true) {
    out(USAGE);
    return 0;
  }
  if (!['plan', 'once', 'status'].includes(command)) {
    err(`unknown command: ${command}`);
    err(USAGE);
    return 2;
  }
  const configFile = configPathFrom(flags);
  if (configFile === null) {
    err('missing --config <file>');
    return 2;
  }
  const loaded = loadConfig(configFile, fs);
  if (!loaded.ok) {
    err(JSON.stringify({ event: 'config.rejected', reason: loaded.reason, detail: loaded.detail }));
    return 2;
  }
  const config = loaded.config;
  const logger = createLogger({ sink: out });

  if (command === 'status') {
    const ledger = createLedger({ dir: config.stateDir });
    const all = ledger.readAll();
    if (!all.ok) {
      err(JSON.stringify({ event: 'ledger.unreadable', reason: all.reason }));
      return 1;
    }
    for (const record of Object.values(all.records)) {
      logger.log('ledger.record', {
        repo: record.repo,
        issue: record.issue,
        task_id: record.taskId,
        contract_digest: record.contractDigest,
        branch: record.branch,
        state: record.state,
        model: record.model,
        effort: record.effort,
        ...(record.lastReason ? { reason: record.lastReason } : {}),
      });
    }
    return 0;
  }

  const mode = command === 'once' && flags.execute === true ? MODES.EXECUTE : MODES.PLAN;
  if (command === 'once' && mode === MODES.PLAN) {
    err('refusing: `once` needs --execute to do anything. Showing plan instead.');
  }

  const result = await runOnce({
    config,
    mode,
    issue: typeof flags.issue === 'string' ? Number(flags.issue) : undefined,
    deps: {
      gh: createGh({ exec: execFile }),
      git: createGit({ exec: execFile, cwd: process.cwd() }),
      ledger: createLedger({ dir: config.stateDir }),
      exec: execFile,
      spawn: spawnProcess,
      logger,
      ...overrides.deps,
    },
  });
  return result.ok ? 0 : 1;
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli.mjs')) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      // Khong in `error` nguyen ven: stack co the mang duong dan va doi so. Chi in TEN loi.
      process.stderr.write(`${JSON.stringify({ event: 'fatal', name: String(error?.name) })}\n`);
      process.exitCode = 1;
    },
  );
}
/* c8 ignore stop */
