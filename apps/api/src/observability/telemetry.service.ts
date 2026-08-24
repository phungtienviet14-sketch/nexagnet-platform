import { Injectable } from '@nestjs/common';
import type { DecisionOutcome, DecisionPoint } from './decision-reasons.js';
import {
  combineSinks,
  NOOP_SINK,
  type AiCallRecord,
  type TelemetryRecord,
  type TelemetrySink,
} from './telemetry-record.js';
import { NOOP_TRACE_BRIDGE, type TraceBridge } from './trace-bridge.js';
import {
  sanitizeAttributes,
  sanitizeTelemetry,
  type TelemetryPrivacyMode,
} from './telemetry-redaction.js';
import {
  currentTrace,
  enrichTrace,
  newSpanId,
  runInTrace,
  setCurrentSpanId,
  setCurrentStep,
  traceSnapshot,
  type ReleaseIdentity,
  type TraceAnchors,
} from './trace-context.js';

/**
 * API DUY NHAT ma code nghiep vu goi de tu ke chuyen ve minh.
 *
 * BAT BIEN SO MOT — FAIL-OPEN (muc 20): khong ham nao trong file nay duoc phep nem ra ngoai.
 * Telemetry hong thi don hang van phai chay. Do la ly do moi cho ghi deu boc `try/catch` va
 * nuot loi. Nghe nhu che giau loi, nhung day la dung cho de che giau: mot loi trong lop QUAN SAT
 * khong duoc phep tro thanh mot loi trong lop DUOC QUAN SAT.
 *
 * BAT BIEN SO HAI — KHONG TRACE MOI HAM (muc 10): `step()` danh cho RANH GIOI NGHIEP VU. Mot
 * luot chay 50 ham van chi nen thay ra 5-15 buoc. Neu dinh boc `step()` quanh mot ham co ten bat
 * dau bang `map`/`format`/`normalize`/`validate`, dung lai — do khong phai mot buoc nghiep vu.
 */
@Injectable()
export class TelemetryService {
  private sink: TelemetrySink = NOOP_SINK;
  private release: ReleaseIdentity = {
    tenant: 'unknown',
    environment: 'development',
    gitSha: 'unknown',
  };
  private privacy: TelemetryPrivacyMode = 'redacted';
  /**
   * Runtime tracing ben ngoai. MAC DINH LA KHONG CO — moi hanh vi trong file nay giong het
   * truoc khi cau noi ton tai, tru khi ai do chu dong lap mot cai vao. Xem `trace-bridge.ts`.
   */
  private bridge: TraceBridge = NOOP_TRACE_BRIDGE;

  /**
   * Cau hinh luc boot. Tach khoi constructor de module goi duoc sau khi da doc goi khach —
   * `tenantConfig()` chi doc duoc khi `TENANT_DIR` da san sang.
   */
  configure(input: {
    release: ReleaseIdentity;
    privacy: TelemetryPrivacyMode;
    sinks: readonly TelemetrySink[];
    bridge?: TraceBridge;
  }): void {
    this.release = input.release;
    this.privacy = input.privacy;
    this.sink = input.sinks.length > 0 ? combineSinks(input.sinks) : NOOP_SINK;
    this.bridge = input.bridge ?? NOOP_TRACE_BRIDGE;
  }

  /** Muc rieng tu dang ap dung — de sink/test doc duoc ma khong phai doan. */
  privacyMode(): TelemetryPrivacyMode {
    return this.privacy;
  }

  releaseIdentity(): ReleaseIdentity {
    return this.release;
  }

  /**
   * Mo mot LUOT (mot tin Zalo, mot request HTTP) va chay `fn` ben trong.
   *
   * Day la NOI DUY NHAT sinh ra `traceId`. Dat no o cong vao — `PipelineService.intake()` — chu
   * khong o giua duong, vi cac ca can debug nhat (`ignored`, `duplicate`, `stored_only`) khong
   * bao gio di het duong de co `orderId`.
   */
  runTurn<T>(anchors: TraceAnchors, fn: () => T, continueFrom?: string): T {
    // Cau noi mo span goc TRUOC, roi tra ve `traceparent` cua chinh span do. Truyen no vao
    // `continueFrom` la cach de `traceId` nghiep vu VA `traceId` cua runtime tracing la MOT —
    // dung lai duong noi tiep trace da co, khong them mot loi ghi nao vao `trace-context.ts`.
    // Khong co cau noi -> `bridged` la `undefined` -> nhanh nay giong het truoc day.
    return this.bridge.turn(continueFrom, (bridged) => {
      const parent = bridged ?? continueFrom;
      // Neo BAN DAU len span goc. `enrich()` bo sung dan ve sau; ca hai di chung mot duong.
      this.bridge.anchor(prefixAnchors(anchors));
      return runInTrace(
        { release: this.release, anchors, ...(parent ? { continueFrom: parent } : {}) },
        fn,
      );
    });
  }

  /** Bo sung neo nghiep vu khi biet them (orderId o buoc 8, intent o buoc 5…). */
  enrich(anchors: Readonly<TraceAnchors>): void {
    try {
      enrichTrace(anchors);
      this.bridge.anchor(prefixAnchors(anchors));
    } catch {
      /* fail-open */
    }
  }

  /** `traceId` cua luot dang chay — de gan vao OrderView, tra ve header, in ra console. */
  traceId(): string | undefined {
    return currentTrace()?.traceId;
  }

  /**
   * Chay mot BUOC NGHIEP VU va ghi lai ket qua.
   *
   * Do thoi gian bang `Date.now()` chu khong phai `performance.now()`: cac buoc o day tinh bang
   * tram mili-giay (goi LLM, truy van DB), do phan giai mili-giay la du, va `Date.now()` khong
   * lech giua cac lan restart.
   *
   * Loi cua `fn` duoc GHI LAI roi NEM TIEP nguyen ven. Telemetry quan sat, khong can thiep.
   */
  async step<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    // Cau noi mo span cua runtime tracing va cho lai `spanId` cua no. Ban ghi nghiep vu deo dung
    // id do, nen span TU DONG sinh ra ben trong `fn` (truy van Prisma, lan goi `fetch`) tu treo
    // vao dung buoc nay — thay vi thanh mot dam span mo coi canh cay nghiep vu.
    return this.bridge.step(name, async (bridgedSpanId) => {
      const spanId = bridgedSpanId ?? newSpanId();
      const parentSpanId = setCurrentSpanId(spanId);
      const previousStep = setCurrentStep(name);
      const startedAt = Date.now();
      try {
        const result = await fn();
        this.emitStep(name, spanId, parentSpanId, Date.now() - startedAt, 'ok', attributes);
        return result;
      } catch (error) {
        this.emitStep(
          name,
          spanId,
          parentSpanId,
          Date.now() - startedAt,
          'error',
          attributes,
          error,
        );
        throw error;
      } finally {
        setCurrentSpanId(parentSpanId);
        setCurrentStep(previousStep);
      }
    });
  }

  /**
   * Ghi mot QUYET DINH NGHIEP VU.
   *
   * `reason` BAT BUOC — do la ca ly do file nay ton tai. Mot quyet dinh khong co ly do thi chi
   * lap lai dieu ma `status` da noi, va nguoi debug van phai mo source ra doc.
   */
  decision(input: {
    point: DecisionPoint;
    outcome: DecisionOutcome;
    reason: string;
    detail?: Readonly<Record<string, unknown>>;
  }): void {
    this.emit(() => ({
      type: 'decision',
      point: input.point,
      outcome: input.outcome,
      reason: input.reason,
      ...(input.detail ? { detail: sanitizeAttributes(input.detail, this.privacy) } : {}),
      ...this.envelope(),
    }));
  }

  /** Ghi mot CHUYEN TRANG THAI. `from = null` nghia la thuc the vua duoc tao. */
  stateChange(input: {
    entity: string;
    entityId: string;
    from: string | null;
    to: string;
    reason?: string;
  }): void {
    // Chuyen sang chinh no khong phai mot su kien — ghi lai chi lam nhieu trace.
    if (input.from === input.to) return;
    this.emit(() => ({
      type: 'state_change',
      entity: input.entity,
      entityId: input.entityId,
      from: input.from,
      to: input.to,
      ...(input.reason ? { reason: input.reason } : {}),
      ...this.envelope(),
    }));
  }

  /**
   * Ghi mot THAY DOI DU LIEU dang delta: `quantity: 20 -> 5`.
   * Chi dung cho truong CO GIA TRI DEBUG CAO (muc 18) — khong phai moi field cua moi entity.
   */
  dataChange(input: {
    entity: string;
    field: string;
    from: unknown;
    to: unknown;
    entityId?: string;
  }): void {
    this.emit(() => ({
      type: 'data_change',
      entity: input.entity,
      field: input.field,
      from: sanitizeTelemetry(input.from, this.privacy),
      to: sanitizeTelemetry(input.to, this.privacy),
      ...(input.entityId ? { entityId: input.entityId } : {}),
      ...this.envelope(),
    }));
  }

  /**
   * Ghi mot lan goi LLM DA XONG.
   *
   * Nhan ban ghi da hoan tat thay vi boc quanh lan goi: hai duong goi LLM that
   * (`parser.parse()` va `advisor.reply()`) co hinh dang rat khac nhau — mot cai mot phat, mot
   * cai co vong lap cong cu — nen mot ham boc chung se phai doan. Noi goi tu biet minh vua lam gi.
   */
  aiCall(input: {
    provider: string;
    model: string;
    operation: string;
    durationMs: number;
    status: 'ok' | 'error';
    inputTokens?: number;
    outputTokens?: number;
    toolRounds?: number;
    toolNames?: readonly string[];
    error?: unknown;
    attributes?: Readonly<Record<string, unknown>>;
  }): void {
    this.emit(() => {
      const record: AiCallRecord = {
        type: 'ai_call',
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        durationMs: input.durationMs,
        status: input.status,
        ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
        ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
        ...(input.toolRounds !== undefined ? { toolRounds: input.toolRounds } : {}),
        ...(input.toolNames?.length ? { toolNames: [...input.toolNames] } : {}),
        ...(input.error ? { error: describeError(input.error) } : {}),
        ...(input.attributes
          ? { attributes: sanitizeAttributes(input.attributes, this.privacy) }
          : {}),
        ...this.envelope(),
      };
      return record;
    });
  }

  private emitStep(
    name: string,
    spanId: string,
    parentSpanId: string | undefined,
    durationMs: number,
    status: 'ok' | 'error',
    attributes?: Readonly<Record<string, unknown>>,
    error?: unknown,
  ): void {
    this.emit(() => ({
      type: 'step',
      name,
      durationMs,
      status,
      ...(error ? { error: describeError(error) } : {}),
      ...(attributes ? { attributes: sanitizeAttributes(attributes, this.privacy) } : {}),
      ...this.envelope({ spanId, ...(parentSpanId ? { parentSpanId } : {}) }),
    }));
  }

  /**
   * Phan chung cua moi ban ghi: danh tinh luot + neo nghiep vu tai thoi diem ghi.
   *
   * `span` co mat = ben goi BIET CHAC quan he cha-con cua minh (truong hop cua `step()`), va
   * "khong co cha" la mot cau tra loi HOP LE chu khong phai mot cho trong de doan tiep.
   * `span` vang mat = ban ghi diem (decision/ai_call/…), treo vao buoc dang chay.
   *
   * TACH BACH NAY LA MOT BAN SUA, khong phai trang tri. Truoc do envelope dung
   * `parentSpanId ?? scope.currentSpanId`, nen buoc NGOAI CUNG — von co `parentSpanId` la
   * `undefined` mot cach dung dan — roi vao nhanh `??` va nhan chinh `currentSpanId`, ma luc do
   * `currentSpanId` DA duoc `step()` dat thanh spanId cua chinh no. Ket qua: span goc tu lam cha
   * cua chinh no, va moi bo dung cay (ke ca `tools/trace-view.mjs`) deu trai cay ra thanh phang.
   */
  private envelope(span?: { spanId: string; parentSpanId?: string }): {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    at: string;
    tenant: string;
    environment: string;
    release?: string;
    anchors: Record<string, string>;
  } {
    const scope = currentTrace();
    const snapshot = traceSnapshot();
    // `traceId`/`tenant`/`environment`/`release` da nam trong envelope; giu lai trong `anchors`
    // chi la lap lai. Boc rieng ra roi bo di.
    const {
      traceId: _traceId,
      tenant: _tenant,
      environment: _environment,
      release: _release,
      ...anchors
    } = snapshot;
    // Ben goi biet cha cua minh -> ton trong tuyet doi, ke ca khi cau tra loi la "khong co cha".
    // Khong biet -> treo vao buoc dang chay.
    const parent = span ? span.parentSpanId : scope?.currentSpanId;
    return {
      traceId: scope?.traceId ?? 'no-trace',
      spanId: span?.spanId ?? newSpanId(),
      ...(parent ? { parentSpanId: parent } : {}),
      at: new Date().toISOString(),
      tenant: this.release.tenant,
      environment: this.release.environment,
      ...(this.release.gitSha !== 'unknown' ? { release: this.release.gitSha.slice(0, 12) } : {}),
      anchors,
    };
  }

  /**
   * Cong ra DUY NHAT. Ca viec DUNG ban ghi lan viec GUI no deu nam trong `try` — vi mot loi khi
   * sanitize (vd getter nem loi tren doi tuong nghiep vu) cung nguy hiem ngang mot sink hong.
   */
  private emit(build: () => TelemetryRecord): void {
    try {
      const record = build();
      this.sink.record(record);
      this.forward(record);
    } catch {
      /* fail-open — xem bat bien so mot o dau file */
    }
  }

  /**
   * Chuyen mot ban ghi DIEM sang runtime tracing.
   *
   * MOT NOI DUY NHAT: dat o day thay vi rai vao tung phuong thuc cong khai, vi `emit()` la cong
   * ra duy nhat — them mot loai ban ghi moi sau nay se tu di qua day, khong ai phai nho.
   *
   * `step` KHONG di qua duong nay: no da la mot span that do `this.bridge.step()` mo. Gui lai
   * mot lan nua se dem doi moi buoc.
   */
  private forward(record: TelemetryRecord): void {
    switch (record.type) {
      case 'step':
        return;
      case 'ai_call':
        this.bridge.aiCall({
          // Ten theo OpenTelemetry GenAI semconv: `<operation> <model>` doc len tren UI la ra
          // ngay "vua goi cai gi", khong phai mot ten ham.
          name: `${record.operation} ${record.model}`,
          durationMs: record.durationMs,
          status: record.status,
          ...(record.error ? { error: record.error } : {}),
          attributes: {
            'gen_ai.system': record.provider,
            'gen_ai.request.model': record.model,
            'gen_ai.operation.name': record.operation,
            ...(record.inputTokens !== undefined
              ? { 'gen_ai.usage.input_tokens': record.inputTokens }
              : {}),
            ...(record.outputTokens !== undefined
              ? { 'gen_ai.usage.output_tokens': record.outputTokens }
              : {}),
            ...(record.toolRounds !== undefined
              ? { 'nexagnet.tool_rounds': record.toolRounds }
              : {}),
            ...(record.toolNames?.length ? { 'nexagnet.tool_names': [...record.toolNames] } : {}),
            ...(record.attributes ?? {}),
          },
        });
        return;
      case 'decision':
        this.bridge.event('decision', {
          'nexagnet.decision.point': record.point,
          'nexagnet.decision.outcome': record.outcome,
          'nexagnet.decision.reason': record.reason,
          ...(record.detail ?? {}),
        });
        return;
      case 'state_change':
        this.bridge.event('state_change', {
          'nexagnet.entity': record.entity,
          'nexagnet.entityId': record.entityId,
          'nexagnet.from': record.from ?? '(moi tao)',
          'nexagnet.to': record.to,
          ...(record.reason ? { 'nexagnet.reason': record.reason } : {}),
        });
        return;
      case 'data_change':
        this.bridge.event('data_change', {
          'nexagnet.entity': record.entity,
          'nexagnet.field': record.field,
          'nexagnet.from': record.from,
          'nexagnet.to': record.to,
          ...(record.entityId ? { 'nexagnet.entityId': record.entityId } : {}),
        });
        return;
    }
  }
}

/**
 * Neo nghiep vu -> thuoc tinh span, co tien to `nexagnet.`.
 *
 * Tien to khong phai trang tri: no la thu ngan `chatId` cua ta khoi va vao mot khoa cua chuan
 * OTel (hoac cua mot instrumentation khac) mang cung ten nhung khac nghia — va la thu cho phep
 * loc "moi thuoc tinh cua Nexagnet" bang mot tien to duy nhat tren UI cua backend.
 */
function prefixAnchors(anchors: Readonly<TraceAnchors>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(anchors)) {
    if (value === undefined || value === null || value === '') continue;
    out[`nexagnet.${key}`] = value;
  }
  return out;
}

function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'UnknownError', message: String(error) };
}
