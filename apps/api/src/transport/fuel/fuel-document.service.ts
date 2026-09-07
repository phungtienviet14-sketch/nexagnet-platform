import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { toBusinessDate } from '../business-date.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  findStationCodeHint,
  normalizeInvoiceCandidates,
  stationLabelOf,
  type NormalizedCandidate,
} from './fuel-candidate-normalize.js';
import { TRANSPORT_FUEL_DECISIONS, type TransportFuelDecisionReason } from './fuel-decisions.js';
import { assessFuelCandidate } from './fuel-candidate-validation.js';
import { FuelDocumentRepository, type FuelDocumentQuery } from './fuel-document.repository.js';
import type {
  FuelDocument,
  FuelDocumentDetail,
  FuelDocumentRejectReason,
  FuelDocumentReview,
  FuelDocumentStatus,
} from './fuel-document.types.js';
import type { ParsedInvoice } from './fuel-einvoice-parse.js';
import { FuelInvoiceSource, invoiceDigest, type FuelInvoiceFile } from './fuel-invoice-source.js';
import { FuelStationService } from './fuel-station.service.js';
import { TransportFuelCoreFacts } from './fuel.ports.js';
import { FuelRepository } from './fuel.repository.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { normalizePlate } from './fuel-statement-mapping.js';

/**
 * NHAP MOT CHUNG TU NHIEN LIEU CO CAU TRUC — service cua C2 (Issue #236).
 *
 * ===========================================================================
 * `INV-C2-NOMONEY` — SERVICE NAY KHONG TINH MOT DONG TIEN NAO
 *
 * No khong duoc tiem `FuelCostingPort`, khong duoc tiem `CostingService`, va khong goi mot ham nao
 * cua `fuel-settlement.ts`. "Doc ra duoc" khong phai "da la su that tai chinh": mot ung vien khong
 * co chan gia thanh, khong vao doi soat, khong vao ban giao cong no. Duong tu ung vien sang mot
 * phieu do dau THAT phai di qua mot NGUOI — va no khong the tu di duoc, vi
 * `TransportFuelEntry.vehicleId` la `NOT NULL` con hoa don thi khong noi duoc xe nao (xem khoi dau
 * `fuel-candidate-normalize.ts`).
 *
 * ===========================================================================
 * BON KET CUC CUA MOT LAN NHAP, VA KHONG CAI NAO IM LANG
 *
 * ```text
 * bam byte -> dung tep nay da nhap?      -> DOCUMENT_IDEMPOTENT_REPLAY  (khong ghi gi)
 *          -> doc duoc khong?            -> DOCUMENT_REJECTED           (ghi hang REJECTED co ly do)
 *          -> hoa don da vao he thong?   -> DOCUMENT_DUPLICATE_INVOICE  (ghi hang DUPLICATE co soi day)
 *          -> con lai                    -> DOCUMENT_PARSED             (ghi chung tu + ung vien)
 * ```
 *
 * Chung tu bi tu choi VAN duoc luu. Neu mot tep hong bi bo di khong dau vet, nguoi doi soat thay
 * mot thang thieu chung tu ma khong biet thieu bao nhieu — con so ma mot bo loc im lang lay mat.
 */

type DocumentDecisionPoint = 'fuel_document.ingest' | 'fuel_document.supplier_link';

/** Phan than cua mot lan ghi, sau khi da quyet ket cuc. */
interface RecordOutcome {
  readonly sellerTaxCodeRaw: string | null;
  readonly supplierId: string | null;
  readonly status: FuelDocumentStatus;
  readonly rejectReason: FuelDocumentRejectReason | null;
  readonly duplicateOfId: string | null;
  readonly candidates: readonly NormalizedCandidate[];
}

@Injectable()
export class FuelDocumentService {
  constructor(
    private readonly documents: FuelDocumentRepository,
    private readonly source: FuelInvoiceSource,
    private readonly stations: FuelStationService,
    private readonly fuel: FuelRepository,
    private readonly core: TransportFuelCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  async ingest(file: FuelInvoiceFile, actor: string): Promise<FuelDocumentDetail> {
    const contentDigest = invoiceDigest(file.content);

    // LOP MOT cua `INV-C2-DUP`: dung tep nay da nhap chua. Kiem TRUOC khi doc, nen mot tep gui lai
    // lan hai khong ton mot lan phan tich nao — va quan trong hon, khong ghi mot hang nao.
    const replayed = await this.documents.findByDigest(contentDigest);
    if (replayed) {
      this.decide('fuel_document.ingest', 'allowed', 'DOCUMENT_IDEMPOTENT_REPLAY', {
        documentId: replayed.id,
      });
      return this.detailOf(replayed);
    }

    const read = this.source.read(file);
    if (!read.ok) {
      this.decide('fuel_document.ingest', 'denied', 'DOCUMENT_REJECTED', {
        sourceRef: file.sourceRef,
        rejectReason: read.reason,
      });
      return this.record(file, contentDigest, actor, {
        sellerTaxCodeRaw: null,
        supplierId: null,
        status: 'REJECTED',
        rejectReason: read.reason,
        duplicateOfId: null,
        candidates: [],
      });
    }

    const invoice = read.invoice;
    const supplierId = await this.linkSupplier(invoice);

    // LOP HAI cua `INV-C2-DUP`: cung mot HOA DON den bang mot tep khac. Kiem TRUOC khi ghi de duong
    // tra ve mang mot ma co ten thay vi mot loi unique tho cua Postgres. Khoa unique o tang kho van
    // o do lam luoi thu hai — no la thu duy nhat con dung neu hai lan nhap chay dong thoi.
    const twin = await this.documents.findDocumentByInvoice({
      sellerTaxCode: invoice.sellerTaxCode,
      invoiceSymbol: invoice.symbol,
      invoiceNo: invoice.number,
    });
    if (twin) {
      this.decide('fuel_document.ingest', 'denied', 'DOCUMENT_DUPLICATE_INVOICE', {
        duplicateOfId: twin.id,
        invoiceSymbol: invoice.symbol,
        invoiceNo: invoice.number,
      });
      return this.record(file, contentDigest, actor, {
        sellerTaxCodeRaw: invoice.sellerTaxCode,
        supplierId,
        status: 'DUPLICATE',
        rejectReason: null,
        duplicateOfId: twin.id,
        candidates: [],
      });
    }

    const station = await this.stations.resolveStation({
      supplierId,
      code: findStationCodeHint(invoice),
      label: stationLabelOf(invoice),
    });
    const candidates = normalizeInvoiceCandidates({ invoice, station });

    const detail = await this.record(file, contentDigest, actor, {
      sellerTaxCodeRaw: invoice.sellerTaxCode,
      supplierId,
      status: 'PARSED',
      rejectReason: null,
      duplicateOfId: null,
      candidates,
    });
    this.decide('fuel_document.ingest', 'allowed', 'DOCUMENT_PARSED', {
      documentId: detail.document.id,
      candidateCount: candidates.length,
      stationMatch: station.outcome,
    });
    return detail;
  }

  async documentDetail(id: string): Promise<FuelDocumentDetail> {
    const document = await this.documents.findDocument(id);
    if (!document) {
      throw TransportDomainError.notFound('FUEL_DOCUMENT_NOT_FOUND', `Khong co chung tu ${id}`);
    }
    return this.detailOf(document);
  }

  listDocuments(query: FuelDocumentQuery): Promise<FuelDocument[]> {
    return this.documents.listDocuments(query);
  }

  /**
   * MOT CHUNG TU KEM MOI DIEU KHONG ON CUA TUNG DONG — duong doc cua man hinh ra soat (C4).
   *
   * PHAT HIEN DUOC TINH LUC DOC, KHONG DUOC LUU. Chung suy ra TAT DINH tu mot ung vien bat bien
   * cong voi danh muc HIEN TAI; luu lai se tao ra mot su that thu hai, va su that thu hai bat dau
   * troi khoi su that thu nhat ngay lan dau ai do sua danh muc xe hay noi lai nha cung cap.
   *
   * Doc CA danh sach xe roi so tren ban DA CHUAN HOA: doi xe cua mot khach van tai la mot con so
   * nho co gioi han that (cung ly le voi `listVehicles()` o `fuel.ports.ts`), va bien so tren
   * chung tu viet du kieu (`29C-123.45`, `29C 12345`).
   */
  async documentReview(id: string): Promise<FuelDocumentReview> {
    const detail = await this.documentDetail(id);
    const vehicles = await this.core.listVehicles();
    const fleetPlates = new Set(
      vehicles.map((vehicle) => normalizePlate(vehicle.registrationPlate)),
    );
    const today = toBusinessDate(new Date(), this.corePolicy.timeZone);

    return {
      document: detail.document,
      candidates: detail.candidates.map((candidate) => ({
        candidate,
        assessment: assessFuelCandidate({
          candidate,
          supplierLinked: detail.document.supplierId !== null,
          fleetPlates,
          today,
        }),
      })),
    };
  }

  /* ---------------------------- Noi bo ---------------------------- */

  /**
   * NOI CHUNG TU VOI MOT NHA CUNG CAP THEO MA SO THUE — hoac de trong, CO TEN.
   *
   * `TransportFuelSupplier.taxCode` KHONG co rang buoc duy nhat, nen hai ho so cung mot ma so thue
   * la mot tinh trang co that (danh muc bi nhap trung). Chon dai mot cai se noi chung tu vao nham
   * ho so, va sai lech do khong bao gio lo ra o mot chung tu don le — no lo ra khi cong no cua mot
   * cay xang lech, sau khi da bao cao.
   *
   * Doc CA DANH SACH roi loc: mot khach van tai co vai nha cung cap nhien lieu, tuc mot con so nho
   * co gioi han that — cung ly le voi `listVehicles()` o `fuel.ports.ts`.
   */
  private async linkSupplier(invoice: ParsedInvoice): Promise<string | null> {
    const suppliers = await this.fuel.listSuppliers();
    const matched = suppliers.filter((supplier) => supplier.taxCode === invoice.sellerTaxCode);

    const only = matched[0];
    if (matched.length === 1 && only) {
      this.decide('fuel_document.supplier_link', 'allowed', 'SUPPLIER_LINKED', {
        supplierId: only.id,
      });
      return only.id;
    }

    this.decide(
      'fuel_document.supplier_link',
      'denied',
      matched.length === 0 ? 'SUPPLIER_TAX_CODE_UNKNOWN' : 'SUPPLIER_TAX_CODE_AMBIGUOUS',
      { matchedCount: matched.length },
    );
    return null;
  }

  private async record(
    file: FuelInvoiceFile,
    contentDigest: string,
    actor: string,
    outcome: RecordOutcome,
  ): Promise<FuelDocumentDetail> {
    const detail = await this.documents.recordDocument({
      kind: file.kind,
      sourceRef: file.sourceRef,
      contentDigest,
      byteSize: file.content.byteLength,
      receivedBy: actor,
      at: new Date(),
      ...outcome,
    });

    await this.audit.append({
      actor,
      action: 'transport.fuel_document.ingest',
      entityType: 'TransportFuelDocument',
      entityId: detail.document.id,
      before: null,
      after: detail.document,
    });
    return detail;
  }

  private async detailOf(document: FuelDocument): Promise<FuelDocumentDetail> {
    return { document, candidates: await this.documents.listCandidates(document.id) };
  }

  private decide(
    point: DocumentDecisionPoint,
    outcome: 'allowed' | 'denied',
    reason: TransportFuelDecisionReason,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point,
      outcome,
      reason,
      detail,
    });
  }
}
