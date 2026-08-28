import { spansToStoredTraces, type HistoricalSpanRow } from './historical-span.js';
import {
  HistoricalTraceReaderPort,
  type HistoricalLookup,
} from './historical-trace-reader.port.js';

/**
 * DUONG DOC LICH SU — `api` hoi thang ClickHouse bang mot CREDENTIAL CHI DOC.
 *
 * ---------------------------------------------------------------------------
 * VI SAO `api` DOC CHU KHONG PHAI CONSOLE:
 *
 * Console la ma nguon chay trong trinh duyet cua nguoi dung. De no hoi ClickHouse la de mot khoa
 * kho quan sat di ra tan may khach, va bo qua toan bo lop xac thuc/phan quyen ma moi duong
 * nghiep vu khac phai di qua. Nen duong doc nam o day, sau dung guard toan cuc, va console
 * khong biet ClickHouse ton tai.
 *
 * ---------------------------------------------------------------------------
 * BON RANG BUOC, va ca bon deu la RANG BUOC CHU KHONG PHAI TUY CHON:
 *
 * 1. **TENANT DUOC GHIM LUC DUNG.** Khong phuong thuc nao nhan `tenant`, va cau lenh luon mang
 *    `ResourceAttributes['nexagnet.tenant'] = {tenant:String}` voi gia tri do TIEN TRINH tu phan
 *    giai. Mot tham so tenant o day se dung lai chinh lo hong `X-Tenant` ma §8.2 cua
 *    `reference-platform-stack.md` loai bo.
 * 2. **KHONG XAC DINH DUOC TENANT THI KHONG DOC.** Fail-closed, khong fail-open.
 * 3. **THAM SO HOA, khong ghep chuoi.** Moi gia tri den tu ben ngoai di qua `param_*` cua
 *    ClickHouse. Cau lenh la HANG SO trong tep nay.
 * 4. **CO TRAN VA CO HAN GIO.** Mot man hinh chan doan khong duoc phep keo ca kho ve, va khong
 *    duoc treo khi kho cham.
 *
 * ---------------------------------------------------------------------------
 * KHOA DI O HEADER, KHONG O URL. ClickHouse nhan ca `?password=`, nhung URL thi di vao log truy
 * cap, vao thong bao loi, vao `docker logs`. Header thi khong.
 */

export interface ClickHouseReaderConfig {
  /** `http://clickhouse:8123` — giao dien HTTP, khong phai cong 9000 cua giao thuc goc. */
  readonly endpoint: string;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  /** Khach ma TIEN TRINH nay phuc vu. Khong bao gio den tu request. */
  readonly tenant: string;
  readonly timeoutMs: number;
  /** Tran so SPAN cho mot lan hoi. */
  readonly maxSpans: number;
  /** Tran so LUOT khi tra cuu theo don. */
  readonly maxTraces: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_SPANS = 2_000;
const DEFAULT_MAX_TRACES = 20;

/** `traceId` W3C: 32 ky tu hex. Khong dung dang thi khong phai mot cau hoi — khong hoi kho. */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;

const UNKNOWN_TENANT = 'unknown';

/**
 * Bang `otel_traces` do chinh `clickhouseexporter` dung len (`create_schema: true`), nen ten cot
 * o day la ten CUA NO, khong phai ten ta chon. Doi ten mot cot la doi hop dong voi mot thanh
 * phan ben ngoai — xem `deploy/netviet/observability/otel-collector.template.yaml`.
 */
const SPAN_COLUMNS = `
  TraceId, SpanId, ParentSpanId, SpanName, ServiceName, Timestamp, Duration,
  StatusCode, StatusMessage, SpanAttributes, ResourceAttributes,
  Events.Timestamp, Events.Name, Events.Attributes`;

const TENANT_GUARD = "ResourceAttributes['nexagnet.tenant'] = {tenant:String}";

const SPANS_BY_TRACE_SQL = `SELECT ${SPAN_COLUMNS}
FROM otel_traces
WHERE TraceId = {traceId:String} AND ${TENANT_GUARD}
ORDER BY Timestamp ASC
LIMIT {limit:UInt32}`;

/**
 * Neo `orderId` nam tren span GOC (do `telemetry.enrich()` dat qua `bridge.anchor`), khong tren
 * moi span. Nen buoc mot tim LUOT, buoc hai moi lay span — khong the loc mot phat.
 */
const TRACES_BY_ORDER_SQL = `SELECT TraceId, min(Timestamp) AS started
FROM otel_traces
WHERE SpanAttributes['nexagnet.orderId'] = {orderId:String} AND ${TENANT_GUARD}
GROUP BY TraceId
ORDER BY started DESC
LIMIT {limit:UInt32}`;

const SPANS_BY_TRACES_SQL = `SELECT ${SPAN_COLUMNS}
FROM otel_traces
WHERE TraceId IN {traceIds:Array(String)} AND ${TENANT_GUARD}
ORDER BY Timestamp ASC
LIMIT {limit:UInt32}`;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type QueryResult =
  | { readonly kind: 'rows'; readonly rows: readonly unknown[] }
  | { readonly kind: 'error'; readonly lookup: HistoricalLookup };

export class ClickHouseHistoricalTraceReader extends HistoricalTraceReaderPort {
  constructor(
    private readonly config: ClickHouseReaderConfig,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async byTraceId(traceId: string): Promise<HistoricalLookup> {
    if (!TRACE_ID_PATTERN.test(traceId)) return { status: 'not_found' };
    const refusal = this.tenantGuard();
    if (refusal) return refusal;

    return toLookup(
      await this.query(SPANS_BY_TRACE_SQL, {
        traceId,
        limit: String(this.config.maxSpans),
      }),
    );
  }

  async byOrderId(orderId: string): Promise<HistoricalLookup> {
    if (!orderId.trim()) return { status: 'not_found' };
    const refusal = this.tenantGuard();
    if (refusal) return refusal;

    const heads = await this.query(TRACES_BY_ORDER_SQL, {
      orderId,
      limit: String(this.config.maxTraces),
    });
    if (heads.kind !== 'rows') return heads.lookup;

    const traceIds = heads.rows
      .map((row) => String((row as { TraceId?: unknown })?.TraceId ?? ''))
      .filter((id) => TRACE_ID_PATTERN.test(id));
    if (traceIds.length === 0) return { status: 'not_found' };

    return toLookup(
      await this.query(SPANS_BY_TRACES_SQL, {
        // Dang mang cua tham so ClickHouse: `['a','b']`. An toan vi tung phan tu da qua
        // `TRACE_ID_PATTERN` — khong ky tu nao con lai co the thoat khoi dau nhay.
        traceIds: `[${traceIds.map((id) => `'${id}'`).join(',')}]`,
        limit: String(this.config.maxSpans),
      }),
    );
  }

  /** Tien trinh khong biet no phuc vu ai thi KHONG DUOC doc kho cua ai. */
  private tenantGuard(): HistoricalLookup | null {
    return this.config.tenant === UNKNOWN_TENANT
      ? { status: 'unavailable', reason: 'TENANT_UNRESOLVED' }
      : null;
  }

  /**
   * Mot lan hoi. Tra ve HOAC cac hang HOAC ly do khong hoi duoc — khong bao gio nem, va khong
   * bao gio bien mot loi thanh mot ket qua rong.
   */
  private async query(
    sql: string,
    params: Readonly<Record<string, string>>,
  ): Promise<QueryResult> {
    const url = new URL(this.config.endpoint);
    url.searchParams.set('database', this.config.database);
    url.searchParams.set('default_format', 'JSONEachRow');
    // `readonly=2` chu khong phai `1`: muc 1 cam LUON ca viec dat cac setting ngay duoi day. Ca
    // hai muc deu cam ghi. Day la lop thu HAI — lop thu nhat la quyen cua chinh user doc
    // (`GRANT SELECT`, xem `render-secrets.sh`), va lop do moi la lop khong go duoc tu day.
    url.searchParams.set('readonly', '2');
    // Han gio o CA HAI DAU: phia may chu de truy van tu chet, phia client de socket khong treo.
    url.searchParams.set('max_execution_time', String(Math.ceil(this.config.timeoutMs / 1000)));
    url.searchParams.set('max_result_rows', String(this.config.maxSpans));
    url.searchParams.set('result_overflow_mode', 'break');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(`param_${key}`, value);
    }
    // TENANT DAT SAU CUNG VA DAT O DAY, khong o tung noi goi. Hai ly do, ca hai deu ve tinh dung
    // dan chu khong ve gon gang:
    //   · moi cau lenh trong tep nay mang `{tenant:String}`, nen mot noi goi quen truyen se lam
    //     ClickHouse tu choi ca truy van — mot duong doc chet lang le. Dat tap trung thi khong
    //     con "noi goi quen" nao ton tai;
    //   · dat SAU vong lap tren nghia la mot tham so ten `tenant` do ben ngoai dua vao KHONG THE
    //     de len gia tri nay. Ghim tenant o §8.1 chi that su duoc ghim khi khong co duong ghi de.
    url.searchParams.set('param_tenant', this.config.tenant);

    try {
      const response = await this.fetchImpl(url.toString(), {
        method: 'POST',
        body: sql,
        headers: {
          // Khoa o HEADER — xem chu thich dau tep.
          'X-ClickHouse-User': this.config.user,
          'X-ClickHouse-Key': this.config.password,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        // KHONG dua than loi cua ClickHouse ra ngoai: no co the mang ten user, ten bang, mot
        // manh cau lenh. Ma ly do la du de phan loai; chi tiet nam o log may chu.
        return { kind: 'error', lookup: { status: 'unavailable', reason: 'STORE_ERROR' } };
      }
      return { kind: 'rows', rows: parseJsonEachRow(await response.text()) };
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return {
        kind: 'error',
        lookup: { status: 'unavailable', reason: timedOut ? 'TIMEOUT' : 'STORE_ERROR' },
      };
    }
  }
}

function toLookup(result: QueryResult): HistoricalLookup {
  if (result.kind !== 'rows') return result.lookup;
  const traces = spansToStoredTraces(result.rows as readonly HistoricalSpanRow[]);
  return traces.length > 0 ? { status: 'found', traces } : { status: 'not_found' };
}

/**
 * `JSONEachRow` = mot doi tuong JSON tren MOI DONG (khong phai mot mang).
 *
 * Dong hong bi BO QUA thay vi lam hong ca cau tra loi: du lieu nay den tu mot he thong khac va
 * co the bi cat giua chung khi cham tran (`result_overflow_mode: break`) — mat mot span cuoi con
 * hon mat ca man hinh.
 */
function parseJsonEachRow(body: string): unknown[] {
  const rows: unknown[] = [];
  for (const line of body.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    try {
      rows.push(JSON.parse(trimmedLine));
    } catch {
      /* dong hong — bo qua */
    }
  }
  return rows;
}

/**
 * Doc cau hinh duong doc tu moi truong. THIEU MOT MANH = KHONG CO DUONG DOC.
 *
 * Khong co gia tri mac dinh cho endpoint/database/user/password, va do la co y: mot mac dinh o
 * day se bien "chua cau hinh" thanh "da tro vao mot cho nao do", va cho do gan nhu chac chan la
 * sai. `null` tra ve mot su that doc duoc — `NOT_CONFIGURED`.
 *
 * `OTEL_TRACING` la cong tac DUY NHAT cua ca cum quan sat (xem `compose.yaml`). Tat thi khong co
 * gi de doc, nen khong dung duong doc — thay vi de no goi vao mot kho khong ton tai o moi lan
 * mot trace roi khoi vong dem.
 */
export function readClickHouseReaderConfig(
  env: NodeJS.ProcessEnv,
  tenant: string,
): ClickHouseReaderConfig | null {
  if (env.OTEL_TRACING !== 'on') return null;
  const endpoint = trimmed(env.CLICKHOUSE_READER_ENDPOINT);
  const database = trimmed(env.CLICKHOUSE_DATABASE);
  const user = trimmed(env.CLICKHOUSE_READER_USER);
  const password = trimmed(env.CLICKHOUSE_READER_PASSWORD);
  if (!endpoint || !database || !user || !password) return null;

  return {
    endpoint,
    database,
    user,
    password,
    tenant,
    timeoutMs: positive(env.HISTORICAL_TRACE_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS,
    maxSpans: positive(env.HISTORICAL_TRACE_MAX_SPANS) ?? DEFAULT_MAX_SPANS,
    maxTraces: positive(env.HISTORICAL_TRACE_MAX_TRACES) ?? DEFAULT_MAX_TRACES,
  };
}

function trimmed(value: string | undefined): string | undefined {
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function positive(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
