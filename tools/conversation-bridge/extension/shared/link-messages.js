/**
 * KENH GIUA TRANG TUY CHON VA SERVICE WORKER — ba lenh, va khong lenh nao mang van xuoi.
 *
 * Trang tuy chon khong tu mo duong ong Native Messaging duoc: mot trang tuy chon la mot tab, no
 * dong lai la duong ong dong theo, va luc do se co HAI tien trinh host neu service worker cung mo
 * mot cai. Nen duong ong chi thuoc ve service worker, con trang tuy chon RA LENH qua kenh nay.
 *
 * Tap lenh dong, cung nguyen tac voi `ipc.js`: mot `kind` la thi khong xu ly. Truong duy nhat di
 * kem la `key` cua `RESET_DELIVERY`, va no phai la mot khoa giao canonical — `buildResetRequest`
 * doc no NGUOC ra thanh ba nguyen thuy va tu choi neu khong doc duoc.
 */

/** Khoa `chrome.storage.local` giu trang thai duong ong de trang tuy chon doc duoc ngay. */
export const LINK_STATUS_STORAGE_KEY = 'conversationBridge.link';

export const MESSAGE_KINDS = Object.freeze({
  /** Hoi trang thai duong ong. Khong doi gi. */
  LINK_STATUS: 'LINK_STATUS',
  /** Mo lai duong ong ngay, va dat lai ngan sach lui. Doi mot cu cham cua nguoi. */
  LINK_RECONNECT: 'LINK_RECONNECT',
  /** Hoa giai DUNG MOT khoa giao. Doi mot cu cham cua nguoi, va di kem dung mot `key`. */
  RESET_DELIVERY: 'RESET_DELIVERY',
});
