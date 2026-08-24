import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * BO THU OTLP — mot may chu HTTP THAT nhan `POST /v1/traces` tu chinh exporter cua ung dung.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG `InMemorySpanExporter`:
 *
 * `InMemorySpanExporter` doc span TRUOC khi chung roi tien trinh. No chung minh duoc rang mot
 * cau noi mo span dung, va khong chung minh duoc gi ve nhung thu chi xay ra tren duong RA: mot
 * processor quen dang ky, mot exporter thu hai ai do them vao, mot thuoc tinh do instrumentation
 * dat SAU khi bo loc rieng tu chay, hay — quan trong nhat o day — hai TIEN TRINH khac nhau co
 * that su gap nhau tren cung mot `traceId` hay khong.
 *
 * Ba dieu duoi day chi do duoc o day, khong do duoc o trong tien trinh:
 *
 *   ① tuong quan XUYEN TIEN TRINH — span cua `api` va span cua `worker` la hai tien trinh khac
 *      nhau, khong dung chung bo nho nao;
 *   ② rieng tu TREN DAY — `rawBodies()` giu tung byte da gui de bai kiem quet bi mat/PII tren
 *      DU LIEU DA ROI KHOI TIEN TRINH, chu khong tren y dinh cua bo loc;
 *   ③ exporter co that su gui khong — mot cau hinh endpoint sai se hien ra thanh "khong nhan
 *      duoc gi", chu khong lang le xanh.
 *
 * KHONG import `vitest` (cung ly do voi `workflow-it.harness.ts`): file nay phai dung duoc tu
 * mot tien trinh con thuong.
 */

/** Mot span DA DUOC GUI, da lam phang de doc — gom ca neo cua resource sinh ra no. */
export interface CollectedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | undefined;
  readonly name: string;
  /** So cua OTLP: 1 INTERNAL · 2 SERVER · 3 CLIENT · 4 PRODUCER · 5 CONSUMER. */
  readonly kind: number;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  /** `service.name`, `nexagnet.tenant`… — de phan biet span cua `api` voi span cua `worker`. */
  readonly resource: Readonly<Record<string, string | number | boolean>>;
  readonly statusCode: number;
  readonly events: ReadonlyArray<{
    readonly name: string;
    readonly attributes: Readonly<Record<string, string | number | boolean>>;
  }>;
}

interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values?: OtlpAnyValue[] };
}

interface OtlpKeyValue {
  key: string;
  value?: OtlpAnyValue;
}

function flatten(pairs: OtlpKeyValue[] | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const pair of pairs ?? []) {
    const value = pair.value ?? {};
    if (value.stringValue !== undefined) out[pair.key] = value.stringValue;
    else if (value.intValue !== undefined) out[pair.key] = Number(value.intValue);
    else if (value.doubleValue !== undefined) out[pair.key] = value.doubleValue;
    else if (value.boolValue !== undefined) out[pair.key] = value.boolValue;
    else if (value.arrayValue) {
      out[pair.key] = (value.arrayValue.values ?? [])
        .map((item) => item.stringValue ?? '')
        .join(',');
    }
  }
  return out;
}

export class OtlpCollector {
  private server?: Server;
  private readonly bodies: string[] = [];
  private readonly collected: CollectedSpan[] = [];

  async listen(): Promise<number> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        // TRA LOI TRUOC roi moi phan tich: exporter co thoi han, va mot loi phan tich cua bo thu
        // khong duoc bien thanh "ung dung khong gui duoc telemetry" o phia ben kia.
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        if (req.url?.includes('/v1/traces') !== true) return;
        this.bodies.push(raw);
        try {
          this.ingest(raw);
        } catch {
          /* than khong doc duoc van duoc giu o `bodies` de bai kiem doc bang mat */
        }
      });
    });

    await new Promise<void>((done) => {
      this.server!.listen(0, '127.0.0.1', done);
    });
    return (this.server!.address() as AddressInfo).port;
  }

  private ingest(raw: string): void {
    const payload = JSON.parse(raw) as {
      resourceSpans?: Array<{
        resource?: { attributes?: OtlpKeyValue[] };
        scopeSpans?: Array<{
          spans?: Array<{
            traceId: string;
            spanId: string;
            parentSpanId?: string;
            name: string;
            kind?: number;
            startTimeUnixNano?: string;
            endTimeUnixNano?: string;
            attributes?: OtlpKeyValue[];
            status?: { code?: number };
            events?: Array<{ name: string; attributes?: OtlpKeyValue[] }>;
          }>;
        }>;
      }>;
    };

    for (const resourceSpan of payload.resourceSpans ?? []) {
      const resource = flatten(resourceSpan.resource?.attributes);
      for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
        for (const span of scopeSpan.spans ?? []) {
          this.collected.push({
            traceId: span.traceId,
            spanId: span.spanId,
            // OTLP/JSON dung chuoi RONG cho "khong co cha", khong dung `null`.
            parentSpanId: span.parentSpanId ? span.parentSpanId : undefined,
            name: span.name,
            kind: span.kind ?? 0,
            startTimeUnixNano: span.startTimeUnixNano ?? '0',
            endTimeUnixNano: span.endTimeUnixNano ?? '0',
            attributes: flatten(span.attributes),
            resource,
            statusCode: span.status?.code ?? 0,
            events: (span.events ?? []).map((event) => ({
              name: event.name,
              attributes: flatten(event.attributes),
            })),
          });
        }
      }
    }
  }

  /** Moi span DA GUI toi bo thu nay. */
  spans(): readonly CollectedSpan[] {
    return this.collected;
  }

  /** Chi nhung span cua mot trace — dung thu ma mot nguoi mo ClickStack se nhin thay. */
  trace(traceId: string): CollectedSpan[] {
    return this.collected.filter((span) => span.traceId === traceId);
  }

  /** TUNG BYTE da gui. Day la thu bai kiem rieng tu phai quet, khong phai `spans()`. */
  rawBodies(): readonly string[] {
    return this.bodies;
  }

  /**
   * Ve cay cua mot trace duoi dang van ban — de bang chung DOC DUOC trong bao cao, thay vi la
   * mot cau khang dinh "chung toi da kiem tra".
   */
  render(traceId: string): string {
    const spans = this.trace(traceId).slice().sort(byStart);
    const byParent = new Map<string, CollectedSpan[]>();
    for (const span of spans) {
      const key = span.parentSpanId ?? '';
      byParent.set(key, [...(byParent.get(key) ?? []), span]);
    }
    const known = new Set(spans.map((span) => span.spanId));
    const lines: string[] = [];

    const walk = (span: CollectedSpan, depth: number): void => {
      const service = String(span.resource['service.name'] ?? '?');
      const millis = Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1e6;
      lines.push(
        `${'  '.repeat(depth)}${depth === 0 ? '' : '└─ '}${span.name}  ` +
          `[${service}] ${millis.toFixed(0)}ms${span.statusCode === 2 ? ' ERROR' : ''}`,
      );
      for (const child of (byParent.get(span.spanId) ?? []).sort(byStart)) walk(child, depth + 1);
    };

    // GOC = span khong co cha, HOAC co cha nhung cha khong nam trong lo nay (cha thuoc mot tien
    // trinh chua gui kip). Truong hop thu hai phai HIEN RA, khong duoc am tham bien mat.
    for (const span of spans) {
      if (!span.parentSpanId || !known.has(span.parentSpanId)) walk(span, 0);
    }
    return lines.join('\n');
  }

  async close(): Promise<void> {
    await new Promise<void>((done) => {
      this.server?.close(() => done());
    });
  }
}

function byStart(left: CollectedSpan, right: CollectedSpan): number {
  return Number(BigInt(left.startTimeUnixNano) - BigInt(right.startTimeUnixNano));
}
