import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import type { TollProvider } from './toll-provider.port.js';
import {
  ACTIVE_TOLL_VEHICLE_LINK,
  TOLL_ACCOUNT_NO_UNIQUE,
  TOLL_IMPORT_DIGEST_UNIQUE,
} from './toll-storage-conflict.js';
import type {
  ApplyTollReviewInput,
  CreateTollAccountInput,
  CreateTollImportInput,
  OpenTollLinkInput,
  TollCandidateFilter,
} from './toll.ports.js';
import { TollRepository, type CreatedTollImport } from './toll.repository.js';
import type {
  TollAccount,
  TollAccountVehicleLink,
  TollImport,
  TollMatchState,
  TollReviewDecisionRecord,
  TollTransactionCandidateRecord,
} from './toll.types.js';

/* Kieu tho tu Prisma — chi lay nhung cot ma mien nay doc. */
interface AccountRow {
  id: string;
  provider: string;
  accountNo: string;
  holderName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface LinkRow {
  id: string;
  accountId: string;
  vehicleId: string;
  providerVehicleRef: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  provenance: string;
  createdAt: Date;
  createdBy: string;
}

interface ImportRow {
  id: string;
  provider: string;
  sourceKind: string;
  sourceLabel: string;
  sourceDigest: string;
  periodStart: string | null;
  periodEnd: string | null;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedAt: Date;
  importedBy: string;
}

interface CandidateRow {
  id: string;
  importId: string;
  provider: string;
  rowNumber: number;
  parseStatus: string;
  rejectReason: string | null;
  accountNoRaw: string;
  accountId: string | null;
  kind: string | null;
  vehiclePlateRaw: string;
  vehicleId: string | null;
  passedAt: Date | null;
  businessDate: string | null;
  signedAmount: bigint | null;
  currencyCode: string;
  stationLabel: string | null;
  providerRef: string | null;
  fingerprint: string | null;
  matchState: string | null;
  reviewState: string;
  duplicateOfCandidateId: string | null;
  rawValues: unknown;
  createdAt: Date;
}

interface DecisionRow {
  id: string;
  candidateId: string;
  action: string;
  actor: string;
  at: Date;
  reason: string;
  note: string | null;
  previousVehicleId: string | null;
  nextVehicleId: string | null;
  previousMatchState: string | null;
  nextMatchState: string | null;
  duplicateOfCandidateId: string | null;
}

const toAccount = (row: AccountRow): TollAccount => ({
  id: row.id,
  provider: row.provider as TollProvider,
  accountNo: row.accountNo,
  holderName: row.holderName,
  active: row.active,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toLink = (row: LinkRow): TollAccountVehicleLink => ({
  id: row.id,
  accountId: row.accountId,
  vehicleId: row.vehicleId,
  providerVehicleRef: row.providerVehicleRef,
  effectiveFrom: row.effectiveFrom,
  effectiveTo: row.effectiveTo,
  provenance: row.provenance as TollAccountVehicleLink['provenance'],
  createdAt: row.createdAt,
  createdBy: row.createdBy,
});

const toImport = (row: ImportRow): TollImport => ({
  id: row.id,
  provider: row.provider as TollProvider,
  sourceKind: row.sourceKind as TollImport['sourceKind'],
  sourceLabel: row.sourceLabel,
  sourceDigest: row.sourceDigest,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  rowCount: row.rowCount,
  acceptedCount: row.acceptedCount,
  rejectedCount: row.rejectedCount,
  importedAt: row.importedAt,
  importedBy: row.importedBy,
});

/**
 * `signedAmount` di qua `fromStoredAmount` chu khong `Number(bigint)` thang.
 *
 * Mot hang VUOT bien chi co the den tu mot duong ghi KHONG di qua ung dung (nhap tay vao DB, khoi
 * phuc mot backup cu). Neu khong kiem, gia tri do se lang le mat chinh xac o phep doi sang `number`
 * roi di tiep vao mot bao cao — im lang, dung cai ma `GD-03` sinh ra de chan.
 */
const toCandidate = (row: CandidateRow): TollTransactionCandidateRecord => ({
  id: row.id,
  importId: row.importId,
  provider: row.provider as TollProvider,
  rowNumber: row.rowNumber,
  parseStatus: row.parseStatus as TollTransactionCandidateRecord['parseStatus'],
  rejectReason: row.rejectReason,
  accountNoRaw: row.accountNoRaw,
  accountId: row.accountId,
  kind: row.kind as TollTransactionCandidateRecord['kind'],
  vehiclePlateRaw: row.vehiclePlateRaw,
  vehicleId: row.vehicleId,
  passedAt: row.passedAt,
  businessDate: row.businessDate,
  signedAmount: fromStoredAmount(row.signedAmount),
  currencyCode: row.currencyCode,
  stationLabel: row.stationLabel,
  providerRef: row.providerRef,
  fingerprint: row.fingerprint,
  matchState: row.matchState as TollMatchState | null,
  reviewState: row.reviewState as TollTransactionCandidateRecord['reviewState'],
  duplicateOfCandidateId: row.duplicateOfCandidateId,
  rawValues: (row.rawValues ?? {}) as Readonly<Record<string, string>>,
  createdAt: row.createdAt,
});

const toDecision = (row: DecisionRow): TollReviewDecisionRecord => ({
  id: row.id,
  candidateId: row.candidateId,
  action: row.action as TollReviewDecisionRecord['action'],
  actor: row.actor,
  at: row.at,
  reason: row.reason,
  note: row.note,
  previousVehicleId: row.previousVehicleId,
  nextVehicleId: row.nextVehicleId,
  previousMatchState: row.previousMatchState as TollMatchState | null,
  nextMatchState: row.nextMatchState as TollMatchState | null,
  duplicateOfCandidateId: row.duplicateOfCandidateId,
});

/*
 * Cung ly le voi `PrismaAssetOwnershipRepository`: Prisma sinh kieu delegate theo tung ban client,
 * nen goi qua mot ham tra `any` de tang nay khong vo khi ai do chua chay `prisma generate`. Ranh
 * gioi kieu that su nam o cac ham `to*` ben tren.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

@Injectable()
export class PrismaTollRepository extends TollRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createAccount(input: CreateTollAccountInput): Promise<TollAccount> {
    try {
      return toAccount(
        await model(this.prisma, 'transportTollAccount').create({
          data: {
            provider: input.provider,
            accountNo: input.accountNo,
            holderName: input.holderName,
          },
        }),
      );
    } catch (error) {
      if (isUniqueViolationOn(error, TOLL_ACCOUNT_NO_UNIQUE)) {
        throw TransportDomainError.conflict(
          'TOLL_ACCOUNT_NO_TAKEN',
          `Tai khoan ${input.accountNo} cua ${input.provider} da duoc khai`,
        );
      }
      throw error;
    }
  }

  async findAccount(id: string): Promise<TollAccount | null> {
    const row = await model(this.prisma, 'transportTollAccount').findUnique({ where: { id } });
    return row ? toAccount(row) : null;
  }

  async findAccountByNo(provider: TollProvider, accountNo: string): Promise<TollAccount | null> {
    const row = await model(this.prisma, 'transportTollAccount').findUnique({
      where: { provider_accountNo: { provider, accountNo } },
    });
    return row ? toAccount(row) : null;
  }

  async listAccounts(provider: TollProvider | null): Promise<readonly TollAccount[]> {
    const rows: AccountRow[] = await model(this.prisma, 'transportTollAccount').findMany({
      where: provider === null ? {} : { provider },
      orderBy: { accountNo: 'asc' },
    });
    return rows.map(toAccount);
  }

  async setAccountActive(id: string, active: boolean): Promise<TollAccount> {
    const existing = await this.findAccount(id);
    if (!existing) {
      throw TransportDomainError.notFound(
        'TOLL_ACCOUNT_NOT_FOUND',
        `Khong tim thay tai khoan ${id}`,
      );
    }
    return toAccount(
      await model(this.prisma, 'transportTollAccount').update({ where: { id }, data: { active } }),
    );
  }

  async listLinksForAccount(accountId: string): Promise<readonly TollAccountVehicleLink[]> {
    const rows: LinkRow[] = await model(this.prisma, 'transportTollAccountVehicleLink').findMany({
      where: { accountId },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map(toLink);
  }

  async listLinksForVehicle(vehicleId: string): Promise<readonly TollAccountVehicleLink[]> {
    const rows: LinkRow[] = await model(this.prisma, 'transportTollAccountVehicleLink').findMany({
      where: { vehicleId },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map(toLink);
  }

  async listAllLinks(): Promise<readonly TollAccountVehicleLink[]> {
    const rows: LinkRow[] = await model(this.prisma, 'transportTollAccountVehicleLink').findMany({
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map(toLink);
  }

  async findLink(id: string): Promise<TollAccountVehicleLink | null> {
    const row = await model(this.prisma, 'transportTollAccountVehicleLink').findUnique({
      where: { id },
    });
    return row ? toLink(row) : null;
  }

  /**
   * MO mot doan noi — va bat cham o CA HAI duong.
   *
   * Duong mot: doc cac doan da co roi so. Duong hai: de Postgres tu choi bang unique mot phan.
   *
   * Duong hai la duong DUY NHAT dung khi co hai nguoi ghi cung luc — hai yeu cau cung doc thay
   * "chua co doan nao" roi cung ghi. Chi mot ban thang, va ban thua nhan `P2002` dich thanh
   * `TOLL_VEHICLE_ALREADY_LINKED` — dung cau tra loi ma nguoi dung can.
   */
  async openLink(input: OpenTollLinkInput): Promise<TollAccountVehicleLink> {
    const existing = await this.listLinksForVehicle(input.vehicleId);
    const overlapping = existing.some(
      (link) =>
        !(link.effectiveTo !== null && input.effectiveFrom > link.effectiveTo) &&
        !(input.effectiveTo !== null && link.effectiveFrom > input.effectiveTo),
    );
    if (overlapping) {
      throw TransportDomainError.conflict(
        'TOLL_VEHICLE_ALREADY_LINKED',
        `Xe ${input.vehicleId} da noi voi mot tai khoan giao thong trong khoang nay`,
      );
    }

    try {
      return toLink(
        await model(this.prisma, 'transportTollAccountVehicleLink').create({
          data: {
            accountId: input.accountId,
            vehicleId: input.vehicleId,
            providerVehicleRef: input.providerVehicleRef,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo,
            provenance: 'MANUAL',
            createdBy: input.createdBy,
          },
        }),
      );
    } catch (error) {
      if (isUniqueViolationOn(error, ACTIVE_TOLL_VEHICLE_LINK)) {
        throw TransportDomainError.conflict(
          'TOLL_VEHICLE_ALREADY_LINKED',
          `Xe ${input.vehicleId} vua duoc noi voi mot tai khoan giao thong khac`,
        );
      }
      throw error;
    }
  }

  async closeLink(
    id: string,
    effectiveTo: BusinessDate,
    actor: string,
    at: Date,
  ): Promise<TollAccountVehicleLink> {
    const link = await this.findLink(id);
    if (!link) {
      throw TransportDomainError.notFound(
        'TOLL_LINK_NOT_FOUND',
        `Khong tim thay ban ghi noi ${id}`,
      );
    }
    if (link.effectiveTo !== null) {
      throw TransportDomainError.conflict(
        'TOLL_LINK_ALREADY_CLOSED',
        `Ban ghi noi ${id} da dong tu ${link.effectiveTo}`,
      );
    }
    if (effectiveTo < link.effectiveFrom) {
      throw TransportDomainError.invalid(
        'TOLL_LINK_PERIOD_INVALID',
        `Ngay dong (${effectiveTo}) phai sau hoac bang ngay mo (${link.effectiveFrom})`,
      );
    }
    return toLink(
      await model(this.prisma, 'transportTollAccountVehicleLink').update({
        where: { id },
        data: { effectiveTo, closedAt: at, closedBy: actor },
      }),
    );
  }

  async findImportByDigest(
    provider: TollProvider,
    sourceDigest: string,
  ): Promise<TollImport | null> {
    const row = await model(this.prisma, 'transportTollImport').findUnique({
      where: { provider_sourceDigest: { provider, sourceDigest } },
    });
    return row ? toImport(row) : null;
  }

  async findImport(id: string): Promise<TollImport | null> {
    const row = await model(this.prisma, 'transportTollImport').findUnique({ where: { id } });
    return row ? toImport(row) : null;
  }

  async listImports(provider: TollProvider | null): Promise<readonly TollImport[]> {
    const rows: ImportRow[] = await model(this.prisma, 'transportTollImport').findMany({
      where: provider === null ? {} : { provider },
      orderBy: { importedAt: 'desc' },
      take: 200,
    });
    return rows.map(toImport);
  }

  /**
   * MOT LAN GHI cho ca lan nap VA moi dong cua no.
   *
   * Neu tach lam hai lan goi, mot lan hong o giua de lai mot `TollImport` KHONG co dong nao: no
   * dem 500 dong tren giay to nhung khong hien ra dong nao, va nap lai thi bi unique
   * `(provider, sourceDigest)` chan. Nguoi dung ket o mot cho khong co duong ra bang giao dien.
   */
  async createImportWithCandidates(input: CreateTollImportInput): Promise<CreatedTollImport> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const importRow: ImportRow = await model(
          tx as unknown as PrismaService,
          'transportTollImport',
        ).create({
          data: {
            provider: input.provider,
            sourceKind: input.sourceKind,
            sourceLabel: input.sourceLabel,
            sourceDigest: input.sourceDigest,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            rowCount: input.rowCount,
            acceptedCount: input.acceptedCount,
            rejectedCount: input.rejectedCount,
            importedAt: input.at,
            importedBy: input.importedBy,
          },
        });

        await model(tx as unknown as PrismaService, 'transportTollTransactionCandidate').createMany(
          {
            data: input.candidates.map((candidate) => ({
              importId: importRow.id,
              provider: input.provider,
              rowNumber: candidate.rowNumber,
              parseStatus: candidate.parseStatus,
              rejectReason: candidate.rejectReason,
              accountNoRaw: candidate.accountNoRaw,
              accountId: candidate.accountId,
              kind: candidate.kind,
              vehiclePlateRaw: candidate.vehiclePlateRaw,
              vehicleId: candidate.vehicleId,
              passedAt: candidate.passedAt,
              businessDate: candidate.businessDate,
              signedAmount: toStoredAmount(candidate.signedAmount),
              stationLabel: candidate.stationLabel,
              providerRef: candidate.providerRef,
              fingerprint: candidate.fingerprint,
              matchState: candidate.matchState,
              rawValues: candidate.rawValues,
            })),
          },
        );

        const rows: CandidateRow[] = await model(
          tx as unknown as PrismaService,
          'transportTollTransactionCandidate',
        ).findMany({ where: { importId: importRow.id }, orderBy: { rowNumber: 'asc' } });

        return { import: toImport(importRow), candidates: rows.map(toCandidate) };
      });
      return created;
    } catch (error) {
      if (isUniqueViolationOn(error, TOLL_IMPORT_DIGEST_UNIQUE)) {
        throw TransportDomainError.conflict(
          'TOLL_IMPORT_FORMAT_UNSUPPORTED',
          'Nguon nay vua duoc nap boi mot lenh khac',
        );
      }
      throw error;
    }
  }

  async findCandidate(id: string): Promise<TollTransactionCandidateRecord | null> {
    const row = await model(this.prisma, 'transportTollTransactionCandidate').findUnique({
      where: { id },
    });
    return row ? toCandidate(row) : null;
  }

  private whereOf(filter: TollCandidateFilter): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filter.provider !== undefined) where.provider = filter.provider;
    if (filter.importId !== undefined) where.importId = filter.importId;
    if (filter.accountId !== undefined) where.accountId = filter.accountId;
    if (filter.matchState !== undefined) where.matchState = filter.matchState;
    if (filter.reviewState !== undefined) where.reviewState = filter.reviewState;
    return where;
  }

  async listCandidates(
    filter: TollCandidateFilter,
  ): Promise<readonly TollTransactionCandidateRecord[]> {
    const rows: CandidateRow[] = await model(
      this.prisma,
      'transportTollTransactionCandidate',
    ).findMany({
      where: this.whereOf(filter),
      orderBy: [{ importId: 'asc' }, { rowNumber: 'asc' }],
      skip: filter.offset,
      take: filter.limit,
    });
    return rows.map(toCandidate);
  }

  async countCandidates(filter: TollCandidateFilter): Promise<number> {
    return model(this.prisma, 'transportTollTransactionCandidate').count({
      where: this.whereOf(filter),
    });
  }

  async knownFingerprints(
    provider: TollProvider,
    fingerprints: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (fingerprints.length === 0) return new Set<string>();
    const rows: { fingerprint: string | null }[] = await model(
      this.prisma,
      'transportTollTransactionCandidate',
    ).findMany({
      where: { provider, fingerprint: { in: [...new Set(fingerprints)] } },
      select: { fingerprint: true },
    });
    return new Set(
      rows.map((row) => row.fingerprint).filter((value): value is string => value !== null),
    );
  }

  /**
   * MOT LAN QUYET = MOT giao dich, ghi HAI thu: trang thai moi cua dong, va mot dong lich su.
   *
   * Tach lam hai lan goi se de lai mot dong da doi trang thai ma KHONG co ai ky ten — dung cai ma
   * #269 J7 doi phai tranh (*"Manual resolution must retain actor / time / reason"*).
   */
  async applyReview(input: ApplyTollReviewInput): Promise<TollTransactionCandidateRecord> {
    return this.prisma.$transaction(async (tx) => {
      const before: CandidateRow | null = await model(
        tx as unknown as PrismaService,
        'transportTollTransactionCandidate',
      ).findUnique({ where: { id: input.candidateId } });
      if (before === null) {
        throw TransportDomainError.notFound(
          'TOLL_CANDIDATE_NOT_FOUND',
          `Khong tim thay dong ${input.candidateId}`,
        );
      }

      const updated: CandidateRow = await model(
        tx as unknown as PrismaService,
        'transportTollTransactionCandidate',
      ).update({
        where: { id: input.candidateId },
        data: {
          vehicleId: input.nextVehicleId ?? before.vehicleId,
          matchState: input.nextMatchState ?? before.matchState,
          reviewState: input.nextReviewState,
          duplicateOfCandidateId: input.duplicateOfCandidateId,
        },
      });

      await model(tx as unknown as PrismaService, 'transportTollReviewDecision').create({
        data: {
          candidateId: input.candidateId,
          action: input.action,
          actor: input.actor,
          at: input.at,
          reason: input.reason,
          note: input.note,
          previousVehicleId: before.vehicleId,
          nextVehicleId: input.nextVehicleId,
          previousMatchState: before.matchState,
          nextMatchState: input.nextMatchState,
          duplicateOfCandidateId: input.duplicateOfCandidateId,
        },
      });

      return toCandidate(updated);
    });
  }

  async listDecisions(candidateId: string): Promise<readonly TollReviewDecisionRecord[]> {
    const rows: DecisionRow[] = await model(this.prisma, 'transportTollReviewDecision').findMany({
      where: { candidateId },
      orderBy: { at: 'asc' },
    });
    return rows.map(toDecision);
  }
}
