import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { assertBusinessDate, type BusinessDate } from '../business-date.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_ASSET_COMPLIANCE_DECISIONS } from './asset-compliance-decisions.js';
import { AssetComplianceCoreFacts } from './asset-compliance.ports.js';
import {
  AssetComplianceRepository,
  type CancelWorkOrderInput,
  type CompleteWorkOrderInput,
  type CreateMaintenancePlanInput,
  type OpenWorkOrderInput,
  type RegisterComplianceDocumentInput,
  type UpdateMaintenancePlanInput,
} from './asset-compliance.repository.js';
import type {
  ComplianceDocument,
  MaintenancePlan,
  MaintenanceTriggerKind,
  MaintenanceWorkOrder,
} from './asset-compliance.types.js';

/**
 * Duong GHI cua `transport-asset-compliance`.
 *
 * MOI CONG o day co mot ma quyet dinh RIENG khi tu choi. Khong gop: nguoi truc doc trace can biet
 * ngay la lenh sua khong mo duoc vi *ke hoach da co lenh dang mo*, vi *xe khong ton tai*, hay vi
 * *ke hoach khong ton tai* — ba viec phai lam khac han nhau.
 *
 * KHONG GHI NGUOC vao `transport-core`. Trang thai hieu luc cua xe la mot phep hop thanh doc luc
 * DOC (`AssetComplianceReadService`); service nay khong dong vao cot `TransportVehicle.status`, va
 * cong `AssetComplianceCoreFacts` khong cho no lam vay du co muon.
 */
@Injectable()
export class AssetComplianceService {
  constructor(
    private readonly repository: AssetComplianceRepository,
    private readonly core: AssetComplianceCoreFacts,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /**
   * `intervalKm`/`intervalDays` phai khop `triggerKind`.
   *
   * Kiem o day DU DA co `CHECK` cung noi dung duoi DB: mot `CHECK` cho ra loi cua Postgres, con
   * nguoi dung can mot ma cua mien de giao dien chi duoc "sua o day". Hai lop nay khong thua nhau
   * — lop tren de noi chuyen, lop duoi de dung khi co nguoi ghi thang vao DB.
   */
  private assertIntervalShape(
    triggerKind: MaintenanceTriggerKind,
    intervalKm: number | null | undefined,
    intervalDays: number | null | undefined,
  ): void {
    const hasKm = typeof intervalKm === 'number';
    const hasDays = typeof intervalDays === 'number';
    const valid =
      (triggerKind === 'ODOMETER' && hasKm && !hasDays) ||
      (triggerKind === 'CALENDAR' && hasDays && !hasKm) ||
      (triggerKind === 'ODOMETER_OR_CALENDAR' && hasKm && hasDays);
    if (!valid) {
      throw TransportDomainError.invalid(
        'MAINTENANCE_INTERVAL_MISMATCH',
        `Chu ky bao duong khong khop can cu ${triggerKind}`,
      );
    }
  }

  async schedulePlan(input: CreateMaintenancePlanInput): Promise<MaintenancePlan> {
    this.assertIntervalShape(input.triggerKind, input.intervalKm, input.intervalDays);
    assertBusinessDate(input.baselineDate);
    const vehicle = await this.core.findVehicle(input.vehicleId);
    if (!vehicle) {
      throw TransportDomainError.notFound(
        'MAINTENANCE_VEHICLE_NOT_FOUND',
        `Khong tim thay xe ${input.vehicleId}`,
      );
    }
    return this.repository.createPlan(input);
  }

  async updatePlan(id: string, patch: UpdateMaintenancePlanInput): Promise<MaintenancePlan> {
    const current = await this.repository.findPlan(id);
    if (!current) {
      throw TransportDomainError.notFound(
        'MAINTENANCE_PLAN_NOT_FOUND',
        `Khong tim thay ke hoach ${id}`,
      );
    }
    const triggerKind = patch.triggerKind ?? current.triggerKind;
    const intervalKm = patch.intervalKm === undefined ? current.intervalKm : patch.intervalKm;
    const intervalDays =
      patch.intervalDays === undefined ? current.intervalDays : patch.intervalDays;
    this.assertIntervalShape(triggerKind, intervalKm, intervalDays);
    const updated = await this.repository.updatePlan(id, patch);
    if (!updated) {
      throw TransportDomainError.notFound(
        'MAINTENANCE_PLAN_NOT_FOUND',
        `Khong tim thay ke hoach ${id}`,
      );
    }
    return updated;
  }

  async openWorkOrder(input: OpenWorkOrderInput): Promise<MaintenanceWorkOrder> {
    assertBusinessDate(input.openedDate);
    const vehicle = await this.core.findVehicle(input.vehicleId);
    if (!vehicle) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'maintenance.work_order_open',
        outcome: 'denied',
        reason: 'MAINTENANCE_VEHICLE_UNKNOWN',
        detail: { vehicleId: input.vehicleId },
      });
      throw TransportDomainError.notFound(
        'MAINTENANCE_VEHICLE_NOT_FOUND',
        `Khong tim thay xe ${input.vehicleId}`,
      );
    }

    if (input.planId !== null) {
      const plan = await this.repository.findPlan(input.planId);
      if (!plan) {
        this.telemetry?.decision({
          vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
          point: 'maintenance.work_order_open',
          outcome: 'denied',
          reason: 'MAINTENANCE_PLAN_UNKNOWN',
          detail: { planId: input.planId },
        });
        throw TransportDomainError.notFound(
          'MAINTENANCE_PLAN_NOT_FOUND',
          `Khong tim thay ke hoach ${input.planId}`,
        );
      }
    }

    const created = await this.repository.openWorkOrder(input);
    if (!created) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'maintenance.work_order_open',
        outcome: 'denied',
        reason: 'MAINTENANCE_WORK_ORDER_ALREADY_OPEN',
        detail: { planId: input.planId },
      });
      throw TransportDomainError.conflict(
        'MAINTENANCE_WORK_ORDER_ALREADY_OPEN',
        'Ke hoach nay da co mot lenh sua dang mo',
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
      point: 'maintenance.work_order_open',
      outcome: 'allowed',
      reason: 'MAINTENANCE_WORK_ORDER_OPENED',
      detail: { workOrderId: created.id, vehicleId: created.vehicleId },
    });
    return created;
  }

  async completeWorkOrder(
    id: string,
    input: CompleteWorkOrderInput,
  ): Promise<MaintenanceWorkOrder> {
    assertBusinessDate(input.completedDate);
    const current = await this.repository.findWorkOrder(id);
    if (!current) {
      throw TransportDomainError.notFound(
        'MAINTENANCE_WORK_ORDER_NOT_FOUND',
        `Khong tim thay lenh sua ${id}`,
      );
    }
    if (input.completedOdoKm < current.openedOdoKm) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'maintenance.work_order_close',
        outcome: 'denied',
        reason: 'MAINTENANCE_ODO_REGRESSION',
        detail: {
          workOrderId: id,
          openedOdoKm: current.openedOdoKm,
          completedOdoKm: input.completedOdoKm,
        },
      });
      throw TransportDomainError.invalid(
        'MAINTENANCE_ODO_REGRESSION',
        'So odo luc dong lenh khong duoc nho hon luc mo',
      );
    }

    const outcome = await this.repository.completeWorkOrder(id, input);
    if (outcome.kind === 'NOT_FOUND') {
      throw TransportDomainError.notFound(
        'MAINTENANCE_WORK_ORDER_NOT_FOUND',
        `Khong tim thay lenh sua ${id}`,
      );
    }
    if (outcome.kind === 'NOT_OPEN') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'maintenance.work_order_close',
        outcome: 'denied',
        reason: 'MAINTENANCE_WORK_ORDER_NOT_OPEN',
        detail: { workOrderId: id, status: outcome.status },
      });
      throw TransportDomainError.invalid(
        'MAINTENANCE_WORK_ORDER_NOT_OPEN',
        `Lenh sua dang o trang thai ${outcome.status}`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
      point: 'maintenance.work_order_close',
      outcome: 'allowed',
      reason: 'MAINTENANCE_WORK_ORDER_COMPLETED',
      detail: { workOrderId: id, vehicleId: outcome.workOrder.vehicleId },
    });
    return outcome.workOrder;
  }

  async cancelWorkOrder(id: string, input: CancelWorkOrderInput): Promise<MaintenanceWorkOrder> {
    const outcome = await this.repository.cancelWorkOrder(id, input);
    if (outcome.kind === 'NOT_FOUND') {
      throw TransportDomainError.notFound(
        'MAINTENANCE_WORK_ORDER_NOT_FOUND',
        `Khong tim thay lenh sua ${id}`,
      );
    }
    if (outcome.kind === 'NOT_OPEN') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'maintenance.work_order_close',
        outcome: 'denied',
        reason: 'MAINTENANCE_WORK_ORDER_NOT_OPEN',
        detail: { workOrderId: id, status: outcome.status },
      });
      throw TransportDomainError.invalid(
        'MAINTENANCE_WORK_ORDER_NOT_OPEN',
        `Lenh sua dang o trang thai ${outcome.status}`,
      );
    }
    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
      point: 'maintenance.work_order_close',
      outcome: 'allowed',
      reason: 'MAINTENANCE_WORK_ORDER_CANCELLED',
      detail: { workOrderId: id },
    });
    return outcome.workOrder;
  }

  /**
   * Su ton tai cua chu the — cho DUY NHAT kiem duoc.
   *
   * `subjectId` la khoa DA DICH (xe hoac lai xe tuy `subjectKind`), va Postgres khong co khoa
   * ngoai da dich. `CHECK ..._subject_shape` duoi DB chi giu duoc HINH DANG (`COMPANY` khong co
   * chu the con); no khong biet mot `subjectId` co tro toi cai gi co that hay khong.
   */
  private async assertSubject(
    subjectKind: RegisterComplianceDocumentInput['subjectKind'],
    subjectId: string | null,
  ): Promise<void> {
    if (subjectKind === 'COMPANY') {
      if (subjectId !== null) {
        this.telemetry?.decision({
          vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
          point: 'compliance.document_register',
          outcome: 'denied',
          reason: 'COMPLIANCE_SUBJECT_SHAPE_INVALID',
          detail: { subjectKind },
        });
        throw TransportDomainError.invalid(
          'COMPLIANCE_SUBJECT_SHAPE_INVALID',
          'Giay to cua cong ty khong gan vao mot xe hay mot nguoi',
        );
      }
      return;
    }

    if (subjectId === null) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'compliance.document_register',
        outcome: 'denied',
        reason: 'COMPLIANCE_SUBJECT_SHAPE_INVALID',
        detail: { subjectKind },
      });
      throw TransportDomainError.invalid(
        'COMPLIANCE_SUBJECT_SHAPE_INVALID',
        `Giay to loai ${subjectKind} phai chi ro chu the`,
      );
    }

    const exists =
      subjectKind === 'VEHICLE'
        ? (await this.core.findVehicle(subjectId)) !== null
        : await this.core.driverExists(subjectId);
    if (!exists) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'compliance.document_register',
        outcome: 'denied',
        reason: 'COMPLIANCE_SUBJECT_UNKNOWN',
        detail: { subjectKind, subjectId },
      });
      throw TransportDomainError.notFound(
        'COMPLIANCE_SUBJECT_NOT_FOUND',
        `Khong tim thay chu the ${subjectKind} ${subjectId}`,
      );
    }
  }

  async registerDocument(input: RegisterComplianceDocumentInput): Promise<ComplianceDocument> {
    const validFrom: BusinessDate = assertBusinessDate(input.validFrom);
    const validTo: BusinessDate = assertBusinessDate(input.validTo);
    if (validFrom > validTo) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'compliance.document_register',
        outcome: 'denied',
        reason: 'COMPLIANCE_VALIDITY_RANGE_INVALID',
        detail: { documentType: input.documentType },
      });
      throw TransportDomainError.invalid(
        'COMPLIANCE_VALIDITY_RANGE_INVALID',
        'Ngay bat dau hieu luc phai truoc hoac bang ngay het han',
      );
    }
    await this.assertSubject(input.subjectKind, input.subjectId);

    const document = await this.repository.registerDocument(input);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
      point: 'compliance.document_register',
      outcome: 'allowed',
      reason: 'COMPLIANCE_DOCUMENT_REGISTERED',
      detail: { documentId: document.id, documentType: document.documentType },
    });
    return document;
  }

  /**
   * Doi trang thai QUAN TRI cua mot ban giay to.
   *
   * KHONG phai duong xoa. `SUPERSEDED` la "da co ban moi thay the", `REVOKED` la "bi thu hoi" —
   * ca hai deu giu nguyen hang cu lam bang chung, va hinh chieu canh bao chi thoi tinh no la ban
   * dai dien (xem `complianceDashboard`).
   */
  async setDocumentStatus(
    id: string,
    status: ComplianceDocument['status'],
  ): Promise<ComplianceDocument> {
    const updated = await this.repository.setDocumentStatus(id, status);
    if (!updated) {
      throw TransportDomainError.notFound(
        'COMPLIANCE_DOCUMENT_NOT_FOUND',
        `Khong tim thay giay to ${id}`,
      );
    }
    return updated;
  }
}
