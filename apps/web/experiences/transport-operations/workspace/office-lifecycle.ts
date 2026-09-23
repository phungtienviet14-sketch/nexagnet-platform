import type { StatusTone } from '../customer-view';
import type {
  LegTransitionTarget,
  RunClosureBlocker,
  RunClosureOutcome,
  RunClosureVerdict,
  RunLeg,
  RunLegPhase,
  TransportOrder,
  TransportOrderStatus,
  VehicleRunStatus,
} from '../transport-types';

/**
 * VIEC CUA VAN PHONG tren chang va don — `#376`, HAM THUAN.
 *
 * Cung khuon `control-tower.ts`: vao la du lieu may chu, ra la nut + cau chu san sang hien. Khong
 * hook, khong fetch, khong React — nen moi luat "hien nut gi, noi ly do gi" kiem duoc bang mot bai
 * `.ts`, con `RunLegWorkflow.tsx`/`OrderFulfilmentPanel.tsx` chi con viec sap xep.
 *
 * ============================================================================================
 * BON BAT BIEN MA TEP NAY KHONG DUOC PHA
 * ============================================================================================
 *
 *   1. MOC HIEN TRUONG LA BANG CHUNG, KHONG PHAI LENH. Giai doan `DELIVERED` chi quyet dinh nut
 *      "Hoan tat" co can ghi de hay khong — no KHONG BAO GIO tu sinh mot lan doi trang thai.
 *   2. KHONG CO NUT NAO CUA VONG CHAY. Dong vong chay la viec cua he thong (`#293`); tep nay chi
 *      DOC ket qua phan xu (`RunClosureVerdict`) de noi ra. `LegTransitionTarget` khong chua mot
 *      buoc nao cua vong chay, nen mot nut dong vong chay khong the bieu dien duoc o day.
 *   3. `LOADED -> COMPLETED` TRAI HIEN TRUONG CHI DI QUA GHI DE CO LY DO (`#332`). Cong that nam o
 *      may chu; man hinh noi TRUOC de nguoi dung khong phai bam roi moi biet.
 *   4. DON KHONG TU "GIAO XONG". `OPEN -> FULFILLED` la mot hanh dong co nguoi thuc hien, va
 *      "vong chay da dong" KHONG phai "don da xong" (`RUN CLOSED != ORDER COMPLETED`, `#274`).
 */

/* ------------------------------------------------------------------ *
 * NHAN TRANG THAI — tieng Viet, khong ma enum (`docs/reviews` F-14)
 * ------------------------------------------------------------------ */

export const ORDER_STATUS_LABEL: Readonly<Record<TransportOrderStatus, string>> = {
  OPEN: 'Đang mở',
  // Cung chu voi cot "Giao hàng" cua man "Kết thúc đơn" — hai man noi mot su that bang mot chu.
  FULFILLED: 'Đã giao xong',
  CANCELLED: 'Đã huỷ',
};

/**
 * `ACTIVE` la "Đang chạy" — DUNG MOT nghia tren ca he thong (`#336`). `COMPLETED` la "Đã đóng",
 * khong phai "Đã xong": vong chay do HE THONG dong, va chu "xong" de doc nham thanh "don da xong".
 */
export const RUN_STATUS_LABEL: Readonly<Record<VehicleRunStatus, string>> = {
  PLANNED: 'Đã lên kế hoạch',
  ACTIVE: 'Đang chạy',
  COMPLETED: 'Đã đóng',
  CANCELLED: 'Đã huỷ',
};

export const LEG_KIND_LABEL: Readonly<Record<RunLeg['kind'], string>> = {
  LOADED: 'Có hàng',
  EMPTY: 'Chạy rỗng',
};

export const LEG_STATUS_LABEL: Readonly<Record<RunLeg['status'], string>> = {
  PLANNED: 'Dự kiến',
  IN_TRANSIT: 'Đang chạy',
  COMPLETED: 'Đã xong',
  CANCELLED: 'Đã huỷ',
};

export const orderStatusTone = (status: TransportOrderStatus): StatusTone => {
  switch (status) {
    case 'OPEN':
      return 'go';
    case 'FULFILLED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

export const runStatusTone = (status: VehicleRunStatus): StatusTone => {
  switch (status) {
    case 'PLANNED':
      return 'wait';
    case 'ACTIVE':
      return 'go';
    case 'COMPLETED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

export const legKindTone = (kind: RunLeg['kind']): StatusTone =>
  kind === 'LOADED' ? 'go' : 'stop';

export const legStatusTone = (status: RunLeg['status']): StatusTone => {
  switch (status) {
    case 'PLANNED':
      return 'wait';
    case 'IN_TRANSIT':
      return 'go';
    case 'COMPLETED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

/** Nhan doc duoc cua mot chang — thay cho `legId`, thu man hinh khong bao gio in ra. */
export const legTitle = (
  leg: Pick<RunLeg, 'sequence' | 'kind' | 'originLabel' | 'destinationLabel'>,
): string =>
  `Chặng ${leg.sequence} · ${leg.kind === 'EMPTY' ? 'chạy rỗng' : 'có hàng'} · ` +
  `${leg.originLabel} → ${leg.destinationLabel}`;

/* ------------------------------------------------------------------ *
 * SU THAT HIEN TRUONG cua mot chang
 * ------------------------------------------------------------------ */

/**
 * BA trang thai, va gop hai cai bat ky se lam man hinh noi sai:
 *
 *   · `UNKNOWN`   — chua doc duoc (dang tai, loi mang). Khong noi "chua giao": co the da giao.
 *   · `NO_SOURCE` — khach khong bat moc hien truong. May chu khong doi chieu, nen khong co gi chan.
 *   · `KNOWN`     — co nguon; `phase: null` nghia la chang CHUA CO MOC NAO (tuc chua giao).
 */
export type FieldTruth =
  | { readonly kind: 'UNKNOWN' }
  | { readonly kind: 'NO_SOURCE' }
  | { readonly kind: 'KNOWN'; readonly phase: RunLegPhase | null };

/** Chu cua CHINH moc lai xe da bam sau cung — nguoi truc doc la biet hien truong dang o dau. */
const FIELD_PHASE_LABEL: Readonly<Record<RunLegPhase, string>> = {
  PLANNED: 'Chưa có mốc',
  AT_PICKUP: 'Đã tới điểm lấy hàng',
  LOADING: 'Đang xếp hàng',
  IN_TRANSIT: 'Đã rời điểm lấy hàng',
  ARRIVED: 'Đã đến nơi giao',
  // KHONG "Đã giao xong": do la chu cua DON `FULFILLED`. Hai truc, hai chu (`#376`).
  DELIVERED: 'Khách đã nhận hàng',
};

export const fieldTruthLabel = (truth: FieldTruth, kind: RunLeg['kind']): string => {
  if (kind === 'EMPTY') return 'Không có mốc hàng';
  switch (truth.kind) {
    case 'UNKNOWN':
      return '—';
    case 'NO_SOURCE':
      return 'Khách chưa bật mốc hiện trường';
    case 'KNOWN':
      return truth.phase === null ? 'Chưa có mốc' : FIELD_PHASE_LABEL[truth.phase];
  }
};

/* ------------------------------------------------------------------ *
 * NUT TREN MOT CHANG
 * ------------------------------------------------------------------ */

export type LegActionKind = 'START' | 'COMPLETE' | 'COMPLETE_WITH_OVERRIDE';

export interface LegAction {
  readonly kind: LegActionKind;
  readonly to: LegTransitionTarget;
  readonly label: string;
  readonly confirmTitle: string;
  readonly confirmDetail: string;
  readonly confirmLabel: string;
  /** Co ⇒ may chu doi `overrideReason`; nut xac nhan khoa den khi co ly do. */
  readonly reasonLabel: string | null;
  readonly isOverride: boolean;
}

export interface LegWorkflowRow {
  readonly action: LegAction | null;
  /** Vi sao khong co buoc tiep, hoac vi sao buoc tiep phai ghi de. `null` khi khong co gi phai noi. */
  readonly note: string | null;
}

export interface LegWorkflowInput {
  readonly leg: Pick<RunLeg, 'sequence' | 'kind' | 'status' | 'originLabel' | 'destinationLabel'>;
  readonly runCode: string;
  readonly runStatus: VehicleRunStatus;
  readonly field: FieldTruth;
  /**
   * May chu DA tu choi hoan tat chang nay vi hien truong (`LEG_FIELD_DELIVERY_NOT_RECORDED`) — biet
   * duoc ngay ca khi ban doc hien truong chua ve hoac khach khong co nguon doc rieng.
   */
  readonly deliveryRejected: boolean;
}

export const FIELD_NOT_DELIVERED_NOTE =
  'Hiện trường chưa ghi khách đã nhận hàng — nhắc lái xe bấm “Khách đã nhận hàng”, hoặc hoàn tất ' +
  'bằng ghi đè có lý do.';

/**
 * Giai doan hien truong ma nguon chan dong coi la "hang con tren xe" — BAN GUONG cua
 * `CARGO_ON_BOARD` (`checkpoint-run-closure-blocker.source.ts`).
 */
const CARGO_ON_BOARD_PHASES: readonly RunLegPhase[] = ['LOADING', 'IN_TRANSIT', 'ARRIVED'];

/**
 * HE QUA cua mot lan ghi de khi hien truong con ghi hang tren xe — noi TRUOC khi bam.
 *
 * Ghi de chi doi trang thai CHANG, khong viet lai hien truong (`#332` F-IT-03). Chang da hoan tat
 * khong nhan moc moi (`#354`), nen `CARGO_STILL_CARRIED` se giu vong chay o lai: khong mot moc nao
 * ghi them duoc de go no. Nguoi bam can biet dieu do truoc — va duong thuong (lai xe bam "Khách đã
 * nhận hàng" TRUOC khi van phong hoan tat) khong mac phai no.
 */
export const OVERRIDE_CARGO_WARNING =
  'Lưu ý: hiện trường đang ghi hàng còn trên xe. Chặng đã hoàn tất không nhận thêm mốc, nên hệ ' +
  'thống sẽ giữ vòng chạy mở vì “hàng còn trên xe”.';

const RUN_TERMINAL_NOTE = 'Vòng chạy đã kết thúc — không đổi trạng thái chặng được nữa.';

const isDelivered = (field: FieldTruth): boolean =>
  field.kind === 'KNOWN' && field.phase === 'DELIVERED';

const isCargoOnBoard = (field: FieldTruth): boolean =>
  field.kind === 'KNOWN' && field.phase !== null && CARGO_ON_BOARD_PHASES.includes(field.phase);

/**
 * Hien truong NOI RO la chua giao — chi khi CO nguon va nguon noi vay, hoac may chu vua tu choi.
 * `UNKNOWN`/`NO_SOURCE` khong du de ket luan: nut thuong van hien, va may chu la nguoi quyet.
 *
 * Mot ban doc hien truong MOI noi "da giao" thang mot lan tu choi CU: giua hai lan, lai xe co the
 * vua bam "Khách đã nhận hàng" (van phong goi dien nhac). Giu nut ghi de luc do la bat nguoi dung
 * viet ly do cho mot lan hoan tat hoan toan binh thuong.
 */
const isKnownUndelivered = (input: LegWorkflowInput): boolean => {
  if (isDelivered(input.field)) return false;
  return input.deliveryRejected || input.field.kind === 'KNOWN';
};

const startAction = (input: LegWorkflowInput): LegAction => ({
  kind: 'START',
  to: 'IN_TRANSIT',
  label: 'Bắt đầu chạy',
  confirmTitle: `Ghi ${legTitle(input.leg)} đang chạy?`,
  confirmDetail:
    'Văn phòng xác nhận xe đã lăn bánh trên chặng này. Chặng đã chạy không huỷ được, chỉ hoàn ' +
    `tất được. Nếu vòng chạy ${input.runCode} chưa chạy, hệ thống tự chuyển nó sang “Đang chạy”.`,
  confirmLabel: 'Bắt đầu chạy',
  reasonLabel: null,
  isOverride: false,
});

const completeAction = (input: LegWorkflowInput): LegAction => ({
  kind: 'COMPLETE',
  to: 'COMPLETED',
  label: 'Hoàn tất chặng',
  confirmTitle: `Hoàn tất ${legTitle(input.leg)}?`,
  confirmDetail:
    (input.leg.kind === 'LOADED' && isDelivered(input.field)
      ? 'Hiện trường đã ghi khách nhận hàng. '
      : '') +
    'Chặng đã hoàn tất không sửa lại được. Sau đó hệ thống tự xét đóng vòng chạy ' +
    `${input.runCode} — văn phòng không đóng tay. Trạng thái đơn không tự đổi.`,
  confirmLabel: 'Hoàn tất chặng',
  reasonLabel: null,
  isOverride: false,
});

const overrideAction = (input: LegWorkflowInput): LegAction => ({
  kind: 'COMPLETE_WITH_OVERRIDE',
  to: 'COMPLETED',
  label: 'Hoàn tất có ghi đè…',
  confirmTitle: `Hoàn tất ${legTitle(input.leg)} trái hiện trường?`,
  confirmDetail:
    'Hiện trường chưa ghi khách đã nhận hàng trên chặng này. Chỉ ghi đè khi đã xác nhận việc giao ' +
    'bằng cách khác. Lý do và giai đoạn hiện trường lúc ghi đè được lưu vào nhật ký kiểm toán ' +
    'cùng người thực hiện. Trạng thái đơn không tự đổi.' +
    (isCargoOnBoard(input.field) ? ` ${OVERRIDE_CARGO_WARNING}` : ''),
  confirmLabel: 'Hoàn tất (ghi đè)',
  reasonLabel: 'Lý do hoàn tất trái hiện trường',
  isOverride: true,
});

export function legWorkflowFor(input: LegWorkflowInput): LegWorkflowRow {
  const { leg, runStatus } = input;
  if (leg.status === 'COMPLETED' || leg.status === 'CANCELLED') return { action: null, note: null };
  // Cung cong `LEG_RUN_TERMINAL` cua may chu: chang con mo tren mot vong chay da ket thuc.
  if (runStatus === 'COMPLETED' || runStatus === 'CANCELLED') {
    return { action: null, note: RUN_TERMINAL_NOTE };
  }
  if (leg.status === 'PLANNED') return { action: startAction(input), note: null };

  if (leg.kind === 'LOADED' && isKnownUndelivered(input)) {
    return { action: overrideAction(input), note: FIELD_NOT_DELIVERED_NOTE };
  }
  return { action: completeAction(input), note: null };
}

/* ------------------------------------------------------------------ *
 * LY DO TU CHOI — doc tu `reason` CO KIEU (`#168 B7`), khong doan tu cau chu
 * ------------------------------------------------------------------ */

export interface LifecycleFailure {
  readonly message: string;
  /** May chu noi "hien truong chua giao" — duong ra duy nhat la ghi de CO LY DO. */
  readonly needsOverride: boolean;
}

/**
 * Cau co dau cho nhung ma van phong gap tren hai lenh nay. Ma nao KHONG co o day thi man hinh hien
 * NGUYEN VAN cau cua may chu — khong doan y. `office-lifecycle.spec.ts` doc ma nguon API de chac
 * moi khoa o day la mot ma CO THAT.
 */
export const LEG_FAILURE_MESSAGE: Readonly<Record<string, string>> = {
  LEG_FIELD_DELIVERY_NOT_RECORDED:
    'Hiện trường chưa ghi khách đã nhận hàng — chưa hoàn tất được chặng có hàng. Muốn hoàn tất ' +
    'trái hiện trường thì chọn “Hoàn tất có ghi đè…” và ghi rõ lý do.',
  LEG_RUN_TERMINAL: RUN_TERMINAL_NOTE,
  LEG_ALREADY_TERMINAL: 'Chặng đã kết thúc từ trước — màn hình vừa đọc lại trạng thái mới.',
  LEG_ALREADY_IN_STATE: 'Chặng đã ở đúng trạng thái này — có người vừa cập nhật trước bạn.',
  LEG_TRANSITION_NOT_PERMITTED:
    'Chặng chưa đi được bước này — chặng phải bắt đầu chạy trước khi hoàn tất.',
  RUN_LEG_NOT_FOUND: 'Không tìm thấy chặng này trong vòng chạy — màn hình vừa đọc lại.',
};

export const ORDER_FAILURE_MESSAGE: Readonly<Record<string, string>> = {
  ORDER_ALREADY_TERMINAL:
    'Đơn đã ở trạng thái cuối (đã giao xong hoặc đã huỷ) — màn hình vừa đọc lại.',
  ORDER_ALREADY_IN_STATE: 'Đơn đã được xác nhận giao xong từ trước.',
  ORDER_TRANSITION_NOT_PERMITTED: 'Đơn không chuyển sang “Đã giao xong” được từ trạng thái này.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn này — màn hình vừa đọc lại.',
};

const FALLBACK_FAILURE = 'Không thực hiện được. Hãy thử lại.';

const reasonOf = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null || !('reason' in error)) return null;
  const { reason } = error as { readonly reason: unknown };
  return typeof reason === 'string' ? reason : null;
};

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message.length > 0 ? error.message : FALLBACK_FAILURE;

export function lifecycleFailureOf(
  error: unknown,
  messages: Readonly<Record<string, string>>,
): LifecycleFailure {
  const reason = reasonOf(error);
  const known = reason === null ? undefined : messages[reason];
  return {
    message: known ?? messageOf(error),
    needsOverride: reason === 'LEG_FIELD_DELIVERY_NOT_RECORDED',
  };
}

/* ------------------------------------------------------------------ *
 * DONG VONG CHAY — chi DOC phan xu cua he thong
 * ------------------------------------------------------------------ */

export const CLOSURE_BLOCKER_LABEL: Readonly<Record<RunClosureBlocker, string>> = {
  RUN_NOT_ACTIVE: 'vòng chạy không ở trạng thái đang chạy',
  LEG_STILL_OPEN: 'còn chặng chưa hoàn tất',
  PLAN_STILL_OPEN: 'còn kế hoạch có chặng hàng chưa xong',
  NO_COMPLETED_WORK: 'chưa có chặng nào hoàn tất',
  CARGO_STILL_CARRIED: 'hiện trường cho thấy hàng còn trên xe',
  OPEN_WAITING_SESSION: 'còn phiên chờ người nhận đang mở',
  EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE:
    'không đọc được nguồn hiện trường — hệ thống không đóng khi chưa chắc',
  EXTERNAL_BLOCKER_SOURCE_AMBIGUOUS:
    'nguồn hiện trường trả lời không rõ — hệ thống không đóng khi chưa chắc',
};

const TRIGGER_LABEL: Readonly<Record<NonNullable<RunClosureVerdict['trigger']>, string>> = {
  DEPOT_RETURN: 'xe đã về bãi',
  IDLE_TIMEOUT: 'xe đã nghỉ quá ngưỡng khách khai',
};

/** MANH CAU (chu thuong dau cau) — dung sau nhan, hoac sau "Vòng chạy …:" trong cau bao. */
const HOLDING_TEXT =
  'hết việc nhưng xe chưa về bãi — hệ thống giữ vòng chạy mở, tự đóng khi xe về bãi hoặc hết ' +
  'thời gian nghỉ khách đã khai.';

/**
 * Dong "Đóng vòng chạy (hệ thống tự quyết): <nhan> <manh cau>".
 *
 * `text` la MANH CAU noi tiep nhan, khong lap lai nhan: "Chưa đóng" + "còn chặng chưa hoàn tất",
 * khong phai "Chưa đóng" + "Chưa đóng: còn chặng…".
 */
export interface ClosureLine {
  readonly badge: string;
  readonly tone: StatusTone;
  readonly text: string;
}

const blockersText = (blockers: readonly RunClosureBlocker[]): string =>
  blockers.map((blocker) => CLOSURE_BLOCKER_LABEL[blocker]).join('; ');

/**
 * Cau "vong chay nay dong chua, va neu chua thi vi sao" — doc TRANG THAI VONG CHAY truoc, roi moi
 * doc phan xu. Mot vong chay `PLANNED`/`COMPLETED` luon mang `RUN_NOT_ACTIVE` trong phan xu, va noi
 * nguyen ma do ra cho mot vong chay da dong la noi dung nhung vo ich.
 */
export function closureLineFor(
  runStatus: VehicleRunStatus,
  verdict: RunClosureVerdict | null,
): ClosureLine {
  switch (runStatus) {
    case 'PLANNED':
      return {
        badge: 'Chưa chạy',
        tone: 'wait',
        text: 'vòng chạy chuyển sang “Đang chạy” khi chặng đầu tiên bắt đầu.',
      };
    case 'COMPLETED':
      return { badge: 'Đã đóng', tone: 'done', text: 'hệ thống đã tự đóng vòng chạy.' };
    case 'CANCELLED':
      return { badge: 'Đã huỷ', tone: 'stop', text: 'vòng chạy đã huỷ.' };
    case 'ACTIVE':
      return activeClosureLine(verdict);
  }
}

const activeClosureLine = (verdict: RunClosureVerdict | null): ClosureLine => {
  if (verdict === null) {
    return { badge: 'Đang chạy', tone: 'go', text: 'chưa đọc được điều kiện đóng.' };
  }
  if (verdict.closable && verdict.trigger !== null) {
    return {
      badge: 'Sắp đóng',
      tone: 'go',
      text: `đủ điều kiện (${TRIGGER_LABEL[verdict.trigger]}) — hệ thống tự đóng ở lần xét kế tiếp.`,
    };
  }
  if (verdict.blockers.length > 0) {
    return { badge: 'Chưa đóng', tone: 'wait', text: `${blockersText(verdict.blockers)}.` };
  }
  if (verdict.holding) return { badge: 'Đang giữ', tone: 'wait', text: HOLDING_TEXT };
  return { badge: 'Đang chạy', tone: 'go', text: 'hệ thống chưa có kết luận đóng.' };
};

/**
 * Cau bao sau MOT lan tien chang — doc tu `closure` ma CHINH lan ghi do tra ve. `closed === true`
 * nghia la chinh lan ghi nay lam he thong dong vong chay; man hinh chi thuat lai, khong dong gi.
 */
export function transitionNoticeFor(input: {
  readonly legLabel: string;
  readonly to: LegTransitionTarget;
  readonly override: boolean;
  readonly runCode: string;
  readonly closure: RunClosureOutcome;
}): string {
  if (input.to === 'IN_TRANSIT') {
    const running = input.closure.run.status === 'ACTIVE';
    return `${input.legLabel}: đã ghi đang chạy.${running ? ` Vòng chạy ${input.runCode} đang chạy.` : ''}`;
  }

  const done = `${input.legLabel}: đã hoàn tất${input.override ? ' (ghi đè)' : ''}.`;
  const { closed, verdict } = input.closure;
  if (closed) {
    const why = verdict.trigger === null ? '' : ` (${TRIGGER_LABEL[verdict.trigger]})`;
    return `${done} Hệ thống đã tự đóng vòng chạy ${input.runCode}${why}. Trạng thái đơn không tự đổi.`;
  }
  if (verdict.blockers.length > 0) {
    return `${done} Vòng chạy ${input.runCode} chưa đóng: ${blockersText(verdict.blockers)}.`;
  }
  if (verdict.holding) return `${done} Vòng chạy ${input.runCode}: ${HOLDING_TEXT}`;
  return done;
}

/* ------------------------------------------------------------------ *
 * GIAO XONG DON — `OPEN -> FULFILLED`
 * ------------------------------------------------------------------ */

export interface OrderFulfilmentView {
  readonly statusLabel: string;
  readonly tone: StatusTone;
  /** Chi `OPEN` moi xac nhan duoc — may chu van la cong that (`ORDER_ALREADY_TERMINAL`). */
  readonly canFulfil: boolean;
  readonly note: string;
  /**
   * Canh bao KHONG chan. May chu khong doi chang xong moi cho `FULFILLED` — mot don thue xe ngoai
   * khong co chang nao ma van giao xong duoc — nen man hinh khong duoc tu dat ra mot cong moi.
   */
  readonly warning: string | null;
}

const openOrderWarning = (
  legs: readonly Pick<RunLeg, 'kind' | 'status'>[] | null,
): string | null => {
  if (legs === null) return null;
  const loaded = legs.filter((leg) => leg.kind === 'LOADED' && leg.status !== 'CANCELLED');
  if (loaded.length === 0) {
    return (
      'Đơn chưa có chặng có hàng nào trên vòng chạy của đội xe — chỉ xác nhận khi hàng đã giao ' +
      'bằng đường khác.'
    );
  }
  const unfinished = loaded.filter((leg) => leg.status !== 'COMPLETED').length;
  return unfinished === 0
    ? null
    : `Còn ${unfinished} chặng có hàng chưa hoàn tất — kiểm tra lại trước khi xác nhận giao xong.`;
};

export function orderFulfilmentFor(
  order: Pick<TransportOrder, 'status'>,
  legs: readonly Pick<RunLeg, 'kind' | 'status'>[] | null,
): OrderFulfilmentView {
  const base = {
    statusLabel: ORDER_STATUS_LABEL[order.status],
    tone: orderStatusTone(order.status),
  };
  switch (order.status) {
    case 'OPEN':
      return {
        ...base,
        canFulfil: true,
        note:
          'Hệ thống không tự đánh dấu giao xong từ mốc hiện trường hay khi vòng chạy đóng. Văn ' +
          'phòng xác nhận ở đây, rồi đơn sang “Kết thúc đơn” để kế toán đối chiếu chứng từ.',
        warning: openOrderWarning(legs),
      };
    case 'FULFILLED':
      return {
        ...base,
        canFulfil: false,
        note: 'Đơn đã giao xong — việc tiếp theo là kế toán kết thúc đơn ở “Kết thúc đơn”.',
        warning: null,
      };
    case 'CANCELLED':
      return {
        ...base,
        canFulfil: false,
        note: 'Đơn đã huỷ — không xác nhận giao xong được.',
        warning: null,
      };
  }
}

export const FULFIL_CONFIRM_DETAIL =
  'Đơn chuyển từ “Đang mở” sang “Đã giao xong” và vào hàng “Kết thúc đơn”. Không hoàn tác được. ' +
  'Việc này không đóng vòng chạy và không tạo công nợ — kế toán vẫn phải kết thúc đơn ở “Kết ' +
  'thúc đơn”.';
