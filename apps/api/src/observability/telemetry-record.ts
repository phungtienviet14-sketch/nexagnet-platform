import type { DecisionOutcome, DecisionPoint } from './decision-reasons.js';
import type { SanitizedValue } from './telemetry-redaction.js';

/**
 * BAN GHI TELEMETRY — mot union phan biet, la NGON NGU chung giua noi phat va noi nhan.
 *
 * VI SAO CO LOP NAY thay vi goi thang mot thu vien:
 * No la diem HOAN DOI. Hom nay ban ghi di ra JSON log; ngay mai co the them mot sink ghi xuong
 * Postgres cua chinh tenant, hoac mot sink day OTLP sang SigNoz. Ca ba dung chung mot ban ghi,
 * nen code NGHIEP VU khong biet — va khong duoc phep biet — backend nao dang chay.
 *
 * Do la ly do file nay khong import bat ky SDK observability nao.
 */

/** Truong chung: moi ban ghi deu neo duoc vao mot luot va mot ban trien khai. */
interface TelemetryBase {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly at: string;
  readonly tenant: string;
  readonly environment: string;
  readonly release?: string;
  /** Neo nghiep vu da biet tai thoi diem ghi (chatId, orderId, …). */
  readonly anchors: Readonly<Record<string, string>>;
}

/**
 * Mot BUOC NGHIEP VU da chay xong.
 *
 * KHONG phai mot ham bat ky. Muc 10 cam bien `normalizeString`/`mapFoo` thanh span. Ten buoc
 * phai la thu doc len nghe ra viec: `conversation.resolve`, `order.persist`, `outbound.decide`.
 */
export interface StepRecord extends TelemetryBase {
  readonly type: 'step';
  readonly name: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'error';
  readonly error?: { readonly name: string; readonly message: string };
  readonly attributes?: Readonly<Record<string, SanitizedValue>>;
}

/**
 * Mot QUYET DINH NGHIEP VU kem LY DO CO KIEU.
 *
 * Day la thu ma khong framework nao cho khong: "khong gui" thi ai cung do duoc, nhung
 * "khong gui vi QUANTITY_ABOVE_THRESHOLD" thi chi he thong nay biet.
 */
export interface DecisionRecord extends TelemetryBase {
  readonly type: 'decision';
  readonly point: DecisionPoint;
  readonly outcome: DecisionOutcome;
  readonly reason: string;
  /** So lieu lam ro quyet dinh (nguong, tong so luong…). KHONG dung de ke chuyen. */
  readonly detail?: Readonly<Record<string, SanitizedValue>>;
}

/** Mot CHUYEN TRANG THAI cua thuc the co may trang thai that (Order, ConversationThread…). */
export interface StateChangeRecord extends TelemetryBase {
  readonly type: 'state_change';
  readonly entity: string;
  readonly entityId: string;
  /** `null` = vua duoc tao ra. */
  readonly from: string | null;
  readonly to: string;
  readonly reason?: string;
}

/**
 * Mot THAY DOI DU LIEU dang delta ngu nghia: `quantity: 20 -> 5`.
 *
 * CO Y khong chup toan bo thuc the truoc/sau (muc 18). Anh chup day du vua nang, vua keo theo
 * PII khong can thiet, ma nguoi debug thuc ra chi hoi "con so nao da doi".
 */
export interface DataChangeRecord extends TelemetryBase {
  readonly type: 'data_change';
  readonly entity: string;
  readonly entityId?: string;
  readonly field: string;
  readonly from: SanitizedValue;
  readonly to: SanitizedValue;
}

/**
 * Mot lan goi LLM. Ten thuoc tinh bam theo OpenTelemetry GenAI semantic conventions
 * (`gen_ai.*`) de sau nay day sang SigNoz/Langfuse thi khong phai doi ten lai.
 */
export interface AiCallRecord extends TelemetryBase {
  readonly type: 'ai_call';
  /** `anthropic` | `deepseek` | `flowise`. */
  readonly provider: string;
  readonly model: string;
  /** `parse` (Router) hoac `compose` (Tu van) — hai lan goi LLM co that trong mot luot. */
  readonly operation: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'error';
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  /** So vong lap cong cu da chay (agent tu van). */
  readonly toolRounds?: number;
  /** Ten cac cong cu da duoc goi, theo thu tu. Chi TEN — tham so di duong `attributes`. */
  readonly toolNames?: readonly string[];
  readonly error?: { readonly name: string; readonly message: string };
  /** Noi dung (prompt/completion) — CHI co o muc rieng tu cho phep. */
  readonly attributes?: Readonly<Record<string, SanitizedValue>>;
}

export type TelemetryRecord =
  | StepRecord
  | DecisionRecord
  | StateChangeRecord
  | DataChangeRecord
  | AiCallRecord;

/**
 * Noi nhan ban ghi.
 *
 * HOP DONG CUNG: `record()` KHONG DUOC NEM va KHONG DUOC tra Promise ma ben goi phai cho.
 * Mot sink cham hoac hong khong duoc phep lam rot mot don hang (muc 20). Sink nao can I/O thi
 * tu xep hang ben trong no, va tu nuot loi cua chinh minh.
 */
export interface TelemetrySink {
  record(record: TelemetryRecord): void;
}

/** Sink rong — dung cho test va cho ngu canh chua cau hinh gi. */
export const NOOP_SINK: TelemetrySink = { record: () => undefined };

/**
 * Gop nhieu sink lam mot. Mot sink hong KHONG duoc chan cac sink con lai — do la ly do vong lap
 * nay bat loi tung cai mot thay vi bao quanh ca vong.
 */
export function combineSinks(sinks: readonly TelemetrySink[]): TelemetrySink {
  return {
    record(record: TelemetryRecord): void {
      for (const sink of sinks) {
        try {
          sink.record(record);
        } catch {
          // Nuot co chu y: telemetry hong thi im lang, nghiep vu chay tiep.
        }
      }
    },
  };
}
