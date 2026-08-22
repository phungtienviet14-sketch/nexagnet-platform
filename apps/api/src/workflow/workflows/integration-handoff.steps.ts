import { buildOperationKey } from '../operation-key.js';
import { INTEGRATION_HANDOFF_KEY } from '../workflow-registry.js';

/**
 * BA BUOC cua `integration-handoff` duoi dang HAM THUAN — khong Nest, khong Hatchet, khong fetch
 * toan cuc.
 *
 * VI SAO TACH RA KHOI DINH NGHIA WORKFLOW: buoc la noi TAC DUNG PHU THAT xay ra (goi mot he
 * ngoai). Neu logic do chi song ben trong mot callback cua SDK thi moi che do hong cua no —
 * dich den chua cau hinh, 500, 429, treo — chi kiem duoc bang cach dung ca mot engine. Tach ra
 * thi bay che do hong kiem duoc trong vai mili giay, va `hatchet/` chi con viec noi day.
 *
 * TRUNG TINH: khong ten khach, khong SKU, khong gia, khong tu vung nganh. "Day mot don len ERP",
 * "dong bo ho so sang CRM" va "goi webhook sau khi duyet" deu la khuon nay voi `destination`
 * khac nhau.
 */

/**
 * LY DO HONG CO KIEU. Mot cong nghiep vu co N duong hong thi phai phan biet duoc N ly do —
 * gop chung thanh mot `boolean` (hay mot `Error` tran) la vut di dung thu ma nguoi truc dem can.
 *
 * `retryable` di KEM ma chu khong suy ra tu ma o noi goi: no la thuoc tinh cua chinh nguyen nhan.
 * Thu lai mot payload sai khuon (4xx) la lang phi vong lap; khong thu lai mot 503 la mat viec.
 */
export const HANDOFF_STEP_FAILURES = [
  /** Goi khach khai mot dich den ma ha tang chua cau hinh URL. LOI CAU HINH, khong phai loi he ngoai. */
  'DESTINATION_NOT_CONFIGURED',
  /** He ngoai loi phia no. Thu lai duoc. */
  'UPSTREAM_5XX',
  /** He ngoai tu choi yeu cau. KHONG thu lai: thu lai cung mot payload sai se sai y het. */
  'UPSTREAM_4XX',
  /** He ngoai khong tra loi kip. Thu lai duoc — nhung xem `Idempotency-Key`, no co the DA nhan. */
  'UPSTREAM_TIMEOUT',
  /** He ngoai bao qua tay. Tach khoi 5xx vi cach xu ly khac han (cho lau hon, khong don dap). */
  'RATE_LIMITED',
  /** Tra 2xx nhung than khong doc duoc. Khong duoc coi la thanh cong. */
  'UPSTREAM_MALFORMED_RESPONSE',
] as const;

export type HandoffStepFailure = (typeof HANDOFF_STEP_FAILURES)[number];

/** Nhan tieng Viet cho nguoi doc log/runbook. Tach khoi ma vi ma la thu MAY loc. */
export const HANDOFF_STEP_FAILURE_LABELS: Record<HandoffStepFailure, string> = {
  DESTINATION_NOT_CONFIGURED: 'Đích đến chưa được cấu hình URL ở hạ tầng',
  UPSTREAM_5XX: 'Hệ ngoài lỗi phía nó',
  UPSTREAM_4XX: 'Hệ ngoài từ chối yêu cầu',
  UPSTREAM_TIMEOUT: 'Hệ ngoài không trả lời kịp',
  RATE_LIMITED: 'Hệ ngoài báo quá tay',
  UPSTREAM_MALFORMED_RESPONSE: 'Hệ ngoài trả 2xx nhưng thân không đọc được',
};

export class HandoffStepFailed extends Error {
  constructor(
    readonly reason: HandoffStepFailure,
    /** Thu lai co ich khong? Thuoc tinh cua NGUYEN NHAN, khong phai lua chon cua noi goi. */
    readonly retryable: boolean,
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'HandoffStepFailed';
  }
}

// ------------------------------------------------------------------ 1. resolve

/** Tien to bien moi truong chua URL that cua mot dich den logic. */
const DESTINATION_ENV_PREFIX = 'WORKFLOW_DESTINATION_';

/**
 * TEN LOGIC -> TEN BIEN MOI TRUONG. Quy tac nam DUNG MOT CHO.
 *
 * `destination` la mot slug (`^[a-z0-9][a-z0-9-]*$`, ep boi schema goi khach), nen phep doi nay
 * khong the sinh ra ten bien la. Neu quy tac nam rai rac o code va o compose thi mot ben doi ma
 * ben kia quen se lam dich den bien mat IM LANG.
 */
export function destinationEnvName(destination: string): string {
  return `${DESTINATION_ENV_PREFIX}${destination.toUpperCase().replaceAll('-', '_')}`;
}

/**
 * Doi ten logic thanh URL that.
 *
 * URL KHONG nam trong `tenants/<slug>/tenant.json` — goi khach nam trong git, va mot endpoint noi
 * bo cua khach khong thuoc ve do. Goi khach chi mang cai TEN; anh xa ten -> URL la cau hinh ha tang.
 */
export function resolveDestination(destination: string, env: NodeJS.ProcessEnv): string {
  const variable = destinationEnvName(destination);
  const raw = env[variable]?.trim();
  if (!raw) {
    throw new HandoffStepFailed(
      'DESTINATION_NOT_CONFIGURED',
      false,
      `dich den '${destination}' chua co URL. Dat bien ${variable} trong khoi 'environment:' ` +
        `cua service worker.`,
    );
  }

  // Kiem o day chu khong de `fetch` tu nem: mot gia tri sai khuon la LOI CAU HINH cua ta, va no
  // phai mang ma cua ta chu khong phai mot `TypeError` cua runtime. Chan luon scheme khong phai
  // http(s) — `file://` di qua duoc thi mot bien dat nham bien thanh mot duong doc file.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HandoffStepFailed(
      'DESTINATION_NOT_CONFIGURED',
      false,
      `${variable} khong phai URL hop le`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HandoffStepFailed(
      'DESTINATION_NOT_CONFIGURED',
      false,
      `${variable} phai la http(s), dang la '${parsed.protocol}'`,
    );
  }
  return raw;
}

// ------------------------------------------------- 2. dung lai khoa thao tac

/** Dung hop dong dau vao v1 (`workflow-registry.ts`) — sau truong, khong truong nao mang PII. */
export interface IntegrationHandoffInput {
  readonly tenant: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly operation: string;
  readonly operationVersion: number;
  readonly destination: string;
}

/**
 * DUNG LAI khoa thao tac tu input + moi truong, thay vi nhan no kem theo.
 *
 * Day khong phai su rom ra: neu khoa duoc mang di hai lan thi ta chi chung minh duoc "mot chuoi
 * di duoc tu A sang B". Dung lai duoc no tu cung mot bo chieu chinh la bang chung khoa co tinh
 * TAT DINH — va tinh tat dinh do moi la thu chan don trung khi engine chay lai mot task.
 *
 * `environment` la chieu duy nhat khong nam trong input (no thuoc ve BAN TRIEN KHAI, khong thuoc
 * ve thao tac), nen no doc tu `additionalMetadata`. Thieu no thi NEM: doan mot mac dinh o day
 * nghia la gd1-test va pilot dung chung khoa cho cung mot thuc the — tuc la moi truong nay lam
 * moi truong kia bi bo qua vi "da lam roi".
 */
export function recomputeOperationKey(
  input: IntegrationHandoffInput,
  metadata: Readonly<Record<string, string>>,
): string {
  const environment = metadata['nexagnet.environment']?.trim();
  if (!environment) {
    throw new HandoffStepFailed(
      'UPSTREAM_MALFORMED_RESPONSE',
      false,
      "thieu 'nexagnet.environment' trong metadata cua run — khong dung lai duoc khoa thao tac",
    );
  }

  return buildOperationKey({
    tenant: input.tenant,
    environment,
    // Lay tu HANG SO chu khong tu metadata: file nay CHINH LA khuon do. Doc danh tinh cua chinh
    // minh tu metadata la mot vong lap tin cay thua, va neu metadata noi khac thi ta se lang le
    // di theo cai sai.
    workflowKey: INTEGRATION_HANDOFF_KEY,
    operationVersion: input.operationVersion,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    destination: input.destination,
  });
}

// ----------------------------------------------------------------- 3. dispatch

export interface DispatchArgs {
  readonly url: string;
  readonly operationKey: string;
  readonly traceparent: string;
  readonly input: IntegrationHandoffInput;
}

export interface DispatchDeps {
  /** Tiem vao de test khong cham mang. Mac dinh la `fetch` cua runtime. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface DispatchResult {
  readonly externalRef: string;
  readonly status: number;
}

/** He ngoai treo bao lau thi bo cuoc. Ngan hon `executionTimeout` cua buoc de loi mang ma cua ta. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Ban giao THAM CHIEU toi he ngoai.
 *
 * HAI HEADER la bat buoc va khong duoc coi la tuy chon:
 *
 *   Idempotency-Key  khoa cua NEXAGNET. Hatchet tu cong bo at-least-once, nen mot task CO THE
 *                    chay hai lan. Khong co header nay thi lan thu hai la mot ban ghi thu hai
 *                    o he ngoai — dung thu ta dung ca `operation-key.ts` de tranh.
 *   traceparent      soi day W3C. Dut o day thi cau "tin nay -> don nay -> lan goi nay" khong
 *                    noi lai duoc, va do la toan bo diem cua tang quan sat.
 */
export async function dispatchHandoff(
  args: DispatchArgs,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(args.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': args.operationKey,
        traceparent: args.traceparent,
      },
      // Than mang DUNG hop dong dau vao — khong them truong nao. Payload da qua
      // `buildWorkflowInput` truoc khi roi Nexagnet; buoc nay khong duoc lam no "phong phu" hon.
      body: JSON.stringify(args.input),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // `AbortError` (het gio) va loi mang deu ket thuc o day. Tach het gio ra rieng vi no la
    // truong hop DUY NHAT ma he ngoai co the DA nhan viec — nguoi doc log can biet dieu do.
    const aborted =
      error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    throw new HandoffStepFailed(
      'UPSTREAM_TIMEOUT',
      true,
      aborted ? `khong tra loi trong ${timeoutMs}ms` : `loi mang: ${message(error)}`,
    );
  }

  if (response.status === 429) {
    throw new HandoffStepFailed('RATE_LIMITED', true, 'he ngoai tra 429');
  }
  if (response.status >= 500) {
    throw new HandoffStepFailed('UPSTREAM_5XX', true, `he ngoai tra ${response.status}`);
  }
  if (!response.ok) {
    throw new HandoffStepFailed('UPSTREAM_4XX', false, `he ngoai tra ${response.status}`);
  }

  let body: { externalRef?: unknown };
  try {
    body = (await response.json()) as { externalRef?: unknown };
  } catch {
    throw new HandoffStepFailed('UPSTREAM_MALFORMED_RESPONSE', false, 'than khong phai JSON');
  }

  // KHONG coi 2xx la du. Khong co `externalRef` thi ta khong co gi de doi soat ve sau, va mot
  // ban giao khong doi soat duoc thi khong khac gi chua ban giao.
  if (typeof body.externalRef !== 'string' || body.externalRef === '') {
    throw new HandoffStepFailed(
      'UPSTREAM_MALFORMED_RESPONSE',
      false,
      "than thieu 'externalRef' — khong co gi de doi soat ve sau",
    );
  }

  return { externalRef: body.externalRef, status: response.status };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
