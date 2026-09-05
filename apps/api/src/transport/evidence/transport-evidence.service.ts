import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { MediaStore, type MediaObject } from '../../media/media-store.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_EVIDENCE_DECISIONS } from './evidence-decisions.js';
import {
  buildEvidenceKey,
  isTransportEvidenceLocator,
  normaliseContentType,
  rejectEvidence,
  type EvidenceRejection,
} from './evidence-policy.js';

/** Gioi han dung luong mot tep bang chung. Doc tu `MEDIA_MAX_BYTES` o tang composition. */
export const TRANSPORT_EVIDENCE_MAX_BYTES = Symbol('TRANSPORT_EVIDENCE_MAX_BYTES');

export interface StoredEvidence {
  readonly locator: string;
  readonly contentType: string;
  readonly byteSize: number;
}

/** Ket qua doc: hoac co byte, hoac mot trang thai NGHIEP VU noi ro vi sao khong co. */
export type EvidenceReadResult =
  | { readonly kind: 'FOUND'; readonly object: MediaObject }
  | { readonly kind: 'MISSING' };

/**
 * BIEN GIOI MEDIA cua bang chung van tai — `#169`.
 *
 * ===========================================================================
 * TAI SU DUNG kho co san, khong dung mot nen tang luu tru thu hai.
 *
 * `MediaStore` da co `put`/`get`/`check` va bon hien thuc (none/local/gcs/s3), duoc chon bang
 * `MEDIA_STORE` o `media.provider.ts`. Doi GCS -> OVHcloud van la doi bien moi truong, khong sua
 * mot dong nao o day. Contract cua #169 doi dung dieu do: *"audit and reuse the platform's existing
 * media storage path/adapter before creating anything Transport-specific"*.
 *
 * Byte nam o kho object; THAM CHIEU nam o Postgres (`TransportFuelReceiptEvidence.locator` va
 * `TransportTripExpense.evidenceLocator`). Khong byte anh nao vao bang quan he.
 *
 * ===========================================================================
 * Service nay KHONG biet gi ve quyen.
 *
 * No khong nhan `authUserId`, khong doc phien, khong hoi ai dang goi. Quyen so huu duoc chot o
 * controller bang chinh cong cua chung tu nghiep vu (`getMyFuelSlip` nem `SELF_FUEL_SCOPE_NOT_OWNED`
 * cho phieu cua nguoi khac). Nho vay khong co MOT phep kiem quyen THU HAI de lech voi cai thu nhat.
 */
@Injectable()
export class TransportEvidenceService {
  constructor(
    private readonly store: MediaStore,
    @Inject(TRANSPORT_EVIDENCE_MAX_BYTES) private readonly maxBytes: number,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * GHI byte vao kho va tra ve mot dinh vi DUC.
   *
   * "Duc" theo nghia: nguoi goi khong tu dat ten khoa, khong biet bucket, va khong hoc duoc gi ve
   * cau truc kho tu chuoi tra ve ngoai dung cai can de doc lai. Ten tep nguoi dung gui len KHONG
   * duoc dung — duoi tep suy tu content-type da qua danh sach trang.
   */
  async put(input: { bytes: Buffer; contentType: string }): Promise<StoredEvidence> {
    const contentType = normaliseContentType(input.contentType);
    const byteSize = input.bytes.byteLength;

    const rejection = rejectEvidence({ contentType, byteSize }, this.maxBytes);
    if (rejection) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_EVIDENCE_DECISIONS,
        point: 'evidence.upload',
        outcome: 'denied',
        reason: rejection,
        // KHONG log byte, khong log ten tep. Chi vai con so/nhan de nguoi van hanh doc duoc.
        detail: { contentType, byteSize, maxBytes: this.maxBytes },
      });
      throw TransportDomainError.invalid(rejection, this.rejectionMessage(rejection));
    }

    if (!this.store.enabled) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_EVIDENCE_DECISIONS,
        point: 'evidence.upload',
        outcome: 'denied',
        reason: 'EVIDENCE_STORE_DISABLED',
        detail: { storeName: this.store.name },
      });
      throw TransportDomainError.denied(
        'EVIDENCE_STORE_DISABLED',
        'Kho anh dang tat (MEDIA_STORE=none) — bat kho truoc khi tai bang chung len',
      );
    }

    const locator = buildEvidenceKey(randomUUID(), contentType, this.clock());
    await this.store.put(locator, input.bytes, contentType);

    this.telemetry?.decision({
      vocabulary: TRANSPORT_EVIDENCE_DECISIONS,
      point: 'evidence.upload',
      outcome: 'allowed',
      reason: 'EVIDENCE_STORED',
      detail: { locator, contentType, byteSize },
    });
    return { locator, contentType, byteSize };
  }

  /**
   * DOC byte cua mot dinh vi DA DUOC CHUNG TU NGHIEP VU XAC NHAN.
   *
   * Nguoi goi phai lay `locator` tu mot hang bang chung ma ho co quyen doc — service nay khong nhan
   * dinh vi tu than yeu cau. Nhung no VAN kiem lai pham vi: cot `locator` la chuoi TU DO va da nhan
   * gia tri tu truoc khi co duong tai len nay.
   */
  async read(locator: string): Promise<EvidenceReadResult> {
    if (!isTransportEvidenceLocator(locator)) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_EVIDENCE_DECISIONS,
        point: 'evidence.read',
        outcome: 'denied',
        reason: 'EVIDENCE_LOCATOR_OUT_OF_SCOPE',
        detail: { locator },
      });
      throw TransportDomainError.denied(
        'EVIDENCE_LOCATOR_OUT_OF_SCOPE',
        'Dinh vi nay khong thuoc khu bang chung van tai',
      );
    }

    const object = this.store.enabled ? await this.store.get(locator) : null;
    if (!object) {
      // KHONG nem: "co dong nhung khong con tep" la mot trang thai NGHIEP VU (acceptance 9), va
      // giao dien phai noi duoc dieu do thay vi hien mot loi cua SDK luu tru.
      this.telemetry?.decision({
        vocabulary: TRANSPORT_EVIDENCE_DECISIONS,
        point: 'evidence.read',
        outcome: 'denied',
        reason: 'EVIDENCE_OBJECT_MISSING',
        detail: { locator, storeName: this.store.name },
      });
      return { kind: 'MISSING' };
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_EVIDENCE_DECISIONS,
      point: 'evidence.read',
      outcome: 'allowed',
      reason: 'EVIDENCE_SERVED',
      detail: { locator, contentType: object.contentType, byteSize: object.body.byteLength },
    });
    return { kind: 'FOUND', object };
  }

  private rejectionMessage(rejection: EvidenceRejection): string {
    switch (rejection) {
      case 'EVIDENCE_EMPTY':
        return 'Tep rong — khong co gi de luu';
      case 'EVIDENCE_TOO_LARGE':
        return `Tep vuot gioi han ${this.maxBytes} byte`;
      case 'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED':
        return 'Chi nhan anh JPEG/PNG/WebP hoac tep PDF';
    }
  }
}
