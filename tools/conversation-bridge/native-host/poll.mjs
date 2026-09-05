/**
 * MOT VONG POLL — dieu phoi, khong quyet dinh.
 *
 * Moi luat nam o `decide.mjs`; moi lan cham mang nam o `github.mjs`; moi lan cham dia nam o
 * `ledger.mjs`. Tep nay chi noi chung theo dung thu tu, va thu tu do la phan chiu luc:
 *
 *   ... quyet dinh ... -> GHI KHOA (ATTEMPTED) -> GUI KHUNG WAKE
 *
 * Ghi truoc, gui sau. Neu dao lai, mot lan sap nguon giua hai buoc se de lai mot khoa CHUA ghi
 * cho mot tin nhan DA gui, va lan poll ke tiep se gui lai vao dung cuoc hoi thoai do. Xem the
 * than dau `ledger.mjs` ve dinh nghia AT-MOST-ONCE va cai gia cua no.
 *
 * `enabled: false` la mac dinh cua tep cau hinh mau, va o day no la mot cong THAT: khong mot lan
 * doc GitHub nao xay ra, khong phai "van doc nhung khong gui".
 */
import { getPullRequest, listRepositoryComments } from './github.mjs';
import { hashDeliveryKey } from '../protocol/delivery-key.mjs';
import { confirmLive, screenCarrier } from './decide.mjs';
import { saveLedger, withRecord } from './ledger.mjs';
import { wakeFrame } from '../extension/shared/ipc.js';
import { BRIDGE_REASONS, BRIDGE_STATES } from '../extension/shared/states.js';

/**
 * @typedef {object} BridgeRuntime
 * @property {import('./config.mjs').BridgeConfig} config
 * @property {unknown} registry
 * @property {import('./github.mjs').ApiReader} read
 * @property {{ current: () => import('./ledger.mjs').Ledger, replace: (next: import('./ledger.mjs').Ledger) => void }} ledgerStore
 * @property {(frame: unknown) => void} send
 * @property {{ emit: (record: Record<string, unknown>) => unknown }} logger
 * @property {() => string} now
 */

/**
 * @param {BridgeRuntime} runtime
 * @returns {Promise<{ scanned: number, sent: number, outcomes: Array<{ state: string, reason: string }> }>}
 */
export async function pollOnce(runtime) {
  const { config, registry, read, ledgerStore, send, logger, now } = runtime;
  /** @type {Array<{ state: string, reason: string }>} */
  const outcomes = [];
  if (!config.enabled) {
    logger.emit({ bridge_status: 'DISABLED', repo: config.repo });
    return { scanned: 0, sent: 0, outcomes };
  }

  const listed = await listRepositoryComments(read, config.repo);
  if (!listed.ok) {
    logger.emit({
      bridge_status: BRIDGE_STATES.REJECTED_STALE,
      error_code: BRIDGE_REASONS.LIVE_STATE_UNAVAILABLE,
      github_status: listed.status,
      repo: config.repo,
    });
    return { scanned: 0, sent: 0, outcomes };
  }

  let sent = 0;
  for (const comment of listed.comments) {
    const screened = screenCarrier({ comment, repo: config.repo, registry });
    if (!screened.ok) {
      // Van ban khong phai carrier la truong hop THUONG (moi comment cua nguoi deu roi vao day).
      // Ghi log no se lam ngap so, nen chi ghi cac tu choi CO Y NGHIA ve an ninh.
      if (screened.reason !== BRIDGE_REASONS.PROTOCOL_REJECTED) {
        logger.emit({
          bridge_status: screened.state,
          error_code: screened.reason,
          repo: config.repo,
        });
        outcomes.push({ state: screened.state, reason: screened.reason });
      }
      continue;
    }

    const live = await getPullRequest(read, config.repo, screened.carrier.pr);
    const confirmed = confirmLive({
      carrier: screened.carrier,
      repo: config.repo,
      live,
      ledger: ledgerStore.current(),
    });
    if (!confirmed.ok) {
      logger.emit({
        bridge_status: confirmed.state,
        error_code: confirmed.reason,
        repo: config.repo,
        pr: screened.carrier.pr,
        head_sha: screened.carrier.headSha,
      });
      outcomes.push({ state: confirmed.state, reason: confirmed.reason });
      continue;
    }

    const nextLedger = withRecord(ledgerStore.current(), confirmed.key, 'ATTEMPTED', now());
    const saved = saveLedger(config.statePath, nextLedger);
    if (!saved.ok) {
      // Khong ghi duoc so thi KHONG GUI. Gui ma khong ghi duoc la mo duong cho mot vong lap gui.
      logger.emit({
        bridge_status: BRIDGE_STATES.REJECTED_STALE,
        error_code: saved.error,
        repo: config.repo,
        pr: confirmed.wake.pr,
      });
      outcomes.push({ state: BRIDGE_STATES.REJECTED_STALE, reason: saved.error });
      continue;
    }
    ledgerStore.replace(nextLedger);

    send(wakeFrame({ key: confirmed.key, ...confirmed.wake }));
    sent += 1;
    logger.emit({
      bridge_status: BRIDGE_STATES.ARMED_EXACT_CHAT,
      state: 'WAKE_DISPATCHED',
      repo: config.repo,
      pr: confirmed.wake.pr,
      head_sha: confirmed.wake.headSha,
      idempotency_key_hash: hashDeliveryKey(confirmed.key),
    });
    outcomes.push({ state: BRIDGE_STATES.ARMED_EXACT_CHAT, reason: 'WAKE_DISPATCHED' });
  }
  return { scanned: listed.comments.length, sent, outcomes };
}

/**
 * Ket qua tu tien ich bao ve. Chi cap nhat trang thai cua mot khoa DA co trong so — mot khung
 * RESULT khong bao gio duoc TAO ra mot khoa moi, vi nhu the tien ich se ghi duoc vao so cua host.
 * @param {BridgeRuntime} runtime
 * @param {{ key: string, state: string, reason: string }} result
 */
export function applyResult(runtime, result) {
  const ledger = runtime.ledgerStore.current();
  if (!Object.prototype.hasOwnProperty.call(ledger.records, result.key)) {
    runtime.logger.emit({ error_code: 'RESULT_FOR_UNKNOWN_KEY' });
    return false;
  }
  const next = withRecord(ledger, result.key, result.state, runtime.now());
  if (saveLedger(runtime.config.statePath, next).ok) runtime.ledgerStore.replace(next);
  runtime.logger.emit({
    bridge_status: result.state,
    error_code: result.reason,
    idempotency_key_hash: hashDeliveryKey(result.key),
  });
  return true;
}
