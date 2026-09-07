import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARITHMETIC_TOLERANCE_VND,
  assessFuelCandidate,
  expectedAmountVnd,
  FUEL_CANDIDATE_FINDINGS,
  type FuelCandidateFinding,
} from './fuel-candidate-validation.js';
import type { FuelCandidate } from './fuel-document.types.js';

/**
 * `VAL-01`..`VAL-22` — kiem tat dinh mot ung vien (Lane C / C4, Issue #236).
 *
 * Bo test nay do dung mot cau: he thong co NOI RA duoc moi dieu khong on, bang nhung ma phan biet
 * duoc, ma KHONG ket luan gi ve tien hay ve nguoi.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const TODAY = '2026-09-08';

/** Mot ung vien SACH: 62,5 lit x 23.000 d = 1.437.500 d, tram da nhan ra, bien so khop doi xe. */
const clean = (over: Partial<FuelCandidate> = {}): FuelCandidate => ({
  id: 'cand-1',
  documentId: 'doc-1',
  lineNumber: 1,
  sellerTaxCode: '0101234567',
  invoiceSymbol: 'C26TAA',
  invoiceNo: '00001234',
  invoiceTemplate: '1',
  confidence: null,
  sellerName: 'Cua hang so 5',
  stationLabelRaw: 'Cua hang so 5',
  stationId: 'st-1',
  stationMatch: 'RESOLVED',
  issuedDate: '2026-09-05',
  issuedTimeRaw: null,
  litersUnits: 62_500,
  unitPriceUnits: 23_000_000,
  amount: 1_437_500,
  currencyCode: 'VND',
  itemName: 'Dau DO 0,05S-II',
  unitRaw: 'Lít',
  plateHintRaw: '29C-123.45',
  plateHintSource: 'EXTENSION_FIELD',
  odometerHintKm: null,
  provenance: {},
  createdAt: '2026-09-08T00:00:00.000Z',
  ...over,
});

const assess = (over: Partial<FuelCandidate> = {}, options: { supplierLinked?: boolean } = {}) =>
  assessFuelCandidate({
    candidate: clean(over),
    supplierLinked: options.supplierLinked ?? true,
    fleetPlates: new Set(['29C12345']),
    today: TODAY,
  });

const findingsOf = (...args: Parameters<typeof assess>): FuelCandidateFinding[] =>
  assess(...args).findings.map((entry) => entry.finding);

describe('assessFuelCandidate — mot ung vien sach', () => {
  it('VAL-01 — khong phat hien nao', () => {
    const result = assess();
    expect(result.outcome).toBe('NO_FINDINGS');
    expect(result.findings).toEqual([]);
  });

  /**
   * Ten cua ket cuc CO Y tranh moi tu goi nho den su chap thuan. Mot ung vien sach van thieu XE —
   * hoa don dien tu khong mang truong bien so — nen `NO_FINDINGS` khong bao gio duoc doc thanh
   * "duyet duoc".
   */
  it('VAL-02 — ket cuc chi co hai gia tri, va khong gia tri nao la mot lan duyet', () => {
    expect(assess().outcome).toBe('NO_FINDINGS');
    expect(assess({ amount: 999 }).outcome).toBe('HAS_FINDINGS');
  });
});

describe('assessFuelCandidate — phep kiem so hoc', () => {
  it('VAL-03 — `so lit x don gia` khop chinh xac thi khong keu', () => {
    expect(expectedAmountVnd(62_500, 23_000_000)).toBe(1_437_500);
    expect(findingsOf()).not.toContain('ARITHMETIC_MISMATCH');
  });

  it('VAL-04 — lech qua dung sai thi keu, VA mang theo so da do', () => {
    const mismatch = assess({ amount: 1_437_000 }).findings.find(
      (entry) => entry.finding === 'ARITHMETIC_MISMATCH',
    );

    expect(mismatch?.detail).toEqual({
      expectedVnd: 1_437_500,
      actualVnd: 1_437_000,
      deltaVnd: -500,
    });
  });

  /**
   * Mot dong la dung sai cua MOT LAN LAM TRON, khong phai mot khoang an toan. Neu nha cung cap
   * that su lam tron ve tram dong, `deltaVnd` se noi dieu do thanh mot con so doc duoc — thay vi
   * mot phep kiem duoc noi rong ra cho het keu.
   */
  it('VAL-05 — lech dung mot dong (lam tron) thi KHONG keu', () => {
    expect(ARITHMETIC_TOLERANCE_VND).toBe(1);
    expect(findingsOf({ amount: 1_437_501 })).not.toContain('ARITHMETIC_MISMATCH');
    expect(findingsOf({ amount: 1_437_502 })).toContain('ARITHMETIC_MISMATCH');
  });

  it('VAL-06 — thieu mot ve thi khong tinh duoc, va bao THIEU chu khong bao LECH', () => {
    const result = findingsOf({ unitPriceUnits: null });
    expect(result).toContain('UNIT_PRICE_UNREADABLE');
    expect(result).not.toContain('ARITHMETIC_MISMATCH');
  });

  it('VAL-07 — phep nhan chay tren so NGUYEN, khong de lai sai so o chu so cuoi', () => {
    // 62,501 lit x 23.456 d = 1.466.023,456 — hoa don se lam tron ve dong.
    expect(expectedAmountVnd(62_501, 23_456_000)).toBeCloseTo(1_466_023.456, 3);
  });
});

describe('assessFuelCandidate — o khong doc duoc', () => {
  it.each([
    ['litersUnits', 'QUANTITY_UNREADABLE'],
    ['unitPriceUnits', 'UNIT_PRICE_UNREADABLE'],
    ['amount', 'AMOUNT_UNREADABLE'],
  ])('VAL-08 — `%s` khong doc duoc ra `%s`', (field, finding) => {
    expect(findingsOf({ [field]: null } as Partial<FuelCandidate>)).toContain(finding);
  });

  it('VAL-09 — ngay khong doc duoc ra ma rieng', () => {
    expect(findingsOf({ issuedDate: null })).toContain('ISSUED_DATE_UNREADABLE');
  });

  /** Mot ngay tuong lai dat khoan chi vao nham thang, va thuong la mot o bi go nham nam. */
  it('VAL-10 — ngay o TUONG LAI keu, kem ca hai ngay de nguoi doc so', () => {
    const finding = assess({ issuedDate: '2026-09-09' }).findings.find(
      (entry) => entry.finding === 'ISSUED_DATE_IN_FUTURE',
    );
    expect(finding?.detail).toEqual({ issuedDate: '2026-09-09', today: TODAY });
  });

  it('VAL-11 — ngay HOM NAY khong phai tuong lai', () => {
    expect(findingsOf({ issuedDate: TODAY })).not.toContain('ISSUED_DATE_IN_FUTURE');
  });
});

describe('assessFuelCandidate — don vi tinh', () => {
  it.each(['Lít', 'LIT', 'lit', 'L', 'Litre'])('VAL-12 — `%s` duoc coi la lit', (unit) => {
    expect(findingsOf({ unitRaw: unit })).not.toContain('UNIT_NOT_LITRES');
  });

  it('VAL-13 — dong khong phai nhien lieu duoc DANH DAU, khong bi loc bo', () => {
    const finding = assess({ unitRaw: 'Chai', itemName: 'Nuoc uong dong chai' }).findings.find(
      (entry) => entry.finding === 'UNIT_NOT_LITRES',
    );
    expect(finding?.detail).toEqual({ unit: 'Chai' });
  });

  it('VAL-14 — hoa don khong ghi don vi thi KHONG keu — do la chuyen thuong', () => {
    expect(findingsOf({ unitRaw: null })).not.toContain('UNIT_NOT_LITRES');
  });
});

describe('assessFuelCandidate — danh tinh chua day du', () => {
  it.each([
    ['AMBIGUOUS' as const],
    ['SUPPLIER_MISMATCH' as const],
    ['NO_MATCH' as const],
    ['NO_INPUT' as const],
  ])('VAL-15 — tram o ket cuc %s thi keu, kem chinh ket cuc do', (stationMatch) => {
    const finding = assess({ stationMatch, stationId: null }).findings.find(
      (entry) => entry.finding === 'STATION_UNRESOLVED',
    );
    expect(finding?.detail).toEqual({ stationMatch });
  });

  it('VAL-16 — chua noi duoc nha cung cap thi keu', () => {
    expect(findingsOf({}, { supplierLinked: false })).toContain('SUPPLIER_UNLINKED');
  });

  /**
   * KHONG co goi y bien so la truong hop THUONG, khong phai truong hop hiem: ND 123/2020 Dieu 10
   * khong doi hoa don ghi bien so. No van la mot phat hien vi no noi cho nguoi doi soat biet ho se
   * phai TU gan xe.
   */
  it('VAL-17 — khong co goi y bien so thi keu `PLATE_HINT_ABSENT`', () => {
    const result = findingsOf({ plateHintRaw: null, plateHintSource: null });
    expect(result).toContain('PLATE_HINT_ABSENT');
    expect(result).not.toContain('PLATE_HINT_UNKNOWN_VEHICLE');
  });

  it('VAL-18 — goi y bien so khong khop doi xe thi keu ma KHAC', () => {
    const finding = assess({ plateHintRaw: '51D-99999' }).findings.find(
      (entry) => entry.finding === 'PLATE_HINT_UNKNOWN_VEHICLE',
    );
    expect(finding?.detail).toEqual({ plateHint: '51D-99999' });
  });

  it('VAL-19 — bien so viet khac kieu van khop, vi so sanh tren ban DA CHUAN HOA', () => {
    expect(findingsOf({ plateHintRaw: '29c 123 45' })).not.toContain('PLATE_HINT_UNKNOWN_VEHICLE');
  });
});

describe('assessFuelCandidate — thu tu va tinh on dinh', () => {
  it('VAL-20 — danh sach phat hien theo dung thu tu khai bao, khong theo thu tu tim thay', () => {
    const result = findingsOf(
      { litersUnits: null, stationMatch: 'NO_MATCH', stationId: null, plateHintRaw: null },
      { supplierLinked: false },
    );
    expect(result).toEqual(FUEL_CANDIDATE_FINDINGS.filter((finding) => result.includes(finding)));
  });

  it('VAL-21 — hai lan chay tren cung mot ung vien cho ra cung mot danh sach', () => {
    expect(findingsOf({ amount: 1 })).toEqual(findingsOf({ amount: 1 }));
  });
});

/**
 * `VAL-22` — TANG NAY KHONG SINH RA MOT KHOAN NO NAO.
 *
 * `INV-07`/`INV-27` cua T1 va muc C4 cua #236 deu noi cung mot dieu: bat thuong di den NGUOI. Mot
 * bai doc ma nguon la cach re nhat de chan mot lan sua tuong lai bien mot phat hien thanh mot but
 * toan — vi khong bai test hanh vi nao bat duoc dieu do truoc khi no xay ra.
 */
describe('VAL-22 — khong ket luan nao cham toi so quy', () => {
  it('tep kiem tat dinh khong nhac mot khai niem tien/quy/luong nao', () => {
    const code = readFileSync(join(HERE, 'fuel-candidate-validation.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    for (const forbidden of [
      'DriverFund',
      'CostingService',
      'FuelCostingPort',
      'TripExpense',
      'Payslip',
      'recordTripExpense',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('khong ma phat hien nao mang tu ngu ket toi', () => {
    for (const finding of FUEL_CANDIDATE_FINDINGS) {
      expect(finding).not.toMatch(/FRAUD|THEFT|DEBT|PENALTY|BLAME/);
    }
  });
});
