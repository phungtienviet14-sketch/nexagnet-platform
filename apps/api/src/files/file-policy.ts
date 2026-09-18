import { createHash } from 'node:crypto';
import { MEDIA_KEY_PREFIX } from '../media/media-policy.js';
import type { FilePurpose } from './file.types.js';

/**
 * CHINH SACH cua nen tang tep — phan TAT DINH. `#287` P5.
 *
 * Tach khoi service theo dung khuon `media/media-policy.ts` va `transport/evidence/evidence-policy.ts`:
 * tep nay khong cham mang, khong cham dia, khong cham CSDL — nen kiem duoc bang test thuan, va moi
 * bat bien o day kiem duoc ma khong phai dung mot Postgres.
 *
 * ============================================================================================
 * TAI SAO KIEM NOI DUNG lai la mot cong RIENG, khong phai mot dong trong service
 * ============================================================================================
 *
 * `#287` P5 doi *"centralize pre-activation validation"*. "Trung tam hoa" chi co nghia khi co DUNG
 * MOT cho tra loi cau "tep nay co duoc phep khong" — neu moi mien tu kiem lay thi se co N cau tra
 * loi, va cai long nhat trong so do la cai that su dang chay.
 */

/**
 * TIEN TO RIENG cua nen tang tep, nam duoi `media/`.
 *
 * Duoi `MEDIA_KEY_PREFIX` de rule vong doi cua bucket (quet dung chuoi do) van thay chung — cung ly
 * le ma `TRANSPORT_EVIDENCE_KEY_PREFIX` da dung. Mot doan rieng de nguoi van hanh tim duoc tep cua
 * nen tang bang MOT prefix, khong lan voi anh tin nhan Zalo hay bang chung nhien lieu cu.
 */
export const PLATFORM_FILE_KEY_PREFIX = `${MEDIA_KEY_PREFIX}platform-file/`;

/**
 * LUAT cua mot MUC DICH — `#287` P5 *"bounded max size by purpose/category; MIME allow-list by
 * purpose"*.
 */
export interface FilePurposeRule {
  readonly maxBytes: number;
  /** MIME -> duoi tep CHUAN. Duoi suy tu day, KHONG tu ten nguoi dung gui len. */
  readonly allowedMimeTypes: Readonly<Record<string, string>>;
  /**
   * So NGAY giu toi thieu truoc khi duoc phep don byte — `#287` P8.
   *
   * `0` nghia la khong co han giu rieng: don duoc ngay khi nghiep vu da rut. Khong phai "khong bao
   * gio don" — dieu do la `legalHold`, va no la mot lenh rieng chu khong mot gia tri mac dinh.
   */
  readonly retentionDays: number;
}

/**
 * DANH SACH TRANG — fail-closed, khong phai danh sach den.
 *
 * KHONG co `image/svg+xml`. `#287` P5: *"SVG remains rejected unless a proven sanitization pipeline
 * exists"* — va o day khong co duong lam sach nao, nen no bi tu choi. Mot "anh" ma trinh duyet CHAY
 * DUOC la mot duong XSS di thang qua cong tai len, va no khong giong mot rui ro cho toi luc ai do
 * mo bang chung do trong tab cua ke toan.
 */
const IMAGE_AND_PDF: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Gioi han dung luong theo MUC DICH chu khong mot con so chung, va han giu cung vay: mot to phieu
 * chup bang dien thoai va mot chung tu ke toan khong cung mot che do.
 */
export const FILE_PURPOSE_RULES: Readonly<Record<FilePurpose, FilePurposeRule>> = {
  /** Giay to van hanh chup lai — to phieu, bien nhan, phieu can. */
  OPERATIONAL_DOCUMENT: {
    maxBytes: 15 * 1024 * 1024,
    allowedMimeTypes: IMAGE_AND_PDF,
    retentionDays: 3650,
  },
  /**
   * Chung tu tai chinh — hoa don, phieu thu. Giu 10 nam: do la moc luu tru chung tu ke toan, va mot
   * he thong don byte truoc moc do lam nguoi dung mat mot thu ho khong duoc phep mat.
   */
  FINANCIAL_EVIDENCE: {
    maxBytes: 15 * 1024 * 1024,
    allowedMimeTypes: IMAGE_AND_PDF,
    retentionDays: 3650,
  },
  /** Dinh kem thuong. Khong han giu rieng — don duoc ngay khi nghiep vu da rut. */
  GENERIC_ATTACHMENT: {
    maxBytes: 15 * 1024 * 1024,
    allowedMimeTypes: IMAGE_AND_PDF,
    retentionDays: 0,
  },
};

/**
 * LY DO tu choi — mot ma cho MOI duong, khong gop thanh mot `boolean`.
 *
 * `.claude/rules/ecc/common/code-review.md` doi rang mot cong nghiep vu co N duong tu choi phai
 * phan biet duoc N ly do. Va o day thi khong chi de debug: nguoi dung phai biet minh can DOI tep,
 * NEN tep, hay CHUP LAI — ba viec khac han nhau ma mot chu "tep khong hop le" khong noi duoc.
 */
export type FileRejection =
  | 'FILE_EMPTY'
  | 'FILE_TOO_LARGE'
  | 'FILE_MIME_NOT_ALLOWED'
  | 'FILE_CONTENT_MISMATCH'
  | 'FILE_ACTIVE_CONTENT_REJECTED';

export interface FileCandidate {
  readonly bytes: Buffer;
  readonly declaredMimeType: string;
  readonly purpose: FilePurpose;
}

/** `image/JPEG; charset=binary` -> `image/jpeg`. */
export function normaliseMimeType(raw: string): string {
  return (raw.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * NHAN DANG loai tep tu BYTE DAU — `#287` P5 *"content sniffing where feasible"*.
 *
 * Bon khuon, dung bon loai trong danh sach trang. KHONG dung mot thu vien nhan dang tong quat: mot
 * bo nhan dang cang rong thi cang nhieu loai duoc "nhan ra", trong khi o day dieu ta muon la NGUOC
 * LAI — chi bon loai duoc di qua, moi thu khac phai tro thanh `null` va bi tu choi.
 *
 * `null` = khong khuon nao khop. Goi ham nay tren mot tep rong hay mot tep 3 byte deu ra `null`, va
 * do la cau tra loi dung: khong nhan dang duoc thi khong duoc kich hoat.
 */
export function sniffMimeType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return 'image/png';
  }
  // WebP: `RIFF` .... `WEBP` — bon byte kich thuoc nam giua, nen phai doc ca hai doan.
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

/**
 * NOI DUNG CHAY DUOC — tu choi truoc ca khi so khuon.
 *
 * `#287` P5: *"reject unsupported executable/active content"*. Bon khuon duoi day KHONG phai mot bo
 * diet virus — do la viec cua `FileScannerPort`. Chung la mot cong RE bat dung nhung thu KHONG BAO
 * GIO duoc phep nam trong mot tep bang chung, ke ca khi may quet dang tat:
 *
 *   · `MZ`         — tep thuc thi Windows;
 *   · `7F 45 4C 46` — tep thuc thi Linux (ELF);
 *   · `PK 03 04`   — kho nen (docx/xlsx/jar deu la zip; mot kho nen khong phai mot to phieu);
 *   · `<` dau tep  — HTML/SVG/XML, tuc mot tai lieu trinh duyet CHAY DUOC.
 *
 * Khuon cuoi bo qua khoang trang dau vi mot tep SVG that thuong mo bang mot dong trong hoac mot
 * khai bao XML thut vao.
 */
export function hasActiveContent(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 4).toString('hex');
  if (head.startsWith('4d5a')) return true;
  if (head === '7f454c46') return true;
  if (head === '504b0304') return true;
  return bytes.subarray(0, 64).toString('latin1').trimStart().startsWith('<');
}

/**
 * MOT LAN TAI LEN CO DUOC NHAN KHONG — tra ve LY DO, khong `boolean`.
 *
 * THU TU cua nam phep kiem la mot quyet dinh, khong mot chi tiet:
 *
 *  1. RONG truoc — mot tep 0 byte khong co gi de nhan dang, nen moi phep sau deu vo nghia;
 *  2. NOI DUNG CHAY DUOC truoc ca danh sach trang — mot tep `.exe` khai la `image/jpeg` phai bi
 *     chan boi dung ly do do, khong boi mot ma "loai khong khop" nghe nhu mot lan go nham;
 *  3. DANH SACH TRANG theo muc dich;
 *  4. DUNG LUONG theo muc dich;
 *  5. NOI DUNG KHOP KHAI BAO cuoi cung — den day ca hai ben deu da hop le rieng le, va cai con lai
 *     la chung co noi CUNG MOT dieu khong.
 */
export function rejectFile(candidate: FileCandidate): FileRejection | null {
  const rule = FILE_PURPOSE_RULES[candidate.purpose];
  const byteSize = candidate.bytes.byteLength;
  if (byteSize <= 0) return 'FILE_EMPTY';
  if (hasActiveContent(candidate.bytes)) return 'FILE_ACTIVE_CONTENT_REJECTED';

  const declared = normaliseMimeType(candidate.declaredMimeType);
  if (!(declared in rule.allowedMimeTypes)) return 'FILE_MIME_NOT_ALLOWED';
  if (byteSize > rule.maxBytes) return 'FILE_TOO_LARGE';

  // `null` (khong nhan dang duoc) la mot LECH, khong phai mot cho trong: mot tep khai `image/png`
  // ma khong mang chu ky PNG nao thi khong ai chung minh duoc no la anh.
  return sniffMimeType(candidate.bytes) === declared ? null : 'FILE_CONTENT_MISMATCH';
}

/** cuid/uuid chi gom chu-so-gach; bat dung khuon nay truoc khi ghep vao duong dan. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * KHOA OBJECT: `media/platform-file/2026/09/<id>.jpg`.
 *
 * Gom theo nam/thang UTC — cung khuon `buildMediaKey`/`buildEvidenceKey`, de rule vong doi doc duoc
 * theo tuoi va de tim tep cua mot thang bang mot prefix.
 *
 * Duoi tep suy tu MIME DA QUA DANH SACH TRANG, KHONG tu ten nguoi dung gui len. Ten tep la du lieu
 * ben ngoai: `hoa-don.pdf.exe` hay mot ten kem `../` deu tung la duong ghi de tep.
 */
export function buildPlatformFileKey(
  fileId: string,
  mimeType: string,
  at: Date,
  purpose: FilePurpose,
): string {
  if (!SAFE_ID.test(fileId)) {
    throw new Error(`Ma tep khong hop le cho khoa object: "${fileId}"`);
  }
  if (Number.isNaN(at.getTime())) {
    throw new Error('Thoi diem khong hop le — khong sinh duoc khoa object');
  }
  const extension = FILE_PURPOSE_RULES[purpose].allowedMimeTypes[normaliseMimeType(mimeType)];
  if (!extension) {
    throw new Error(`Loai tep khong nam trong danh sach trang cua ${purpose}: "${mimeType}"`);
  }
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${PLATFORM_FILE_KEY_PREFIX}${year}/${month}/${fileId}.${extension}`;
}

/**
 * MOT KHOA CO PHAI do chinh nen tang nay sinh ra khong.
 *
 * Cung rao ma `isTransportEvidenceLocator` da dung, va cung ly do: truoc khi dua mot chuoi cho
 * `FileBlobStore.read()`/`remove()`, phai chac no tro vao dung khu cua nen tang tep. Khong co rao
 * nay, mot hang co `storageKey` dat bang tay se bien duong doc thanh mot cong DOC TUY Y trong
 * bucket — va duong don byte thanh mot cong XOA tuy y, con nguy hiem hon.
 */
export function isPlatformFileKey(key: string): boolean {
  if (!key.startsWith(PLATFORM_FILE_KEY_PREFIX)) return false;
  if (key.includes('\0')) return false;
  // So theo TUNG DOAN chu khong `includes('..')`: mot ten tep hop le co the chua hai dau cham.
  return !key.split('/').some((segment) => segment === '..' || segment === '');
}

/** Toi da cua ten hien thi. Dai hon nay thi cat phan THAN TEN, duoi giu nguyen. */
const MAX_DISPLAY_NAME = 80;

/**
 * TEN HIEN THI AN TOAN — `#287` P5 *"safe canonical filename"*.
 *
 * Ten nguoi dung gui len khong bao gio duoc dung lam duong dan (khoa object sinh tu `id`), nhung no
 * VAN di ra man hinh va VAN di vao header `Content-Disposition` khi tai ve. Nen no phai qua day:
 *
 *   · bo moi phan duong dan (`../`, `C:\`, `/etc/`) — giu DUNG doan cuoi;
 *   · bo ky tu dieu khien va ky tu he tep/header doi xu dac biet;
 *   · ep duoi tep theo MIME DA DUYET, khong theo duoi nguoi dung viet — `hoa-don.pdf.exe` ra
 *     `hoa-don.pdf.pdf` chu khong bao gio ra mot tep chay duoc;
 *   · khong bao gio tra ve chuoi rong.
 */
export function safeFilename(original: string, mimeType: string, purpose: FilePurpose): string {
  const extension = FILE_PURPOSE_RULES[purpose].allowedMimeTypes[normaliseMimeType(mimeType)];
  if (!extension) {
    throw new Error(`Loai tep khong nam trong danh sach trang cua ${purpose}: "${mimeType}"`);
  }
  // Cat theo CA HAI dau phan cach: ten tu Windows mang `\`, ten tu POSIX mang `/`, va mot ten do
  // nguoi ta nan ra de tan cong thuong mang ca hai.
  const base = original.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .replace(/\.[^.]*$/, '')
    // Ky tu dieu khien + nhung ky tu ma he tep hoac header HTTP doi xu dac biet.
    //
    // `no-control-regex` ton tai de bat nhung ky tu dieu khien LOT VAO mot khuon do so y. O
    // day thi chung la CHINH DOI TUONG: mot ky tu `NUL` hay `CR` trong ten tep di vao header
    // `Content-Disposition` la mot duong tiem header. Nen khuon nay CO Y bat chung.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"*:<>?|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Mot ten toan dau cham (`.`, `..`) la mot duong dan chu khong mot ten.
    .replace(/^\.+/, '');
  const stem = (cleaned.length > 0 ? cleaned : 'tep').slice(0, MAX_DISPLAY_NAME);
  return `${stem}.${extension}`;
}

/** Bam noi dung — `#287` P5 *"SHA-256 integrity"*. Hex thuong, 64 ky tu. */
export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
