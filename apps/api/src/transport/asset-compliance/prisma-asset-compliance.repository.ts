import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { MAINTENANCE_ONE_OPEN_WORK_ORDER_PER_PLAN } from './asset-compliance-storage-conflict.js';
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

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/**
 * Truy cap delegate CO Y khong go kieu — cung quy uoc voi `prisma-fuel.repository.ts`: tep nay
 * khong phu thuoc vao client duoc sinh ra, nen `pnpm typecheck` chay duoc trong mot worktree chua
 * `prisma generate`.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toPlan = (row: any): MaintenancePlan => ({
  id: row.id,
  vehicleId: row.vehicleId,
  name: row.name,
  triggerKind: row.triggerKind,
  intervalKm: row.intervalKm,
  intervalDays: row.intervalDays,
  baselineOdoKm: row.baselineOdoKm,
  baselineDate: row.baselineDate,
  status: row.status,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toWorkOrder = (row: any): MaintenanceWorkOrder => ({
  id: row.id,
  vehicleId: row.vehicleId,
  planId: row.planId,
  status: row.status,
  description: row.description,
  openedDate: row.openedDate,
  openedOdoKm: row.openedOdoKm,
  openedBy: row.openedBy,
  openedAt: row.openedAt.toISOString(),
  completedDate: row.completedDate,
  completedOdoKm: row.completedOdoKm,
  completedBy: row.completedBy,
  completedAt: iso(row.completedAt),
  cancelledAt: iso(row.cancelledAt),
  cancelledBy: row.cancelledBy,
  cancellationReason: row.cancellationReason,
  costAmount: fromStoredAmount(row.costAmount),
  currencyCode: row.currencyCode,
  costingExpenseRef: row.costingExpenseRef,
  note: row.note,
  updatedAt: row.updatedAt.toISOString(),
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toDocument = (row: any): ComplianceDocument => ({
  id: row.id,
  subjectKind: row.subjectKind,
  subjectId: row.subjectId,
  documentType: row.documentType,
  documentNo: row.documentNo,
  validFrom: row.validFrom,
  validTo: row.validTo,
  status: row.status,
  evidenceRef: row.evidenceRef,
  note: row.note,
  recordedBy: row.recordedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class PrismaAssetComplianceRepository extends AssetComplianceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createPlan(input: CreateMaintenancePlanInput): Promise<MaintenancePlan> {
    const row = await model(this.prisma, 'transportMaintenancePlan').create({
      data: {
        vehicleId: input.vehicleId,
        name: input.name,
        triggerKind: input.triggerKind,
        intervalKm: input.intervalKm ?? null,
        intervalDays: input.intervalDays ?? null,
        baselineOdoKm: input.baselineOdoKm,
        baselineDate: input.baselineDate,
        createdBy: input.createdBy,
      },
    });
    return toPlan(row);
  }

  async updatePlan(id: string, patch: UpdateMaintenancePlanInput): Promise<MaintenancePlan | null> {
    const updated = await model(this.prisma, 'transportMaintenancePlan').updateMany({
      where: { id },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.triggerKind === undefined ? {} : { triggerKind: patch.triggerKind }),
        ...(patch.intervalKm === undefined ? {} : { intervalKm: patch.intervalKm }),
        ...(patch.intervalDays === undefined ? {} : { intervalDays: patch.intervalDays }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      },
    });
    if (updated.count === 0) return null;
    return this.findPlan(id);
  }

  async findPlan(id: string): Promise<MaintenancePlan | null> {
    const row = await model(this.prisma, 'transportMaintenancePlan').findUnique({ where: { id } });
    return row ? toPlan(row) : null;
  }

  async listPlans(vehicleId?: string): Promise<MaintenancePlan[]> {
    const rows = await model(this.prisma, 'transportMaintenancePlan').findMany({
      where: vehicleId === undefined ? {} : { vehicleId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toPlan);
  }

  /**
   * `null` = ke hoach do DA co mot lenh dang mo.
   *
   * Dua vao unique mot phan `TransportMaintenanceWorkOrder_one_open_per_plan` chu KHONG vao mot
   * lan doc truoc do: mot lan doc roi mot lan ghi la hai buoc, va hai nguoi bam cung luc se lot
   * qua khe giua chung. Bat `P2002` la cach duy nhat dung voi nguoi ghi thu hai.
   */
  async openWorkOrder(input: OpenWorkOrderInput): Promise<MaintenanceWorkOrder | null> {
    try {
      const row = await model(this.prisma, 'transportMaintenanceWorkOrder').create({
        data: {
          vehicleId: input.vehicleId,
          planId: input.planId,
          description: input.description,
          openedDate: input.openedDate,
          openedOdoKm: input.openedOdoKm,
          openedBy: input.openedBy,
          note: input.note ?? null,
        },
      });
      return toWorkOrder(row);
    } catch (error) {
      if (isUniqueViolationOn(error, MAINTENANCE_ONE_OPEN_WORK_ORDER_PER_PLAN)) return null;
      throw error;
    }
  }

  /**
   * Dieu kien nam TRONG lenh ghi (`where: { id, status: 'OPEN' }`), khong o mot lan doc truoc do —
   * cung khuon `setEntryVerification` cua T4. `updateMany` chu khong `update` vi `update` doi mot
   * `where` duy nhat, ma dieu kien o day gom ca trang thai.
   */
  private async closeWorkOrder(
    id: string,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    data: Record<string, any>,
  ): Promise<CloseWorkOrderOutcome> {
    const updated = await model(this.prisma, 'transportMaintenanceWorkOrder').updateMany({
      where: { id, status: 'OPEN' },
      data,
    });
    if (updated.count === 1) {
      const row = await model(this.prisma, 'transportMaintenanceWorkOrder').findUnique({
        where: { id },
      });
      return { kind: 'CLOSED', workOrder: toWorkOrder(row) };
    }
    const current = await model(this.prisma, 'transportMaintenanceWorkOrder').findUnique({
      where: { id },
    });
    if (!current) return { kind: 'NOT_FOUND' };
    return { kind: 'NOT_OPEN', status: current.status };
  }

  async completeWorkOrder(
    id: string,
    input: CompleteWorkOrderInput,
  ): Promise<CloseWorkOrderOutcome> {
    return this.closeWorkOrder(id, {
      status: 'COMPLETED',
      completedDate: input.completedDate,
      completedOdoKm: input.completedOdoKm,
      completedBy: input.completedBy,
      completedAt: input.completedAt,
      ...(input.costAmount === undefined ? {} : { costAmount: toStoredAmount(input.costAmount) }),
      ...(input.costingExpenseRef === undefined
        ? {}
        : { costingExpenseRef: input.costingExpenseRef }),
      ...(input.note === undefined ? {} : { note: input.note }),
    });
  }

  async cancelWorkOrder(id: string, input: CancelWorkOrderInput): Promise<CloseWorkOrderOutcome> {
    return this.closeWorkOrder(id, {
      status: 'CANCELLED',
      cancelledAt: input.cancelledAt,
      cancelledBy: input.cancelledBy,
      cancellationReason: input.reason,
    });
  }

  async findWorkOrder(id: string): Promise<MaintenanceWorkOrder | null> {
    const row = await model(this.prisma, 'transportMaintenanceWorkOrder').findUnique({
      where: { id },
    });
    return row ? toWorkOrder(row) : null;
  }

  async listWorkOrders(vehicleId?: string): Promise<MaintenanceWorkOrder[]> {
    const rows = await model(this.prisma, 'transportMaintenanceWorkOrder').findMany({
      where: vehicleId === undefined ? {} : { vehicleId },
      orderBy: [{ openedDate: 'desc' }, { openedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toWorkOrder);
  }

  async registerDocument(input: RegisterComplianceDocumentInput): Promise<ComplianceDocument> {
    const row = await model(this.prisma, 'transportComplianceDocument').create({
      data: {
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        documentType: input.documentType,
        documentNo: input.documentNo ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo,
        evidenceRef: input.evidenceRef ?? null,
        note: input.note ?? null,
        recordedBy: input.recordedBy,
      },
    });
    return toDocument(row);
  }

  async setDocumentStatus(
    id: string,
    status: ComplianceDocumentStatus,
  ): Promise<ComplianceDocument | null> {
    const updated = await model(this.prisma, 'transportComplianceDocument').updateMany({
      where: { id },
      data: { status },
    });
    if (updated.count === 0) return null;
    return this.findDocument(id);
  }

  async findDocument(id: string): Promise<ComplianceDocument | null> {
    const row = await model(this.prisma, 'transportComplianceDocument').findUnique({
      where: { id },
    });
    return row ? toDocument(row) : null;
  }

  async listDocuments(filter?: ComplianceDocumentFilter): Promise<ComplianceDocument[]> {
    const rows = await model(this.prisma, 'transportComplianceDocument').findMany({
      where: {
        ...(filter?.subjectKind === undefined ? {} : { subjectKind: filter.subjectKind }),
        ...(filter?.subjectId === undefined ? {} : { subjectId: filter.subjectId }),
        ...(filter?.documentType === undefined ? {} : { documentType: filter.documentType }),
        ...(filter?.status === undefined ? {} : { status: filter.status }),
      },
      orderBy: [{ validTo: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDocument);
  }
}
