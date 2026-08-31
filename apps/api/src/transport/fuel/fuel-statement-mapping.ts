import { BusinessDateError, assertBusinessDate, type BusinessDate } from '../business-date.js';
import { MONEY_MAX_AMOUNT } from '../money.js';
import type { FuelStatementColumnKey, FuelStatementMappingPolicy } from './fuel-policy.js';
import { FuelQuantityError, litersToUnits } from './fuel-quantity.js';
import type { FuelStatementRejectReason } from './fuel.types.js';

/**
 * DOC MOT DONG BANG KE THANH SO LIEU — ham THUAN, khong doc file, khong cham DB.
 *
 * Viec doc BYTE (CSV hay XLSX) la cua adapter sau `FuelStatementSource`. Viec HIEU mot dong la cua
 * tep nay. Tach ra vi hai viec do hong theo hai kieu khac han nhau: mot ben la "khong mo duoc file",
 * mot ben la "dong 14 co ngay khong doc duoc" — va chi cai thu hai moi can den tung dong mot.
 *
 * ===========================================================================
 * "KHONG DOAN NGAM" DUOC HIEN THUC THE NAO:
 *
 * Moi duong tu choi co MOT MA RIENG, va mot dong bi tu choi VAN DUOC LUU voi cac o so lieu de
 * `null`. Cai gia phai tra la mot bang co nhung dong khong dung duoc; cai duoc la nguoi doi soat
 * biet chinh xac file cua ho co bao nhieu dong va bao nhieu dong khong doc duoc — con so ma mot bo
 * loc im lang se lay mat cua ho.
 *
 * KHONG bao gio dat mot gia tri MAC DINH vao mot o khong doc duoc. Mot ngay bia se di tiep vao vong
 * so khop nhu mot du kien that, va no se khop — voi nham phieu.
 */

/** BON cot BAT BUOC de mot dong so khop duoc. Hai cot con lai chi de nguoi doc doi chieu. */
export const REQUIRED_STATEMENT_COLUMNS: readonly FuelStatementColumnKey[] = [
  'vehiclePlate',
  'businessDate',
  'liters',
  'amount',
];

export interface RawStatementRow {
  /** So dong TRONG FILE, tu 1 — de nguoi doi soat mo file ra tim dung dong. */
  readonly rowNumber: number;
  /** Ten cot (hang tieu de) -> noi dung o, da doi ve chuoi boi adapter. */
  readonly values: Readonly<Record<string, string>>;
}

export interface MappedStatementLine {
  readonly rowNumber: number;
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly rejectReason: FuelStatementRejectReason | null;
  readonly vehiclePlateRaw: string;
  readonly vehicleId: string | null;
  readonly businessDate: BusinessDate | null;
  readonly litersUnits: number | null;
  readonly amount: number | null;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly rawValues: Readonly<Record<string, string>>;
}

export interface MapStatementRowsInput {
  readonly rows: readonly RawStatementRow[];
  readonly mapping: FuelStatementMappingPolicy;
  /** Bien so DA CHUAN HOA -> id xe. He thong KHONG tu tao xe tu mot file nhap. */
  readonly vehicleIdByNormalizedPlate: ReadonlyMap<string, string>;
}

/**
 * COT NAO CUA GOI KHACH KHONG CO TRONG HANG TIEU DE CUA FILE.
 *
 * Kiem o cap FILE truoc khi doc dong nao: neu anh xa cot sai, MOI dong se bi tu choi voi ly do
 * "thieu truong bat buoc" — mot bao cao dung ve ky thuat nhung noi sai hoan toan cho phai sua. Sai
 * o day la sai CAU HINH, khong phai sai du lieu.
 */
export function missingStatementColumns(
  headers: readonly string[],
  mapping: FuelStatementMappingPolicy,
): FuelStatementColumnKey[] {
  const present = new Set(headers.map((header) => header.trim()));
  return REQUIRED_STATEMENT_COLUMNS.filter((key) => !present.has(mapping.columns[key].trim()));
}

/**
 * CHUAN HOA BIEN SO truoc khi so.
 *
 * `29C-123.45`, `29C 12345` va `29c12345` la cung mot xe tren giay, nhung la ba chuoi khac nhau
 * trong may. Bang ke viet tay dung du ba kieu. Bo moi ky tu khong phai chu-so va dua ve chu hoa la
 * phep chuan hoa HEP NHAT lam ba chuoi do gap nhau — no khong lam hai bien so KHAC nhau gap nhau,
 * vi khong ky tu chu-so nao bi bo di.
 */
export const normalizePlate = (value: string): string =>
  value.toUpperCase().replace(/[^0-9A-Z]/g, '');

export function mapStatementRows(input: MapStatementRowsInput): MappedStatementLine[] {
  const seen = new Set<string>();

  return input.rows.map((row) => {
    const read = (key: FuelStatementColumnKey): string =>
      (row.values[input.mapping.columns[key]] ?? '').trim();

    const plateRaw = read('vehiclePlate');
    const dateRaw = read('businessDate');
    const litersRaw = read('liters');
    const amountRaw = read('amount');
    const invoiceNo = read('invoiceNo') || null;
    const note = read('note') || null;

    const reject = (reason: FuelStatementRejectReason): MappedStatementLine => ({
      rowNumber: row.rowNumber,
      status: 'REJECTED',
      rejectReason: reason,
      vehiclePlateRaw: plateRaw,
      vehicleId: null,
      businessDate: null,
      litersUnits: null,
      amount: null,
      invoiceNo,
      note,
      rawValues: row.values,
    });

    if (!plateRaw || !dateRaw || !litersRaw || !amountRaw) {
      return reject('MISSING_REQUIRED_FIELD');
    }

    const businessDate = parseStatementDate(dateRaw, input.mapping.dateFormat);
    if (businessDate === null) return reject('MALFORMED_DATE');

    const litersUnits = parseStatementLiters(litersRaw);
    if (litersUnits === null) return reject('MALFORMED_LITERS');

    const amount = parseStatementAmount(amountRaw);
    if (amount === null) return reject('MALFORMED_AMOUNT');

    const vehicleId = input.vehicleIdByNormalizedPlate.get(normalizePlate(plateRaw)) ?? null;
    if (vehicleId === null) return reject('UNKNOWN_VEHICLE');

    /*
     * TRUNG DONG — do bang NOI DUNG NGHIEP VU, khong bang ca hang nguyen ban.
     *
     * Hai dong chi khac nhau o cot "Ghi chu" van la cung mot lan do dau duoc in hai lan. Nguoc lai,
     * hai lan do dau THAT SU giong het nhau trong cung mot ngay (cung xe, cung so lit, cung so
     * tien) la chuyen gan nhu khong xay ra — va neu xay ra thi so hoa don se khac. Nen khoa trung
     * co ca `invoiceNo`: no la thu duy nhat phan biet duoc hai lan bom giong het nhau.
     */
    const duplicateKey = [
      normalizePlate(plateRaw),
      businessDate,
      String(litersUnits),
      String(amount),
      invoiceNo ?? '',
    ].join('|');
    if (seen.has(duplicateKey)) return reject('DUPLICATE_ROW');
    seen.add(duplicateKey);

    return {
      rowNumber: row.rowNumber,
      status: 'ACCEPTED',
      rejectReason: null,
      vehiclePlateRaw: plateRaw,
      vehicleId,
      businessDate,
      litersUnits,
      amount,
      invoiceNo,
      note,
      rawValues: row.values,
    };
  });
}

/**
 * NGAY tren bang ke -> ngay nghiep vu.
 *
 * Hai dang, va CHI hai dang ma goi khach da khai. Khong co duong "thu doan xem la dang nao": mot bo
 * doan se doc `03/04/2026` thanh 3 thang 4 o file nay va 4 thang 3 o file khac, va ca hai deu
 * "thanh cong". Sai lech do khong bao gio lo ra o mot dong don le — no lo ra khi tong cua mot ky
 * lech, sau khi da bao cao.
 *
 * Ngay tu XLSX den day DA duoc adapter doi ve `YYYY-MM-DD` (o ngay cua Excel la mot con so, khong
 * phai chuoi) — nen dang `iso` van dung cho mot file XLSX co cot ngay that su la ngay.
 */
export function parseStatementDate(
  value: string,
  format: FuelStatementMappingPolicy['dateFormat'],
): BusinessDate | null {
  const text = value.trim();
  try {
    if (format === 'iso') return assertBusinessDate(text);

    const matched = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (!matched) return null;
    const [, day, month, year] = matched;
    // Ba nhom deu BAT BUOC trong bo loc tren, nen chung khong the vang mat khi da khop. Kiem lai
    // vi cau hinh TypeScript cua repo coi truy cap chi so la co the `undefined`, va viet `!` o day
    // se la cho DUY NHAT trong tep nay noi rang "toi biet ro hon trinh bien dich".
    if (day === undefined || month === undefined || year === undefined) return null;
    return assertBusinessDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  } catch (error) {
    // `assertBusinessDate` nem cho ca dang sai LAN ngay khong co that (`2026-02-30`). Ca hai deu la
    // `MALFORMED_DATE` o day — nguoi dung phai mo file ra sua o do, khong co duong nao khac.
    if (error instanceof BusinessDateError) return null;
    throw error;
  }
}

/**
 * SO LIT tren bang ke -> so nguyen mililit.
 *
 * ---------------------------------------------------------------------------
 * MOT DAU PHAN CACH THAP PHAN, KHONG HON — va do la mot quyet dinh co y.
 *
 * `1.500` co the la 1.500 lit (dau cham la phan cach hang nghin, kieu Viet Nam) hoac 1,5 lit (dau
 * cham la thap phan). KHONG co cach nao biet chac tu chinh chuoi do. Doan mot trong hai la sai
 * 1000 lan o mot nua so lan doan — va con so sai do se di vao phep tinh tieu hao roi ra mot dinh
 * muc vo ly ma khong ai truy nguoc duoc.
 *
 * Nen luat o day HEP va ghi ro: dung MOT dau phan cach (`.` hoac `,`), va no LUON la dau thap
 * phan. Mot file dung dau cham lam phan cach hang nghin cho so lit se bi tu choi tung dong voi ma
 * `MALFORMED_LITERS` — va do la cau tra loi dung: hay sua file, hoac cho chung toi biet quy uoc cua
 * cay xang nay de them mot lua chon vao goi khach.
 *
 * (So TIEN thi khac: VND khong co don vi phu (`GD-03`), nen `4.200.000` KHONG the la mot so thap
 * phan, va viec doc dau cham la phan cach hang nghin o do la tat dinh chu khong phai doan.)
 */
export function parseStatementLiters(value: string): number | null {
  const text = value.trim().replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  try {
    return litersToUnits(text.replace(',', '.'));
  } catch (error) {
    if (error instanceof FuelQuantityError) return null;
    throw error;
  }
}

/**
 * SO TIEN tren bang ke -> so nguyen DONG.
 *
 * VND khong co don vi phu (`GD-03`), nen moi dau `.`/`,`/khoang trang trong mot so tien deu la
 * PHAN CACH HANG NGHIN. Doc chung nhu vay la tat dinh, khong phai doan — khac han truong hop so
 * lit o tren.
 *
 * Nhung chi chap nhan phan cach dung CHO: `4.200.000` duoc, `4.2000.00` thi khong. Bo loc
 * `^\d{1,3}(sep\d{3})*$` lam dung viec do. Mot chuoi nhu `4.20` se bi TU CHOI thay vi lang le
 * thanh 420 dong — vi neu cay xang that su viet `4.20` thi ho dang dung mot quy uoc khac, va doan
 * tiep la dung cai ma tep nay ton tai de tranh.
 */
export function parseStatementAmount(value: string): number | null {
  const text = value.trim().replace(/\s/g, '');
  const plain = /^\d+$/.test(text)
    ? text
    : /^\d{1,3}(?:[.,]\d{3})+$/.test(text)
      ? text.replace(/[.,]/g, '')
      : null;
  if (plain === null) return null;

  const amount = Number(plain);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MONEY_MAX_AMOUNT) return null;
  return amount;
}
