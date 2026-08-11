/**
 * Chinh sach cua tang luu anh: URL NAO duoc phep tai ve, va anh nam o KHOA nao trong bucket.
 *
 * Tach khoi `media-fetcher.service.ts` co chu y: day la phan tat dinh, kiem duoc bang test thuan
 * (khong mang, khong dia), con fetcher la phan co tac dung phu. Cung khuon `ingest/http-url.ts`.
 */

/** Prefix DUY NHAT moi object anh nam duoi — rule lifecycle GCS quet dung chuoi nay. */
export const MEDIA_KEY_PREFIX = 'media/';

/** cuid do Prisma sinh chi gom chu-so-gach; bat dung khuon nay truoc khi ghep vao duong dan. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Tach `MEDIA_ALLOWED_HOSTS` dang CSV. */
export function parseAllowedHosts(csv: string): string[] {
  return csv
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

/**
 * URL anh den TU TIN NHAN — tuc du lieu ben ngoai. Truoc Task 2 khong cho nao trong `apps/api/src`
 * tai URL do nguoi khac dua vao; tu nay thi co, nen day la cong chan SSRF: chi cho tai tu ten mien
 * cua Zalo, khong cho cham dia chi noi bo / metadata may chu dam may.
 *
 * FAIL CLOSED: danh sach rong = chan het. Xoa bien moi truong khong duoc bien thanh "mo toang".
 */
export function isAllowedMediaHost(url: string, allowedHosts: readonly string[]): boolean {
  if (allowedHosts.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // So theo BIEN DAU CHAM chu khong phai endsWith chuoi: `evil-zdn.vn` ket thuc bang "zdn.vn"
  // nhung la ten mien cua nguoi khac.
  return allowedHosts.some((allowed) => {
    const suffix = allowed.trim().toLowerCase();
    return suffix.length > 0 && (host === suffix || host.endsWith(`.${suffix}`));
  });
}

/**
 * Khoa object: `media/2026/08/<messageId>.webp`. Gom theo nam/thang UTC de rule lifecycle
 * chuyen tang theo tuoi doc duoc, va de nguoi van hanh tim anh cua mot thang bang mot prefix.
 */
export function buildMediaKey(messageId: string, sentAt: Date): string {
  if (!SAFE_ID.test(messageId)) {
    throw new Error(`messageId khong hop le cho khoa object: "${messageId}"`);
  }
  if (Number.isNaN(sentAt.getTime())) {
    throw new Error('sentAt khong phai ngay hop le — khong sinh duoc khoa object');
  }
  const year = sentAt.getUTCFullYear();
  const month = String(sentAt.getUTCMonth() + 1).padStart(2, '0');
  return `${MEDIA_KEY_PREFIX}${year}/${month}/${messageId}.webp`;
}
