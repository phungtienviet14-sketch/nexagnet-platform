/**
 * Mot `BridgeRuntime` that, tru phan mang. So duoc ghi ra mot thu muc tam THAT — vi bai kiem
 * "khoi dong lai khong giao trung" chi co nghia neu so that su di qua dia.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyLedger, loadLedger } from '../../native-host/ledger.mjs';
import { registryFromConfig } from '../../protocol/provenance.mjs';
import { createLogger } from '../../native-host/log.mjs';
import { ALLOWED_PRODUCERS, REPO, fakeReader } from './github.mjs';

export function tempStatePath() {
  return join(mkdtempSync(join(tmpdir(), 'cbridge-')), 'delivery-ledger.json');
}

/**
 * @param {{
 *   comments?: unknown[],
 *   pulls?: Record<number, unknown>,
 *   failWith?: number,
 *   enabled?: boolean,
 *   statePath?: string,
 *   producers?: ReadonlyArray<unknown>,
 * }} [options]
 */
export function makeRuntime({
  comments = [],
  pulls = {},
  failWith,
  enabled = true,
  statePath = tempStatePath(),
  producers = ALLOWED_PRODUCERS,
} = {}) {
  const registry = registryFromConfig(/** @type {any} */ (producers));
  const { read, calls } = fakeReader({ comments, pulls, failWith });
  const loaded = loadLedger(statePath);
  let current = loaded.ok ? loaded.ledger : emptyLedger();
  /** @type {unknown[]} */
  const sentFrames = [];
  /** @type {string[]} */
  const logLines = [];
  return {
    statePath,
    calls,
    sentFrames,
    logLines,
    ledgerNow: () => current,
    runtime: {
      config: {
        repo: REPO,
        allowedProducers: /** @type {any} */ (producers),
        pollIntervalSeconds: 120,
        enabled,
        statePath,
        githubAccess: /** @type {'gh-cli'} */ ('gh-cli'),
      },
      registry: registry.ok ? registry.registry : undefined,
      read,
      ledgerStore: {
        current: () => current,
        replace: (next) => {
          current = next;
        },
      },
      send: (frame) => sentFrames.push(frame),
      logger: createLogger({
        write: (line) => logLines.push(line.trim()),
        now: () => '2026-09-05T03:00:00.000Z',
      }),
      now: () => '2026-09-05T03:00:00.000Z',
    },
  };
}
