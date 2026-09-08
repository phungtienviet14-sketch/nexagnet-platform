import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate, type BusinessDate } from '../business-date.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TollApiRegistry, type TollApiDiagnostic } from './toll-api.port.js';
import type { TollActiveLinkView } from './toll-account-link.js';
import { classifyTollRows, type ClassifiedTollRow } from './toll-classification.js';
import { TRANSPORT_TOLL_DECISIONS } from './toll-decisions.js';
import { normalizeAccountNo, tollSourceDigest } from './toll-identity.js';
import {
  TRANSPORT_TOLL_POLICY,
  tollMappingConfigurationError,
  type TollProviderMappingPolicy,
  type TransportTollPolicy,
} from './toll-policy.js';
import type { TollProvider, TollSourceKind, TollTransactionKind } from './toll-provider.port.js';
import {
  TollStatementSource,
  type TollFileFormat,
} from './toll-statement-source.js';
import {
  mapTollRows,
  missingTollColumns,
  type MappedTollRow,
  type RawTollRow,
} from './toll-statement-mapping.js';
import { TransportTollCoreFacts, type TollCandidateWrite } from './toll.ports.js';
import { TollRepository } from './toll.repository.js';
import type { TollImport, TollTransactionCandidateRecord } from './toll.types.js';

/**
 * BO COT CUA DUONG NHAP TAY — do CHUNG TA dinh nghia, va do la ca ly do no duoc phep ton tai.
 *
 * `toll-policy.ts` cam mot bo cot mac dinh cho tep cua nha cung cap, vi mot bo nhu vay se thanh
 * "dinh dang VETC" trong dau nguoi doc. Duong NHAP TAY thi nguoc lai: bieu nhap la cua ta, nguoi
 * van hanh go tay tung o, va khong ai nham no voi mot dinh dang cua ai.
 *
 * Nho vay `MANUAL` la duong chay DUY NHAT hoat dong duoc HOM NAY — khi chua co mot ban mau nao cua
 * VETC hay ePass. #237 da noi dieu do tu dau: *"`MANUAL` khong bao gio duoc bo"*.
 */
export const MANUAL_TOLL_COLUMNS = {
  accountNo: 'accountNo',
  kind: 'kind',
  vehiclePlate: 'vehiclePlate',
  passedAt: 'passedAt',
  businessDate: 'businessDate',
  amount: 'amount',
  station: 'station',
  providerRef: 'providerRef',
} as const;

export interface ManualTollRow {
  readonly accountNo: string;
  readonly kind: TollTransactionKind;
  readonly vehiclePlate: string | null;
  readonly passedAt: string | null;
  readonly businessDate: string | null;
  readonly amount: string;
  readonly station: string | null;
  readonly providerRef: string | null;
}

export interface TollImportCommand {
  readonly provider: TollProvider;
  readonly sourceKind: TollSourceKind;
  readonly sourceLabel: string;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  /** `STATEMENT_FILE`: noi dung tep ma hoa base64. Bien gioi HTTP khong nhan byte tho. */
  readonly contentBase64?: string;
  readonly format?: TollFileFormat;
  /** `MANUAL`: cac dong do nguoi van hanh go. */
  readonly rows?: readonly ManualTollRow[];
}

export interface TollImportPreview {
  readonly provider: TollProvider;
  readonly sourceKind: TollSourceKind;
  readonly sourceDigest: string;
  readonly rowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly rejectionsByReason: Readonly<Record<string, number>>;
  readonly matchStateCounts: Readonly<Record<string, number>>;
  /** Nguon nay DA duoc nap roi — nap lai se tra ve chinh lan cu, khong tao gi. */
  readonly alreadyImportedId: string | null;
  readonly lines: readonly MappedTollRow[];
  readonly classified: readonly ClassifiedTollRow[];
}

export interface CommittedTollImport {
  readonly import: TollImport;
  readonly candidates: readonly TollTransactionCandidateRecord[];
  /** `true` = dung bo byte do da nap truoc; khong ban ghi nao duoc tao them. */
  readonly replayed: boolean;
}

@Injectable()
export class TollService {
  constructor(
    private readonly repository: TollRepository,
    private readonly source: TollStatementSource,
    private readonly core: TransportTollCoreFacts,
    private readonly api: TollApiRegistry,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_TOLL_POLICY) private readonly policy: TransportTollPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /**
   * CHAN DOAN duong API — RIENG cho tung nha cung cap (#269 doi bang chung rieng VETC/ePass).
   *
   * Hom nay ca hai deu `NOT_PUBLICLY_PROVEN`, va be mat nay noi ra dieu do THANH LOI thay vi de
   * mot muc "ETC qua API" hien ra trong giao dien roi khong lam gi.
   */
  apiDiagnostics(): readonly TollApiDiagnostic[] {
    return this.api.diagnostics();
  }

  /**
   * SAN SANG cua tung nha cung cap — tra loi dung cau hoi *"VETC/ePass da chay duoc chua?"*.
   *
   * `BLOCKED_SAMPLE_REQUIRED` la mot trang thai TRUNG THUC, khong phai mot loi: chua ai dua ta xem
   * mot tep that cua nha cung cap do, nen chua ai khai duoc bo cot cua no.
   */
  providerReadiness(): readonly {
    provider: TollProvider;
    statementReady: boolean;
    blockedReason: string | null;
    apiStatus: string;
  }[] {
    return this.api.diagnostics().map((diagnostic) => {
      const mapping = this.policy.providers[diagnostic.provider];
      const blocked =
        mapping === undefined
          ? 'BLOCKED_SAMPLE_REQUIRED'
          : (tollMappingConfigurationError(mapping) ?? null);
      return {
        provider: diagnostic.provider,
        statementReady: blocked === null,
        blockedReason: blocked,
        apiStatus: diagnostic.status,
      };
    });
  }

  /* =============================== Nap ================================== */

  /** DOC THU — khong ghi mot hang nao. An toan de bam bao nhieu lan cung duoc. */
  previewImport(command: TollImportCommand): Promise<TollImportPreview> {
    return this.buildPreview(command);
  }

  async commitImport(command: TollImportCommand, actor: string): Promise<CommittedTollImport> {
    const preview = await this.buildPreview(command);

    /*
     * NAP LAI DUNG BO BYTE DO — tra ve lan nhap CU, khong tao gi.
     *
     * #269 J4: *"same source re-upload => idempotent outcome"*. Day la mot ket qua CHO PHEP chu
     * khong phai mot loi: mot nguoi doi soat bam nhap hai lan vi trang tai cham la chuyen thuong
     * ngay, va lan thu hai khong duoc de lai mot ban sao nao.
     */
    if (preview.alreadyImportedId !== null) {
      const existing = await this.repository.findImport(preview.alreadyImportedId);
      if (existing) {
        this.decide('toll_import.commit', 'allowed', 'TOLL_IMPORT_REPLAYED', {
          importId: existing.id,
          provider: existing.provider,
        });
        const candidates = await this.repository.listCandidates({
          importId: existing.id,
          limit: existing.rowCount,
          offset: 0,
        });
        return { import: existing, candidates, replayed: true };
      }
    }

    const at = this.now();
    const created = await this.repository.createImportWithCandidates({
      provider: command.provider,
      sourceKind: command.sourceKind,
      sourceLabel: command.sourceLabel,
      sourceDigest: preview.sourceDigest,
      periodStart: command.periodStart === null ? null : this.requireBusinessDate(command.periodStart),
      periodEnd: command.periodEnd === null ? null : this.requireBusinessDate(command.periodEnd),
      rowCount: preview.rowCount,
      acceptedCount: preview.acceptedCount,
      rejectedCount: preview.rejectedCount,
      importedBy: actor,
      at,
      candidates: preview.lines.map((line, index): TollCandidateWrite => {
        const classified = preview.classified[index];
        return {
          rowNumber: line.rowNumber,
          parseStatus: line.parseStatus,
          rejectReason: line.rejectReason,
          accountNoRaw: line.accountNoRaw,
          accountId: classified?.accountId ?? null,
          kind: line.kind,
          vehiclePlateRaw: line.vehiclePlateRaw,
          vehicleId: classified?.vehicleId ?? null,
          passedAt: line.passedAt,
          businessDate: line.businessDate,
          signedAmount: line.signedAmount,
          stationLabel: line.stationLabel,
          providerRef: line.providerRef,
          fingerprint: line.fingerprint,
          matchState: classified?.matchState ?? null,
          rawValues: line.rawValues,
        };
      }),
    });

    this.decide('toll_import.commit', 'allowed', 'TOLL_IMPORT_ACCEPTED', {
      importId: created.import.id,
      provider: command.provider,
      rowCount: preview.rowCount,
      acceptedCount: preview.acceptedCount,
      rejectedCount: preview.rejectedCount,
    });
    /*
     * MOT dong trace cho MOI ly do tu choi, kem so luong. Nguoi truc doc trace tra loi duoc "tep
     * nay hong o dau" ma khong phai mo lai tep.
     */
    for (const [reason, count] of Object.entries(preview.rejectionsByReason)) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_TOLL_DECISIONS,
        point: 'toll_import.row',
        outcome: 'denied',
        reason: reason as never,
        detail: { importId: created.import.id, count },
      });
    }

    await this.audit.append({
      actor,
      action: 'transport.toll.import',
      entityType: 'TransportTollImport',
      entityId: created.import.id,
      after: {
        provider: created.import.provider,
        sourceKind: created.import.sourceKind,
        rowCount: created.import.rowCount,
        acceptedCount: created.import.acceptedCount,
        rejectedCount: created.import.rejectedCount,
      },
    });

    return { import: created.import, candidates: created.candidates, replayed: false };
  }

  listImports(provider: TollProvider | null): Promise<readonly TollImport[]> {
    return this.repository.listImports(provider);
  }

  /* ---------------------------- Doc mot nguon ---------------------------- */

  private async buildPreview(command: TollImportCommand): Promise<TollImportPreview> {
    const { mapping, rows, headers, digest } = await this.readSource(command);

    const missing = missingTollColumns(headers, mapping);
    if (missing.length > 0) {
      this.decide('toll_import.commit', 'denied', 'TOLL_IMPORT_MAPPING_INCOMPLETE', {
        provider: command.provider,
        missing,
      });
      throw TransportDomainError.invalid(
        'TOLL_IMPORT_MAPPING_INVALID',
        `Nguon ${command.sourceLabel} thieu cot da khai: ${missing.join(', ')}`,
      );
    }

    if (rows.length === 0) {
      this.decide('toll_import.commit', 'denied', 'TOLL_IMPORT_NO_ROWS', {
        provider: command.provider,
      });
      throw TransportDomainError.invalid(
        'TOLL_IMPORT_EMPTY',
        `Nguon ${command.sourceLabel} khong co dong du lieu nao`,
      );
    }

    const lines = mapTollRows({
      rows,
      provider: command.provider,
      mapping,
      timeZone: this.policy.timeZone,
    });

    const [accounts, links, vehicles] = await Promise.all([
      this.repository.listAccounts(command.provider),
      this.repository.listAllLinks(),
      this.core.listVehicles(),
    ]);

    const accountIdByNormalizedNo = new Map(
      accounts.map((account) => [normalizeAccountNo(account.accountNo), account.id]),
    );
    const plateByVehicleId = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.registrationPlate]));
    const linksByAccountId = new Map<string, TollActiveLinkView[]>();
    for (const link of links) {
      const plate = plateByVehicleId.get(link.vehicleId);
      // Mot ban ghi noi tro toi mot xe khong con trong doi xe thi khong dung de doc duoc gi ca —
      // va no KHONG duoc bien thanh mot phep khop long leo hon.
      if (plate === undefined) continue;
      const bucket = linksByAccountId.get(link.accountId) ?? [];
      bucket.push({
        vehicleId: link.vehicleId,
        vehiclePlate: plate,
        providerVehicleRef: link.providerVehicleRef,
        effectiveFrom: link.effectiveFrom,
        effectiveTo: link.effectiveTo,
      });
      linksByAccountId.set(link.accountId, bucket);
    }

    const fingerprints = lines
      .map((line) => line.fingerprint)
      .filter((value): value is string => value !== null);
    const knownFingerprints = await this.repository.knownFingerprints(command.provider, fingerprints);

    const classified = classifyTollRows({
      rows: lines.map((line) => ({
        rowNumber: line.rowNumber,
        parseStatus: line.parseStatus,
        accountNoRaw: line.accountNoRaw,
        kind: line.kind,
        vehiclePlateRaw: line.vehiclePlateRaw,
        providerRef: line.providerRef,
        businessDate: line.businessDate,
        fingerprint: line.fingerprint,
      })),
      accountIdByNormalizedNo,
      linksByAccountId,
      knownFingerprints,
    });

    const rejectionsByReason: Record<string, number> = {};
    for (const line of lines) {
      if (line.rejectReason === null) continue;
      rejectionsByReason[line.rejectReason] = (rejectionsByReason[line.rejectReason] ?? 0) + 1;
    }
    const matchStateCounts: Record<string, number> = {};
    for (const entry of classified) {
      if (entry.matchState === null) continue;
      matchStateCounts[entry.matchState] = (matchStateCounts[entry.matchState] ?? 0) + 1;
    }

    const acceptedCount = lines.filter((line) => line.parseStatus === 'ACCEPTED').length;
    const existing = await this.repository.findImportByDigest(command.provider, digest);

    return {
      provider: command.provider,
      sourceKind: command.sourceKind,
      sourceDigest: digest,
      rowCount: lines.length,
      acceptedCount,
      rejectedCount: lines.length - acceptedCount,
      rejectionsByReason,
      matchStateCounts,
      alreadyImportedId: existing?.id ?? null,
      lines,
      classified,
    };
  }

  /**
   * BON DUONG NAP, va moi duong mot cau tra loi RIENG khi no chua di duoc.
   *
   * Gop chung thanh mot ma "khong ho tro" se lam nguoi van hanh khong biet phai lam gi tiep: di
   * xin mot ban mau? di ky mot thoa thuan? hay sua tep?
   */
  private async readSource(command: TollImportCommand): Promise<{
    mapping: TollProviderMappingPolicy;
    rows: readonly RawTollRow[];
    headers: readonly string[];
    digest: string;
  }> {
    if (command.sourceKind === 'API') {
      this.decide('toll_import.commit', 'denied', 'TOLL_IMPORT_API_UNAVAILABLE', {
        provider: command.provider,
      });
      const path = this.api.diagnostics().find((entry) => entry.provider === command.provider);
      throw TransportDomainError.invalid(
        'TOLL_API_NOT_PUBLICLY_PROVEN',
        `Khong nha cung cap nao cong bo tai lieu API (do 08/09/2026), nen khong adapter nao duoc ` +
          `dang ky cho ${command.provider}. Duong hop phap: ${path?.requestPath ?? 'ND 119/2024 D.26 kh.2'}`,
      );
    }

    if (command.sourceKind === 'INVOICE_PDF') {
      throw TransportDomainError.invalid(
        'TOLL_PROVIDER_MAPPING_NOT_CONFIGURED',
        `Chua co ban mau hoa don thuc te cua ${command.provider}, nen chua trich xuat duoc. ` +
          `Duong dung hom nay: xuat bang ke (STATEMENT_FILE) hoac nhap tay (MANUAL).`,
      );
    }

    if (command.sourceKind === 'MANUAL') {
      const rows = command.rows ?? [];
      return {
        // Bieu nhap tay la CUA TA, nen bo cot cua no la mot hang so — khong phai mot phong doan ve
        // dinh dang cua ai.
        mapping: {
          columns: MANUAL_TOLL_COLUMNS,
          dateFormat: 'iso',
          kinds: {
            TOLL_PASS: 'TOLL_PASS',
            TOP_UP: 'TOP_UP',
            ACCOUNT_FEE: 'ACCOUNT_FEE',
            ADJUSTMENT: 'ADJUSTMENT',
          },
          defaultKind: null,
        },
        rows: rows.map((row, index) => ({
          rowNumber: index + 1,
          values: {
            accountNo: row.accountNo,
            kind: row.kind,
            vehiclePlate: row.vehiclePlate ?? '',
            passedAt: row.passedAt ?? '',
            businessDate: row.businessDate ?? '',
            amount: row.amount,
            station: row.station ?? '',
            providerRef: row.providerRef ?? '',
          },
        })),
        headers: Object.values(MANUAL_TOLL_COLUMNS),
        /*
         * DAU CUA MOT LAN NHAP TAY — tren NOI DUNG DA CHUAN HOA, khong tren byte cua mot tep.
         *
         * Nho vay go lai dung nhung dong do (vi trang tai cham, vi bam hai lan) van bi nhan ra la
         * mot lan nap lai, chu khong tao mot ban sao.
         */
        digest: tollSourceDigest(
          Buffer.from(
            rows
              .map((row) =>
                [
                  row.accountNo,
                  row.kind,
                  row.vehiclePlate ?? '',
                  row.passedAt ?? '',
                  row.businessDate ?? '',
                  row.amount,
                  row.station ?? '',
                  row.providerRef ?? '',
                ]
                  .map((value) => `${String(Buffer.byteLength(value, 'utf8'))}:${value}`)
                  .join('|'),
              )
              .join('\n'),
            'utf8',
          ),
        ),
      };
    }

    const mapping = this.policy.providers[command.provider];
    if (mapping === undefined) {
      this.decide('toll_import.commit', 'denied', 'TOLL_IMPORT_MAPPING_MISSING', {
        provider: command.provider,
      });
      throw TransportDomainError.invalid(
        'TOLL_PROVIDER_MAPPING_NOT_CONFIGURED',
        `Goi khach chua khai bo cot cho ${command.provider}. Day KHONG phai mot loi cua tep: chua ` +
          `ai dua he thong xem mot ban sao ke that cua nha cung cap nay (BLOCKED_SAMPLE_REQUIRED).`,
      );
    }
    const configurationError = tollMappingConfigurationError(mapping);
    if (configurationError !== null) {
      this.decide('toll_import.commit', 'denied', 'TOLL_IMPORT_MAPPING_MISSING', {
        provider: command.provider,
      });
      throw TransportDomainError.invalid(
        'TOLL_PROVIDER_MAPPING_NOT_CONFIGURED',
        `Bo cot khai cho ${command.provider} khong dung duoc: ${configurationError}`,
      );
    }

    const contentBase64 = command.contentBase64 ?? '';
    const parsed = await this.source.read({
      filename: command.sourceLabel,
      format: command.format ?? 'CSV',
      content: Buffer.from(contentBase64, 'base64'),
      maxBytes: this.policy.maxSourceBytes,
      maxRows: this.policy.maxRows,
    });
    return { mapping, rows: parsed.rows, headers: parsed.headers, digest: parsed.digest };
  }

  /* ============================== Doi soat ============================== */

  listCandidates(filter: Parameters<TollRepository['listCandidates']>[0]) {
    return this.repository.listCandidates(filter);
  }

  countCandidates(filter: Parameters<TollRepository['countCandidates']>[0]) {
    return this.repository.countCandidates(filter);
  }

  async candidateDetail(id: string) {
    const candidate = await this.repository.findCandidate(id);
    if (!candidate) {
      throw TransportDomainError.notFound('TOLL_CANDIDATE_NOT_FOUND', `Khong tim thay dong ${id}`);
    }
    return { candidate, decisions: await this.repository.listDecisions(id) };
  }

  /**
   * MOT LAN QUYET cua nguoi doi soat.
   *
   * ===========================================================================
   * KHONG mot nhanh nao o day noi ve TIEN DA TRA.
   *
   * #269 J7 cam gan nhan `paid`/`settled`/`accounted` cho mot quyet dinh so khop. Cai duy nhat
   * thay doi la: dong nay noi ve xe nao, va da co nguoi nhin no chua. Viec no co sinh ra mot nghia
   * vu thanh toan hay khong la mot cau hoi CHUA AI TRA LOI, va no khong duoc tra loi o day.
   */
  async review(
    input: {
      candidateId: string;
      action: 'RESOLVE_VEHICLE' | 'CONFIRM' | 'FLAG_DUPLICATE' | 'CLEAR_DUPLICATE' | 'REOPEN';
      vehicleId: string | null;
      duplicateOfCandidateId: string | null;
      note: string | null;
    },
    actor: string,
  ): Promise<TollTransactionCandidateRecord> {
    const candidate = await this.repository.findCandidate(input.candidateId);
    if (!candidate) {
      throw TransportDomainError.notFound(
        'TOLL_CANDIDATE_NOT_FOUND',
        `Khong tim thay dong ${input.candidateId}`,
      );
    }
    // Mot dong khong doc duoc thi khong co gi de doi soat — sua bo cot roi nap lai.
    if (candidate.parseStatus !== 'ACCEPTED') {
      this.decide('toll_review.resolve', 'denied', 'TOLL_REVIEW_CANDIDATE_REJECTED', {
        candidateId: candidate.id,
      });
      throw TransportDomainError.invalid(
        'TOLL_CANDIDATE_REJECTED',
        `Dong ${candidate.rowNumber} bi tu choi luc doc (${String(candidate.rejectReason)})`,
      );
    }

    const plan = await this.planReview(candidate, input);
    const updated = await this.repository.applyReview({
      candidateId: candidate.id,
      action: input.action,
      actor,
      at: this.now(),
      reason: plan.reason,
      note: input.note,
      nextVehicleId: plan.nextVehicleId,
      nextMatchState: plan.nextMatchState,
      nextReviewState: plan.nextReviewState,
      duplicateOfCandidateId: plan.duplicateOfCandidateId,
    });

    this.decide('toll_review.resolve', 'allowed', plan.reason, {
      candidateId: candidate.id,
      action: input.action,
    });
    await this.audit.append({
      actor,
      action: 'transport.toll.review.resolve',
      entityType: 'TransportTollTransactionCandidate',
      entityId: candidate.id,
      before: { vehicleId: candidate.vehicleId, matchState: candidate.matchState, reviewState: candidate.reviewState },
      after: { vehicleId: updated.vehicleId, matchState: updated.matchState, reviewState: updated.reviewState },
    });
    return updated;
  }

  private async planReview(
    candidate: TollTransactionCandidateRecord,
    input: {
      action: 'RESOLVE_VEHICLE' | 'CONFIRM' | 'FLAG_DUPLICATE' | 'CLEAR_DUPLICATE' | 'REOPEN';
      vehicleId: string | null;
      duplicateOfCandidateId: string | null;
    },
  ): Promise<{
    reason: 'TOLL_REVIEW_VEHICLE_RESOLVED' | 'TOLL_REVIEW_CONFIRMED' | 'TOLL_REVIEW_DUPLICATE_FLAGGED' | 'TOLL_REVIEW_DUPLICATE_CLEARED' | 'TOLL_REVIEW_REOPENED';
    nextVehicleId: string | null;
    nextMatchState: TollTransactionCandidateRecord['matchState'];
    nextReviewState: 'PENDING' | 'CONFIRMED' | 'REOPENED';
    duplicateOfCandidateId: string | null;
  }> {
    if (input.action === 'RESOLVE_VEHICLE') {
      // Nap tien / phi tai khoan khong gan xe — gan mot chiec xe vao do la tao ra mot lien he khong
      // co that, va no se di tiep vao moi bao cao theo xe.
      if (candidate.kind !== 'TOLL_PASS') {
        this.decide('toll_review.resolve', 'denied', 'TOLL_REVIEW_VEHICLE_NOT_APPLICABLE', {
          candidateId: candidate.id,
          kind: candidate.kind,
        });
        throw TransportDomainError.invalid(
          'TOLL_CANDIDATE_VEHICLE_NOT_APPLICABLE',
          `Dong loai ${String(candidate.kind)} khong gan vao mot chiec xe nao`,
        );
      }
      if (input.vehicleId === null || (await this.core.findVehicle(input.vehicleId)) === null) {
        throw TransportDomainError.notFound(
          'TOLL_VEHICLE_NOT_FOUND',
          `Khong tim thay xe ${String(input.vehicleId)}`,
        );
      }
      return {
        reason: 'TOLL_REVIEW_VEHICLE_RESOLVED',
        nextVehicleId: input.vehicleId,
        nextMatchState: 'MATCHED',
        // Chon duoc chiec xe KHONG dong nghia voi da doi soat xong: van con `PENDING` cho toi khi
        // co mot lan `CONFIRM` rieng.
        nextReviewState: 'PENDING',
        duplicateOfCandidateId: null,
      };
    }

    if (input.action === 'FLAG_DUPLICATE') {
      const target = input.duplicateOfCandidateId;
      if (target === null || target === candidate.id) {
        throw TransportDomainError.invalid(
          'TOLL_DUPLICATE_TARGET_INVALID',
          'Phai chi ra mot dong KHAC ma dong nay trung',
        );
      }
      const other = await this.repository.findCandidate(target);
      if (!other) {
        throw TransportDomainError.notFound(
          'TOLL_CANDIDATE_NOT_FOUND',
          `Khong tim thay dong ${target}`,
        );
      }
      if (other.provider !== candidate.provider) {
        throw TransportDomainError.invalid(
          'TOLL_CANDIDATE_PROVIDER_MISMATCH',
          'Hai dong cua hai nha cung cap khac nhau khong trung nhau duoc',
        );
      }
      return {
        reason: 'TOLL_REVIEW_DUPLICATE_FLAGGED',
        nextVehicleId: null,
        nextMatchState: 'DUPLICATE_CANDIDATE',
        nextReviewState: 'CONFIRMED',
        duplicateOfCandidateId: target,
      };
    }

    if (input.action === 'CLEAR_DUPLICATE') {
      /*
       * "Hai dong giong nhau nay la HAI su kien that."
       *
       * Day chinh la tinh huong VETC tu cong bo: loi doc cheo lan sinh ra hai giao dich cho mot
       * luot xe. Nguoi doi soat phai noi duoc dieu do ra, va he thong phai GHI LAI — neu khong,
       * moi lan nhin lai dong nay se lai thay cai nhan cu.
       */
      const resolved = candidate.vehicleId !== null || candidate.kind !== 'TOLL_PASS';
      return {
        reason: 'TOLL_REVIEW_DUPLICATE_CLEARED',
        nextVehicleId: candidate.vehicleId,
        nextMatchState: resolved ? 'MATCHED' : 'VEHICLE_UNRESOLVED',
        nextReviewState: 'CONFIRMED',
        duplicateOfCandidateId: null,
      };
    }

    if (input.action === 'REOPEN') {
      return {
        reason: 'TOLL_REVIEW_REOPENED',
        nextVehicleId: candidate.vehicleId,
        nextMatchState: candidate.matchState,
        nextReviewState: 'REOPENED',
        duplicateOfCandidateId: null,
      };
    }

    return {
      reason: 'TOLL_REVIEW_CONFIRMED',
      nextVehicleId: candidate.vehicleId,
      nextMatchState: candidate.matchState,
      nextReviewState: 'CONFIRMED',
      duplicateOfCandidateId: null,
    };
  }

  /* ------------------------------- Noi bo ------------------------------- */

  private requireBusinessDate(value: string): BusinessDate {
    try {
      return assertBusinessDate(value);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid('BUSINESS_DATE_INVALID', error.message);
      }
      throw error;
    }
  }

  /** Telemetry LUON fail-open — thieu no thi nghiep vu van chay (`.claude/rules`). */
  private decide(
    point: Parameters<TelemetryService['decision']>[0]['point'],
    outcome: 'allowed' | 'denied',
    reason: string,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_TOLL_DECISIONS,
      point: point as never,
      outcome,
      reason: reason as never,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
