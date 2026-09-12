import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { TransportCheckpointCoreFacts } from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import type { RunCheckpoint } from '../checkpoint/checkpoint.types.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_DOCUMENT_DECISIONS,
  type DocumentRecordReason,
  type DocumentWithdrawReason,
  type TransportDocumentDecisionReason,
} from './document-decisions.js';
import {
  TransportDocumentCoreFacts,
  TransportDocumentSiteFacts,
} from './document-facts.port.js';
import { TransportDocumentFilePort } from './document-file.port.js';
import { evaluateDocumentRecord, evaluateDocumentWithdraw } from './document-lifecycle.js';
import {
  DOCUMENT_CLIENT_EVENT,
  DOCUMENT_FILE_ONCE,
  DocumentAlreadyWithdrawnError,
  OperationalDocumentRepository,
} from './document.repository.js';
import type {
  OperationalDocument,
  RecordDocumentCommand,
  WithdrawDocumentCommand,
} from './document.types.js';
import { PhysicalReceiptHandoverRepository } from './handover.repository.js';

/**
 * CHUNG TU VAN HANH — `#279` O1/O2/O3.
 *
 * ============================================================================================
 * BA THU KHONG BAO GIO DEN TU THAN YEU CAU
 * ============================================================================================
 *
 *   · `driverId`   — den tu PHIEN dang nhap (`Driver.authUserId`);
 *   · `orderId`    — den tu CHANG ma lai xe dang chay;
 *   · `receivedAt` — den tu DONG HO MAY CHU.
 *
 * Truong thu hai la quan trong nhat, va no la cong cho `#279` O13 bai 8: neu ben goi khai duoc
 * `orderId` thi ho gan duoc mot to bien nhan cua don nay sang don khac — va Lane K se doc no nhu
 * mot can cu hop le de bam `Da ket thuc`.
 *
 * ============================================================================================
 * MA TEP DUOC HOI, KHONG DUOC TIN
 * ============================================================================================
 *
 * `#279` O12: *"foreign/unknown File IDs fail closed"*, va O2: *"withdrawn/quarantined file cannot
 * silently satisfy a later acceptance decision"*.
 *
 * Nen moi lenh khai can cu `DIGITAL_FILE` deu di qua `TransportDocumentFilePort`, va ba ket qua cua
 * cong do dan den ba ma khac nhau. Khi `#287` chua vao `main`, cong tra `UNAVAILABLE` cho MOI ma —
 * duong chung tu giay (`EXTERNAL_PHYSICAL`) van di duoc, va do la duong DUNG cho hom nay.
 */
@Injectable()
export class OperationalDocumentService {
  constructor(
    private readonly documents: OperationalDocumentRepository,
    private readonly handovers: PhysicalReceiptHandoverRepository,
    private readonly checkpoints: CheckpointRepository,
    private readonly core: TransportDocumentCoreFacts,
    private readonly identity: TransportCheckpointCoreFacts,
    private readonly sites: TransportDocumentSiteFacts,
    private readonly files: TransportDocumentFilePort,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /** Duong cua LAI XE — danh tinh tu phien, quyen tu phan cong. */
  async recordAsDriver(command: RecordDocumentCommand): Promise<OperationalDocument> {
    const driver = await this.identity.findDriverByAuthUserId(command.authUserId);
    if (!driver) {
      this.deny('document.record', 'DOCUMENT_DRIVER_BINDING_MISSING', {
        authUserId: command.authUserId,
      });
      throw TransportDomainError.denied(
        'DOCUMENT_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }

    const replayed = await this.documents.findByEvent(
      command.runId,
      command.type,
      command.clientEventId,
    );
    if (replayed) {
      this.allow('document.record', 'DOCUMENT_REPLAYED', { documentId: replayed.id });
      return replayed;
    }

    const run = await this.core.findRun(command.runId);
    if (!run) {
      this.deny('document.record', 'DOCUMENT_RUN_NOT_FOUND', { runId: command.runId });
      throw TransportDomainError.notFound('DOCUMENT_RUN_NOT_FOUND', 'Khong tim thay vong chay');
    }
    if (!(await this.identity.wasDriverEverAssignedToRun(run.id, driver.id))) {
      this.deny('document.record', 'DOCUMENT_DRIVER_NOT_ASSIGNED', { runId: run.id });
      throw TransportDomainError.denied(
        'DOCUMENT_DRIVER_NOT_ASSIGNED',
        `Lai xe ${driver.fullName} chua tung duoc phan cong vao vong chay ${run.code}`,
      );
    }

    return this.append(command, run.status, driver.id);
  }

  /**
   * Duong cua VAN HANH — ghi bu mot chung tu lai xe khong ghi duoc (het pin, mat song ca ngay).
   *
   * KHONG kem `driverId`, va do la mot khang dinh chu khong mot thieu sot: nguoi ngoi o van phong
   * khong o hien truong, nen mot chung tu ghi tu day khong duoc mang ten mot lai xe nhu the ho
   * chinh la nguoi chup no. Cung ly le voi `CheckpointService.recordAsOperator`.
   */
  async recordAsOperator(command: RecordDocumentCommand): Promise<OperationalDocument> {
    const replayed = await this.documents.findByEvent(
      command.runId,
      command.type,
      command.clientEventId,
    );
    if (replayed) {
      this.allow('document.record', 'DOCUMENT_REPLAYED', { documentId: replayed.id });
      return replayed;
    }

    const run = await this.core.findRun(command.runId);
    if (!run) {
      this.deny('document.record', 'DOCUMENT_RUN_NOT_FOUND', { runId: command.runId });
      throw TransportDomainError.notFound('DOCUMENT_RUN_NOT_FOUND', 'Khong tim thay vong chay');
    }
    return this.append({ ...command, checkpointId: undefined }, run.status, null);
  }

  private async append(
    command: RecordDocumentCommand,
    runStatus: string,
    driverId: string | null,
  ): Promise<OperationalDocument> {
    const decision = evaluateDocumentRecord({
      runTerminal: runStatus === 'COMPLETED' || runStatus === 'CANCELLED',
      basis: command.basis,
      hasFileId: command.fileId !== undefined,
      externalNote: command.externalNote ?? '',
    });
    if (!decision.allowed) {
      this.deny('document.record', decision.reason, { runId: command.runId, type: command.type });
      throw this.recordErrorFor(decision.reason);
    }

    let legId: string | null = null;
    let orderId: string | null = null;
    if (command.legId !== undefined) {
      const leg = await this.core.findLeg(command.legId);
      if (!leg) {
        this.deny('document.record', 'DOCUMENT_LEG_NOT_FOUND', { legId: command.legId });
        throw TransportDomainError.notFound('DOCUMENT_LEG_NOT_FOUND', 'Khong tim thay chang');
      }
      if (leg.runId !== command.runId) {
        this.deny('document.record', 'DOCUMENT_LEG_NOT_IN_RUN', { legId: leg.id });
        throw TransportDomainError.denied(
          'DOCUMENT_LEG_NOT_IN_RUN',
          'Chang do khong thuoc vong chay nay',
        );
      }
      legId = leg.id;
      // MA DON GIAI O DAY, tu chang — khong tu than yeu cau. Xem khoi chu thich cua lop.
      orderId = leg.orderId;
    }

    const checkpointId = await this.resolveAnchor(command, driverId);
    const siteId = await this.resolveSite(command.counterpartySiteId);
    const fileId = await this.resolveFile(command);

    const receivedAt = this.now();
    try {
      const document = await this.documents.create({
        type: command.type,
        runId: command.runId,
        legId,
        orderId,
        checkpointId,
        counterpartySiteId: siteId,
        driverId,
        recordedBy: command.authUserId,
        basis: command.basis,
        fileId,
        externalNote: command.externalNote ?? null,
        label: command.label ?? null,
        captureMode: command.captureMode ?? 'UNKNOWN',
        clientEventId: command.clientEventId,
        receivedAt,
        businessDate: toBusinessDate(receivedAt, this.corePolicy.timeZone),
      });
      this.allow('document.record', 'DOCUMENT_RECORDED', {
        documentId: document.id,
        type: document.type,
        basis: document.basis,
        // KHONG log ma tep. Mot dong thoi gian van hanh khong phai cho de liet ke kho tep.
        hasFile: document.fileId !== null,
      });
      return document;
    } catch (error) {
      if (isUniqueViolationOn(error, DOCUMENT_CLIENT_EVENT)) {
        const already = await this.documents.findByEvent(
          command.runId,
          command.type,
          command.clientEventId,
        );
        if (already) {
          this.allow('document.record', 'DOCUMENT_REPLAYED', { documentId: already.id });
          return already;
        }
      }
      if (isUniqueViolationOn(error, DOCUMENT_FILE_ONCE)) {
        this.deny('document.record', 'DOCUMENT_FILE_NOT_AVAILABLE', { runId: command.runId });
        throw TransportDomainError.conflict(
          'DOCUMENT_FILE_NOT_AVAILABLE',
          'Ma tep do da duoc gan cho mot chung tu khac',
        );
      }
      throw error;
    }
  }

  /**
   * NEO cua chung tu — mot moc CUA CHINH LAI XE NAY, tren CHINH vong chay nay.
   *
   * `#279` O12: *"Driver A cannot attach document to Driver B's work."* Cong THAT nam o day chu
   * khong o giao dien.
   *
   * KHONG ep loai moc: `anchorHintFor()` la GOI Y cho giao dien, khong phai mot rang buoc. Mot to
   * phieu can ghi o moc `DELIVERY_ARRIVAL` van la mot to phieu can that; chan no lai se lam lai xe
   * khong ghi duoc roi ho bo qua luon buoc ghi.
   */
  private async resolveAnchor(
    command: RecordDocumentCommand,
    driverId: string | null,
  ): Promise<string | null> {
    if (command.checkpointId === undefined) return null;

    const scoped = await this.checkpoints.listForRun(command.runId);
    const anchor = scoped.find((row: RunCheckpoint) => row.id === command.checkpointId);
    if (!anchor) {
      this.deny('document.record', 'DOCUMENT_CHECKPOINT_NOT_APPLICABLE', {
        checkpointId: command.checkpointId,
      });
      throw TransportDomainError.invalid(
        'DOCUMENT_CHECKPOINT_NOT_APPLICABLE',
        'Moc do khong thuoc vong chay nay',
      );
    }
    if (driverId === null || anchor.driverId !== driverId) {
      this.deny('document.record', 'DOCUMENT_CHECKPOINT_NOT_OWNED', { checkpointId: anchor.id });
      throw TransportDomainError.denied(
        'DOCUMENT_CHECKPOINT_NOT_OWNED',
        'Moc do khong phai cua ban',
      );
    }
    return anchor.id;
  }

  private async resolveSite(counterpartySiteId: string | undefined): Promise<string | null> {
    if (counterpartySiteId === undefined) return null;
    if (!(await this.sites.exists(counterpartySiteId))) {
      this.deny('document.record', 'DOCUMENT_CHECKPOINT_NOT_APPLICABLE', { counterpartySiteId });
      throw TransportDomainError.notFound(
        'DOCUMENT_CHECKPOINT_NOT_APPLICABLE',
        'Khong tim thay dia diem do',
      );
    }
    return counterpartySiteId;
  }

  /**
   * HOI cong tep. Ba ket qua, ba ma khac nhau — xem `DocumentFileLookup`.
   *
   * `UNAVAILABLE` mang mot ma RIENG chu khong gop vao ma tu choi chung: hai tinh huong doi hai viec
   * khac han o phia nguoi dung. O nhanh do ho khong sai gi ca — ho chi phai di duong chung tu giay.
   */
  private async resolveFile(command: RecordDocumentCommand): Promise<string | null> {
    if (command.fileId === undefined) return null;

    const lookup = await this.files.describe(command.fileId, command.authUserId);
    if (lookup.kind === 'UNAVAILABLE') {
      this.deny('document.record', 'DOCUMENT_FILE_PLATFORM_UNAVAILABLE', { runId: command.runId });
      throw TransportDomainError.invalid(
        'DOCUMENT_FILE_PLATFORM_UNAVAILABLE',
        'Ban nay chua co nen tang tep — hay ghi theo duong chung tu giay',
      );
    }
    if (lookup.kind === 'DENIED') {
      const reason: DocumentRecordReason =
        lookup.reason === 'FILE_NOT_ACTIVE'
          ? 'DOCUMENT_FILE_NOT_ACTIVE'
          : 'DOCUMENT_FILE_NOT_AVAILABLE';
      this.deny('document.record', reason, { runId: command.runId });
      throw TransportDomainError.denied(
        reason,
        reason === 'DOCUMENT_FILE_NOT_ACTIVE'
          ? 'Tep do da bi rut hoac dang bi cach ly'
          : 'Khong dung duoc ma tep do',
      );
    }
    return lookup.file.fileId;
  }

  /**
   * BIA MO mot chung tu — `#279` O2/O12 bai 7.
   *
   * "Bia mo" chu khong "xoa": hang o lai, mang gio va ten nguoi bia. Mot ho so bang chung xoa duoc
   * thi khong con la bang chung cho bat cu dieu gi.
   *
   * BIEN BAT BIEN: mot to giay DA duoc ban giao ve van phong thi khong bia mo duoc nua. Bien do la
   * mot su that CUA MIEN NAY (`isDocumentHandedOver`) chu khong doc sang Lane K — chieu phu thuoc
   * chi di mot huong.
   *
   * Quyen: `transport.operational_document.withdraw` nam trong `ACCOUNTING_DENIED`. Ke toan DOC
   * duoc moi chung tu — do la ca cong viec cua ho — nhung go mot to ra khoi chinh ho so ho dang
   * doi soat thi khong.
   */
  async withdraw(command: WithdrawDocumentCommand): Promise<OperationalDocument> {
    const document = await this.documents.find(command.documentId);
    if (!document) {
      this.deny('document.withdraw', 'DOCUMENT_NOT_FOUND', { documentId: command.documentId });
      throw TransportDomainError.notFound('DOCUMENT_NOT_FOUND', 'Khong tim thay chung tu');
    }

    const decision = evaluateDocumentWithdraw({
      status: document.status,
      handedOver: await this.handovers.isDocumentHandedOver(document.id),
    });
    if (!decision.allowed) {
      this.deny('document.withdraw', decision.reason, { documentId: document.id });
      throw this.withdrawErrorFor(decision.reason);
    }

    try {
      const withdrawn = await this.documents.withdraw({
        documentId: document.id,
        withdrawnAt: this.now(),
        withdrawnBy: command.authUserId,
        reason: command.reason,
      });
      this.allow('document.withdraw', 'DOCUMENT_WITHDRAWN', { documentId: withdrawn.id });
      return withdrawn;
    } catch (error) {
      if (error instanceof DocumentAlreadyWithdrawnError) {
        this.deny('document.withdraw', 'DOCUMENT_ALREADY_WITHDRAWN', { documentId: document.id });
        throw TransportDomainError.conflict(
          'DOCUMENT_ALREADY_WITHDRAWN',
          'Chung tu nay da duoc bia mo tu truoc',
        );
      }
      throw error;
    }
  }

  async listForRun(runId: string): Promise<readonly OperationalDocument[]> {
    return this.documents.listForRun(runId);
  }

  async listForOrder(orderId: string): Promise<readonly OperationalDocument[]> {
    return this.documents.listForOrder(orderId);
  }

  /** Chung tu CUA CHINH MINH — danh tinh tu phien, khong tu than yeu cau. */
  async listOwn(authUserId: string): Promise<readonly OperationalDocument[]> {
    const driver = await this.identity.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.deny('document.record', 'DOCUMENT_DRIVER_BINDING_MISSING', { authUserId });
      throw TransportDomainError.denied(
        'DOCUMENT_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }
    return this.documents.listForDriver(driver.id);
  }

  private recordErrorFor(reason: DocumentRecordReason): TransportDomainError {
    switch (reason) {
      case 'DOCUMENT_RUN_TERMINAL':
        return TransportDomainError.conflict(
          reason,
          'Vong chay da o trang thai cuoi, khong ghi them chung tu duoc',
        );
      case 'DOCUMENT_BASIS_MISMATCH':
        return TransportDomainError.invalid(reason, 'Can cu va ma tep khong khop nhau');
      case 'DOCUMENT_EXTERNAL_NOTE_REQUIRED':
        return TransportDomainError.invalid(reason, 'Phai ghi ro dang cam chung tu giay nao');
      default:
        return TransportDomainError.invalid(reason, 'Khong ghi duoc chung tu');
    }
  }

  private withdrawErrorFor(reason: DocumentWithdrawReason): TransportDomainError {
    switch (reason) {
      case 'DOCUMENT_HANDOVER_LOCKED':
        return TransportDomainError.conflict(
          reason,
          'Chung tu da ban giao ve van phong — khong bia mo duoc nua',
        );
      default:
        return TransportDomainError.conflict(reason, 'Chung tu nay da duoc bia mo tu truoc');
    }
  }

  private allow(
    point: 'document.record' | 'document.withdraw',
    reason: TransportDocumentDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DOCUMENT_DECISIONS,
      point,
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(
    point: 'document.record' | 'document.withdraw',
    reason: TransportDocumentDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DOCUMENT_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
