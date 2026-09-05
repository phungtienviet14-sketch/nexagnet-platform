import {
  AGING_BUCKET_LABEL,
  FUEL_RECONCILIATION_STATUS_LABEL,
  FUEL_VERIFICATION_LABEL,
  FUND_ENTRY_KIND_LABEL,
  PAYSLIP_KIND_LABEL,
  PAYSLIP_STATUS_LABEL,
  SETTLEMENT_FLOW_LABEL,
  TRIP_KIND_LABEL,
  TRIP_STATUS_LABEL,
} from '../customer-view';
import type {
  ApByCounterpartyRow,
  ArAgingReport,
  DriverFundStatement,
  FuelEntry,
  Payslip,
  SettlementFlow,
  Trip,
} from '../transport-types';
import { driverLabelOf, type AssetDirectory } from './assets';
import type { SettlementDirectory } from './settlement';

/**
 * KET XUAT CSV — de ke toan lay so lieu ra ma khong can hoi lap trinh vien (#170 §6).
 *
 * BON quyet dinh dinh dang, moi cai vi mot ly do do duoc trong Excel tieng Viet:
 *
 * ### 1. DAU CHAM PHAY, khong phai dau phay
 *
 * Excel ban vi tri Viet Nam doc `,` la DAU THAP PHAN va tach cot bang `;`. Xuat bang dau phay se
 * lam ca tep do vao MOT cot khi nguoi dung bam dup — trieu chung "tep hong" ma that ra la tep dung
 * doc bang bang ma sai.
 *
 * ### 2. BOM UTF-8 o dau tep
 *
 * Khong co BOM, Excel doan bang ma theo locale cua may va tieng Viet co dau thanh ky tu la. Ba
 * byte `EF BB BF` la cach duy nhat noi cho Excel biet day la UTF-8 — `Content-Type` khong toi duoc
 * Excel vi tep di qua o dia.
 *
 * ### 3. SO xuat THO, khong dinh dang
 *
 * `1150000`, khong phai `1.150.000 ₫`. Mot con so da dinh dang la mot CHUOI trong Excel: khong
 * cong duoc, khong loc duoc, khong ve bieu do duoc. Nguoi dung dinh dang lai trong Excel mat ba
 * giay; go bo dau cham cua mot nghin dong thi khong.
 *
 * ### 4. NGAY giu nguyen `YYYY-MM-DD`
 *
 * Do la ngay nghiep vu theo lich cua khach (`business-date.ts`). Doi sang `DD/MM/YYYY` o day se
 * lam Excel doan lai kieu va — voi mot so locale — hoan doi ngay/thang. Giu nguyen thi Excel nhan
 * ra la ngay ISO va khong doan gi.
 */

/** U+FEFF viet bang ESCAPE, khong bang ky tu that: mot BOM tho la mot o TRONG trong trinh
 * soan thao — khong ai doc ra no, va mot lan xoa nham se lam ca tep CSV hong ma diff khong
 * hien gi. `no-irregular-whitespace` cua eslint chan dung dieu do. */
const BOM = '﻿';
const SEPARATOR = ';';

/**
 * Boc mot o. Chi boc khi CAN — mot tep toan dau nhay kho doc khi mo bang trinh soan thao.
 *
 * `\r` cung phai dem: mot ghi chu nguoi dung dan tu Word co the mang `\r\n`, va mot o khong boc se
 * lam gay dong ngay giua bang.
 */
export const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string =>
  BOM + [header, ...rows].map((row) => row.map(csvCell).join(SEPARATOR)).join('\r\n') + '\r\n';

export interface CsvFile {
  readonly filename: string;
  readonly content: string;
}

/** Ten tep mang NGAY de hai lan xuat khong de len nhau trong thu muc Tai xuong. */
export const csvFilename = (base: string, stamp: string): string => `${base}-${stamp}.csv`;

/* ------------------------------------------------------------------ *
 * Cac bang duoc xuat
 * ------------------------------------------------------------------ */

export const tripsCsv = (
  trips: readonly Trip[],
  directory: SettlementDirectory,
  stamp: string,
): CsvFile => ({
  filename: csvFilename('chuyen-xe', stamp),
  content: toCsv(
    [
      'Mã chuyến',
      'Ngày',
      'Loại chuyến',
      'Trạng thái',
      'Điểm đi',
      'Điểm đến',
      'Khách hàng',
      'Cước (VND)',
      'Quãng đường (km)',
      'Lý do huỷ',
    ],
    trips.map((trip) => [
      trip.code,
      trip.businessDate,
      TRIP_KIND_LABEL[trip.kind],
      TRIP_STATUS_LABEL[trip.status],
      trip.originLabel,
      trip.destinationLabel,
      trip.customerId === null ? '' : (directory.customers.get(trip.customerId) ?? ''),
      trip.freightAmount,
      trip.distanceKm,
      trip.cancellationReason,
    ]),
  ),
});

export const driverFundCsv = (
  statement: DriverFundStatement,
  directory: AssetDirectory,
  stamp: string,
): CsvFile => ({
  filename: csvFilename('so-quy-lai-xe', stamp),
  content: toCsv(
    ['Lái xe', 'Ngày', 'Loại bút toán', 'Số tiền (VND)', 'Mã chuyến', 'Ghi chú'],
    statement.entries.map((entry) => [
      driverLabelOf(directory, statement.driverId),
      entry.businessDate,
      FUND_ENTRY_KIND_LABEL[entry.kind],
      entry.signedAmount,
      entry.tripId,
      entry.note,
    ]),
  ),
});

export const fuelReconciliationCsv = (entries: readonly FuelEntry[], stamp: string): CsvFile => ({
  filename: csvFilename('doi-soat-nhien-lieu', stamp),
  content: toCsv(
    ['Ngày', 'Số lít', 'Số tiền (VND)', 'Số km đồng hồ', 'Xác thực', 'Đối soát', 'Số hoá đơn'],
    entries.map((entry) => [
      entry.businessDate,
      // Chia 1000: `litersUnits` la MILILIT. Xuat tho `200000` se doc ra 200 nghin lit.
      entry.litersUnits / 1000,
      entry.amount,
      entry.odometerKm,
      FUEL_VERIFICATION_LABEL[entry.verificationStatus],
      FUEL_RECONCILIATION_STATUS_LABEL[entry.reconciliationStatus],
      entry.invoiceNo,
    ]),
  ),
});

export const arAgingCsv = (
  report: ArAgingReport,
  directory: SettlementDirectory,
  stamp: string,
): CsvFile => ({
  filename: csvFilename('cong-no-phai-thu', stamp),
  content: toCsv(
    [
      'Khách hàng',
      'Ngày chứng từ',
      'Hạn thanh toán',
      'Còn nợ (VND)',
      'Số ngày quá hạn',
      'Nhóm tuổi nợ',
    ],
    report.rows.map((row) => [
      directory.customers.get(row.counterpartyId) ?? '',
      row.businessDate,
      row.dueDate,
      row.outstandingAmount,
      row.daysOverdue,
      AGING_BUCKET_LABEL[row.bucket],
    ]),
  ),
});

export const apCsv = (
  rowsByFlow: ReadonlyMap<SettlementFlow, readonly ApByCounterpartyRow[]>,
  directory: SettlementDirectory,
  stamp: string,
): CsvFile => {
  const rows: (string | number | null)[][] = [];
  for (const [flow, flowRows] of rowsByFlow) {
    for (const row of flowRows) {
      rows.push([
        SETTLEMENT_FLOW_LABEL[flow],
        directory.partners.get(row.counterpartyId) ??
          directory.customers.get(row.counterpartyId) ??
          '',
        row.documentCount,
        row.outstandingAmount,
      ]);
    }
  }
  return {
    filename: csvFilename('cong-no-phai-tra', stamp),
    content: toCsv(['Dòng tiền', 'Đối tác', 'Số chứng từ', 'Còn nợ (VND)'], rows),
  };
};

export const payrollCsv = (
  payslips: readonly Payslip[],
  directory: AssetDirectory,
  stamp: string,
): CsvFile => ({
  filename: csvFilename('bang-luong', stamp),
  content: toCsv(
    [
      'Lái xe',
      'Loại phiếu',
      'Trạng thái',
      'Tổng thu nhập (VND)',
      'Tổng khấu trừ (VND)',
      'Thực nhận (VND)',
      'Số chuyến',
      'Số km',
      'Lý do sửa',
    ],
    payslips.map((payslip) => [
      driverLabelOf(directory, payslip.driverId),
      PAYSLIP_KIND_LABEL[payslip.kind],
      PAYSLIP_STATUS_LABEL[payslip.status],
      payslip.grossEarnings,
      payslip.totalDeductions,
      payslip.netAmount,
      payslip.tripCount,
      payslip.distanceKm,
      payslip.correctionReason,
    ]),
  ),
});

/**
 * TAI TEP XUONG. Tao mot `Blob` va mot the `<a download>` roi thu hoi ngay.
 *
 * `URL.revokeObjectURL` khong phai don dep cho gon: moi `createObjectURL` giu ca `Blob` trong bo
 * nho cho toi khi tai lai trang, nen mot phien ke toan xuat hai chuc bang se giu lai ca hai chuc.
 */
export const downloadCsv = (file: CsvFile): void => {
  const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
