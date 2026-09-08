import { formatBasisPoints, formatBusinessDate, formatCount, formatMoney } from '../customer-view';
import type { TransportSectionId } from '../navigation';
import type { FinanceSource, FinanceSummaryView, SettlementFlow } from '../transport-types';

/**
 * BANG TAI CHINH — tang doc cua man hinh, HAM THUAN.
 *
 * ===========================================================================
 * SAU DONG, VA KHONG MOT TONG NAO.
 *
 * `INV-23` + Issue #87: cong no khach, cong no cay xang, cong no nha xe, hoa hong doi tac, tien
 * phai tra lai xe va luong da ghi nhan chua rut la SAU cau hoi khac nhau voi SAU doi tuong khac
 * nhau. Tep nay khong co mot phep cong nao giua chung — va do la tinh chat quan trong nhat cua no.
 *
 * Mot con so "tong cong no" doc len rat co nghia, va chinh vi the no se di vao mot bao cao roi
 * khong ai go ra duoc nua.
 *
 * ===========================================================================
 * BIEN TRUC TIEP KHONG PHAI LAI RONG.
 *
 * `disclosure` cua may chu di CUNG con so len man hinh, khong phai mot chu thich nho o cuoi trang.
 * #244 G5 cam goi day la mot khoan lai da tru het chi phi, chung nao chua co mo hinh chi phi co
 * dinh day du.
 */

const FLOW_LABEL: Readonly<Record<SettlementFlow, string>> = {
  CUSTOMER_FREIGHT: 'Khách hàng còn nợ',
  FUEL_SUPPLIER: 'Còn nợ cây xăng',
  CARRIER_SERVICE: 'Còn nợ nhà xe',
  PARTNER_COMMISSION: 'Hoa hồng phải trả đối tác',
};

/**
 * CHIEU cua tung dong — mot dong PHAI THU va mot dong PHAI TRA khong bao gio duoc doc chung mot
 * kieu. Nham chieu se lam mot khoan khach no doc thanh mot khoan cong ty no.
 */
const FLOW_DIRECTION: Readonly<Record<SettlementFlow, 'RECEIVABLE' | 'PAYABLE'>> = {
  CUSTOMER_FREIGHT: 'RECEIVABLE',
  FUEL_SUPPLIER: 'PAYABLE',
  CARRIER_SERVICE: 'PAYABLE',
  PARTNER_COMMISSION: 'PAYABLE',
};

const FLOW_ORDER: readonly SettlementFlow[] = [
  'CUSTOMER_FREIGHT',
  'FUEL_SUPPLIER',
  'CARRIER_SERVICE',
  'PARTNER_COMMISSION',
];

export interface FinanceMoneyRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly direction: 'RECEIVABLE' | 'PAYABLE';
  readonly section: TransportSectionId | null;
}

export interface FinanceMarginModel {
  readonly revenue: string;
  readonly deduction: string;
  readonly margin: string;
  readonly ratio: string;
  /** Cau cong bo cua may chu. KHONG duoc bo di, va KHONG duoc thay bang chu cua man hinh. */
  readonly disclosure: string;
  readonly coverage: string;
}

export interface FinanceModel {
  readonly generatedFor: string;
  /** SAU dong, giu rieng, theo thu tu on dinh. */
  readonly rows: readonly FinanceMoneyRow[];
  readonly receivableOverdue: string;
  readonly margin: FinanceMarginModel;
  /** `null` khi du lieu chi co mot ma tien. Mot cau canh bao khi co nhieu hon mot. */
  readonly currencyWarning: string | null;
  readonly disabledSourceNotes: readonly string[];
}

const SOURCE_LABEL: Readonly<Record<FinanceSource, string>> = {
  DRIVER_SETTLEMENT: 'Quyết toán lái xe',
};

export function toFinance(view: FinanceSummaryView): FinanceModel {
  const flowRows = FLOW_ORDER.map((flow): FinanceMoneyRow => ({
    key: flow,
    label: FLOW_LABEL[flow],
    value: formatMoney(view.buckets.flows[flow]),
    direction: FLOW_DIRECTION[flow],
    section: flow === 'CUSTOMER_FREIGHT' ? 'ar-ap' : 'settlement',
  }));

  /*
   * HAI DONG CUOI PHAI TACH. `SettlementBuckets` giu chung o hai truong rieng chinh vi ly do nay,
   * va man hinh phai giu tiep — gop lai la lam mat dung cai `TX-07b` sinh ra de tranh.
   */
  const driverRows: readonly FinanceMoneyRow[] = [
    {
      key: 'driver-reimbursement',
      label: 'Công ty còn nợ lái xe (hoàn ứng)',
      value: formatMoney(view.buckets.driverReimbursementOutstanding),
      direction: 'PAYABLE',
      section: 'driver-fund',
    },
    {
      key: 'driver-wage-remaining',
      label: 'Lương đã ghi nhận, lái xe chưa rút',
      value: formatMoney(view.buckets.driverSettlementRemaining),
      direction: 'PAYABLE',
      section: 'driver-settlement',
    },
  ];

  return {
    generatedFor: formatBusinessDate(view.generatedFor),
    rows: [...flowRows, ...driverRows],
    receivableOverdue: formatMoney(view.receivable.overdueTotal),
    margin: {
      revenue: formatMoney(view.directMargin.revenueAmount),
      deduction: formatMoney(view.directMargin.deductionAmount),
      margin: formatMoney(view.directMargin.marginAmount),
      ratio: formatBasisPoints(view.directMargin.marginBasisPoints),
      disclosure: view.directMargin.disclosure,
      coverage:
        view.directMargin.skippedTripCount === 0
          ? `Tính trên ${formatCount(view.directMargin.tripCount)} chuyến.`
          : `Tính trên ${formatCount(view.directMargin.tripCount)} chuyến; ` +
            `${formatCount(view.directMargin.skippedTripCount)} chuyến chưa có giá cước nên không được tính.`,
    },
    currencyWarning: view.currency.isSingle
      ? null
      : `Dữ liệu đang có ${formatCount(view.currency.codes.length)} mã tiền ` +
        `(${view.currency.codes.join(', ')}) — các tổng bên dưới không cộng thẳng được.`,
    disabledSourceNotes: view.unavailableSources.map(
      (source) => `${SOURCE_LABEL[source]}: khách chưa bật nghiệp vụ này, nên bảng thiếu mục đó.`,
    ),
  };
}
