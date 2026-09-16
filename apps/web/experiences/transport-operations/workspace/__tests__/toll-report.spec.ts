import { describe, expect, it } from 'vitest';
import type { TollSpendAmount, TollSpendReport } from '../../toll-report-types';
import type { TollImport, TollProviderSurface } from '../../transport-types';
import {
  moneyIn,
  monthLabel,
  toTollReportCoverage,
  toTollSpendReportModel,
  tollSpendCsv,
} from '../toll-report';

/**
 * `#314` G9 — man CHI PHI ETC THEO XE. Phan quyet dinh o tang khung nhin.
 *
 * May chu da cong tien va xep dong vao dung bang. Cai bo bai nay giu la nhung dieu mot man hinh
 * con co the lam SAI sau khi so lieu da dung: noi mot o trong thanh "0 ₫", doan bien so cho mot xe da
 * roi doi, dan nguoi dung toi sai hang cho, noi "da thanh toan", hay im lang ve viec chua co API.
 */

const amount = (rowCount: number, value: number): TollSpendAmount => ({ rowCount, amount: value });
const ZERO = amount(0, 0);

const report = (over: Partial<TollSpendReport> = {}): TollSpendReport => ({
  from: '2026-09-01',
  to: '2026-09-16',
  provider: null,
  generatedOn: '2026-09-16',
  vehicles: [],
  unattributed: [],
  duplicates: [],
  totals: [],
  ...over,
});

const surface = (
  statuses: readonly ('NOT_PUBLICLY_PROVEN' | 'REGISTERED')[],
): TollProviderSurface => ({
  readiness: (['VETC', 'EPASS', 'OTHER'] as const).map((provider) => ({
    provider,
    statementReady: false,
    blockedReason: 'BLOCKED_SAMPLE_REQUIRED',
    apiStatus: 'NOT_PUBLICLY_PROVEN',
  })),
  api: (['VETC', 'EPASS', 'OTHER'] as const).map((provider, index) => ({
    provider,
    status: statuses[index] ?? 'NOT_PUBLICLY_PROVEN',
    requestPath: 'ND 119/2024 D.26 kh.2',
  })),
});

const tollImport = (over: Partial<TollImport> = {}): TollImport => ({
  id: 'imp-1',
  provider: 'VETC',
  sourceKind: 'MANUAL',
  sourceLabel: 'VETC thang 8',
  sourceDigest: 'digest',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  rowCount: 3,
  acceptedCount: 3,
  rejectedCount: 0,
  importedAt: '2026-09-05T05:00:00Z',
  importedBy: 'ke-toan',
  ...over,
});

describe('ky va moc ngay', () => {
  it('noi RO ky, nha cung cap, va rang moc ngay la cua HE THONG', () => {
    const model = toTollSpendReportModel(report({ provider: 'EPASS' }));
    expect(model.periodLabel).toBe('01/09/2026 – 16/09/2026');
    expect(model.providerLabel).toBe('ePass');
    expect(model.generatedOnLabel).toContain('16/09/2026');
    expect(toTollSpendReportModel(report()).providerLabel).toBe('Mọi nhà cung cấp');
  });

  it('thang hien `MM/YYYY`; chuoi la thi tra lai nguyen van', () => {
    expect(monthLabel('2026-08')).toBe('08/2026');
    expect(monthLabel('khong-phai-thang')).toBe('khong-phai-thang');
  });
});

describe('bang theo xe', () => {
  it('hien BIEN SO; xe da roi doi noi that la da roi doi — khong doan mot bien so', () => {
    const model = toTollSpendReportModel(
      report({
        vehicles: [
          {
            vehicleId: 'veh-1',
            registrationPlate: '15C-556.33',
            month: '2026-08',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            confirmed: amount(2, -104_000),
            open: ZERO,
          },
          {
            vehicleId: 'veh-da-ban-1234',
            registrationPlate: null,
            month: '2026-08',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            confirmed: ZERO,
            open: amount(1, -52_000),
          },
        ],
      }),
    );

    expect(model.vehicles[0]?.vehicleLabel).toBe('15C-556.33');
    expect(model.vehicles[0]?.vehicleKnown).toBe(true);
    expect(model.vehicles[0]?.kindLabel).toBe('Lượt qua trạm');
    expect(model.vehicles[0]?.monthLabel).toBe('08/2026');
    expect(model.vehicles[1]?.vehicleKnown).toBe(false);
    expect(model.vehicles[1]?.vehicleLabel).toContain('không còn trong đội xe');
  });

  /** "0 ₫" doc ra nhu mot so tien DA DUOC TINH. Mot o khong co dong nao phai trong. */
  it('o KHONG co dong nao hien "—" chu khong phai "0 ₫"', () => {
    const model = toTollSpendReportModel(
      report({
        vehicles: [
          {
            vehicleId: 'veh-1',
            registrationPlate: '15C-556.33',
            month: '2026-08',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            confirmed: ZERO,
            open: amount(1, -52_000),
          },
        ],
      }),
    );
    expect(model.vehicles[0]?.confirmed.amountLabel).toBe('—');
    expect(model.vehicles[0]?.confirmed.rowCountLabel).toBe('0 dòng');
    expect(model.vehicles[0]?.confirmed.isEmpty).toBe(true);
    expect(model.vehicles[0]?.open.isEmpty).toBe(false);
    expect(model.vehicles[0]?.open.amountLabel).toContain('52');
  });
});

describe('dong chua gan xe va dong trung dan toi DUNG hang cho', () => {
  const withRows = toTollSpendReportModel(
    report({
      unattributed: [
        {
          reason: 'ACCOUNT_UNRESOLVED',
          month: '2026-09',
          kind: 'TOLL_PASS',
          currencyCode: 'VND',
          confirmed: ZERO,
          open: amount(1, -35_000),
        },
        {
          reason: 'AMBIGUOUS',
          month: '2026-09',
          kind: 'TOLL_PASS',
          currencyCode: 'VND',
          confirmed: ZERO,
          open: amount(2, -80_000),
        },
        {
          reason: 'ACCOUNT_LEVEL',
          month: '2026-09',
          kind: 'TOP_UP',
          currencyCode: 'VND',
          confirmed: amount(1, 5_000_000),
          open: ZERO,
        },
      ],
      duplicates: [
        {
          state: 'SUSPECTED',
          month: '2026-09',
          kind: 'TOLL_PASS',
          currencyCode: 'VND',
          total: amount(2, -70_000),
        },
        {
          state: 'DECLARED',
          month: '2026-09',
          kind: 'TOLL_PASS',
          currencyCode: 'VND',
          total: amount(1, -35_000),
        },
      ],
    }),
  );

  it('ba ly do "chua ro" mo hang cho voi dung bo loc; cap tai khoan KHONG phai viec cho nguoi', () => {
    expect(
      withRows.unattributed.map((row) => [row.reasonLabel, row.queueMatchState, row.needsPerson]),
    ).toEqual([
      ['Chưa nhận ra tài khoản', 'ACCOUNT_UNRESOLVED', true],
      ['Nhiều xe cùng khớp — chờ người chọn', 'AMBIGUOUS', true],
      ['Cấp tài khoản (nạp tiền, phí) — không thuộc xe nào', null, false],
    ]);
  });

  it('nghi trung mo hang cho nghi trung; da ghi trung thi khong con viec', () => {
    expect(withRows.duplicates.map((row) => [row.stateLabel, row.queueMatchState])).toEqual([
      ['Nghi trùng — chờ người quyết', 'DUPLICATE_CANDIDATE'],
      ['Đã ghi là trùng — không tính', null],
    ]);
  });

  /** Dem DONG chu khong cong TIEN: trinh duyet khong tinh mot so tien nao. */
  it('so dong CON CHO NGUOI = dong chua ro con mo + dong nghi trung', () => {
    expect(withRows.pendingPersonRowCount).toBe(1 + 2 + 2);
  });
});

describe('khong mot chu nao noi tien da tra', () => {
  it('loi rao noi RO "xac nhan" khong phai "thanh toan", va ETC khong tru quy lai xe', () => {
    const model = toTollSpendReportModel(report());
    expect(model.disclosure).toContain('không có nghĩa là đã thanh toán');
    expect(model.disclosure).toContain('không trừ vào Quỹ lái xe');
  });

  it('nhan cua moi hang KHONG mang chu thanh toan / hach toan', () => {
    const model = toTollSpendReportModel(
      report({
        unattributed: [
          {
            reason: 'VEHICLE_UNRESOLVED',
            month: '2026-09',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            confirmed: ZERO,
            open: amount(1, -1),
          },
        ],
        duplicates: [
          {
            state: 'DECLARED',
            month: '2026-09',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            total: amount(1, -1),
          },
        ],
      }),
    );
    const labels = [
      ...model.unattributed.map((row) => row.reasonLabel),
      ...model.duplicates.map((row) => row.stateLabel),
      model.periodLabel,
      model.generatedOnLabel,
    ];
    for (const label of labels) expect(label).not.toMatch(/thanh toán|hạch toán|đã trả/i);
  });
});

describe('tien va tong', () => {
  it('loai tien khac VND hien so kem MA TIEN — khong gan ky hieu dong cho mot so khong phai dong', () => {
    expect(moneyIn(-3, 'USD')).toBe('-3 USD');
    expect(moneyIn(-52_000, 'VND')).not.toContain('USD');
  });

  it('tong: MOT hang cho moi (loai tien, loai giao dich), NAM o rieng — khong cong gop o trinh duyet', () => {
    const model = toTollSpendReportModel(
      report({
        totals: [
          {
            currencyCode: 'VND',
            kind: 'TOLL_PASS',
            attributed: { confirmed: amount(1, -52_000), open: amount(1, -40_000) },
            unattributed: { confirmed: ZERO, open: amount(1, -35_000) },
            excludedDuplicates: amount(1, -35_000),
          },
          {
            currencyCode: 'VND',
            kind: 'TOP_UP',
            attributed: { confirmed: ZERO, open: ZERO },
            unattributed: { confirmed: amount(1, 5_000_000), open: ZERO },
            excludedDuplicates: ZERO,
          },
        ],
      }),
    );
    expect(model.totals.map((row) => row.kindLabel)).toEqual([
      'Lượt qua trạm',
      'Nạp tiền tài khoản',
    ]);
    expect(model.totals[0]?.attributedConfirmed.rowCountLabel).toBe('1 dòng');
    expect(model.totals[0]?.excluded.isEmpty).toBe(false);
    expect(model.totals[1]?.attributedOpen.amountLabel).toBe('—');
  });

  it('bao cao rong noi RO la khong co dong nao trong ky', () => {
    const model = toTollSpendReportModel(report());
    expect(model.isEmpty).toBe(true);
    expect(model.emptyNotice).toContain('01/09/2026 – 16/09/2026');
  });
});

describe('xuat CSV', () => {
  it('ten tep mang KY; so THO; thang ISO; ba nhom tach bang cot "Nhóm"', () => {
    const file = tollSpendCsv(
      report({
        vehicles: [
          {
            vehicleId: 'veh-1',
            registrationPlate: '15C-556.33',
            month: '2026-08',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            confirmed: amount(2, -104_000),
            open: ZERO,
          },
        ],
        unattributed: [
          {
            reason: 'AMBIGUOUS',
            month: '2026-08',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            confirmed: ZERO,
            open: amount(1, -40_000),
          },
        ],
        duplicates: [
          {
            state: 'SUSPECTED',
            month: '2026-08',
            kind: 'TOLL_PASS',
            currencyCode: 'VND',
            total: amount(2, -70_000),
          },
        ],
      }),
    );

    expect(file.filename).toBe('chi-phi-etc-theo-xe-2026-09-01_2026-09-16.csv');
    const lines = file.content.replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('Theo xe;15C-556.33;;2026-08;Lượt qua trạm;VND;-104000;2;0;0;;');
    expect(lines[2]).toBe(
      'Chưa gắn xe;;Nhiều xe cùng khớp — chờ người chọn;2026-08;Lượt qua trạm;VND;0;0;-40000;1;;',
    );
    expect(lines[3]).toBe(
      'Không tính vì trùng;;Nghi trùng — chờ người quyết;2026-08;Lượt qua trạm;VND;;;;;-70000;2',
    );
    expect(file.content).not.toMatch(/thanh toán|hạch toán/i);
  });
});

describe('do phu du lieu — noi that ve duong API va lan nap', () => {
  it('khong nha cung cap nao co API -> noi RO bao cao chi gom dong DA NAP', () => {
    const coverage = toTollReportCoverage(surface([]), []);
    expect(coverage.apiNotice).toContain('chỉ gồm các dòng đã nạp');
  });

  it('co mot nha cung cap da dang ky API -> khong noi cau "chua co API" cho ca bang', () => {
    expect(toTollReportCoverage(surface(['REGISTERED']), []).apiNotice).toBeNull();
  });

  it('chua doc duoc trang thai nha cung cap -> noi la CHUA DOC DUOC, khong doan', () => {
    expect(toTollReportCoverage(undefined, []).apiNotice).toContain('Chưa đọc được');
  });

  it('lan nap gan nhat theo TUNG nha cung cap; chua nap thi noi chua nap', () => {
    const coverage = toTollReportCoverage(surface([]), [
      tollImport({ id: 'imp-cu', importedAt: '2026-08-05T05:00:00Z' }),
      tollImport({ id: 'imp-moi', importedAt: '2026-09-05T05:00:00Z' }),
    ]);
    const byProvider = new Map(coverage.lastImports.map((row) => [row.providerLabel, row.label]));
    expect(byProvider.get('VETC')).toContain('05/09/2026');
    expect(byProvider.get('VETC')).toContain('01/08/2026 – 31/08/2026');
    expect(byProvider.get('ePass')).toBe('Chưa nạp lần nào');
  });

  it('chua doc duoc lich su nap -> noi la chua doc duoc', () => {
    const coverage = toTollReportCoverage(surface([]), undefined);
    expect(coverage.lastImports.every((row) => row.label === 'Chưa đọc được lịch sử nạp')).toBe(
      true,
    );
  });
});
