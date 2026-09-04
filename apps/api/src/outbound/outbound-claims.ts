import type { OutboundCommitmentLevel } from '@netviet/shared';
import { normalize } from '../rules/text.js';

/**
 * BE MAT KHANG DINH trong mot doan van ban — BANG CHUNG, KHONG PHAI THAM QUYEN.
 *
 * ---------------------------------------------------------------------------------------------
 * DOC KY DOAN NAY TRUOC KHI SUA TEP.
 *
 * Tep nay KHONG cap phep cho cai gi. No tra loi mot cau duy nhat: "doan van nay mang nhung VAT
 * MANG KHANG DINH nao?". Mo hinh tham quyen o `outbound-authority.ts` chi so khop chung voi cac
 * grant tat dinh; khong mot ham nao o day tra ve "duoc gui".
 *
 * ---------------------------------------------------------------------------------------------
 * VAT MANG (CARRIER) — KHAC HAN "TU DIEN CUM TU". Doc doan nay de hieu ban sua 04/09/2026.
 *
 * Ban dau tep nay la mot bo tu dien: liet ke cach nguoi ta viet tien, viet chinh sach, viet cam
 * ket don. Cong tham quyen hoi "co thay cum nao trong tu dien khong?" — khong thay thi CHO GUI.
 * Review doc lap goi ten do la B1: bo trich van ban nam trong ranh gioi CHO PHEP, nen mot cach
 * dien dat ngoai tu dien la mot duong di vong. Ba cau tieng Viet binh thuong — "Tổng đơn là
 * 1.150.000.", "thanh toán sau 30 ngày", "Đơn của anh đã vào hệ thống rồi." — deu lot.
 *
 * Nay tep nay tim VAT MANG, tuc dac diem HINH DANG cua van ban, khong phai cach dien dat:
 *
 *   · CHU SO      — moi con so trong bai. Khong mot cach viet tieng Viet nao noi duoc "1.150.000"
 *                   ma khong dung chu so. Day la thu vet can KHONG THE tranh, khac han mot cum tu.
 *   · SO NGAY     — `N ngày` bat ky. Mot cam ket ve thoi han luon phai viet ra con ngay.
 *   · THE HOAN THANH + DANH TU DON — tieng Viet danh dau viec "da xay ra" bang mot tap tu RAT NHO
 *                   va DONG: `đã`, `rồi`, `xong`. Ghep voi danh tu don, do la mot cam ket trang
 *                   thai, BAT KE dong tu o giua la gi ("vào hệ thống", "lên sàn", ...).
 *
 * Khac biet mau chot: bo sot mot CUM TU thi cong mo ra; bo sot mot VAT MANG thi... khong xay ra,
 * vi vat mang la dieu kien can cua chinh viec noi ra khang dinh do. Cac tu dien ben duoi van con,
 * nhung chung chi con lam MOT viec: noi ro khang dinh thuoc loai/muc nao. Chung khong con quyet
 * dinh CO khang dinh hay khong.
 *
 * ---------------------------------------------------------------------------------------------
 * TU DIEN O DAY LA TU VUNG NEN TANG, KHONG PHAI CUA MOT KHACH.
 *
 * "cong no", "VAT", "COD", "cuoc van chuyen", "chot don" la tu vung thuong mai tieng Viet ma CA
 * san pham dung. Khong mot muc nao duoc phep la ten khach, ma SKU, hay mot con so cua mot khach.
 */

/* ------------------------------------------------------------------ *
 * LOP TIEN — MOT CACH VIET -> DUNG MOT GIA TRI VND
 * ------------------------------------------------------------------ */

/**
 * Tu day tro len, mot con so KHONG CO don vi van bi coi la tien.
 *
 * Ly do la DO LON, khong phai tu dien: gia trong nganh nay khong bao gio duoi bon chu so, con
 * thong so san pham ("220V", "12 tháng", "50 cái") thi gan nhu luon duoi. Nho the "Tổng đơn là
 * 1.150.000." bi chan ma "máy dùng điện 220V" van gui duoc — khong can mot danh sach don vi nao.
 */
export const MONEY_MAGNITUDE_FLOOR = 1_000;

/** Mot con so nhu no XUAT HIEN trong van ban, da quy ve dung mot gia tri. */
export interface NumeralLiteral {
  /** Nguyen van — de nguoi truc doi chieu duoc. */
  readonly written: string;
  /** Gia tri da quy doi. `null` = cach viet KHONG quy duoc ve mot gia tri duy nhat. */
  readonly value: number | null;
  /** Co don vi tien di kem (`k`, `tr`, `đ`, `vnd`, ...). */
  readonly money: boolean;
  /** Ngay sau con so la chu "ngày" — mot cam ket ve thoi han. */
  readonly days: boolean;
}

/** Nhom chu so ke ca dau phan cach; dau cuoi bi cat de "1.150.000." khong nuot dau cham cau. */
const NUMERAL_TOKEN = /\d[\d.,]*/gu;
/** Don vi tien ngay sau con so, kem phan le viet dinh ("2tr5" = 2.500.000, "1k5" = 1.500). */
const MONEY_UNIT = /^\s*(k|tr|tri[eệ]u|ngh[iì]n|ng[aà]n|vnd|[dđ])(\d*)(?![\p{L}])/iu;
/** Chu "ngày" ngay sau con so — co dau hoac khong. */
const DAY_WORD = /^\s*ng[aà]y(?![\p{L}])/iu;

function scaleOf(unit: string): number {
  const lower = normalize(unit);
  if (lower.startsWith('tr')) return 1_000_000;
  if (lower.startsWith('k') || lower.startsWith('ng')) return 1_000;
  return 1;
}

/**
 * MOT CACH VIET -> DUNG MOT GIA TRI, hoac `null`.
 *
 * Quy uoc Viet Nam: `.` phan cach hang nghin, `,` phan cach thap phan. Phan biet bang DO DAI nhom
 * chu so chu khong bang ky tu: nhom 3 chu so = hang nghin ("1.150" = 1150), nhom 1-2 chu so = phan
 * thap phan ("1,15" = 1.15; "30.6" = 30.6, mot ngay thang chu khong phai 306).
 *
 * Khong quy duoc ve mot gia tri thi tra `null` — va `null` o cong tham quyen la KHONG GUI. Mot
 * cach viet nhap nhang khong duoc phep tu chon nghia co loi cho no.
 */
export function numeralValue(token: string): number | null {
  const groups = token.split(/[.,]/u);
  if (groups.some((group) => group === '')) return null;
  if (groups.length === 1) return Number(groups[0]);

  const tail = groups.slice(1);
  if (tail.every((group) => group.length === 3)) return Number(groups.join(''));
  if (tail.length === 1 && tail[0]!.length <= 2) return Number(`${groups[0]}.${tail[0]}`);
  return null;
}

/**
 * MOI con so trong doan van, kem don vi va ngu canh ngay thang di lien.
 *
 * Day la phep quet VET CAN: `\d` khong the vang mat khoi mot cau co so. Moi lop kiem ben tren
 * deu dua tren ket qua nay chu khong dua tren mot mau rieng cho tung cach viet tien.
 */
export function numeralLiterals(text: string): NumeralLiteral[] {
  const literals: NumeralLiteral[] = [];
  for (const match of text.matchAll(NUMERAL_TOKEN)) {
    const token = match[0].replace(/[.,]+$/u, '');
    if (!token) continue;
    const rest = text.slice((match.index ?? 0) + token.length);
    const unit = MONEY_UNIT.exec(rest);
    const base = numeralValue(token);
    literals.push({
      written: token + (unit?.[0]?.trim() ?? ''),
      value: unit ? scaledValue(base, unit[1] ?? '', unit[2] ?? '') : base,
      money: Boolean(unit),
      days: DAY_WORD.test(rest),
    });
  }
  return literals;
}

/** "2tr5" = 2 trieu + 5 tram nghin. Phan le viet dinh nhan theo do dai cua chinh no. */
function scaledValue(base: number | null, unit: string, fraction: string): number | null {
  if (base === null) return null;
  const scale = scaleOf(unit);
  if (!fraction) return exactInteger(base * scale);
  // Vua co phan thap phan ("1,15tr") vua co phan le viet dinh ("1,15tr5") = nhap nhang.
  if (!Number.isInteger(base)) return null;
  return exactInteger(base * scale + Number(fraction) * (scale / 10 ** fraction.length));
}

function exactInteger(value: number): number | null {
  return Number.isInteger(value) ? value : null;
}

/**
 * Cac con so mang NGHIA TIEN trong doan van.
 *
 * Mot con so la tien khi co don vi tien di kem, HOAC khi do lon cua no vuot nguong, HOAC khi no
 * khong quy duoc ve mot gia tri (nhap nhang thi phai xet, khong duoc bo qua). Khong co lop thu
 * tu: khong tu dien don vi, khong tu dien cum tu tien te.
 */
export function monetaryLiterals(text: string): NumeralLiteral[] {
  return numeralLiterals(text).filter(
    (literal) => literal.money || literal.value === null || literal.value >= MONEY_MAGNITUDE_FLOOR,
  );
}

/** Gia tri VND ma mot bo ket qua tat dinh uy quyen — so nguyen, dang chuoi thap phan. */
export function authorizedAmounts(values: readonly number[]): string[] {
  return [
    ...new Set(
      values
        .filter((value) => Number.isFinite(value))
        .map((value) => String(Math.round(Math.abs(value)))),
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * LOP CHINH SACH — MA CHINH XAC TUNG LOAI
 * ------------------------------------------------------------------ */

/**
 * Be mat cua tung LOAI chinh sach, tren van ban da chuan hoa (bo dau, thuong hoa, `đ` -> `d`).
 *
 * Ma sinh ra la ma CHINH XAC (`payment_policy:ky_gui`), khong phai mot ma chung. Review doc lap
 * (B3) chi ra rang khi ca "ký gửi" lan "thanh toán ngay" cung quy ve `payment_terms`, thi mot dai
 * ly thanh-toan-ngay lai cap phep cho ban nhap noi ve ky gui — hai chinh sach TRAI NGUOC nhau.
 *
 * `cong_no` la HO, khong phai mot ky han: "bên mình cho công nợ" khong noi 30 hay 45. Ky han cu
 * the di theo `terms_days:<N>` ben duoi, va do la thu chan viec doi con so.
 */
const POLICY_SURFACES: Readonly<Record<string, readonly string[]>> = {
  'payment_policy:cong_no': ['cong no', 'tra cham', 'goi dau', 'han thanh toan'],
  'payment_policy:ky_gui': ['ky gui'],
  'payment_policy:thanh_toan_ngay': [
    'thanh toan ngay',
    'thanh toan truoc',
    'chuyen khoan truoc',
    'tra tien ngay',
  ],
  'payment_policy:cod': ['cod', 'thu ho', 'nhan tien khi giao'],
  cod: ['cod', 'thu ho', 'nhan tien khi giao'],
  vat: ['vat', 'hoa don do', 'xuat hoa don', 'thue gtgt'],
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
 * MA KHANG DINH CHINH SACH ma doan van dang dua ra.
 *
 * Hai nguon, va nguon thu hai moi la thu quan trong:
 *   1. tu dien be mat tren — noi ro LOAI chinh sach (phong thu chieu sau);
 *   2. MOI cum `N ngày` trong bai -> `terms_days:N` — VAT MANG, khong phu thuoc tu dien.
 *
 * Nho (2) ma "Anh được thanh toán sau 30 ngày." bi chan du "thanh toan sau" KHONG nam trong tu
 * dien nao: con so ngay la thu khong the giau di khi da hua mot thoi han.
 */
export function policyClaimTokens(text: string): string[] {
  const normalized = normalize(text);
  const tokens = new Set<string>();
  for (const [code, surfaces] of Object.entries(POLICY_SURFACES)) {
    if (surfaces.some((surface) => normalized.includes(surface))) tokens.add(code);
  }
  for (const literal of numeralLiterals(text)) {
    if (literal.days) tokens.add(`terms_days:${literal.value ?? 'khong_ro'}`);
  }
  return [...tokens];
}

/* ------------------------------------------------------------------ *
 * LOP CAM KET DON — CO MUC, KHONG PHAI MOT CAI GAT DAU
 * ------------------------------------------------------------------ */

/** Danh tu don. Khong co no thi khong co cam ket don, du cau co bao nhieu the hoan thanh. */
const ORDER_NOUN = /\b(don hang|don|order)\b/u;

/**
 * THE HOAN THANH cua tieng Viet — tap DONG va rat nho.
 *
 * Day la ly do ca "Đơn của anh đã vào hệ thống rồi." bi chan ma khong ai phai them cum "vào hệ
 * thống" vao dau ca: muon noi mot viec DA xay ra voi cai don, tieng Viet phai dung mot trong ba
 * tu nay. Dong tu o giua thi vo han; the hoan thanh thi khong.
 *
 * CO DAU, va KHONG chay tren van ban da chuan hoa — day la mot phan biet BAT BUOC: bo dau thi
 * `đã` (the hoan thanh) va `dạ` (tieng da thua le phep) deu thanh "da". Gan nhu moi cau tra loi
 * lich su deu mo dau bang "Dạ", nen chay tren ban bo dau se bien MOI cau co chu "đơn" thanh mot
 * cam ket don — vua chan oan, vua sai ve nghia.
 *
 * DANH DOI da biet: mot ban nhap viet HOAN TOAN khong dau mat tin hieu nay. Chap nhan duoc vi ban
 * nhap gui khach do persona viet tieng Viet co dau; con duong DONG TU ben duoi van chay tren ban
 * da chuan hoa, nen "da ghi nhan don" viet khong dau van bi bat.
 */
const PERFECTIVE = /đã|rồi|xong/u;

/**
 * DONG TU CAM KET -> MUC ma no tuyen bo. Chi de PHAN MUC, khong de phat hien.
 *
 * Viec phat hien do `ORDER_NOUN` + `PERFECTIVE` lo. Bang nay chi tra loi cau hoi thu hai: "cau do
 * tuyen bo den muc nao?". Khong khop dong tu nao => lay MUC CAO NHAT, vi mot cach noi khong nhan
 * ra duoc thi khong duoc phep tu nhan cho minh muc nhe nhat.
 */
const COMMITMENT_LEVEL_VERBS: readonly (readonly [OutboundCommitmentLevel, RegExp])[] = [
  ['fulfilled', /\b(da gui|da chuyen|dang giao|da giao|da dong bo)\b/u],
  ['confirmed', /\b(chot|xac nhan|duyet)\b/u],
  ['recorded', /\b(ghi nhan|len|tao|nhan|dat)\b/u],
];

/**
 * MUC cam ket ma doan van dang tuyen bo, hoac `null` neu no khong tuyen bo gi ve trang thai don.
 *
 * `null` KHONG co nghia "an toan" — no chi co nghia lop nay khong co y kien; cac lop khac (tien,
 * chinh sach) van xet doc lap.
 */
export function claimedCommitmentLevel(text: string): OutboundCommitmentLevel | null {
  const normalized = normalize(text);
  if (!ORDER_NOUN.test(normalized)) return null;
  const perfective = PERFECTIVE.test(text.toLowerCase());
  const matched = COMMITMENT_LEVEL_VERBS.find(([, pattern]) => pattern.test(normalized));
  if (!matched && !perfective) return null;
  // Co the hoan thanh nhung khong nhan ra dong tu => muc cao nhat (fail-closed).
  return matched ? matched[0] : 'fulfilled';
}

/** Ma uy quyen cua mot muc cam ket. Grant CONG DON: `confirmed` keo theo `recorded`. */
export function commitmentToken(level: OutboundCommitmentLevel): string {
  return `order:${level}`;
}
