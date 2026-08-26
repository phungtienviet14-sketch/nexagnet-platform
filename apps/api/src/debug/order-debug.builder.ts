import type {
  SourceContext,
  DebugDurations,
  DebugHandoffStatus,
  DebugTurn,
  DebugWorkflowRun,
  OrderDebugView,
} from '@netviet/shared';
import type { StoredTrace } from '../observability/recent-traces.sink.js';
import { buildTraceView } from '../observability/trace-view.builder.js';
import { describeWorkflow } from '../workflow/workflow-catalog.js';
import {
  WORKFLOW_VERSION_SEPARATOR,
  engineWorkflowName,
} from '../workflow/workflow-engine.port.js';
/*
 * `import type` — CHI la kieu, va do la co y: no bi xoa han luc bien dich, nen tep nay khong
 * keo Nest vao do thi phu thuoc va van kiem duoc bang mot ham thuan.
 *
 * Kieu do thuoc MIEN WORKFLOW chu khong thuoc man hinh nay: chinh mien do biet mot lan ban giao
 * co nhung chieu nao. Khai lai mot ban thu hai o day se tao ra hai su that ve cung mot thu.
 */
import type { WorkflowRunFacts } from '../workflow/workflow-run-lookup.service.js';

/**
 * GHEP mot man hinh "luong xu ly" tu cac manh DA CO — thuan, khong Nest, khong I/O.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA MOT HAM THUAN:
 *
 * Toan bo do kho cua man hinh nay nam o phep GHEP va o cac truong hop THIEU DU LIEU — luot goc
 * da bi day khoi vong dem, ban giao chua sang duoc engine, khuon chua co nhan tieng Viet. Nhung
 * truong hop do phai kiem duoc trong vai mili giay, khong phai bang cach dung ca mot ha tang.
 *
 * Noi goi (controller) lo phan I/O: doc vong dem, doc bang outbox, hoi engine. Tep nay khong
 * biet ba thu do ton tai.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN SO MOT: KHONG BIA.
 *
 * Moi muc hien ra deu phai co mot nguon that. Khong co bang chung thi noi la khong co — bang
 * `notes`, bang tieng Viet, o cho nguoi doc nhin thay. Mot man hinh chan doan im lang ve cho no
 * khong biet se bi doc thanh "cho do khong co van de", va nguoi debug se di tim loi o dung cho
 * khong co loi.
 */

/** Gia tri hien khi mot chieu danh tinh khong doc duoc. KHONG doan mot mac dinh nghe hop ly. */
const UNKNOWN = 'chưa xác định';

/**
 * KENH viec di vao -> nhan tieng Viet.
 *
 * Ma kenh la HOP DONG (no nam trong neo trace, trong log, trong truy van); nhan la thu con
 * nguoi doc. Ca hai deu di xuong console, canh nhau.
 *
 * ---------------------------------------------------------------------------
 * GIA TRI O DAY LAY TU CODE, KHONG LAY TU TAI LIEU. Chu thich cua `TraceAnchors.channel` liet ke
 * `zca | bot | mock | http` — do la mot danh sach DA CU. Thu that su duoc ghi vao neo la:
 *
 *   `message.source`   (`pipeline.service.ts`) -> mot trong `MESSAGE_SOURCES`
 *   `operator_console` (`orders.service.ts`)
 *   `workflow_worker`  (`sales-handoff.controller.ts`)
 *
 * Ban dau bang nay chep theo chu thich do va ket qua la mot luot that hien ra voi nhan
 * `copilot_paste` — do duoc bang mot lan chay that. `debug-channel-labels.spec.ts` giu cho no
 * khong lech lai.
 *
 * Kenh la thi tra ve chinh MA do lam nhan. Mot ban dich bia ra cho mot ma chua biet se doc len
 * nhu that trong khi khong ai viet cau do.
 */
export const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  /** Nguoi dan tay noi dung vao console (duong co-pilot, va ca `/demo/simulate`). */
  copilot_paste: 'Dán tay vào console',
  bot_webhook: 'Bot Zalo (tin có tag)',
  zca_listener: 'Tin nhắn Zalo',
  system_outbound: 'Hệ thống gửi ra',
  operator_console: 'Người thao tác trên console',
  workflow_worker: 'Worker workflow',
};

/** Trang thai BAN GIAO -> nhan tieng Viet. Ma goc van di kem trong `handoffStatus`. */
const HANDOFF_STATUS_LABELS: Readonly<Record<DebugHandoffStatus, string>> = {
  pending: 'Đang chờ bàn giao',
  claimed: 'Đang bàn giao',
  dispatched: 'Đã bàn giao cho engine',
  failed: 'Bàn giao thất bại',
  cancelled: 'Đã huỷ bàn giao',
};

/** Trang thai THO cua engine -> nhan tieng Viet. Ma goc van hien ben canh. */
const ENGINE_STATUS_LABELS: Readonly<Record<string, string>> = {
  QUEUED: 'Đang xếp hàng ở engine',
  RUNNING: 'Đang chạy',
  SUCCEEDED: 'Đã chạy xong',
  COMPLETED: 'Đã chạy xong',
  FAILED: 'Đã hỏng',
  CANCELLED: 'Đã bị huỷ',
};

export interface OrderDebugInput {
  readonly orderId: string;
  /** Cac luot con giu duoc. Rong la mot cau tra loi hop le, khong phai loi. */
  readonly traces: readonly StoredTrace[];
  readonly workflowRuns: readonly WorkflowRunFacts[];
  /** Ghi chu cua noi goi (vi du: khong hoi duoc engine). Duoc giu nguyen, khong loc. */
  readonly notes?: readonly string[];
  /**
   * Repo + git SHA cua ban dang chay — de moi luot dung duoc lien ket toi DUNG ban do.
   *
   * Vang mat la hop le (chay local, khong mount `release.json`). Luc do console khong dung
   * duoc permalink, va no phai NOI RA thay vi lui ve `main`.
   */
  readonly sourceContext?: SourceContext;
}

export function buildOrderDebugView(input: OrderDebugInput): OrderDebugView {
  const notes: string[] = [...(input.notes ?? [])];

  // Sap theo THOI GIAN THAT chu khong dua vao thu tu chen: mot luot dan xuat co the ve toi vong
  // dem truoc luot goc neu goc bi day ra roi ghi lai. Sap o day de thu tu doc luon la thu tu
  // xay ra.
  const traces = [...input.traces].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  const turns = traces.map((stored) => toTurn(stored, input.sourceContext));

  if (turns.length === 0) {
    notes.push(
      'Không còn lượt xử lý nào của đơn này trong bộ đệm. Bộ đệm chỉ giữ các lượt gần đây; ' +
        'lượt cũ hơn vẫn tra được từ log máy chủ.',
    );
  } else if (turns[0]!.derived) {
    // Luot dau tien MANG `causationTraceId` nghia la cai gay ra no khong con o day. Day chinh
    // la trieu chung cua "API khoi dong lai giua luc duyet va luc workflow goi ve".
    notes.push(
      'Lượt gốc của đơn này không còn trong bộ đệm — lượt đầu tiên bên dưới là lượt dẫn xuất. ' +
        'Nguyên nhân thường gặp: máy chủ API đã khởi động lại sau lượt gốc.',
    );
  }

  const workflows = input.workflowRuns.map(toWorkflowRun);
  for (const workflow of workflows) {
    if (workflow.known) continue;
    notes.push(
      `Khuôn workflow '${workflow.key}' chưa có tên nghiệp vụ tiếng Việt — màn hình đang hiển ` +
        'thị khoá kỹ thuật của nó.',
    );
  }
  if (workflows.length > 0) {
    // GIOI HAN CUNG cua v0, phai noi ra chu khong de nguoi doc tu suy: Nexagnet khong giu trang
    // thai tung buoc, no nam ben engine.
    notes.push(
      'Các bước bên dưới là kế hoạch của khuôn workflow, không phải trạng thái từng bước. ' +
        'Trạng thái chi tiết của từng bước nằm ở dashboard của engine.',
    );
  }

  const first = traces[0]?.records[0];
  return {
    orderId: input.orderId,
    tenant: first?.tenant ?? UNKNOWN,
    environment: first?.environment ?? UNKNOWN,
    ...(first?.release ? { release: first.release } : {}),
    turns,
    workflows,
    durations: measure(traces),
    notes,
  };
}

function toTurn(stored: StoredTrace, sourceContext: SourceContext | undefined): DebugTurn {
  const view = buildTraceView(stored, sourceContext);
  const channel = view.anchors.channel;
  return {
    view,
    channelLabel: channel ? (CHANNEL_LABELS[channel] ?? channel) : UNKNOWN,
    ...(channel ? { channel } : {}),
    // MO HINH DU LIEU quyet dinh, khong phai phong doan theo ten kenh: mot luot co
    // `causationTraceId` <=> no do mot luot khac gay ra. Cung quy tac ma `findByOrderId` dung.
    derived: Boolean(view.anchors.causationTraceId),
    startedAt: stored.startedAt,
  };
}

function toWorkflowRun(facts: WorkflowRunFacts): DebugWorkflowRun {
  const described = describeWorkflow(facts.key);
  return {
    key: described.key,
    version: facts.version,
    engineName: engineName(facts.key, facts.version),
    displayName: described.displayName,
    description: described.description,
    known: described.known,
    handoffStatus: facts.handoffStatus,
    handoffStatusLabel: HANDOFF_STATUS_LABELS[facts.handoffStatus] ?? facts.handoffStatus,
    queuedAt: facts.queuedAt.toISOString(),
    ...(facts.dispatchedAt ? { dispatchedAt: facts.dispatchedAt.toISOString() } : {}),
    attempts: facts.attempts,
    ...(facts.engineRunId ? { engineRunId: facts.engineRunId } : {}),
    operationKey: facts.operationKey,
    ...(facts.engineStatus
      ? {
          engineStatus: facts.engineStatus,
          engineStatusLabel: ENGINE_STATUS_LABELS[facts.engineStatus] ?? facts.engineStatus,
        }
      : {}),
    ...(facts.dashboardUrl ? { dashboardUrl: facts.dashboardUrl } : {}),
    ...(facts.lastError ? { lastError: facts.lastError } : {}),
    ...(facts.engineStartedAt ? { engineStartedAt: facts.engineStartedAt } : {}),
    ...(facts.engineFinishedAt ? { engineFinishedAt: facts.engineFinishedAt } : {}),
    ...engineDuration(facts.engineStartedAt, facts.engineFinishedAt),
    steps: described.steps,
  };
}

/**
 * THOI GIAN WORKFLOW — hieu hai moc CUA ENGINE, va khong co duong nao khac.
 *
 * ---------------------------------------------------------------------------
 * BON TRUONG HOP TRA VE RONG, va ca bon deu la "chua xac dinh" chu khong phai "bang khong":
 *
 *   thieu `startedAt`    engine chua chay, hoac khong hoi duoc engine
 *   thieu `finishedAt`   run CHUA KET THUC — ca hay gap nhat khi mo man hinh giua chung
 *   moc hong             du lieu xau tu engine; mot `NaN` roi xuong giao dien te hon o trong
 *   ket thuc < bat dau   du lieu xau; thoi luong AM la dau hieu hong, khong phai mot phep do
 *
 * KHONG lap cho trong bang `Date.now()` cho truong hop thu hai. Lam the thi con so lon dan moi
 * lan bam F5 va khong doi chieu duoc voi bat cu ban ghi nao — mot phep do doi theo luc nhin la
 * mot phep do gia. Man hinh noi "chua xac dinh", va do la cau tra loi that.
 */
function engineDuration(
  startedAt: string | undefined,
  finishedAt: string | undefined,
): { engineDurationMs?: number } {
  if (!startedAt || !finishedAt) return {};

  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (Number.isNaN(started) || Number.isNaN(finished)) return {};
  if (finished < started) return {};

  return { engineDurationMs: finished - started };
}

/**
 * Ten da dang ky voi engine. `engineWorkflowName` NEM voi khoa/phien ban sai khuon — dung o moi
 * duong GHI, sai o duong DOC nay: mot hang outbox cu mang mot phien ban khong con hop le van
 * phai NHIN THAY DUOC. Lam sap man hinh chan doan vi mot du lieu xau la dao nguoc uu tien.
 */
function engineName(key: string, version: string): string {
  try {
    return engineWorkflowName(key, version);
  } catch {
    return `${key}${WORKFLOW_VERSION_SEPARATOR}${version}`;
  }
}

/**
 * DO TU CAC LUOT, va CHI tu cac luot — xem chu thich cua `DebugDurations`.
 *
 * `synchronousMs` lay tu luot GOC (luot dau tien), khong phai luot dai nhat: cau hoi la "may mat
 * bao lau de xu ly viec nay", va luot goc la luot lam viec do.
 *
 * KHONG co thoi gian workflow o day. Ham nay chi nhin thay cac luot, ma mot lan cho ben vung
 * khong de lai luot nao — nen no khong co cach gi biet ve khoang cho do. Thoi gian workflow
 * duoc tinh o `engineDuration()`, tu moc cua chinh engine.
 */
function measure(traces: readonly StoredTrace[]): DebugDurations {
  const first = traces[0];
  const last = traces[traces.length - 1];
  const synchronousMs = first ? synchronousDurationOf(first) : undefined;

  // MOT luot thi khong co khoang nao de do. Tra 0 se bi doc thanh "xong ngay lap tuc", trong khi
  // su that la "chua co gi de so sanh" — hai chuyen khac han nhau.
  const turnIntervalMs =
    first && last && first !== last
      ? Date.parse(last.startedAt) - Date.parse(first.startedAt)
      : undefined;

  return {
    ...(synchronousMs !== undefined ? { synchronousMs } : {}),
    ...(turnIntervalMs !== undefined && Number.isFinite(turnIntervalMs) ? { turnIntervalMs } : {}),
    turnCount: traces.length,
  };
}

/**
 * Do dai buoc NGOAI CUNG cua mot luot.
 *
 * CO Y KHONG dung `TraceView.totalMs`: mo hinh do bo han truong khi gia tri bang 0
 * (`totalMs > 0 ? …`), tuc no gop "luot khong co buoc nao do duoc" voi "luot chay xong duoi mot
 * mili giay". O man hinh nay hai chuyen do phai phan biet: cai thu nhat la THIEU DU LIEU va phai
 * hien ra la thieu, cai thu hai la mot phep do THAT va la mot cau tra loi tot.
 *
 * `undefined` o day co dung mot nghia: luot khong co buoc nghiep vu nao de do.
 */
function synchronousDurationOf(stored: StoredTrace): number | undefined {
  let longest: number | undefined;
  for (const record of stored.records) {
    if (record.type !== 'step') continue;
    longest = longest === undefined ? record.durationMs : Math.max(longest, record.durationMs);
  }
  return longest;
}
