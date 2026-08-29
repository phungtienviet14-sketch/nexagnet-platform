import type {
  DataClassification,
  SourceAuthority,
  SourceOrigin,
  SourceStatus,
  ApprovalLevel,
} from './source-lifecycle.js';
import type { FactStatus } from './fact-lifecycle.js';
import type { ConflictImpact, ConflictStatus } from './conflict-lifecycle.js';

/**
 * HINH DANG DU LIEU cua tang nguon su that — doc lap voi Prisma.
 *
 * Tach ra de hai hien thuc kho (bo nho / Postgres) noi cung mot ngon ngu, va de tang nghiep vu
 * test duoc ma khong dung DB — dung mau `TripRepository` cua van tai.
 */

export interface BusinessSourceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceKey: string;
  readonly title: string;
  readonly kind: string;
  readonly version: string;
  readonly origin: SourceOrigin;
  readonly authority: SourceAuthority;
  readonly classification: DataClassification;
  readonly status: SourceStatus;
  readonly locator: string | null;
  readonly contentHash: string | null;
  readonly byteSize: number | null;
  readonly receivedAt: Date;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly supersedesId: string | null;
  readonly note: string | null;
}

export interface BusinessFactRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly domain: string;
  readonly key: string;
  readonly value: unknown;
  readonly status: FactStatus;
  readonly classification: DataClassification;
  readonly sourceId: string;
  readonly sourceLocus: string | null;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly assumptionRationale: string | null;
  readonly assumptionRisk: string | null;
  readonly assumptionReversibility: string | null;
  readonly assumptionOwner: string | null;
  readonly supersedesId: string | null;
  readonly createdAt: Date;
}

export interface BusinessConflictRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly conflictKey: string;
  readonly domain: string;
  readonly subjectKey: string | null;
  readonly summary: string;
  readonly impact: ConflictImpact;
  readonly status: ConflictStatus;
  readonly recommendedFactId: string | null;
  readonly recommendationReason: string | null;
  readonly resolvedFactId: string | null;
  readonly resolutionActor: string | null;
  readonly resolutionRef: string | null;
  readonly resolutionNote: string | null;
  readonly resolvedAt: Date | null;
  readonly openedAt: Date;
  readonly factIds: readonly string[];
}

export interface BusinessApprovalRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly level: ApprovalLevel;
  readonly actor: string;
  readonly evidenceRef: string;
  readonly note: string | null;
  readonly sourceId: string | null;
  readonly factId: string | null;
  readonly decidedAt: Date;
}

export interface BusinessRequiredFactRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly capability: string;
  readonly domain: string;
  readonly key: string;
  readonly requiresConfirmed: boolean;
  readonly note: string | null;
}
