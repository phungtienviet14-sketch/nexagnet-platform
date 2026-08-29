import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../observability/telemetry.service.js';
import { SOURCE_REGISTRY_DECISIONS } from './source-registry-decisions.js';
import { isTelemetrySafeClassification } from './source-lifecycle.js';
import { canUseFact, type FactAssuranceLevel } from './fact-lifecycle.js';
import { isBlockingConflictStatus } from './conflict-lifecycle.js';
import { SourceRegistryRepository } from './source-registry.repository.js';
import type { TenantScope } from './tenant-scope.js';
import type { BusinessConflictRecord, BusinessFactRecord } from './source-registry.types.js';

/**
 * BON NGUYEN BAN DOC cua tang nguon su that — nen mong cua Tenant Doctor tuong lai, va la cong
 * that o runtime hom nay.
 *
 * ```text
 * getEffectiveFact()        — ban dang hieu luc tai mot dia chi
 * getFactHistory()          — toan bo cac ban, ke ca da bi thay the
 * canUseFact()              — dung duoc khong, va NEU KHONG thi vi sao (ma co kieu)
 * getBlockingConflicts()    — cai gi dang chan
 * getMissingRequiredFacts() — su that bat buoc nao con thieu
 * ```
 *
 * TACH KHOI `SourceRegistryService` co chu y, khong phai vi do dai: ben kia GHI (dang ky, duyet,
 * thay the, dong xung dot), ben nay DOC va PHAN XU. Mot con duong doc thuan tuy khong duoc phep
 * co kha nang doi trang thai, va cach re nhat de bao dam dieu do la no khong nam chung lop voi
 * nhung ham lam viec do.
 *
 * KHONG xay Tenant Doctor o day. Day chi la nhung vien gach ma no se dung.
 */
@Injectable()
export class SourceReadinessService {
  constructor(
    private readonly repository: SourceRegistryRepository,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /** Ban DANG HIEU LUC tai mot dia chi, hoac `null`. Khong bao gio roi ve ban da bi thay the. */
  async getEffectiveFact(
    scope: TenantScope,
    domain: string,
    key: string,
    at: Date = new Date(),
  ): Promise<BusinessFactRecord | null> {
    const history = await this.repository.listFactHistory(scope, domain, key);
    const live = history.filter(
      (row) =>
        (row.status === 'CONFIRMED' || row.status === 'WORKING_ASSUMPTION') &&
        withinWindow(row, at),
    );
    return live.at(-1) ?? null;
  }

  /** LICH SU day du — ke ca cac ban da `SUPERSEDED`/`REJECTED`. */
  async getFactHistory(
    scope: TenantScope,
    domain: string,
    key: string,
  ): Promise<readonly BusinessFactRecord[]> {
    return this.repository.listFactHistory(scope, domain, key);
  }

  /**
   * `canUseFact()` — cong runtime. Tra ve QUYET DINH CO MA, khong phai `boolean`.
   *
   * Duong tu choi vi xung dot duoc tinh o day: mot xung dot `OPEN` muc `BLOCKING` co cham vao
   * chinh ban ghi nay thi cong dong. Do la cho "khong co ke thang im lang" tro thanh HANH VI chu
   * khong con la mot cau trong tai lieu.
   */
  async canUseFact(
    scope: TenantScope,
    domain: string,
    key: string,
    required: FactAssuranceLevel,
    at: Date = new Date(),
  ): Promise<FactUsageVerdict> {
    const history = await this.repository.listFactHistory(scope, domain, key);
    // Uu tien ban da qua duyet; neu chua co ban nao thoat khoi `PROPOSED` thi lay ban cuoi de
    // nguoi doc biet CO de xuat nhung chua ai duyet — khac han "khong co gi ca".
    const candidate = history.filter((row) => row.status !== 'PROPOSED').at(-1) ?? history.at(-1);

    if (!candidate) {
      this.telemetry?.decision({
        vocabulary: SOURCE_REGISTRY_DECISIONS,
        point: 'fact.usability',
        outcome: 'denied',
        reason: 'FACT_NOT_APPROVED',
        detail: { domain, key },
      });
      return { allowed: false, reason: 'FACT_NOT_APPROVED', fact: null };
    }

    const blocking = (await this.repository.listConflicts(scope, { factId: candidate.id })).some(
      (row) => isBlockingConflictStatus(row.status) && row.impact === 'BLOCKING',
    );

    const decision = canUseFact({
      status: candidate.status,
      classification: candidate.classification,
      hasOpenBlockingConflict: blocking,
      required,
      withinEffectiveWindow: withinWindow(candidate, at),
    });

    this.telemetry?.decision({
      vocabulary: SOURCE_REGISTRY_DECISIONS,
      point: 'fact.usability',
      outcome: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      // Chi id/trang thai/ma ly do. `value` CHI di vao telemetry khi phan loai cho phep — mot so
      // dien thoai khach hay mot bang gia mat khong duoc nam trong span.
      detail: {
        domain,
        key,
        factId: candidate.id,
        status: candidate.status,
        classification: candidate.classification,
        ...(isTelemetrySafeClassification(candidate.classification)
          ? { value: candidate.value }
          : {}),
      },
    });

    return decision.allowed
      ? { allowed: true, reason: 'FACT_USABLE', fact: candidate }
      : { allowed: false, reason: decision.reason, fact: candidate };
  }

  /** Moi xung dot dang CHAN — nguyen lieu cua man hinh "vi sao khach nay chua chay duoc". */
  async getBlockingConflicts(scope: TenantScope): Promise<readonly BusinessConflictRecord[]> {
    const open = await this.repository.listConflicts(scope, { status: 'OPEN' });
    return open.filter((row) => row.impact === 'BLOCKING');
  }

  /**
   * Nhung su that BAT BUOC ma mot nang luc dang thieu, hoac chua dat muc dam bao no doi.
   *
   * Doc `BusinessRequiredFact` — DU LIEU, khong phai hang so trong code: cai gi bat buoc voi khach
   * nay thi khong bat buoc voi khach kia, va do dung la thu khong duoc hard-code theo ten khach.
   */
  async getMissingRequiredFacts(
    scope: TenantScope,
    capability?: string,
    at: Date = new Date(),
  ): Promise<readonly MissingRequiredFact[]> {
    const required = await this.repository.listRequiredFacts(scope, capability);
    const missing: MissingRequiredFact[] = [];

    for (const item of required) {
      const verdict = await this.canUseFact(
        scope,
        item.domain,
        item.key,
        item.requiresConfirmed ? 'CONFIRMED_ONLY' : 'ASSUMPTION_ALLOWED',
        at,
      );
      if (!verdict.allowed) {
        missing.push({
          capability: item.capability,
          domain: item.domain,
          key: item.key,
          reason: verdict.reason,
        });
      }
    }
    return missing;
  }
}

export type FactUsageVerdict =
  | { readonly allowed: true; readonly reason: 'FACT_USABLE'; readonly fact: BusinessFactRecord }
  | { readonly allowed: false; readonly reason: string; readonly fact: BusinessFactRecord | null };

export interface MissingRequiredFact {
  readonly capability: string;
  readonly domain: string;
  readonly key: string;
  /** Ma ly do tu `canUseFact` — "thieu han" va "co nhung dang bi xung dot chan" la hai viec khac nhau. */
  readonly reason: string;
}

/** Ban ghi con trong cua so hieu luc tai `at` khong. `null` hai dau = luon hieu luc. */
function withinWindow(
  record: { readonly effectiveFrom: Date | null; readonly effectiveTo: Date | null },
  at: Date,
): boolean {
  if (record.effectiveFrom && at < record.effectiveFrom) return false;
  if (record.effectiveTo && at >= record.effectiveTo) return false;
  return true;
}
