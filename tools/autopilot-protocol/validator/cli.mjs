#!/usr/bin/env node
/**
 * CLI tat dinh cua giao thuc. In JSON ra stdout; ma thoat: 0 hop le · 1 khong hop le · 2 dung sai.
 *
 *   node validator/cli.mjs message   <file|->            # tach + kiem mot comment; in payload + khoa
 *   node validator/cli.mjs contract  <file|->            # kiem hop dong: JSON, hoac than Issue (Markdown)
 *   node validator/cli.mjs transition <from|-> <event>   # trang thai ke tiep ("-" = chua co task)
 *   node validator/cli.mjs key       <file|->            # khoa idempotency cua mot comment
 *   node validator/cli.mjs required-checks [ruleset.json] # required check tu ruleset (mac dinh: repo)
 *
 * Khong lenh nao goi mang. Day la thu orchestrator (task sau) goi voi bang chung no da lay.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { idempotencyKeyFor } from './idempotency.mjs';
import { readMessage } from './messages.mjs';
import { requiredChecksFromRuleset } from './gates.mjs';
import { NO_STATE, nextState } from './state-machine.mjs';
import { extractTaskContract, validateTaskContract } from './task-contract.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_RULESET = join(REPO_ROOT, '.github', 'rulesets', 'main-protection.json');

const EXIT = Object.freeze({ VALID: 0, INVALID: 1, USAGE: 2 });

/** @param {string | undefined} source */
function readInput(source) {
  if (source === undefined) throw new Error('thieu duong dan tep (hoac "-" de doc stdin)');
  return source === '-' ? readFileSync(0, 'utf8') : readFileSync(source, 'utf8');
}

/** @param {unknown} value */
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

/** @param {string[]} argv */
function run(argv) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'message': {
      const result = readMessage(readInput(rest[0]));
      if (!result.ok) return { code: EXIT.INVALID, out: result };
      return {
        code: EXIT.VALID,
        out: { ...result, idempotencyKey: idempotencyKeyFor(result.message) },
      };
    }
    case 'key': {
      const result = readMessage(readInput(rest[0]));
      if (!result.ok) return { code: EXIT.INVALID, out: result };
      return {
        code: EXIT.VALID,
        out: { ok: true, idempotencyKey: idempotencyKeyFor(result.message) },
      };
    }
    case 'contract': {
      const text = readInput(rest[0]);
      const trimmed = text.trimStart();
      const result = trimmed.startsWith('{')
        ? validateTaskContract(JSON.parse(text))
        : extractTaskContract(text);
      return { code: result.ok ? EXIT.VALID : EXIT.INVALID, out: result };
    }
    case 'transition': {
      const [from, event] = rest;
      if (from === undefined || event === undefined) throw new Error('can <from|-> <event>');
      const result = nextState(from === '-' ? NO_STATE : from, event);
      return { code: result.ok ? EXIT.VALID : EXIT.INVALID, out: result };
    }
    case 'required-checks': {
      const ruleset = JSON.parse(readFileSync(rest[0] ?? DEFAULT_RULESET, 'utf8'));
      const checks = requiredChecksFromRuleset(ruleset);
      return {
        code: checks.length > 0 ? EXIT.VALID : EXIT.INVALID,
        out: { ok: checks.length > 0, requiredChecks: checks },
      };
    }
    default:
      throw new Error(`lenh khong biet: ${String(command)}`);
  }
}

try {
  const { code, out } = run(process.argv.slice(2));
  print(out);
  process.exitCode = code;
} catch (error) {
  print({ ok: false, reason: 'USAGE', message: /** @type {Error} */ (error).message });
  process.exitCode = EXIT.USAGE;
}
