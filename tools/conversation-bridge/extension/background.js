/**
 * SERVICE WORKER — day day noi, khong chua quyet dinh nao.
 *
 * Moi luat nam trong `shared/` (thuan, kiem duoc bang `node --test`): `wake-router.js` quyet dinh
 * mot khung WAKE di ve dau, `native-link.js` quyet dinh khi nao mo lai duong ong, `reset-request.js`
 * quyet dinh mot lan hoa giai khoa lam gi. O day chi co day noi va vong doi. Neu ban thay minh dang
 * viet mot dieu kien `if` ve nghiep vu trong tep nay, no thuoc ve `shared/`.
 *
 * KHONG co content script thuong tru, KHONG co bo theo doi thay doi trang, KHONG co bo lang nghe
 * su kien tab. Tien ich nay khong quan sat gi ca — no chi hanh dong khi duong ong noi, hoac khi
 * nguoi dung bam mot nut tren trang tuy chon.
 *
 * VE VONG DOI MV3: Chrome thu hoi service worker bat ky luc nao. `link.open()` duoc goi o muc
 * module, nen MOI lan worker song lai deu la mot co hoi mo lai duong ong — ke ca khi no song lai
 * chi vi mot tin nhan tu trang tuy chon. Trang thai lui (`failures`) co y KHONG duoc luu ben: mot
 * worker moi la mot khoi dau moi, va do la hanh vi dung.
 */
import { decodeFrame, helloFrame, resultFrame, IPC_KINDS } from './shared/ipc.js';
import { routeWakeFrame } from './shared/wake-router.js';
import { ARM_STORAGE_KEY, DELIVERED_STORAGE_KEY } from './shared/arming.js';
import { LINK_STATUS_STORAGE_KEY, MESSAGE_KINDS } from './shared/link-messages.js';
import { LINK_TRIGGERS, createNativeLink } from './shared/native-link.js';
import { applyResetResult, buildResetRequest } from './shared/reset-request.js';
import { RESET_REASONS, RESET_STATES, resetOutcome } from './shared/states.js';

const NATIVE_HOST_NAME = 'com.nexagnet.conversation_bridge';

/** Bao lau thi coi nhu host khong tra loi mot khung RESET. Mot con so, khong phai mot vong lap. */
const RESET_TIMEOUT_MS = 10_000;

const readDelivered = async () => {
  const stored = (await chrome.storage.local.get(DELIVERED_STORAGE_KEY))[DELIVERED_STORAGE_KEY];
  return typeof stored === 'object' && stored !== null
    ? /** @type {Record<string, unknown>} */ (stored)
    : {};
};

/** @param {Record<string, unknown>} next */
const writeDelivered = async (next) => {
  await chrome.storage.local.set({ [DELIVERED_STORAGE_KEY]: next });
};

/** @type {import('./shared/wake-router.js').RouterDeps} */
const deps = {
  readArm: async () => (await chrome.storage.local.get(ARM_STORAGE_KEY))[ARM_STORAGE_KEY],
  readDelivered,
  writeDelivered,
  queryTabs: (url) => chrome.tabs.query({ url }),
  executeInTab: async ({ tabId, func, args }) => {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: /** @type {(...a: never[]) => unknown} */ (func),
      args: [...args],
    });
    const result = results?.[0]?.result;
    return typeof result === 'object' && result !== null
      ? /** @type {{ ok: boolean, reason: string }} */ (result)
      : { ok: false, reason: 'SUBMIT_FAILED' };
  },
  now: () => new Date().toISOString(),
};

/**
 * Mot khung RESET dang cho tra loi. Toi da MOT — hoa giai la mot thao tac cua nguoi, khong phai
 * mot hang doi, va cho phep nhieu lan song song chi de ra cau hoi "khoa nao ung voi ket qua nao".
 * @type {{ key: string, settle: (outcome: { ok: boolean, state: string, reason: string }) => void, timer: unknown } | null}
 */
let pendingReset = null;

/** @param {{ ok: boolean, state: string, reason: string }} outcome */
function settlePendingReset(outcome) {
  if (pendingReset === null) return;
  const waiting = pendingReset;
  pendingReset = null;
  globalThis.clearTimeout(/** @type {any} */ (waiting.timer));
  waiting.settle(outcome);
}

const link = createNativeLink({
  connectNative: () => chrome.runtime.connectNative(NATIVE_HOST_NAME),
  setTimer: (fn, delayMs) => globalThis.setTimeout(fn, delayMs),
  clearTimer: (handle) => globalThis.clearTimeout(/** @type {any} */ (handle)),
  now: () => Date.now(),
  onOpen: (port) => port.postMessage(helloFrame()),
  onStatus: (status) => {
    // Trang thai duong ong duoc luu de trang tuy chon doc duoc ngay ca khi worker vua song lai.
    void chrome.storage.local.set({ [LINK_STATUS_STORAGE_KEY]: status });
    // Duong ong dut giua chung thi mot lan hoa giai dang cho se khong bao gio co ket qua.
    if (!link.isConnected()) settlePendingReset(resetOutcome(RESET_REASONS.RESET_LINK_DOWN));
  },
  onFrame: (frame, port) => {
    void handleFrame(frame, port);
  },
});

/**
 * @param {unknown} frame
 * @param {import('./shared/native-link.js').LinkPort} port
 */
async function handleFrame(frame, port) {
  const decoded = decodeFrame(frame);
  // Khung hong khong duoc di xa hon. Im lang la dung o day: tra ve mot khung khong hop le chinh la
  // thu ma phia kia se tu choi.
  if (!decoded.ok) return;

  if (decoded.frame.kind === IPC_KINDS.RESET_RESULT) {
    const result = /** @type {{ key: string, state: string, reason: string }} */ (
      /** @type {unknown} */ (decoded.frame)
    );
    // Ket qua cho mot khoa KHAC voi khoa dang cho la mot khung lac — khong ap len so cuc bo.
    if (pendingReset === null || pendingReset.key !== result.key) return;
    settlePendingReset(await applyResetResult(result, { readDelivered, writeDelivered }));
    return;
  }

  if (decoded.frame.kind !== IPC_KINDS.WAKE) return;
  const outcome = await routeWakeFrame(frame, deps);
  const key = /** @type {{ key: string }} */ (/** @type {unknown} */ (decoded.frame)).key;
  try {
    port.postMessage(resultFrame({ key, state: outcome.state, reason: outcome.reason }));
  } catch {
    // Khung ket qua khong dung dang => khong gui. Khong ghi noi dung ngoai le ra log (§11).
  }
}

/**
 * Gui mot khung RESET va cho host tra loi. Khong thu lai, khong hang doi: mot lan bam la mot lan
 * gui, va het han thi noi ro la het han.
 * @param {unknown} key
 * @returns {Promise<{ ok: boolean, state: string, reason: string }>}
 */
function requestReset(key) {
  const built = buildResetRequest(key);
  if (!built.ok) return Promise.resolve(built);
  if (pendingReset !== null) return Promise.resolve(resetOutcome(RESET_REASONS.RESET_TIMED_OUT));
  link.open(LINK_TRIGGERS.WORKER_WAKE);
  return new Promise((resolve) => {
    if (!link.send(built.frame)) {
      resolve(resetOutcome(RESET_REASONS.RESET_LINK_DOWN));
      return;
    }
    pendingReset = {
      key: /** @type {string} */ (key),
      settle: resolve,
      timer: globalThis.setTimeout(() => {
        pendingReset = null;
        resolve(resetOutcome(RESET_REASONS.RESET_TIMED_OUT));
      }, RESET_TIMEOUT_MS),
    };
  });
}

/** Kenh voi trang tuy chon. Ba lenh, tap dong — khong lenh nao mang van ban tu do. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const kind = /** @type {{ kind?: unknown }} */ (message ?? {}).kind;
  if (kind === MESSAGE_KINDS.LINK_STATUS) {
    sendResponse(link.status());
    return false;
  }
  if (kind === MESSAGE_KINDS.LINK_RECONNECT) {
    sendResponse(link.open(LINK_TRIGGERS.MANUAL));
    return false;
  }
  if (kind === MESSAGE_KINDS.RESET_DELIVERY) {
    void requestReset(/** @type {{ key?: unknown }} */ (message).key).then(sendResponse);
    return true;
  }
  sendResponse({ ok: false, state: RESET_STATES.RESET_REFUSED, reason: 'PROTOCOL_REJECTED' });
  return false;
});

chrome.runtime.onStartup.addListener(() => link.open(LINK_TRIGGERS.STARTUP));
chrome.runtime.onInstalled.addListener(() => link.open(LINK_TRIGGERS.INSTALLED));
link.open(LINK_TRIGGERS.WORKER_WAKE);
