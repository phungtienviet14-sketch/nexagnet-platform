/**
 * QUYEN SO HUU IDEMPOTENCY — thu Nexagnet phai tu giu, khong uy thac cho engine.
 *
 * Tai lieu chinh thuc cua Hatchet (`v1/architecture-and-guarantees.mdx`) noi thang:
 *
 *   "Hatchet is at least once … a task can run more than once, so your task code should be
 *    idempotent"
 *
 * Nen KHONG co exactly-once o day, va khong duoc hua no o bat ky dau. Hatchet CO idempotency cap
 * engine (`v1/idempotency.mdx`, beta) nhung no chan trung LUC TAO RUN, khong chan trung TAC DUNG
 * PHU o he ngoai. Hai viec khac nhau: cai thu nhat bao ve hang doi, cai thu hai bao ve don hang
 * cua khach.
 *
 * ---------------------------------------------------------------------------
 * BA KHAI NIEM KHONG DUOC TRON — day la ly do chinh file nay ton tai
 *
 *   RETRY (engine)        Engine chay lai CUNG mot task cua CUNG mot run theo chinh sach retry.
 *                         Ta khong dieu khien duoc viec no xay ra; ta chi lam cho no vo hai.
 *
 *   REPLAY (nguoi)        Nguoi van hanh bam "chay lai" mot lan thuc thi DA KET THUC.
 *                         POC do duoc: Hatchet replay CHAY LAI TAC DUNG PHU. Khong an toan mac dinh.
 *
 *   CHAY LAI NGHIEP VU    Mot thao tac nghiep vu MOI, tinh co giong cai cu ("gui lai don cho
 *                         khach"). Day KHONG phai lan hai cua thao tac cu — no phai co KHOA MOI,
 *                         neu khong he ngoai se coi no la trung va bo qua.
 *
 * Tron ba cai nay lai la cach nhanh nhat de vua tao don trung, vua danh roi don that.
 *
 * ---------------------------------------------------------------------------
 * BA MUC HO TRO CUA HE NGOAI — semantics phai khac nhau
 *
 *   'key'    He ngoai nhan khoa idempotency va tu chong trung. Replay an toan tu dong.
 *   'lookup' He ngoai tra cuu duoc ban ghi da tao nhung khong nhan khoa. Replay phai KIEM TRUOC.
 *   'none'   He ngoai khong co gi ca. Replay bi CHAN — khong co cach nao lam no an toan.
 *
 * Muc nay la thuoc tinh cua DICH DEN, khai trong rang buoc cua goi khach, khong phai thu ta doan.
 */

/** Muc ho tro idempotency cua he ngoai. Khai trong `tenants/<slug>/tenant.json`. */
export const IDEMPOTENCY_SUPPORTS = ['key', 'lookup', 'none'] as const;
export type IdempotencySupport = (typeof IDEMPOTENCY_SUPPORTS)[number];

/** Nguyen nhan mot lan thuc thi xay ra. Ba khai niem o dau file, duoi dang kieu. */
export const EXECUTION_CAUSES = [
  'initial',
  'engine_retry',
  'operator_replay',
  'business_reexecution',
] as const;
export type ExecutionCause = (typeof EXECUTION_CAUSES)[number];

/**
 * Tam chieu lam nen mot THAO TAC nghiep vu duy nhat.
 *
 * CO Y khong co truong nao noi ve LAN THU. Khoa phai gan voi THAO TAC, khong gan voi lan chay —
 * neu no doi theo lan thu thi retry se tao ra don thu hai, dung dieu ta muon chan.
 */
export interface OperationIdentity {
  readonly tenant: string;
  readonly environment: string;
  /** Khoa on dinh cua khuon workflow (`integration-handoff`), khong kem phien ban code. */
  readonly workflowKey: string;
  /**
   * Phien ban Y NGHIA cua thao tac, khong phai phien ban code.
   *
   * Tang no khi "tao don o he ngoai" doi nghia (vi du doi tu tao nhap sang tao chinh thuc) — luc
   * do cac lan chay cu va moi PHAI khong duoc coi la trung nhau. Deploy code moi ma nghia thao
   * tac khong doi thi KHONG tang.
   */
  readonly operationVersion: number;
  readonly entityType: string;
  readonly entityId: string;
  /** Dong tu nghiep vu: `create` | `cancel` | `sync`… */
  readonly operation: string;
  /** DICH DEN logic (`erp-primary`), khong phai URL va khong phai credential. */
  readonly destination: string;
}

/**
 * Dau phan cach `:` — dung khuon `CampaignDelivery.idempotencyKey` da co
 * (`${campaignId}:${targetId}` trong `prisma-campaign.repository.ts`).
 *
 * Luu y: KHAC voi ten workflow cua Hatchet, von cam dau hai cham. Day la khoa trong DB cua
 * chinh ta nen khong vuong rang buoc do.
 */
const SEPARATOR = ':';
const MAX_KEY_LENGTH = 512;

function assertSegment(name: string, value: string): string {
  if (value.length === 0) {
    throw new TypeError(`OPERATION_KEY_SEGMENT_EMPTY: '${name}' rong — khoa thieu mot chieu`);
  }
  if (value.includes(SEPARATOR)) {
    // Neu cho lot, `a:b` + `c` va `a` + `b:c` se ra cung mot khoa — hai thao tac khac nhau
    // deo chung mot khoa la loi te nhat co the co o lop nay.
    throw new TypeError(
      `OPERATION_KEY_SEGMENT_INVALID: '${name}'='${value}' chua dau '${SEPARATOR}'`,
    );
  }
  return value;
}

/**
 * Khoa on dinh cua mot thao tac. CHUOI DOC DUOC, khong bam:
 * nguoi van hanh phai dan duoc no vao o tim kiem va hieu ngay minh dang nhin cai gi.
 */
export function buildOperationKey(identity: OperationIdentity): string {
  const key = [
    assertSegment('tenant', identity.tenant),
    assertSegment('environment', identity.environment),
    assertSegment('workflowKey', identity.workflowKey),
    assertSegment('operationVersion', `v${identity.operationVersion}`),
    assertSegment('entityType', identity.entityType),
    assertSegment('entityId', identity.entityId),
    assertSegment('operation', identity.operation),
    assertSegment('destination', identity.destination),
  ].join(SEPARATOR);

  if (key.length > MAX_KEY_LENGTH) {
    throw new TypeError(`OPERATION_KEY_TOO_LONG: ${key.length} > ${MAX_KEY_LENGTH}`);
  }
  return key;
}

/** Phan xu cua cong an toan. */
export const EXECUTION_VERDICTS = [
  'ALLOWED',
  /** Cho chay, nhung he ngoai co the sinh ban ghi trung. Phai ghi lai va bao nguoi. */
  'ALLOWED_WITH_DUPLICATE_RISK',
  /** Phai doi soat he ngoai TRUOC. Khong tu dong qua duoc. */
  'REQUIRES_VERIFICATION',
  /** Day la mot thao tac MOI: phai sinh khoa moi, khong dung lai khoa cu. */
  'REQUIRES_NEW_OPERATION_KEY',
  'BLOCKED',
] as const;
export type ExecutionVerdict = (typeof EXECUTION_VERDICTS)[number];

/** Ma ly do — dung khuon `decision-reasons.ts`: DANH TU chi trang thai, khong phai cau mo ta. */
export const EXECUTION_REASONS = [
  'FIRST_EXECUTION',
  'DESTINATION_ACCEPTS_IDEMPOTENCY_KEY',
  /** He ngoai khong chong trung; engine van se retry, nen ta ghi rui ro thay vi giu run lai. */
  'DESTINATION_HAS_NO_IDEMPOTENCY_RETRY_ANYWAY',
  'DESTINATION_REQUIRES_LOOKUP_BEFORE_REPLAY',
  'OPERATOR_VERIFIED_DESTINATION',
  'DESTINATION_HAS_NO_IDEMPOTENCY',
  'NEW_BUSINESS_OPERATION',
] as const;
export type ExecutionReason = (typeof EXECUTION_REASONS)[number];

export const EXECUTION_REASON_LABELS: Record<ExecutionReason, string> = {
  FIRST_EXECUTION: 'Lần chạy đầu tiên của thao tác',
  DESTINATION_ACCEPTS_IDEMPOTENCY_KEY: 'Hệ ngoài nhận khoá idempotency — chạy lại vô hại',
  DESTINATION_HAS_NO_IDEMPOTENCY_RETRY_ANYWAY:
    'Hệ ngoài không chống trùng; engine vẫn retry — có thể sinh bản ghi trùng',
  DESTINATION_REQUIRES_LOOKUP_BEFORE_REPLAY: 'Phải tra cứu hệ ngoài trước khi chạy lại',
  OPERATOR_VERIFIED_DESTINATION: 'Người vận hành đã đối soát hệ ngoài',
  DESTINATION_HAS_NO_IDEMPOTENCY: 'Hệ ngoài không có idempotency — chạy lại sẽ tạo bản ghi trùng',
  NEW_BUSINESS_OPERATION: 'Đây là thao tác nghiệp vụ mới, cần khoá mới',
};

export interface ExecutionRequest {
  readonly cause: ExecutionCause;
  readonly support: IdempotencySupport;
  /**
   * Nguoi van hanh DA doi soat he ngoai va khang dinh ban ghi chua ton tai.
   * Chi co nghia voi `support: 'lookup'`. Voi `'none'` no KHONG mo duoc cong — khong co gi de
   * doi soat thi loi khang dinh cua nguoi khong bien no thanh su that.
   */
  readonly verified?: boolean;
}

export interface ExecutionAuthorization {
  readonly verdict: ExecutionVerdict;
  readonly reason: ExecutionReason;
}

/**
 * Cong an toan — thuan, khong phu thuoc DI, nen kiem duoc tung nhanh.
 *
 * Bang quyet dinh day du (khong nhanh nao roi vao mac dinh im lang):
 *
 *   cause                 | support='key' | support='lookup'      | support='none'
 *   ----------------------|---------------|-----------------------|---------------------------
 *   initial               | ALLOWED       | ALLOWED               | ALLOWED
 *   engine_retry          | ALLOWED       | ALLOWED               | ALLOWED_WITH_DUPLICATE_RISK
 *   operator_replay       | ALLOWED       | REQUIRES_VERIFICATION | BLOCKED
 *   business_reexecution  | REQUIRES_NEW_OPERATION_KEY (moi muc — no la thao tac khac)
 */
export function authorizeExecution(request: ExecutionRequest): ExecutionAuthorization {
  if (request.cause === 'business_reexecution') {
    return { verdict: 'REQUIRES_NEW_OPERATION_KEY', reason: 'NEW_BUSINESS_OPERATION' };
  }

  if (request.cause === 'initial') {
    return { verdict: 'ALLOWED', reason: 'FIRST_EXECUTION' };
  }

  if (request.cause === 'engine_retry') {
    // Chan retry o day khong ngan duoc gi: engine se retry bat ke ta tra ve gi, va giu run lai
    // chi lam no mac ket. Trung thuc hon la cho chay va DAT TEN cho rui ro de no doc duoc.
    return request.support === 'none'
      ? {
          verdict: 'ALLOWED_WITH_DUPLICATE_RISK',
          reason: 'DESTINATION_HAS_NO_IDEMPOTENCY_RETRY_ANYWAY',
        }
      : { verdict: 'ALLOWED', reason: 'DESTINATION_ACCEPTS_IDEMPOTENCY_KEY' };
  }

  // operator_replay
  switch (request.support) {
    case 'key':
      return { verdict: 'ALLOWED', reason: 'DESTINATION_ACCEPTS_IDEMPOTENCY_KEY' };
    case 'lookup':
      return request.verified
        ? { verdict: 'ALLOWED', reason: 'OPERATOR_VERIFIED_DESTINATION' }
        : { verdict: 'REQUIRES_VERIFICATION', reason: 'DESTINATION_REQUIRES_LOOKUP_BEFORE_REPLAY' };
    case 'none':
      // `verified` CO Y khong duoc doc o nhanh nay: khong co gi de doi soat thi mot lan bam
      // "toi da kiem" khong bien viec do thanh su that.
      return { verdict: 'BLOCKED', reason: 'DESTINATION_HAS_NO_IDEMPOTENCY' };
  }
}

export class UnsafeExecution extends Error {
  constructor(
    readonly verdict: ExecutionVerdict,
    readonly reason: ExecutionReason,
    readonly operationKey: string,
  ) {
    super(
      `UNSAFE_EXECUTION[${verdict}/${reason}] khoa='${operationKey}': ` +
        EXECUTION_REASON_LABELS[reason],
    );
    this.name = 'UnsafeExecution';
  }
}

/**
 * Chan duong khi phan xu khong cho phep. NEM kem KHOA THAO TAC — de nguoi van hanh dan thang
 * chuoi do vao o tim cua he ngoai ma doi soat, thay vi phai tu ghep lai tu bon manh log.
 */
export function assertExecutionAuthorized(
  request: ExecutionRequest,
  identity: OperationIdentity,
): ExecutionAuthorization {
  const authorization = authorizeExecution(request);
  if (
    authorization.verdict === 'ALLOWED' ||
    authorization.verdict === 'ALLOWED_WITH_DUPLICATE_RISK'
  ) {
    return authorization;
  }
  throw new UnsafeExecution(
    authorization.verdict,
    authorization.reason,
    buildOperationKey(identity),
  );
}
