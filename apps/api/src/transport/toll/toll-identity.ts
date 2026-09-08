import { createHash } from 'node:crypto';
import type { BusinessDate } from '../business-date.js';
import { MONEY_MAX_AMOUNT, MONEY_MIN_AMOUNT } from '../money.js';
import type { TollProvider, TollTransactionKind } from './toll-provider.port.js';

/**
 * DANH TINH cua mot dong ETC — ham THUAN, khong doc tep, khong cham DB.
 *
 * ===========================================================================
 * VI SAO KHONG NHAP `normalizePlate` TU `fuel-statement-mapping.ts`:
 *
 * Hai ham co the giong het nhau hom nay, va van KHONG duoc dung chung, vi mot ly do so huu:
 * `transport-fuel` la mot capability KHAC, dang duoc mot lane khac sua. Neu `transport-toll` nhap
 * mot ham cua no thi:
 *
 *   · mot khach bat `transport-toll` ma khong bat `transport-fuel` van keo theo module nhien lieu;
 *   · va mot lan chinh quy uoc bien so cua nhien lieu se lang le doi cach doc mot sao ke ETC.
 *
 * Cai dung duoc dung chung la QUY UOC (`GD-03`, `INV-25`, khuon bien so Viet Nam), khong phai
 * mot ham cu the cua mot capability anh em. Khi nen tang co mot `PG-*` ve danh tinh phuong tien
 * thi CA HAI cho cung goi den do.
 */

/** `29C-123.45`, `29C 12345` va `29c12345` la cung mot xe tren giay — nen cung mot chuoi o day. */
export const normalizeTollPlate = (value: string): string =>
  value.toUpperCase().replace(/[^0-9A-Z]/g, '');

/**
 * KHUON BIEN SO Viet Nam sau khi chuan hoa. NEO HAI DAU — mot khuon khong neo se tim thay "bien
 * so" trong moi chuoi du dai, va mot ten tram co chua so se bien thanh mot chiec xe.
 */
const VIETNAM_PLATE_SHAPE = /^\d{2}[A-Z]{1,2}\d?\d{4,5}$/;

export const looksLikeVietnamesePlate = (value: string): boolean =>
  VIETNAM_PLATE_SHAPE.test(normalizeTollPlate(value));

/**
 * SO TAI KHOAN GIAO THONG chuan hoa.
 *
 * Cung phep bien doi voi bien so nhung la MOT HAM RIENG co chu dich: hai khai niem nay khong bao
 * gio duoc so voi nhau, va mot ham dung chung se moi ai do lam dung the.
 */
export const normalizeAccountNo = (value: string): string =>
  value.toUpperCase().replace(/[^0-9A-Z]/g, '');

/**
 * SO TIEN CO DAU tren mot dong ETC -> so nguyen DONG.
 *
 * ===========================================================================
 * KHAC `parseStatementAmount` cua nhien lieu o DUNG mot cho: dong ETC CO DAU.
 *
 * Mot bang ke ETC co ca luot tru tien lan lan nap tien lan HOAN TIEN — VETC tu cong bo rang loi
 * doc cheo lan sinh ra hai lan tru roi mot lan hoan (`transport-etc-ingestion.md` §2.1). Mot bo
 * doc chi nhan so duong se bien dong hoan tien thanh mot dong bi tu choi, tuc lam mat dung cai
 * dong giai thich duoc hai dong kia.
 *
 * HAI quy uoc dau duoc nhan, va ca hai deu KHONG NHAP NHANG:
 *   `-52.000`   dau tru dan dau
 *   `(52.000)`  ngoac don kieu ke toan
 *
 * VND khong co don vi phu (`GD-03`) nen moi dau `.`/`,` trong phan so deu la PHAN CACH HANG NGHIN
 * — doc nhu vay la TAT DINH, khong phai doan. Nhung chi nhan phan cach DUNG CHO: `4.20` bi tu
 * choi thay vi lang le thanh 420 dong.
 *
 * CANH BAO NGHIEP VU: ham nay chi doc DAU, no khong noi gi ve NGHIA. Quy uoc "nap tien la duong
 * hay am" cua tung nha cung cap con o muc `CUSTOMER SAMPLE REQUIRED`, nen khong mot noi nao duoc
 * suy ra mot nghia vu thanh toan tu dau cua so tien nay.
 */
export function parseSignedTollAmount(value: string): number | null {
  const text = value.trim().replace(/\s/g, '');
  if (text === '') return null;

  const parenthesised = /^\((.+)\)$/.exec(text);
  const negative = parenthesised !== null || text.startsWith('-');
  const magnitude = parenthesised?.[1] ?? (text.startsWith('-') ? text.slice(1) : text);

  const plain = /^\d+$/.test(magnitude)
    ? magnitude
    : /^\d{1,3}(?:[.,]\d{3})+$/.test(magnitude)
      ? magnitude.replace(/[.,]/g, '')
      : null;
  if (plain === null) return null;

  const parsed = Number(plain);
  if (!Number.isSafeInteger(parsed)) return null;
  const amount = negative ? -parsed : parsed;
  if (amount > MONEY_MAX_AMOUNT || amount < MONEY_MIN_AMOUNT) return null;
  return amount;
}

export interface TollFingerprintInput {
  readonly provider: TollProvider;
  readonly accountNo: string;
  readonly kind: TollTransactionKind;
  readonly vehiclePlate: string | null;
  readonly passedAt: string | null;
  readonly businessDate: BusinessDate;
  readonly signedAmount: number;
  readonly stationLabel: string | null;
  readonly providerRef: string | null;
}

/**
 * MOT TRUONG -> mot doan CO DO DAI DAN DAU.
 *
 * ===========================================================================
 * DAY LA PHAN QUAN TRONG NHAT CUA TEP NAY, va no khong hien nhien.
 *
 * Cach ghep quen thuoc `[a, b].join('|')` co mot lo hong that: ten tram do NHA CUNG CAP viet ra.
 * Neu mot tram ten `A|B` thi dong do se dung dau van voi mot dong co tram `A` va tham chieu `B` —
 * hai su kien KHAC NHAU trung dau van. Hau qua khong phai mot loi hien ra: mot dong THAT bi gan
 * nhan `DUPLICATE_CANDIDATE` roi bi nguoi doi soat loai di, va so tien cua no bien mat khoi ky.
 *
 * Do dai dan dau lam ranh gioi giua cac truong khong con phu thuoc vao NOI DUNG cua chung: doc
 * `3:A|B` thi biet chac ba byte tiep theo la gia tri, dau `|` ben trong khong con la ranh gioi.
 *
 * `~` cho `null` va `0:` cho chuoi RONG la hai thu khac nhau — "nha cung cap khong gui truong nay"
 * va "nha cung cap gui mot truong rong" la hai su that khac nhau.
 */
const field = (value: string | null): string =>
  value === null ? '~' : `${String(Buffer.byteLength(value, 'utf8'))}:${value}`;

/**
 * DAU VAN cua mot dong — TIN HIEU chong lap o tang DONG, KHONG phai mot khoa duy nhat.
 *
 * #269 J4 cam bia ra mot luat duy nhat cho `providerReference` khi khong nha cung cap nao bao dam
 * co mot cai. Khong bao dam that (`transport-etc-ingestion.md` §2.3), nen day la mot HOP THANH co
 * tai lieu — va vi the hai luot qua tram THAT SU giong het nhau se dung dau van.
 *
 * Do CHINH LA tinh huong loi doc cheo lan cua VETC, nen dung dau van KHONG BAO GIO tu loai mot
 * dong: no chi dat dong do vao `DUPLICATE_CANDIDATE` de mot con nguoi nhin. Xem §5.1 cua tai lieu.
 */
export function tollRowFingerprint(input: TollFingerprintInput): string {
  const parts = [
    field(input.provider),
    field(normalizeAccountNo(input.accountNo)),
    field(input.kind),
    field(input.vehiclePlate === null ? null : normalizeTollPlate(input.vehiclePlate)),
    field(input.passedAt),
    field(input.businessDate),
    field(String(input.signedAmount)),
    field(input.stationLabel),
    field(input.providerRef),
  ];
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

/** SHA-256 cua BYTE goc — nua con lai cua chong lap, o tang NGUON. */
export const tollSourceDigest = (content: Buffer): string =>
  createHash('sha256').update(content).digest('hex');
