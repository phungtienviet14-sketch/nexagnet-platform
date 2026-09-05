/**
 * SERVICE WORKER — day day noi, khong chua quyet dinh nao.
 *
 * Moi luat nam trong `shared/wake-router.js` (thuan, kiem duoc bang `node --test`). O day chi co:
 * mo duong ong Native Messaging, doi khung, goi bo dinh tuyen, tra ket qua ve. Neu ban thay minh
 * dang viet mot dieu kien `if` ve nghiep vu trong tep nay, no thuoc ve `shared/`.
 *
 * KHONG co content script thuong tru, KHONG co bo theo doi thay doi trang, KHONG co bo lang nghe
 * su kien tab. Tien ich nay khong quan sat gi ca — no chi hanh dong khi duong ong noi.
 */
import { helloFrame, resultFrame } from './shared/ipc.js';
import { routeWakeFrame } from './shared/wake-router.js';
import { ARM_STORAGE_KEY, DELIVERED_STORAGE_KEY } from './shared/arming.js';

const NATIVE_HOST_NAME = 'com.nexagnet.conversation_bridge';

/** @type {import('./shared/wake-router.js').RouterDeps} */
const deps = {
  readArm: async () => (await chrome.storage.local.get(ARM_STORAGE_KEY))[ARM_STORAGE_KEY],
  readDelivered: async () => {
    const stored = (await chrome.storage.local.get(DELIVERED_STORAGE_KEY))[DELIVERED_STORAGE_KEY];
    return typeof stored === 'object' && stored !== null
      ? /** @type {Record<string, unknown>} */ (stored)
      : {};
  },
  writeDelivered: async (next) => {
    await chrome.storage.local.set({ [DELIVERED_STORAGE_KEY]: next });
  },
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

/** @type {chrome.runtime.Port | null} */
let port = null;

function connect() {
  if (port !== null) return;
  port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  port.onDisconnect.addListener(() => {
    port = null;
  });
  port.onMessage.addListener((frame) => {
    void handleFrame(frame);
  });
  port.postMessage(helloFrame());
}

/** @param {unknown} frame */
async function handleFrame(frame) {
  const outcome = await routeWakeFrame(frame, deps);
  const key =
    typeof frame === 'object' &&
    frame !== null &&
    typeof (/** @type {any} */ (frame).key) === 'string'
      ? /** @type {any} */ (frame).key
      : null;
  // Khong co khoa hop le thi khong tra ket qua duoc theo dung dang khung — im lang la dung o day,
  // vi tra ve mot khung khong hop le chinh la thu ma phia kia se tu choi.
  if (key === null || port === null) return;
  try {
    port.postMessage(resultFrame({ key, state: outcome.state, reason: outcome.reason }));
  } catch {
    // Khung ket qua khong dung dang => khong gui. Khong ghi noi dung ngoai le ra log (§11).
  }
}

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
