import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import type { NormalizedCandidate } from './fuel-candidate-normalize.js';
import {
  FuelDocumentRepository,
  type FuelDocumentQuery,
  type RecordFuelDocumentInput,
} from './fuel-document.repository.js';
import type { FuelCandidate, FuelDocument, FuelDocumentDetail } from './fuel-document.types.js';
import type { EInvoiceProvenance } from './fuel-einvoice-parse.js';
import type { ExtractionConfidence } from './fuel-receipt-extraction.js';
import { LITERS_SCALE } from './fuel-quantity.js';

/**
 * Ban Prisma cua kho chung tu nguon (Lane C / C2).
 *
 * ===========================================================================
 * `recordDocument` LA MOT GIAO DICH, va do la bat bien duy nhat cua tep nay.
 *
 * Mot chung tu `PARSED` phai ra doi CUNG cac ung vien cua no. Neu tach lam hai lan ghi, mot lan
 * hong o giua se de lai mot chung tu noi "co 3 ung vien" ma bang ung vien khong co hang nao — va
 * `CHECK TransportFuelDocument_candidate_count_matches_status` se tu choi no, tuc duong ghi do
 * khong bao gio chay duoc den cuoi. Mot giao dich la cach dung, khong phai mot toi uu.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const iso = (value: Date): string => value.toISOString();

/**
 * SO NGUYEN TY LE 3 <-> `DECIMAL(12,3)`.
 *
 * Dung chung mot ty le voi so lit (`LITERS_SCALE`) cho CA don gia: nho vay `so lit x don gia` khop
 * chinh xac voi `thanh tien` ma khong qua mot phep lam tron nao. Di qua CHUOI chu khong qua
 * `Number`: mot `Decimal` cua Prisma doi sang `number` roi doi lai se mat chu so cuoi o nhung gia
 * tri lon, va mat chu so cuoi cua mot don gia la lech tien.
 */
const scaledToDecimal = (units: number | null): string | null => {
  if (units === null) return null;
  const text = String(units).padStart(LITERS_SCALE + 1, '0');
  return `${text.slice(0, text.length - LITERS_SCALE)}.${text.slice(text.length - LITERS_SCALE)}`;
};

const decimalToScaled = (stored: { toString(): string } | null | undefined): number | null => {
  if (stored === null || stored === undefined) return null;
  const [whole = '0', fraction = ''] = String(stored).split('.');
  return Number(`${whole}${fraction.slice(0, LITERS_SCALE).padEnd(LITERS_SCALE, '0')}`);
};

const toDocument = (row: any): FuelDocument => ({
  id: row.id,
  kind: row.kind,
  sourceRef: row.sourceRef,
  contentDigest: row.contentDigest,
  byteSize: row.byteSize,
  sellerTaxCodeRaw: row.sellerTaxCodeRaw,
  supplierId: row.supplierId,
  status: row.status,
  rejectReason: row.rejectReason,
  duplicateOfId: row.duplicateOfId,
  candidateCount: row.candidateCount,
  receivedAt: iso(row.receivedAt),
  receivedBy: row.receivedBy,
});

const toCandidate = (row: any): FuelCandidate => ({
  id: row.id,
  documentId: row.documentId,
  lineNumber: row.lineNumber,
  sellerTaxCode: row.sellerTaxCode,
  invoiceSymbol: row.invoiceSymbol,
  invoiceNo: row.invoiceNo,
  invoiceTemplate: row.invoiceTemplate,
  sellerName: row.sellerName,
  stationLabelRaw: row.stationLabelRaw,
  stationId: row.stationId,
  stationMatch: row.stationMatch,
  issuedDate: row.issuedDate,
  issuedTimeRaw: row.issuedTimeRaw,
  litersUnits: decimalToScaled(row.liters),
  unitPriceUnits: decimalToScaled(row.unitPrice),
  amount: fromStoredAmount(row.amount ?? null),
  currencyCode: row.currencyCode,
  itemName: row.itemName,
  unitRaw: row.unitRaw,
  plateHintRaw: row.plateHintRaw,
  plateHintSource: row.plateHintSource,
  odometerHintKm: row.odometerHintKm,
  provenance: (row.provenance ?? {}) as EInvoiceProvenance,
  // `?? null` chu KHONG `?? {}`: mot bang muc tin RONG va "khong co khai niem muc tin" la hai
  // dieu khac nhau, va cot nay la cho duy nhat phan biet duoc chung.
  confidence: (row.confidence ?? null) as ExtractionConfidence | null,
  createdAt: iso(row.createdAt),
});

const candidateData = (candidate: NormalizedCandidate) => ({
  lineNumber: candidate.lineNumber,
  sellerTaxCode: candidate.sellerTaxCode,
  invoiceSymbol: candidate.invoiceSymbol,
  invoiceNo: candidate.invoiceNo,
  invoiceTemplate: candidate.invoiceTemplate,
  sellerName: candidate.sellerName,
  stationLabelRaw: candidate.stationLabelRaw,
  stationId: candidate.stationId,
  stationMatch: candidate.stationMatch,
  issuedDate: candidate.issuedDate,
  issuedTimeRaw: candidate.issuedTimeRaw,
  liters: scaledToDecimal(candidate.litersUnits),
  unitPrice: scaledToDecimal(candidate.unitPriceUnits),
  amount: toStoredAmount(candidate.amount),
  currencyCode: candidate.currencyCode,
  itemName: candidate.itemName,
  unitRaw: candidate.unitRaw,
  plateHintRaw: candidate.plateHintRaw,
  plateHintSource: candidate.plateHintSource,
  odometerHintKm: candidate.odometerHintKm,
  provenance: candidate.provenance,
  confidence: candidate.confidence ?? undefined,
});

const model = (client: unknown, name: string): any => (client as Record<string, any>)[name];

@Injectable()
export class PrismaFuelDocumentRepository extends FuelDocumentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByDigest(contentDigest: string): Promise<FuelDocument | null> {
    const row = await model(this.prisma, 'transportFuelDocument').findUnique({
      where: { contentDigest },
    });
    return row ? toDocument(row) : null;
  }

  async findDocumentByInvoice(input: {
    readonly sellerTaxCode: string;
    readonly invoiceSymbol: string;
    readonly invoiceNo: string;
  }): Promise<FuelDocument | null> {
    // Doc qua UNG VIEN chu khong qua chung tu: danh tinh hoa don song tren ung vien, va chi so
    // unique `(sellerTaxCode, invoiceSymbol, invoiceNo, lineNumber)` phuc vu dung cau nay.
    const candidate = await model(this.prisma, 'transportFuelCandidate').findFirst({
      where: {
        sellerTaxCode: input.sellerTaxCode,
        invoiceSymbol: input.invoiceSymbol,
        invoiceNo: input.invoiceNo,
      },
      select: { documentId: true },
    });
    return candidate ? this.findDocument(candidate.documentId) : null;
  }

  async findDocument(id: string): Promise<FuelDocument | null> {
    const row = await model(this.prisma, 'transportFuelDocument').findUnique({ where: { id } });
    return row ? toDocument(row) : null;
  }

  async listDocuments(query: FuelDocumentQuery): Promise<FuelDocument[]> {
    const rows: any[] = await model(this.prisma, 'transportFuelDocument').findMany({
      where: {
        ...(query.supplierId === null ? {} : { supplierId: query.supplierId }),
        ...(query.status === null ? {} : { status: query.status }),
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
      skip: query.offset,
      take: query.limit,
    });
    return rows.map(toDocument);
  }

  async listCandidates(documentId: string): Promise<FuelCandidate[]> {
    const rows: any[] = await model(this.prisma, 'transportFuelCandidate').findMany({
      where: { documentId },
      orderBy: { lineNumber: 'asc' },
    });
    return rows.map(toCandidate);
  }

  async recordDocument(input: RecordFuelDocumentInput): Promise<FuelDocumentDetail> {
    return (this.prisma as any).$transaction(async (tx: unknown) => {
      const document = await model(tx, 'transportFuelDocument').create({
        data: {
          kind: input.kind,
          sourceRef: input.sourceRef,
          contentDigest: input.contentDigest,
          byteSize: input.byteSize,
          sellerTaxCodeRaw: input.sellerTaxCodeRaw,
          supplierId: input.supplierId,
          status: input.status,
          rejectReason: input.rejectReason,
          duplicateOfId: input.duplicateOfId,
          candidateCount: input.candidates.length,
          receivedAt: input.at,
          receivedBy: input.receivedBy,
          candidates: { create: input.candidates.map(candidateData) },
        },
      });

      const candidates: any[] = await model(tx, 'transportFuelCandidate').findMany({
        where: { documentId: document.id },
        orderBy: { lineNumber: 'asc' },
      });
      return { document: toDocument(document), candidates: candidates.map(toCandidate) };
    });
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
