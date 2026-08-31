import type { FuelDiscrepancyResolution } from './fuel.types.js';

/**
 * KET QUA KINH TE cua mot ky doi soat — ham THUAN, khong biet Nest, khong biet Prisma.
 *
 * ===========================================================================
 * VI SAO TEP NAY TON TAI (T4R §1 va §2).
 *
 * Truoc T4R, phep cong "tong duoc chap nhan" song trong `FuelReconciliationService` va chay TRUOC
 * giao dich dong ky. Hai lan doc — dem chenh lech con treo, roi cong tien — deu nam ngoai giao
 * dich, nen mot lan chay so khop chen vao giua lam con so di sang T5 khong con la con so cua du
 * lieu da dong.
 *
 * Yeu cau cua ban ra soat la: dem VA cong PHAI nam trong cung giao dich da khoa hang doi soat. Ma
 * giao dich do song o tang kho. Neu don gian buong phep cong xuong kho, thi `INV-07` — luat noi
 * dong nao duoc tinh tien — se nam trong hai ban sao (Prisma va in-memory) va troi khoi nhau ngay
 * lan dau ai do sua mot ben.
 *
 * Nen luat o LAI day, duoi dang mot ham thuan nhan du lieu DA DOC TRONG GIAO DICH. Tang kho doc,
 * goi ham nay, roi ghi — tat ca trong mot giao dich. Luat mot ban, giao dich mot cai.
 */

/** Chi nhung truong ma phep cong thuc su doc — co y NGHEO de khong ai bi cam do mo rong luat o day. */
export interface AcceptableStatementLine {
  readonly id: string;
  readonly amount: number | null;
}

export interface AcceptedMatchRef {
  readonly statementLineId: string;
}

export interface AcceptedDiscrepancyRef {
  readonly statementLineId: string | null;
  readonly resolution: FuelDiscrepancyResolution | null;
}

export interface AcceptedSettlementResult {
  readonly amount: number;
  readonly lineCount: number;
  /**
   * Dung nhung dong nao da lam nen con so tren — DA SAP XEP, de hai lan tinh cho ra cung mot chuoi.
   *
   * Khong phai trang tri: day la thu phan biet "dong lai vi mang chap chon" voi "dong lai sau khi
   * ai do sua so lieu". Hai ky co cung TONG nhung khac BO DONG la hai ket qua kinh te khac nhau —
   * chi so tong khong noi duoc dieu do, va T5 se tra tien theo mot bo dong khong con dung.
   */
  readonly lineIds: readonly string[];
}

/**
 * TONG DUOC CHAP NHAN — con so DUY NHAT di sang T5.
 *
 * Hai nguon, va chi hai:
 *   · dong DA KHOP (may hoac nguoi) — so cua cay xang trung so cua ta trong dung sai;
 *   · dong co chenh lech duoc quyet `ACCEPT_SUPPLIER_AMOUNT` — ta chap nhan so cua ho.
 *
 * MOI THU KHAC BI LOAI, ke ca `IGNORE_WITH_REASON` va `ENTRY_CORRECTION_REQUIRED`. Do la `INV-07`
 * duoc viet thanh mot phep cong: mot dong khong khop KHONG tu vao cong no phai tra.
 */
export function sumAcceptedSettlement(input: {
  readonly lines: readonly AcceptableStatementLine[];
  readonly matches: readonly AcceptedMatchRef[];
  readonly discrepancies: readonly AcceptedDiscrepancyRef[];
}): AcceptedSettlementResult {
  const acceptedLineIds = new Set(input.matches.map((match) => match.statementLineId));
  for (const discrepancy of input.discrepancies) {
    if (discrepancy.resolution !== 'ACCEPT_SUPPLIER_AMOUNT') continue;
    if (discrepancy.statementLineId) acceptedLineIds.add(discrepancy.statementLineId);
  }

  const accepted = input.lines.filter((line) => acceptedLineIds.has(line.id));
  return {
    amount: accepted.reduce((total, line) => total + (line.amount ?? 0), 0),
    lineCount: accepted.length,
    lineIds: accepted.map((line) => line.id).sort(),
  };
}

/**
 * DAU VAN TAY KINH TE cua mot ban giao — T4R §2.
 *
 * ===========================================================================
 * DAY LA CAI PHAN BIET "PHAT LAI" VOI "DA SUA".
 *
 * `TransportFuelSettlementHandoff` truoc T4R la MOT hang duy nhat cho mot ky, unique theo
 * `reconciliationId`. Dong ky lan hai chi tra lai hang cu. Dieu do idempotent DUNG khi ket qua kinh
 * te khong doi — va SAI hoan toan khi no doi:
 *
 * ```text
 * dong lan 1  -> ban giao 10.000.000d
 * mo lai, sua mot dong bang ke
 * dong lan 2  -> van tra ve ban giao 10.000.000d cu
 * ```
 *
 * T5 khong bao gio hoc duoc ve lan sua do, va cay xang duoc tra sai so tien. Nen tu T4R ban giao la
 * mot chuoi BAN SUA DOI chi them (`revision` 1, 2, 3...), va cai quyet dinh "phat lai hay them ban
 * moi" chinh la phep so sanh dau van tay nay voi ban GAN NHAT.
 *
 * Bam vao CA BA thanh phan chu khong chi tong tien: hai ky co cung tong nhung khac bo dong la hai
 * ket qua khac nhau, va T5 tra tien theo BO DONG chu khong theo mot con so.
 */
export function settlementResultFingerprint(input: {
  readonly amount: number;
  readonly lineCount: number;
  readonly lineIds: readonly string[];
}): string {
  return [input.amount, input.lineCount, [...input.lineIds].sort().join(',')].join('|');
}
