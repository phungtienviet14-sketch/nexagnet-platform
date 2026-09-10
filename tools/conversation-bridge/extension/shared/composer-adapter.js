/**
 * BO NOI KHUNG SOAN — be mat DOM duy nhat cua ca du an, va no CHI GHI.
 *
 * Doc ky danh sach thao tac ben duoi truoc khi sua tep nay. Do la toan bo nhung gi cau noi lam
 * duoc voi trang ChatGPT:
 *
 *   location.href                  doc — de tu choi neu trang da dieu huong
 *   document.querySelectorAll      tim — theo danh sach selector DONG o duoi
 *   document.execCommand           ghi — dat chu vao vung contenteditable
 *   el.isContentEditable           doc — mot boolean ve KIEU phan tu, khong phai noi dung
 *   el.value                       ghi — cho <textarea>
 *   el.focus / el.click            hanh dong
 *   el.dispatchEvent               hanh dong
 *   el.closest / el.querySelectorAll  tim — trong pham vi form soan
 *   el.disabled                    doc — mot boolean ve TRANG THAI nut
 *
 * Khong co MOT duong nao doc noi dung cua mot nut, doc cay con cua no, duyet sang nut anh em,
 * theo doi thay doi cua trang, doc vung chon, hay chup man hinh. Nghia la: khong co duong nao
 * lay duoc mot cau tra loi ra khoi trang, ke
 * ca vo tinh. Day khong phai mot loi hua trong tai lieu — `tests/composer-adapter.test.mjs` chay
 * bo noi nay tren mot cay DOM ma MOI nut cua khoi hoi thoai deu NEM khi bi cham vao.
 *
 * `closest()` di LEN, khong di vao trong: no khong the cham toi mot nut anh em chua noi dung.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO `injectWakeMessage` la MOT ham tu chua duoc, khong tach nho:
 *
 * `chrome.scripting.executeScript({ func })` tuan tu hoa ham bang `func.toString()` roi danh gia
 * lai trong trang. Moi tham chieu toi pham vi module — mot hang so, mot ham tro giup — deu thanh
 * `ReferenceError` LUC CHAY, trong mot ngu canh khong co devtools mo. Nen ham nay co y khong goi
 * ra ngoai chinh no. Cai gia la mot the than dai; cai duoc la no khong the hong theo kieu do.
 */

/** Ma ly do phat ra tu day. Trung ten voi `BRIDGE_REASONS`; co bai kiem hop dong khoa lai. */
export const ADAPTER_REASONS = Object.freeze([
  'ARMED_URL_MISMATCH',
  'COMPOSER_NOT_FOUND',
  'COMPOSER_AMBIGUOUS',
  'COMPOSER_NOT_EDITABLE',
  'COMPOSER_WRITE_FAILED',
  'SUBMIT_CONTROL_NOT_FOUND',
  'SUBMIT_FAILED',
  'WAKE_SENT',
]);

/**
 * Selector khung soan, thu theo dung thu tu nay.
 *
 * KHONG dung lop CSS do trang sinh ra (`.css-1x2y3z`) — do la thu doi moi lan trang deploy. Cai
 * dung o day la `id` on dinh nhieu nam cua ChatGPT va cac thuoc tinh NGU NGHIA (`role=textbox`,
 * `contenteditable`) — thu chi doi khi ban than khung soan doi vai tro.
 */
export const COMPOSER_SELECTORS = Object.freeze([
  'form #prompt-textarea[contenteditable="true"]',
  'form textarea#prompt-textarea',
  'form [contenteditable="true"][role="textbox"]',
  'form textarea[data-testid="prompt-textarea"]',
]);

/** Nut gui — chi tim TRONG form cua khung soan, khong bao gio tren toan trang. */
export const SUBMIT_SELECTORS = Object.freeze([
  'button[data-testid="send-button"]',
  'button[type="submit"]',
]);

/**
 * URL da arm co dung la URL nay khong. "Dung" o day nghia la DUNG — chi tha cho dau `/` cuoi va
 * chu hoa/thuong cua scheme+host, vi hai thu do trinh duyet tu chuan hoa. Query va fragment
 * KHONG duoc bo qua: `?model=x` la mot trang khac, va `#` co the la mot cuoc hoi thoai khac.
 * @param {string} url
 * @param {string} expected
 * @returns {boolean}
 */
export function isExactConfiguredConversation(url, expected) {
  /** @param {unknown} value @returns {string | null} */
  const normalize = (value) => {
    if (typeof value !== 'string' || value.length === 0) return null;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:') return null;
    const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    if (path.length === 0) return null;
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}${parsed.hash}`;
  };
  const left = normalize(url);
  const right = normalize(expected);
  return left !== null && right !== null && left === right;
}

/**
 * DAT CHU + GUI. Chay TRONG trang, o `world: 'ISOLATED'` (khong thay bien cua trang).
 *
 * Moi thu no can deu di qua `input` — ke ca danh sach selector — chinh vi ly do tuan tu hoa noi o
 * dau tep. Khong co hang so module nao bi tham chieu tu day.
 *
 * DAY LA LOP CACH LY CUOI CUNG, va la lop DUY NHAT chay ben trong chinh trang dich. Quyen host ma
 * Chrome cap la quyen tren TOAN BO origin `https://chatgpt.com` (duong dan trong mau quyen host bi
 * BO QUA — xem the than dau `arming.js`), nen "dung mot cuoc hoi thoai" la mot tinh chat cua MA
 * NGUON, va no ket thuc o day.
 *
 * Hai doi chieu, co y KHAC NHAU ve NGUON:
 *
 *   · `expectedHref` — URL doc ra tu CHINH BAN GHI TAB roi da qua bo loc phia service worker. So
 *     bang `!==` thuan tuy: no bat trang DIEU HUONG trong khe thoi gian giua luc loc va luc tiem.
 *   · `armedHref`    — URL canonical trong TRANG THAI ARM cua nguoi dung. So sau khi bo dau `/`
 *     cuoi (ban ghi tab co the co hoac khong co dau do). Doi chieu nay khong lap lai cai tren: no
 *     khong tin mot chu nao trong ban ghi tab, nen no van chan neu chinh bo loc kia bi qua mat.
 *
 * Ca hai deu dung TRUOC lenh `querySelectorAll` dau tien. Ham nay chay dong bo trong mot tac vu,
 * nen khong co lan dieu huong nao chen duoc vao giua doi chieu va thao tac DOM.
 *
 * @param {{ expectedHref: string, armedHref: string, message: string, composerSelectors: ReadonlyArray<string>, submitSelectors: ReadonlyArray<string> }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function injectWakeMessage(input) {
  const doc = globalThis.document;
  const loc = globalThis.location;
  /** @param {unknown} value @returns {unknown} */
  const withoutTrailingSlash = (value) =>
    typeof value === 'string' && value.endsWith('/') ? value.slice(0, -1) : value;
  if (!doc || !loc || loc.href !== input.expectedHref) {
    return { ok: false, reason: 'ARMED_URL_MISMATCH' };
  }
  if (
    typeof input.armedHref !== 'string' ||
    input.armedHref.length === 0 ||
    withoutTrailingSlash(loc.href) !== withoutTrailingSlash(input.armedHref)
  ) {
    return { ok: false, reason: 'ARMED_URL_MISMATCH' };
  }
  try {
    let composer = null;
    for (const selector of input.composerSelectors) {
      const found = doc.querySelectorAll(selector);
      if (found.length > 1) return { ok: false, reason: 'COMPOSER_AMBIGUOUS' };
      if (found.length === 1) {
        composer = found[0];
        break;
      }
    }
    if (composer === null) return { ok: false, reason: 'COMPOSER_NOT_FOUND' };

    if (composer.isContentEditable === true) {
      composer.focus();
      // `selectAll` roi `insertText` = THAY THE. Cong doan nay co chu dich ghi de moi ban nhap do
      // dang trong khung soan cua cuoc hoi thoai tu dong. Noi them vao mot ban nhap co san se cho
      // ra mot tin nhan khong con tat dinh — dung dieu §8 cam.
      doc.execCommand('selectAll', false, undefined);
      if (doc.execCommand('insertText', false, input.message) !== true) {
        return { ok: false, reason: 'COMPOSER_WRITE_FAILED' };
      }
    } else if (typeof composer.value === 'string') {
      composer.focus();
      composer.value = input.message;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      return { ok: false, reason: 'COMPOSER_NOT_EDITABLE' };
    }

    const form = composer.closest('form');
    if (form === null) return { ok: false, reason: 'SUBMIT_CONTROL_NOT_FOUND' };
    let submit = null;
    for (const selector of input.submitSelectors) {
      const found = form.querySelectorAll(selector);
      // Nhieu nut khop = khong biet cai nao gui. §7 cam bam nut tuy y, nen dung han.
      if (found.length > 1) return { ok: false, reason: 'SUBMIT_CONTROL_NOT_FOUND' };
      if (found.length === 1) {
        submit = found[0];
        break;
      }
    }
    if (submit === null) return { ok: false, reason: 'SUBMIT_CONTROL_NOT_FOUND' };
    if (submit.disabled === true) return { ok: false, reason: 'SUBMIT_FAILED' };
    submit.click();
    return { ok: true, reason: 'WAKE_SENT' };
  } catch {
    // Than ngoai le co the mang manh noi dung trang. §11 cam ghi thu do ra log, nen no dung o day.
    return { ok: false, reason: 'SUBMIT_FAILED' };
  }
}
