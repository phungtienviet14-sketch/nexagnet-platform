import { businessDateDifferenceInDays } from '../business-date.js';
import type { FuelCandidate } from './fuel-document.types.js';
import { LITERS_SCALE } from './fuel-quantity.js';
import { normalizePlate } from './fuel-statement-mapping.js';

/**
 * KIEM TAT DINH mot ung vien — ham THUAN, khong cham DB, khong biet Nest (Lane C / C4).
 *
 * ===========================================================================
 * KHONG KET LUAN NAO O DAY SINH RA MOT KHOAN NO, MOT LAN TRU LUONG, HAY MOT CAO BUOC
 *
 * `INV-07`/`INV-27` cua T1 va muc C4 cua #236 deu noi cung mot dieu: bat thuong di den NGUOI, khong
 * di den so quy. Nen ham nay tra ve mot DANH SACH PHAT HIEN co ma, va khong gi khac. No khong doi
 * mot trang thai, khong ghi mot hang, va khong xep loai ai.
 *
 * `NO_FINDINGS` cung KHONG phai mot lan duyet: mot ung vien sach van thieu dung thu quan trong
 * nhat — XE NAO — vi hoa don dien tu khong mang truong bien so (xem `fuel-candidate-normalize.ts`).
 * Ten cua hai ket cuc co y tranh moi tu goi nho den su chap thuan.
 *
 * ===========================================================================
 * PHEP KIEM DUOC TINH LUC DOC, KHONG DUOC LUU
 *
 * Khong bang nao luu ket qua duoi day, va do la mot lua chon. Phat hien la thu SUY RA TAT DINH tu
 * mot ung vien bat bien cong voi danh muc hien tai; luu no lai se tao ra mot su that THU HAI, va
 * su that thu hai bat dau troi khoi su that thu nhat ngay lan dau ai do sua danh muc xe. Tinh lai
 * moi lan doc thi khong bao gio troi — va gia phai tra la mot vong lap tren vai chuc dong.
 *
 * ===========================================================================
 * BON PHEP KIEM MA #236 LIET KE NHUNG TRANCHE NAY *KHONG* LAM, VA LY DO
 *
 *   · `odometer monotonicity`   — doi mot XE va lan do dau truoc cua chinh no. Ung vien khong co
 *     xe (chi co mot GOI Y bien so), nen phep so nay chi co nghia SAU khi mot nguoi da gan xe.
 *   · `vehicle/trip/run consistency` — cung ly do; them nua `Run`/`Leg` thuoc Lane A va chua hop nhat.
 *   · `station/geofence plausibility` — doi mot VI TRI CHUP luc do dau. Mot hoa don dien tu khong
 *     mang toa do nao; thu duy nhat co toa do la ban thu tram, va so mot tram voi chinh no la mot
 *     phep kiem rong. No chi co nghia khi doi chieu voi ban ghi bam vi tri cua Lane B (#235) trong
 *     cung cua so thoi gian — tuc sau khi co xe. `assessGeofences` cua ho la ham SE duoc dung;
 *     tranche nay khong viet mot ban thu hai.
 *   · `don gia trong khung gia ban le da cong bo` — R0 §3.5 goi day la phep kiem gan nhu mot nguon
 *     doi chieu doc lap, va no dung. Nhung repo chua co nguon gia dieu hanh nao, va bia mot bang
 *     gia ra de "co phep kiem" thi te hon khong co: no se bao dong sai o moi ky dieu chinh gia.
 *
 * Ca bon deu doi mot manh du lieu ma tranche nay chua co. Viet chung bay gio se ra nhung phep kiem
 * LUON IM LANG — dang so nhat trong mot he thong chong that thoat, vi chung trong nhu dang chay.
 */

/** MOI phat hien mot ma. Khong co ma "khac", va khong co co `boolean` nao gop hai duong lai. */
export const FUEL_CANDIDATE_FINDINGS = [
  /**
   * `so lit x don gia` khong ra `thanh tien` trong dung sai.
   *
   * Phep kiem re nhat va manh nhat cua ca tang: no bat mot chu so bi doc nham o BAT KY o nao trong
   * ba o, ma khong can biet gi ve doi xe hay ve gia thi truong.
   */
  'ARITHMETIC_MISMATCH',
  /** Khong doc duoc so lit — o co mat nhung sai dang. Xem vet xuat xu cua ung vien. */
  'QUANTITY_UNREADABLE',
  'UNIT_PRICE_UNREADABLE',
  'AMOUNT_UNREADABLE',
  'ISSUED_DATE_UNREADABLE',
  /**
   * Hoa don ghi mot ngay o TUONG LAI so voi luc nhap.
   *
   * Khong phai mot lan bat be: mot ngay tuong lai lam moi bao cao theo ky dat khoan chi vao nham
   * thang, va no la dau hieu quen thuoc cua mot o ngay bi go nham nam.
   */
  'ISSUED_DATE_IN_FUTURE',
  /**
   * Don vi tinh khong phai LIT.
   *
   * Mot hoa don xang dau co the co dong khong phai nhien lieu (nuoc uong, dau nhot). Loc chung o
   * tang doc se la doan; danh dau o day de NGUOI quyet la trung thuc.
   */
  'UNIT_NOT_LITRES',
  /** Chua nhan ra cay xang — mot trong bon ket cuc khong phai `RESOLVED`. */
  'STATION_UNRESOLVED',
  /** Chung tu chua noi duoc voi nha cung cap nao qua ma so thue. */
  'SUPPLIER_UNLINKED',
  /**
   * Khong co goi y bien so nao.
   *
   * KHONG phai loi cua chung tu: ND 123/2020 Dieu 10 khong doi hoa don ghi bien so. Day la mot
   * phat hien vi no noi cho nguoi doi soat biet ho se phai TU gan xe — va do la truong hop THUONG,
   * khong phai truong hop hiem.
   */
  'PLATE_HINT_ABSENT',
  /** Co goi y bien so, nhung khong khop xe nao dang co. Khong bao gio tu tao xe tu mot chung tu. */
  'PLATE_HINT_UNKNOWN_VEHICLE',
] as const;
export type FuelCandidateFinding = (typeof FUEL_CANDIDATE_FINDINGS)[number];

export interface FuelCandidateFindingDetail {
  readonly finding: FuelCandidateFinding;
  /** So lieu da do, de nguoi doc khong phai tu tinh lai. */
  readonly detail?: Readonly<Record<string, number | string>>;
}

/**
 * HAI ket cuc, va ca hai deu KHONG phai mot lan duyet.
 *
 * `NO_FINDINGS` chi noi rang khong phep kiem tat dinh nao keu — no khong noi rang so lieu dung, va
 * tuyet doi khong noi rang tien duoc chi. Mot ung vien sach van thieu XE.
 */
export interface FuelCandidateAssessment {
  readonly outcome: 'NO_FINDINGS' | 'HAS_FINDINGS';
  readonly findings: readonly FuelCandidateFindingDetail[];
}

/**
 * DUNG SAI cua phep kiem so hoc, tinh bang DONG.
 *
 * Mot dong, khong hon. `so lit x don gia` co the ra mot so le khi don gia khong tron nghin, va nha
 * cung cap lam tron ve dong — sai lech toi da cua mot lan lam tron do la nua dong. Noi rong dung
 * sai ra hang tram dong se lam phep kiem bo qua dung nhung sai lech ma no ton tai de bat.
 *
 * Phat hien LUON mang theo `deltaVnd`, nen neu mot nha cung cap that su lam tron ve tram dong,
 * dieu do se lo ra thanh mot cot so doc duoc chu khong thanh mot phep kiem im lang.
 */
export const ARITHMETIC_TOLERANCE_VND = 1;

/** Don vi tinh duoc coi la LIT, sau khi bo dau va chu hoa. Danh sach MO. */
const LITRE_UNITS = new Set(['LIT', 'L', 'LITRE', 'LITER', 'LITRES', 'LITERS']);

const SCALE_PRODUCT_DIVISOR = 10 ** LITERS_SCALE * 10 ** LITERS_SCALE;

/**
 * `so lit x don gia` -> DONG, va `null` khi thieu mot ve.
 *
 * Ca hai ve la so nguyen ty le 3, nen tich co ty le 6 va phai chia cho 1e6. Lam trong so NGUYEN
 * cho den buoc cuoi: mot phep nhan hai so thuc o day se de lai sai so o chu so cuoi, va sai so do
 * se lam chinh phep kiem nay bao dong tren nhung hoa don hoan toan dung.
 */
export function expectedAmountVnd(
  litersUnits: number | null,
  unitPriceUnits: number | null,
): number | null {
  if (litersUnits === null || unitPriceUnits === null) return null;
  const product = litersUnits * unitPriceUnits;
  if (!Number.isSafeInteger(product)) return null;
  return product / SCALE_PRODUCT_DIVISOR;
}

/**
 * DON VI TINH -> khoa so sanh.
 *
 * Bo dau tieng Viet (`Lít` -> `LIT`) roi bo moi ky tu khong phai chu cai. `normalizePlate` khong
 * dung duoc o day vi no GIU ca chu so — va `L15` khong phai mot don vi.
 */
const normalizeUnit = (value: string): string =>
  value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

export interface AssessCandidateInput {
  readonly candidate: FuelCandidate;
  /** Chung tu da noi duoc voi mot nha cung cap chua. */
  readonly supplierLinked: boolean;
  /** Bien so DA CHUAN HOA cua doi xe. He thong KHONG tu tao xe tu mot chung tu. */
  readonly fleetPlates: ReadonlySet<string>;
  /** Ngay nghiep vu LUC DOC, de so voi ngay tren hoa don. */
  readonly today: string;
}

/**
 * DOC MOT UNG VIEN VA NOI RA MOI DIEU KHONG ON — theo thu tu ON DINH.
 *
 * Thu tu la thu tu khai bao cua `FUEL_CANDIDATE_FINDINGS`, khong phai thu tu tim thay: hai lan
 * chay tren cung mot ung vien phai cho ra cung mot danh sach, ke ca khi ai do sap xep lai cac khoi
 * `if` ben duoi. Mot danh sach doi thu tu se lam moi anh chup man hinh tro thanh khong on dinh.
 */
export function assessFuelCandidate(input: AssessCandidateInput): FuelCandidateAssessment {
  const { candidate } = input;
  const found = new Map<FuelCandidateFinding, FuelCandidateFindingDetail>();

  const add = (
    finding: FuelCandidateFinding,
    detail?: Readonly<Record<string, number | string>>,
  ): void => {
    if (!found.has(finding)) found.set(finding, detail ? { finding, detail } : { finding });
  };

  if (candidate.litersUnits === null) add('QUANTITY_UNREADABLE');
  if (candidate.unitPriceUnits === null) add('UNIT_PRICE_UNREADABLE');
  if (candidate.amount === null) add('AMOUNT_UNREADABLE');

  const expected = expectedAmountVnd(candidate.litersUnits, candidate.unitPriceUnits);
  if (expected !== null && candidate.amount !== null) {
    const deltaVnd = candidate.amount - expected;
    if (Math.abs(deltaVnd) > ARITHMETIC_TOLERANCE_VND) {
      add('ARITHMETIC_MISMATCH', { expectedVnd: expected, actualVnd: candidate.amount, deltaVnd });
    }
  }

  if (candidate.issuedDate === null) {
    add('ISSUED_DATE_UNREADABLE');
  } else if (businessDateDifferenceInDays(input.today, candidate.issuedDate) > 0) {
    add('ISSUED_DATE_IN_FUTURE', { issuedDate: candidate.issuedDate, today: input.today });
  }

  // `unitRaw === null` KHONG la mot phat hien rieng: mot hoa don khong ghi don vi la chuyen thuong,
  // va phep kiem so hoc o tren da noi du ve tinh nhat quan cua ba con so.
  if (candidate.unitRaw !== null && !LITRE_UNITS.has(normalizeUnit(candidate.unitRaw))) {
    add('UNIT_NOT_LITRES', { unit: candidate.unitRaw });
  }

  if (candidate.stationMatch !== 'RESOLVED') {
    add('STATION_UNRESOLVED', { stationMatch: candidate.stationMatch });
  }
  if (!input.supplierLinked) add('SUPPLIER_UNLINKED');

  if (candidate.plateHintRaw === null) {
    add('PLATE_HINT_ABSENT');
  } else if (!input.fleetPlates.has(normalizePlate(candidate.plateHintRaw))) {
    add('PLATE_HINT_UNKNOWN_VEHICLE', { plateHint: candidate.plateHintRaw });
  }

  const findings = FUEL_CANDIDATE_FINDINGS.map((finding) => found.get(finding)).filter(
    (entry): entry is FuelCandidateFindingDetail => entry !== undefined,
  );
  return { outcome: findings.length === 0 ? 'NO_FINDINGS' : 'HAS_FINDINGS', findings };
}
