import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import type { ParsedInvoice } from './fuel-einvoice-parse.js';
import {
  CONFIDENCE_SCALE,
  FIELD_CONFIDENCE_FLOOR,
  FuelReceiptExtractionPort,
  type FuelReceiptExtractionResult,
  type FuelReceiptImage,
} from './fuel-receipt-extraction.js';
import { guardReceiptImage } from './fuel-receipt-image.js';

/**
 * BO DOC ANH TAT DINH, KHONG RA KHOI MAY — mac dinh cua CI va cua ban demo (C3).
 *
 * ===========================================================================
 * NO KHONG DOC ANH, VA TEN NO NOI DIEU DO
 *
 * `Stub` chu khong `Local`, khong `Simple`, khong `Basic`: ba tu sau deu goi y rang no CO doc, chi
 * la doc kem hon. No khong doc gi ca — no sinh ra mot ket qua tu BAM cua byte. Mot ngay nao do co
 * nguoi bat nham no o ban chay that, va luc do cai ten la thu duy nhat con canh bao ho.
 *
 * Ly le ton tai giong het `MockParser` cua duong don hang: CI phai chay duoc khong mang, khong khoa,
 * khong hoa don tien; va mot ban demo phai cho ra CUNG mot man hinh o moi lan chay.
 *
 * ===========================================================================
 * MUC TIN CO Y KHONG PHAI 1000
 *
 * Neu bo nay tra ve muc tin tuyet doi cho moi o, thi tren ban demo se KHONG BAO GIO thay duoc duong
 * "muc tin thap" cua C4 — va mot duong khong ai nhin thay la mot duong khong ai kiem.
 *
 * Nen mot o — `unitPriceMilli` cua dong dau — luon nam DUOI san. Do la o dung de nhin: don gia sai
 * thi thanh tien sai theo, nen no la o ma phep kiem so hoc cua C4 se noi to nhat.
 */

/** Mot ma so thue hop le ve khuon nhung KHONG thuoc ai — cho de nhan ra day la du lieu dung tam. */
const STUB_TAX_CODE = '0100000000';
const STUB_STATION = 'CUA HANG XANG DAU SO 1';

/** 62,5 lit x 23 000 d/lit = 1 437 500 d — dung khop, nen `ARITHMETIC_MISMATCH` khong noi bay. */
const STUB_LITERS_MILLI = 62_500;
const STUB_UNIT_PRICE_MILLI = 23_000_000;
const STUB_AMOUNT_VND = 1_437_500;

const digestOf = (content: Buffer): string =>
  createHash('sha256').update(content).digest('hex').slice(0, 8).toUpperCase();

@Injectable()
export class StubFuelReceiptExtractor extends FuelReceiptExtractionPort {
  readonly model = 'stub';

  extract(image: FuelReceiptImage): Promise<FuelReceiptExtractionResult> {
    // Kiem ranh gioi chay Y HET duong that. Neu bo nay bo qua phep kiem, thi moi bai test dung no
    // se khang dinh mot he thong DE DAI hon he thong that — va dieu do te hon la khong test.
    const guard = guardReceiptImage(image);
    if (!guard.ok) return Promise.resolve({ ok: false, reason: guard.reason });

    return Promise.resolve({
      ok: true,
      invoice: stubInvoice(digestOf(image.content)),
      confidence: {
        sellerTaxCode: CONFIDENCE_SCALE,
        invoiceSymbol: CONFIDENCE_SCALE,
        invoiceNo: CONFIDENCE_SCALE,
        issuedAt: CONFIDENCE_SCALE,
        'line.1.litersMilli': CONFIDENCE_SCALE,
        'line.1.unitPriceMilli': FIELD_CONFIDENCE_FLOOR - 1,
        'line.1.amountVnd': CONFIDENCE_SCALE,
      },
      model: this.model,
    });
  }
}

/**
 * So hoa don lay tu BAM cua byte, khong tu mot bien dem.
 *
 * Nho vay hai buc anh khac nhau cho hai hoa don khac nhau (ban demo thay duoc nhieu chung tu), con
 * CUNG mot buc anh luon cho CUNG mot so — nen lop chong nhap trung theo danh tinh hoa don
 * (`INV-C2-DUP`) van do duoc bang bo nay, khong doi mot bo doc that.
 */
function stubInvoice(suffix: string): ParsedInvoice {
  const provenance = (key: string, raw: string) => ({ [key]: { path: key, raw } });
  const invoiceNo = `S${suffix}`;

  return {
    template: null,
    symbol: 'C26TAA',
    number: invoiceNo,
    issuedDate: '2026-09-01' as BusinessDate,
    issuedTimeRaw: '08:30:00',
    currencyCode: 'VND',
    sellerName: STUB_STATION,
    sellerTaxCode: STUB_TAX_CODE,
    sellerAddress: null,
    buyerName: null,
    buyerTaxCode: null,
    lines: [
      {
        lineNumber: 1,
        itemName: 'Dau DO 0,05S-II',
        unit: 'Lit',
        litersUnits: STUB_LITERS_MILLI,
        unitPriceUnits: STUB_UNIT_PRICE_MILLI,
        amount: STUB_AMOUNT_VND,
        taxRateRaw: null,
        provenance: {
          ...provenance('line.1.litersMilli', String(STUB_LITERS_MILLI)),
          ...provenance('line.1.unitPriceMilli', String(STUB_UNIT_PRICE_MILLI)),
          ...provenance('line.1.amountVnd', String(STUB_AMOUNT_VND)),
        },
      },
    ],
    extensions: {},
    provenance: {
      ...provenance('sellerTaxCode', STUB_TAX_CODE),
      ...provenance('invoiceSymbol', 'C26TAA'),
      ...provenance('invoiceNo', invoiceNo),
      ...provenance('issuedAt', '2026-09-01T08:30:00'),
    },
  };
}
