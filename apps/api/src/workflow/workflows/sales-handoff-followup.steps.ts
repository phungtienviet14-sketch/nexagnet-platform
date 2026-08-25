import { buildOperationKey } from '../operation-key.js';
import { SALES_HANDOFF_FOLLOWUP_KEY } from '../workflow-registry.js';
import { resolveDestinationUrl } from './workflow-destination.js';

/**
 * CAC BUOC cua `sales-handoff-followup` duoi dang HAM THUAN — khong Nest, khong Hatchet.
 *
 * Cung ly do tach nhu `integration-handoff.steps.ts`: buoc la noi tac dung phu that xay ra, va
 * moi che do hong cua no phai kiem duoc trong vai mili giay chu khong phai bang cach dung ca
 * mot engine.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN QUAN TRONG NHAT CUA TEP NAY: WORKFLOW KHONG SO HUU SU THAT NGHIEP VU.
 *
 * Workflow nho DUY NHAT mot cau: "hay di kiem lai viec ban giao cua don X".
 * No KHONG nho "don X dang treo" — vi giua luc xep hang va luc thuc day co the da vai ngay
 * troi qua, va trong khoang do mot con nguoi rat co the da xu ly xong. Neu workflow tin vao
 * ban chup luc xep hang thi no se nhac ve mot viec da lam xong — dung kieu phien nhieu lam
 * nguoi ta tat canh bao di, va tu do tro thanh mu.
 *
 * Vi vay MOI lan thuc day deu bat dau bang mot lan doc LAI tu DB nghiep vu.
 */

/**
 * LY DO HONG CO KIEU — bo RIENG cua khuon nay, khong dung chung voi `integration-handoff`.
 *
 * Khuon kia noi voi mot he ngoai bat ky; khuon nay noi voi CHINH API cua Nexagnet. Cac che do
 * hong that su khac nhau (khong co `RATE_LIMITED`, co duong 404 khong phai loi), va gop chung
 * vao mot bo se tao ra nhung ma khong bao gio xay ra o mot trong hai ben.
 */
export const FOLLOWUP_STEP_FAILURES = [
  /** Goi khach khai mot dich den ma ha tang chua cau hinh URL. LOI CAU HINH. */
  'DESTINATION_NOT_CONFIGURED',
  /** API nghiep vu loi phia no. Thu lai duoc. */
  'BUSINESS_API_5XX',
  /** API nghiep vu tu choi yeu cau (401/403/422). KHONG thu lai. */
  'BUSINESS_API_4XX',
  /** API nghiep vu khong tra loi kip. Thu lai duoc. */
  'BUSINESS_API_TIMEOUT',
  /** Tra 2xx nhung than khong doc duoc/khong dung hop dong. Khong duoc coi la thanh cong. */
  'BUSINESS_API_MALFORMED_RESPONSE',
] as const;

export type FollowupStepFailure = (typeof FOLLOWUP_STEP_FAILURES)[number];

export const FOLLOWUP_STEP_FAILURE_LABELS: Record<FollowupStepFailure, string> = {
  DESTINATION_NOT_CONFIGURED: 'Đích đến chưa được cấu hình URL ở hạ tầng',
  BUSINESS_API_5XX: 'API nghiệp vụ lỗi phía nó',
  BUSINESS_API_4XX: 'API nghiệp vụ từ chối yêu cầu',
  BUSINESS_API_TIMEOUT: 'API nghiệp vụ không trả lời kịp',
  BUSINESS_API_MALFORMED_RESPONSE: 'API nghiệp vụ trả 2xx nhưng thân không đúng hợp đồng',
};

export class FollowupStepFailed extends Error {
  constructor(
    readonly reason: FollowupStepFailure,
    /** Thu lai co ich khong? Thuoc tinh cua NGUYEN NHAN, khong phai lua chon cua noi goi. */
    readonly retryable: boolean,
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'FollowupStepFailed';
  }
}

/**
 * Dung hop dong dau vao v1 (`workflow-registry.ts`) — sau truong, khong truong nao mang PII.
 *
 * `type` chu khong phai `interface`: TypeScript suy ra index signature NGAM cho type alias nhung
 * KHONG cho interface, ma SDK cua engine doi dau vao thoa `JsonObject`. Doi thanh `interface` se
 * lam adapter khong bien dich duoc, voi mot thong bao loi chang lien quan gi toi nguyen nhan.
 */
export type SalesHandoffFollowupInput = {
  readonly tenant: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly operation: string;
  readonly operationVersion: number;
  readonly destination: string;
};

// ------------------------------------------------------------------ 1. resolve

export function resolveFollowupDestination(destination: string, env: NodeJS.ProcessEnv): string {
  const found = resolveDestinationUrl(destination, env);
  if ('error' in found) {
    throw new FollowupStepFailed('DESTINATION_NOT_CONFIGURED', false, found.error);
  }
  return found.url;
}

// ------------------------------------------------- 2. dung lai khoa thao tac

/**
 * GIAI DOAN theo doi. v1 CO DUNG MOT — va do la mot gioi han co chu y, khong phai mot bo khung
 * bo dang do.
 *
 * Goi khach hien chi khai duoc MOT nguong (`remindAfterSeconds`). Dung mot thang escalation hai
 * ba tang len tren mot chinh sach mot tang la tu bia ra nghiep vu — dung dieu ma phien nay bi
 * cam lam. Khi khach noi duoc tang thu hai la gi thi them mot gia tri o day va mot truong o
 * schema; khoa thao tac da mang san `stage` nen viec do khong pha ban ghi cu.
 */
export const FOLLOWUP_STAGES = ['reminder'] as const;
export type FollowupStage = (typeof FOLLOWUP_STAGES)[number];

/**
 * DUNG LAI khoa idempotency tu input + moi truong, thay vi nhan no kem theo.
 *
 * Neu khoa duoc mang di hai lan thi ta chi chung minh duoc "mot chuoi di duoc tu A sang B".
 * Dung lai duoc no tu cung mot bo chieu chinh la bang chung khoa co tinh TAT DINH — va tinh do
 * moi la thu chan don trung khi engine chay lai mot task (Hatchet tu cong bo at-least-once).
 *
 * `stage` nam trong khoa: hai lan nhac o hai giai doan khac nhau la HAI viec khac nhau, con hai
 * lan chay lai cua CUNG mot giai doan thi phai ra cung mot khoa.
 *
 * `environment` la chieu duy nhat khong nam trong input (no thuoc ve BAN TRIEN KHAI), nen no doc
 * tu `additionalMetadata`. Thieu no thi NEM: doan mot mac dinh o day nghia la gd1-test va pilot
 * dung chung khoa cho cung mot don — tuc moi truong nay lam moi truong kia bi bo qua vi "da lam
 * roi".
 */
export function recomputeFollowupKey(
  input: SalesHandoffFollowupInput,
  metadata: Readonly<Record<string, string>>,
  stage: FollowupStage,
): string {
  const environment = metadata['nexagnet.environment']?.trim();
  if (!environment) {
    throw new FollowupStepFailed(
      'BUSINESS_API_MALFORMED_RESPONSE',
      false,
      "thieu 'nexagnet.environment' trong metadata cua run — khong dung lai duoc khoa thao tac",
    );
  }

  return buildOperationKey({
    tenant: input.tenant,
    environment,
    // Lay tu HANG SO chu khong tu metadata: tep nay CHINH LA khuon do. Doc danh tinh cua chinh
    // minh tu metadata la mot vong lap tin cay thua.
    workflowKey: SALES_HANDOFF_FOLLOWUP_KEY,
    operationVersion: input.operationVersion,
    entityType: input.entityType,
    entityId: input.entityId,
    // `operation` cua khoa mang ca GIAI DOAN — xem chu thich tren.
    operation: `${input.operation}-${stage}`,
    destination: input.destination,
  });
}

// --------------------------------------------------------------- 3. doc trang thai

/**
 * Trang thai SONG cua mot viec ban giao, doc lai tu DB nghiep vu.
 *
 * Union phan biet chu khong phai mot `status: string`: ba truong hop nay dan toi ba hanh dong
 * khac han nhau, va mot chuoi tu do se de nguoi doc phai nho gia tri nao dan toi dau.
 */
export type HandoffLiveState =
  | {
      readonly state: 'pending';
      /** ISO-8601, tu `salesHandoff.createdAt`. Goc de tinh da treo bao lau. */
      readonly openedAt: string;
      /** Giai doan da nhac roi, `null` neu chua nhac lan nao. */
      readonly followUpStage: string | null;
    }
  /** Nguoi da xu ly (`completed`) hoac don bi huy (`cancelled`) — het viec. */
  | { readonly state: 'resolved'; readonly resolution: string }
  /** Don khong con, hoac chua bao gio co viec ban giao. Cung la het viec. */
  | { readonly state: 'absent' };

export interface BusinessApiArgs {
  /** URL GOC cua API theo doi ban giao. Duong dan cu the do chinh tep nay dung. */
  readonly baseUrl: string;
  readonly entityId: string;
  /** Khoa API noi bo; bo qua header khi rong (che do demo/CI `AUTH_MODE=none`). */
  readonly apiKey?: string;
  readonly traceparent?: string;
}

export interface BusinessApiDeps {
  /** Tiem vao de test khong cham mang. Mac dinh la `fetch` cua runtime. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Duong dan cua mot viec ban giao. Gop o mot cho de hai buoc khong the lech nhau. */
function handoffUrl(baseUrl: string, entityId: string, suffix = ''): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/${encodeURIComponent(entityId)}${suffix}`;
}

/**
 * Hai header — cung ly do voi `integration-handoff`:
 *
 *   x-api-key    API noi bo van sau mot guard toan cuc. Rong -> BO HAN header, khong gui rong.
 *   traceparent  soi day W3C. Rong -> BO HAN. Khi runtime tracing dang chay, chinh no da tiem
 *                header nay roi; dat them mot cai cung ten se lam yeu cau di ra HAI header va
 *                Node o dau kia noi chung bang dau phay — tuc bat tracing len se LAM DUT chinh
 *                soi day no sinh ra de noi.
 */
function headers(args: BusinessApiArgs, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(args.apiKey ? { 'x-api-key': args.apiKey } : {}),
    ...(args.traceparent ? { traceparent: args.traceparent } : {}),
    ...extra,
  };
}

function failFromResponse(status: number): FollowupStepFailed {
  if (status >= 500) return new FollowupStepFailed('BUSINESS_API_5XX', true, `tra ${status}`);
  return new FollowupStepFailed('BUSINESS_API_4XX', false, `tra ${status}`);
}

function failFromNetwork(error: unknown, timeoutMs: number): FollowupStepFailed {
  const aborted =
    error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
  return new FollowupStepFailed(
    'BUSINESS_API_TIMEOUT',
    true,
    aborted ? `khong tra loi trong ${timeoutMs}ms` : `loi mang: ${message(error)}`,
  );
}

/**
 * DOC LAI trang thai hien tai. Buoc nay chay o CA HAI dau cua lan ngu — truoc va sau.
 *
 * Doc truoc khi ngu khong thua: giua luc xep hang (trong giao dich nghiep vu) va luc worker nhan
 * duoc viec da co mot khoang — outbox tick + hang doi cua engine. Mot don duoc xu ly ngay trong
 * khoang do phai duoc phat hien truoc khi ta dat mot cai hen gio nhieu ngay cho no.
 */
export async function loadHandoffState(
  args: BusinessApiArgs,
  deps: BusinessApiDeps = {},
): Promise<HandoffLiveState> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(handoffUrl(args.baseUrl, args.entityId), {
      method: 'GET',
      headers: headers(args),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw failFromNetwork(error, timeoutMs);
  }

  // 404 = don khong con. KHONG phai loi: mot don bi xoa/khong ton tai la mot cau tra loi hop le
  // cho cau hoi "viec nay con treo khong?", va cau tra loi do la "khong".
  if (response.status === 404) return { state: 'absent' };
  if (!response.ok) throw failFromResponse(response.status);

  let body: { state?: unknown; openedAt?: unknown; resolution?: unknown; followUpStage?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new FollowupStepFailed('BUSINESS_API_MALFORMED_RESPONSE', false, 'than khong phai JSON');
  }

  if (body.state === 'absent') return { state: 'absent' };
  if (body.state === 'resolved') {
    return {
      state: 'resolved',
      resolution: typeof body.resolution === 'string' ? body.resolution : 'unknown',
    };
  }
  if (body.state === 'pending' && typeof body.openedAt === 'string') {
    return {
      state: 'pending',
      openedAt: body.openedAt,
      followUpStage: typeof body.followUpStage === 'string' ? body.followUpStage : null,
    };
  }

  // KHONG doan. Mot than khong dung hop dong ma bi coi la "chac la resolved" se lam workflow ket
  // thuc im lang, va viec ban giao quay lai dung cho khong ai theo doi — dung thu ca khuon nay
  // sinh ra de tranh.
  throw new FollowupStepFailed(
    'BUSINESS_API_MALFORMED_RESPONSE',
    false,
    `khong doc duoc trang thai tu than tra ve (state=${String(body.state)})`,
  );
}

// ------------------------------------------------------------ 4. bao dam co nguoi de y

export interface EnsureFollowupResult {
  /** `true` = lan goi nay DA danh dau. `false` = khong con pending, khong lam gi. */
  readonly applied: boolean;
  readonly stage: string;
}

/**
 * TAC DUNG PHU DUY NHAT cua khuon nay: danh dau viec ban giao la "da qua han, can nguoi de y".
 *
 * KHONG day ERP, KHONG nhan tin ra ngoai nhom. Pham vi cua v1 la "viec ban giao khong bi quen"
 * chu khong phai "thay nguoi bang tu dong hoa" — xem `salesHandoffFollowupSchema`.
 *
 * EXACTLY-ONCE nam o HAI LOP, va can ca hai:
 *
 *   1. `idempotency-key` (khoa thao tac tat dinh) — chan lan chay LAP LAI cua cung mot task.
 *   2. Cong trang thai o phia API (`pending` moi ghi, va khong ghi de giai doan da co) — chan
 *      truong hop lop 1 khong the thay: hai lan goi den tu hai duong khac nhau.
 *
 * Chi mot lop la khong du. Khoa mot minh khong chan duoc mot su kien trung xep hang hai lan voi
 * hai khoa khac nhau; cong trang thai mot minh khong chan duoc hai lan goi song song.
 */
export async function ensureFollowup(
  args: BusinessApiArgs & { readonly stage: FollowupStage; readonly operationKey: string },
  deps: BusinessApiDeps = {},
): Promise<EnsureFollowupResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(handoffUrl(args.baseUrl, args.entityId, '/followup'), {
      method: 'POST',
      headers: headers(args, {
        'content-type': 'application/json',
        'idempotency-key': args.operationKey,
      }),
      body: JSON.stringify({ stage: args.stage }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw failFromNetwork(error, timeoutMs);
  }

  // Don bien mat giua chung -> khong con viec de nhac. Giong `loadHandoffState`, day khong phai loi.
  if (response.status === 404) return { applied: false, stage: args.stage };
  if (!response.ok) throw failFromResponse(response.status);

  let body: { applied?: unknown; stage?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new FollowupStepFailed('BUSINESS_API_MALFORMED_RESPONSE', false, 'than khong phai JSON');
  }

  if (typeof body.applied !== 'boolean') {
    throw new FollowupStepFailed(
      'BUSINESS_API_MALFORMED_RESPONSE',
      false,
      "than thieu 'applied' — khong biet lan goi nay co danh dau hay khong",
    );
  }
  return {
    applied: body.applied,
    stage: typeof body.stage === 'string' ? body.stage : args.stage,
  };
}

// ------------------------------------------------------------------- 5. tinh gio

/**
 * CON PHAI NGU BAO LAU NUA, tinh tu luc viec ban giao duoc mo.
 *
 * Tinh tu `openedAt` chu KHONG phai tu luc workflow bat dau, va do la ca diem cua ham nay: giua
 * luc don chuyen `pending` va luc worker nhan viec co mot khoang (outbox tick, hang doi engine,
 * mot lan worker chet va len lai). Ngu tron `remindAfterSeconds` ke tu luc THUC DAY se cong don
 * khoang tre do vao nguong cua khach — nguong 4 gio am tham thanh 4 gio 10 phut.
 *
 * Tra ve 0 khi da qua han: `sleepFor(0)` khong con y nghia, nen noi goi bo qua lan ngu.
 * KHONG tra so am — mot khoang ngu am la mot loi lap tuc o phia SDK.
 */
export function remainingWaitSeconds(
  openedAt: string,
  remindAfterSeconds: number,
  now: Date,
): number {
  const opened = Date.parse(openedAt);
  // `openedAt` hong -> ngu tron nguong. An toan hon la nhac ngay: mot ngay thang khong doc duoc
  // khong phai bang chung rang viec da treo lau.
  if (!Number.isFinite(opened)) return remindAfterSeconds;
  const elapsedSeconds = (now.getTime() - opened) / 1_000;
  return Math.max(0, Math.ceil(remindAfterSeconds - elapsedSeconds));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
