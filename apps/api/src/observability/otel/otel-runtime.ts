import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PrivacySpanProcessor } from './privacy-span-processor.js';
import { SpanNoiseFilter, droppedSpanNames } from './span-noise-filter.js';
import { readOtelConfig, type OtelRuntimeConfig } from './otel-config.js';

/**
 * KHOI TAO RUNTIME OTEL. Chay tu `otel-preload.ts` qua `node --import`, tuc TRUOC moi import
 * nghiep vu.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI LA PRELOAD chu khong phai dong dau `main.ts`:
 *
 * `instrumentation-http` va phan lon instrumentation khac lam viec bang cach VA LAI module
 * (`node:http`). Trong ESM, moi cau `import` cua mot file duoc danh gia TRUOC cau lenh dau tien
 * cua chinh file do — nen mot `await import('./otel.js')` dat o dong 1 cua `main.ts` van chay
 * SAU khi `@nestjs/platform-express` (va qua do `node:http`) da duoc nap. Vao muon nghia la
 * khong vao duoc.
 *
 * Prisma thi de hon (`PrismaInstrumentation` chi can co truoc khi `PrismaClient` duoc KHOI TAO,
 * ma viec do do Nest DI lam), va undici dung `diagnostics_channel` nen khong phu thuoc thu tu.
 * Nhung mot quy tac ("luon preload") de kiem chung hon ba quy tac khac nhau.
 *
 * ---------------------------------------------------------------------------
 * DANH SACH INSTRUMENTATION LA MOT HOP DONG, khong phai `getNodeAutoInstrumentations()`.
 *
 * Goi tu dong day du bat ca `fs`, `dns`, `net`, `express` — tuc hang tram span cho mot luot, va
 * ngan sach "5-15 buoc cho mot luot" cua muc 10 chet ngay. Ba cai duoi day duoc chon vi moi cai
 * tra loi mot cau hoi CO THAT trong danh sach 14 cau:
 *
 *   · undici -> "goi DeepSeek/Flowise/Zalo co loi khong" (Node 24: `fetch` toan cuc LA undici,
 *               `instrumentation-http` KHONG nhin thay no);
 *   · http   -> "request nao vao, tra ve bao nhieu" (Nest/express chay tren `node:http`);
 *   · prisma -> "truy van nao cham/hong".
 */

let provider: NodeTracerProvider | undefined;
let started = false;

export function isOtelRunning(): boolean {
  return started;
}

export function startOtel(config: OtelRuntimeConfig = readOtelConfig()): boolean {
  if (started) return true;
  if (!config.enabled) return false;

  if (process.env.OTEL_DIAG === 'on') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.release,
    // Ba neo duoi day la thu phan biet telemetry cua khach nay voi khach khac NGAY TRONG du
    // lieu, khong chi bang viec chung nam o hai backend khac nhau.
    'deployment.environment.name': config.environment,
    'nexagnet.tenant': config.tenant,
    'nexagnet.release': config.release,
    // NGUON DI KEM RELEASE. Mot span noi `#c37ee04` ma khong noi doc tu dau la mot span khong
    // dung duoc de quyet dinh rollback — dung ly do da lam `formatRelease()` mang `(manifest)`.
    'nexagnet.release_source': config.releaseSource,
  });

  /*
   * `conflict` = manifest va bien moi truong khong dong y nhau ve commit dang chay. Loi giai da
   * tra `unknown` (fail-safe, khong doan), nhung im lang thi khong du: day la mot SU CO TRIEN
   * KHAI that — manifest cu con lai, container khong duoc tao lai, hoac co nguoi sua tep tren VM.
   * Keu to mot lan luc khoi dong; KHONG nem, vi quan sat khong duoc tro thanh dieu kien de nghiep
   * vu chay.
   */
  if (config.releaseSource === 'conflict') {
    console.warn(
      '[otel] release.json va RELEASE_GIT_SHA LECH NHAU — span se mang release=unknown. ' +
        'Kiem lai lan deploy gan nhat truoc khi tin vao bat ky permalink nao.',
    );
  }

  const exporter = new OTLPTraceExporter({
    url: `${config.endpoint}/v1/traces`,
    ...(Object.keys(config.headers).length > 0 ? { headers: { ...config.headers } } : {}),
  });

  /*
   * BOC theo dung thu tu: batch -> rieng tu -> ngan sach span -> provider.
   * `PrivacySpanProcessor` la lop NGOAI cung, nen khong co span nao toi duoc `BatchSpanProcessor`
   * (va qua do toi exporter) ma chua di qua bo loc. Xem chu thich trong file do de biet vi sao
   * dang decorator, khong dang "them mot processor nua vao mang".
   *
   * `SpanNoiseFilter` nam NGOAI cong rieng tu vi no can `onStart` (de dung pha he) va vi bo bot
   * span TRUOC khi sanitize thi re hon — nhung thu tu do khong anh huong tinh dung dan: khong
   * duong nao toi `BatchSpanProcessor` ma khong di qua bo loc rieng tu.
   */
  const processor = new SpanNoiseFilter(
    new PrivacySpanProcessor(
      new BatchSpanProcessor(exporter, {
      // Mot luot tin ~8-18 span. Hang doi 2048 chiu duoc ca tram luot don trong luc backend chet.
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 2_000,
        exportTimeoutMillis: 15_000,
      }),
      config.privacy,
    ),
    droppedSpanNames(config.prismaDetail),
  );

  provider = new NodeTracerProvider({
    resource,
    // `ParentBased`: quyet dinh lay mau o span GOC roi ca cay theo do. Khong co no thi mot cay
    // se bi lay mau lo cho — vai span co, vai span khong — tuc mot cay rach, te hon la khong co.
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRatio) }),
    spanProcessors: [processor],
  });

  // `register()` cai luon ContextManager (AsyncLocalStorage) + Propagator W3C toan cuc.
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => {
          const url = request.url ?? '';
          return config.ignoredHttpPaths.some((path) => url.startsWith(path));
        },
      }),
      new UndiciInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  started = true;
  return true;
}

/**
 * Dong SDK: day not hang doi roi tat.
 *
 * Goi tu `process.on('SIGTERM')` cua preload. Khong co buoc nay thi lo span cuoi cung — dung lo
 * chua ly do tien trinh vua tat — bien mat cung tien trinh.
 */
export async function shutdownOtel(): Promise<void> {
  if (!provider) return;
  const current = provider;
  provider = undefined;
  started = false;
  try {
    await current.forceFlush();
  } catch {
    /* fail-open */
  }
  try {
    await current.shutdown();
  } catch {
    /* fail-open */
  }
}
