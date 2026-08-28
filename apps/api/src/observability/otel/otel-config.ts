import { resolveReleaseShaFromEnv } from '../release-sha.js';
import { privacyModeFor, type TelemetryPrivacyMode } from '../telemetry-redaction.js';
import type { ReleaseIdentitySource } from '../trace-context.js';

/**
 * CAU HINH RUNTIME OTEL — doc mot lan luc preload, truoc khi Nest ton tai.
 *
 * VI SAO KHONG DUNG `loadEnv()` cua `@netviet/shared`:
 * File nay chay trong PRELOAD (`node --import`), tuc TRUOC ca `load-dotenv.js` cua ung dung va
 * truoc moi import nghiep vu. Keo `loadEnv()` vao day se keo theo ca do thi module nghiep vu —
 * dung cai ma preload phai tranh, vi muc dich cua preload la vao TRUOC `node:http` va Prisma.
 * Doi lai: file nay doc `process.env` tho, va tu chiu trach nhiem ve gia tri mac dinh.
 *
 * CONG TAC: `OTEL_TRACING=on` va KHONG co gia tri mac dinh bat. Tat = quay ve hanh vi hien tai
 * mot cach tuyet doi — khong SDK nao duoc nap, khong instrumentation nao duoc dang ky, khong
 * mot byte nao roi khoi tien trinh.
 */
export interface OtelRuntimeConfig {
  readonly enabled: boolean;
  /** `nexagnet-api` | `nexagnet-workflow-worker` — mot service.name cho MOI tien trinh. */
  readonly serviceName: string;
  readonly endpoint: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly tenant: string;
  readonly environment: string;
  /**
   * SHA 40 ky tu, hoac `'unknown'`. Phan giai bang CUNG mot ham voi telemetry noi bo
   * (`release-sha.ts`), nen mot trace trong ClickStack va cung trace do trong Debug View khong
   * the mang hai danh tinh ban phat hanh khac nhau.
   */
  readonly release: string;
  /**
   * Nguon da tra loi: `manifest` | `env` | `conflict` | `none`. Di kem release, khong phai trang
   * tri — mot span noi `#c37ee04` ma khong noi doc tu dau la mot span khong dung duoc de quyet
   * dinh rollback. `conflict` nghia la manifest va bien moi truong lech nhau va ta TU CHOI doan.
   */
  readonly releaseSource: ReleaseIdentitySource;
  /** Muc rieng tu ap cho span TU DONG — cung truc `DATA_CLASSIFICATION` voi telemetry noi bo. */
  readonly privacy: TelemetryPrivacyMode;
  /** Ti le lay mau o span GOC. 1 = lay het (10-20 don/ngay thi khong co ly do bo). */
  readonly sampleRatio: number;
  /** Duong dan HTTP vao khong sinh span — healthcheck goi lien tuc, khong mang tin gi. */
  readonly ignoredHttpPaths: readonly string[];
  /**
   * Muc chi tiet span Prisma.
   *
   * `operation` (mac dinh) — giu `prisma:client:operation` (`Message.create` + do dai + trang
   * thai). Do la muc tra loi duoc "truy van NAO cham/hong" bang ngon ngu nghiep vu.
   * `full` — giu them `prisma:engine:db_query`, tuc cau SQL. Do dac tren stack POC: bat `full`
   * lam so span moi luot tang tu 14 len 26, vuot ngan sach 18 cua muc 10. Nen no la mot cong
   * tac de MO KHI DIEU TRA, khong phai mac dinh.
   */
  readonly prismaDetail: 'operation' | 'full';
}

const DEFAULT_ENDPOINT = 'http://localhost:4318';
const DEFAULT_IGNORED_PATHS = ['/health', '/ready', '/metrics', '/favicon.ico'] as const;

/**
 * `OTEL_EXPORTER_OTLP_HEADERS` theo dac ta OTel: `key1=value1,key2=value2`.
 * Day la noi KHOA INGESTION di qua, nen no doc tu bien moi truong va khong bao gio duoc log.
 */
function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const headers: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key && value) headers[key] = value;
  }
  return headers;
}

function parseRatio(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return Math.min(parsed, 1);
}

export function readOtelConfig(env: NodeJS.ProcessEnv = process.env): OtelRuntimeConfig {
  const enabled = env.OTEL_TRACING === 'on';
  /*
   * DANH TINH BAN PHAT HANH DUNG CHUNG MOT LOI GIAI VOI TELEMETRY NOI BO.
   *
   * Truoc 28/08/2026 dong nay la `env.RELEASE_GIT_SHA ?? 'unknown'`, va no sai theo BA cach:
   *   · `compose.yaml` truyen `${RELEASE_GIT_SHA:-}`, nen thieu o host = CHUOI RONG trong
   *     container. `??` khong bat chuoi rong -> `nexagnet.release` di ra ngoai la `''`;
   *   · manifest la nguon CHINH tren gd1-test (`identitySource: "manifest"`), va o day no khong
   *     duoc doc chut nao;
   *   · nang nhat: manifest lech env thi canonical tra `unknown` CO CHU Y, con o day no im lang
   *     chon `env` — tuc mot permalink tro toi commit SAI.
   *
   * `release-sha.ts` chi phu thuoc `node:fs`, nen goi no o day khong keo do thi module nghiep vu
   * vao preload.
   */
  const release = resolveReleaseShaFromEnv(env);
  return {
    enabled,
    serviceName: env.OTEL_SERVICE_NAME ?? 'nexagnet-api',
    endpoint: (env.OTEL_EXPORTER_OTLP_ENDPOINT ?? DEFAULT_ENDPOINT).replace(/\/+$/, ''),
    headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    tenant: env.TENANT ?? 'unknown',
    environment: env.DEPLOYMENT_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
    release: release.gitSha,
    releaseSource: release.source,
    privacy: privacyModeFor(
      env.DATA_CLASSIFICATION === 'customer' ? 'customer' : 'test',
      env.TELEMETRY_PRIVACY,
    ),
    sampleRatio: parseRatio(env.OTEL_TRACES_SAMPLER_ARG),
    ignoredHttpPaths: env.OTEL_IGNORED_HTTP_PATHS
      ? env.OTEL_IGNORED_HTTP_PATHS.split(',').map((p) => p.trim()).filter(Boolean)
      : DEFAULT_IGNORED_PATHS,
    prismaDetail: env.OTEL_PRISMA_DETAIL === 'full' ? 'full' : 'operation',
  };
}
