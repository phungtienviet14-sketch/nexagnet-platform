import { randomUUID } from 'node:crypto';
import {
  AssetComplianceRepository,
  type CancelWorkOrderInput,
  type CloseWorkOrderOutcome,
  type CompleteWorkOrderInput,
  type ComplianceDocumentFilter,
  type CreateMaintenancePlanInput,
  type OpenWorkOrderInput,
  type RegisterComplianceDocumentInput,
  type UpdateMaintenancePlanInput,
} from './asset-compliance.repository.js';
import type {
  ComplianceDocument,
  ComplianceDocumentStatus,
  MaintenancePlan,
  MaintenanceWorkOrder,
} from './asset-compliance.types.js';

const iso = (at: Date): string => at.toISOString();

/** Bo cac khoa `undefined` truoc khi trai len ban ghi cu — mot PATCH khong duoc thanh mot PUT. */
function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * Ban trong bo nho cua `AssetComplianceRepository`.
 *
 * CUNG BAT BIEN NGHIEP VU voi ban Prisma — dac biet la "mot lenh dang mo cho moi ke hoach". Neu
 * ban nay de lot ban thu hai thi cac bai `*.service.spec.ts` se xanh trong khi duong that do o
 * unique cua DB, va do dung la kieu do lech ma hai hien thuc cua mot kho sinh ra.
 *
 * Cai ban nay CO Y khong mo phong: khoa hang va nguoi ghi dong thoi. Do la viec cua
 * `*.int.spec.ts` tren Postgres that.
 */
export class InMemoryAssetComplianceRepository extends AssetComplianceRepository {
  private readonly plans = new Map<string, MaintenancePlan>();
  private readonly workOrders = new Map<string, MaintenanceWorkOrder>();
  private readonly documents = new Map<string, ComplianceDocument>();

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  async createPlan(input: CreateMaintenancePlanInput): Promise<MaintenancePlan> {
    const at = iso(this.now());
    const plan: MaintenancePlan = {
      id: randomUUID(),
      vehicleId: input.vehicleId,
      name: input.name,
      triggerKind: input.triggerKind,
      intervalKm: input.intervalKm ?? null,
      intervalDays: input.intervalDays ?? null,
      baselineOdoKm: input.baselineOdoKm,
      baselineDate: input.baselineDate,
      status: 'ACTIVE',
      createdBy: input.createdBy,
      createdAt: at,
      updatedAt: at,
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  async updatePlan(id: string, patch: UpdateMaintenancePlanInput): Promise<MaintenancePlan | null> {
    const current = this.plans.get(id);
    if (!current) return null;
    const next: MaintenancePlan = { ...current, ...prune(patch), updatedAt: iso(this.now()) };
    this.plans.set(id, next);
    return next;
  }

  async findPlan(id: string): Promise<MaintenancePlan | null> {
    return this.plans.get(id) ?? null;
  }

  async listPlans(vehicleId?: string): Promise<MaintenancePlan[]> {
    return [...this.plans.values()].filter(
      (plan) => vehicleId === undefined || plan.vehicleId === vehicleId,
    );
  }

  async openWorkOrder(input: OpenWorkOrderInput): Promise<MaintenanceWorkOrder | null> {
    if (input.planId !== null) {
      const clash = [...this.workOrders.values()].some(
        (order) => order.planId === input.planId && order.status === 'OPEN',
      );
      if (clash) return null;
    }
    const at = iso(this.now());
    const order: MaintenanceWorkOrder = {
      id: randomUUID(),
      vehicleId: input.vehicleId,
      planId: input.planId,
      status: 'OPEN',
      description: input.description,
      openedDate: input.openedDate,
      openedOdoKm: input.openedOdoKm,
      openedBy: input.openedBy,
      openedAt: at,
      completedDate: null,
      completedOdoKm: null,
      completedBy: null,
      completedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      costAmount: null,
      currencyCode: 'VND',
      costingExpenseRef: null,
      note: input.note ?? null,
      updatedAt: at,
    };
    this.workOrders.set(order.id, order);
    return order;
  }

  async completeWorkOrder(
    id: string,
    input: CompleteWorkOrderInput,
  ): Promise<CloseWorkOrderOutcome> {
    const current = this.workOrders.get(id);
    if (!current) return { kind: 'NOT_FOUND' };
    if (current.status !== 'OPEN') return { kind: 'NOT_OPEN', status: current.status };
    const next: MaintenanceWorkOrder = {
      ...current,
      status: 'COMPLETED',
      completedDate: input.completedDate,
      completedOdoKm: input.completedOdoKm,
      completedBy: input.completedBy,
      completedAt: iso(input.completedAt),
      costAmount: input.costAmount ?? current.costAmount,
      costingExpenseRef: input.costingExpenseRef ?? current.costingExpenseRef,
      note: input.note ?? current.note,
      updatedAt: iso(this.now()),
    };
    this.workOrders.set(id, next);
    return { kind: 'CLOSED', workOrder: next };
  }

  async cancelWorkOrder(id: string, input: CancelWorkOrderInput): Promise<CloseWorkOrderOutcome> {
    const current = this.workOrders.get(id);
    if (!current) return { kind: 'NOT_FOUND' };
    if (current.status !== 'OPEN') return { kind: 'NOT_OPEN', status: current.status };
    const next: MaintenanceWorkOrder = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: iso(input.cancelledAt),
      cancelledBy: input.cancelledBy,
      cancellationReason: input.reason,
      updatedAt: iso(this.now()),
    };
    this.workOrders.set(id, next);
    return { kind: 'CLOSED', workOrder: next };
  }

  async findWorkOrder(id: string): Promise<MaintenanceWorkOrder | null> {
    return this.workOrders.get(id) ?? null;
  }

  async listWorkOrders(vehicleId?: string): Promise<MaintenanceWorkOrder[]> {
    return [...this.workOrders.values()].filter(
      (order) => vehicleId === undefined || order.vehicleId === vehicleId,
    );
  }

  async registerDocument(input: RegisterComplianceDocumentInput): Promise<ComplianceDocument> {
    const at = iso(this.now());
    const document: ComplianceDocument = {
      id: randomUUID(),
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      documentType: input.documentType,
      documentNo: input.documentNo ?? null,
      validFrom: input.validFrom,
      validTo: input.validTo,
      status: 'ACTIVE',
      evidenceRef: input.evidenceRef ?? null,
      note: input.note ?? null,
      recordedBy: input.recordedBy,
      createdAt: at,
      updatedAt: at,
    };
    this.documents.set(document.id, document);
    return document;
  }

  async setDocumentStatus(
    id: string,
    status: ComplianceDocumentStatus,
  ): Promise<ComplianceDocument | null> {
    const current = this.documents.get(id);
    if (!current) return null;
    const next: ComplianceDocument = { ...current, status, updatedAt: iso(this.now()) };
    this.documents.set(id, next);
    return next;
  }

  async findDocument(id: string): Promise<ComplianceDocument | null> {
    return this.documents.get(id) ?? null;
  }

  async listDocuments(filter?: ComplianceDocumentFilter): Promise<ComplianceDocument[]> {
    return [...this.documents.values()].filter(
      (document) =>
        (filter?.subjectKind === undefined || document.subjectKind === filter.subjectKind) &&
        (filter?.subjectId === undefined || document.subjectId === filter.subjectId) &&
        (filter?.documentType === undefined || document.documentType === filter.documentType) &&
        (filter?.status === undefined || document.status === filter.status),
    );
  }
}
