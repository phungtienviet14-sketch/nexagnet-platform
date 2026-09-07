import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { BusinessDateError, assertBusinessDate, type BusinessDate } from '../business-date.js';
import { MONEY_MAX_AMOUNT } from '../money.js';
import { LITERS_SCALE, MAX_LITERS_UNITS } from './fuel-quantity.js';

/**
 * DOC MOT HOA DON DIEN TU XANG DAU THANH SO LIEU — ham THUAN, khong cham DB, khong biet Nest.
 *
 * ===========================================================================
 * VI SAO DUONG NAY DUNG TRUOC OCR (R0 §3.5, `F-10`)
 *
 * Nghi dinh 70/2025/ND-CP, hieu luc 01/06/2025, buoc MOI cua hang ban le xang dau phat hoa don
 * dien tu TUNG LAN BAN, ke ca cho khach le tra tien mat, va ket noi du lieu voi co quan thue. Tuc
 * so lieu do dau cua khach KHONG ket tren giay: no ton tai duoi dang XML CO CAU TRUC, phat tai
 * diem ban. Doc no khong can doan mot ky tu nao — trong khi doc mot to phieu nhiet nhau chup bang
 * dien thoai thi can.
 *
 * ===========================================================================
 * DAU CHAM O DAY LA DAU THAP PHAN — NGUOC HAN `fuel-statement-mapping.ts`
 *
 * Doc ky cho nay truoc khi sua mot dong nao ben duoi.
 *
 *   · BANG KE CSV do NGUOI go trong Excel. `1.500` co the la 1.500 lit (dau cham = phan cach hang
 *     nghin, kieu Viet Nam) hoac 1,5 lit. Khong biet duoc, nen `parseStatementLiters` chi nhan MOT
 *     dau phan cach va coi no la thap phan, con so TIEN thi coi moi dau cham la phan cach nghin.
 *
 *   · HOA DON XML do MAY phat theo mot XSD khai `SLuong`/`DGia`/`ThTien` la `decimal`. Dang tu vung
 *     cua `xs:decimal` dung dau CHAM lam dau thap phan va CAM moi dau phan cach hang nghin. Nen o
 *     day `62.5` la 62,5 lit — mot su that cua dinh dang, khong phai mot phong doan.
 *
 * Va vi vay `62,5` (dau phay) o day KHONG duoc doc thanh 62,5: no khong dung dang, va cau tra loi
 * dung la TU CHOI TRUONG DO co ten. Doan tiep se cho ra 625 lit hoac 0,625 lit — sai muoi lan hoac
 * mot tram lan, va con so sai do di thang vao phep kiem `so lit x don gia ~ thanh tien`.
 *
 * ===========================================================================
 * MOT TRUONG KHONG DOC DUOC KHONG LAM HONG CA CHUNG TU
 *
 * Chi bon kieu hong CAU TRUC moi tu choi ca chung tu (xem `EINVOICE_REJECT_REASONS`). Mot dong co
 * `SLuong` sai dang van duoc nhap, voi `litersUnits = null` va mot vet xuat xu ghi ro chuoi nguyen
 * ban khong doc duoc. Do la ca noi dung cua "khong doan ngam": nguoi doi soat thay chinh xac cho
 * nao khong doc duoc, thay vi mot chung tu bien mat khong dau vet.
 *
 * ===========================================================================
 * AN TOAN KHI DOC XML
 *
 * `XMLParser` cua `fast-xml-parser` KHONG phan giai thuc the ngoai (XXE) va KHONG no DTD — no bo
 * qua khai bao DOCTYPE thay vi mo rong chung. Nen mot chung tu co `<!ENTITY ... SYSTEM "file:///">`
 * khong doc duoc tep nao cua may chu, va mot "billion laughs" khong no ra duoc. `XMLBuilder` cua
 * cung goi thi CO mot canh bao (GHSA-gh4j-gqv2-49f6, da va tu 5.7.0) — ta khong dung no, va ban
 * ghim o `package.json` da la ban DA VA.
 */

/** Nam kieu hong CAU TRUC — moi kieu mot ten, va moi ten mot viec phai lam khac nhau. */
export const EINVOICE_REJECT_REASONS = [
  /**
   * XML KHONG DUNG DANG — the dong thieu, the long sai thu tu.
   *
   * Phat hien boi `XMLValidator`, KHONG boi `XMLParser`. Do la mot dieu da do chu khong mot gia
   * dinh: `parser.parse('<HDon><DLHDon><TTChung></HDon>')` KHONG nem — no tra ve mot cay mot phan
   * `{HDon:{DLHDon:{TTChung:''}}}`. Neu khong kiem truoc, mot hoa don bi cat ngang duong truyen se
   * di tiep nhu mot hoa don "thieu danh tinh", va nguoi truc se di tim mot loi khong ton tai.
   */
  'MALFORMED_XML',
  /**
   * Chung tu DUNG DANG nhung bo doc TU CHOI no.
   *
   * Duong duy nhat da biet den ma nay la mot tham chieu THUC THE NGOAI (`<!ENTITY x SYSTEM
   * "file:///...">`): bo doc nem `External entities are not supported` thay vi mo tep. Tach khoi
   * `MALFORMED_XML` vi viec phai lam khac han — day khong phai mot tep hong, day la mot tep DOC
   * HAI, va no phai duoc bao cho nguoi chu khong lang le xep vao "loi dinh dang".
   */
  'EXTERNAL_ENTITY_REJECTED',
  /** XML hop le nhung khong co goc `HDon` — mot tep khac bi gui nham. */
  'NOT_AN_INVOICE',
  /**
   * Thieu mot trong ba manh DANH TINH (`MST` nguoi ban, `KHHDon`, `SHDon`).
   *
   * Tu choi chu khong nhap voi cac o rong: ba manh nay la KHOA CHONG NHAP TRUNG o tang kho. Mot
   * ung vien khong co danh tinh se lot qua khoa do (Postgres coi hai `NULL` la khac nhau), va cung
   * mot hoa don gui lai lan hai se ghi them mot bo ung vien thu hai — tuc dem hai lan tien dau.
   */
  'MISSING_INVOICE_IDENTITY',
  /** Khong co `HHDVu` nao. Mot hoa don khong dong hang thi khong co gi de nhap. */
  'NO_LINE_ITEMS',
] as const;
export type EInvoiceRejectReason = (typeof EINVOICE_REJECT_REASONS)[number];

/**
 * XUAT XU cua MOT truong — duong dan XML doc ra no va chuoi NGUYEN BAN.
 *
 * Giu ca `raw` chu khong chi duong dan: khi ai do nghi phep doi kieu dang sai, thu ho can la CHUOI
 * MA MAY DA NHIN THAY, khong phai mot con so da qua hai lan bien doi.
 */
export interface EInvoiceFieldProvenance {
  readonly path: string;
  readonly raw: string;
  /** `true` khi doc duoc chuoi nhung KHONG doi duoc kieu — gia tri di ra la `null`. */
  readonly unreadable?: boolean;
}

export type EInvoiceProvenance = Readonly<Record<string, EInvoiceFieldProvenance>>;

export interface ParsedInvoiceLine {
  /** Dem tu 1 theo THU TU XUAT HIEN, khong theo `STT` cua chung tu — `STT` co the trung/thieu. */
  readonly lineNumber: number;
  readonly itemName: string | null;
  /** `DVTinh` nguyen ban. GIU LAI ke ca khi no khong phai `Lit` — loc o day se la doan. */
  readonly unit: string | null;
  /** `SLuong` -> so nguyen MILILIT (ty le 3). `null` = co chuoi nhung khong doc duoc. */
  readonly litersUnits: number | null;
  /** `DGia` -> so nguyen MILI-DONG moi lit (ty le 3). */
  readonly unitPriceUnits: number | null;
  /** `ThTien` -> so nguyen DONG. VND khong co don vi phu (`GD-03`). */
  readonly amount: number | null;
  readonly taxRateRaw: string | null;
  readonly provenance: EInvoiceProvenance;
}

export interface ParsedInvoice {
  /** `KHMSHDon` — mau so hoa don. Khong nam trong khoa chong trung; xem `MISSING_INVOICE_IDENTITY`. */
  readonly template: string | null;
  /** `KHHDon` — ky hieu hoa don. BAT BUOC. */
  readonly symbol: string;
  /** `SHDon` — so hoa don. BAT BUOC. */
  readonly number: string;
  /** Phan NGAY cua `NLap`. `null` khi khong doc duoc — khong bao gio bia mot ngay. */
  readonly issuedDate: BusinessDate | null;
  /**
   * Phan GIO cua `NLap`, nguyen ban.
   *
   * KHONG doi thanh mot khoanh khac: `NLap` khong mang mui gio, nen moi phep doi deu la mot phong
   * doan ve noi may chu dang chay. Giu chuoi lai va de tang tren quyet.
   */
  readonly issuedTimeRaw: string | null;
  readonly currencyCode: string;
  readonly sellerName: string | null;
  /** `MST` nguoi ban. BAT BUOC — day la soi day noi chung tu voi mot nha cung cap. */
  readonly sellerTaxCode: string;
  readonly sellerAddress: string | null;
  readonly buyerName: string | null;
  readonly buyerTaxCode: string | null;
  readonly lines: readonly ParsedInvoiceLine[];
  /** `TTKhac` cua hoa don — ten truong TU DAT, gia tri chuoi. Xem `readExtensions`. */
  readonly extensions: Readonly<Record<string, string>>;
  readonly provenance: EInvoiceProvenance;
}

export type EInvoiceParseResult =
  | { readonly ok: true; readonly invoice: ParsedInvoice }
  | { readonly ok: false; readonly reason: EInvoiceRejectReason };

/** `xs:decimal` — dau CHAM la thap phan, va KHONG co phan cach hang nghin. Khong dau am. */
const XSD_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * Chuoi `xs:decimal` -> so nguyen o mot TY LE cho truoc.
 *
 * MOT hien thuc dung cho ca so lit lan don gia. `fuel-quantity.ts` co `litersToUnits()` voi cung
 * luat nay o ty le 3, va `fuel-einvoice-parse.spec.ts` do rang HAI ban DONG Y voi nhau tren moi
 * dau vao hop le — do la cach giu hai ban khoi troi khoi nhau ma khong phai gop chung: tep kia so
 * huu SO LUONG NHIEN LIEU, tep nay so huu DANG TU VUNG CUA XML.
 *
 * Nhieu chu so thap phan hon ty le thi TU CHOI, khong lam tron: lam tron mot so lit hay mot don
 * gia la doi mot con so tien, va no doi trong im lang.
 */
export function parseXsdScaled(text: string, scale: number, max: number): number | null {
  const matched = XSD_DECIMAL.exec(text.trim());
  if (!matched) return null;

  const [, whole = '', fraction = ''] = matched;
  if (fraction.length > scale) return null;

  const units = Number(`${whole}${fraction.padEnd(scale, '0')}`);
  if (!Number.isSafeInteger(units) || units <= 0 || units > max) return null;
  return units;
}

/**
 * `ThTien` -> so nguyen DONG.
 *
 * Phan thap phan phai TOAN SO KHONG. `GD-03`: VND khong co don vi phu, nen `1437500.50` tren mot
 * hoa don VND la mot chung tu sai — va lam tron no se lam phep kiem `so lit x don gia ~ thanh
 * tien` lech dung nua dong ma khong ai giai thich duoc.
 */
export function parseInvoiceAmount(text: string): number | null {
  const matched = XSD_DECIMAL.exec(text.trim());
  if (!matched) return null;

  const [, whole = '', fraction = ''] = matched;
  if (fraction !== '' && /[^0]/.test(fraction)) return null;

  const amount = Number(whole);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MONEY_MAX_AMOUNT) return null;
  return amount;
}

/** Don gia toi da o ty le 3. Chan mot lan go nham, khong phai mot luat kinh doanh. */
export const MAX_UNIT_PRICE_UNITS = 1_000_000_000_000;

/**
 * `NLap` -> ngay nghiep vu + phan gio nguyen ban.
 *
 * Nhan ca `2026-09-05` lan `2026-09-05T14:30:00`. `assertBusinessDate` bat ca dang sai LAN ngay
 * khong co that (`2026-02-30`) — mot khuon bon-hai-hai chu so don thuan thi khong.
 */
export function parseInvoiceIssuedAt(source: string): {
  readonly date: BusinessDate | null;
  readonly time: string | null;
} {
  const matched = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(source.trim());
  if (!matched) return { date: null, time: null };

  const [, datePart = '', timePart] = matched;
  try {
    return { date: assertBusinessDate(datePart), time: timePart ?? null };
  } catch (error) {
    if (error instanceof BusinessDateError) return { date: null, time: timePart ?? null };
    throw error;
  }
}

/*
 * `trimValues: false` roi tu trim: ta muon giu chuoi nguyen ban de ghi vao vet xuat xu, va viec
 * cat khoang trang la quyet dinh cua tang nay chu khong cua thu vien.
 *
 * `parseTagValue: false` la dieu QUAN TRONG NHAT o day: mac dinh cua thu vien se doi `62.5` thanh
 * mot `number` cua JavaScript va `00001234` thanh `1234`. Ca hai deu la mat mat — cai dau lam ta
 * mat chuoi nguyen ban de kiem lai, cai sau lam SO HOA DON doi gia tri. Moi phep doi kieu o day
 * phai di qua cac ham `parse*` o tren, noi luat duoc viet ra va co test.
 */
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const child = (node: any, name: string): any =>
  node && typeof node === 'object' ? node[name] : undefined;

const text = (node: any, name: string): string | null => {
  const value = child(node, name);
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const asArray = (value: any): any[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

/**
 * `TTKhac` -> mot bang ten-gia tri.
 *
 * Khuon la `<TTin><TTruong>ten</TTruong><KDLieu>kieu</KDLieu><DLieu>gia tri</DLieu></TTin>`, va no
 * xuat hien o CA HAI cap: cap hoa don va cap tung dong hang.
 *
 * TEN TRUONG O DAY LA TU DAT. Khong co danh muc chuan nao, nen he thong khong duoc phep gia dinh
 * `BienSoXe` la ten ma moi nha cung cap dung. Ta doc CA BANG ra va de tang tren tim theo mot danh
 * sach ten co the co — mot lan doan sai o do chi lam mat mot GOI Y, khong lam sai mot con so.
 */
function readExtensions(node: any): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of asArray(child(node, 'TTin'))) {
    const name = text(entry, 'TTruong');
    const value = text(entry, 'DLieu');
    if (name !== null && value !== null && !(name in result)) result[name] = value;
  }
  return result;
}

export function parseEInvoiceXml(source: string): EInvoiceParseResult {
  // KIEM TRUOC, DOC SAU — `XMLParser` mot minh khong noi duoc mot tep hong. Xem `MALFORMED_XML`.
  if (XMLValidator.validate(source) !== true) return { ok: false, reason: 'MALFORMED_XML' };

  let document: any;
  try {
    document = parser.parse(source);
  } catch {
    // Da qua `validate`, nen tep DUNG DANG. Duong nem duy nhat da biet la thuc the ngoai.
    return { ok: false, reason: 'EXTERNAL_ENTITY_REJECTED' };
  }

  const data = child(child(document, 'HDon'), 'DLHDon');
  if (!data) return { ok: false, reason: 'NOT_AN_INVOICE' };

  const general = child(data, 'TTChung');
  const content = child(data, 'NDHDon');
  const seller = child(content, 'NBan');
  const buyer = child(content, 'NMua');

  const symbol = text(general, 'KHHDon');
  const number = text(general, 'SHDon');
  const sellerTaxCode = text(seller, 'MST');
  if (symbol === null || number === null || sellerTaxCode === null) {
    return { ok: false, reason: 'MISSING_INVOICE_IDENTITY' };
  }

  const items = asArray(child(child(content, 'DSHHDVu'), 'HHDVu'));
  if (items.length === 0) return { ok: false, reason: 'NO_LINE_ITEMS' };

  const provenance: Record<string, EInvoiceFieldProvenance> = {
    symbol: { path: 'HDon/DLHDon/TTChung/KHHDon', raw: symbol },
    number: { path: 'HDon/DLHDon/TTChung/SHDon', raw: number },
    sellerTaxCode: { path: 'HDon/DLHDon/NDHDon/NBan/MST', raw: sellerTaxCode },
  };

  const issuedRaw = text(general, 'NLap');
  const issued = issuedRaw ? parseInvoiceIssuedAt(issuedRaw) : { date: null, time: null };
  if (issuedRaw !== null) {
    provenance.issuedDate = {
      path: 'HDon/DLHDon/TTChung/NLap',
      raw: issuedRaw,
      ...(issued.date === null ? { unreadable: true } : {}),
    };
  }

  return {
    ok: true,
    invoice: {
      template: text(general, 'KHMSHDon'),
      symbol,
      number,
      issuedDate: issued.date,
      issuedTimeRaw: issued.time,
      // `DVTTe` vang mat = VND. Do la mac dinh cua chinh chuan, khong phai mot phong doan cua ta.
      currencyCode: text(general, 'DVTTe') ?? 'VND',
      sellerName: text(seller, 'Ten'),
      sellerTaxCode,
      sellerAddress: text(seller, 'DChi'),
      buyerName: text(buyer, 'Ten'),
      buyerTaxCode: text(buyer, 'MST'),
      lines: items.map((item, index) => readLine(item, index + 1)),
      extensions: readExtensions(child(data, 'TTKhac')),
      provenance,
    },
  };
}

function readLine(item: any, lineNumber: number): ParsedInvoiceLine {
  const base = `HDon/DLHDon/NDHDon/DSHHDVu/HHDVu[${lineNumber}]`;
  const provenance: Record<string, EInvoiceFieldProvenance> = {};

  const scaled = (field: string, tag: string, max: number): number | null => {
    const raw = text(item, tag);
    if (raw === null) return null;
    const units = parseXsdScaled(raw, LITERS_SCALE, max);
    provenance[field] = {
      path: `${base}/${tag}`,
      raw,
      ...(units === null ? { unreadable: true } : {}),
    };
    return units;
  };

  const litersUnits = scaled('litersUnits', 'SLuong', MAX_LITERS_UNITS);
  const unitPriceUnits = scaled('unitPriceUnits', 'DGia', MAX_UNIT_PRICE_UNITS);

  const amountRaw = text(item, 'ThTien');
  const amount = amountRaw === null ? null : parseInvoiceAmount(amountRaw);
  if (amountRaw !== null) {
    provenance.amount = {
      path: `${base}/ThTien`,
      raw: amountRaw,
      ...(amount === null ? { unreadable: true } : {}),
    };
  }

  const itemName = text(item, 'THHDVu');
  if (itemName !== null) provenance.itemName = { path: `${base}/THHDVu`, raw: itemName };

  return {
    lineNumber,
    itemName,
    unit: text(item, 'DVTinh'),
    litersUnits,
    unitPriceUnits,
    amount,
    taxRateRaw: text(item, 'TSuat'),
    provenance,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
