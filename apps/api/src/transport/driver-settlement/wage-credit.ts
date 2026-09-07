import { businessDateDifferenceInDays, type BusinessDate } from '../business-date.js';
import { money, MoneyError } from '../money.js';
import type { PayslipKind, PayslipStatus } from '../workforce/workforce.types.js';

/**
 * LUONG DA GHI NHAN — ham THUAN, doc tu chinh phieu luong.
 *
 * ===========================================================================
 * KHONG CO BANG "CREDIT", va do la quyet dinh trung tam cua `TX-07b`.
 *
 * #237 mo ta `monthly payroll credits -> available balance`. Phan xa dau tien la mot bang `credit`
 * ghi mot hang moi khi phieu luong duoc duyet. Bang do se mang MOT BAN SAO cua
 * `TransportPayslip.netAmount`, tuc so tien luong ton tai o HAI cho — va ke tu lan lech dau tien
 * giua hai cho do khong ai con biet ben nao dung. #237 doi dung dieu nguoc lai:
 * *"no double counting between Driver Fund, fuel AP and reimbursement"*.
 *
 * Phieu luong DA LA mot so cai bat bien: trigger `transport_payslip_posted_immutable` dong bang moi
 * con so tu luc phieu roi `DRAFT`. Nen "khoan luong da ghi nhan" khong can mot ban ghi thu hai —
 * no can mot PHEP DOC co ten, va day la phep doc do.
 */

/** Mot phieu luong da chot, kem ky sinh ra no. CO Y NGHEO: khong mang mot dong thanh phan nao. */
export interface PostedPayslipFact {
  readonly payslipId: string;
  readonly periodId: string;
  readonly periodLabel: string;
  readonly periodStartDate: BusinessDate;
  readonly periodEndDate: BusinessDate;
  readonly runId: string;
  readonly kind: PayslipKind;
  readonly status: PayslipStatus;
  /** CO DAU. Am o phieu `REVERSAL` — xem `foldWageMonths`. */
  readonly netAmount: number;
  readonly currencyCode: string;
}

/**
 * Phieu nay co mang mot khoan luong da ghi nhan khong.
 *
 * ---------------------------------------------------------------------------
 * `REVERSED` TRA VE `true`, VA DO LA CHO DE SAI NHAT TRONG CA TEP.
 *
 * `WorkforceService.issueCorrection('REVERSAL')` lam HAI viec trong mot giao dich: dua ban goc
 * sang `REVERSED`, VA phat mot phieu `REVERSAL` moi mang net doi dau (`reversalOf()` dao
 * `EARNING` <-> `DEDUCTION`). Hai hang do la MOT phep dao.
 *
 * Neu phep doc nay loai `REVERSED` ra thi ban goc bien mat trong khi ban dao van duoc cong — va
 * mot lai xe da duoc ghi nhan 10.000.000 bong nhien mang so am 10.000.000. Giu ca hai thi tong ve
 * dung 0, la dieu duy nhat dung.
 *
 * `DRAFT` la duong cat DUY NHAT: mot phieu chua duyet la mot con so con doi duoc, va `#168 B8` da
 * chot rang no khong duoc cong bo cho lai xe. Cung duong cat ma `isPosted()` cua `TX-07` dung.
 */
export const bearsWageCredit = (status: PayslipStatus): boolean => status !== 'DRAFT';

/** MOT THANG luong cua mot lai xe — nguon goc ky, so da ghi nhan, so da rut, so con lai. */
export interface WageMonth {
  readonly periodId: string;
  readonly periodLabel: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  /** Tong net cua moi phieu da chot thuoc ky nay. Co the AM sau mot lan dao. */
  readonly credited: number;
  /** Tong phan bo `WAGE` da tro toi cac phieu cua ky nay. */
  readonly cashedOut: number;
  readonly remaining: number;
  /**
   * Nguon goc, TUNG PHIEU MOT — khong phai mot danh sach ma phieu tran.
   *
   * Mot ky co the co nhieu phieu (ban goc + phieu bo sung + phieu dao), va MOT LAN CHI phai tro
   * toi dung phieu no rut ra. Neu o day chi co ma phieu thi giao dien muon chi mot thang se phai
   * TU CHIA so con lai cho cac phieu — tuc tu tinh mot khoan tien, dung dieu ca hai tang khung
   * nhin deu cam.
   */
  readonly payslips: readonly WageMonthPayslip[];
}

/** MOT PHIEU trong mot ky, kem phan da rut va phan con lai cua chinh no. */
export interface WageMonthPayslip {
  readonly payslipId: string;
  readonly netAmount: number;
  readonly cashedOut: number;
  readonly remaining: number;
}

const add = (left: number, right: number): number => {
  try {
    return money(money(left).amount + money(right).amount).amount;
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new MoneyError(
        `Cong don luong da ghi nhan vuot khoang bieu dien duoc: ${error.message}`,
      );
    }
    throw error;
  }
};

/**
 * GOM PHIEU THEO KY, xep ky CU truoc.
 *
 * Thu tu khong phai trang tri: ke toan doc bang nay tu thang cu nhat, va do cung la thu tu tu
 * nhien de rut tien. Xep theo `createdAt` se lam mot phieu bo sung phat muon nhay len dau bang.
 *
 * `cashedOutByPayslip` la tong CO DAU cac dong phan bo tro toi tung phieu — mot phieu chi da bi
 * dao dong gop cac dong am, nen phep tru o day khong phai loc gi ca.
 */
export function foldWageMonths(
  facts: readonly PostedPayslipFact[],
  cashedOutByPayslip: ReadonlyMap<string, number>,
): readonly WageMonth[] {
  const byPeriod = new Map<string, WageMonth>();

  for (const fact of facts) {
    if (!bearsWageCredit(fact.status)) continue;

    const current = byPeriod.get(fact.periodId) ?? {
      periodId: fact.periodId,
      periodLabel: fact.periodLabel,
      startDate: fact.periodStartDate,
      endDate: fact.periodEndDate,
      credited: 0,
      cashedOut: 0,
      remaining: 0,
      payslips: [] as readonly WageMonthPayslip[],
    };

    const payslipCashedOut = cashedOutByPayslip.get(fact.payslipId) ?? 0;
    const credited = add(current.credited, fact.netAmount);
    const cashedOut = add(current.cashedOut, payslipCashedOut);
    byPeriod.set(fact.periodId, {
      ...current,
      credited,
      cashedOut,
      remaining: add(credited, -cashedOut),
      payslips: [
        ...current.payslips,
        {
          payslipId: fact.payslipId,
          netAmount: fact.netAmount,
          cashedOut: payslipCashedOut,
          remaining: add(fact.netAmount, -payslipCashedOut),
        },
      ],
    });
  }

  return [...byPeriod.values()].sort((left, right) =>
    left.startDate.localeCompare(right.startDate),
  );
}

/**
 * CUA SO QUYET TOAN mac dinh — 30 ngay.
 *
 * ---------------------------------------------------------------------------
 * NGUON: Bo luat Lao dong 2019, Dieu 97 khoan 4 — bat kha khang thi duoc cham TOI DA 30 ngay, va
 * cham tu 15 ngay tro len thi phai tra them tien lai. R0 (`transport-domain-v2.md` `F-08`) doc
 * dung dieu do va yeu cau R5 phat mot CANH BAO CO MA thay vi mot cot im lang.
 *
 * VA DAY KHONG PHAI MOT LOI BUOC TOI. Chu so huu da noi ro (#237): cong ty KHONG co tinh giu
 * luong; lai xe co the TU CHON de tien tich luy roi rut mot lan lon. Nen con so nay tra loi dung
 * mot cau — *"thang nay da qua cua so ma tien van chua ra khoi cong ty"* — va de nguoi doc quyet
 * dinh do la lua chon cua lai xe hay mot viec cong ty phai lam.
 *
 * Vi vay: khong chan gi, khong sinh mot khoan phai tra nao, khong doi trang thai phieu nao.
 */
export const WAGE_SETTLEMENT_WINDOW_DAYS = 30;

export interface UnsettledWageMonth {
  readonly periodId: string;
  readonly periodLabel: string;
  readonly endDate: BusinessDate;
  readonly remaining: number;
  /** So ngay ke tu ngay cuoi ky den `today`. */
  readonly ageDays: number;
}

/**
 * Cac ky CON DU va da qua cua so, tinh tu NGAY CUOI KY.
 *
 * Moc la ngay cuoi ky chu khong phai ngay duyet phieu: Dieu 97 k.1 dat han theo KY tra luong ma
 * hai ben da thoa thuan, khong theo luc bo phan luong bam nut. Lay moc theo `approvedAt` se lam
 * mot lan chay luong muon tu no keo dai han cua chinh no.
 */
export function unsettledBeyondWindow(
  months: readonly WageMonth[],
  today: BusinessDate,
  windowDays: number,
): readonly UnsettledWageMonth[] {
  return months
    .filter((month) => month.remaining > 0)
    .map((month) => ({
      periodId: month.periodId,
      periodLabel: month.periodLabel,
      endDate: month.endDate,
      remaining: month.remaining,
      ageDays: businessDateDifferenceInDays(month.endDate, today),
    }))
    .filter((month) => month.ageDays > windowDays);
}
