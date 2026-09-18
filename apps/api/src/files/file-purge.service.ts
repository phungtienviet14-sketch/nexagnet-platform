import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { FileBlobStore } from './file-blob.port.js';
import { FILE_DECISIONS, type FilePurgeReason } from './file-decisions.js';
import { isPlatformFileKey } from './file-policy.js';
import { FILE_CLOCK } from './file.service.js';
import { FILE_AUDIT_LOG } from './file.tokens.js';
import { FileDomainError } from './file.errors.js';
import { FileRepository } from './file.repository.js';
import type { FileRecord } from './file.types.js';

/** So lan thu don byte toi da cho mot tep — `#287` P8 *"bounded retry"*. */
export const FILE_PURGE_MAX_ATTEMPTS = 5;

/** Ket qua mot lan don. `reason` la ma, khong cau van — de nguoi van hanh loc duoc. */
export interface FilePurgeOutcome {
  readonly fileId: string;
  readonly reason: FilePurgeReason;
}

/** Ket qua mot lan quet mo coi. CHI DOC — xem khoi chu thich cua `scanOrphans`. */
export interface FileOrphanReport {
  readonly scanned: number;
  readonly metadataWithoutBlob: readonly string[];
  /** Kho khong tra loi duoc `stat()` — phep do KHONG ket luan duoc, va phai noi ra. */
  readonly inconclusive: number;
}

/**
 * DON BYTE + PHEP DO MO COI — `#287` P3/P8.
 *
 * ============================================================================================
 * MOT SERVICE RIENG, va do khong phai chuyen chia tep cho gon
 * ============================================================================================
 *
 * `#287` P3 bat bien 3: *"physical purge is separate + idempotent"*. "Rieng" o day co nghia ve
 * VONG DOI chu khong ve thu muc: mot lan rut o tang nghiep vu phai thanh cong NGAY CA KHI kho luu
 * tru dang khong voi toi duoc, va cach duy nhat de dieu do dung la hai viec do khong nam trong
 * cung mot don vi cong viec.
 *
 * Nen `FileService.withdraw()` khong bao gio goi lop nay. No ghi tombstone roi dung. Byte duoc don
 * ve sau, boi mot lan chay khac, va lan chay do hong bao nhieu lan cung khong keo tep song lai.
 *
 * ============================================================================================
 * BA CONG CHAN TRUOC KHI MOT BYTE BI DON
 * ============================================================================================
 *
 *   1. TEP CON DANG LA BANG CHUNG   -> tu choi. Don byte cua mot tep `ACTIVE` la mat du lieu;
 *   2. CHUA TOI HAN LUU TRU         -> tu choi (`#287` P8);
 *   3. DANG GIU THEO LENH PHAP LY   -> tu choi, vo thoi han.
 *
 * Ca ba deu duoc lap lai o tang CSDL bang mot trigger (`platform_file_purge_guard`). Hai lop chu
 * khong mot: mot lenh `UPDATE` go tay cung phai di qua cong thu ba, vi mot lenh giu theo phap ly
 * bi mot dong `psql` di qua thi no khong phai mot lenh giu.
 */
@Injectable()
export class FilePurgeService {
  constructor(
    private readonly files: FileRepository,
    private readonly blobs: FileBlobStore,
    @Inject(FILE_AUDIT_LOG) private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(FILE_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * DAT hoac GO lenh giu theo phap ly — `#287` P8.
   *
   * ============================================================================================
   * MOT LENH GIU KHONG DONG BANG HO SO
   * ============================================================================================
   *
   * No chan DUNG MOT phep: byte bien mat. Rut, cach ly, ghi them chung tu — tat ca van di duoc.
   * Lam no chan moi thu se bien mot yeu cau luu tru thanh mot lan dung viec, va nguoi ta se tim
   * duong vong.
   *
   * KHONG dat duoc tren mot tep DA don byte: xem `FileRepository.setLegalHold`.
   */
  async setLegalHold(fileId: string, legalHold: boolean, authUserId: string): Promise<FileRecord> {
    const updated = await this.files.setLegalHold(fileId, legalHold);
    if (!updated) {
      throw FileDomainError.conflict(
        'FILE_ALREADY_INACTIVE',
        'Tep nay da duoc don byte — khong dat duoc lenh giu nua',
      );
    }
    await this.audit.append({
      actor: authUserId,
      action: legalHold ? 'file.legal_hold.place' : 'file.legal_hold.release',
      entityType: 'PlatformFile',
      entityId: fileId,
      after: { legalHold },
    });
    return updated;
  }

  /** Danh dau CAN don. Chi tep da rut/da cach ly moi vao duoc hang doi nay. */
  async requestPurge(fileId: string): Promise<FileRecord> {
    const requested = await this.files.requestPurge(fileId, this.clock());
    if (!requested) {
      this.decide('FILE_PURGE_STILL_IN_BUSINESS_USE', 'denied', { fileId });
      throw FileDomainError.conflict(
        'FILE_PURGE_STILL_IN_BUSINESS_USE',
        'Tep van dang la bang chung hieu luc — rut no truoc khi don byte',
      );
    }
    return requested;
  }

  /**
   * DON BYTE cua MOT tep — IDEMPOTENT.
   *
   * Lam lai tren mot tep da `PURGED` tra ve `FILE_PURGE_ALREADY_DONE` va KHONG cham vao kho. Do la
   * `#287` P12 bai 8, va no khong phai mot phep toi uu: mot lenh don lap lai cham vao kho co the
   * xoa mot object DA DUOC MOT TEP KHAC dung lai cung khoa.
   */
  async purge(fileId: string): Promise<FilePurgeOutcome> {
    const file = await this.files.findById(fileId);
    if (!file) {
      throw FileDomainError.notFound('FILE_NOT_AVAILABLE_TO_CALLER', 'Khong co tep voi ma do');
    }
    if (file.state === 'PURGED') {
      this.decide('FILE_PURGE_ALREADY_DONE', 'allowed', { fileId });
      return { fileId, reason: 'FILE_PURGE_ALREADY_DONE' };
    }

    const blocked = this.blockedReason(file);
    if (blocked) {
      this.decide(blocked, 'denied', { fileId, state: file.state });
      return { fileId, reason: blocked };
    }
    return this.removeBytes(file);
  }

  /**
   * BA CONG — mot ma cho moi cong, khong gop thanh mot `boolean`.
   *
   * `retainUntil` so voi dong ho TIEM VAO, khong `Date.now()`: bai test dat duoc mot moc tuong lai
   * va chung minh cong that su dong, thay vi phai cho mot nam.
   */
  private blockedReason(file: FileRecord): FilePurgeReason | null {
    if (file.state !== 'WITHDRAWN' && file.state !== 'QUARANTINED') {
      return 'FILE_PURGE_STILL_IN_BUSINESS_USE';
    }
    if (file.legalHold) return 'FILE_PURGE_BLOCKED_BY_LEGAL_HOLD';
    if (file.retainUntil && file.retainUntil.getTime() > this.clock().getTime()) {
      return 'FILE_PURGE_BLOCKED_BY_RETENTION';
    }
    return null;
  }

  /**
   * GOI KHO, roi ghi ket qua.
   *
   * MOT LAN HONG KHONG KEO TRANG THAI LOGIC VE — `#287` P3 bat bien 5 va P12 bai 7. Hang van o
   * `WITHDRAWN`; cai doi la `purgeAttempts`, `purgeFailedAt` va mot ma loi doc duoc. Nguoi van hanh
   * loc `purgeFailureCode` la ra ngay lo tep can nhin lai.
   *
   * `isPlatformFileKey` kiem lai du khoa den tu chinh CSDL: mot lenh XOA di lac ra ngoai khu cua
   * nen tang nguy hiem hon han mot lenh doc di lac. Cung rao ma `TransportEvidenceService.remove()`
   * dat, va cung ly do.
   */
  private async removeBytes(file: FileRecord): Promise<FilePurgeOutcome> {
    if (!isPlatformFileKey(file.storageKey)) {
      await this.files.markPurgeFailed(file.id, 'FILE_KEY_OUT_OF_SCOPE', this.clock());
      this.decide('FILE_PURGE_FAILED', 'denied', {
        fileId: file.id,
        code: 'FILE_KEY_OUT_OF_SCOPE',
      });
      return { fileId: file.id, reason: 'FILE_PURGE_FAILED' };
    }

    let removed: boolean;
    try {
      removed = await this.blobs.remove(file.storageKey);
    } catch (error) {
      // KHONG de loi cua SDK luu tru di tiep: no thuong mang ca duong dan va doi khi ca URL co chu
      // ky. Chi giu mot ma — `#287` P7.
      await this.files.markPurgeFailed(file.id, 'FILE_BLOB_REMOVE_THREW', this.clock());
      this.decide('FILE_PURGE_FAILED', 'denied', {
        fileId: file.id,
        code: 'FILE_BLOB_REMOVE_THREW',
        attempts: file.purgeAttempts + 1,
        exhausted: file.purgeAttempts + 1 >= FILE_PURGE_MAX_ATTEMPTS,
      });
      void error;
      return { fileId: file.id, reason: 'FILE_PURGE_FAILED' };
    }

    if (!removed) {
      // Kho khong don duoc (`MEDIA_STORE=none`, hoac kho khong hien thuc `remove`). Tep DA bien mat
      // khoi ho so dung nhu nguoi dung yeu cau; con lai mot object khong ai tro toi. Mot ma RIENG
      // chu khong mot loi — cung hop dong voi `TransportEvidenceService.remove()`.
      this.decide('FILE_PURGE_UNSUPPORTED', 'degraded', {
        fileId: file.id,
        provider: this.blobs.provider,
      });
      return { fileId: file.id, reason: 'FILE_PURGE_UNSUPPORTED' };
    }

    await this.files.markPurged(file.id, this.clock());
    this.telemetry?.stateChange({
      entity: 'file',
      entityId: file.id,
      from: file.state,
      to: 'PURGED',
    });
    this.decide('FILE_PURGED', 'allowed', { fileId: file.id, provider: this.blobs.provider });
    await this.audit.append({
      actor: 'system',
      action: 'file.purge',
      entityType: 'PlatformFile',
      entityId: file.id,
      after: { provider: file.storageProvider, byteSize: file.byteSize },
    });
    return { fileId: file.id, reason: 'FILE_PURGED' };
  }

  /**
   * CHAY MOT LO — co chan, va bo qua tep da het so lan thu.
   *
   * `#287` P8 *"bounded retry"*: mot tep hong mai se khong lam lo nay dung yen mot cho. Khi het so
   * lan, no roi khoi vong chay tu dong va o lai cho nguoi van hanh nhin — dong `purgeFailureCode`
   * la cho ho nhin.
   */
  async runPendingPurges(limit: number): Promise<readonly FilePurgeOutcome[]> {
    const pending = await this.files.listPendingPurge(limit);
    const outcomes: FilePurgeOutcome[] = [];
    for (const file of pending) {
      if (file.purgeAttempts >= FILE_PURGE_MAX_ATTEMPTS) continue;
      outcomes.push(await this.purge(file.id));
    }
    return outcomes;
  }

  /**
   * PHEP DO MO COI — CHI DOC. `#287` P8.
   *
   * ============================================================================================
   * KHONG CO THAM SO `dryRun`, va do la ca thiet ke
   * ============================================================================================
   *
   * `#287` P8 doi *"cleanup dry-run first"* va P14 cam *"destructive cleanup"* trong lane nay. Mot
   * co `dryRun = true` mac dinh van de lai mot duong di toi lan xoa — va duong do se duoc dung,
   * boi mot nguoi dang voi, tren mot ban co du lieu that.
   *
   * Nen o day KHONG CO duong do. Ham tra ve mot BAN BAO CAO. Ai muon don thi doc bao cao roi goi
   * `requestPurge`/`purge` tren tung ma — tuc di qua dung ba cong o tren.
   *
   * Chieu do duoc: metadata -> kho. Chieu nguoc lai (byte khong co metadata) can mot phep LIET KE
   * tren kho, ma `MediaStore` khong co; do la mot nang luc cua tang nha cung cap, tuc `#227`.
   */
  async scanOrphans(limit: number): Promise<FileOrphanReport> {
    const files = await this.files.listWithBlob(limit);
    const metadataWithoutBlob: string[] = [];
    let inconclusive = 0;

    for (const file of files) {
      const stat = await this.blobs.stat(file.storageKey);
      if (stat.kind === 'MISSING') metadataWithoutBlob.push(file.id);
      if (stat.kind === 'UNSUPPORTED') inconclusive += 1;
    }

    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point: 'file.orphan',
      outcome: inconclusive > 0 ? 'degraded' : 'allowed',
      reason:
        inconclusive > 0
          ? 'FILE_ORPHAN_SCAN_UNSUPPORTED'
          : metadataWithoutBlob.length > 0
            ? 'FILE_ORPHAN_METADATA_WITHOUT_BLOB'
            : 'FILE_ORPHAN_NONE',
      detail: { scanned: files.length, orphans: metadataWithoutBlob.length, inconclusive },
    });
    return { scanned: files.length, metadataWithoutBlob, inconclusive };
  }

  private decide(
    reason: FilePurgeReason,
    outcome: 'allowed' | 'denied' | 'degraded',
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point: 'file.purge',
      outcome,
      reason,
      detail,
    });
  }
}
