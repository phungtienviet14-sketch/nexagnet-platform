import {
  context as otelContext,
  propagation,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import type { WorkerTraceBridge, WorkflowTaskTrace } from '../worker-trace-bridge.js';

/**
 * Hien thuc `WorkerTraceBridge` bang OpenTelemetry.
 *
 * Cung vai tro voi `otel-trace-bridge.ts` nhung o dau BEN KIA cua hang doi: file nay la noi DUY
 * NHAT trong duong chay cua worker biet OpenTelemetry ton tai.
 *
 * ---------------------------------------------------------------------------
 * ① VI SAO `propagation.extract` CHU KHONG PHAI TU DUNG `SpanContext`:
 *
 * Cach ngan hon la tach tay `traceparent` bang regex roi goi `trace.setSpanContext()`. Cach do
 * chay dung HOM NAY va sai vao ngay ai do them `tracestate` hoac doi len phien ban `01` cua dac
 * ta. `propagation.extract` la duong ma chinh dac ta W3C dinh nghia; dung no nghia la khi khuon
 * traceparent doi, ta doi theo mien phi.
 *
 * No cung xu ly dum truong hop SAI KHUON: mot `traceparent` hong -> `extract` tra ve context
 * KHONG co span, va span cua ta thanh GOC. Do dung la hanh vi ta muon, va ta khong phai viet
 * mot dong kiem tra nao de co no.
 *
 * ---------------------------------------------------------------------------
 * ② VI SAO CHA-CON, KHONG PHAI SPAN LINK — ke ca sau khi worker chet va chay lai:
 *
 * Cau hoi dat ra dung: sau mot lan sup, "lan chay thu hai" co con la CON cua luot nghiep vu goc
 * khong, hay chi la mot thu co LIEN QUAN toi no?
 *
 * Theo ngu nghia OTel, `link` danh cho quan he KHONG phai nhan-qua truc tiep — gom lo, fan-in,
 * mot span co NHIEU nguyen nhan thuong nguon. Con o day quan he la nhan-qua va DUY NHAT: lan
 * chay lai ton tai CHI VI luot nghiep vu goc da giao viec do, va khong vi ly do nao khac. Viec
 * span cha da KET THUC tu truoc khong lam quan he do yeu di — do la hinh dang binh thuong cua
 * moi cong viec bat dong bo, va OTel khong cam mot span co cha da dong.
 *
 * Nen: MOI lan chay (ke ca lan thu ba sau hai lan sup) deu la CON cua cung mot span nghiep vu,
 * va phan biet nhau bang `nexagnet.workflow.attempt`. Doc len se thay ba span anh em, cach nhau
 * nhung khoang trong THAT — do la su that, khong phai mot cai cay dep.
 *
 * Dung `link` o day se noi doi theo huong nguoc lai: no ham y "co lien quan, khong ro the nao",
 * trong khi ta biet chinh xac the nao.
 *
 * ---------------------------------------------------------------------------
 * ③ VI SAO KHONG CO MOT SPAN "worker" HAY "integration-handoff" BOC BA BUOC:
 *
 * Mot span nhu vay se de doc hon. No cung se la BIA DAT. Ba buoc cua mot run KHONG chay trong
 * mot lan goi: engine giao tung buoc mot qua gRPC, cach nhau tuy y ve thoi gian, va sau mot lan
 * sup thi buoc sau co the chay tren mot TIEN TRINH KHAC han. Khong co khoang thoi gian nao
 * trong bat ky tien trinh nao ma "ca ba buoc dang chay" — nen khong co gi de mot span nhu the
 * do.
 *
 * Ba span ANH EM duoi cung mot cha la hinh dang dung. Ai muon nhin chung nhu mot khoi thi loc
 * theo `nexagnet.workflow.name` — do la viec cua UI, khong phai viec cua du lieu.
 *
 * ---------------------------------------------------------------------------
 * ④ `SpanKind.PRODUCER` / `CONSUMER`: dung tu vung cua OTel cho hai dau cua mot hang doi.
 * `PRODUCER` la luc Nexagnet giao viec cho engine, `CONSUMER` la luc worker nhan duoc no. Do la
 * thu lam cho backend hieu day la mot bien bat dong bo chu khong phai mot lan goi ham — va la
 * thu bien khoang trong giua hai span thanh mot con so doc duoc: viec NAM CHO trong hang bao
 * lau, tach khoi thoi gian buoc do thuc su chay.
 */

const TRACER_NAME = 'nexagnet.workflow';

export class OtelWorkerTraceBridge implements WorkerTraceBridge {
  private readonly tracer: Tracer;

  constructor(tracer?: Tracer) {
    this.tracer = tracer ?? trace.getTracer(TRACER_NAME);
  }

  async task<T>(
    info: WorkflowTaskTrace,
    run: (outboundTraceparent: string | undefined) => Promise<T>,
  ): Promise<T> {
    let span: Span;
    try {
      const parent = info.traceparent
        ? propagation.extract(otelContext.active(), { traceparent: info.traceparent })
        : otelContext.active();

      span = this.tracer.startSpan(
        // `<khuon>.<buoc>` — doc len nghe ra VIEC, dung quy tac dat ten cua muc 10 rules.
        `${info.workflowName} ${info.taskName}`,
        {
          kind: info.kind === 'producer' ? SpanKind.PRODUCER : SpanKind.CONSUMER,
          attributes: this.attributes(info),
        },
        parent,
      );
    } catch {
      // SDK nem luc mo span -> buoc nghiep vu van phai chay, VA soi day thua ke phai di tiep
      // nhu khi khong co OTel. Bat bien so mot, khong co ngoai le.
      return run(info.traceparent);
    }

    return otelContext.with(trace.setSpan(otelContext.active(), span), async () => {
      try {
        // `undefined` = "buoc DUNG tu dat header `traceparent`". Ly do day du o
        // `worker-trace-bridge.ts`: `instrumentation-undici` da tiem san mot header roi, va hai
        // header cung ten se bi noi lai bang dau phay o dau ben kia — tuc la bat tracing len se
        // lam dut chinh soi day no sinh ra de noi.
        const result = await run(undefined);
        this.finish(span);
        return result;
      } catch (error) {
        this.finish(span, error);
        throw error;
      }
    });
  }

  /**
   * NEO tu `additionalMetadata` + danh tinh buoc. KHONG mot truong nao cua `input` di qua day.
   *
   * Ly do khong phai su than trong chung chung: `additionalMetadata` da di qua
   * `buildWorkflowMetadata()`, noi moi neo bi ep ve khuon danh tinh va bi quet PII/bi mat.
   * `input` thi khong co bao dam do o phia worker — no den tu engine, va mot khuon tuong lai co
   * the mang truong tu do. Lay tu nguon DA CO HOP DONG la cach duy nhat de bat bien "khong roi
   * payload" dung duoc cho ca cac khuon chua viet.
   */
  private attributes(info: WorkflowTaskTrace): Attributes {
    const out: Attributes = {
      'nexagnet.workflow.name': info.workflowName,
      'nexagnet.workflow.task': info.taskName,
      'nexagnet.workflow.attempt': info.attempt,
    };
    for (const [key, value] of Object.entries(info.attributes)) {
      if (typeof value === 'string' && value !== '') out[key] = value;
    }
    return out;
  }

  private finish(span: Span, error?: unknown): void {
    try {
      if (error !== undefined) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
        // `HandoffStepFailed.reason` la MA CO KIEU (`UPSTREAM_5XX`, `RATE_LIMITED`…). Deo no
        // len span duoi mot khoa rieng de loc duoc theo LY DO, thay vi phai grep van ban loi —
        // dung quy tac "ly do quyet dinh phai co kieu" cua muc 10 rules.
        const reason = (error as { reason?: unknown }).reason;
        if (typeof reason === 'string' && reason !== '') {
          span.setAttribute('nexagnet.failure.reason', reason);
        }
        if (error instanceof Error) span.recordException(error);
      }
      span.end();
    } catch {
      /* fail-open */
    }
  }
}
