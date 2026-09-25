import { ApiError } from '../../api/errors';
import { formatBasisPoints, formatVnd } from '../../format';
import { formatCount } from './control-tower';
import type { DirectMarginRollup, FinanceSummaryView, SettlementFlow } from './types';

/**
 * TIEN tren dien thoai — HAM THUAN.
 *
 * SAU DONG, VA KHONG MOT TONG NAO (`INV-23`, #87). Cong no khach, no cay xang, no nha xe, hoa hong
 * doi tac, tien cong ty con no lai xe va luong chua rut la sau cau hoi voi sau doi tuong khac nhau.
 * Tep nay KHONG co mot phep cong tien nao — va do la tinh chat quan trong nhat cua no.
 *
 * BIEN TRUC TIEP KHONG PHAI LAI RONG: `disclosure` cua may chu di CUNG con so, nguyen van.
 */

export type MoneyDirection = 'RECEIVABLE' | 'PAYABLE';

export interface MoneyRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly direction: MoneyDirection;
}

const FLOW_LABEL: Readonly<Record<SettlementFlow, string>> = {
  CUSTOMER_FREIGHT: 'Khách hàng còn nợ',
  FUEL_SUPPLIER: 'Còn nợ cây xăng',
  CARRIER_SERVICE: 'Còn nợ nhà xe',
  PARTNER_COMMISSION: 'Hoa hồng phải trả đối tác',
};

const FLOW_ORDER: readonly SettlementFlow[] = [
  'CUSTOMER_FREIGHT',
  'FUEL_SUPPLIER',
  'CARRIER_SERVICE',
  'PARTNER_COMMISSION',
];

export const DIRECTION_LABEL: Readonly<Record<MoneyDirection, string>> = {
  RECEIVABLE: 'Phải thu',
  PAYABLE: 'Phải trả',
};

/** Sau dong theo thu tu on dinh — MOI dong mot con so cua may chu, khong dong nao la tong. */
export function moneyRows(view: FinanceSummaryView): readonly MoneyRow[] {
  const flows = FLOW_ORDER.map((flow): MoneyRow => ({
    key: flow,
    label: FLOW_LABEL[flow],
    value: formatVnd(view.buckets.flows[flow]),
    direction: flow === 'CUSTOMER_FREIGHT' ? 'RECEIVABLE' : 'PAYABLE',
  }));
  return [
    ...flows,
    {
      key: 'driver-reimbursement',
      label: 'Công ty còn nợ lái xe (hoàn ứng)',
      value: formatVnd(view.buckets.driverReimbursementOutstanding),
      direction: 'PAYABLE',
    },
    {
      key: 'driver-wage-remaining',
      label: 'Lương đã ghi nhận, lái xe chưa rút',
      value: formatVnd(view.buckets.driverSettlementRemaining),
      direction: 'PAYABLE',
    },
  ];
}

export interface MarginView {
  readonly title: string;
  readonly margin: string;
  readonly ratio: string;
  readonly revenue: string;
  readonly deduction: string;
  /** NGUYEN VAN may chu. */
  readonly disclosure: string;
  readonly coverage: string;
  readonly isNegative: boolean;
}

/** Cau CO SO — noi du hai nguon (chuyen cu + don theo vong xe) khi may chu gui `basis`. */
export function coverageSentence(margin: DirectMarginRollup): string {
  const basis = margin.basis;
  if (basis) {
    const base = `Tính trên ${formatCount(basis.legacyTrips.counted)} chuyến cũ và ${formatCount(basis.runFirstOrders.counted)} đơn theo vòng xe.`;
    return basis.legacyTrips.skipped === 0
      ? base
      : `${base} ${formatCount(basis.legacyTrips.skipped)} chuyến cũ chưa có giá cước nên không được tính.`;
  }
  const base = `Tính trên ${formatCount(margin.tripCount)} chuyến.`;
  return margin.skippedTripCount === 0
    ? base
    : `${base} ${formatCount(margin.skippedTripCount)} chuyến chưa có giá cước nên không được tính.`;
}

export function marginView(margin: DirectMarginRollup): MarginView {
  return {
    title: 'Biên trực tiếp',
    margin: formatVnd(margin.marginAmount),
    ratio: formatBasisPoints(margin.marginBasisPoints),
    revenue: formatVnd(margin.revenueAmount),
    deduction: formatVnd(margin.deductionAmount),
    disclosure: margin.disclosure,
    coverage: coverageSentence(margin),
    isNegative: margin.marginAmount < 0,
  };
}

/** `null` khi chi mot ma tien. Nhieu ma -> canh bao: cac con so khong doc thang duoc. */
export function currencyWarning(view: Pick<FinanceSummaryView, 'currency'>): string | null {
  if (view.currency.isSingle) return null;
  return `Dữ liệu đang có ${formatCount(view.currency.codes.length)} mã tiền (${view.currency.codes.join(', ')}) — các con số bên dưới không đọc thẳng được.`;
}

const FINANCE_SOURCE_LABEL: Readonly<Record<string, string>> = {
  DRIVER_SETTLEMENT: 'Quyết toán lái xe',
};

export function financeSourceNotes(sources: readonly string[]): readonly string[] {
  return sources.map(
    (source) =>
      `${FINANCE_SOURCE_LABEL[source] ?? source}: doanh nghiệp chưa bật nghiệp vụ này, nên bảng thiếu mục đó.`,
  );
}

/**
 * Loi doc tien IM LANG: nang luc tat (404 khong `reason`) hoac vai khong co quyen doc bao cao. Man
 * hinh noi mot cau nho thay vi mot khoi loi do — giam doc van dung duoc phan con lai.
 */
export function isQuietReadFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'NOT_MOUNTED' || error.kind === 'FORBIDDEN');
}
