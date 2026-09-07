import { randomUUID } from 'node:crypto';
import type { NormalizedCandidate } from './fuel-candidate-normalize.js';
import type {
  FuelCandidate,
  FuelDocument,
  FuelDocumentDetail,
  FuelDocumentKind,
  FuelDocumentRejectReason,
  FuelDocumentStatus,
} from './fuel-document.types.js';

/**
 * Kho cua CHUNG TU NGUON + UNG VIEN (Lane C / C2).
 *
 * ===========================================================================
 * BA DIEU KHO NAY KHONG CO, va moi dieu la mot bat bien duoc giu bang HINH DANG API:
 *
 *   1. KHONG `updateCandidate`. Mot ung vien la anh chup cua MOT lan doc mot chung tu; sua no
 *      nghia la noi doi ve viec chung tu da noi gi. Duong dung khi doc sai la sua BO DOC roi nhap
 *      lai — va vi phep doc TAT DINH, lan nhap lai cho ra dung bo ung vien moi.
 *
 *   2. KHONG mot ham nao ghi vao bang phieu/bang ke/doi soat. `INV-C2-NOMONEY`: mot ung vien
 *      khong dung toi mot dong tien nao. Duong tu ung vien sang mot phieu that phai di qua MOT
 *      NGUOI, va duong do thuoc mot tranche sau.
 *
 *   3. KHONG `recordDocument` roi `recordCandidates` rieng. Mot lan nhap phai NGUYEN TU: mot chung
 *      tu `PARSED` khong co ung vien nao la mot hang noi doi, va `CHECK
 *      TransportFuelDocument_candidate_count_matches_status` se tu choi no o tang DB.
 */

export interface RecordFuelDocumentInput {
  readonly kind: FuelDocumentKind;
  readonly sourceRef: string;
  readonly contentDigest: string;
  readonly byteSize: number;
  readonly sellerTaxCodeRaw: string | null;
  readonly supplierId: string | null;
  readonly status: FuelDocumentStatus;
  readonly rejectReason: FuelDocumentRejectReason | null;
  readonly duplicateOfId: string | null;
  readonly candidates: readonly NormalizedCandidate[];
  readonly receivedBy: string;
  readonly at: Date;
}

export interface FuelDocumentQuery {
  readonly supplierId: string | null;
  readonly status: FuelDocumentStatus | null;
  readonly limit: number;
  readonly offset: number;
}

export abstract class FuelDocumentRepository {
  /** Dau van tay BYTE — khoa chong nhap trung lop mot (`INV-C2-DUP`). */
  abstract findByDigest(contentDigest: string): Promise<FuelDocument | null>;
  /**
   * Hoa don nay DA vao he thong chua — khoa chong nhap trung lop HAI.
   *
   * Tra loi cho truong hop ma dau van tay byte khong bat duoc: CUNG mot hoa don den bang HAI TEP
   * khac nhau (ban goc va mot ban ky lai, hay mot ban ket xuat lai tu cong cua nha cung cap).
   */
  abstract findDocumentByInvoice(input: {
    readonly sellerTaxCode: string;
    readonly invoiceSymbol: string;
    readonly invoiceNo: string;
  }): Promise<FuelDocument | null>;

  abstract findDocument(id: string): Promise<FuelDocument | null>;
  abstract listDocuments(query: FuelDocumentQuery): Promise<FuelDocument[]>;
  abstract listCandidates(documentId: string): Promise<FuelCandidate[]>;

  /** Ghi chung tu VA cac ung vien cua no trong MOT lan ghi nguyen tu. */
  abstract recordDocument(input: RecordFuelDocumentInput): Promise<FuelDocumentDetail>;
}

const clone = <T>(row: T): T => structuredClone(row);

/**
 * Ban trong bo nho — duong chay cua `PERSISTENCE=memory` (demo/CI khong can CSDL).
 *
 * PHAI cuong che cung mot bat bien voi ban Prisma. O day co HAI, va ca hai deu la khoa chong nhap
 * trung: `contentDigest` duy nhat, va `(sellerTaxCode, invoiceSymbol, invoiceNo, lineNumber)` duy
 * nhat. Neu chi ban Prisma giu chung, moi bai test chay tren bo nho se xanh cho mot lan nhap doi
 * ma DB that se tu choi.
 */
export class InMemoryFuelDocumentRepository extends FuelDocumentRepository {
  private readonly documents = new Map<string, FuelDocument>();
  private readonly candidates = new Map<string, FuelCandidate[]>();

  async findByDigest(contentDigest: string): Promise<FuelDocument | null> {
    const row = [...this.documents.values()].find((doc) => doc.contentDigest === contentDigest);
    return row ? clone(row) : null;
  }

  async findDocumentByInvoice(input: {
    readonly sellerTaxCode: string;
    readonly invoiceSymbol: string;
    readonly invoiceNo: string;
  }): Promise<FuelDocument | null> {
    for (const [documentId, rows] of this.candidates) {
      const hit = rows.some(
        (row) =>
          row.sellerTaxCode === input.sellerTaxCode &&
          row.invoiceSymbol === input.invoiceSymbol &&
          row.invoiceNo === input.invoiceNo,
      );
      if (hit) {
        const document = this.documents.get(documentId);
        if (document) return clone(document);
      }
    }
    return null;
  }

  async findDocument(id: string): Promise<FuelDocument | null> {
    const row = this.documents.get(id);
    return row ? clone(row) : null;
  }

  async listDocuments(query: FuelDocumentQuery): Promise<FuelDocument[]> {
    return [...this.documents.values()]
      .filter((doc) => query.supplierId === null || doc.supplierId === query.supplierId)
      .filter((doc) => query.status === null || doc.status === query.status)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || a.id.localeCompare(b.id))
      .slice(query.offset, query.offset + query.limit)
      .map(clone);
  }

  async listCandidates(documentId: string): Promise<FuelCandidate[]> {
    return (this.candidates.get(documentId) ?? []).map(clone);
  }

  async recordDocument(input: RecordFuelDocumentInput): Promise<FuelDocumentDetail> {
    if (await this.findByDigest(input.contentDigest)) {
      throw new Error('TransportFuelDocument_contentDigest_key');
    }
    for (const candidate of input.candidates) {
      if (await this.findDocumentByInvoice(candidate)) {
        throw new Error('TransportFuelCandidate_invoice_line_key');
      }
    }

    const at = input.at.toISOString();
    const document: FuelDocument = {
      id: randomUUID(),
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
      receivedAt: at,
      receivedBy: input.receivedBy,
    };

    const rows: FuelCandidate[] = input.candidates.map((candidate) => ({
      ...candidate,
      id: randomUUID(),
      documentId: document.id,
      createdAt: at,
    }));

    this.documents.set(document.id, document);
    this.candidates.set(document.id, rows);
    return { document: clone(document), candidates: rows.map(clone) };
  }
}
