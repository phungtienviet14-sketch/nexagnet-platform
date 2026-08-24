/**
 * CAU NOI TRACE cho VIEC DI QUA MOT HANG DOI — doi xung voi `trace-bridge.ts`, nhung bac ngang
 * qua bien bat dong bo.
 *
 * DUNG O CA HAI DAU: `WorkflowDispatcher` (dau GIAO, `kind: 'producer'`) va
 * `HatchetWorkflowWorker` (dau NHAN, `kind: 'consumer'`). Mot giao dien cho ca hai vi ca hai
 * lam DUNG mot viec ve mat trace: khoi phuc mot ngu canh tu `traceparent` roi chay mot viec ben
 * trong no. Tach lam hai se sinh ra hai ban sao cua cung mot doan xu ly loi fail-open.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CAN MOT CAU NOI RIENG chu khong dung lai `TraceBridge`:
 *
 * `TraceBridge.turn()` mo span GOC cua mot LUOT — mot luot la mot tin nhan di vao tien trinh API,
 * va no tu sinh ra `traceparent` cho nhung viec no de lai phia sau. Worker thi nguoc han: no
 * KHONG BAO GIO la goc. Moi lan no chay, no dang lam tiep mot viec ma mot tien trinh KHAC da bat
 * dau, co the tu vai phut truoc, co the tu mot container da chet. Cai no can khong phai "mo mot
 * luot" ma la "NOI LAI vao mot luot da co".
 *
 * Gop hai thu do vao mot giao dien se lam mo dung cho quan trong nhat: ai la goc.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DI QUA NEST DI:
 *
 * `WorkflowWorkerModule` co mot cau o dau file — "danh sach phu thuoc o day la mot HOP DONG" —
 * vi moi provider them vao do chay trong CA HAI tien trinh. `ObservabilityModule` keo theo
 * `TraceController` (mot controller HTTP) va `RecentTracesSink` (vong dem cho console cua Sale);
 * ca hai deu vo nghia trong mot tien trinh khong phuc vu HTTP. Nen cau noi nay duoc phan giai
 * bang MOT HAM, khong bang mot provider.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN (giong het `trace-bridge.ts`): khong phuong thuc nao o day duoc phep lam hong `run`.
 * `traceparent` thieu, sai khuon, hay mot SDK nem giua chung — tat ca deu phai ket thuc bang
 * "buoc nghiep vu van chay". Quan sat hong khong duoc lam hong viec.
 */

/** Nhung gi mot BUOC WORKFLOW biet ve chinh no, du de dat ten mot span va neo no dung cho. */
export interface WorkflowTaskTrace {
  /** Ten khuon MANG PHIEN BAN, vi du `integration-handoff.v1`. */
  readonly workflowName: string;
  /** Ten buoc: `trigger` | `resolve` | `preflight` | `dispatch` | `settle`. */
  readonly taskName: string;
  /**
   * DAU NAO cua hang doi.
   *
   *   `producer` — Nexagnet GIAO viec cho engine (`WorkflowDispatcher`);
   *   `consumer` — worker NHAN viec tu engine (mac dinh).
   *
   * Khong phai trang tri: do la thu lam cho backend hieu day la mot bien BAT DONG BO chu khong
   * phai mot lan goi ham long nhau — va do la thu bien khoang trong giua hai span thanh mot con
   * so doc duoc ("viec nam cho trong hang bao lau") thay vi mot khoang trong kho hieu.
   */
  readonly kind?: 'producer' | 'consumer';
  /**
   * `traceparent` W3C doc tu `additionalMetadata` cua run.
   *
   * `undefined` hoac sai khuon deu HOP LE — mot run co the duoc kich hoat tay tu dashboard, va
   * luc do khong co ai o dau kia soi day. Khi do span van duoc mo, chi la no thanh goc.
   */
  readonly traceparent: string | undefined;
  /**
   * Lan chay thu MAY cua buoc nay (0 = lan dau). Hatchet cong bo at-least-once, nen con so nay
   * la thu duy nhat phan biet "cham" voi "da chay lai ba lan".
   */
  readonly attempt: number;
  /**
   * NEO TUONG QUAN — chi danh tinh, KHONG BAO GIO payload.
   *
   * Nguon duy nhat duoc phep la `additionalMetadata` cua run, vi tui do da di qua
   * `buildWorkflowMetadata()`: no tu choi PII, tu choi bi mat, va ep moi neo ve khuon danh tinh.
   * Dua `input` cua workflow vao day se vut bo dung lop bao ve do.
   */
  readonly attributes: Readonly<Record<string, string>>;
}

export interface WorkerTraceBridge {
  /**
   * Chay MOT buoc workflow ben trong ngu canh trace da khoi phuc tu `traceparent`.
   *
   * Hop dong: `run` PHAI duoc goi dung mot lan, va gia tri/loi cua no phai di ra nguyen ven.
   *
   * -------------------------------------------------------------------------
   * THAM SO CUA `run` — `outboundTraceparent`: gia tri ma BUOC phai tu dat len header
   * `traceparent` cua lan goi ra ngoai, hoac `undefined` nghia la "DUNG tu dat".
   *
   * Doi xung voi `TraceBridge.turn()` (cung tra `traceparent` ve cho ben goi), va no ton tai vi
   * mot ly do RAT CU THE, do duoc chu khong suy ra:
   *
   *   `instrumentation-undici` TU TIEM `traceparent` vao moi lan `fetch` khi OTel dang chay
   *   (`propagation.inject` -> `request.addHeader`). Neu buoc CUNG tu dat mot header cung ten
   *   thi yeu cau di ra mang HAI header `traceparent`, va Node o dau kia noi chung lai bang dau
   *   phay -> `req.headers.traceparent` thanh mot chuoi khong con dung khuon W3C. Tuc la bat
   *   tracing len se LAM DUT chinh soi day ma no sinh ra de noi.
   *
   * Nen:
   *   NOOP  -> tra lai `info.traceparent` (soi day thua ke). Hanh vi hom nay, nguyen ven.
   *   OTel  -> tra `undefined`. Runtime tiem mot header DUY NHAT, va no tro dung vao span cua
   *            buoc nay chu khong vao span cua tien trinh API tu vai phut truoc — tuc la CHINH
   *            XAC HON, khong chi "khong trung".
   */
  task<T>(
    info: WorkflowTaskTrace,
    run: (outboundTraceparent: string | undefined) => Promise<T>,
  ): Promise<T>;
}

/** Hanh vi HIEN TAI cua worker: khong span nao, `run` chay y nguyen, soi day thua ke di tiep. */
export const NOOP_WORKER_TRACE_BRIDGE: WorkerTraceBridge = {
  task: (info, run) => run(info.traceparent),
};

/**
 * Chon hien thuc cho tien trinh nay.
 *
 * ---------------------------------------------------------------------------
 * HAI CONG, PHAI QUA CA HAI:
 *
 *   1. `OTEL_TRACING === 'on'`  — Y DINH. Kiem truoc de tien trinh tat tracing KHONG phai nap
 *      SDK OTel (`otel-runtime.js` keo theo ca `sdk-trace-node` + ba instrumentation, ~800ms va
 *      vai chuc MiB). Do la ly do import o day la DONG, khong phai mot `import` dau file.
 *
 *   2. `isOtelRunning()`        — SU THAT. `OTEL_TRACING=on` ma quen `--import` preload thi
 *      khong instrumentation nao duoc dang ky va provider toan cuc la mot bo rong. Mo span vao
 *      do se bao cao "co quan sat" trong khi khong co gi ca. Cung ly le voi
 *      `observability.module.ts`: doc TRANG THAI THAT thay vi doc y dinh.
 *
 * Nem o bat ky dau -> NOOP. Mot worker khong quan sat duoc van la mot worker chay duoc.
 */
export async function resolveWorkerTraceBridge(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkerTraceBridge> {
  if (env.OTEL_TRACING !== 'on') return NOOP_WORKER_TRACE_BRIDGE;
  try {
    const [{ isOtelRunning }, { OtelWorkerTraceBridge }] = await Promise.all([
      import('./otel/otel-runtime.js'),
      import('./otel/otel-worker-trace-bridge.js'),
    ]);
    return isOtelRunning() ? new OtelWorkerTraceBridge() : NOOP_WORKER_TRACE_BRIDGE;
  } catch {
    return NOOP_WORKER_TRACE_BRIDGE;
  }
}
