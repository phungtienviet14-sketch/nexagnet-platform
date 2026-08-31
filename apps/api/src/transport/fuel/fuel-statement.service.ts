import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate } from '../business-date.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_FUEL_DECISIONS } from './fuel-decisions.js';
import { TRANSPORT_FUEL_POLICY, type TransportFuelPolicy } from './fuel-policy.js';
import {
  mapStatementRows,
  missingStatementColumns,
  normalizePlate,
  type MappedStatementLine,
} from './fuel-statement-mapping.js';
import { FuelStatementSource } from './fuel-statement-source.js';
import { TransportFuelCoreFacts } from './fuel.ports.js';
import { FuelRepository } from './fuel.repository.js';
import type {
  FuelReconciliation,
  FuelStatementFormat,
  FuelStatementLine,
  FuelSupplier,
  FuelSupplierStatement,
} from './fuel.types.js';

export interface ImportStatementCommand {
  readonly supplierId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly filename: string;
  readonly format: FuelStatementFormat;
  /** Noi dung file, ma hoa base64. Bien gioi HTTP khong nhan byte tho. */
  readonly contentBase64: string;
}

/**
 * KET QUA THU — moi thu nguoi nhap can thay TRUOC khi ghi mot hang nao.
 *
 * Dem theo TUNG LY DO chu khong chi mot con so "bi tu choi": mot file bi tu choi 40 dong vi sai
 * anh xa cot va mot file bi tu choi 40 dong vi bien so la doi hai viec khac han nhau.
 */
export interface StatementImportPreview {
  readonly headers: readonly string[];
  readonly rowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly rejectionsByReason: Readonly<Record<string, number>>;
  readonly lines: readonly MappedStatementLine[];
  readonly sourceDigest: string;
}

export interface ImportedStatement {
  readonly statement: FuelSupplierStatement;
  readonly lines: readonly FuelStatementLine[];
  readonly reconciliation: FuelReconciliation;
  readonly preview: StatementImportPreview;
}

/**
 * NHAP BANG KE CAY XANG — `GD-07`.
 *
 * ===========================================================================
 * HAI DUONG, MOT PHEP DOC: `preview` va `commit` chay CUNG mot ham anh xa.
 *
 * Neu duong thu chay mot bo luat va duong ghi chay mot bo khac, thi con so nguoi dung thay truoc
 * khi bam "nhap" khong phai con so ho nhan duoc sau do — va ho se khong bao gio tin man hinh thu
 * nua. Nen `commit` goi lai dung `buildPreview()` roi ghi ket qua cua no.
 *
 * ===========================================================================
 * MOT BANG KE CHO MOT `(cay xang, ky)` — va nhap lai la mot VA CHAM ON AO.
 *
 * T1 §5. Ghi de se lam bien mat cac cap da khop va cac chenh lech DA CO NGUOI QUYET cua ky do, va
 * nguoi nhap se khong bao gio biet minh vua xoa mat mot buoi doi soat. Nen o day tra
 * `FUEL_STATEMENT_PERIOD_TAKEN` — nguoi dung phai mo lai ky cu hoac sua khoang ngay, va ca hai deu
 * la mot quyet dinh co y thuc.
 */
@Injectable()
export class FuelStatementService {
  constructor(
    private readonly repository: FuelRepository,
    private readonly source: FuelStatementSource,
    private readonly core: TransportFuelCoreFacts,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_FUEL_POLICY) private readonly policy: TransportFuelPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /** DOC THU — khong ghi mot hang nao. Duong nay an toan de bam bao nhieu lan cung duoc. */
  async previewImport(command: ImportStatementCommand): Promise<StatementImportPreview> {
    await this.requireSupplier(command.supplierId);
    this.requirePeriod(command.periodStart, command.periodEnd);
    return this.buildPreview(command);
  }

  async commitImport(command: ImportStatementCommand, actor: string): Promise<ImportedStatement> {
    const supplier = await this.requireSupplier(command.supplierId);
    const period = this.requirePeriod(command.periodStart, command.periodEnd);

    const existing = await this.repository.findStatementByPeriod(
      supplier.id,
      period.start,
      period.end,
    );
    if (existing) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_statement.import',
        outcome: 'denied',
        reason: 'STATEMENT_PERIOD_TAKEN',
        detail: { supplierId: supplier.id, periodStart: period.start, periodEnd: period.end },
      });
      throw TransportDomainError.conflict(
        'FUEL_STATEMENT_PERIOD_TAKEN',
        `Da co bang ke cua cay xang nay cho ky ${period.start}..${period.end}`,
      );
    }

    const preview = await this.buildPreview(command);
    const at = this.now();

    const created = await this.repository.createStatement({
      supplierId: supplier.id,
      periodStart: period.start,
      periodEnd: period.end,
      format: command.format,
      sourceRef: command.filename,
      sourceDigest: preview.sourceDigest,
      lines: preview.lines.map((line) => ({
        rowNumber: line.rowNumber,
        status: line.status,
        rejectReason: line.rejectReason,
        vehiclePlateRaw: line.vehiclePlateRaw,
        vehicleId: line.vehicleId,
        businessDate: line.businessDate,
        litersUnits: line.litersUnits,
        amount: line.amount,
        invoiceNo: line.invoiceNo,
        note: line.note,
        rawValues: line.rawValues,
      })),
      importedBy: actor,
      at,
    });

    /*
     * KY DOI SOAT DUOC MO NGAY, cung mot thao tac nghiep vu voi lan nhap.
     *
     * Khong bat nguoi dung bam mot nut thu hai: mot bang ke da nhap ma chua co ky doi soat la mot
     * trang thai khong lam gi duoc — no khong so khop duoc, khong dong duoc, va khong hien o dau
     * ca. Mot bang ke ton tai la de duoc doi soat; do la ly do duy nhat no duoc nhap vao.
     */
    const reconciliation = await this.repository.createReconciliation({
      supplierId: supplier.id,
      statementId: created.statement.id,
      periodStart: period.start,
      periodEnd: period.end,
      at,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_statement.import',
      outcome: 'allowed',
      reason: 'STATEMENT_IMPORTED',
      detail: {
        statementId: created.statement.id,
        reconciliationId: reconciliation.id,
        rowCount: preview.rowCount,
        acceptedCount: preview.acceptedCount,
        rejectedCount: preview.rejectedCount,
      },
    });
    // MOT dong trace cho MOI ly do tu choi, kem so luong. Nguoi truc doc trace tra loi duoc "file
    // nay hong o dau" ma khong phai mo lai file.
    for (const [reason, count] of Object.entries(preview.rejectionsByReason)) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_statement.import_row',
        outcome: 'denied',
        reason: rowReasonOf(reason),
        detail: { statementId: created.statement.id, count },
      });
    }

    await this.audit.append({
      actor,
      action: 'transport.fuel.statement.import',
      entityType: 'TransportFuelSupplierStatement',
      entityId: created.statement.id,
      after: { statement: created.statement, reconciliationId: reconciliation.id },
    });

    return { ...created, reconciliation, preview };
  }

  /* ---------------------------- Noi bo ---------------------------- */

  private async buildPreview(command: ImportStatementCommand): Promise<StatementImportPreview> {
    const parsed = await this.source.read({
      filename: command.filename,
      format: command.format,
      content: Buffer.from(command.contentBase64, 'base64'),
    });

    const missing = missingStatementColumns([...parsed.headers], this.policy.statement);
    if (missing.length > 0) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_statement.import',
        outcome: 'denied',
        reason: 'STATEMENT_MAPPING_INVALID',
        detail: { filename: command.filename, missing },
      });
      throw TransportDomainError.invalid(
        'FUEL_STATEMENT_MAPPING_INVALID',
        `File ${command.filename} thieu cot bat buoc: ${missing
          .map((key) => this.policy.statement.columns[key])
          .join(', ')}`,
      );
    }

    if (parsed.rows.length === 0) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_statement.import',
        outcome: 'denied',
        reason: 'STATEMENT_EMPTY',
        detail: { filename: command.filename },
      });
      throw TransportDomainError.invalid(
        'FUEL_STATEMENT_EMPTY',
        `File ${command.filename} khong co dong du lieu nao`,
      );
    }

    const vehicles = await this.core.listVehicles();
    const vehicleIdByNormalizedPlate = new Map(
      vehicles.map((vehicle) => [normalizePlate(vehicle.registrationPlate), vehicle.id]),
    );

    const lines = mapStatementRows({
      rows: parsed.rows,
      mapping: this.policy.statement,
      vehicleIdByNormalizedPlate,
    });

    const rejectionsByReason: Record<string, number> = {};
    for (const line of lines) {
      if (line.rejectReason === null) continue;
      rejectionsByReason[line.rejectReason] = (rejectionsByReason[line.rejectReason] ?? 0) + 1;
    }
    const acceptedCount = lines.filter((line) => line.status === 'ACCEPTED').length;

    return {
      headers: parsed.headers,
      rowCount: lines.length,
      acceptedCount,
      rejectedCount: lines.length - acceptedCount,
      rejectionsByReason,
      lines,
      sourceDigest: parsed.digest,
    };
  }

  private async requireSupplier(supplierId: string): Promise<FuelSupplier> {
    const supplier = await this.repository.findSupplier(supplierId);
    if (!supplier) {
      throw TransportDomainError.notFound(
        'FUEL_SUPPLIER_NOT_FOUND',
        `Khong tim thay cay xang ${supplierId}`,
      );
    }
    return supplier;
  }

  private requirePeriod(start: string, end: string): { start: string; end: string } {
    let from: string;
    let to: string;
    try {
      from = assertBusinessDate(start);
      to = assertBusinessDate(end);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid('BUSINESS_DATE_INVALID', error.message);
      }
      throw error;
    }

    if (from > to) {
      throw TransportDomainError.invalid(
        'FUEL_PERIOD_RANGE_INVALID',
        `Ngay dau ky (${from}) phai truoc hoac bang ngay cuoi ky (${to})`,
      );
    }
    return { start: from, end: to };
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

/**
 * Ly do tu choi cua MOT DONG -> ma quyet dinh tuong ung.
 *
 * Hai bo ten khac nhau vi chung o hai tang: mot bo la trang thai LUU TRU
 * (`TransportFuelStatementRejectReason`), mot bo la tu vung QUAN SAT (`fuel_statement.import_row`).
 * Anh xa o DUNG MOT CHO nay; ghep chuoi `'ROW_' + reason` giua service se lam mot lan doi ten enum
 * lang le sinh ra mot ma khong co trong tu vung, va `decision-vocabulary` se nem luc chay.
 */
const ROW_REASONS = {
  MISSING_REQUIRED_FIELD: 'ROW_MISSING_REQUIRED_FIELD',
  MALFORMED_DATE: 'ROW_MALFORMED_DATE',
  MALFORMED_AMOUNT: 'ROW_MALFORMED_AMOUNT',
  MALFORMED_LITERS: 'ROW_MALFORMED_LITERS',
  UNKNOWN_VEHICLE: 'ROW_UNKNOWN_VEHICLE',
  DUPLICATE_ROW: 'ROW_DUPLICATE',
} as const;

type RowReasonKey = keyof typeof ROW_REASONS;

const rowReasonOf = (reason: string): (typeof ROW_REASONS)[RowReasonKey] =>
  ROW_REASONS[reason as RowReasonKey];
