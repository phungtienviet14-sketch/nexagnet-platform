import type { TenantScope } from './tenant-scope.js';
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
 * KHO cua tang nguon su that.
 *
 * MOI ham deu nhan `TenantScope` lam THAM SO DAU. Do khong phai thoi quen dat ten — day la cho
 * bat bien cach ly khach duoc dat vao KIEU: khong ton tai mot chu ky ham nao doc duoc du lieu ma
 * khong ai phai noi minh dang la ai. Mot ham `findSource(id)` khong tham so pham vi la mot ham
 * ma ke goi khong the goi sai, va vi the cung khong the bi bat sai.
 *
 * Lop trung nhau thu hai nam o `assertWithinScope` phia service: `where` bao ve truy van, khang
 * dinh bao ve duong doc moi ma ai do quen dieu kien.
 */
export abstract class SourceRegistryRepository {
  /**
   * Chay mot thao tac nghiep vu NHIEU BUOC nhu MOT don vi: hoac tat ca cac ghi cung song, hoac
   * khong ghi nao con lai.
   *
   * VI SAO PHAI NAM O KHO chu khong o dich vu. Mot "lan duyet" khong phai mot cau ghi — no la
   * `createApproval` roi `updateSource(status)`. Neu buoc hai bi tu choi (hoac DB rot giua chung),
   * ban ghi phe duyet o buoc mot VAN CON. Lan sau `transitionSource(..., 'APPROVED')` doc
   * `listApprovals()` thay khong rong nen ket luan `hasExplicitApproval = true` — va mot lan duyet
   * DA THAT BAI tro thanh bang chung cho mot lan duyet KHAC thanh cong. Do khong phai gia thuyet:
   * do dung la hinh dang cua "ban sao noi bo bi mo ta nhu khach da xac nhan", chi khac la lan nay
   * he thong tu tao ra bang chung gia cho chinh no.
   *
   * TAI NHAP DUOC: goi long nhau tra ve chinh don vi dang mo chu khong mo them mot don vi moi —
   * `supersedeSource()` goi `makeSourceEffective()` va ca hai deu la thao tac nghiep vu.
   */
  abstract runInTransaction<T>(
    fn: (repository: SourceRegistryRepository) => Promise<T>,
  ): Promise<T>;

  // ----- Nguon -----
  abstract createSource(
    scope: TenantScope,
    input: Omit<BusinessSourceRecord, 'id' | 'tenantId'> & { readonly id?: string },
  ): Promise<BusinessSourceRecord>;

  abstract findSourceById(scope: TenantScope, id: string): Promise<BusinessSourceRecord | null>;

  /** Danh tinh THAT cua mot ban: khoa + hash. Cung ten khac hash = hai ban khac nhau. */
  abstract findSourceByHash(
    scope: TenantScope,
    sourceKey: string,
    contentHash: string,
  ): Promise<BusinessSourceRecord | null>;

  abstract listSources(
    scope: TenantScope,
    filter?: { readonly status?: SourceStatus; readonly sourceKey?: string },
  ): Promise<readonly BusinessSourceRecord[]>;

  abstract updateSource(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessSourceRecord, 'id' | 'tenantId'>>,
  ): Promise<BusinessSourceRecord>;

  // ----- Su that -----
  abstract createFact(
    scope: TenantScope,
    input: Omit<BusinessFactRecord, 'id' | 'tenantId' | 'createdAt'> & {
      readonly id?: string;
      readonly createdAt?: Date;
    },
  ): Promise<BusinessFactRecord>;

  abstract findFactById(scope: TenantScope, id: string): Promise<BusinessFactRecord | null>;

  /** LICH SU day du cua mot dia chi su that, cu nhat truoc. Khong bao gio loc mat ban da thay the. */
  abstract listFactHistory(
    scope: TenantScope,
    domain: string,
    key: string,
  ): Promise<readonly BusinessFactRecord[]>;

  abstract listFacts(
    scope: TenantScope,
    filter?: { readonly domain?: string; readonly status?: FactStatus },
  ): Promise<readonly BusinessFactRecord[]>;

  abstract updateFact(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessFactRecord, 'id' | 'tenantId'>>,
  ): Promise<BusinessFactRecord>;

  // ----- Xung dot -----
  abstract createConflict(
    scope: TenantScope,
    input: Omit<BusinessConflictRecord, 'id' | 'tenantId' | 'openedAt'> & {
      readonly id?: string;
      readonly openedAt?: Date;
    },
  ): Promise<BusinessConflictRecord>;

  abstract findConflictById(scope: TenantScope, id: string): Promise<BusinessConflictRecord | null>;

  abstract findConflictByKey(
    scope: TenantScope,
    conflictKey: string,
  ): Promise<BusinessConflictRecord | null>;

  abstract listConflicts(
    scope: TenantScope,
    filter?: { readonly status?: ConflictStatus; readonly factId?: string },
  ): Promise<readonly BusinessConflictRecord[]>;

  abstract updateConflict(
    scope: TenantScope,
    id: string,
    patch: Partial<Omit<BusinessConflictRecord, 'id' | 'tenantId' | 'factIds'>>,
  ): Promise<BusinessConflictRecord>;

  // ----- Phe duyet -----
  abstract createApproval(
    scope: TenantScope,
    input: Omit<BusinessApprovalRecord, 'id' | 'tenantId' | 'decidedAt'> & {
      readonly id?: string;
      readonly decidedAt?: Date;
    },
  ): Promise<BusinessApprovalRecord>;

  abstract listApprovals(
    scope: TenantScope,
    filter: { readonly sourceId?: string; readonly factId?: string },
  ): Promise<readonly BusinessApprovalRecord[]>;

  // ----- Su that bat buoc (nguyen ban Tenant Doctor) -----
  abstract upsertRequiredFact(
    scope: TenantScope,
    input: Omit<BusinessRequiredFactRecord, 'id' | 'tenantId'>,
  ): Promise<BusinessRequiredFactRecord>;

  abstract listRequiredFacts(
    scope: TenantScope,
    capability?: string,
  ): Promise<readonly BusinessRequiredFactRecord[]>;
}
