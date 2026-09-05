/**
 * TRANG TUY CHON — noi DUY NHAT nguoi dung arm mot cuoc hoi thoai.
 *
 * Hai viec co that o day, va deu la hanh dong co chu y cua con nguoi:
 *
 *   ARM   — dan dung mot URL hoi thoai, roi Chrome hoi xin quyen host CHO DUNG URL DO. Tien ich
 *           khong xin `https://chatgpt.com/*` luc cai dat; no xin dung mot duong dan, luc arm.
 *   RESET — xoa so khoa giao cuc bo. Chi dung khi mot lan tiem that bai da "chay" mot khoa; day
 *           la duong duy nhat de thu lai, va no co y doi mot thao tac cua nguoi.
 */
import {
  armExactConversation,
  normalizeConversationUrl,
  disarmed,
  readArmState,
  ARM_STORAGE_KEY,
  DELIVERED_STORAGE_KEY,
} from './shared/arming.js';

/** @param {string} id */
const el = (id) => /** @type {any} */ (/** @type {any} */ (globalThis).document.getElementById(id));

/**
 * Dat chu cho mot o tren CHINH trang tuy chon cua tien ich.
 * `replaceChildren` voi mot chuoi chen mot nut van ban — khong bao gio phan tich HTML, nen mot ma
 * ly do hay mot URL do nguoi dung dan vao khong the tro thanh the.
 * @param {string} id @param {string} value
 */
const setText = (id, value) => el(id).replaceChildren(String(value));

async function render() {
  const stored = (await chrome.storage.local.get(ARM_STORAGE_KEY))[ARM_STORAGE_KEY];
  const arm = readArmState(stored);
  const delivered = (await chrome.storage.local.get(DELIVERED_STORAGE_KEY))[DELIVERED_STORAGE_KEY];
  const count =
    typeof delivered === 'object' && delivered !== null ? Object.keys(delivered).length : 0;
  setText('state', arm.state);
  setText('target', 'conversationUrl' in arm ? arm.conversationUrl : '(chua arm)');
  setText('delivered', String(count));
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
  // Xin quyen host cho DUNG mot duong dan. Chrome bat buoc goi nay tu mot cu cham cua nguoi dung.
  const granted = await chrome.permissions.request({ origins: [normalized.conversationUrl] });
  if (!granted) {
    setText('message', 'Tu choi: nguoi dung khong cap quyen host cho URL nay');
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
  const stored = (await chrome.storage.local.get(ARM_STORAGE_KEY))[ARM_STORAGE_KEY];
  const arm = readArmState(stored);
  if ('conversationUrl' in arm) {
    await chrome.permissions.remove({ origins: [arm.conversationUrl] });
  }
  await chrome.storage.local.set({ [ARM_STORAGE_KEY]: disarmed() });
  setText('message', 'Da disarm. Khong cuoc hoi thoai nao co the bi danh thuc.');
  await render();
}

async function onResetDelivered() {
  await chrome.storage.local.remove(DELIVERED_STORAGE_KEY);
  setText('message', 'Da xoa so khoa giao cuc bo. Mot carrier cu CO THE duoc giao lai.');
  await render();
}

el('arm').addEventListener('click', () => void onArm());
el('disarm').addEventListener('click', () => void onDisarm());
el('reset').addEventListener('click', () => void onResetDelivered());
void render();
