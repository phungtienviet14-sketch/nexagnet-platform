import { z } from 'zod';
import type { DecisionLedgerService } from '../decision-ledger/decision-ledger.service.js';
import type { BusinessDecisionRecord } from '../decision-ledger/decision-ledger.types.js';
import { decisionReasonLabel } from '../observability/decision-vocabulary.js';
import type { TenantScope } from '../source-registry/tenant-scope.js';

/**
 * MCP tool cho SO CAI QUYET DINH — CHI DOC.
 *
 * VI SAO CHI DOC (muc 15 hop dong nhiem vu). Mot cong GHI o day doi hai thu ma mot phien agent
 * khong cung cap duoc mot cach trung thuc:
 *
 *   1. NGU NGHIA CHONG TRUNG. `record()` doi mot `occurrence` noi ro "lan ghi nay la lan nao".
 *      Mot agent khong biet minh dang o luot nao, o lan thuc thi nao — nen no chi con hai lua chon
 *      deu sai: bia mot khoa moi moi lan (sinh hang trung) hoac dung lai mot khoa cu (che mat mot
 *      quyet dinh that).
 *   2. THAM QUYEN. Mot hang muc `FINANCIAL_OR_AUTHORIZATION` la bang chung rang mot NGUOI hoac mot
 *      QUY TAC TAT DINH da quyet dinh. Mo duong ghi cho MCP la tao ra dung con duong ma muc 6 sinh
 *      ra de chan: mot de xuat cua LLM tro thanh mot quyet dinh da duyet, chi vi no di qua mot API.
 *
 * `TenantScope` duoc TIEM VAO, khong doc tu tham so tool. Mot tool nhan `tenantId` tu doi so la
 * mot tool ma bat ky ai cung tu xung duoc la khach khac.
 *
 * KHONG PHAI Diagnostic Agent (muc 16 — ngoai pham vi). Ba tool o day tra ve DU LIEU, khong tra ve
 * ket luan, va khong co tool nao tu di tim nguyen nhan.
 */

export const getDecisionInput = z.object({
  decisionId: z.string().trim().min(1, 'decisionId không được để trống'),
});

export const listForSubjectInput = z.object({
  subjectType: z.string().trim().min(1, 'subjectType không được để trống'),
  subjectId: z.string().trim().min(1, 'subjectId không được để trống'),
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
 * Hinh dang MOT quyet dinh khi tra ve cho agent.
 *
 * `reasonLabel` di kem `reasonCode`: agent giai thich duoc tinh hinh bang tieng Viet ma khong phai
 * tu dich mot ma no chua tung thay. Nhan lay tu so dang ky cua bo tu vung, nen no luon khop voi
 * cai capability so huu da khai — khong phai mot bang dich thu hai o day.
 *
 * `detail` tra NGUYEN VAN, va do la an toan: no da qua danh sach trang cua `decision-evidence.ts`
 * TRUOC khi duoc ghi, nen khong the chua PII/bi mat/so tien. Day la loi cua viec chan o CONG GHI
 * thay vi loc o cong doc — mot cong doc phai doan, mot cong ghi thi khong.
 */
const decisionView = (decision: BusinessDecisionRecord) => ({
  id: decision.id,
  decisionPoint: decision.decisionPoint,
  outcome: decision.outcome,
  reasonCode: decision.reasonCode,
  reasonLabel: decisionReasonLabel(decision.reasonCode),
  subjectType: decision.subjectType,
  subjectId: decision.subjectId,
  occurredAt: decision.occurredAt.toISOString(),
  recordedAt: decision.recordedAt.toISOString(),
  actorKind: decision.actorKind,
  actorRef: decision.actorRef,
  criticality: decision.criticality,
  status: decision.status,
  policyRef: decision.policyRef,
  policyVersion: decision.policyVersion,
  modelProvider: decision.modelProvider,
  modelRef: decision.modelRef,
  releaseSha: decision.releaseSha,
  traceId: decision.traceId,
  workflowRunId: decision.workflowRunId,
  approvalRef: decision.approvalRef,
  supersedesId: decision.supersedesId,
  detail: decision.detail,
  factRefs: decision.factRefs.map((ref) => ({
    factId: ref.factId,
    factDomain: ref.factDomain,
    factKey: ref.factKey,
    factStatusAtUse: ref.factStatusAtUse,
    sourceId: ref.sourceId,
    sourceKey: ref.sourceKey,
    sourceVersion: ref.sourceVersion,
  })),
  relations: decision.relations.map((relation) => ({
    kind: relation.kind,
    targetType: relation.targetType,
    targetId: relation.targetId,
  })),
});

export async function getDecision(
  ledger: DecisionLedgerService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(getDecisionInput, input);
  if (!parsed.ok) return parsed;
  const decision = await ledger.getById(scope, parsed.value.decisionId);
  return decision
    ? success({ decision: decisionView(decision) })
    : failure(`Khong tim thay quyet dinh ${parsed.value.decisionId}`);
}

/**
 * `list_decisions_for_subject` — DONG THOI GIAN cua mot ca nghiep vu.
 *
 * Tool huu ich nhat trong bo nay: no tra loi cau "he thong da lam gi voi ca nay, theo thu tu nao,
 * va vi sao" bang MOT lan goi — thay vi mot buoi doc log.
 */
export async function listDecisionsForSubject(
  ledger: DecisionLedgerService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(listForSubjectInput, input);
  if (!parsed.ok) return parsed;
  const timeline = await ledger.timelineForSubject(
    scope,
    parsed.value.subjectType,
    parsed.value.subjectId,
  );
  return success({ decisions: timeline.map(decisionView), count: timeline.length });
}

/**
 * `explain_decision_refs` — mot quyet dinh dua tren NHUNG GI.
 *
 * Tach khoi `get_decision` co chu y: cau hoi o day khac han. `get_decision` tra loi "quyet dinh do
 * la gi"; tool nay tra loi "no dua tren su that/nguon/chinh sach/ban phat hanh nao". Gop lai thi
 * cau tra loi thu hai bi chon trong ba muoi truong cua cau thu nhat.
 *
 * KHONG tra ve `value` cua su that: so cai khong luu no, va tool nay khong di doc no ho.
 */
export async function explainDecisionRefs(
  ledger: DecisionLedgerService,
  scope: TenantScope,
  input: unknown,
): Promise<ToolResult> {
  const parsed = parse(getDecisionInput, input);
  if (!parsed.ok) return parsed;
  const decision = await ledger.getById(scope, parsed.value.decisionId);
  if (!decision) return failure(`Khong tim thay quyet dinh ${parsed.value.decisionId}`);

  return success({
    decisionId: decision.id,
    decisionPoint: decision.decisionPoint,
    reasonCode: decision.reasonCode,
    reasonLabel: decisionReasonLabel(decision.reasonCode),
    // BON MAT PHANG, mot cho. Day la thu bien mot ma ly do thanh mot duong dieu tra.
    basis: {
      facts: decision.factRefs.map((ref) => ({
        factId: ref.factId,
        address: `${ref.factDomain}/${ref.factKey}`,
        statusAtUse: ref.factStatusAtUse,
        source: ref.sourceKey ? `${ref.sourceKey}@${ref.sourceVersion ?? '?'}` : null,
      })),
      policy: decision.policyRef
        ? { ref: decision.policyRef, version: decision.policyVersion }
        : null,
      actor: { kind: decision.actorKind, ref: decision.actorRef },
      model: decision.modelRef
        ? { provider: decision.modelProvider, ref: decision.modelRef }
        : null,
      approvalRef: decision.approvalRef,
    },
    correlation: {
      traceId: decision.traceId,
      spanId: decision.spanId,
      workflowRunId: decision.workflowRunId,
      releaseSha: decision.releaseSha,
    },
    lineage: {
      status: decision.status,
      supersedesId: decision.supersedesId,
      relations: decision.relations.map((relation) => ({
        kind: relation.kind,
        target: `${relation.targetType}/${relation.targetId}`,
      })),
    },
  });
}
