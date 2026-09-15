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
 *   · chi DUNG HAI hinh dang duong dan hoi thoai (xem `CONVERSATION_PATHS`) — trang chu `/` la
 *                                   "cuoc hoi thoai moi", va tiem vao do se de ra mot cuoc hoi
 *                                   thoai MOI moi lan, khong phai cuoc da cau hinh;
 *   · khong query, khong fragment — hai thu do phan biet duoc hai trang khac nhau.
 *
 * `chatgpt.com` la ChatGPT Web THUONG — dung pham vi cua nhiem vu. Host cu cua ChatGPT va moi
 * host cua ChatGPT Work deu KHONG duoc arm.
 *
 * ---------------------------------------------------------------------------------------------
 * QUYEN HOST CUA CHROME KHONG HE HEP THEO DUONG DAN — doc ky truoc khi doc phan con lai.
 *
 * Tai lieu Match Patterns cua Chrome noi ro: voi QUYEN HOST, thanh phan duong dan BAT BUOC PHAI CO
 * trong mau, nhung no BI BO QUA. Xin `https://chatgpt.com/c/<id>` va xin `https://chatgpt.com/*`
 * cho ra CUNG MOT thu luc chay: quyen tren TOAN BO origin `https://chatgpt.com`.
 *
 * Nen o day ta xin dung `https://chatgpt.com/*` — de MO HINH QUYEN KHAI RA BANG DUNG THU RUNTIME
 * THAT SU CAP. Mot loi xin theo duong dan van chay duoc, nhung no ke mot cau chuyen SAI trong
 * manifest, trong tai lieu, va trong dau nguoi doc review.
 *
 * Cach ly "dung mot cuoc hoi thoai" vi vay KHONG do Chrome giu. No do MA NGUON giu, bang bon lop
 * xep chong, moi lop co bai kiem rieng:
 *
 *   1. trang thai ARM   — dung mot `conversationUrl` canonical, do NGUOI dan vao (tep nay);
 *   2. loc tab          — `isExactConfiguredConversation(tab.url, armed)` (`wake-router.js`);
 *   3. dung MOT tab     — khong tab / nhieu tab deu la tu choi, khong doan (`wake-router.js`);
 *   4. doi chieu TRONG TRANG — `location.href` phai bang URL DA ARM, kiem ngay truoc thao tac DOM
 *      dau tien (`composer-adapter.js`).
 *
 * Bo ba lop dau di thi lop 4 van chan. Do la y nghia cua "quyen rong hon khong mo them dich nao".
 */
import { BRIDGE_REASONS, BRIDGE_STATES, rejected } from './states.js';

/** Khoa trong `chrome.storage.local`. Mot khoa — khong co nhieu ho so arm song song. */
export const ARM_STORAGE_KEY = 'conversationBridge.arm';

/** Khoa luu tap khoa giao da thuc hien o phia trinh duyet. */
export const DELIVERED_STORAGE_KEY = 'conversationBridge.delivered';

export const ALLOWED_CONVERSATION_HOST = 'chatgpt.com';

/**
 * Mau quyen host DUY NHAT ma tien ich nay xin — va la dung thu Chrome that su cap.
 *
 * Phai trung tung ky tu voi `optional_host_permissions` trong `manifest.json`: mot loi xin luc
 * chay nam ngoai tap cha khai trong manifest se bi Chrome tu choi thang. Co bai kiem hop dong
 * khoa hai gia tri nay lai voi nhau (`input-only-contract` 18e).
 *
 * CO Y KHONG phai mot URL hoi thoai. Xem the than dau tep: duong dan trong mau quyen host bi bo
 * qua, nen xin theo duong dan chi tao ra mot mo hinh quyen SAI, khong tao ra mot ranh gioi that.
 */
export const CHATGPT_HOST_PERMISSION = `https://${ALLOWED_CONVERSATION_HOST}/*`;

/**
 * Ma cua MOT cuoc hoi thoai. Dung mot luat, dung o CA HAI hinh dang duong dan ben duoi — hai ban
 * sao roi nhau la cach chac chan nhat de mot ngay nao do chung khac nhau.
 */
const CONVERSATION_ID = '[A-Za-z0-9-]{8,64}';

/**
 * Doan `/g/<...>` cua mot cuoc hoi thoai nam TRONG mot ChatGPT Project.
 *
 * `g-p-` la thu PHAN BIET Project voi GPT tuy chinh, va do la ca ranh gioi an toan o day:
 *
 *   · Project     `https://chatgpt.com/g/g-p-6a22b674b76881918809ceac4396a409-sparta-explorer/c/<id>`
 *   · GPT tuy chinh `https://chatgpt.com/g/g-ClUusYYbO-url-slug-gpt/c/<id>`   <- KHONG arm duoc
 *
 * Nen o day KHONG viet `/g/<bat ky>/c/<id>`. Mot GPT tuy chinh la mot he thong prompt cua NGUOI
 * KHAC; arm vao do la dat tin nhan danh thuc vao mot noi khong phai cuoc hoi thoai cua nguoi dung.
 *
 * Ma Project quan sat duoc la 32 chu HEX THUONG (nguon: URL that duoc dan trong REVIEW_BLOCK cua
 * #206). Khoang `{16,64}` khong phai su bua bai: no van la HEX — tuc van loai duoc bang chu cai
 * hoa/thuong hon tap cua ma GPT tuy chinh (`ClUusYYbO`) va moi thu khong phai ma — nhung chua mot
 * chut cho de OpenAI doi do dai ma khong lam cau noi chet cam.
 *
 * Slug (`-sparta-explorer`) la TUY CHON va co the vang han voi mot Project chua dat ten. No duoc
 * viet thanh cac nhom `-<chu-va-so>`, nen mot slug ket thuc bang `-`, co `--`, hay mang ky tu da
 * ma hoa phan tram (`%E1%BA%BF`) deu bi TU CHOI. Do la fail-closed co chu dich: duong ra cho mot
 * Project ten tieng Viet la dan hinh dang `/c/<id>` cua CHINH cuoc hoi thoai do.
 */
const PROJECT_SEGMENT = 'g-p-[0-9a-f]{16,64}(?:-[A-Za-z0-9]+)*';

/**
 * HAI hinh dang duong dan hoi thoai duoc arm — va dung hai, khong hon.
 *
 * Hai hinh dang nay la HAI DICH KHAC NHAU, khong phai hai bi danh cua mot dich: `/c/<id>` va
 * `/g/g-p-<du an>/c/<id>` cho ra hai chuoi canonical khac nhau, nen mot ho so arm o hinh dang nay
 * KHONG bao gio khop mot tab o hinh dang kia. Do chinh la bat bien "dung mot cuoc hoi thoai" —
 * xem `browser-target` 16g/16h.
 */
const CONVERSATION_PATHS = Object.freeze([
  new RegExp(`^/c/${CONVERSATION_ID}$`),
  new RegExp(`^/g/${PROJECT_SEGMENT}/c/${CONVERSATION_ID}$`),
]);

/**
 * @typedef {{ state: 'ARMED_EXACT_CHAT', conversationUrl: string } | { state: 'DISARMED' }} ArmState
 */

/** @returns {ArmState} */
export const disarmed = () => Object.freeze({ state: BRIDGE_STATES.DISARMED });

/**
 * Chuan hoa mot URL hoi thoai ve dang canonical, hoac tu choi.
 *
 * "Canonical" o day GIU NGUYEN duong dan nguoi dung dan vao — chi bo dau `/` cuoi va ha chu host
 * ve thuong. Doan Project KHONG bi cat: URL nguoi dung arm chinh la URL duoc luu, va do la ly do
 * `/c/<id>` voi `/g/g-p-<du an>/c/<id>` khong bao gio lan sang nhau.
 *
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
  if (!CONVERSATION_PATHS.some((shape) => shape.test(path))) {
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
