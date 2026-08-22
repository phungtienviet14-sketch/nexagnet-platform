/**
 * `automation-proof` — workflow TRUNG TINH de danh gia engine.
 *
 * KHONG dinh den nghiep vu that: khong ten khach, khong SKU, khong gia. Muc dich duy nhat
 * la chung minh tung nang luc ma yeu cau §20 doi hoi, bang mot lan chay THAT:
 *
 *   validate -> map -> dispatch -> await-approval (durable) -> finalize
 *
 * Moi buoc deu tra ve du lieu DA CHE, de kiem tra bang mat trong dashboard xem operator
 * nhin thay gi.
 *
 * `POCWF_VERSION=v2` doi hanh vi de kiem chuyen phien ban (§11/§23).
 */
import { z } from 'zod';
import { Or, SleepCondition, UserEventCondition } from '@hatchet-dev/typescript-sdk';
import { hatchet, PROOF_ENDPOINT } from './hatchet-client.js';
import { bindingFor } from './tenant-binding.js';

export const VERSION = process.env.POCWF_VERSION === 'v2' ? 'v2' : 'v1';
export const APPROVAL_EVENT = 'automation-proof:approved';

/** Hop dong dau vao — bien gioi kieu, giong cach repo dung zod o `packages/tenant`. */
const ProofInput = z.object({
  tenant: z.string().min(1),
  orderRef: z.string().min(1),
  /** Truong "nhay cam" gia lap, de chung minh viec che du lieu truoc khi roi Nexagnet. */
  customer: z.object({
    name: z.string(),
    phone: z.string(),
    address: z.string(),
  }),
  totalQuantity: z.number().int().positive(),
  /** Dieu khien diem cuoi co kiem soat. */
  endpointMode: z.enum(['ok', 'fail_then_ok', 'rate_limited', 'timeout']).default('ok'),
  failTimes: z.number().int().min(0).default(2),
  /** Bao lau thi bo cho duyet va di tiep. */
  approvalTimeout: z.string().default('30s'),
});

export type ProofInput = z.input<typeof ProofInput>;

/** Hinh dang cau tra loi THANH CONG cua diem cuoi co kiem soat. */
type ProofEndpointOk = {
  ok: true;
  externalRef: string;
  attempt: number;
  /** `false` nghia la khoa idempotency nay DA tung tao tac dung — bang chung chong trung. */
  appliedNow: boolean;
  receivedTraceparent: string | null;
  at: string;
};

function redact(value: string): string {
  if (value.length <= 4) return '***';
  return value.slice(0, 2) + '***' + value.slice(-2);
}

export const automationProof = hatchet.workflow<ProofInput>({
  name: 'automation-proof',
  description: 'POC durable workflow (' + VERSION + ')',
});

// ---------------------------------------------------------------- 1. validate
const validate = automationProof.task({
  name: 'validate',
  // Du lieu sai khuon KHONG duoc retry — retry mot payload hong chi ton tai nguyen.
  retries: 0,
  fn: (input, ctx) => {
    const parsed = ProofInput.safeParse(input);
    if (!parsed.success) {
      const where = parsed.error.issues.map((i) => i.path.join('.')).join(',');
      throw new Error('PAYLOAD_INVALID: ' + where);
    }
    const binding = bindingFor(parsed.data.tenant);
    ctx.logger.info('validate ok tenant=' + parsed.data.tenant + ' version=' + VERSION);
    return {
      valid: true,
      tenant: parsed.data.tenant,
      orderRef: parsed.data.orderRef,
      maxAttempts: binding.maxAttempts,
      engineVersion: VERSION,
      // Chung minh traceparent cua Nexagnet di duoc vao trong run.
      traceparent: ctx.additionalMetadata().traceparent ?? null,
    };
  },
});

// ------------------------------------------------------------------- 2. map
const mapPayload = automationProof.task({
  name: 'map',
  parents: [validate],
  retries: 0,
  fn: async (input, ctx) => {
    const upstream = await ctx.parentOutput(validate);
    const binding = bindingFor(upstream.tenant);

    // Che truong nhay cam THEO CAU HINH KHACH, khong phai theo nhanh if theo ten khach.
    const sanitized: Record<string, string> = { name: input.customer.name };
    for (const field of ['phone', 'address'] as const) {
      const raw = input.customer[field];
      sanitized[field] = binding.redactFields.includes(field) ? redact(raw) : raw;
    }

    ctx.logger.info('map -> ' + binding.endpointPath + ' (che: ' + binding.redactFields.join(',') + ')');

    return {
      endpointPath: binding.endpointPath,
      // Khoa idempotency gan voi DON, khong gan voi lan thu -> retry khong tao don thu hai.
      idempotencyKey: upstream.tenant + ':' + upstream.orderRef,
      sanitizedCustomer: sanitized,
      totalQuantity: input.totalQuantity,
    };
  },
});

// -------------------------------------------------------------- 3. dispatch
const dispatch = automationProof.task({
  name: 'dispatch',
  parents: [mapPayload],
  retries: 3,
  backoff: { factor: 2, maxSeconds: 10 },
  executionTimeout: '20s',
  fn: async (input, ctx) => {
    const mapped = await ctx.parentOutput(mapPayload);
    const attempt = ctx.retryCount() + 1;

    // Truyen tiep traceparent cua Nexagnet xuong he ngoai — noi tron chuoi
    // Zalo -> Order -> workflow run -> task -> external API.
    const traceparent = ctx.additionalMetadata().traceparent;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (traceparent) headers.traceparent = traceparent;

    ctx.logger.info(
      'dispatch attempt=' + attempt + ' key=' + mapped.idempotencyKey + ' mode=' + input.endpointMode,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(PROOF_ENDPOINT + mapped.endpointPath, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          mode: input.endpointMode,
          failTimes: input.failTimes,
          idempotencyKey: mapped.idempotencyKey,
          payload: { customer: mapped.sanitizedCustomer, totalQuantity: mapped.totalQuantity },
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // Ma loi CO KIEU — de dashboard hien mot ly do doc duoc, khong phai "Error".
        throw new Error(
          (body.error ?? 'HTTP_ERROR') + ' (status=' + res.status + ', attempt=' + attempt + ')',
        );
      }

      const body = (await res.json()) as ProofEndpointOk;
      ctx.logger.info('dispatch ok attempt=' + attempt + ' externalRef=' + body.externalRef);
      return {
        externalRef: body.externalRef,
        appliedNow: body.appliedNow,
        receivedTraceparent: body.receivedTraceparent,
        attemptsUsed: attempt,
      };
    } catch (err) {
      if (controller.signal.aborted) throw new Error('UPSTREAM_TIMEOUT (attempt=' + attempt + ')');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
});

// ------------------------------------------------- 4. await-approval (durable)
/**
 * Buoc CHO NGUOI — day la thu ma mot hang doi thuong khong lam duoc.
 * Cho SU KIEN duyet, HOAC het gio thi di tiep.
 */
const awaitApproval = automationProof.durableTask({
  name: 'await-approval',
  parents: [dispatch],
  executionTimeout: '10m',
  fn: async (input, ctx) => {
    const started = await ctx.now();
    ctx.logger.info('cho duyet toi da ' + input.approvalTimeout + " — su kien '" + APPROVAL_EVENT + "'");

    const result = await ctx.waitFor(
      Or(
        new SleepCondition(input.approvalTimeout as never, 'het-gio-cho-duyet'),
        new UserEventCondition(APPROVAL_EVENT, '', 'nguoi-duyet'),
      ),
    );

    const keys = Object.keys(result ?? {});
    const approvedByHuman = keys.some((k) => k.toUpperCase().includes('USER_EVENT'));
    const finishedAt = await ctx.now();

    return {
      approvedByHuman,
      waitedSeconds: Math.round((finishedAt.getTime() - started.getTime()) / 1000),
      resolvedBy: keys.join(',') || 'unknown',
    };
  },
});

// ------------------------------------------------------------------ 5. finalize
automationProof.task({
  name: 'finalize',
  parents: [awaitApproval, dispatch],
  retries: 0,
  fn: async (_input, ctx) => {
    const approval = await ctx.parentOutput(awaitApproval);
    const sent = await ctx.parentOutput(dispatch);

    const base = {
      engineVersion: VERSION,
      externalRef: sent.externalRef,
      attemptsUsed: sent.attemptsUsed,
      approvedByHuman: approval.approvedByHuman,
      waitedSeconds: approval.waitedSeconds,
      workflowRunId: ctx.workflowRunId(),
    };

    // v2 them truong — de nhin thay khac biet phien ban ngay tren dashboard.
    return VERSION === 'v2'
      ? { ...base, v2Note: 'buoc finalize cua v2 co them truong nay', settlementPlanned: true }
      : base;
  },
});
