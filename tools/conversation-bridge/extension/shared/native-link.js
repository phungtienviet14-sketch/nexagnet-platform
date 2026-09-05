/**
 * DUONG ONG TOI NATIVE HOST — mo lai duoc, CO CHAN, va khong bao gio quay tit.
 *
 * `chrome.runtime.connectNative` khong nem khi native host chua duoc dang ky. No tra ve mot Port
 * roi ban ra `onDisconnect` gan nhu ngay lap tuc. Nghia la HAI tinh huong rat khac nhau di vao
 * cung mot su kien, va bo may nay phai phan biet duoc chung:
 *
 *   A. HOST CHUA CO      — tien ich duoc nap TRUOC khi host duoc dang ky (dung thu tu cai dat ma
 *                          tai lieu huong dan). Lan `connectNative` dau that bai, va viec dang ky
 *                          host sau do KHONG sinh ra su kien nao goi `connect()` lai. Neu chi dat
 *                          `port = null` thi cau noi chet im cho toi lan khoi dong lai Chrome.
 *   B. HOST DANG CHAY ROI CHET — tien trinh sap, hoac Chrome giet no. O day mo lai la dung.
 *
 * PHAN BIET BANG THOI GIAN SONG, khong bang doan: mot port song duoc >= `HEALTHY_AFTER_MS` truoc
 * khi dut la mot ket noi DA THAT SU CHAY (tinh huong B) => ngan sach lui ve dau. Mot port dut gan
 * nhu tuc thi la mot lan mo HONG (tinh huong A) => lui theo cap so nhan.
 *
 * BA RANG BUOC, va ca ba deu la ly do tep nay ton tai thay vi vai dong trong service worker:
 *
 *   · MOT lich hen, MOT lan mo dang bay. Hai lan `open()` chong nhau khong duoc de ra hai Port —
 *     hai Port nghia la hai tien trinh host, hai vong poll, va co the hai lan danh thuc.
 *   · CO TRAN. Sau `RECONNECT_MAX_ATTEMPTS` lan mo hong lien tiep, bo may DUNG HAN o `GAVE_UP`.
 *     Mot host cau hinh sai se hong mai mai; thu lai vo han chi lam ton pin va rac log. Duong ra
 *     khoi `GAVE_UP` la MOT CU CHAM CUA NGUOI (`LINK_TRIGGERS.MANUAL`) — do la cai gia dung.
 *   · KHONG DONG HO THAT, KHONG `setTimeout` truc tiep. Ca dong ho lan bo hen gio deu di qua
 *     `deps`, nen toan bo may trang thai kiem duoc bang `node --test` ma khong can Chrome.
 *
 * Tep nay KHONG mo cong nghe nao va khong doc gi tu trang ChatGPT. No chi biet den mot Port.
 */

/** Trang thai cua duong ong. Dong — trang tuy chon doc dung tap nay. */
export const LINK_STATES = Object.freeze({
  /** Chua tung mo, hoac da dong va khong con lich hen nao. */
  DISCONNECTED: 'DISCONNECTED',
  /** Port dang mo. */
  CONNECTED: 'CONNECTED',
  /** Da hen mot lan mo lai. Dung MOT lich hen tai mot thoi diem. */
  BACKING_OFF: 'BACKING_OFF',
  /** Het ngan sach thu lai. Chi mot thao tac cua nguoi moi mo lai duoc. */
  GAVE_UP: 'GAVE_UP',
});

/** Vi sao mot lan mo duoc yeu cau. `MANUAL` la thu duy nhat dat lai duoc ngan sach. */
export const LINK_TRIGGERS = Object.freeze({
  STARTUP: 'STARTUP',
  INSTALLED: 'INSTALLED',
  WORKER_WAKE: 'WORKER_WAKE',
  RETRY: 'RETRY',
  MANUAL: 'MANUAL',
});

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
/** So lan mo HONG LIEN TIEP toi da truoc khi dung han. 6 lan ≈ 61 giay tong cong. */
export const RECONNECT_MAX_ATTEMPTS = 6;
/** Song lau hon nguong nay = da that su chay. Ngan hon = mot lan mo hong. */
export const HEALTHY_AFTER_MS = 5_000;

/**
 * Lui theo cap so nhan, CO TRAN. `failures` la so lan mo hong lien tiep (>= 1).
 * @param {number} failures
 * @returns {number}
 */
export function backoffDelayMs(failures) {
  if (!Number.isSafeInteger(failures) || failures < 1) return RECONNECT_BASE_MS;
  const grown = RECONNECT_BASE_MS * 2 ** (failures - 1);
  return Math.min(grown, RECONNECT_MAX_MS);
}

/**
 * @typedef {object} LinkPort
 * @property {{ addListener: (listener: (message: unknown) => void) => void }} onMessage
 * @property {{ addListener: (listener: () => void) => void }} onDisconnect
 * @property {(message: unknown) => void} postMessage
 */

/**
 * @typedef {object} LinkStatus
 * @property {string} state
 * @property {number} failures
 * @property {number} nextDelayMs `0` khi khong co lich hen nao
 * @property {string} lastTrigger
 */

/**
 * @typedef {object} NativeLinkDeps
 * @property {() => LinkPort} connectNative
 * @property {(fn: () => void, delayMs: number) => unknown} setTimer
 * @property {(handle: unknown) => void} clearTimer
 * @property {() => number} now milli giay
 * @property {(frame: unknown, port: LinkPort) => void} [onFrame]
 * @property {(status: LinkStatus) => void} [onStatus]
 * @property {(port: LinkPort) => void} [onOpen] goi ngay sau khi mot port moi mo duoc
 */

/**
 * @param {NativeLinkDeps} deps
 */
export function createNativeLink(deps) {
  const { connectNative, setTimer, clearTimer, now, onFrame, onStatus, onOpen } = deps;

  /** @type {LinkPort | null} */
  let port = null;
  let openedAt = 0;
  /** @type {unknown} */
  let timer = null;
  let failures = 0;
  let nextDelayMs = 0;
  let state = /** @type {string} */ (LINK_STATES.DISCONNECTED);
  let lastTrigger = /** @type {string} */ (LINK_TRIGGERS.STARTUP);

  /** @returns {LinkStatus} */
  const status = () => ({ state, failures, nextDelayMs, lastTrigger });

  const publish = () => {
    if (onStatus) onStatus(status());
  };

  const clearPending = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    nextDelayMs = 0;
  };

  /** Mot lan mo hong (hoac mot port dut som): lui, hoac dung han neu het ngan sach. */
  const recordFailure = () => {
    failures += 1;
    if (failures > RECONNECT_MAX_ATTEMPTS) {
      state = LINK_STATES.GAVE_UP;
      nextDelayMs = 0;
      publish();
      return;
    }
    const delay = backoffDelayMs(failures);
    state = LINK_STATES.BACKING_OFF;
    nextDelayMs = delay;
    timer = setTimer(() => {
      timer = null;
      nextDelayMs = 0;
      lastTrigger = LINK_TRIGGERS.RETRY;
      attempt();
    }, delay);
    publish();
  };

  /** @param {LinkPort} which */
  const handleDisconnect = (which) => {
    // Mot bo lang nghe cua port CU van con song sau khi da thay port. Bo qua no, neu khong mot su
    // kien muon se dat lich hen thu hai chong len duong dang chay.
    if (which !== port) return;
    const lived = now() - openedAt;
    port = null;
    // Da song that su => day la tinh huong B (host chet giua chung), khong phai "host chua co".
    // Ngan sach ve dau, nen mot lan sap sau nhieu gio chay tot van duoc mo lai ngay.
    if (lived >= HEALTHY_AFTER_MS) failures = 0;
    recordFailure();
  };

  function attempt() {
    clearPending();
    /** @type {LinkPort | null} */
    let opened = null;
    try {
      opened = connectNative();
    } catch {
      // `connectNative` co the nem neu ten host sai dang. Doi xu y het nhu mot lan dut tuc thi.
      opened = null;
    }
    if (opened === null || typeof opened !== 'object') {
      recordFailure();
      return;
    }
    port = opened;
    openedAt = now();
    state = LINK_STATES.CONNECTED;
    const which = opened;
    opened.onDisconnect.addListener(() => handleDisconnect(which));
    opened.onMessage.addListener((frame) => {
      if (onFrame) onFrame(frame, which);
    });
    if (onOpen) onOpen(which);
    publish();
  }

  return {
    status,
    /**
     * Mo duong ong neu chua co. Goi bao nhieu lan cung duoc — day la diem vao DUY NHAT.
     * @param {string} [trigger]
     * @returns {LinkStatus}
     */
    open(trigger = LINK_TRIGGERS.WORKER_WAKE) {
      lastTrigger = trigger;
      if (trigger === LINK_TRIGGERS.MANUAL) {
        // Mot cu cham cua nguoi dat lai ngan sach VA huy lich hen dang cho — khong ai muon bam
        // "ket noi lai" roi doi them 30 giay.
        failures = 0;
        clearPending();
        if (port !== null) {
          publish();
          return status();
        }
        state = LINK_STATES.DISCONNECTED;
        attempt();
        return status();
      }
      if (port !== null) return status();
      if (timer !== null) return status();
      if (state === LINK_STATES.GAVE_UP) return status();
      attempt();
      return status();
    },
    /**
     * Gui mot khung da dung san. Tra `false` khi khong co duong ong — nguoi goi quyet dinh lam gi;
     * o day khong co hang doi va khong co lan thu lai ngam.
     * @param {unknown} frame
     */
    send(frame) {
      if (port === null) return false;
      try {
        port.postMessage(frame);
        return true;
      } catch {
        return false;
      }
    },
    isConnected: () => port !== null,
  };
}
