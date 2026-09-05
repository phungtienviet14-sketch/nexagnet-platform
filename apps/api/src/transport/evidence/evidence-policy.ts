import { MEDIA_KEY_PREFIX } from '../../media/media-policy.js';

/**
 * Chinh sach cua BANG CHUNG van tai — phan TAT DINH: loai tep nao duoc nhan, va byte nam o khoa nao.
 *
 * Tach khoi service co chu y, cung khuon `media/media-policy.ts`: tep nay khong cham mang, khong
 * cham dia, nen kiem duoc bang test thuan. Service la phan co tac dung phu.
 */

/**
 * DANH SACH TRANG loai tep — fail-closed, khong phai danh sach den.
 *
 * Nguon (VT-042) noi ve "anh phieu", va thuc te lai xe chup bang dien thoai. `application/pdf` co
 * mat vi ke toan doi khi nhan hoa don dien tu dang PDF tu cay xang.
 *
 * KHONG co `image/svg+xml`: SVG la mot tai lieu CO THE CHUA SCRIPT. Mot "anh" bang chung ma trinh
 * duyet chay duoc la mot duong XSS di thang qua cong tai len, va no khong giong mot rui ro cho toi
 * luc ai do mo bang chung do trong tab cua ke toan.
 */
export const TRANSPORT_EVIDENCE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * TIEN TO RIENG duoi `media/`.
 *
 * Nam duoi `MEDIA_KEY_PREFIX` de rule lifecycle cua bucket (quet dung chuoi do) van thay chung, va
 * co mot doan rieng de nguoi van hanh tim duoc bang chung van tai bang MOT prefix — khong lan voi
 * anh tin nhan Zalo.
 */
export const TRANSPORT_EVIDENCE_KEY_PREFIX = `${MEDIA_KEY_PREFIX}transport-evidence/`;

/** cuid do Prisma sinh chi gom chu-so-gach; bat dung khuon truoc khi ghep vao duong dan. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export type EvidenceRejection =
  'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED' | 'EVIDENCE_EMPTY' | 'EVIDENCE_TOO_LARGE';

export interface EvidenceCandidate {
  readonly contentType: string;
  readonly byteSize: number;
}

/**
 * Mot lan tai len co duoc nhan khong — tra ve LY DO, khong phai `boolean`.
 *
 * Ba duong tu choi, ba ma. Gop thanh mot `false` se lam giao dien chi noi duoc "tep khong hop le"
 * trong khi nguoi dung can biet minh phai doi tep, nen tep, hay chup lai.
 */
export function rejectEvidence(
  candidate: EvidenceCandidate,
  maxBytes: number,
): EvidenceRejection | null {
  // Chuan hoa TRUOC khi tra: trinh duyet gui `image/jpeg; charset=...`, va hoa/thuong khong dong nhat.
  const contentType = normaliseContentType(candidate.contentType);
  if (!(contentType in TRANSPORT_EVIDENCE_CONTENT_TYPES)) {
    return 'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED';
  }
  if (candidate.byteSize <= 0) return 'EVIDENCE_EMPTY';
  if (candidate.byteSize > maxBytes) return 'EVIDENCE_TOO_LARGE';
  return null;
}

/** `image/JPEG; charset=binary` -> `image/jpeg`. */
export function normaliseContentType(raw: string): string {
  return (raw.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Khoa object: `media/transport-evidence/2026/09/<id>.jpg`.
 *
 * Gom theo nam/thang UTC giong `buildMediaKey` cua nen tang — de rule lifecycle doc duoc theo tuoi,
 * va de tim bang chung cua mot thang bang mot prefix.
 *
 * Duoi tep suy tu CONTENT-TYPE da qua danh sach trang, KHONG tu ten tep nguoi dung gui len. Ten tep
 * la du lieu ben ngoai: `hoa-don.pdf.exe` hay mot ten kem `../` deu tung la duong ghi de tep.
 */
export function buildEvidenceKey(evidenceId: string, contentType: string, at: Date): string {
  if (!SAFE_ID.test(evidenceId)) {
    throw new Error(`Ma bang chung khong hop le cho khoa object: "${evidenceId}"`);
  }
  if (Number.isNaN(at.getTime())) {
    throw new Error('Thoi diem khong hop le — khong sinh duoc khoa object');
  }
  const extension = TRANSPORT_EVIDENCE_CONTENT_TYPES[normaliseContentType(contentType)];
  if (!extension) {
    throw new Error(`Loai tep khong nam trong danh sach trang: "${contentType}"`);
  }
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${TRANSPORT_EVIDENCE_KEY_PREFIX}${year}/${month}/${evidenceId}.${extension}`;
}

/**
 * Mot dinh vi CO PHAI do chinh he thong nay sinh ra khong.
 *
 * Cong CHONG DOC TUY Y: `TransportFuelReceiptEvidence.locator` la mot cot chuoi TU DO — no da nhan
 * dinh vi tu truoc khi co duong tai len nay, va se con nhan tu cac duong khac. Truoc khi dua mot
 * chuoi bat ky cho `MediaStore.get()`, phai chac no tro vao dung khu cua bang chung van tai.
 *
 * Khong co rao nay, mot dong `locator = 'media/2026/08/<anh Zalo cua khach>.webp'` — hoac te hon,
 * mot duong dan kem `../` — se bien route xem bang chung thanh mot cong DOC TUY Y trong bucket.
 */
export function isTransportEvidenceLocator(locator: string): boolean {
  if (!locator.startsWith(TRANSPORT_EVIDENCE_KEY_PREFIX)) return false;
  if (locator.includes('\0')) return false;
  // So theo TUNG DOAN chu khong `includes('..')`: mot ten tep hop le co the chua hai dau cham.
  return !locator.split('/').some((segment) => segment === '..' || segment === '');
}
