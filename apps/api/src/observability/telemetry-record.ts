import type { SourceLocation } from '@netviet/shared';
import type { DecisionOutcome } from './decision-vocabulary.js';
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
  /** Git SHA cat con 12 ky tu — ban cho NGUOI doc tren mot dong chat hep. */
  readonly release?: string;
  /**
   * Git SHA DAY DU (40 ky tu) — ban cho MAY doc.
   *
   * VI SAO PHAI DI CUNG BAN GHI thay vi hoi tien trinh luc hien thi: release la thuoc tinh cua
   * LUOT DA CHAY, khong phai cua nguoi dang xem. Chung nao vong dem con chet cung tien trinh
   * thi hai thu do trung nhau va khong ai thay khac biet. Ngay trace song qua mot lan deploy,
   * hoi tien trinh se tra ve release MOI cho mot luot CU — va permalink dung do van bam duoc,
   * van mo ra mot tep, chi la tep o commit khac. Do la kieu sai nguy hiem nhat: sai tu tin.
   *
   * Cat ngan khong dung duoc o day: `/blob/<sha12>/…` la mot duong dan 404.
   */
  readonly releaseSha?: string;
  /** Neo nghiep vu da biet tai thoi diem ghi (chatId, orderId, …). */
  readonly anchors: Readonly<Record<string, string>>;
  /**
   * CHO TRONG MA NGUON DA SINH RA BAN GHI NAY — chi co o ban ghi doc lai tu KHO LICH SU.
   *
   * Ban ghi phat ra TRONG tien trinh KHONG dat truong nay, va do la dung: chung duoc hien thi
   * boi chinh ban phat hanh da sinh ra chung, nen `source-manifest.generated.ts` cua tien trinh
   * do la cau tra loi chinh xac — va re hon, vi khong ton mot truong tren moi ban ghi.
   *
   * Ban ghi doc tu kho thi nguoc lai: chung co the thuoc mot ban phat hanh CU, va bang manifest
   * cua tien trinh dang chay mo ta ma nguon KHAC — cung mot diem quyet dinh co the da doi dong,
   * doi ham, doi tep. Mot permalink dung so dong MOI tro vao commit CU van bam duoc, van mo ra
   * mot tep, chi la sai — dung loai sai TU TIN ma tang danh tinh release ton tai de ngan. Nen
   * chung mang theo vi tri DA DUOC GHI KEM luc su kien xay ra.
   */
  readonly source?: SourceLocation;
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
  /**
   * `<mien>.<viec>` — de MO co chu y: ban ghi nay la mot phong bi da serialize ma trace viewer
   * doc, va no phai nhan duoc diem quyet dinh cua BAT KY capability nao (ke ca mot capability
   * ke toan them sau). Cong CO KIEU nam o luc phat: `telemetry.decision()` chi nhan `point`
   * thuoc bo tu vung duoc truyen vao.
   */
  readonly point: string;
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
