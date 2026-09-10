/**
 * DIEM VAO CUA NATIVE HOST — tien trinh do CHINH CHROME khoi dong.
 *
 * Chrome sinh tien trinh nay khi tien ich goi `chrome.runtime.connectNative(...)`, noi `stdin`/
 * `stdout` cua no vao duong ong, roi giet no khi tien ich ngat ket noi. Nghia la:
 *
 *   · KHONG co cong vao nao duoc mo. Vong doi tien trinh do trinh duyet quan (#204 §1.3).
 *   · `stdout` LA duong ong. Mot dong `console.log` lac vao do se lam Chrome doc phai mot khung
 *     rac roi ngat ket noi — nen moi log di ra `stderr` (xem `log.mjs`).
 *   · Khong co doi so dong lenh nao den tu nguoi dung; Chrome truyen duong dan goc cua tien ich.
 *     Duong dan cau hinh lay tu bien moi truong hoac tu mac dinh canh tep nay.
 */
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFrameDecoder, encodeFrame } from './framing.mjs';
import { createLogger } from './log.mjs';
import { loadConfig } from './config.mjs';
import { loadLedger } from './ledger.mjs';
import { readerFor } from './github.mjs';
import { applyReset, applyResult, pollOnce } from './poll.mjs';
import { registryFromConfig } from '../protocol/provenance.mjs';
import { decodeFrame, IPC_KINDS } from '../extension/shared/ipc.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_CONFIG_PATH = resolve(HERE, '..', 'config.json');

/** @param {NodeJS.ProcessEnv} env */
export function configPathFrom(env) {
  const fromEnv = env.CONVERSATION_BRIDGE_CONFIG;
  if (typeof fromEnv !== 'string' || fromEnv.trim().length === 0) return DEFAULT_CONFIG_PATH;
  const trimmed = fromEnv.trim();
  return isAbsolute(trimmed) ? trimmed : resolve(process.cwd(), trimmed);
}

/**
 * Dung runtime tu cau hinh. Moi duong hong deu tra ve loi CO MA, khong nem — mot native host nem
 * ra ngoai se chet lang le va Chrome chi bao "Native host has exited".
 * @param {{ configPath: string, send: (frame: unknown) => void, logger: ReturnType<typeof createLogger> }} input
 * @returns {{ ok: true, runtime: import('./poll.mjs').BridgeRuntime } | { ok: false, error: string }}
 */
export function buildRuntime({ configPath, send, logger }) {
  const loaded = loadConfig(configPath);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const config = loaded.config;
  const statePath = isAbsolute(config.statePath)
    ? config.statePath
    : resolve(dirname(configPath), config.statePath);
  const registry = registryFromConfig(config.allowedProducers);
  if (!registry.ok) return { ok: false, error: registry.reason };
  const ledger = loadLedger(statePath);
  if (!ledger.ok) return { ok: false, error: ledger.error };

  let current = ledger.ledger;
  return {
    ok: true,
    runtime: {
      config: { ...config, statePath },
      registry: registry.registry,
      read: readerFor(config),
      ledgerStore: {
        current: () => current,
        replace: (next) => {
          current = next;
        },
      },
      send,
      logger,
      now: () => new Date().toISOString(),
    },
  };
}

/* c8 ignore start -- day la phan noi day voi tien trinh that; logic o tren deu co bai kiem rieng */
export function main() {
  const logger = createLogger();
  /** @param {unknown} frame */
  const send = (frame) => process.stdout.write(encodeFrame(frame));
  const built = buildRuntime({ configPath: configPathFrom(process.env), send, logger });
  if (!built.ok) {
    logger.emit({ error_code: built.error, bridge_status: 'HOST_NOT_STARTED' });
    process.exitCode = 1;
    return;
  }
  const runtime = built.runtime;
  const decoder = createFrameDecoder();
  let polling = false;

  const tick = async () => {
    if (polling) return;
    polling = true;
    try {
      await pollOnce(runtime);
    } catch {
      logger.emit({ error_code: 'POLL_FAILED', bridge_status: 'REJECTED_STALE' });
    } finally {
      polling = false;
    }
  };

  const timer = setInterval(() => void tick(), runtime.config.pollIntervalSeconds * 1000);
  timer.unref?.();

  process.stdin.on('data', (chunk) => {
    const pushed = decoder.push(chunk);
    if (!pushed.ok) {
      logger.emit({ error_code: pushed.error, bridge_status: 'HOST_NOT_STARTED' });
      process.exit(1);
    }
    for (const frame of pushed.frames) {
      const decoded = decodeFrame(frame);
      if (!decoded.ok) {
        logger.emit({ error_code: decoded.error });
        continue;
      }
      if (decoded.frame.kind === IPC_KINDS.HELLO) {
        void tick();
        continue;
      }
      if (decoded.frame.kind === IPC_KINDS.RESULT) {
        applyResult(runtime, /** @type {any} */ (decoded.frame));
        continue;
      }
      // Hoa giai mot khoa da "chay". Khung nay den tu mot cu cham cua NGUOI tren trang tuy chon —
      // `applyReset` van kiem lai tung cong nhu the no den tu mot noi khong tin cay.
      if (decoded.frame.kind === IPC_KINDS.RESET) {
        applyReset(runtime, /** @type {any} */ (decoded.frame));
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
/* c8 ignore stop */
