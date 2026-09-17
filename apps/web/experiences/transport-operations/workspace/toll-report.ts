import {
  EMPTY_VALUE,
  TOLL_DUPLICATE_SPEND_STATE_LABEL,
  TOLL_PROVIDER_LABEL,
  TOLL_TRANSACTION_KIND_LABEL,
  TOLL_UNATTRIBUTED_REASON_LABEL,
  formatBusinessDate,
  formatBusinessDateRange,
  formatCount,
  formatInstant,
  formatMoney,
} from '../customer-view';
import type {
  TollDuplicateSpendState,
  TollSpendAmount,
  TollSpendReport,
  TollUnattributedReason,
} from '../toll-report-types';
import {
  TOLL_PROVIDERS,
  type TollImport,
  type TollMatchState,
  type TollProvider,
  type TollProviderSurface,
} from '../transport-types';
import { csvFilename, toCsv, type CsvFile } from './exports';

/**
 * MO HINH KHUNG NHIN cua man CHI PHI ETC THEO XE — `#314` G9.
 *
 * ============================================================================================
 * TEP NAY KHONG CONG MOT DONG TIEN NAO
 * ============================================================================================
 *
 * May chu da gom, cong va xep tung dong vao DUNG MOT bang (`toll-spend-report.ts`). O day chi co
 * dinh dang va nhan. Phep dem duy nhat la dem DONG con cho nguoi — mot con so ve viec, khong phai ve
 * tien. Neu mot ngay ai do can mot tong moi, cho them no la may chu, khong phai tep nay.
 *
 * ============================================================================================
 * BON CAI SAI MA MOT MAN HINH VAN CON LAM DUOC SAU KHI SO LIEU DA DUNG
 * ============================================================================================
 *
 *   1. hien "0 ₫" cho mot o KHONG co dong nao — doc ra nhu mot khoan da duoc tinh;
 *   2. doan mot bien so cho mot xe da roi doi xe;
 *   3. dan nguoi dung toi SAI hang cho (hoac toi hang cho cho mot dong khong phai viec cua ai);
 *   4. im lang ve viec khong co duong API nao — de nguoi doc tuong bao cao da du.
 */

/** O TIEN cua bao cao. `isEmpty` = khong co dong nao, va khi do so tien la `—` chu khong `0 ₫`. */
export interface TollSpendAmountCell {
  readonly amountLabel: string;
  readonly rowCountLabel: string;
  readonly isEmpty: boolean;
}

/** VND qua `formatMoney`; loai tien khac hien so kem MA TIEN — khong gan ky hieu dong cho no. */
export const moneyIn = (amount: number, currencyCode: string): string =>
  currencyCode === 'VND' ? formatMoney(amount) : `${formatCount(amount)} ${currencyCode}`;

export const monthLabel = (month: string): string => {
  const parts = /^(\d{4})-(\d{2})$/.exec(month);
  return parts === null ? month : `${parts[2] ?? ''}/${parts[1] ?? ''}`;
};

const cellOf = (value: TollSpendAmount, currencyCode: string): TollSpendAmountCell => ({
  amountLabel: value.rowCount === 0 ? EMPTY_VALUE : moneyIn(value.amount, currencyCode),
  rowCountLabel: `${formatCount(value.rowCount)} dòng`,
  isEmpty: value.rowCount === 0,
});

/* ------------------------------------------------------------------ *
 * Cac bang
 * ------------------------------------------------------------------ */

export interface TollVehicleSpendRowModel {
  readonly key: string;
  readonly vehicleLabel: string;
  /** `false` = xe khong con trong doi xe luc lap bao cao. */
  readonly vehicleKnown: boolean;
  readonly monthLabel: string;
  readonly kindLabel: string;
  readonly currencyCode: string;
  readonly confirmed: TollSpendAmountCell;
  readonly open: TollSpendAmountCell;
}

export interface TollUnattributedRowModel {
  readonly key: string;
  readonly reason: TollUnattributedReason;
  readonly reasonLabel: string;
  readonly monthLabel: string;
  readonly kindLabel: string;
  readonly confirmed: TollSpendAmountCell;
  readonly open: TollSpendAmountCell;
  /**
   * Bo loc hang cho dua toi DUNG cac dong nay. `null` cho `ACCOUNT_LEVEL`: nap tien / phi tai khoan
   * khong phai viec cho ai, va mo hang cho cho no se moi nguoi ta "sua" mot dong khong co gi sai.
   */
  readonly queueMatchState: TollMatchState | null;
  readonly needsPerson: boolean;
}

export interface TollDuplicateRowModel {
  readonly key: string;
  readonly state: TollDuplicateSpendState;
  readonly stateLabel: string;
  readonly monthLabel: string;
  readonly kindLabel: string;
  readonly total: TollSpendAmountCell;
  /** Chi dong NGHI trung moi con viec; dong da ghi la trung thi da co nguoi quyet. */
  readonly queueMatchState: TollMatchState | null;
}

export interface TollSpendTotalRowModel {
  readonly key: string;
  readonly kindLabel: string;
  readonly currencyCode: string;
  readonly attributedConfirmed: TollSpendAmountCell;
  readonly attributedOpen: TollSpendAmountCell;
  readonly unattributedConfirmed: TollSpendAmountCell;
  readonly unattributedOpen: TollSpendAmountCell;
  readonly excluded: TollSpendAmountCell;
}

export interface TollSpendReportModel {
  readonly periodLabel: string;
  readonly providerLabel: string;
  readonly generatedOnLabel: string;
  readonly vehicles: readonly TollVehicleSpendRowModel[];
  readonly unattributed: readonly TollUnattributedRowModel[];
  readonly duplicates: readonly TollDuplicateRowModel[];
  readonly totals: readonly TollSpendTotalRowModel[];
  /** So DONG con cho nguoi: dong chua ro con mo + dong nghi trung. Dem dong, khong cong tien. */
  readonly pendingPersonRowCount: number;
  readonly isEmpty: boolean;
  readonly emptyNotice: string;
  readonly disclosure: string;
}

/**
 * `CONFIRMED` la "da co nguoi nhin", khong phai "da tra". Cau nay dat NGAY tren bang so, vi mot bang
 * tien khong co loi rao se duoc doc nhu mot bang da hach toan.
 */
export const TOLL_SPEND_DISCLOSURE =
  'Số tiền lấy nguyên dấu từ các bảng kê đã nạp. «Đã có người xác nhận» nghĩa là đã có người đối soát ' +
  'dòng đó — không có nghĩa là đã thanh toán hay đã hạch toán. Dòng trùng không được tính vào tổng nào. ' +
  'Phí đường bộ là chi phí của công ty, không trừ vào Quỹ lái xe.';

const vehicleLabelOf = (vehicleId: string, plate: string | null): string =>
  plate ?? `Xe không còn trong đội xe (mã …${vehicleId.slice(-6)})`;

export const toTollSpendReportModel = (report: TollSpendReport): TollSpendReportModel => {
  const periodLabel = formatBusinessDateRange(report.from, report.to);

  const vehicles = report.vehicles.map((row): TollVehicleSpendRowModel => ({
    key: `${row.vehicleId}|${row.month}|${row.kind}|${row.currencyCode}`,
    vehicleLabel: vehicleLabelOf(row.vehicleId, row.registrationPlate),
    vehicleKnown: row.registrationPlate !== null,
    monthLabel: monthLabel(row.month),
    kindLabel: TOLL_TRANSACTION_KIND_LABEL[row.kind],
    currencyCode: row.currencyCode,
    confirmed: cellOf(row.confirmed, row.currencyCode),
    open: cellOf(row.open, row.currencyCode),
  }));

  const unattributed = report.unattributed.map((row): TollUnattributedRowModel => ({
    key: `${row.reason}|${row.month}|${row.kind}|${row.currencyCode}`,
    reason: row.reason,
    reasonLabel: TOLL_UNATTRIBUTED_REASON_LABEL[row.reason],
    monthLabel: monthLabel(row.month),
    kindLabel: TOLL_TRANSACTION_KIND_LABEL[row.kind],
    confirmed: cellOf(row.confirmed, row.currencyCode),
    open: cellOf(row.open, row.currencyCode),
    queueMatchState: row.reason === 'ACCOUNT_LEVEL' ? null : row.reason,
    needsPerson: row.reason !== 'ACCOUNT_LEVEL',
  }));

  const duplicates = report.duplicates.map((row): TollDuplicateRowModel => ({
    key: `${row.state}|${row.month}|${row.kind}|${row.currencyCode}`,
    state: row.state,
    stateLabel: TOLL_DUPLICATE_SPEND_STATE_LABEL[row.state],
    monthLabel: monthLabel(row.month),
    kindLabel: TOLL_TRANSACTION_KIND_LABEL[row.kind],
    total: cellOf(row.total, row.currencyCode),
    queueMatchState: row.state === 'SUSPECTED' ? 'DUPLICATE_CANDIDATE' : null,
  }));

  const totals = report.totals.map((row): TollSpendTotalRowModel => ({
    key: `${row.currencyCode}|${row.kind}`,
    kindLabel: TOLL_TRANSACTION_KIND_LABEL[row.kind],
    currencyCode: row.currencyCode,
    attributedConfirmed: cellOf(row.attributed.confirmed, row.currencyCode),
    attributedOpen: cellOf(row.attributed.open, row.currencyCode),
    unattributedConfirmed: cellOf(row.unattributed.confirmed, row.currencyCode),
    unattributedOpen: cellOf(row.unattributed.open, row.currencyCode),
    excluded: cellOf(row.excludedDuplicates, row.currencyCode),
  }));

  const pendingUnattributed = report.unattributed
    .filter((row) => row.reason !== 'ACCOUNT_LEVEL')
    .reduce((count, row) => count + row.open.rowCount, 0);
  const pendingDuplicates = report.duplicates
    .filter((row) => row.state === 'SUSPECTED')
    .reduce((count, row) => count + row.total.rowCount, 0);

  return {
    periodLabel,
    providerLabel:
      report.provider === null ? 'Mọi nhà cung cấp' : TOLL_PROVIDER_LABEL[report.provider],
    generatedOnLabel: `Tính theo ngày ${formatBusinessDate(report.generatedOn)} của hệ thống`,
    vehicles,
    unattributed,
    duplicates,
    totals,
    pendingPersonRowCount: pendingUnattributed + pendingDuplicates,
    isEmpty:
      vehicles.length === 0 &&
      unattributed.length === 0 &&
      duplicates.length === 0 &&
      totals.length === 0,
    emptyNotice: `Không có dòng nào có ngày nghiệp vụ trong kỳ ${periodLabel}.`,
    disclosure: TOLL_SPEND_DISCLOSURE,
  };
};

/* ------------------------------------------------------------------ *
 * Do phu du lieu — noi that ve duong API va lan nap
 * ------------------------------------------------------------------ */

export interface TollReportCoverage {
  /** `null` = co it nhat mot nha cung cap da dang ky duong API. */
  readonly apiNotice: string | null;
  readonly lastImports: readonly {
    readonly provider: TollProvider;
    readonly providerLabel: string;
    readonly label: string;
  }[];
}

/**
 * MOT BAO CAO CHI NOI VE NHUNG GI DA NAP — va phai noi dieu do ra.
 *
 * Do 08/09/2026 chua nha cung cap nao cong bo tai lieu API. Bao cao im lang ve dieu do se de nguoi
 * doc tuong mot thang "da day du", trong khi no chi gom nhung bang ke ai do da nho nap.
 */
export const toTollReportCoverage = (
  surface: TollProviderSurface | undefined,
  imports: readonly TollImport[] | undefined,
): TollReportCoverage => {
  const apiNotice =
    surface === undefined
      ? 'Chưa đọc được trạng thái đường API của nhà cung cấp, nên chưa nói được báo cáo có thiếu dữ liệu tự động hay không.'
      : surface.api.some((entry) => entry.status === 'REGISTERED')
        ? null
        : 'Chưa nhà cung cấp nào có đường API được công bố, nên báo cáo chỉ gồm các dòng đã nạp từ tệp hoặc nhập tay.';

  const providers = surface?.readiness.map((entry) => entry.provider) ?? [...TOLL_PROVIDERS];
  const lastImports = providers.map((provider) => {
    const providerLabel = TOLL_PROVIDER_LABEL[provider];
    if (imports === undefined) {
      return { provider, providerLabel, label: 'Chưa đọc được lịch sử nạp' };
    }
    // Chuoi ISO so sanh duoc theo thu tu thoi gian — khong phai mot phep tinh tren ngay.
    const latest = imports
      .filter((entry) => entry.provider === provider)
      .reduce<TollImport | null>(
        (best, entry) => (best === null || entry.importedAt > best.importedAt ? entry : best),
        null,
      );
    if (latest === null) return { provider, providerLabel, label: 'Chưa nạp lần nào' };
    const period =
      latest.periodStart === null || latest.periodEnd === null
        ? ''
        : ` · kỳ ${formatBusinessDateRange(latest.periodStart, latest.periodEnd)}`;
    return {
      provider,
      providerLabel,
      label: `Lần nạp gần nhất ${formatInstant(latest.importedAt)}${period}`,
    };
  });

  return { apiNotice, lastImports };
};

/* ------------------------------------------------------------------ *
 * Xuat CSV
 * ------------------------------------------------------------------ */

const CSV_HEADER = [
  'Nhóm',
  'Xe',
  'Lý do / trạng thái',
  'Tháng',
  'Loại giao dịch',
  'Loại tiền',
  'Đã có người xác nhận — số tiền',
  'Đã có người xác nhận — số dòng',
  'Chưa đối soát xong — số tiền',
  'Chưa đối soát xong — số dòng',
  'Không tính vì trùng — số tiền',
  'Không tính vì trùng — số dòng',
] as const;

/**
 * CSV cua bao cao — cung bon quy uoc voi `exports.ts`: dau cham phay, BOM, so THO, thang ISO.
 *
 * Ba nhom nam trong MOT tep, tach bang cot "Nhóm", va moi nhom chi dien DUNG cac cot cua no: mot dong
 * trung de trong hai cot "xac nhan / chua xong" chu khong ghi `0`, vi no khong thuoc cot nao do.
 */
export const tollSpendCsv = (report: TollSpendReport): CsvFile => ({
  filename: csvFilename('chi-phi-etc-theo-xe', `${report.from}_${report.to}`),
  content: toCsv(CSV_HEADER, [
    ...report.vehicles.map((row) => [
      'Theo xe',
      row.registrationPlate ?? row.vehicleId,
      '',
      row.month,
      TOLL_TRANSACTION_KIND_LABEL[row.kind],
      row.currencyCode,
      row.confirmed.amount,
      row.confirmed.rowCount,
      row.open.amount,
      row.open.rowCount,
      '',
      '',
    ]),
    ...report.unattributed.map((row) => [
      'Chưa gắn xe',
      '',
      TOLL_UNATTRIBUTED_REASON_LABEL[row.reason],
      row.month,
      TOLL_TRANSACTION_KIND_LABEL[row.kind],
      row.currencyCode,
      row.confirmed.amount,
      row.confirmed.rowCount,
      row.open.amount,
      row.open.rowCount,
      '',
      '',
    ]),
    ...report.duplicates.map((row) => [
      'Không tính vì trùng',
      '',
      TOLL_DUPLICATE_SPEND_STATE_LABEL[row.state],
      row.month,
      TOLL_TRANSACTION_KIND_LABEL[row.kind],
      row.currencyCode,
      '',
      '',
      '',
      '',
      row.total.amount,
      row.total.rowCount,
    ]),
  ]),
});
