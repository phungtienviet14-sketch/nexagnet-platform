import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service.js';
import { isUniqueViolationOn } from '../config/storage-conflict.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { FileAuthorizationService } from './file-authorization.service.js';
import { FileDomainAuthorizerRegistry, type FileDomainVerdict } from './file-authorization.port.js';
import { FileBlobStore, type FileBlob } from './file-blob.port.js';
import { FILE_DECISIONS, type FileDecisionReason } from './file-decisions.js';
import {
  FILE_PURPOSE_RULES,
  buildPlatformFileKey,
  isPlatformFileKey,
  normaliseMimeType,
  rejectFile,
  safeFilename,
  sha256Of,
  sniffMimeType,
} from './file-policy.js';
import { FileScannerPort } from './file-scanner.port.js';
import { FILE_AUDIT_LOG } from './file.tokens.js';
import { PLATFORM_FILE_ACTIVE_LINK } from './file-storage-conflict.js';
import { FileDomainError } from './file.errors.js';
import { FileRepository } from './file.repository.js';
import type {
  FileLink,
  FileRecord,
  FileScanState,
  LinkFileCommand,
  StageFileCommand,
} from './file.types.js';

/** Dong ho tiem vao thay vi `new Date()` rai rac — de bai test dat duoc mot moc luu tru cu the. */
export const FILE_CLOCK = Symbol('FILE_CLOCK');

/** Ket qua mot lan doc: mo ta + byte. Mo ta la ban CONG KHAI, khong mang `storageKey`. */
export interface FileReadResult {
  readonly file: FileRecord;
  readonly blob: FileBlob;
}

/**
 * NEN TANG TEP — `#287` P1..P7.
 *
 * ============================================================================================
 * MOT DUONG VAO, VA NO DI QUA BON CONG
 * ============================================================================================
 *
 * `upload()` la duong duy nhat byte vao duoc he thong, va no di qua dung bon cong theo dung thu tu:
 *
 *   1. KIEM NOI DUNG (`rejectFile`) — truoc khi ghi mot byte nao. Ghi truoc roi kiem sau se de lai
 *      rac trong kho moi lan ai do tai nham;
 *   2. GHI BYTE + tao hang `STAGED`;
 *   3. QUET (`FileScannerPort`);
 *   4. KICH HOAT hoac CACH LY.
 *
 * Buoc 3 va 4 tach khoi buoc 2 vi `#287` P5: mot tep chua qua may quet KHONG duoc thanh bang chung
 * dung nghia. Neu gop tat ca vao mot buoc thi `STAGED` chi la mot gia tri enum khong ai o.
 *
 * ============================================================================================
 * SERVICE NAY KHONG BIET TEN MOT MIEN NAO
 * ============================================================================================
 *
 * Khong mot chuoi `transport`, `order`, `dealer` nao trong tep. Quyen do `FileAuthorizationService`
 * hoi lai mien, va `businessOwnerType` la mot chuoi mien tu khai. Quyet dinh kien truc #6, va
 * `#287` P11 (*"business taxonomy remains Lane O"*).
 */
@Injectable()
export class FileService {
  constructor(
    private readonly files: FileRepository,
    private readonly blobs: FileBlobStore,
    private readonly scanner: FileScannerPort,
    private readonly authorization: FileAuthorizationService,
    private readonly registry: FileDomainAuthorizerRegistry,
    @Inject(FILE_AUDIT_LOG) private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(FILE_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * TAI MOT TEP LEN — bon cong, xem khoi chu thich cua lop.
   *
   * Tra ve `FileRecord` cua chinh nen tang (co `storageKey`). Bien HTTP la noi cat no di, bang
   * `toFileDescriptor()` — de MOT cho lam viec do thay vi moi controller tu nho.
   */
  async upload(command: StageFileCommand): Promise<FileRecord> {
    return (
      (await this.telemetry?.step('file.upload', () => this.uploadInner(command))) ??
      this.uploadInner(command)
    );
  }

  private async uploadInner(command: StageFileCommand): Promise<FileRecord> {
    const declaredMimeType = normaliseMimeType(command.declaredMimeType);
    const rejection = rejectFile({
      bytes: command.bytes,
      declaredMimeType,
      purpose: command.purpose,
    });
    if (rejection) {
      this.deny('file.stage', rejection, {
        purpose: command.purpose,
        declaredMimeType,
        byteSize: command.bytes.byteLength,
      });
      throw FileDomainError.invalid(rejection, this.stageMessage(rejection));
    }

    if (!this.blobs.enabled) {
      // FAIL-CLOSED, cung ly le voi `EVIDENCE_STORE_DISABLED`: nhan roi vut se lam nguoi dung thay
      // "tai len xong" trong khi khong byte nao ton tai — lo ra vai tuan sau, luc doi chieu.
      this.deny('file.stage', 'FILE_STORE_DISABLED', { provider: this.blobs.provider });
      throw FileDomainError.denied(
        'FILE_STORE_DISABLED',
        'Kho tep dang tat — bat kho truoc khi tai tep len',
      );
    }

    const now = this.clock();
    const staged = await this.stage(command, declaredMimeType, now);
    return this.runScanGate(staged, command.bytes, declaredMimeType, now);
  }

  /**
   * GHI HANG TRUOC, GHI BYTE SAU — va thu tu do la mot quyet dinh.
   *
   * Neu ghi byte truoc va viec tao hang hong, ta co mot object khong ai tro toi va KHONG CO gi ghi
   * lai rang no ton tai — tuc mot ban ghi mo coi ma chinh phep do mo coi (`#287` P8) cung khong
   * thay, vi phep do do di tu metadata RA kho.
   *
   * Theo thu tu nay, truong hop xau nhat la mot hang `STAGED` khong co byte — mot hang DOC DUOC,
   * don duoc, va khong bao gio thanh bang chung cua ai.
   */
  private async stage(
    command: StageFileCommand,
    declaredMimeType: string,
    now: Date,
  ): Promise<FileRecord> {
    // Ma sinh O DAY, truoc ca hang lan byte: khoa luu tru dung tu chinh no, nen no phai co truoc
    // ca hai. Xem `CreateFileInput.id`.
    const fileId = randomUUID();
    const retentionDays = FILE_PURPOSE_RULES[command.purpose].retentionDays;
    const created = await this.files.create({
      id: fileId,
      purpose: command.purpose,
      originalFilename: command.originalFilename,
      safeFilename: safeFilename(command.originalFilename, declaredMimeType, command.purpose),
      declaredMimeType,
      detectedMimeType: sniffMimeType(command.bytes),
      byteSize: command.bytes.byteLength,
      sha256: sha256Of(command.bytes),
      storageProvider: this.blobs.provider,
      storageKey: buildPlatformFileKey(fileId, declaredMimeType, now, command.purpose),
      createdBy: command.createdBy,
      retainUntil: retentionDays > 0 ? new Date(now.getTime() + retentionDays * 86_400_000) : null,
      captureMetadata: command.captureMetadata ?? null,
    });

    await this.blobs.put(created.storageKey, command.bytes, declaredMimeType);

    this.telemetry?.stateChange({ entity: 'file', entityId: created.id, from: null, to: 'STAGED' });
    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point: 'file.stage',
      outcome: 'allowed',
      reason: 'FILE_STAGED',
      detail: {
        fileId: created.id,
        purpose: created.purpose,
        byteSize: created.byteSize,
        provider: created.storageProvider,
      },
    });
    return created;
  }

  /**
   * CONG QUET — `#287` P5.
   *
   * BA nhanh, va nhanh giua la nhanh de bo sot nhat:
   *
   *   · may quet TAT (`mode = OFF`)      -> kich hoat, `scanState = NOT_SCANNED`. Trung thuc: ta
   *     ghi ra rang khong ai nhin tep nay, thay vi danh dau `CLEAN` mot cach hao phong;
   *   · may quet BAT BUOC nhung khong tra loi -> KHONG kich hoat. Tep o lai `STAGED`, va lan tai
   *     len bao loi. Mot he thong doi phai quet ma khong co may quet KHONG duoc tu cho qua;
   *   · co ket qua -> `CLEAN` kich hoat, `INFECTED`/`FAILED` chuyen cach ly.
   */
  private async runScanGate(
    file: FileRecord,
    bytes: Buffer,
    declaredMimeType: string,
    now: Date,
  ): Promise<FileRecord> {
    const verdict = await this.scanner.scan(bytes, declaredMimeType);

    if (verdict === null) {
      if (this.scanner.mode === 'REQUIRED') {
        this.deny('file.activate', 'FILE_SCAN_REQUIRED', { fileId: file.id });
        throw FileDomainError.denied(
          'FILE_SCAN_REQUIRED',
          'Cau hinh bat buoc quet tep nhung khong co may quet nao tra loi',
        );
      }
      return this.activate(file, 'NOT_SCANNED', now);
    }

    if (verdict === 'CLEAN') {
      this.telemetry?.decision({
        vocabulary: FILE_DECISIONS,
        point: 'file.quarantine',
        outcome: 'allowed',
        reason: 'FILE_SCAN_CLEAN',
        detail: { fileId: file.id },
      });
      return this.activate(file, 'CLEAN', now);
    }

    const quarantined = await this.files.quarantine(file.id, verdict, now);
    this.telemetry?.stateChange({
      entity: 'file',
      entityId: file.id,
      from: file.state,
      to: 'QUARANTINED',
    });
    this.deny('file.quarantine', 'FILE_QUARANTINED', { fileId: file.id, scanState: verdict });
    await this.trace('file.quarantine', file.id, { scanState: verdict });
    throw FileDomainError.denied(
      verdict === 'INFECTED' ? 'FILE_SCAN_INFECTED' : 'FILE_SCAN_FAILED',
      verdict === 'INFECTED'
        ? 'May quet ket luan tep nhiem — tep da bi cach ly'
        : 'May quet khong ket luan duoc — tep da bi cach ly',
    );
    void quarantined;
  }

  private async activate(
    file: FileRecord,
    scanState: FileScanState,
    now: Date,
  ): Promise<FileRecord> {
    const activated = await this.files.activate(file.id, scanState, now);
    if (!activated) {
      // Mot nguoi khac da doi trang thai giua hai buoc. Khong ghi de — `#287` P12 bai 16.
      this.deny('file.activate', 'FILE_NOT_STAGED', { fileId: file.id });
      throw FileDomainError.conflict('FILE_NOT_STAGED', 'Tep khong con o trang thai cho kich hoat');
    }
    this.telemetry?.stateChange({
      entity: 'file',
      entityId: file.id,
      from: 'STAGED',
      to: 'ACTIVE',
    });
    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point: 'file.activate',
      outcome: 'allowed',
      reason: 'FILE_ACTIVATED',
      detail: { fileId: activated.id, scanState },
    });
    await this.trace('file.upload', activated.id, {
      purpose: activated.purpose,
      byteSize: activated.byteSize,
      sha256: activated.sha256,
      scanState,
    });
    return activated;
  }

  /**
   * MO TA mot tep cho mot nguoi goi cu the — `#287` P2, muc 2 cua danh sach nghiem thu cuoi.
   *
   * MOT ma cho ca "khong co" lan "khong phai cua ban". `#287` P6 doi *"fails closed without useful
   * enumeration"*: neu hai tinh huong tra hai ma khac nhau, thi thu lan luot cac ma la dem duoc bao
   * nhieu tep co that tren he thong.
   */
  async describeFor(fileId: string, authUserId: string): Promise<FileRecord> {
    const file = await this.files.findById(fileId);
    if (!file) throw this.notAvailable('file.read', fileId);

    const outcome = await this.authorization.authorize(file, 'READ', authUserId);
    if (outcome.kind !== 'GRANTED') throw this.notAvailable('file.read', fileId);

    // Trang thai kiem SAU quyen, khong truoc: tra "tep da bi rut" cho mot ma khong phai cua minh la
    // xac nhan rang ma do CO THAT.
    if (file.state !== 'ACTIVE') {
      this.deny('file.read', 'FILE_NOT_ACTIVE', { fileId, state: file.state });
      throw FileDomainError.denied('FILE_NOT_ACTIVE', 'Tep da bi rut hoac dang bi cach ly');
    }
    return file;
  }

  /**
   * DOC BYTE — muc 2 cua danh sach nghiem thu cuoi: *"reload/read uses that ID and domain
   * permission, not raw locator"*.
   *
   * Khoa luu tru duoc kiem lai o day du no den tu chinh CSDL. Cung rao ma
   * `isTransportEvidenceLocator` dat, va cung ly do: cot do la mot chuoi, va mot chuoi dat bang tay
   * se bien duong nay thanh mot cong DOC TUY Y trong bucket.
   */
  async read(fileId: string, authUserId: string): Promise<FileReadResult> {
    const file = await this.describeFor(fileId, authUserId);

    if (!isPlatformFileKey(file.storageKey)) {
      // KHONG dua `storageKey` vao `detail` — `#287` P7.
      this.deny('file.read', 'FILE_KEY_OUT_OF_SCOPE', { fileId });
      throw FileDomainError.denied(
        'FILE_KEY_OUT_OF_SCOPE',
        'Khoa luu tru cua tep nay khong thuoc khu cua nen tang tep',
      );
    }

    const blob = await this.blobs.read(file.storageKey);
    if (!blob) {
      // KHONG nem: "co dong nhung khong con byte" la mot trang thai NGHIEP VU, va giao dien phai
      // noi duoc dieu do thay vi hien mot loi cua SDK luu tru. Cung khuon `EvidenceReadResult`.
      this.deny('file.read', 'FILE_OBJECT_MISSING', { fileId, provider: file.storageProvider });
      throw FileDomainError.notFound('FILE_OBJECT_MISSING', 'Khong con byte cua tep nay trong kho');
    }

    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point: 'file.read',
      outcome: 'allowed',
      reason: 'FILE_SERVED',
      detail: { fileId, byteSize: blob.body.byteLength, contentType: blob.contentType },
    });
    return { file, blob };
  }

  /**
   * GAN mot tep vao mot doi tuong nghiep vu — `#287` P2.
   *
   * HAI cong, khong mot:
   *
   *   · nguoi goi phai duoc phep DUNG TOI tep (`ATTACH` tren chinh tep do);
   *   · mien so huu doi tuong dich phai dong y nhan.
   *
   * Cong thu nhat la cai chan leo thang: neu chi kiem cong thu hai, thi ai nam quyen tren mot doi
   * tuong cua chinh minh se gan duoc MOT MA TEP BAT KY vao do — roi doc no qua chinh lien ket vua
   * tao. Mot ma doan trung se thanh mot lan doc du lieu cua nguoi la.
   */
  async link(command: LinkFileCommand): Promise<FileLink> {
    const file = await this.files.findById(command.fileId);
    if (!file) throw this.notAvailable('file.link', command.fileId);

    const mayUse = await this.authorization.authorize(file, 'ATTACH', command.authUserId);
    if (mayUse.kind !== 'GRANTED') throw this.notAvailable('file.link', command.fileId);

    if (file.state !== 'ACTIVE') {
      this.deny('file.link', 'FILE_NOT_ACTIVE', { fileId: file.id, state: file.state });
      throw FileDomainError.denied('FILE_NOT_ACTIVE', 'Tep da bi rut hoac dang bi cach ly');
    }

    const authorizer = this.registry.authorizerFor(command.businessOwnerType);
    if (!authorizer) {
      this.deny('file.link', 'FILE_LINK_OWNER_UNKNOWN', {
        businessOwnerType: command.businessOwnerType,
      });
      throw FileDomainError.denied(
        'FILE_LINK_OWNER_UNKNOWN',
        'Khong mien nao nhan tra loi quyen cho loai doi tuong do',
      );
    }
    return this.createLink(file, authorizer.businessOwnerType, command);
  }

  private async createLink(
    file: FileRecord,
    businessOwnerType: string,
    command: LinkFileCommand,
  ): Promise<FileLink> {
    const existing = await this.files.findActiveLink(
      file.id,
      businessOwnerType,
      command.businessOwnerId,
      command.purpose,
    );
    if (existing) {
      // LAM LAI mot lan gan la khong doi gi — `#287` P12 bai 16. Nem o day se lam mot lan bam hai
      // lan cua nguoi dung trong nhu mot loi, trong khi ket qua da dung roi.
      this.telemetry?.decision({
        vocabulary: FILE_DECISIONS,
        point: 'file.link',
        outcome: 'allowed',
        reason: 'FILE_LINK_ALREADY_ACTIVE',
        detail: { fileId: file.id, businessOwnerType },
      });
      return existing;
    }

    const verdict = await this.askDomainToAttach(file, businessOwnerType, command);
    if (verdict !== 'GRANTED') {
      this.deny('file.link', 'FILE_LINK_DENIED_BY_DOMAIN', { fileId: file.id, businessOwnerType });
      throw FileDomainError.denied(
        'FILE_LINK_DENIED_BY_DOMAIN',
        'Mien nghiep vu tu choi cho gan tep vao doi tuong do',
      );
    }

    const link = await this.persistLink(file, businessOwnerType, command);
    if (!link) {
      // Mot nguoi khac vua tao dung lien ket do, mot phan nghin giay truoc. Doc lai va tra ve cai
      // co that — `#287` P12 bai 16. Nem o day se lam hai lan bam dong thoi cua CUNG mot nguoi
      // dung trong nhu mot loi, trong khi ket qua da dung roi.
      const raced = await this.files.findActiveLink(
        file.id,
        businessOwnerType,
        command.businessOwnerId,
        command.purpose,
      );
      if (!raced) throw FileDomainError.conflict('FILE_LINK_ALREADY_ACTIVE', 'Lien ket do vua doi');
      this.telemetry?.decision({
        vocabulary: FILE_DECISIONS,
        point: 'file.link',
        outcome: 'allowed',
        reason: 'FILE_LINK_ALREADY_ACTIVE',
        detail: { fileId: file.id, businessOwnerType },
      });
      return raced;
    }
    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point: 'file.link',
      outcome: 'allowed',
      reason: 'FILE_LINKED',
      detail: { fileId: file.id, linkId: link.id, businessOwnerType, purpose: command.purpose },
    });
    await this.trace('file.attach', file.id, {
      linkId: link.id,
      businessOwnerType,
      businessOwnerId: command.businessOwnerId,
      purpose: command.purpose,
    });
    return link;
  }

  /**
   * GHI LIEN KET, va tra `null` khi CSDL tu choi vi DA CO mot lien ket y het.
   *
   * `null` chu khong mot ngoai le: mot va cham o day khong phai mot loi cua ai — no la hai lan bam
   * den cung luc, va ca hai deu muon cung mot ket qua. Duong dich chinh xac cua no nam o cho goi.
   */
  private async persistLink(
    file: FileRecord,
    businessOwnerType: string,
    command: LinkFileCommand,
  ): Promise<FileLink | null> {
    try {
      return await this.files.createLink({
        fileId: file.id,
        businessOwnerType,
        businessOwnerId: command.businessOwnerId,
        purpose: command.purpose,
        createdBy: command.authUserId,
      });
    } catch (error) {
      if (isUniqueViolationOn(error, PLATFORM_FILE_ACTIVE_LINK)) return null;
      throw error;
    }
  }

  /**
   * HOI MIEN ve mot lien ket CHUA TON TAI.
   *
   * Cau hoi mang mot `FileLink` UNG VIEN: `id` rong, `state` da la `ACTIVE`. Mien khong duoc doc
   * `id` o duong nay — xem chu thich cua `FileDomainAuthorizationRequest`. Cai mien can de tra loi
   * la `businessOwnerId`, va no co that.
   */
  private async askDomainToAttach(
    file: FileRecord,
    businessOwnerType: string,
    command: LinkFileCommand,
  ): Promise<FileDomainVerdict['kind']> {
    const authorizer = this.registry.authorizerFor(businessOwnerType);
    if (!authorizer) return 'DENIED';
    const verdict = await authorizer.authorize({
      link: {
        id: '',
        fileId: file.id,
        businessOwnerType,
        businessOwnerId: command.businessOwnerId,
        purpose: command.purpose,
        state: 'ACTIVE',
        createdBy: command.authUserId,
        createdAt: this.clock(),
        withdrawnBy: null,
        withdrawnAt: null,
      },
      action: 'ATTACH',
      authUserId: command.authUserId,
    });
    return verdict.kind;
  }

  /**
   * RUT mot tep khoi ho so — muc 4 va 5 cua danh sach nghiem thu cuoi.
   *
   * "Rut" chu khong "xoa": hang o lai, mang gio va ten nguoi rut, va MOI lien ket dang hieu luc bi
   * go trong CUNG mot giao dich (`#287` P3 bat bien 2). Byte VAN CON — don byte la mot buoc rieng
   * (`FilePurgeService`), va do la ca diem cua bat bien 3.
   *
   * `LOCKED` khong phai `DENIED`: mot mien da chot bang chung thi khong AI rut duoc nua, ke ca
   * nguoi da tai len. Tra cung mot ma cho hai tinh huong se lam nguoi dung di xin quyen — mot viec
   * khong bao gio giup duoc ho.
   */
  async withdraw(fileId: string, authUserId: string, reason: string): Promise<FileRecord> {
    const file = await this.files.findById(fileId);
    if (!file) throw this.notAvailable('file.withdraw', fileId);

    const outcome = await this.authorization.authorize(file, 'WITHDRAW', authUserId);
    if (outcome.kind === 'LOCKED') {
      this.deny('file.withdraw', 'FILE_WITHDRAWAL_LOCKED_BY_DOMAIN', { fileId });
      throw FileDomainError.denied(
        'FILE_WITHDRAWAL_LOCKED_BY_DOMAIN',
        'Bang chung nay da duoc chot — khong rut duoc nua',
      );
    }
    if (outcome.kind !== 'GRANTED') throw this.notAvailable('file.withdraw', fileId);

    const withdrawn = await this.files.withdraw(fileId, authUserId, this.clock());
    if (!withdrawn) {
      // Da o trang thai cuoi. Lam lai mot lan rut khong doi gi — nhung KHONG duoc im lang, vi
      // nguoi goi can biet ho dang nhin mot trang thai cu.
      this.deny('file.withdraw', 'FILE_ALREADY_INACTIVE', { fileId, state: file.state });
      throw FileDomainError.conflict('FILE_ALREADY_INACTIVE', 'Tep nay da o trang thai cuoi');
    }

    this.telemetry?.stateChange({
      entity: 'file',
      entityId: fileId,
      from: file.state,
      to: 'WITHDRAWN',
    });
    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point: 'file.withdraw',
      outcome: 'allowed',
      reason: 'FILE_WITHDRAWN',
      detail: { fileId, reason },
    });
    await this.trace('file.withdraw', fileId, { reason }, authUserId);
    return withdrawn;
  }

  /** MOT ma cho ca "khong co" lan "khong phai cua ban" — `#287` P6. */
  private notAvailable(
    point: 'file.read' | 'file.link' | 'file.withdraw',
    fileId: string,
  ): FileDomainError {
    this.deny(point, 'FILE_NOT_AVAILABLE_TO_CALLER', { fileId });
    return FileDomainError.denied('FILE_NOT_AVAILABLE_TO_CALLER', 'Khong dung duoc ma tep do');
  }

  private deny(
    point:
      | 'file.stage'
      | 'file.activate'
      | 'file.link'
      | 'file.read'
      | 'file.withdraw'
      | 'file.quarantine',
    reason: FileDecisionReason,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: FILE_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail,
    });
  }

  /**
   * MOT DONG DAU VET — `#287` P7.
   *
   * `entityType` luon la `PlatformFile`, va `entityId` luon la ma DUC. KHONG mot lan goi nao o tep
   * nay dua `storageKey` vao `after` — do la dieu P7 cam (*"Never log ... private storage paths"*),
   * va `file-public-surface.spec.ts` quet ma nguon de giu.
   */
  private async trace(
    action: string,
    fileId: string,
    after: Readonly<Record<string, unknown>>,
    actor = 'system',
  ): Promise<void> {
    await this.audit.append({
      actor,
      action,
      entityType: 'PlatformFile',
      entityId: fileId,
      after,
    });
  }

  private stageMessage(rejection: FileDecisionReason): string {
    switch (rejection) {
      case 'FILE_EMPTY':
        return 'Tep rong — khong co gi de luu';
      case 'FILE_TOO_LARGE':
        return 'Tep vuot gioi han dung luong cua muc dich nay';
      case 'FILE_MIME_NOT_ALLOWED':
        return 'Chi nhan anh JPEG/PNG/WebP hoac tep PDF';
      case 'FILE_CONTENT_MISMATCH':
        return 'Noi dung tep khong khop loai ban khai';
      case 'FILE_ACTIVE_CONTENT_REJECTED':
        return 'Tep chua noi dung chay duoc — khong nhan';
      default:
        return 'Tep khong hop le';
    }
  }
}
