import {
  BusinessDateError,
  assertBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from '../business-date.js';
import type { TollImportRowReason } from './toll-decisions.js';
import { parseTollPassedAt } from './toll-datetime.js';
import { parseSignedTollAmount, tollRowFingerprint } from './toll-identity.js';
import type { TollColumnKey, TollProviderMappingPolicy } from './toll-policy.js';
import type { TollProvider, TollTransactionKind } from './toll-provider.port.js';

/**
 * DOC MOT DONG SAO KE ETC THANH SO LIEU — ham THUAN, khong doc tep, khong cham DB.
 *
 * Viec doc BYTE la cua `toll-statement-source.ts`. Viec HIEU mot dong la cua tep nay. Tach ra vi
 * hai viec do hong theo hai kieu khac han: "khong mo duoc tep" va "dong 14 co ngay hong".
 *
 * ===========================================================================
 * KHAC `fuel-statement-mapping.ts` O DUNG HAI CHO, va ca hai deu tu bang chung:
 *
 *   1. SO TIEN CO DAU. Sao ke ETC co ca luot tru, lan nap tien, lan HOAN TIEN.
 *   2. TRUNG DONG KHONG BI TU CHOI. VETC tu cong bo rang loi doc cheo lan sinh ra HAI giao dich
 *      cho MOT luot xe, roi hoan mot giao dich. Vut mot trong hai di se lam dong hoan tien mo coi
 *      va so du suy ra sai. Viec NEU RA trung la cua tang phan loai, khong phai tang doc.
 *      Xem `docs/kien-truc/transport-etc-ingestion.md` §5.1.
 */

export interface RawTollRow {
  /** So dong TRONG TEP, tu 1 — de nguoi doi soat mo tep ra tim dung dong. */
  readonly rowNumber: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface MappedTollRow {
  readonly rowNumber: number;
  readonly parseStatus: 'ACCEPTED' | 'REJECTED';
  readonly rejectReason: TollImportRowReason | null;
  readonly accountNoRaw: string;
  readonly kind: TollTransactionKind | null;
  readonly vehiclePlateRaw: string;
  readonly passedAt: Date | null;
  readonly businessDate: BusinessDate | null;
  readonly signedAmount: number | null;
  readonly stationLabel: string | null;
  readonly providerRef: string | null;
  readonly fingerprint: string | null;
  readonly rawValues: Readonly<Record<string, string>>;
}

export interface MapTollRowsInput {
  readonly rows: readonly RawTollRow[];
  readonly provider: TollProvider;
  readonly mapping: TollProviderMappingPolicy;
  /** Mui gio TENANT — `INV-25`. Ngay nghiep vu tinh MOT LAN, o day. */
  readonly timeZone: string;
}

/**
 * COT NAO DA KHAI ma khong co trong hang tieu de cua tep.
 *
 * Kiem o cap TEP truoc khi doc dong nao: neu bo cot sai, MOI dong se bi tu choi voi mot ly do noi
 * SAI CHO phai sua. Sai o day la sai CAU HINH, khong phai sai du lieu.
 */
export function missingTollColumns(
  headers: readonly string[],
  mapping: TollProviderMappingPolicy,
): string[] {
  const present = new Set(headers.map((header) => header.trim()));
  return (Object.keys(mapping.columns) as TollColumnKey[])
    .map((key) => mapping.columns[key])
    .filter((name): name is string => name !== undefined && name.trim() !== '')
    .filter((name) => !present.has(name.trim()));
}

/**
 * NGAY tren cot ngay nghiep vu -> `BusinessDate`. CHI hai dang, va CHI dang goi khach da khai.
 *
 * Khong co duong "thu doan xem la dang nao": mot bo doan se doc `03/04/2026` thanh 3 thang 4 o tep
 * nay va 4 thang 3 o tep khac, va ca hai deu "thanh cong". Sai lech do lo ra khi tong mot ky lech,
 * sau khi da bao cao.
 */
function parseMappedDate(
  value: string,
  format: TollProviderMappingPolicy['dateFormat'],
): BusinessDate | null {
  const text = value.trim();
  try {
    if (format === 'iso') return assertBusinessDate(text);
    const matched = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (matched === null) return null;
    const [, day, month, year] = matched;
    if (day === undefined || month === undefined || year === undefined) return null;
    return assertBusinessDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  } catch (error) {
    if (error instanceof BusinessDateError) return null;
    throw error;
  }
}

export function mapTollRows(input: MapTollRowsInput): MappedTollRow[] {
  const { mapping } = input;

  return input.rows.map((row): MappedTollRow => {
    const read = (key: TollColumnKey): string => {
      const column = mapping.columns[key];
      if (column === undefined || column === '') return '';
      return (row.values[column] ?? '').trim();
    };

    const accountNoRaw = read('accountNo');
    const plateRaw = read('vehiclePlate');
    const stationLabel = read('station') || null;
    const providerRefRaw = read('providerRef');
    const providerRef = providerRefRaw === '' ? null : providerRefRaw;

    /**
     * MOT DONG BI TU CHOI VAN DUOC TRA VE — voi moi o so lieu de `null`.
     *
     * KHONG bao gio dat mot gia tri mac dinh vao mot o khong doc duoc: mot ngay bia se di tiep vao
     * vong so khop nhu mot du kien that, va no SE khop — voi nham dong.
     */
    const reject = (reason: TollImportRowReason): MappedTollRow => ({
      rowNumber: row.rowNumber,
      parseStatus: 'REJECTED',
      rejectReason: reason,
      accountNoRaw,
      kind: null,
      vehiclePlateRaw: plateRaw,
      passedAt: null,
      businessDate: null,
      signedAmount: null,
      stationLabel,
      providerRef,
      fingerprint: null,
      rawValues: row.values,
    });

    if (accountNoRaw === '') return reject('TOLL_ROW_ACCOUNT_MISSING');

    /*
     * LOAI GIAO DICH — tra bang do goi khach khai, KHONG doan.
     *
     * Mot chuoi khong co trong bang lam dong do bi tu choi voi `TOLL_ROW_KIND_UNKNOWN`. Do la cau
     * tra loi dung: nha cung cap vua them mot loai dong moi (dung nhu chuyen phi 6.600d/thang da
     * xay ra), va mot con nguoi phai nhin no truoc khi no duoc xep vao mot loai san co.
     */
    const kindColumn = mapping.columns.kind;
    let kind: TollTransactionKind | null;
    if (kindColumn === undefined || kindColumn === '') {
      kind = mapping.defaultKind;
    } else {
      const kindText = read('kind');
      kind = mapping.kinds[kindText] ?? null;
    }
    if (kind === null) return reject('TOLL_ROW_KIND_UNKNOWN');

    const amountRaw = read('amount');
    if (amountRaw === '') return reject('TOLL_ROW_MISSING_AMOUNT');
    const signedAmount = parseSignedTollAmount(amountRaw);
    if (signedAmount === null) return reject('TOLL_ROW_AMOUNT_INVALID');

    /*
     * NGAY NGHIEP VU — MOT trong hai duong, uu tien cot ngay rieng neu goi khach khai no.
     *
     * Neu tep chi co "thoi diem qua tram", ngay nghiep vu duoc tinh TU no theo mui gio tenant —
     * dung mot lan, o day (`INV-25`). Doc lai bang UTC o mot tang sau se xep mot luot 23:40 ngay
     * 31/8 gio Viet Nam sang thang sau.
     */
    const passedAtRaw = read('passedAt');
    const dateRaw = read('businessDate');
    const hasDateColumn = (mapping.columns.businessDate ?? '') !== '';

    let passedAt: Date | null = null;
    if (passedAtRaw !== '') {
      passedAt = parseTollPassedAt(passedAtRaw, input.timeZone);
      if (passedAt === null) return reject('TOLL_ROW_DATE_INVALID');
    }

    let businessDate: BusinessDate | null;
    if (hasDateColumn && dateRaw !== '') {
      /*
       * Cot ngay nghiep vu CO GIA TRI thi no THANG — ke ca khi dong cung co gio qua tram.
       *
       * Doc duoc thi dung; doc KHONG duoc thi tu choi han, KHONG lang le roi ve gio qua tram. Mot
       * duong du phong im lang o day se giau di dung cai o ma nguoi dung go sai.
       */
      businessDate = parseMappedDate(dateRaw, mapping.dateFormat);
      if (businessDate === null) return reject('TOLL_ROW_DATE_INVALID');
    } else if (passedAt !== null) {
      businessDate = toBusinessDate(passedAt, input.timeZone);
    } else {
      return reject('TOLL_ROW_MISSING_DATE');
    }

    /*
     * CHI mot luot qua tram moi doi bien so.
     *
     * Nap tien va phi tai khoan la viec cua TAI KHOAN, khong cua mot chiec xe — va #269 J6 noi
     * thang: khong duoc doi moi giao dich ETC phai thuoc ve mot chuyen/mot xe.
     */
    if (kind === 'TOLL_PASS' && plateRaw === '') return reject('TOLL_ROW_PLATE_MISSING');

    return {
      rowNumber: row.rowNumber,
      parseStatus: 'ACCEPTED',
      rejectReason: null,
      accountNoRaw,
      kind,
      vehiclePlateRaw: plateRaw,
      passedAt,
      businessDate,
      signedAmount,
      stationLabel,
      providerRef,
      fingerprint: tollRowFingerprint({
        provider: input.provider,
        accountNo: accountNoRaw,
        kind,
        vehiclePlate: plateRaw === '' ? null : plateRaw,
        passedAt: passedAt === null ? null : passedAt.toISOString(),
        businessDate,
        signedAmount,
        stationLabel,
        providerRef,
      }),
      rawValues: row.values,
    };
  });
}
