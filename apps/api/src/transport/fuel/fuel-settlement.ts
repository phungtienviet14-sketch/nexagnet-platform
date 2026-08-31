/**
 * TONG DUOC CHAP NHAN cua mot ky doi soat — mot ham THUAN, khong biet Nest, khong biet Prisma.
 *
 * ===========================================================================
 * VI SAO PHEP CONG NAY BI KEO RA KHOI SERVICE (Issue #103 §1).
 *
 * Truoc day service doc `lines`/`matches`/`discrepancies` bang ba lenh rieng, cong lai, roi dua con
 * so vao `closeReconciliation`. Ba lan doc do nam NGOAI giao dich dong ky, nen mot lan chay so khop
 * xen giua chung lam con so ban giao cho T5 khong ung voi bat ky trang thai nao TUNG TON TAI —
 * khong phai trang thai truoc, cung khong phai trang thai sau.
 *
 * Cach chua la doc ca ba TRONG giao dich da khoa hang doi soat. Nhung phep DOC thi thuoc tang kho,
 * con LUAT "dong nao duoc tinh" thi thuoc tang mien. Nen luat o lai day, duoi dang mot ham thuan ma
 * ca hai hien thuc kho cung goi — va no van do duoc bang mot bai test khong can CSDL.
 *
 * ===========================================================================
 * HAI NGUON, VA CHI HAI (`INV-07`):
 *
 *   · dong DA KHOP (may hoac nguoi) — so cua cay xang trung so cua ta trong dung sai;
 *   · dong co chenh lech duoc quyet `ACCEPT_SUPPLIER_AMOUNT` — ta chap nhan so cua ho.
 *
 * MOI THU KHAC BI LOAI, ke ca `IGNORE_WITH_REASON` va `ENTRY_CORRECTION_REQUIRED`. Do la `INV-07`
 * duoc viet thanh mot phep cong: mot dong khong khop KHONG tu vao cong no phai tra.
 */

/** Chi nhung truong phep cong THAT SU doc — khong phai ca ban ghi. */
export interface SettlementLineFact {
  readonly id: string;
  readonly amount: number | null;
}

export interface SettlementMatchFact {
  readonly statementLineId: string;
}

export interface SettlementDiscrepancyFact {
  readonly statementLineId: string | null;
  readonly resolution: string | null;
}

export interface SettlementFacts {
  readonly lines: readonly SettlementLineFact[];
  readonly matches: readonly SettlementMatchFact[];
  readonly discrepancies: readonly SettlementDiscrepancyFact[];
}

export interface SettlementTotals {
  readonly amount: number;
  readonly lineCount: number;
}

/** QUYET DINH DUY NHAT cho tien di tiep sang T5 — `INV-07`/`INV-27`. */
export const ACCEPTED_SUPPLIER_RESOLUTION = 'ACCEPT_SUPPLIER_AMOUNT';

export function sumAcceptedSettlement(facts: SettlementFacts): SettlementTotals {
  const acceptedLineIds = new Set(facts.matches.map((match) => match.statementLineId));
  for (const discrepancy of facts.discrepancies) {
    if (discrepancy.resolution !== ACCEPTED_SUPPLIER_RESOLUTION) continue;
    if (discrepancy.statementLineId) acceptedLineIds.add(discrepancy.statementLineId);
  }

  const accepted = facts.lines.filter((line) => acceptedLineIds.has(line.id));
  return {
    amount: accepted.reduce((total, line) => total + (line.amount ?? 0), 0),
    lineCount: accepted.length,
  };
}

/**
 * HAI BAN GIAO CO CUNG MOT KET QUA KINH TE KHONG?
 *
 * Chi hai con so nay quyet dinh, va do la co y: `emittedAt`/`emittedBy` khac nhau o MOI lan dong,
 * nen dua chung vao phep so sanh se lam moi lan dong lai de ra mot `revision` moi — tuc bien tinh
 * idempotent thanh mot bo dem so lan bam nut.
 */
export const sameSettlementResult = (left: SettlementTotals, right: SettlementTotals): boolean =>
  left.amount === right.amount && left.lineCount === right.lineCount;
