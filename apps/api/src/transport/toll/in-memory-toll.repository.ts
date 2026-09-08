import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../business-date.js';
import { TransportDomainError } from '../transport.errors.js';
import { vehicleLinkConflict } from './toll-account-link.js';
import type { TollProvider } from './toll-provider.port.js';
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
  TollReviewDecisionRecord,
  TollTransactionCandidateRecord,
} from './toll.types.js';

/**
 * KHO TRONG BO NHO — cho demo/CI khong co Postgres (`PERSISTENCE=memory`).
 *
 * ===========================================================================
 * NO PHAI CUONG CHE CUNG NHUNG BAT BIEN MA POSTGRES CUONG CHE.
 *
 * Neu ban trong bo nho de lot mot dieu ma DB chan, thi moi bai test chay o che do bo nho se xanh
 * cho mot hanh vi khong bao gio chay duoc that — va no se xanh cho toi tan lan deploy dau tien.
 *
 * Hai bat bien duoc lam lai o day:
 *   · `unique(provider, accountNo)`  — mot so tai khoan chi khai mot lan;
 *   · MOT doan dang mo cho moi xe    — ND 119/2024 D.11 kh.3;
 *   · `unique(provider, sourceDigest)` — nap lai cung bo byte la mot va cham, khong phai mot ban sao.
 */
export class InMemoryTollRepository extends TollRepository {
  private readonly accounts = new Map<string, TollAccount>();
  private readonly links = new Map<string, TollAccountVehicleLink>();
  private readonly imports = new Map<string, TollImport>();
  private readonly candidates = new Map<string, TollTransactionCandidateRecord>();
  private readonly decisions: TollReviewDecisionRecord[] = [];

  async createAccount(input: CreateTollAccountInput): Promise<TollAccount> {
    const existing = await this.findAccountByNo(input.provider, input.accountNo);
    if (existing) {
      throw TransportDomainError.conflict(
        'TOLL_ACCOUNT_NO_TAKEN',
        `Tai khoan ${input.accountNo} cua ${input.provider} da duoc khai`,
      );
    }
    const now = new Date();
    const account: TollAccount = {
      id: randomUUID(),
      provider: input.provider,
      accountNo: input.accountNo,
      holderName: input.holderName,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(account.id, account);
    return account;
  }

  async findAccount(id: string): Promise<TollAccount | null> {
    return this.accounts.get(id) ?? null;
  }

  async findAccountByNo(provider: TollProvider, accountNo: string): Promise<TollAccount | null> {
    return (
      [...this.accounts.values()].find(
        (account) => account.provider === provider && account.accountNo === accountNo,
      ) ?? null
    );
  }

  async listAccounts(provider: TollProvider | null): Promise<readonly TollAccount[]> {
    return [...this.accounts.values()]
      .filter((account) => provider === null || account.provider === provider)
      .sort((left, right) => left.accountNo.localeCompare(right.accountNo));
  }

  async setAccountActive(id: string, active: boolean): Promise<TollAccount> {
    const account = this.accounts.get(id);
    if (!account) {
      throw TransportDomainError.notFound('TOLL_ACCOUNT_NOT_FOUND', `Khong tim thay tai khoan ${id}`);
    }
    const updated: TollAccount = { ...account, active, updatedAt: new Date() };
    this.accounts.set(id, updated);
    return updated;
  }

  async listLinksForAccount(accountId: string): Promise<readonly TollAccountVehicleLink[]> {
    return [...this.links.values()].filter((link) => link.accountId === accountId);
  }

  async listLinksForVehicle(vehicleId: string): Promise<readonly TollAccountVehicleLink[]> {
    return [...this.links.values()].filter((link) => link.vehicleId === vehicleId);
  }

  async listAllLinks(): Promise<readonly TollAccountVehicleLink[]> {
    return [...this.links.values()];
  }

  async findLink(id: string): Promise<TollAccountVehicleLink | null> {
    return this.links.get(id) ?? null;
  }

  async openLink(input: OpenTollLinkInput): Promise<TollAccountVehicleLink> {
    const existing = await this.listLinksForVehicle(input.vehicleId);
    if (vehicleLinkConflict(existing, input)) {
      throw TransportDomainError.conflict(
        'TOLL_VEHICLE_ALREADY_LINKED',
        `Xe ${input.vehicleId} da noi voi mot tai khoan giao thong trong khoang nay`,
      );
    }
    const link: TollAccountVehicleLink = {
      id: randomUUID(),
      accountId: input.accountId,
      vehicleId: input.vehicleId,
      providerVehicleRef: input.providerVehicleRef,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      provenance: 'MANUAL',
      createdAt: input.at,
      createdBy: input.createdBy,
    };
    this.links.set(link.id, link);
    return link;
  }

  async closeLink(
    id: string,
    effectiveTo: BusinessDate,
    _actor: string,
    _at: Date,
  ): Promise<TollAccountVehicleLink> {
    const link = this.links.get(id);
    if (!link) {
      throw TransportDomainError.notFound('TOLL_LINK_NOT_FOUND', `Khong tim thay ban ghi noi ${id}`);
    }
    if (link.effectiveTo !== null) {
      throw TransportDomainError.conflict(
        'TOLL_LINK_ALREADY_CLOSED',
        `Ban ghi noi ${id} da dong tu ${link.effectiveTo}`,
      );
    }
    const updated: TollAccountVehicleLink = { ...link, effectiveTo };
    this.links.set(id, updated);
    return updated;
  }

  async findImportByDigest(
    provider: TollProvider,
    sourceDigest: string,
  ): Promise<TollImport | null> {
    return (
      [...this.imports.values()].find(
        (entry) => entry.provider === provider && entry.sourceDigest === sourceDigest,
      ) ?? null
    );
  }

  async findImport(id: string): Promise<TollImport | null> {
    return this.imports.get(id) ?? null;
  }

  async listImports(provider: TollProvider | null): Promise<readonly TollImport[]> {
    return [...this.imports.values()]
      .filter((entry) => provider === null || entry.provider === provider)
      .sort((left, right) => right.importedAt.getTime() - left.importedAt.getTime());
  }

  async createImportWithCandidates(input: CreateTollImportInput): Promise<CreatedTollImport> {
    const clash = await this.findImportByDigest(input.provider, input.sourceDigest);
    if (clash) {
      throw TransportDomainError.conflict(
        'TOLL_IMPORT_FORMAT_UNSUPPORTED',
        `Nguon nay da duoc nap (${clash.id})`,
      );
    }
    const created: TollImport = {
      id: randomUUID(),
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
    };
    this.imports.set(created.id, created);

    const candidates = input.candidates.map((candidate): TollTransactionCandidateRecord => {
      const record: TollTransactionCandidateRecord = {
        id: randomUUID(),
        importId: created.id,
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
        signedAmount: candidate.signedAmount,
        currencyCode: 'VND',
        stationLabel: candidate.stationLabel,
        providerRef: candidate.providerRef,
        fingerprint: candidate.fingerprint,
        matchState: candidate.matchState,
        reviewState: 'PENDING',
        rawValues: candidate.rawValues,
        createdAt: input.at,
      };
      this.candidates.set(record.id, record);
      return record;
    });

    return { import: created, candidates };
  }

  async findCandidate(id: string): Promise<TollTransactionCandidateRecord | null> {
    return this.candidates.get(id) ?? null;
  }

  private matching(filter: TollCandidateFilter): TollTransactionCandidateRecord[] {
    return [...this.candidates.values()]
      .filter((candidate) => filter.provider === undefined || candidate.provider === filter.provider)
      .filter((candidate) => filter.importId === undefined || candidate.importId === filter.importId)
      .filter((candidate) => filter.accountId === undefined || candidate.accountId === filter.accountId)
      .filter(
        (candidate) => filter.matchState === undefined || candidate.matchState === filter.matchState,
      )
      .filter(
        (candidate) =>
          filter.reviewState === undefined || candidate.reviewState === filter.reviewState,
      )
      .sort(
        (left, right) =>
          left.importId.localeCompare(right.importId) || left.rowNumber - right.rowNumber,
      );
  }

  async listCandidates(
    filter: TollCandidateFilter,
  ): Promise<readonly TollTransactionCandidateRecord[]> {
    return this.matching(filter).slice(filter.offset, filter.offset + filter.limit);
  }

  async countCandidates(filter: TollCandidateFilter): Promise<number> {
    return this.matching(filter).length;
  }

  async knownFingerprints(
    provider: TollProvider,
    fingerprints: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const wanted = new Set(fingerprints);
    const found = new Set<string>();
    for (const candidate of this.candidates.values()) {
      if (candidate.provider !== provider || candidate.fingerprint === null) continue;
      if (wanted.has(candidate.fingerprint)) found.add(candidate.fingerprint);
    }
    return found;
  }

  async applyReview(input: ApplyTollReviewInput): Promise<TollTransactionCandidateRecord> {
    const candidate = this.candidates.get(input.candidateId);
    if (!candidate) {
      throw TransportDomainError.notFound(
        'TOLL_CANDIDATE_NOT_FOUND',
        `Khong tim thay dong ${input.candidateId}`,
      );
    }
    const updated: TollTransactionCandidateRecord = {
      ...candidate,
      vehicleId: input.nextVehicleId ?? candidate.vehicleId,
      matchState: input.nextMatchState ?? candidate.matchState,
      reviewState: input.nextReviewState,
    };
    this.candidates.set(updated.id, updated);
    this.decisions.push({
      id: randomUUID(),
      candidateId: candidate.id,
      action: input.action,
      actor: input.actor,
      at: input.at,
      reason: input.reason,
      note: input.note,
      previousVehicleId: candidate.vehicleId,
      nextVehicleId: input.nextVehicleId,
      previousMatchState: candidate.matchState,
      nextMatchState: input.nextMatchState,
      duplicateOfCandidateId: input.duplicateOfCandidateId,
    });
    return updated;
  }

  async listDecisions(candidateId: string): Promise<readonly TollReviewDecisionRecord[]> {
    return this.decisions
      .filter((decision) => decision.candidateId === candidateId)
      .sort((left, right) => left.at.getTime() - right.at.getTime());
  }
}
