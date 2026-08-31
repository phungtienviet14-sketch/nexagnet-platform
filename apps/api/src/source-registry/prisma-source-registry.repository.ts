import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { SourceRegistryRepository } from './source-registry.repository.js';
import { assertWithinScope, type TenantScope } from './tenant-scope.js';
import type {
  BusinessApprovalRecord,
  BusinessConflictRecord,
  BusinessFactRecord,
  BusinessRequiredFactRecord,
  BusinessSourceRecord,
} from './source-registry.types.js';
import type { ConflictStatus } from './conflict-lifecycle.js';
import type { FactStatus } from './fact-lifecycle.js';
import type { SourceStatus } from './source-lifecycle.js';

/**
 * Kho tren POSTGRES — nguon su that nghiep vu, dung nghia hop dong bon mat phang.
 *
 * MOI cau truy van deu mang `tenantId` trong `where`. Do khong phai phong xa: ngay dau tien hai
 * khach dung chung mot DB, cau `where` nay la thu duy nhat con dung — va no phai co san TU TRUOC
 * ngay do, vi khong ai di them dieu kien `where` cho ba muoi ham sau khi su co da xay ra.
 *
 * `assertWithinScope` chay them mot lan o duong GHI. Hai lop co y trung nhau: `where` bao ve truy
 * van dung, khang dinh bao ve duong doc moi ma ai do quen dieu kien.
 */
@Injectable()
export class PrismaSourceRegistryRepository extends SourceRegistryRepository {
  /**
   * Nhan `PrismaClient` chu khong `PrismaService`: kho nay duoc dung o CA HAI noi — trong tien
   * trinh NestJS (nhan `PrismaService`, von extends `PrismaClient`) va trong tien trinh MCP dung
   * rieng (tu tao mot `PrismaClient` tran). Buoc kieu hep hon se lam noi thu hai phai ep kieu.
   */
  constructor(
    private readonly prisma: PrismaClient,
    /**
     * `true` khi `prisma` la client CUA MOT GIAO DICH dang mo, khong phai client goc.
     *
     * Prisma khong cho long `$transaction` ben trong mot giao dich tuong tac — `TransactionClient`
     * khong co phuong thuc do. Nen co nay la thu bien `runInTransaction` thanh TAI NHAP DUOC:
     * lop trong nhan ra minh dang o trong mot don vi roi va chi chay tiep tren chinh no.
     */
    private readonly insideTransaction = false,
  ) {
    super();
  }

  async runInTransaction<T>(
    fn: (repository: SourceRegistryRepository) => Promise<T>,
  ): Promise<T> {
    if (this.insideTransaction) return fn(this);

    return this.prisma.$transaction(async (tx) =>
      // `tx` la `Prisma.TransactionClient`: dung cac model delegate ma kho nay dung, thieu
      // `$connect`/`$transaction` ma kho nay khong dung. Ep kieu o DUNG mot cho nay thay vi noi
      // long kieu cua `prisma` ca lop.
      fn(new PrismaSourceRegistryRepository(tx as unknown as PrismaClient, true)),
    );
  }

  // ----- Nguon -----

  async createSource(
    scope: TenantScope,
    input: Omit<BusinessSourceRecord, 'id' | 'tenantId'> & { readonly id?: string },
  ): Promise<BusinessSourceRecord> {
    const row = await this.prisma.businessSource.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        tenantId: scope.tenantId,
        sourceKey: input.sourceKey,
        title: input.title,
        kind: input.kind,
        version: input.version,
        origin: input.origin,
        authority: input.authority,
        classification: input.classification,
        status: input.status,
        locator: input.locator,
        contentHash: input.contentHash,
        byteSize: input.byteSize,
        receivedAt: input.receivedAt,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        supersedesId: input.supersedesId,
        note: input.note,
      },
    });
    return toSource(row);
  }

  async findSourceById(scope: TenantScope, id: string): Promise<BusinessSourceRecord | null> {
    const row = await this.prisma.businessSource.findFirst({
      where: { id, tenantId: scope.tenantId },
    });
    return row ? toSource(row) : null;
  }

  async findSourceByHash(
    scope: TenantScope,
    sourceKey: string,
    contentHash: string,
  ): Promise<BusinessSourceRecord | null> {
    const row = await this.prisma.businessSource.findFirst({
      where: { tenantId: scope.tenantId, sourceKey, contentHash },
    });
    return row ? toSource(row) : null;
  }

  async listSources(
    scope: TenantScope,
    filter: { readonly status?: SourceStatus; readonly sourceKey?: string } = {},
  ): Promise<readonly BusinessSourceRecord[]> {
    const rows = await this.prisma.businessSource.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.sourceKey ? { sourceKey: filter.sourceKey } : {}),
      },
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map(toSource);
  }

  async updateSource(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessSourceRecord, 'id' | 'tenantId'>>,
  ): Promise<BusinessSourceRecord> {
    const current = await this.prisma.businessSource.findUnique({ where: { id } });
    assertWithinScope(scope, current, `Nguon ${id}`);
    const row = await this.prisma.businessSource.update({
      where: { id },
      data: patch as Prisma.BusinessSourceUpdateInput,
    });
    return toSource(row);
  }

  // ----- Su that -----

  async createFact(
    scope: TenantScope,
    input: Omit<BusinessFactRecord, 'id' | 'tenantId' | 'createdAt'> & {
      readonly id?: string;
      readonly createdAt?: Date;
    },
  ): Promise<BusinessFactRecord> {
    const row = await this.prisma.businessFact.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        tenantId: scope.tenantId,
        domain: input.domain,
        key: input.key,
        value: input.value as Prisma.InputJsonValue,
        status: input.status,
        classification: input.classification,
        sourceId: input.sourceId,
        sourceLocus: input.sourceLocus,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        assumptionRationale: input.assumptionRationale,
        assumptionRisk: input.assumptionRisk,
        assumptionReversibility: input.assumptionReversibility,
        assumptionOwner: input.assumptionOwner,
        supersedesId: input.supersedesId,
      },
    });
    return toFact(row);
  }

  async findFactById(scope: TenantScope, id: string): Promise<BusinessFactRecord | null> {
    const row = await this.prisma.businessFact.findFirst({
      where: { id, tenantId: scope.tenantId },
    });
    return row ? toFact(row) : null;
  }

  async listFactHistory(
    scope: TenantScope,
    domain: string,
    key: string,
  ): Promise<readonly BusinessFactRecord[]> {
    const rows = await this.prisma.businessFact.findMany({
      where: { tenantId: scope.tenantId, domain, key },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toFact);
  }

  async listFacts(
    scope: TenantScope,
    filter: { readonly domain?: string; readonly status?: FactStatus } = {},
  ): Promise<readonly BusinessFactRecord[]> {
    const rows = await this.prisma.businessFact.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(filter.domain ? { domain: filter.domain } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toFact);
  }

  async updateFact(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessFactRecord, 'id' | 'tenantId'>>,
  ): Promise<BusinessFactRecord> {
    const current = await this.prisma.businessFact.findUnique({ where: { id } });
    assertWithinScope(scope, current, `Su that ${id}`);
    const { value, ...rest } = patch;
    const row = await this.prisma.businessFact.update({
      where: { id },
      data: {
        ...(rest as Prisma.BusinessFactUpdateInput),
        ...(value === undefined ? {} : { value: value as Prisma.InputJsonValue }),
      },
    });
    return toFact(row);
  }

  // ----- Xung dot -----

  async createConflict(
    scope: TenantScope,
    input: Omit<BusinessConflictRecord, 'id' | 'tenantId' | 'openedAt'> & {
      readonly id?: string;
      readonly openedAt?: Date;
    },
  ): Promise<BusinessConflictRecord> {
    const row = await this.prisma.businessConflict.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        ...(input.openedAt ? { openedAt: input.openedAt } : {}),
        tenantId: scope.tenantId,
        conflictKey: input.conflictKey,
        domain: input.domain,
        subjectKey: input.subjectKey,
        summary: input.summary,
        impact: input.impact,
        status: input.status,
        recommendedFactId: input.recommendedFactId,
        recommendationReason: input.recommendationReason,
        resolvedFactId: input.resolvedFactId,
        resolutionActor: input.resolutionActor,
        resolutionRef: input.resolutionRef,
        resolutionNote: input.resolutionNote,
        resolvedAt: input.resolvedAt,
        facts: { create: input.factIds.map((factId) => ({ factId })) },
      },
      include: { facts: true },
    });
    return toConflict(row);
  }

  async findConflictById(scope: TenantScope, id: string): Promise<BusinessConflictRecord | null> {
    const row = await this.prisma.businessConflict.findFirst({
      where: { id, tenantId: scope.tenantId },
      include: { facts: true },
    });
    return row ? toConflict(row) : null;
  }

  async findConflictByKey(
    scope: TenantScope,
    conflictKey: string,
  ): Promise<BusinessConflictRecord | null> {
    const row = await this.prisma.businessConflict.findFirst({
      where: { tenantId: scope.tenantId, conflictKey },
      include: { facts: true },
    });
    return row ? toConflict(row) : null;
  }

  async listConflicts(
    scope: TenantScope,
    filter: { readonly status?: ConflictStatus; readonly factId?: string } = {},
  ): Promise<readonly BusinessConflictRecord[]> {
    const rows = await this.prisma.businessConflict.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.factId ? { facts: { some: { factId: filter.factId } } } : {}),
      },
      include: { facts: true },
      orderBy: { openedAt: 'asc' },
    });
    return rows.map(toConflict);
  }

  async updateConflict(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessConflictRecord, 'id' | 'tenantId' | 'factIds'>>,
  ): Promise<BusinessConflictRecord> {
    const current = await this.prisma.businessConflict.findUnique({ where: { id } });
    assertWithinScope(scope, current, `Xung dot ${id}`);
    const row = await this.prisma.businessConflict.update({
      where: { id },
      data: patch as Prisma.BusinessConflictUpdateInput,
      include: { facts: true },
    });
    return toConflict(row);
  }

  // ----- Phe duyet -----

  async createApproval(
    scope: TenantScope,
    input: Omit<BusinessApprovalRecord, 'id' | 'tenantId' | 'decidedAt'> & {
      readonly id?: string;
      readonly decidedAt?: Date;
    },
  ): Promise<BusinessApprovalRecord> {
    const row = await this.prisma.businessApproval.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        ...(input.decidedAt ? { decidedAt: input.decidedAt } : {}),
        tenantId: scope.tenantId,
        level: input.level,
        actor: input.actor,
        evidenceRef: input.evidenceRef,
        note: input.note,
        sourceId: input.sourceId,
        factId: input.factId,
      },
    });
    return toApproval(row);
  }

  async listApprovals(
    scope: TenantScope,
    filter: { readonly sourceId?: string; readonly factId?: string },
  ): Promise<readonly BusinessApprovalRecord[]> {
    const rows = await this.prisma.businessApproval.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
        ...(filter.factId ? { factId: filter.factId } : {}),
      },
      orderBy: { decidedAt: 'asc' },
    });
    return rows.map(toApproval);
  }

  // ----- Su that bat buoc -----

  async upsertRequiredFact(
    scope: TenantScope,
    input: Omit<BusinessRequiredFactRecord, 'id' | 'tenantId'>,
  ): Promise<BusinessRequiredFactRecord> {
    const row = await this.prisma.businessRequiredFact.upsert({
      where: {
        tenantId_capability_domain_key: {
          tenantId: scope.tenantId,
          capability: input.capability,
          domain: input.domain,
          key: input.key,
        },
      },
      create: { tenantId: scope.tenantId, ...input },
      update: { requiresConfirmed: input.requiresConfirmed, note: input.note },
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      capability: row.capability,
      domain: row.domain,
      key: row.key,
      requiresConfirmed: row.requiresConfirmed,
      note: row.note,
    };
  }

  async listRequiredFacts(
    scope: TenantScope,
    capability?: string,
  ): Promise<readonly BusinessRequiredFactRecord[]> {
    const rows = await this.prisma.businessRequiredFact.findMany({
      where: { tenantId: scope.tenantId, ...(capability ? { capability } : {}) },
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      capability: row.capability,
      domain: row.domain,
      key: row.key,
      requiresConfirmed: row.requiresConfirmed,
      note: row.note,
    }));
  }
}

/* ------------------------------------------------------------------ *
 * Anh xa hang Prisma -> ban ghi cua mien
 *
 * Enum cua Prisma va literal union cua mien TRUNG NHAU tung ky tu (co bai test khoa dieu do o
 * `prisma-schema.contract`), nen ep kieu o day la an toan — nhung van ep TUONG MINH de ngay ai do
 * doi mot ben, TypeScript keu o dung bon ham nay chu khong keu rai rac ba muoi cho.
 * ------------------------------------------------------------------ */

type SourceRow = Awaited<ReturnType<PrismaClient['businessSource']['create']>>;
type FactRow = Awaited<ReturnType<PrismaClient['businessFact']['create']>>;
type ApprovalRow = Awaited<ReturnType<PrismaClient['businessApproval']['create']>>;
type ConflictRow = Awaited<ReturnType<PrismaClient['businessConflict']['create']>> & {
  facts?: { factId: string }[];
};

const toSource = (row: SourceRow): BusinessSourceRecord => ({
  id: row.id,
  tenantId: row.tenantId,
  sourceKey: row.sourceKey,
  title: row.title,
  kind: row.kind,
  version: row.version,
  origin: row.origin,
  authority: row.authority,
  classification: row.classification,
  status: row.status,
  locator: row.locator,
  contentHash: row.contentHash,
  byteSize: row.byteSize,
  receivedAt: row.receivedAt,
  effectiveFrom: row.effectiveFrom,
  effectiveTo: row.effectiveTo,
  supersedesId: row.supersedesId,
  note: row.note,
});

const toFact = (row: FactRow): BusinessFactRecord => ({
  id: row.id,
  tenantId: row.tenantId,
  domain: row.domain,
  key: row.key,
  value: row.value,
  status: row.status,
  classification: row.classification,
  sourceId: row.sourceId,
  sourceLocus: row.sourceLocus,
  effectiveFrom: row.effectiveFrom,
  effectiveTo: row.effectiveTo,
  assumptionRationale: row.assumptionRationale,
  assumptionRisk: row.assumptionRisk,
  assumptionReversibility: row.assumptionReversibility,
  assumptionOwner: row.assumptionOwner,
  supersedesId: row.supersedesId,
  createdAt: row.createdAt,
});

const toConflict = (row: ConflictRow): BusinessConflictRecord => ({
  id: row.id,
  tenantId: row.tenantId,
  conflictKey: row.conflictKey,
  domain: row.domain,
  subjectKey: row.subjectKey,
  summary: row.summary,
  impact: row.impact,
  status: row.status,
  recommendedFactId: row.recommendedFactId,
  recommendationReason: row.recommendationReason,
  resolvedFactId: row.resolvedFactId,
  resolutionActor: row.resolutionActor,
  resolutionRef: row.resolutionRef,
  resolutionNote: row.resolutionNote,
  resolvedAt: row.resolvedAt,
  openedAt: row.openedAt,
  factIds: (row.facts ?? []).map((link) => link.factId),
});

const toApproval = (row: ApprovalRow): BusinessApprovalRecord => ({
  id: row.id,
  tenantId: row.tenantId,
  level: row.level,
  actor: row.actor,
  evidenceRef: row.evidenceRef,
  note: row.note,
  sourceId: row.sourceId,
  factId: row.factId,
  decidedAt: row.decidedAt,
});
