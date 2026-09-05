/**
 * ARM — "cuoc hoi thoai nao duoc phep bi danh thuc", va cau tra loi mac dinh la KHONG CAI NAO.
 *
 * Hop dong #204 §3.3: fail closed. Khong co trang thai "bat cho moi tab ChatGPT". Nguoi dung phai
 * dan DUNG MOT URL hoi thoai va bam arm; truoc do khong mot thao tac DOM nao duoc phep xay ra.
 *
 * Hinh dang URL bi rang buoc CHAT o day, va do la mot tinh chat an toan chu khong phai su kho tinh:
 *
 *   · chi `https:`                — khong cho ha cap giao thuc;
 *   · chi host `chatgpt.com`      — arm mot host khac tuc la cho phep tiem chu vao mot trang khac;
 *   · chi duong dan `/c/<id>`     — trang chu `/` la "cuoc hoi thoai moi", va tiem vao do se de ra
 *                                   mot cuoc hoi thoai MOI moi lan, khong phai cuoc da cau hinh;
 *   · khong query, khong fragment — hai thu do phan biet duoc hai trang khac nhau.
 *
 * `chatgpt.com` la ChatGPT Web THUONG — dung pham vi cua nhiem vu. Host cu cua ChatGPT va moi
 * host cua ChatGPT Work deu KHONG duoc arm.
 */
import { BRIDGE_REASONS, BRIDGE_STATES, rejected } from './states.js';

/** Khoa trong `chrome.storage.local`. Mot khoa — khong co nhieu ho so arm song song. */
export const ARM_STORAGE_KEY = 'conversationBridge.arm';

/** Khoa luu tap khoa giao da thuc hien o phia trinh duyet. */
export const DELIVERED_STORAGE_KEY = 'conversationBridge.delivered';

export const ALLOWED_CONVERSATION_HOST = 'chatgpt.com';

const CONVERSATION_PATH = /^\/c\/[A-Za-z0-9-]{8,64}$/;

/**
 * @typedef {{ state: 'ARMED_EXACT_CHAT', conversationUrl: string } | { state: 'DISARMED' }} ArmState
 */

/** @returns {ArmState} */
export const disarmed = () => Object.freeze({ state: BRIDGE_STATES.DISARMED });

/**
 * Chuan hoa mot URL hoi thoai ve dang canonical, hoac tu choi.
 * @param {unknown} url
 * @returns {{ ok: true, conversationUrl: string } | import('./states.js').Rejection}
 */
export function normalizeConversationUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return rejected(BRIDGE_REASONS.ARMED_URL_MISMATCH, { problem: 'EMPTY' });
  }
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return rejected(BRIDGE_REASONS.ARMED_URL_MISMATCH, { problem: 'NOT_A_URL' });
  }
  if (parsed.protocol !== 'https:') {
    return rejected(BRIDGE_REASONS.ARMED_URL_MISMATCH, { problem: 'NOT_HTTPS' });
  }
  if (parsed.host.toLowerCase() !== ALLOWED_CONVERSATION_HOST) {
    return rejected(BRIDGE_REASONS.ARMED_URL_MISMATCH, { problem: 'HOST_NOT_ALLOWED' });
  }
  const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
  if (!CONVERSATION_PATH.test(path)) {
    return rejected(BRIDGE_REASONS.ARMED_URL_MISMATCH, { problem: 'NOT_A_CONVERSATION_PATH' });
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    return rejected(BRIDGE_REASONS.ARMED_URL_MISMATCH, { problem: 'HAS_QUERY_OR_FRAGMENT' });
  }
  return { ok: true, conversationUrl: `https://${ALLOWED_CONVERSATION_HOST}${path}` };
}

/**
 * @param {unknown} url
 * @returns {{ ok: true, arm: ArmState } | import('./states.js').Rejection}
 */
export function armExactConversation(url) {
  const normalized = normalizeConversationUrl(url);
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    arm: Object.freeze({
      state: BRIDGE_STATES.ARMED_EXACT_CHAT,
      conversationUrl: normalized.conversationUrl,
    }),
  };
}

/**
 * Doc lai mot ho so arm da luu. Bat ky sai lech nao ve hinh dang deu quy ve DISARMED — mot ho so
 * arm hong khong duoc "gan dung", vi "gan dung" o day la tiem chu vao nham cuoc hoi thoai.
 * @param {unknown} stored
 * @returns {ArmState}
 */
export function readArmState(stored) {
  if (typeof stored !== 'object' || stored === null) return disarmed();
  const record = /** @type {Record<string, unknown>} */ (stored);
  if (record.state !== BRIDGE_STATES.ARMED_EXACT_CHAT) return disarmed();
  const normalized = normalizeConversationUrl(record.conversationUrl);
  if (!normalized.ok) return disarmed();
  return Object.freeze({
    state: BRIDGE_STATES.ARMED_EXACT_CHAT,
    conversationUrl: normalized.conversationUrl,
  });
}
