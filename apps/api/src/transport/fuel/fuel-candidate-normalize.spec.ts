import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findOdometerHint,
  findPlateHint,
  findStationCodeHint,
  looksLikeVietnamesePlate,
  normalizeInvoiceCandidates,
} from './fuel-candidate-normalize.js';
import { parseEInvoiceXml, type ParsedInvoice } from './fuel-einvoice-parse.js';
import type { FuelStationResolution } from './fuel-station-identity.js';

/**
 * `NORM-01`..`NORM-14` — mot hoa don da doc -> cac ung vien (Lane C / C2, Issue #236).
 *
 * Bo test nay do dung mot cau: he thong co GIU DUOC ranh gioi giua "chung tu noi gi" va "ta doan
 * gi" khong. Bien so va odo la GOI Y; so lit, don gia, thanh tien la thu chung tu that su noi.
 */

const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/hoa-don-dien-tu-mau.xml'),
  'utf8',
);

const parsed = (xml: string): ParsedInvoice => {
  const result = parseEInvoiceXml(xml);
  if (!result.ok) throw new Error(`dang le phai doc duoc: ${result.reason}`);
  return result.invoice;
};

const invoiceWith = (options: { extensions?: string; buyer?: string }): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<HDon><DLHDon><TTChung><KHHDon>C26TAA</KHHDon><SHDon>1</SHDon></TTChung>
<NDHDon><NBan><MST>0101234567</MST><Ten>Cua hang so 5</Ten></NBan>
${options.buyer === undefined ? '' : `<NMua><Ten>${options.buyer}</Ten></NMua>`}
<DSHHDVu><HHDVu><SLuong>10</SLuong><ThTien>230000</ThTien></HHDVu></DSHHDVu></NDHDon>
${options.extensions === undefined ? '' : `<TTKhac>${options.extensions}</TTKhac>`}
</DLHDon></HDon>`;

const extension = (name: string, value: string): string =>
  `<TTin><TTruong>${name}</TTruong><KDLieu>string</KDLieu><DLieu>${value}</DLieu></TTin>`;

const RESOLVED: FuelStationResolution = {
  outcome: 'RESOLVED',
  stationId: 'st-1',
  via: 'CODE',
  status: 'ACTIVE',
};

describe('looksLikeVietnamesePlate — khuon NEO HAI DAU', () => {
  it.each(['29C-123.45', '29C12345', '51D-99999', '29H1-234.56', '30A 12345'])(
    'NORM-01 — nhan `%s` la mot bien so',
    (raw) => {
      expect(looksLikeVietnamesePlate(raw)).toBe(true);
    },
  );

  /**
   * Ba chuoi duoi day deu CHUA mot doan trong nhu bien so. Mot bo quet chuoi con se lay chung ra;
   * khuon neo hai dau thi khong. Do la ca khac biet giua mot goi y va mot lan doan.
   */
  it.each([
    'CONG TY VAN TAI 29 TAN',
    'So 51D pho Mau, Ha Noi',
    '0101234567',
    'CONG TY CO PHAN 29C',
  ])('NORM-02 — KHONG nhan `%s`', (raw) => {
    expect(looksLikeVietnamesePlate(raw)).toBe(false);
  });
});

describe('findPlateHint — hai duong, va mot duong bi tu choi co chu dich', () => {
  it('NORM-03 — truong mo rong DUOC DAT TEN thang duoc uu tien', () => {
    expect(findPlateHint(parsed(FIXTURE))).toEqual({
      raw: '29C-123.45',
      source: 'EXTENSION_FIELD',
    });
  });

  it.each(['BienSoXe', 'BIEN SO', 'BKS', 'VehiclePlate', 'bien_so_xe'])(
    'NORM-04 — nhan ten truong `%s` sau khi chuan hoa',
    (name) => {
      const hint = findPlateHint(
        parsed(invoiceWith({ extensions: extension(name, '29C-123.45') })),
      );
      expect(hint?.source).toBe('EXTENSION_FIELD');
    },
  );

  /**
   * Gia tri duoc giu NGUYEN BAN ke ca khi no khong giong mot bien so: mot NGUOI da dat ten truong
   * do la "bien so xe", va viec doi chieu voi doi xe la cua tang kiem tat dinh, khong cua tang doc.
   */
  it('NORM-05 — truong co ten van giu gia tri du no khong giong bien so', () => {
    expect(
      findPlateHint(parsed(invoiceWith({ extensions: extension('BienSoXe', 'chua ro') }))),
    ).toEqual({ raw: 'chua ro', source: 'EXTENSION_FIELD' });
  });

  it('NORM-06 — ten nguoi mua LA mot bien so thi thanh goi y, kem nguon', () => {
    expect(findPlateHint(parsed(invoiceWith({ buyer: '29C-123.45' })))).toEqual({
      raw: '29C-123.45',
      source: 'BUYER_NAME',
    });
  });

  it('NORM-07 — ten nguoi mua la mot cong ty thi KHONG co goi y nao', () => {
    expect(findPlateHint(parsed(invoiceWith({ buyer: 'CONG TY VAN TAI MAU' })))).toBeNull();
  });

  it('NORM-08 — khong truong nao va khong ten nguoi mua thi `null`, khong phai chuoi rong', () => {
    expect(findPlateHint(parsed(invoiceWith({})))).toBeNull();
  });
});

describe('findOdometerHint / findStationCodeHint', () => {
  it('NORM-09 — odo chi nhan so nguyen viet lien', () => {
    expect(findOdometerHint(parsed(invoiceWith({ extensions: extension('SoKm', '123456') })))).toBe(
      123_456,
    );
  });

  /**
   * `123.456 km` bi tu choi thay vi doc thanh `123`: odo la MAU SO cua phep tinh tieu hao, va mot
   * con so sai o do cho ra mot dinh muc vo ly ma khong ai truy nguoc duoc.
   */
  it.each(['123.456 km', '123,456', '  ', 'khong ro'])('NORM-10 — tu choi odo `%s`', (raw) => {
    expect(findOdometerHint(parsed(invoiceWith({ extensions: extension('ODO', raw) })))).toBeNull();
  });

  it('NORM-11 — ma cua hang doc tu truong mo rong', () => {
    expect(findStationCodeHint(parsed(FIXTURE))).toBe('CH-05');
    expect(findStationCodeHint(parsed(invoiceWith({})))).toBeNull();
  });
});

describe('normalizeInvoiceCandidates', () => {
  it('NORM-12 — mot hoa don ba dong ra ba ung vien, danh tinh lap lai o tung dong', () => {
    const candidates = normalizeInvoiceCandidates({ invoice: parsed(FIXTURE), station: RESOLVED });

    expect(candidates).toHaveLength(3);
    expect(candidates.map((row) => row.lineNumber)).toEqual([1, 2, 3]);
    for (const row of candidates) {
      expect(row.sellerTaxCode).toBe('0101234567');
      expect(row.invoiceSymbol).toBe('C26TAA');
      expect(row.invoiceNo).toBe('00001234');
      expect(row.issuedDate).toBe('2026-09-05');
      // Goi y thuoc CA HOA DON, nen no lap lai o moi dong.
      expect(row.plateHintRaw).toBe('29C-123.45');
      expect(row.plateHintSource).toBe('EXTENSION_FIELD');
    }
    expect(candidates[0]?.litersUnits).toBe(62_500);
    expect(candidates[0]?.unitPriceUnits).toBe(23_000_000);
    expect(candidates[0]?.amount).toBe(1_437_500);
  });

  /**
   * `RESOLVED` la ket cuc DUY NHAT mang `stationId`. Bon ket cuc con lai la loi moi mot nguoi vao
   * quyet, va dien mot `stationId` o do se la mot lan "chon dai mot cai". DB giu bat bien nay bang
   * `CHECK TransportFuelCandidate_station_match_paired`.
   */
  it.each([
    ['AMBIGUOUS', { outcome: 'AMBIGUOUS', candidateIds: ['a', 'b'] }],
    ['SUPPLIER_MISMATCH', { outcome: 'SUPPLIER_MISMATCH', candidateIds: ['a'] }],
    ['NO_MATCH', { outcome: 'NO_MATCH' }],
    ['NO_INPUT', { outcome: 'NO_INPUT' }],
  ])('NORM-13 — ket cuc %s KHONG mang `stationId`', (outcome, station) => {
    const [row] = normalizeInvoiceCandidates({
      invoice: parsed(FIXTURE),
      station: station as FuelStationResolution,
    });
    expect(row?.stationMatch).toBe(outcome);
    expect(row?.stationId).toBeNull();
  });

  it('NORM-14 — xuat xu cua mot dong gom CA hoa don LAN dong', () => {
    const [row] = normalizeInvoiceCandidates({ invoice: parsed(FIXTURE), station: RESOLVED });
    // cua hoa don
    expect(row?.provenance.sellerTaxCode?.path).toBe('HDon/DLHDon/NDHDon/NBan/MST');
    // cua dong
    expect(row?.provenance.litersUnits?.path).toBe('HDon/DLHDon/NDHDon/DSHHDVu/HHDVu[1]/SLuong');
  });
});
