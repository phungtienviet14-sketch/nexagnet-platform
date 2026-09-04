import type { BusinessDate } from '../business-date.js';
import type {
  ComplianceDocument,
  ComplianceDocumentStatus,
  ComplianceDocumentType,
  ComplianceSubjectKind,
  MaintenancePlan,
  MaintenancePlanStatus,
  MaintenanceTriggerKind,
  MaintenanceWorkOrder,
  MaintenanceWorkOrderStatus,
} from './asset-compliance.types.js';

export interface CreateMaintenancePlanInput {
  readonly vehicleId: string;
  readonly name: string;
  readonly triggerKind: MaintenanceTriggerKind;
  readonly intervalKm?: number | null;
  readonly intervalDays?: number | null;
  readonly baselineOdoKm: number;
  readonly baselineDate: BusinessDate;
  readonly createdBy: string;
}

export interface UpdateMaintenancePlanInput {
  readonly name?: string;
  readonly triggerKind?: MaintenanceTriggerKind;
  readonly intervalKm?: number | null;
  readonly intervalDays?: number | null;
  readonly status?: MaintenancePlanStatus;
}

export interface OpenWorkOrderInput {
  readonly vehicleId: string;
  readonly planId: string | null;
  readonly description: string;
  readonly openedDate: BusinessDate;
  readonly openedOdoKm: number;
  readonly openedBy: string;
  readonly note?: string | null;
}

export interface CompleteWorkOrderInput {
  readonly completedDate: BusinessDate;
  readonly completedOdoKm: number;
  readonly completedBy: string;
  readonly completedAt: Date;
  readonly costAmount?: number | null;
  readonly costingExpenseRef?: string | null;
  readonly note?: string | null;
}

export interface CancelWorkOrderInput {
  readonly cancelledBy: string;
  readonly cancelledAt: Date;
  readonly reason: string;
}

/**
 * Ket cuc CO KIEU thay vi mot ngoai le — cung khuon `ApplyMatchingRunOutcome` cua T4.
 *
 * `NOT_OPEN` khac `NOT_FOUND` ve viec phai lam: cai dau la "nguoi khac vua dong truoc ban, tai
 * lai di", cai sau la "ban dang go nham ma". Gop chung se lam giao dien khong noi duoc dieu do.
 */
export type CloseWorkOrderOutcome =
  | { readonly kind: 'CLOSED'; readonly workOrder: MaintenanceWorkOrder }
  | { readonly kind: 'NOT_OPEN'; readonly status: MaintenanceWorkOrderStatus }
  | { readonly kind: 'NOT_FOUND' };

export interface RegisterComplianceDocumentInput {
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly documentType: ComplianceDocumentType;
  readonly documentNo?: string | null;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate;
  readonly evidenceRef?: string | null;
  readonly note?: string | null;
  readonly recordedBy: string;
}

export interface ComplianceDocumentFilter {
  readonly subjectKind?: ComplianceSubjectKind;
  readonly subjectId?: string;
  readonly documentType?: ComplianceDocumentType;
  readonly status?: ComplianceDocumentStatus;
}

/**
 * Kho cua `TX-06`.
 *
 * KHONG co ham `delete` cho giay to lan lenh sua. Do la co y, cung tinh than `GD-02`: mot ban giay
 * to da ghi la BANG CHUNG (co the la bang chung cua mot ky da qua), va mot lenh sua da tung khoa
 * xe la mot su kien van hanh. Duong "go" la `SUPERSEDED`/`REVOKED` va `CANCELLED` — deu de lai
 * dau vet.
 *
 * KHONG co ham nao doc bang cua capability khac. Chuyen, xe va lai xe den qua
 * `AssetComplianceCoreFacts` (`asset-compliance.ports.ts`), va cong do khong co mot ham ghi nao.
 */
export abstract class AssetComplianceRepository {
  abstract createPlan(input: CreateMaintenancePlanInput): Promise<MaintenancePlan>;
  abstract updatePlan(
    id: string,
    patch: UpdateMaintenancePlanInput,
  ): Promise<MaintenancePlan | null>;
  abstract findPlan(id: string): Promise<MaintenancePlan | null>;
  abstract listPlans(vehicleId?: string): Promise<MaintenancePlan[]>;

  /**
   * Tra `null` khi ke hoach do DA co mot lenh dang mo — mot va cham, khong phai "khong tim thay".
   * Duong Prisma dua vao unique mot phan `TransportMaintenanceWorkOrder_one_open_per_plan`, nen ma
   * nay dung ca khi hai nguoi bam cung luc.
   */
  abstract openWorkOrder(input: OpenWorkOrderInput): Promise<MaintenanceWorkOrder | null>;
  abstract completeWorkOrder(
    id: string,
    input: CompleteWorkOrderInput,
  ): Promise<CloseWorkOrderOutcome>;
  abstract cancelWorkOrder(id: string, input: CancelWorkOrderInput): Promise<CloseWorkOrderOutcome>;
  abstract findWorkOrder(id: string): Promise<MaintenanceWorkOrder | null>;
  abstract listWorkOrders(vehicleId?: string): Promise<MaintenanceWorkOrder[]>;

  abstract registerDocument(input: RegisterComplianceDocumentInput): Promise<ComplianceDocument>;
  /** Doi trang thai QUAN TRI. Khong dung cho tinh trang het han — cai do tinh luc doc. */
  abstract setDocumentStatus(
    id: string,
    status: ComplianceDocumentStatus,
  ): Promise<ComplianceDocument | null>;
  abstract findDocument(id: string): Promise<ComplianceDocument | null>;
  abstract listDocuments(filter?: ComplianceDocumentFilter): Promise<ComplianceDocument[]>;
}
