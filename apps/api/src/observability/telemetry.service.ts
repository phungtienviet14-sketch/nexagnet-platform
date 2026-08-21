import { Injectable } from '@nestjs/common';
import type { DecisionOutcome, DecisionPoint } from './decision-reasons.js';
import {
  combineSinks,
  NOOP_SINK,
  type AiCallRecord,
  type TelemetryRecord,
  type TelemetrySink,
} from './telemetry-record.js';
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
   * Cau hinh luc boot. Tach khoi constructor de module goi duoc sau khi da doc goi khach —
   * `tenantConfig()` chi doc duoc khi `TENANT_DIR` da san sang.
   */
  configure(input: {
    release: ReleaseIdentity;
    privacy: TelemetryPrivacyMode;
    sinks: readonly TelemetrySink[];
  }): void {
    this.release = input.release;
    this.privacy = input.privacy;
    this.sink = input.sinks.length > 0 ? combineSinks(input.sinks) : NOOP_SINK;
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
    return runInTrace(
      { release: this.release, anchors, ...(continueFrom ? { continueFrom } : {}) },
      fn,
    );
  }

  /** Bo sung neo nghiep vu khi biet them (orderId o buoc 8, intent o buoc 5…). */
  enrich(anchors: Readonly<TraceAnchors>): void {
    try {
      enrichTrace(anchors);
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
    const spanId = newSpanId();
    const parentSpanId = setCurrentSpanId(spanId);
    const previousStep = setCurrentStep(name);
    const startedAt = Date.now();
    try {
      const result = await fn();
      this.emitStep(name, spanId, parentSpanId, Date.now() - startedAt, 'ok', attributes);
      return result;
    } catch (error) {
      this.emitStep(name, spanId, parentSpanId, Date.now() - startedAt, 'error', attributes, error);
      throw error;
    } finally {
      setCurrentSpanId(parentSpanId);
      setCurrentStep(previousStep);
    }
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
      this.sink.record(build());
    } catch {
      /* fail-open — xem bat bien so mot o dau file */
    }
  }
}

function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'UnknownError', message: String(error) };
}
