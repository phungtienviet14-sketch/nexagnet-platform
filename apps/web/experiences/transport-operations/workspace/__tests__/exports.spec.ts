import { describe, expect, it } from 'vitest';
import type { ArAgingReport, FuelEntry, Trip } from '../../transport-types';
import {
  arAgingCsv,
  csvCell,
  csvFilename,
  fuelReconciliationCsv,
  toCsv,
  tripsCsv,
} from '../exports';
import { toSettlementDirectory } from '../settlement';
import { customer, fuelEntry, trip } from './fixtures';

/**
 * KET XUAT CSV.
 *
 * Bo test nay khong kiem "co sinh ra tep khong" — no khoa cac quyet dinh dinh dang ma neu sai se
 * lam tep mo trong Excel tieng Viet ra sai, va sai theo kieu nguoi dung do cho he thong.
 */

const directory = toSettlementDirectory({
  customers: [customer({ id: 'cus-1', name: 'Công ty TNHH Bảo An' })],
  partners: [],
});

describe('dinh dang CSV cho Excel tieng Viet', () => {
  it('tach cot bang DAU CHAM PHAY — Excel vi-VN doc dau phay la dau thap phan', () => {
    const csv = toCsv(['A', 'B'], [['1', '2']]);
    expect(csv).toContain('A;B');
    expect(csv).toContain('1;2');
  });

  it('co BOM UTF-8 o dau tep, neu khong tieng Viet ra ky tu la', () => {
    expect(toCsv(['Mã'], [])).toMatch(/^\uFEFF/);
  });

  it('xuong dong CRLF — Excel tren Windows doi dung the', () => {
    expect(toCsv(['A'], [['1']])).toContain('\r\n');
  });

  it('chi boc o khi CAN, va nhan doi dau nhay ben trong', () => {
    expect(csvCell('binh thuong')).toBe('binh thuong');
    expect(csvCell('co;dau cham phay')).toBe('"co;dau cham phay"');
    expect(csvCell('co "dau nhay"')).toBe('"co ""dau nhay"""');
  });

  it('o co xuong dong phai duoc boc, khong thi gay bang giua chung', () => {
    expect(csvCell('dong mot\r\ndong hai')).toBe('"dong mot\r\ndong hai"');
  });

  it('gia tri rong va null deu ra o TRONG, khong ra chu "null"', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('ten tep mang moc thoi gian de hai lan xuat khong de len nhau', () => {
    expect(csvFilename('chuyen-xe', '2026-09-30')).toBe('chuyen-xe-2026-09-30.csv');
  });
});

describe('bang chuyen xe', () => {
  const row: Trip = trip({ status: 'DELIVERED' });

  it('so tien xuat THO — mot so da dinh dang la mot CHUOI trong Excel, khong cong duoc', () => {
    const csv = tripsCsv([row], directory, '2026-09-30').content;
    expect(csv).toContain('11500000');
    expect(csv).not.toContain('11.500.000');
    expect(csv).not.toContain('₫');
  });

  it('ngay giu nguyen ISO — doi sang DD/MM se lam Excel doan lai kieu', () => {
    expect(tripsCsv([row], directory, '2026-09-30').content).toContain('2026-09-04');
  });

  it('khach hang xuat bang TEN, khong bang customerId', () => {
    const csv = tripsCsv([row], directory, '2026-09-30').content;
    expect(csv).toContain('Công ty TNHH Bảo An');
    expect(csv).not.toContain('cus-1');
  });

  it('chuyen khong co khach thi o TRONG, khong ra chu "null"', () => {
    const csv = tripsCsv([{ ...row, customerId: null }], directory, '2026-09-30').content;
    expect(csv).not.toContain('null');
  });
});

describe('bang doi soat nhien lieu', () => {
  const entry: FuelEntry = fuelEntry({ litersUnits: 200_000, invoiceNo: 'HD-77' });

  /**
   * Bai QUAN TRONG NHAT cua tep nay. `litersUnits` la MILILIT (ty le 3). Xuat tho `200000` se doc
   * ra hai tram nghin lit — sai gap mot nghin lan, va la con so ke toan dung de doi soat voi cay
   * xang.
   */
  it('so lit CHIA 1000 truoc khi xuat — litersUnits la mililit', () => {
    const csv = fuelReconciliationCsv([entry], '2026-09-30').content;
    expect(csv).toContain(';200;');
    expect(csv).not.toContain(';200000;');
  });

  it('so le van giu duoc phan thap phan', () => {
    const csv = fuelReconciliationCsv([{ ...entry, litersUnits: 205_500 }], '2026-09-30').content;
    expect(csv).toContain('205.5');
  });
});

describe('bang cong no phai thu', () => {
  const report: ArAgingReport = {
    asOf: '2026-09-30',
    rows: [
      {
        documentId: 'doc-1',
        counterpartyId: 'cus-1',
        businessDate: '2026-09-01',
        dueDate: null,
        outstandingAmount: 11_500_000,
        daysOverdue: 0,
        bucket: 'CURRENT',
        currencyCode: 'VND',
      },
    ],
    totalsByBucket: { CURRENT: 11_500_000, D1_30: 0, D31_60: 0, D60_PLUS: 0 },
    outstandingTotal: 11_500_000,
    overdueTotal: 0,
  };

  it('han thanh toan chua co thi o TRONG, khong bia mot ngay', () => {
    const csv = arAgingCsv(report, directory, '2026-09-30').content;
    const dataLine = csv.split('\r\n')[1] ?? '';
    expect(dataLine).toContain(';;');
  });

  it('nhom tuoi no xuat bang chu tieng Viet, khong bang ma may', () => {
    expect(arAgingCsv(report, directory, '2026-09-30').content).toContain('Trong hạn');
  });
});
