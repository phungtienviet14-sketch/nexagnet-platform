import type { TripKind } from '../trips/trip-lifecycle.js';

/**
 * BIEN TRUC TIEP cua mot chuyen — ham THUAN.
 *
 * ===========================================================================
 * `GD-13`: PHAN BO CHI PHI CO DINH TAT. Con so o day la BIEN TRUC TIEP, khong phai loi nhuan.
 *
 * Khac biet do khong phai chuyen chu nghia. Mot chuyen co bien truc tiep duong van co the lam cong
 * ty lo sau khi ganh luong van phong, khau hao xe va lai vay. Neu giao dien goi con so nay la "loi
 * nhuan", nguoi dieu hanh se nhan gia nhung chuyen "co lai" ma thuc te dang an vao chi phi co dinh
 * — va ho se lam dieu do mot cach tu tin, vi man hinh vua noi voi ho nhu vay.
 *
 * Nen ham nay tra ve mot NHAN di kem con so (`fixedCostsIncluded: false` + `disclosure`), va tang
 * hien thi khong duoc phep bo nhan do. Do la ca noi dung cua `GD-13`: khong phai "dung tinh chi
 * phi co dinh", ma la "noi ro rang minh chua tinh".
 *
 * ===========================================================================
 * HAI CONG THUC, THEO LOAI CHUYEN — va chung KHONG duoc gop.
 *
 *   · Chuyen thue xe ngoai (`EXTERNAL_CARRIER`):
 *         bien = doanh thu khach (X) - cong no nha xe (Y)
 *     KHONG co chi phi dau, khong co quy lai xe. `INV-04` da cam ghi chung o `TX-03`, nen neu
 *     chung xuat hien o day thi du lieu da hong tu truoc — ham nay khong tu "sua" bang cach cong
 *     chung vao, no BAO ra qua `unexpectedInternalCost`.
 *
 *   · Chuyen xe nha (`OWN_DIRECT`, `PARTNER_REFERRED_INTERNAL_RUN`):
 *         bien = doanh thu khach - chi phi truc tiep (`TX-03`) - hoa hong doi tac
 *     Hoa hong CHI co o chuyen doi tac mang don, va no la mot khoan phai tra that nen no tru vao
 *     bien. Bo no ra se lam mot chuyen mang don trong hap dan hon chuyen tu kiem khach — dung
 *     nguoc voi thuc te.
 */

export interface DirectMarginInput {
  readonly tripId: string;
  readonly tripKind: TripKind;
  /** Gia cuoc thu khach. `null` = CHUA NHAP — khac han `0`. */
  readonly revenueAmount: number | null;
  /** Cong don `TX-03` cua chuyen. Chuyen thue xe ngoai dang le bang 0. */
  readonly directCostAmount: number;
  /** Cong no nha xe cua chuyen thue ngoai. `0` o chuyen xe nha. */
  readonly carrierPayableAmount: number;
  /** Hoa hong doi tac mang don. `0` o chuyen khac. */
  readonly commissionAmount: number;
  readonly currencyCode: string;
}

export interface DirectMargin {
  readonly tripId: string;
  readonly tripKind: TripKind;
  readonly revenueAmount: number | null;
  readonly directCostAmount: number;
  readonly carrierPayableAmount: number;
  readonly commissionAmount: number;
  /** Tong moi khoan tru khoi doanh thu. */
  readonly deductionAmount: number;
  /** `null` khi chua co gia cuoc — xem `isComputable`. */
  readonly marginAmount: number | null;
  /**
   * Ty suat theo DIEM CO BAN (1% = 100), so nguyen. `null` khi khong tinh duoc hoac doanh thu = 0.
   *
   * Diem co ban chu khong phai so thuc, cung ly le voi ty le hoa hong: mot con so hien ra man hinh
   * van co the bi cong don o mot bao cao khac, va sai so thuc se tich luy o do.
   */
  readonly marginBasisPoints: number | null;
  readonly currencyCode: string;
  /** `GD-13` — LUON `false` o ban nay. Mot hang so co ten, de giao dien khong phai tu doan. */
  readonly fixedCostsIncluded: false;
  /** Cau phai hien canh con so. Tang hien thi khong duoc bo. */
  readonly disclosure: string;
  /**
   * Chuyen thue xe ngoai lai co chi phi van hanh noi bo — mot MAU THUAN DU LIEU, khong phai mot
   * con so. Bao ra thay vi im lang cong vao: `INV-04` noi dieu nay khong duoc phep ton tai, nen
   * neu no ton tai thi cau tra loi dung la "co gi do sai", khong phai mot bien nho hon.
   */
  readonly unexpectedInternalCost: boolean;
}

export const DIRECT_MARGIN_DISCLOSURE = 'Chưa gồm chi phí cố định';

/**
 * Chuyen nay co du du lieu de tinh bien khong.
 *
 * Tach thanh mot ham co ten vi cau hoi nay quay lai o ca bao cao lan giao dien, va hai noi tu suy
 * ra dieu kien se lech nhau ngay lan dau ai do doi quy uoc `revenueAmount = null`.
 */
export const isComputable = (input: Pick<DirectMarginInput, 'revenueAmount'>): boolean =>
  input.revenueAmount !== null;

export function computeDirectMargin(input: DirectMarginInput): DirectMargin {
  const outsourced = input.tripKind === 'EXTERNAL_CARRIER';

  /**
   * Chuyen thue ngoai KHONG tru chi phi van hanh noi bo — khong phai vi no bang 0, ma vi no khong
   * duoc phep ton tai. Neu no khac 0 thi day la du lieu hong va co `unexpectedInternalCost` keo len.
   */
  const deductionAmount = outsourced
    ? input.carrierPayableAmount
    : input.directCostAmount + input.commissionAmount;

  const marginAmount = input.revenueAmount === null ? null : input.revenueAmount - deductionAmount;

  const marginBasisPoints =
    marginAmount === null || input.revenueAmount === null || input.revenueAmount === 0
      ? null
      : Math.round((marginAmount * 10000) / input.revenueAmount);

  return {
    tripId: input.tripId,
    tripKind: input.tripKind,
    revenueAmount: input.revenueAmount,
    directCostAmount: input.directCostAmount,
    carrierPayableAmount: input.carrierPayableAmount,
    commissionAmount: input.commissionAmount,
    deductionAmount,
    marginAmount,
    marginBasisPoints,
    currencyCode: input.currencyCode,
    fixedCostsIncluded: false,
    disclosure: DIRECT_MARGIN_DISCLOSURE,
    unexpectedInternalCost: outsourced && input.directCostAmount !== 0,
  };
}

/**
 * CONG DON bien truc tiep theo mot chieu bat ky (xe, tuyen, thang).
 *
 * BO QUA chuyen chua co gia cuoc thay vi coi chung la 0. Coi la 0 se keo bien trung binh xuong
 * bang du lieu CHUA NHAP, va con so do doc len y het mot thang kinh doanh kem. `tripCount` va
 * `skippedTripCount` di kem de nguoi doc biet minh dang nhin bao nhieu phan cua thuc te.
 */
export interface DirectMarginRollup {
  readonly revenueAmount: number;
  readonly deductionAmount: number;
  readonly marginAmount: number;
  readonly marginBasisPoints: number | null;
  readonly tripCount: number;
  readonly skippedTripCount: number;
  readonly fixedCostsIncluded: false;
  readonly disclosure: string;
}

export function rollupDirectMargin(margins: readonly DirectMargin[]): DirectMarginRollup {
  const counted = margins.filter((margin) => margin.marginAmount !== null);

  const revenueAmount = counted.reduce((total, margin) => total + (margin.revenueAmount ?? 0), 0);
  const deductionAmount = counted.reduce((total, margin) => total + margin.deductionAmount, 0);
  const marginAmount = revenueAmount - deductionAmount;

  return {
    revenueAmount,
    deductionAmount,
    marginAmount,
    marginBasisPoints:
      revenueAmount === 0 ? null : Math.round((marginAmount * 10000) / revenueAmount),
    tripCount: counted.length,
    skippedTripCount: margins.length - counted.length,
    fixedCostsIncluded: false,
    disclosure: DIRECT_MARGIN_DISCLOSURE,
  };
}
