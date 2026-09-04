import { normalize } from '../rules/text.js';

/**
 * BE MAT KHANG DINH trong mot doan van ban — BANG CHUNG, KHONG PHAI THAM QUYEN.
 *
 * ---------------------------------------------------------------------------------------------
 * DOC KY DOAN NAY TRUOC KHI SUA TEP.
 *
 * Tep nay KHONG quyet dinh cai gi duoc gui. No chi tra loi mot cau duy nhat: "doan van nay CO
 * DANG dua ra mot khang dinh co he qua khong, va neu co thi la khang dinh gi?".
 *
 * Mo hinh tham quyen nam o `outbound-authority.ts`, va no van hanh theo chieu NGUOC LAI voi mot
 * bo loc van ban:
 *
 *   · CAP PHEP chi den tu nguon TAT DINH (rules engine gia, bang gia hien hanh, cap dai ly da
 *     map, trang thai don da ben vung). Khong mot ham nao trong tep nay cap phep duoc gi.
 *   · Tep nay chi co the LAM GIAM kha nang gui. Mot ma bi bo sot o day KHONG bien mot khang dinh
 *     thanh hop le — no chi lam ta mat mot lop phong thu; con mot lop khang dinh khong co grant
 *     thi mac dinh la KHONG GUI DUOC.
 *
 * Do la ly do vi sao "them mot tu vao tu dien" o day khong bao gio la mot thay doi ve tham quyen.
 * Neu mot ngay nao do ai do viet `if (text.includes('...')) return ALLOWED` trong tep nay, do la
 * luc hop dong bi dao nguoc — va `outbound-authority.spec.ts` khoa dieu do lai.
 *
 * ---------------------------------------------------------------------------------------------
 * TU DIEN O DAY LA TU VUNG NEN TANG, KHONG PHAI CUA MOT KHACH.
 *
 * "cong no", "VAT", "COD", "cuoc van chuyen", "chot don" la tu vung thuong mai tieng Viet ma CA
 * san pham dung (xem `POLICY_LABELS`, `INTENT_LABELS`, `confirmationText`). Khong mot muc nao o
 * day duoc phep la ten khach, ma SKU, hay mot con so cua mot khach cu the.
 */

/* ------------------------------------------------------------------ *
 * LOP TIEN
 * ------------------------------------------------------------------ */

/**
 * Bat "1.150k", "2tr5", "1.150.000d", "2 trieu" — cach viet tien pho bien trong nhom Zalo.
 *
 * DUNG CHUNG voi `advisor/money-guard.ts`: hai mau khac nhau cho cung mot khai niem se lech nhau,
 * va cho lech chinh la cho lot.
 */
export const MONEY_PATTERN = /(\d[\d.,]*)\s*(k|tr\d*|tri[eệ]u|vnd|ngh[iì]n|[dđ])(?![\p{L}\d])/giu;

/** So tran: duoi nguong nay thi khong phai gia ma la so luong, thang, kich thuoc… */
export const MIN_MONEY_DIGITS = 3;

/** Mot lan so tien xuat hien: cach VIET cua no, va cac gia tri no CO THE dang noi toi. */
export interface MonetaryClaim {
  /** Nguyen van nhu trong ban nhap — de nguoi truc doi chieu duoc. */
  readonly written: string;
  /** Cac dang chu so co the, da chuan hoa. */
  readonly forms: readonly string[];
}

/**
 * Mot cach viet ra NHIEU con so co the: "1.150k" co the la 1150 (chu so nhu viet) hoac 1150000
 * (da nhan 1000). Giu ca hai — de khong chan mot cach VIET, chi chan mot con so BIA.
 */
export function canonicalMoneyForms(digits: string, unit: string): string[] {
  const bare = digits.replace(/[.,\s]/g, '');
  if (!bare) return [];
  const scaled = scaleFor(unit);
  const forms = [bare];
  if (scaled) forms.push(String(Number(bare) * scaled));
  return forms.filter((form) => /^\d+$/.test(form));
}

function scaleFor(unit: string): number | null {
  const lower = unit.toLowerCase();
  if (lower.startsWith('k') || lower.startsWith('ngh')) return 1_000;
  if (lower.startsWith('tr')) return 1_000_000;
  return null;
}

/**
 * Moi lan so tien xuat hien trong van ban, da loai cac con so qua ngan (so luong, thang, kich
 * thuoc). Rong = van ban khong dua ra khang dinh tien nao.
 */
export function monetaryClaims(text: string): MonetaryClaim[] {
  const claims: MonetaryClaim[] = [];
  for (const match of text.matchAll(MONEY_PATTERN)) {
    const forms = canonicalMoneyForms(match[1] ?? '', match[2] ?? '').filter(
      (form) => form.length >= MIN_MONEY_DIGITS,
    );
    if (forms.length) claims.push({ written: match[0].trim(), forms });
  }
  return claims;
}

/**
 * Tap dang chu so DUOC UY QUYEN cho mot bo gia tri tat dinh.
 *
 * Kem cac dang rut gon ma nguoi Viet that su viet: 1.150.000 -> "1.150k" (1150), "1,15tr" (115).
 * Uy quyen mot CON SO thi uy quyen luon moi cach viet cua chinh no — thu bi chan la con so KHAC,
 * khong phai cach viet khac.
 */
export function authorizedMoneyForms(values: readonly number[]): string[] {
  const authorized = new Set<string>();
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const bare = String(Math.round(Math.abs(value)));
    authorized.add(bare);
    for (const zeros of [3, 6]) {
      if (bare.length > zeros && /^0+$/.test(bare.slice(-zeros))) {
        authorized.add(bare.slice(0, -zeros));
      }
    }
  }
  return [...authorized];
}

/* ------------------------------------------------------------------ *
 * LOP CHINH SACH
 * ------------------------------------------------------------------ */

/**
 * Sau loai khang dinh chinh sach theo muc 2 hop dong nhiem vu.
 *
 * Dong lai co y: mot loai moi la mot quyet dinh nghiep vu (phai co nguon tat dinh cap phep cho no),
 * khong phai mot lan them chuoi.
 */
export const POLICY_CLAIM_CODES = [
  /** Dieu khoan cong no/thanh toan: cong no N ngay, ky gui, tra cham, thanh toan ngay. */
  'payment_terms',
  /** VAT / hoa don do. */
  'vat',
  /** COD / thu ho. */
  'cod',
  /** Cuoc van chuyen / phi ship. */
  'shipping',
  /** Quyen huong khuyen mai, chiet khau, qua tang. */
  'promotion',
  /** Cau noi ham y da co mot lan phe duyet. */
  'authorization',
] as const;
export type PolicyClaimCode = (typeof POLICY_CLAIM_CODES)[number];

/**
 * Tu dien be mat, tren van ban DA CHUAN HOA (bo dau, thuong hoa, `đ` -> `d`).
 *
 * Moi muc phai la mot cum DU DAC TRUNG. Mot tu don le nhu "gia" hay "phi" se bat ca nhung cau
 * KHONG dua ra khang dinh chinh sach ("gia nay em kiem tra lai roi bao anh"), va mot bo trich
 * bang chung ket qua sai la mot bo trich khong ai tin nua.
 */
const POLICY_SURFACES: Readonly<Record<PolicyClaimCode, readonly string[]>> = {
  payment_terms: [
    'cong no',
    'tra cham',
    'goi dau',
    'ky gui',
    'thanh toan ngay',
    'thanh toan truoc',
    'han thanh toan',
    'chuyen khoan truoc',
  ],
  vat: ['vat', 'hoa don do', 'xuat hoa don', 'thue gtgt'],
  cod: ['cod', 'thu ho', 'nhan tien khi giao'],
  shipping: [
    'phi ship',
    'phi van chuyen',
    'cuoc van chuyen',
    'mien phi ship',
    'mien phi van chuyen',
    'freeship',
    'free ship',
  ],
  promotion: [
    'khuyen mai',
    'chiet khau',
    'tang kem',
    'qua tang',
    'giam gia',
    'uu dai',
    'duoc tang',
  ],
  authorization: ['da duyet', 'duoc duyet', 'phe duyet', 'da phe duyet', 'em duyet cho'],
};

/**
 * SO NGAY CONG NO ma doan van neu ra, neu co.
 *
 * VI SAO PHAI TACH RIENG: uy quyen o muc LOAI ("dai ly nay co dieu khoan cong no") van de lot mot
 * ban nhap doi CON SO ("cong no 30 ngay" cho mot dai ly dang o ky han 45). Muc 6 hop dong goi dung
 * ten dieu do: LLM duoc dien dat lai mot su that da duyet, khong duoc THAY GIA TRI cua no.
 *
 * `d{1,3}` va cua so hai chieu: nguoi Viet viet ca "cong no 30 ngay" lan "30 ngay cong no".
 */
const PAYMENT_TERM_DAYS =
  /(?:cong no|tra cham|goi dau|han thanh toan)\D{0,12}?(\d{1,3})\s*ngay|(\d{1,3})\s*ngay\s*(?:cong no|tra cham|goi dau)/u;

export function paymentTermDays(text: string): number | null {
  const match = PAYMENT_TERM_DAYS.exec(normalize(text));
  if (!match) return null;
  const days = Number(match[1] ?? match[2]);
  return Number.isInteger(days) && days > 0 ? days : null;
}

/**
 * MA KHANG DINH CHINH SACH ma doan van CO DANG dang dua ra.
 *
 * Ngoai sau ma goc, con co the co mot ma TINH THEO GIA TRI: `payment_terms:30`. Mot grant chi uy
 * quyen `payment_terms` (vd `ky_gui`) se KHONG phu duoc `payment_terms:30` — dung y.
 */
export function policyClaimTokens(text: string): string[] {
  const normalized = normalize(text);
  const tokens: string[] = POLICY_CLAIM_CODES.filter((code) =>
    POLICY_SURFACES[code].some((surface) => normalized.includes(surface)),
  );
  const days = paymentTermDays(text);
  if (days !== null && !tokens.includes('payment_terms')) tokens.push('payment_terms');
  if (days !== null) tokens.push(`payment_terms:${days}`);
  return tokens;
}

/* ------------------------------------------------------------------ *
 * LOP CAM KET DON
 * ------------------------------------------------------------------ */

/** Gia tri uy quyen duy nhat cua lop `order_commitment`. */
export const ORDER_COMMITMENT_CLAIM = 'order_recorded';

/**
 * Dong tu cam ket DI KEM danh tu don — khong bat mot loi cam on chung chung.
 *
 * VI SAO PHAI DI KEM: "em da ghi nhan y kien cua anh" trong mot cau ho tro KHONG phai mot cam ket
 * nghiep vu, con "em da ghi nhan don cua anh" thi la. Bat rieng dong tu se lam moi cau xac nhan
 * lich su tro thanh mot khang dinh he qua — va mot bo trich bao dong gia lien tuc se bi tat.
 */
const COMMITMENT_VERB = '(?:ghi nhan|chot|tao|len|dat|nhan)';
const ORDER_NOUN = '(?:don hang|don|order)';
const COMMITMENT_PATTERNS: readonly RegExp[] = [
  // "da ghi nhan don", "chot don cho anh", "da len don"
  new RegExp(`${COMMITMENT_VERB}\\s+(?:xong\\s+)?${ORDER_NOUN}\\b`, 'u'),
  // "don da duoc ghi nhan", "don cua anh da chot"
  new RegExp(`${ORDER_NOUN}\\s+(?:\\S+\\s+){0,3}?da\\s+(?:duoc\\s+)?${COMMITMENT_VERB}\\b`, 'u'),
];

/**
 * Doan van co dang khang dinh mot don DA duoc ghi nhan/chot/tao khong?
 *
 * Ket qua `true` khong noi don do co that — no noi rang neu KHONG co trang thai don nao uy quyen
 * cho cau nay thi tin nay khong duoc ra khoi he thong.
 */
export function claimsOrderCommitment(text: string): boolean {
  const normalized = normalize(text);
  return COMMITMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}
