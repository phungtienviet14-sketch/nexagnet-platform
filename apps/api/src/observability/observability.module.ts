import { Global, Logger, Module } from '@nestjs/common';
import { OtelTraceBridge } from './otel/otel-trace-bridge.js';
import { isOtelRunning } from './otel/otel-runtime.js';
import { resolveReleaseIdentity, formatRelease } from './release-identity.js';
import { RecentTracesSink } from './recent-traces.sink.js';
import { StructuredLogSink } from './structured-logging.js';
import { TraceController } from './trace.controller.js';
import { TelemetryService } from './telemetry.service.js';
import type { TelemetrySink } from './telemetry-record.js';
import { privacyModeFor } from './telemetry-redaction.js';

/**
 * NEN TANG, khong phai capability (muc 12).
 *
 * Dang ky voi owner `foundation` trong `app-composition.ts` — tuc MOI khach deu duoc quan sat,
 * khong co cong tac `observability` bat/tat theo tenant. Cai KHAC nhau giua cac khach la MUC CHI
 * TIET NOI DUNG (`privacyModeFor`), khong phai co duoc quan sat hay khong. Mot khach khong quan
 * sat duoc la mot khach khong ho tro duoc.
 *
 * `@Global()` co y: telemetry can goi duoc tu bat ky tang nao (pipeline, orchestrator, advisor,
 * repository) ma khong bat 20 module phai khai bao lai cung mot import.
 */
@Global()
@Module({
  controllers: [TraceController],
  providers: [
    RecentTracesSink,
    {
      provide: TelemetryService,
      inject: [RecentTracesSink],
      useFactory: (recentTraces: RecentTracesSink): TelemetryService => {
        const telemetry = new TelemetryService();
        const logger = new Logger('Observability');

        // Slug khach doc tu GOI KHACH — nguon dang tin nhat luc chay. Phep doc do (va viec nuot
        // loi khi khong co goi) nam TRONG `resolveReleaseIdentity`, khong o day: khi no con nam
        // o noi goi thi `workflow.module.ts` da bo sot, va ca stack chay voi `tenant=unknown`.
        const release = resolveReleaseIdentity();
        const privacy = privacyModeFor(
          process.env.DATA_CLASSIFICATION === 'customer' ? 'customer' : 'test',
          process.env.TELEMETRY_PRIVACY,
        );

        // Hai sink, khong backend nao ben ngoai — xem docs/kien-truc/observability-review.md §13.
        //   · `StructuredLogSink`  -> NDJSON ra stdout, cho `docker logs | tools/trace-view.mjs`;
        //   · `RecentTracesSink`   -> vong dem co tran, cho nut "Xem luong xu ly" tren console.
        // Them sink khac (Postgres cua tenant, OTLP) chi la them phan tu vao mang nay.
        const sinks: TelemetrySink[] = [new StructuredLogSink(), recentTraces];

        /*
         * CAU NOI RUNTIME TRACING — chi lap khi tien trinh DA co runtime chay THAT.
         *
         * `isOtelRunning()` doc trang thai do `otel-preload.ts` dat, khong doc lai bien moi
         * truong. Khac biet nay quan trong: `OTEL_TRACING=on` ma quen `--import` thi preload
         * khong chay, khong instrumentation nao duoc dang ky, va mot cau noi lap vao luc do se
         * mo span vao mot provider rong — tuc bao cao la "co quan sat" trong khi khong co. Doc
         * trang thai THAT thay vi doc y dinh.
         */
        const bridge = isOtelRunning() ? new OtelTraceBridge() : undefined;

        telemetry.configure({ release, privacy, sinks, ...(bridge ? { bridge } : {}) });

        logger.log(
          `Telemetry: ${formatRelease(release)} · muc rieng tu=${privacy} · sink=ndjson-stdout` +
            (bridge ? ' + otlp' : ''),
        );
        if (release.gitSha === 'unknown') {
          // KHONG phai loi khi chay local. TREN STACK thi day la trieu chung that: `release.json`
          // chua duoc mount, nen moi trace se khong tra loi duoc "bug nay o commit nao".
          logger.warn(
            'Khong xac dinh duoc git SHA — trace se khong neo duoc vao release. ' +
              'Tren stack: kiem tra mount `.runtime/release.json` + bien RELEASE_MANIFEST_PATH.',
          );
        }
        return telemetry;
      },
    },
  ],
  exports: [TelemetryService],
})
export class ObservabilityModule {}
