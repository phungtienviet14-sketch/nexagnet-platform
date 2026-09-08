import type { BusinessDate } from '../business-date.js';
import type {
  ApplyTollReviewInput,
  CreateTollAccountInput,
  CreateTollImportInput,
  OpenTollLinkInput,
  TollCandidateFilter,
} from './toll.ports.js';
import type {
  TollAccount,
  TollAccountVehicleLink,
  TollImport,
  TollReviewDecisionRecord,
  TollTransactionCandidateRecord,
} from './toll.types.js';
import type { TollProvider } from './toll-provider.port.js';

export interface CreatedTollImport {
  readonly import: TollImport;
  readonly candidates: readonly TollTransactionCandidateRecord[];
}

export abstract class TollRepository {
  /* ------------------------------ Tai khoan ----------------------------- */
  abstract createAccount(input: CreateTollAccountInput): Promise<TollAccount>;
  abstract findAccount(id: string): Promise<TollAccount | null>;
  abstract findAccountByNo(provider: TollProvider, accountNo: string): Promise<TollAccount | null>;
  abstract listAccounts(provider: TollProvider | null): Promise<readonly TollAccount[]>;
  abstract setAccountActive(id: string, active: boolean): Promise<TollAccount>;

  /* -------------------------- Ban ghi noi xe --------------------------- */
  abstract listLinksForAccount(accountId: string): Promise<readonly TollAccountVehicleLink[]>;
  abstract listLinksForVehicle(vehicleId: string): Promise<readonly TollAccountVehicleLink[]>;
  abstract listAllLinks(): Promise<readonly TollAccountVehicleLink[]>;
  abstract findLink(id: string): Promise<TollAccountVehicleLink | null>;
  abstract openLink(input: OpenTollLinkInput): Promise<TollAccountVehicleLink>;
  abstract closeLink(
    id: string,
    effectiveTo: BusinessDate,
    actor: string,
    at: Date,
  ): Promise<TollAccountVehicleLink>;

  /* ------------------------------- Nap ---------------------------------- */
  abstract findImportByDigest(
    provider: TollProvider,
    sourceDigest: string,
  ): Promise<TollImport | null>;
  abstract findImport(id: string): Promise<TollImport | null>;
  abstract listImports(provider: TollProvider | null): Promise<readonly TollImport[]>;
  abstract createImportWithCandidates(input: CreateTollImportInput): Promise<CreatedTollImport>;

  /* ----------------------------- Ung vien ------------------------------- */
  abstract findCandidate(id: string): Promise<TollTransactionCandidateRecord | null>;
  abstract listCandidates(
    filter: TollCandidateFilter,
  ): Promise<readonly TollTransactionCandidateRecord[]>;
  abstract countCandidates(filter: TollCandidateFilter): Promise<number>;
  /** Dau van DA CO trong kho — de phat hien cung mot giao dich ve qua HAI tep nguon (#269 J4). */
  abstract knownFingerprints(
    provider: TollProvider,
    fingerprints: readonly string[],
  ): Promise<ReadonlySet<string>>;
  abstract applyReview(input: ApplyTollReviewInput): Promise<TollTransactionCandidateRecord>;
  abstract listDecisions(candidateId: string): Promise<readonly TollReviewDecisionRecord[]>;
}
