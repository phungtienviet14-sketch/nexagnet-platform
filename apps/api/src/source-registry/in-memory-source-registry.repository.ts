import { randomUUID } from 'node:crypto';
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
 * Kho TRONG BO NHO — mac dinh khi `PERSISTENCE=memory`, va la kho ma phan lon bo test dung.
 *
 * CO Y giu `tenantId` va loc theo no y het ban Postgres, du mot Map trong mot tien trinh chang co
 * ranh gioi ha tang nao. Neu ban nay bo qua pham vi thi bai test cach ly se xanh o day va do o
 * production — tuc bai test do se do dung cai no khong duoc phep do.
 */
export class InMemorySourceRegistryRepository extends SourceRegistryRepository {
  private readonly sources = new Map<string, BusinessSourceRecord>();
  private readonly facts = new Map<string, BusinessFactRecord>();
  private readonly conflicts = new Map<string, BusinessConflictRecord>();
  private readonly approvals = new Map<string, BusinessApprovalRecord>();
  private readonly requiredFacts = new Map<string, BusinessRequiredFactRecord>();

  /** Do sau long nhau cua don vi cong viec dang mo. `0` = dang khong o trong don vi nao. */
  private transactionDepth = 0;

  /**
   * Don vi cong viec trong bo nho: chup lai cac Map truoc khi chay, khoi phuc neu nem.
   *
   * Chup NONG la du va la dung: moi ban ghi o day BAT BIEN — `updateFact`/`updateSource` deu tao
   * doi tuong moi bang spread roi `set` de len, khong bao gio sua tai cho. Nen chup lai chinh cac
   * con tro la khoi phuc duoc nguyen trang.
   *
   * Ban nay CO Y hanh xu y het ban Postgres, du mot Map trong mot tien trinh chang can giao dich
   * gi. Neu no khong roll back thi bai test "that bai khong de lai trang thai" se xanh o day va do
   * o production — tuc bai test do se do dung cai no khong duoc phep do.
   */
  async runInTransaction<T>(
    fn: (repository: SourceRegistryRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionDepth > 0) return fn(this);

    const restore = this.snapshot();
    this.transactionDepth += 1;
    try {
      return await fn(this);
    } catch (error) {
      restore();
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  private snapshot(): () => void {
    const stores: Map<string, unknown>[] = [
      this.sources as Map<string, unknown>,
      this.facts as Map<string, unknown>,
      this.conflicts as Map<string, unknown>,
      this.approvals as Map<string, unknown>,
      this.requiredFacts as Map<string, unknown>,
    ];
    const copies = stores.map((store) => new Map(store));
    return () => {
      stores.forEach((store, index) => {
        store.clear();
        for (const [key, value] of copies[index] ?? []) store.set(key, value);
      });
    };
  }

  private mine<T extends { readonly tenantId: string }>(
    scope: TenantScope,
    store: Map<string, T>,
  ): T[] {
    return [...store.values()].filter((row) => row.tenantId === scope.tenantId);
  }

  // ----- Nguon -----

  async createSource(
    scope: TenantScope,
    input: Omit<BusinessSourceRecord, 'id' | 'tenantId'> & { readonly id?: string },
  ): Promise<BusinessSourceRecord> {
    const record: BusinessSourceRecord = {
      ...input,
      id: input.id ?? randomUUID(),
      tenantId: scope.tenantId,
    };
    this.sources.set(record.id, record);
    return record;
  }

  async findSourceById(scope: TenantScope, id: string): Promise<BusinessSourceRecord | null> {
    const found = this.sources.get(id) ?? null;
    // Loc theo pham vi thay vi nem: "khong ton tai" va "cua khach khac" phai KHONG phan biet duoc
    // tu ben ngoai, neu khong thi chinh cai thong bao loi tro thanh mot kenh do su ton tai.
    return found && found.tenantId === scope.tenantId ? found : null;
  }

  async findSourceByHash(
    scope: TenantScope,
    sourceKey: string,
    contentHash: string,
  ): Promise<BusinessSourceRecord | null> {
    return (
      this.mine(scope, this.sources).find(
        (row) => row.sourceKey === sourceKey && row.contentHash === contentHash,
      ) ?? null
    );
  }

  async listSources(
    scope: TenantScope,
    filter: { readonly status?: SourceStatus; readonly sourceKey?: string } = {},
  ): Promise<readonly BusinessSourceRecord[]> {
    return this.mine(scope, this.sources)
      .filter((row) => (filter.status ? row.status === filter.status : true))
      .filter((row) => (filter.sourceKey ? row.sourceKey === filter.sourceKey : true))
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  async updateSource(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessSourceRecord, 'id' | 'tenantId'>>,
  ): Promise<BusinessSourceRecord> {
    const current = this.sources.get(id) ?? null;
    assertWithinScope(scope, current, `Nguon ${id}`);
    if (!current) throw new Error(`Khong tim thay nguon ${id}`);
    const next: BusinessSourceRecord = { ...current, ...patch };
    this.sources.set(id, next);
    return next;
  }

  // ----- Su that -----

  async createFact(
    scope: TenantScope,
    input: Omit<BusinessFactRecord, 'id' | 'tenantId' | 'createdAt'> & {
      readonly id?: string;
      readonly createdAt?: Date;
    },
  ): Promise<BusinessFactRecord> {
    const record: BusinessFactRecord = {
      ...input,
      id: input.id ?? randomUUID(),
      tenantId: scope.tenantId,
      createdAt: input.createdAt ?? new Date(),
    };
    this.facts.set(record.id, record);
    return record;
  }

  async findFactById(scope: TenantScope, id: string): Promise<BusinessFactRecord | null> {
    const found = this.facts.get(id) ?? null;
    return found && found.tenantId === scope.tenantId ? found : null;
  }

  async listFactHistory(
    scope: TenantScope,
    domain: string,
    key: string,
  ): Promise<readonly BusinessFactRecord[]> {
    return this.mine(scope, this.facts)
      .filter((row) => row.domain === domain && row.key === key)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listFacts(
    scope: TenantScope,
    filter: { readonly domain?: string; readonly status?: FactStatus } = {},
  ): Promise<readonly BusinessFactRecord[]> {
    return this.mine(scope, this.facts)
      .filter((row) => (filter.domain ? row.domain === filter.domain : true))
      .filter((row) => (filter.status ? row.status === filter.status : true))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async updateFact(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessFactRecord, 'id' | 'tenantId'>>,
  ): Promise<BusinessFactRecord> {
    const current = this.facts.get(id) ?? null;
    assertWithinScope(scope, current, `Su that ${id}`);
    if (!current) throw new Error(`Khong tim thay su that ${id}`);
    const next: BusinessFactRecord = { ...current, ...patch };
    this.facts.set(id, next);
    return next;
  }

  // ----- Xung dot -----

  async createConflict(
    scope: TenantScope,
    input: Omit<BusinessConflictRecord, 'id' | 'tenantId' | 'openedAt'> & {
      readonly id?: string;
      readonly openedAt?: Date;
    },
  ): Promise<BusinessConflictRecord> {
    const record: BusinessConflictRecord = {
      ...input,
      id: input.id ?? randomUUID(),
      tenantId: scope.tenantId,
      openedAt: input.openedAt ?? new Date(),
    };
    this.conflicts.set(record.id, record);
    return record;
  }

  async findConflictById(
    scope: TenantScope,
    id: string,
  ): Promise<BusinessConflictRecord | null> {
    const found = this.conflicts.get(id) ?? null;
    return found && found.tenantId === scope.tenantId ? found : null;
  }

  async findConflictByKey(
    scope: TenantScope,
    conflictKey: string,
  ): Promise<BusinessConflictRecord | null> {
    return this.mine(scope, this.conflicts).find((row) => row.conflictKey === conflictKey) ?? null;
  }

  async listConflicts(
    scope: TenantScope,
    filter: { readonly status?: ConflictStatus; readonly factId?: string } = {},
  ): Promise<readonly BusinessConflictRecord[]> {
    return this.mine(scope, this.conflicts)
      .filter((row) => (filter.status ? row.status === filter.status : true))
      .filter((row) => (filter.factId ? row.factIds.includes(filter.factId) : true))
      .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  }

  async updateConflict(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessConflictRecord, 'id' | 'tenantId' | 'factIds'>>,
  ): Promise<BusinessConflictRecord> {
    const current = this.conflicts.get(id) ?? null;
    assertWithinScope(scope, current, `Xung dot ${id}`);
    if (!current) throw new Error(`Khong tim thay xung dot ${id}`);
    const next: BusinessConflictRecord = { ...current, ...patch };
    this.conflicts.set(id, next);
    return next;
  }

  // ----- Phe duyet -----

  async createApproval(
    scope: TenantScope,
    input: Omit<BusinessApprovalRecord, 'id' | 'tenantId' | 'decidedAt'> & {
      readonly id?: string;
      readonly decidedAt?: Date;
    },
  ): Promise<BusinessApprovalRecord> {
    const record: BusinessApprovalRecord = {
      ...input,
      id: input.id ?? randomUUID(),
      tenantId: scope.tenantId,
      decidedAt: input.decidedAt ?? new Date(),
    };
    this.approvals.set(record.id, record);
    return record;
  }

  async listApprovals(
    scope: TenantScope,
    filter: { readonly sourceId?: string; readonly factId?: string },
  ): Promise<readonly BusinessApprovalRecord[]> {
    return this.mine(scope, this.approvals)
      .filter((row) => (filter.sourceId ? row.sourceId === filter.sourceId : true))
      .filter((row) => (filter.factId ? row.factId === filter.factId : true))
      .sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime());
  }

  // ----- Su that bat buoc -----

  async upsertRequiredFact(
    scope: TenantScope,
    input: Omit<BusinessRequiredFactRecord, 'id' | 'tenantId'>,
  ): Promise<BusinessRequiredFactRecord> {
    const composite = `${scope.tenantId}::${input.capability}::${input.domain}::${input.key}`;
    const existing = this.requiredFacts.get(composite);
    const record: BusinessRequiredFactRecord = {
      ...input,
      id: existing?.id ?? randomUUID(),
      tenantId: scope.tenantId,
    };
    this.requiredFacts.set(composite, record);
    return record;
  }

  async listRequiredFacts(
    scope: TenantScope,
    capability?: string,
  ): Promise<readonly BusinessRequiredFactRecord[]> {
    return this.mine(scope, this.requiredFacts).filter((row) =>
      capability ? row.capability === capability : true,
    );
  }
}
