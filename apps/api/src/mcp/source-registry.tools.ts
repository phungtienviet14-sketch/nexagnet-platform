import { z } from 'zod';
import type { SourceReadinessService } from '../source-registry/source-readiness.service.js';
import type { SourceRegistryService } from '../source-registry/source-registry.service.js';
import type { TenantScope } from '../source-registry/tenant-scope.js';

/**
 * MCP tool cho tang NGUON SU THAT — CHI DOC.
 *
 * VI SAO CHI DOC (muc 13 hop dong nhiem vu). Cong ghi cua tang nay doi mot thu ma mot phien agent
 * khong cung cap duoc mot cach trung thuc: **mot nguoi co tham quyen va mot dan chung**. Mo
 * `approve_source` hay `resolve_conflict` cho MCP la tao ra dung con duong ma ca tang nay sinh ra
 * de chan — mot ban duyet khong co ai chiu trach nhiem, hoac mot xung dot bi dong vi "he thong
 * thay nen the".
 *
 * Nam ngoai `source-of-truth.tools.ts` co y: bo tool cu CRUD *hang* nguon su that (SP/gia/dai ly).
 * Bo nay tra loi cau khac han — "so lieu do tu dau ra, ai duyet, va con gi dang tranh chap".
 *
 * `TenantScope` duoc TIEM VAO, khong doc tu tham so tool. Mot tool nhan `tenantId` tu doi so la
 * mot tool ma bat ky ai cung tu xung duoc la khach khac.
 */

export const listSourcesInput = z.object({
  status: z
    .enum(['RECEIVED', 'NORMALIZED', 'REVIEWED', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'REJECTED', 'QUARANTINED'])
    .optional(),
});

export const getSourceInput = z.object({
  sourceId: z.string().trim().min(1, 'sourceId không được để trống'),
});

export const factAddressInput = z.object({
  domain: z.string().trim().min(1, 'domain không được để trống'),
  key: z.string().trim().min(1, 'key không được để trống'),
});

export const canUseFactInput = factAddressInput.extend({
  required: z.enum(['CONFIRMED_ONLY', 'ASSUMPTION_ALLOWED']).default('CONFIRMED_ONLY'),
});

export type ToolSuccess = { ok: true; [key: string]: unknown };
export type ToolFailure = { ok: false; error: string };
export type ToolResult = ToolSuccess | ToolFailure;

const success = (data: Record<string, unknown>): ToolSuccess => ({ ...data, ok: true });
const failure = (error: string): ToolFailure => ({ ok: false, error });

function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; value: T } | ToolFailure {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : failure(result.error.issues.map((issue) => issue.message).join('; '));
}

/**
 * Hinh dang MOT nguon khi tra ve cho agent.
 *
 * KHONG tra `locator` day du va KHONG tra noi dung: agent can biet mot ban co ton tai, o trang
 * thai nao, hash gi — de doi chieu. No khong can duong di toi byte, va mot duong di toi byte nam
 * trong hoi thoai la mot duong di toi byte nam trong log hoi thoai.
 */
const sourceView = (source: {
  id: string;
  sourceKey: string;
  title: string;
  kind: string;
  version: string;
  origin: string;
  authority: string;
  classification: string;
  status: string;
  contentHash: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  supersedesId: string | null;
}) => ({
  id: source.id,
  sourceKey: source.sourceKey,
  title: source.title,
  kind: source.kind,
  version: source.version,
  origin: source.origin,
  authority: source.authority,
  classification: source.classification,
  status: source.status,
  contentHash: source.contentHash,
  effectiveFrom: source.effectiveFrom?.toISOString() ?? null,
  effectiveTo: source.effectiveTo?.toISOString() ?? null,
  supersedesId: source.supersedesId,
});

/**
 * Gia tri cua su that CHI di kem khi phan loai cho phep.
 *
 * Cung quy tac voi telemetry, va vi cung mot ly do: mot cau tra loi cua agent la mot chuoi se
 * duoc luu lai o dau do. Agent van lam viec duoc — no biet co su that, biet trang thai, biet
 * nguon — chi la khong doc duoc con so mat.
 */
const TELEMETRY_SAFE = new Set(['PUBLIC', 'INTERNAL']);

const factView = (fact: {
  id: string;
  domain: string;
  key: string;
  value: unknown;
  status: string;
  classification: string;
  sourceId: string;
  sourceLocus: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  assumptionRationale: string | null;
  assumptionRisk: string | null;
  assumptionReversibility: string | null;
  assumptionOwner: string | null;
}) => ({
  id: fact.id,
  domain: fact.domain,
  key: fact.key,
  status: fact.status,
  classification: fact.classification,
  sourceId: fact.sourceId,
  sourceLocus: fact.sourceLocus,
  effectiveFrom: fact.effectiveFrom?.toISOString() ?? null,
  effectiveTo: fact.effectiveTo?.toISOString() ?? null,
  ...(TELEMETRY_SAFE.has(fact.classification)
    ? { value: fact.value }
    : { value: null, valueWithheld: 'classification' }),
  ...(fact.status === 'WORKING_ASSUMPTION'
    ? {
        assumption: {
          rationale: fact.assumptionRationale,
          risk: fact.assumptionRisk,
          reversibility: fact.assumptionReversibility,
          owner: fact.assumptionOwner,
        },
      }
    : {}),
});

/* ------------------------------------------------------------------ *
 * Nam tool DOC
 * ------------------------------------------------------------------ */

export async function listSources(
  registry: SourceRegistryService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(listSourcesInput, input);
  if (!parsed.ok) return parsed;
  const sources = await registry.listSources(scope);
  const filtered = parsed.value.status
    ? sources.filter((source) => source.status === parsed.value.status)
    : sources;
  return success({ sources: filtered.map(sourceView), count: filtered.length });
}

export async function getSource(
  registry: SourceRegistryService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(getSourceInput, input);
  if (!parsed.ok) return parsed;
  const source = await registry.findSourceById(scope, parsed.value.sourceId);
  return source
    ? success({ source: sourceView(source) })
    : failure(`Khong tim thay nguon ${parsed.value.sourceId}`);
}

export async function listConflicts(
  registry: SourceRegistryService,
  scope: TenantScope,
): Promise<ToolResult> {
  const conflicts = await registry.listConflicts(scope);
  return success({
    conflicts: conflicts.map((conflict) => ({
      id: conflict.id,
      conflictKey: conflict.conflictKey,
      domain: conflict.domain,
      subjectKey: conflict.subjectKey,
      summary: conflict.summary,
      impact: conflict.impact,
      status: conflict.status,
      competingFactIds: conflict.factIds,
      // Goi y duoc HIEN cho agent doc — de no giai thich duoc tinh hinh — nhung khong co tool nao
      // trong tep nay bien no thanh mot quyet dinh.
      recommendedFactId: conflict.recommendedFactId,
      recommendationReason: conflict.recommendationReason,
      resolvedFactId: conflict.resolvedFactId,
      resolutionRef: conflict.resolutionRef,
    })),
    openCount: conflicts.filter((conflict) => conflict.status === 'OPEN').length,
  });
}

export async function getEffectiveFact(
  readiness: SourceReadinessService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(factAddressInput, input);
  if (!parsed.ok) return parsed;
  const fact = await readiness.getEffectiveFact(scope, parsed.value.domain, parsed.value.key);
  return fact
    ? success({ fact: factView(fact) })
    : success({ fact: null, note: 'Khong co ban nao dang hieu luc tai dia chi nay' });
}

export async function getFactHistory(
  readiness: SourceReadinessService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(factAddressInput, input);
  if (!parsed.ok) return parsed;
  const history = await readiness.getFactHistory(scope, parsed.value.domain, parsed.value.key);
  return success({ history: history.map(factView), count: history.length });
}

/**
 * `can_use_fact` — tool QUAN TRONG NHAT trong bo nay.
 *
 * No cho agent hoi truoc khi tra loi: "so lieu nay dung duoc cho viec nay khong?". Cau tra loi
 * mang MA LY DO, nen khi bi tu choi thi agent noi duoc VI SAO voi nguoi dung — "dang co xung dot
 * chua chot" khac han "chua ai duyet" va khac han "day moi la gia dinh cua chung toi".
 */
export async function canUseFact(
  readiness: SourceReadinessService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(canUseFactInput, input);
  if (!parsed.ok) return parsed;
  const verdict = await readiness.canUseFact(
    scope,
    parsed.value.domain,
    parsed.value.key,
    parsed.value.required,
  );
  return success({
    allowed: verdict.allowed,
    reason: verdict.reason,
    fact: verdict.fact ? factView(verdict.fact) : null,
  });
}
