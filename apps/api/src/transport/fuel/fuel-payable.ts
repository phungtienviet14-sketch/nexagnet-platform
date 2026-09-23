import type { FuelDiscrepancyKind } from './fuel-matching.js';
import type { FuelDiscrepancyResolution, FuelPaymentMethod } from './fuel.types.js';

/**
 * CONG NO CAY XANG CHI DEN TU LAN DO GHI NO — `#371`, ham THUAN, khong biet Nest/Prisma.
 *
 * ===========================================================================
 * VI SAO TEP NAY TON TAI: mot lan do dau, HAI lan tra tien.
 *
 * `DRIVER_CASH` nghia la lai xe DA TRA cay xang bang tien cua minh — `TX-03` (phieu chuyen v1) hoac
 * `RUN_EXPENSE` (`#369` R-4, phieu Run-first) da ghi lan tra do vao Quy lai xe. Truoc `#371`, bo so
 * khop bang ke khong biet `paymentMethod`, nen:
 *
 * ```text
 * phieu DRIVER_CASH  -> Quy lai xe tru tien (lai xe duoc hoan)
 * cay xang ghi no chinh lan do vao bang ke -> dong bang ke KHOP phieu do
 * dong ky           -> ban giao cong no -> T5 tra cay xang
 * ```
 *
 * Cung mot lan do dau, cong ty tra hai lan. Hai so van "tach biet ve cau truc" — cai thieu la mot
 * CONG NGHIEP VU, va cong do la tep nay.
 *
 * ===========================================================================
 * MOT LUAT, BA CHO GOI — cung ly le voi `fuel-settlement.ts`:
 *
 *   · `fuel-matching.ts`       — may KHONG de nghi cap khop nao toi mot phieu khong ghi no;
 *   · tang kho (`resolveDiscrepancy`, `closeReconciliation`) — doc lai DUOI KHOA roi moi ghi;
 *   · `fuel-reconciliation.service.ts` — tra ve ly do CO TEN truoc khi cham toi giao dich.
 *
 * Trigger `TransportFuelMatch_payable_entry_only` (migration
 * `20260923120000_transport_fuel_match_payable_entry_only`) la luoi cuoi o tang CSDL.
 */

/**
 * CACH TRA DUY NHAT sinh cong no voi cay xang.
 *
 * Kiem DUONG (`=== SUPPLIER_ACCOUNT`), khong kiem am (`!== DRIVER_CASH`): mot cach tra thu ba them vao
 * sau nay (the nhien lieu cong ty, vi du) phai DUOC ai do quyet la cong no — mac dinh no KHONG la.
 */
export const SUPPLIER_PAYABLE_PAYMENT_METHOD = 'SUPPLIER_ACCOUNT' satisfies FuelPaymentMethod;

export const isSupplierPayable = (paymentMethod: FuelPaymentMethod): boolean =>
  paymentMethod === SUPPLIER_PAYABLE_PAYMENT_METHOD;

/**
 * MOT DONG BANG KE ma bo so khop da noi la "lan do lai xe tra tien mat" KHONG duoc thanh cong no
 * bang duong `ACCEPT_SUPPLIER_AMOUNT`.
 *
 * Chan cap khop ma de ngo duong nay thi tien van di: nguoi soat bam "chap nhan so cay xang" tren
 * chinh dong do, `sumAcceptedSettlement` cong no vao ban giao, va lan do dau van duoc tra hai lan.
 * Ba duong con lai deu dung nghiep vu that:
 *
 * ```text
 * cay xang ghi no nham mot lan khach tra tien mat -> REJECT_SUPPLIER_LINE / IGNORE_WITH_REASON
 * lai xe khai sai cach tra (thuc ra da ky no)     -> ENTRY_CORRECTION_REQUIRED (dao Quy, sua phieu, chay lai)
 * ```
 *
 * `MATCH_CONFIRMED` khong nam o day: no doi mot PHIEU cu the, va cong kiem cua no la cach tra cua
 * chinh phieu do (`isSupplierPayable`) — mot phieu ghi no dung ma may bo sot van xac nhan duoc.
 */
export const isCashPaidLineAcceptance = (
  kind: FuelDiscrepancyKind,
  resolution: FuelDiscrepancyResolution,
): boolean => kind === 'PAYMENT_METHOD_CONFLICT' && resolution === 'ACCEPT_SUPPLIER_AMOUNT';

export interface MatchPayableFact {
  readonly id: string;
  readonly statementLineId: string;
  readonly fuelEntryId: string;
}

export interface CashPaidMatch {
  readonly matchId: string;
  readonly statementLineId: string;
  readonly fuelEntryId: string;
  /** `null` = phieu khong doc duoc — van tinh la KHONG ghi no (dong chat). */
  readonly paymentMethod: FuelPaymentMethod | null;
}

/**
 * LUOI CUOI TRUOC BAN GIAO: nhung cap khop tro toi mot phieu KHONG ghi no.
 *
 * Tang kho goi ham nay DUOI KHOA hang doi soat, tren du lieu vua doc, TRUOC moi lan ghi cua lenh dong
 * ky. Ket qua khac rong thi KHONG dong — khong loc bo cap do roi coi ky la sach: mot cap nhu vay la
 * du lieu HONG (ghi truoc `#371`, hoac mot duong ghi khong qua tang mien), va chi nguoi moi biet nen
 * chay lai so khop hay sua du lieu.
 *
 * Phieu vang mat trong `paymentMethodByEntry` cung la mot cap hong: dong chat, khong doan.
 */
export function cashPaidMatches(
  matches: readonly MatchPayableFact[],
  paymentMethodByEntry: ReadonlyMap<string, FuelPaymentMethod>,
): readonly CashPaidMatch[] {
  return matches
    .map((match) => ({ match, paymentMethod: paymentMethodByEntry.get(match.fuelEntryId) ?? null }))
    .filter(({ paymentMethod }) => paymentMethod === null || !isSupplierPayable(paymentMethod))
    .map(({ match, paymentMethod }) => ({
      matchId: match.id,
      statementLineId: match.statementLineId,
      fuelEntryId: match.fuelEntryId,
      paymentMethod,
    }))
    .sort((left, right) =>
      left.matchId < right.matchId ? -1 : left.matchId > right.matchId ? 1 : 0,
    );
}
