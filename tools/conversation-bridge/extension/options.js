/**
 * TRANG TUY CHON — noi DUY NHAT nguoi dung arm mot cuoc hoi thoai.
 *
 * Ba viec co that o day, va ca ba deu la hanh dong co chu y cua con nguoi:
 *
 *   ARM       — dan dung mot URL hoi thoai, roi Chrome hoi xin quyen host cho origin ChatGPT.
 *   RECONNECT — mo lai duong ong Native Messaging bang tay (xem `native-link.js`).
 *   RESET     — hoa giai DUNG MOT khoa giao da "chay", tren CA HAI so (xem `reset-request.js`).
 *
 * QUYEN HOST XIN O DAY LA `https://chatgpt.com/*`, KHONG PHAI URL HOI THOAI. Chrome bo qua thanh
 * phan duong dan trong mau quyen host, nen xin theo duong dan cho ra dung cung mot pham vi runtime
 * ma lai ke mot cau chuyen sai. Cach ly "dung mot cuoc hoi thoai" do MA NGUON giu — trang thai arm,
 * bo loc tab, dung-mot-tab, va lan doi chieu `location.href` ben trong trang. Xem `arming.js`.
 */
import {
  armExactConversation,
  normalizeConversationUrl,
  disarmed,
  readArmState,
  ARM_STORAGE_KEY,
  CHATGPT_HOST_PERMISSION,
  DELIVERED_STORAGE_KEY,
} from './shared/arming.js';
import { MESSAGE_KINDS } from './shared/link-messages.js';
import { parseDeliveryKey } from './shared/ipc.js';

/** @param {string} id */
const el = (id) => /** @type {any} */ (/** @type {any} */ (globalThis).document.getElementById(id));

/** @param {string} tag */
const make = (tag) =>
  /** @type {any} */ (/** @type {any} */ (globalThis).document.createElement(tag));

/**
 * Dat chu cho mot o tren CHINH trang tuy chon cua tien ich.
 * `replaceChildren` voi mot chuoi chen mot nut van ban — khong bao gio phan tich HTML, nen mot ma
 * ly do hay mot URL do nguoi dung dan vao khong the tro thanh the.
 * @param {string} id @param {string} value
 */
const setText = (id, value) => el(id).replaceChildren(String(value));

/**
 * Khoa dang cho xac nhan. Bam lan mot chon, bam lan hai gui — mot cong hai nhip, ngay tren chinh
 * hang do, nen khong the "lo tay" hoa giai nham khoa.
 * @type {string | null}
 */
let armedForReset = null;

/** @returns {Promise<Record<string, unknown>>} */
async function readDelivered() {
  const stored = (await chrome.storage.local.get(DELIVERED_STORAGE_KEY))[DELIVERED_STORAGE_KEY];
  return typeof stored === 'object' && stored !== null
    ? /** @type {Record<string, unknown>} */ (stored)
    : {};
}

/**
 * Ve danh sach khoa da chay. Moi hang mo ta DUNG mot y dinh danh thuc, doc nguoc ra tu chinh
 * chuoi khoa — khong co van ban nao den tu GitHub o day.
 * @param {Record<string, unknown>} delivered
 */
function renderBurned(delivered) {
  const list = el('burned');
  const rows = Object.keys(delivered).sort();
  if (rows.length === 0) {
    const empty = make('li');
    empty.replaceChildren('Khong co khoa nao.');
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(
    ...rows.map((key) => {
      const parsed = parseDeliveryKey(key);
      const row = make('li');
      const label = make('code');
      label.replaceChildren(
        parsed.ok ? `${parsed.repo} · PR #${parsed.pr} · ${parsed.headSha.slice(0, 12)}` : key,
      );
      const button = make('button');
      button.replaceChildren(
        armedForReset === key ? 'Bam lan nua de xac nhan' : 'Hoa giai khoa nay',
      );
      button.addEventListener('click', () => void onResetKey(key));
      row.replaceChildren(label, ' ', button);
      return row;
    }),
  );
}

async function render() {
  const stored = (await chrome.storage.local.get(ARM_STORAGE_KEY))[ARM_STORAGE_KEY];
  const arm = readArmState(stored);
  const delivered = await readDelivered();
  setText('state', arm.state);
  setText('target', 'conversationUrl' in arm ? arm.conversationUrl : '(chua arm)');
  setText('delivered', String(Object.keys(delivered).length));
  const link = await chrome.runtime.sendMessage({ kind: MESSAGE_KINDS.LINK_STATUS });
  const status = /** @type {any} */ (link);
  setText(
    'link',
    status?.state
      ? `${status.state} (hong ${status.failures} lan lien tiep)`
      : '(service worker chua tra loi)',
  );
  renderBurned(delivered);
}

async function onArm() {
  const raw = el('url').value;
  const normalized = normalizeConversationUrl(raw);
  if (!normalized.ok) {
    setText(
      'message',
      `Tu choi: ${normalized.reason} / ${JSON.stringify(normalized.detail ?? {})}`,
    );
    return;
  }
  // Xin quyen host cho ORIGIN ChatGPT — dung thu Chrome that su cap. Chrome bat buoc goi nay den
  // tu mot cu cham cua nguoi dung.
  const granted = await chrome.permissions.request({ origins: [CHATGPT_HOST_PERMISSION] });
  if (!granted) {
    setText('message', 'Tu choi: nguoi dung khong cap quyen host cho chatgpt.com');
    return;
  }
  const armed = armExactConversation(normalized.conversationUrl);
  if (!armed.ok) {
    setText('message', `Tu choi: ${armed.reason}`);
    return;
  }
  await chrome.storage.local.set({ [ARM_STORAGE_KEY]: armed.arm });
  setText('message', 'Da arm.');
  await render();
}

async function onDisarm() {
  // Tra lai quyen host cho origin — tuc TOAN BO quyen tren chatgpt.com, khong phai mot duong dan.
  // Ke ca khi Chrome tu choi thu hoi, `ARM_STORAGE_KEY` ve DISARMED van du de khong con dich nao.
  await chrome.permissions.remove({ origins: [CHATGPT_HOST_PERMISSION] });
  await chrome.storage.local.set({ [ARM_STORAGE_KEY]: disarmed() });
  setText('message', 'Da disarm. Khong cuoc hoi thoai nao co the bi danh thuc.');
  await render();
}

async function onReconnect() {
  const status = /** @type {any} */ (
    await chrome.runtime.sendMessage({ kind: MESSAGE_KINDS.LINK_RECONNECT })
  );
  setText('message', `Duong ong: ${status?.state ?? '(khong tra loi)'}`);
  await render();
}

/**
 * Hoa giai DUNG MOT khoa, hai nhip. Nhip mot chi ghi nho lua chon; chi nhip hai moi gui khung
 * RESET, va so cuc bo chi doi khi host tra ve `RESET_DONE` — viec xoa do service worker lam, khong
 * phai trang nay.
 * @param {string} key
 */
async function onResetKey(key) {
  if (armedForReset !== key) {
    armedForReset = key;
    setText('message', 'Bam lan nua dung hang do de xac nhan hoa giai khoa nay.');
    await render();
    return;
  }
  armedForReset = null;
  const outcome = /** @type {any} */ (
    await chrome.runtime.sendMessage({ kind: MESSAGE_KINDS.RESET_DELIVERY, key })
  );
  setText(
    'message',
    outcome?.ok
      ? 'Da hoa giai tren ca hai so. HEAD nay co the duoc danh thuc lai dung mot lan nua.'
      : `Tu choi: ${outcome?.reason ?? 'KHONG_TRA_LOI'}`,
  );
  await render();
}

el('arm').addEventListener('click', () => void onArm());
el('disarm').addEventListener('click', () => void onDisarm());
el('reconnect').addEventListener('click', () => void onReconnect());
void render();
