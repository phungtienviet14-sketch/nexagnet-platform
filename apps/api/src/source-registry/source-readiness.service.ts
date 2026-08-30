import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../observability/telemetry.service.js';
import { SOURCE_REGISTRY_DECISIONS } from './source-registry-decisions.js';
import { isTelemetrySafeClassification } from './source-lifecycle.js';
import {
  canUseFact,
  isUsableFactStatus,
  resolveLiveFact,
  type FactAssuranceLevel,
  type LiveFactResolution,
} from './fact-lifecycle.js';
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
 * getAmbiguousFactAddresses() — dia chi nao dang co hai ban song ma chua ai phan xu
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

  /**
   * Ban DANG HIEU LUC tai mot dia chi, hoac `null`. Khong bao gio roi ve ban da bi thay the, va
   * khong bao gio TU CHON khi co hai ban cung song.
   *
   * Ban truoc lam `live.at(-1)` — tuc ban nao tao sau thi thang. Dieu do vi pham dung cai bat bien
   * ma ca tang nay sinh ra de giu: KHONG CO KE THANG IM LANG. Hai su that `CONFIRMED` tai cung mot
   * dia chi ma chua ai thay the, chua ai phan xu, thi cau tra loi dung la KHONG CO cau tra loi —
   * khong phai "cai moi hon".
   */
  async getEffectiveFact(
    scope: TenantScope,
    domain: string,
    key: string,
    at: Date = new Date(),
  ): Promise<BusinessFactRecord | null> {
    const { live, resolution } = await this.adjudicate(scope, domain, key, at);
    if (resolution.kind === 'single') {
      return live.find((row) => row.id === resolution.factId) ?? null;
    }
    if (resolution.kind === 'ambiguous') {
      this.telemetry?.decision({
        vocabulary: SOURCE_REGISTRY_DECISIONS,
        point: 'fact.usability',
        outcome: 'denied',
        reason: 'FACT_AMBIGUOUS_LIVE_VERSIONS',
        detail: { domain, key, competing: resolution.factIds.length, factIds: resolution.factIds },
      });
    }
    return null;
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
    const { history, live, resolution } = await this.adjudicate(scope, domain, key, at);

    // NHAP NHANG CHAN TRUOC MOI THU KHAC. Neu hai ban cung song ma chua ai phan xu thi khong co
    // cau hoi nao ve "ban nay dung duoc khong" tra loi duoc — vi chua biet "ban nay" la ban nao.
    // Mot xung dot dang mo van duoc uu tien bao cao vi no noi duoc nhieu hon: da co nguoi nhin
    // thay, da co phieu, va co cho de di doc.
    if (resolution.kind === 'ambiguous') {
      const openBlocking = await this.hasOpenBlockingConflictOver(scope, resolution.factIds);
      const reason = openBlocking
        ? 'FACT_BLOCKED_BY_OPEN_CONFLICT'
        : 'FACT_AMBIGUOUS_LIVE_VERSIONS';
      this.telemetry?.decision({
        vocabulary: SOURCE_REGISTRY_DECISIONS,
        point: 'fact.usability',
        outcome: 'denied',
        reason,
        detail: { domain, key, competing: resolution.factIds.length, factIds: resolution.factIds },
      });
      return { allowed: false, reason, fact: null };
    }

    // Uu tien ban da phan xu duoc; roi den ban da qua duyet; neu chua co ban nao thoat khoi
    // `PROPOSED` thi lay ban cuoi de nguoi doc biet CO de xuat nhung chua ai duyet — khac han
    // "khong co gi ca".
    const candidate =
      (resolution.kind === 'single'
        ? live.find((row) => row.id === resolution.factId)
        : undefined) ??
      history.filter((row) => row.status !== 'PROPOSED').at(-1) ??
      history.at(-1);

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

  /**
   * Moi dia chi su that dang co HAI BAN TRO LEN cung song ma chua ai phan xu.
   *
   * `getBlockingConflicts()` tra loi "cai gi dang chan" — nhung no chi thay duoc nhung xung dot
   * DA CO NGUOI MO. Ham nay tra loi cau hoi kho hon va quan trong hon: cai gi dang mau thuan ma
   * CHUA AI NHIN THAY. Do la trang thai mac dinh, vi mo mot xung dot la viec co nguoi lam, con
   * hai ban cung song thi tu no xay ra.
   */
  async getAmbiguousFactAddresses(
    scope: TenantScope,
    at: Date = new Date(),
  ): Promise<readonly AmbiguousFactAddress[]> {
    const facts = await this.repository.listFacts(scope);
    const addresses = new Map<string, { domain: string; key: string }>();
    for (const fact of facts) {
      if (isUsableFactStatus(fact.status)) {
        // Khoa JSON thay vi noi chuoi bang dau phan cach: `domain`/`key` la chuoi TU DO, nen
        // moi ky tu phan cach deu co the xuat hien trong chinh chung.
        addresses.set(JSON.stringify([fact.domain, fact.key]), {
          domain: fact.domain,
          key: fact.key,
        });
      }
    }

    const ambiguous: AmbiguousFactAddress[] = [];
    for (const { domain, key } of addresses.values()) {
      const { resolution } = await this.adjudicate(scope, domain, key, at);
      if (resolution.kind === 'ambiguous') {
        ambiguous.push({
          domain,
          key,
          factIds: resolution.factIds,
          hasOpenBlockingConflict: await this.hasOpenBlockingConflictOver(scope, resolution.factIds),
        });
      }
    }
    return ambiguous;
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

  /* ---------------------------------------------------------------- *
   * Noi bo
   * ---------------------------------------------------------------- */

  /**
   * Phan xu MOT dia chi su that tai MOT thoi diem — cho duy nhat quyet dinh "ban nao dang hieu
   * luc", va vi the la cho duy nhat co the sinh ra mot ke thang im lang neu viet sai.
   *
   * Ba duong doc (`getEffectiveFact`, `canUseFact`, `getAmbiguousFactAddresses`) deu di qua day.
   * Do la co y: neu moi duong tu loc lay `live` roi tu chon, thi som muon se co mot duong chon
   * khac hai duong kia, va khong ai phat hien ra cho toi luc mot con so sai di ra mieng khach.
   */
  private async adjudicate(
    scope: TenantScope,
    domain: string,
    key: string,
    at: Date,
  ): Promise<{
    readonly history: readonly BusinessFactRecord[];
    readonly live: readonly BusinessFactRecord[];
    readonly resolution: LiveFactResolution;
  }> {
    const history = await this.repository.listFactHistory(scope, domain, key);
    const live = history.filter((row) => isUsableFactStatus(row.status) && withinWindow(row, at));

    // Loi thoat DUY NHAT khoi nhap nhang: mot xung dot da duoc NGUOI dong bang dan chung tuong
    // minh. Khong phai goi y (`recommendedFactId`), khong phai tham quyen, khong phai ngay thang.
    const settledWinnerIds =
      live.length > 1
        ? (await this.repository.listConflicts(scope, { status: 'RESOLVED' }))
            .map((row) => row.resolvedFactId)
            .filter((id): id is string => id !== null)
        : [];

    return {
      history,
      live,
      resolution: resolveLiveFact(
        live.map((row) => row.id),
        settledWinnerIds,
      ),
    };
  }

  /** Co xung dot dang mo muc `BLOCKING` cham vao BAT KY ban nao trong danh sach khong. */
  private async hasOpenBlockingConflictOver(
    scope: TenantScope,
    factIds: readonly string[],
  ): Promise<boolean> {
    for (const factId of factIds) {
      const touching = await this.repository.listConflicts(scope, { factId });
      if (touching.some((row) => isBlockingConflictStatus(row.status) && row.impact === 'BLOCKING')) {
        return true;
      }
    }
    return false;
  }
}

/** Mot dia chi su that dang co nhieu hon mot ban song. */
export interface AmbiguousFactAddress {
  readonly domain: string;
  readonly key: string;
  readonly factIds: readonly string[];
  /** Da co nguoi mo phieu chua. `false` = mau thuan dang ton tai ma khong ai nhin thay. */
  readonly hasOpenBlockingConflict: boolean;
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
