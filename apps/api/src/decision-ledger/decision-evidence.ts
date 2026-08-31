import {
  isContentKey,
  isPiiKey,
  isSecretKey,
  scrubSecrets,
} from '../observability/telemetry-redaction.js';
import type { DecisionDetail, DecisionDetailValue } from './decision-ledger.types.js';

/**
 * CONG DUY NHAT de mot gia tri tro thanh BANG CHUNG trong so cai quyet dinh.
 *
 * ---------------------------------------------------------------------------
 * DANH SACH TRANG, KHONG PHAI BO LOC — dung lua chon cua `workflow/workflow-input.ts`, va vi
 * cung mot ly do:
 *
 *   bo loc          = "cho moi thu di qua, xoa nhung gi nhan ra"  -> cai khong nhan ra thi LOT
 *   danh sach trang = "chi cho di qua nhung gi da khai bao"       -> cai khong khai bao KHONG LOT
 *
 * So cai la ban ghi BEN VUNG: khong het han sau 30 ngay nhu trace, khong xoa duoc theo thiet ke
 * (append-only), va nam trong DB nghiep vu duoc backup. Mot lan ro ri o day la mot lan ro ri
 * VINH VIEN. Voi thu do, chi danh sach trang la du.
 *
 * NEM, KHONG CHE. Telemetry fail-open co chu dich (quan sat khong duoc lam sap nghiep vu). O day
 * thi nguoc lai: che im lang se ghi mot bang chung DA HONG vao so cai va khong ai biet, roi sau
 * nay co nguoi doi soat bang chinh no.
 *
 * ---------------------------------------------------------------------------
 * DUNG LAI BA VI TU CUA `telemetry-redaction.ts` (`isSecretKey`/`isPiiKey`/`isContentKey`), KHONG
 * viet danh sach thu hai. Chinh chu thich cua tep do da noi vi sao: neu ben kia tu viet mot danh
 * sach thu hai thi hai danh sach se lech nhau, va cho lech chinh la cho ro ri.
 *
 * Cai duy nhat THEM VAO o day la `isMonetaryKey` — mot pham tru ma telemetry khong co, vi muc 5
 * hop dong nhiem vu cam luu gia tri gia mat, va vi gia rieng theo dai ly la du lieu kinh doanh
 * mat cua khach trong mot repo PUBLIC.
 *
 * ---------------------------------------------------------------------------
 * DINH DANH KHONG BI QUET NOI DUNG — bai hoc 25/08/2026, khong phai so thich.
 *
 * Tren stack that, `entityId` tung bi quet bang mau SDT Viet Nam, va 1,2% UUID v4 khop mau do
 * (mot UUID chua khuc `0-9605-4854`). Ket qua: 1 tren 83 lan chot don that bai NGAU NHIEN. Xem
 * `workflow/workflow-input.ts` ham `assertEntityId`. Nen o day dinh danh duoc kiem bang KHUON:
 * mot chuoi khong dung khuon thi khong lot, va mot chuoi dung khuon thi khong the la SDT/email.
 */

/** Ly do TU CHOI bang chung — co kieu, de test khang dinh dung nguyen nhan. */
export const DECISION_EVIDENCE_REJECTIONS = [
  /** Khoa mang nghia bi mat (`apiKey`, `token`, `password`...). */
  'EVIDENCE_SECRET_KEY',
  /** Gia tri trong nhu bi mat (JWT, khoa `sk-ant-`, URL co mat khau, `Bearer`). */
  'EVIDENCE_SECRET_VALUE',
  /** Khoa mang nghia du lieu ca nhan (`phone`, `address`, `email`...). */
  'EVIDENCE_PII_KEY',
  /** Khoa mang noi dung hoi thoai hoac prompt/completion cua LLM. */
  'EVIDENCE_CONTENT_KEY',
  /**
   * Khoa mang SO TIEN hoac GIA.
   *
   * So cai ghi VI SAO mot muc gia duoc ap (`DEALER_PRICE_OVERRIDE_APPLIED`), khong ghi muc gia do
   * la bao nhieu. Con so nam o `BusinessFact`, duoc phan loai, va duoc doc qua duong co kiem soat.
   */
  'EVIDENCE_MONETARY_KEY',
  /** Gia tri khong phai vo huong — cay long nhau khong duoc vao so cai. */
  'EVIDENCE_VALUE_NOT_SCALAR',
  /** Chuoi dai hon `MAX_EVIDENCE_STRING` — mot tin nhan/prompt day du khong lot qua duong nay. */
  'EVIDENCE_STRING_TOO_LONG',
  /** Nhieu hon `MAX_EVIDENCE_KEYS` khoa — `detail` la bang chung, khong phai ban sao thuc the. */
  'EVIDENCE_TOO_MANY_KEYS',
  /** Ten khoa sai khuon. */
  'EVIDENCE_KEY_MALFORMED',
] as const;
export type DecisionEvidenceRejection = (typeof DECISION_EVIDENCE_REJECTIONS)[number];

export const DECISION_EVIDENCE_REJECTION_LABELS: Record<DecisionEvidenceRejection, string> = {
  EVIDENCE_SECRET_KEY: 'Có khoá mang nghĩa bí mật trong bằng chứng',
  EVIDENCE_SECRET_VALUE: 'Có giá trị trông như bí mật trong bằng chứng',
  EVIDENCE_PII_KEY: 'Có khoá mang nghĩa dữ liệu cá nhân trong bằng chứng',
  EVIDENCE_CONTENT_KEY: 'Có nội dung hội thoại hoặc prompt/completion trong bằng chứng',
  EVIDENCE_MONETARY_KEY: 'Có số tiền hoặc giá trong bằng chứng — sổ cái ghi lý do, không ghi số',
  EVIDENCE_VALUE_NOT_SCALAR: 'Bằng chứng chỉ nhận giá trị vô hướng, không nhận cây lồng nhau',
  EVIDENCE_STRING_TOO_LONG: 'Chuỗi quá dài cho một bằng chứng',
  EVIDENCE_TOO_MANY_KEYS: 'Quá nhiều khoá — bằng chứng không phải một bản sao thực thể',
  EVIDENCE_KEY_MALFORMED: 'Tên khoá sai khuôn',
};

export class DecisionEvidenceRejected extends Error {
  constructor(
    readonly rejection: DecisionEvidenceRejection,
    readonly path: string,
  ) {
    super(
      `DECISION_EVIDENCE_REJECTED[${rejection}] tai '${path}': ` +
        DECISION_EVIDENCE_REJECTION_LABELS[rejection],
    );
    this.name = 'DecisionEvidenceRejected';
  }
}

/**
 * Khoa mang SO TIEN / GIA. Pham tru nay KHONG co trong `telemetry-redaction.ts` va co y them o day.
 *
 * Telemetry het han sau 30 ngay va o muc `redacted` van giu so — mot con so trong trace la thu
 * nguoi truc can de doi chieu ngay trong luc su co. So cai thi ben vung va duoc backup, nen no
 * mang mot phep thu khac.
 */
const MONETARY_KEYS = new Set([
  // CHI nhung tu ma bo hau to phia duoi KHONG bat duoc. Moi dang ghep (`unitPrice`,
  // `freightAmount`, `closingBalance`, `shippingFee`, `grandTotal`...) da di qua `endsWith`, nen
  // liet ke chung o day vua thua vua nguy hiem: chinh mot muc thua nhu vay da keo ten mot mien
  // nghiep vu vao code cua tang nen, va `proofs/generic-api.proof.spec.ts` bat duoc no.
  'freight',
  'cod',
  'vat',
  'discount',
  'advance',
  'salary',
  'cost',
  'money',
  // Dang tieng Viet khong dau — cung mot khai niem, viet theo thoi quen go cua nguoi dung trong nuoc.
  'gia',
  'dongia',
  'tongtien',
  'thanhtien',
  'sotien',
  'cuoc',
  'sodu',
]);

/**
 * Cung khuon voi ba vi tu cua telemetry (chuan hoa khoa roi doi chieu tap + hau to), de hai noi
 * doc len giong nhau va khong ai phai nho hai luat.
 */
export function isMonetaryKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    MONETARY_KEYS.has(k) ||
    k.endsWith('price') ||
    k.endsWith('amount') ||
    k.endsWith('total') ||
    k.endsWith('fee') ||
    k.endsWith('balance')
  );
}

/**
 * Chuoi trong bang chung: ngan CO Y.
 *
 * 200 ky tu du cho mot ma, mot dinh danh, mot ten khuon, mot nhan ngan. Khong du cho mot tin nhan
 * khach, mot prompt, hay mot doan tai lieu — va do chinh la muc dich.
 */
export const MAX_EVIDENCE_STRING = 200;
/** So khoa toi da. `detail` la bang chung cua MOT quyet dinh, khong phai mot ban sao thuc the. */
export const MAX_EVIDENCE_KEYS = 24;

const EVIDENCE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;

/**
 * Khuon DINH DANH NOI BO — dung lai nguyen luat cua `workflow-input.ts`.
 *
 * Phai dung `SLUG_LIKE` (loai email va moi chuoi co khoang trang), VA phai co chu cai HOAC dung
 * khuon UUID (loai mot day toan chu so nhu mot so dien thoai). Mot SDT khong the thoa ca hai;
 * `cuid()` va `randomUUID()` thi luon thoa.
 */
const SLUG_LIKE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HAS_LETTER = /[A-Za-z]/;

/** `true` khi chuoi co hinh dang mot dinh danh noi bo — KHONG quet noi dung. Xem chu thich dau tep. */
export function isInternalIdentifier(value: string): boolean {
  if (!value) return false;
  if (scrubSecrets(value) !== value) return false;
  return SLUG_LIKE.test(value) && (HAS_LETTER.test(value) || UUID_LIKE.test(value));
}

/**
 * Dung `detail` cua mot quyet dinh tu mot gia tri bat ky. NEM o vi pham dau tien, kem duong dan.
 *
 * Tra ve ban SAO roi rac: mot bang chung da ghi khong duoc phep doi noi dung vi code chay sau no
 * sua doi tuong nghiep vu goc.
 */
export function buildDecisionEvidence(input: Readonly<Record<string, unknown>>): DecisionDetail {
  const keys = Object.keys(input);
  if (keys.length > MAX_EVIDENCE_KEYS) {
    throw new DecisionEvidenceRejected('EVIDENCE_TOO_MANY_KEYS', '(goc)');
  }

  const out: Record<string, DecisionDetailValue> = {};
  for (const key of keys) {
    if (!EVIDENCE_KEY.test(key)) throw new DecisionEvidenceRejected('EVIDENCE_KEY_MALFORMED', key);
    if (isSecretKey(key)) throw new DecisionEvidenceRejected('EVIDENCE_SECRET_KEY', key);
    if (isPiiKey(key)) throw new DecisionEvidenceRejected('EVIDENCE_PII_KEY', key);
    if (isContentKey(key)) throw new DecisionEvidenceRejected('EVIDENCE_CONTENT_KEY', key);
    if (isMonetaryKey(key)) throw new DecisionEvidenceRejected('EVIDENCE_MONETARY_KEY', key);

    const value = input[key];
    if (value === undefined) continue;
    out[key] = assertScalarEvidence(value, key);
  }
  return Object.freeze(out);
}

function assertScalarEvidence(value: unknown, path: string): DecisionDetailValue {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    // `NaN` va `Infinity` khong qua duoc JSON mot cach trung thuc: chung thanh `null` im lang, va
    // mot bang chung `null` doc len giong "da tra loi la khong co" trong khi su that la
    // "khong do duoc".
    if (!Number.isFinite(value)) {
      throw new DecisionEvidenceRejected('EVIDENCE_VALUE_NOT_SCALAR', path);
    }
    return value;
  }
  if (typeof value === 'bigint') {
    // `BigInt` la kieu tien cua mien van tai. Khoa mang nghia tien da bi chan phia tren; con lai
    // (so luong, so hang, so lan) van hop le va duoc ghi dang chuoi de khong mat do chinh xac.
    return value.toString();
  }
  if (typeof value === 'string') {
    if (value.length > MAX_EVIDENCE_STRING) {
      throw new DecisionEvidenceRejected('EVIDENCE_STRING_TOO_LONG', path);
    }
    if (scrubSecrets(value) !== value) {
      throw new DecisionEvidenceRejected('EVIDENCE_SECRET_VALUE', path);
    }
    // KHONG quet PII trong gia tri chuoi. Doan dau tep la ly do day du: phep quet do da tu choi
    // 1,2% dinh danh HOP LE tren stack that. Chan PII o day la viec cua DANH SACH TRANG KHOA
    // (phia tren) cong voi tran do dai — khong phai cua mot phep doan mau.
    return value;
  }
  throw new DecisionEvidenceRejected('EVIDENCE_VALUE_NOT_SCALAR', path);
}
