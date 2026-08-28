import { Global, Logger, Module } from '@nestjs/common';
import {
  ClickHouseHistoricalTraceReader,
  readClickHouseReaderConfig,
} from './historical/clickhouse-historical-trace-reader.js';
import { HistoricalTraceReaderPort } from './historical/historical-trace-reader.port.js';
import { TraceLookupService } from './historical/trace-lookup.service.js';
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
    TraceLookupService,
    /**
     * DUONG LUI VE LICH SU — co mat KHI VA CHI KHI ban trien khai co mot kho de lui ve.
     *
     * `useValue: null` khi chua cau hinh, chu khong phai mot hien thuc rong tra `not_found`: hai
     * cau tra loi do khac nhau ve BAN CHAT. Mot hien thuc rong noi "da hoi va khong co"; `null`
     * lam `TraceLookupService` noi `NOT_CONFIGURED` — "khong co cho nao de hoi". Man hinh chan
     * doan phan biet hai cau do, va do la ca diem cua ba ket cuc trong `HistoricalLookup`.
     *
     * Tenant lay TU CHINH DANH TINH DA PHAN GIAI o tren, khong doc lai `env.TENANT`: hai phep
     * doc doc lap la hai cau tra loi co the lech nhau, va lech o day nghia la doc nham kho cua
     * khach khac. Mot nguon, mot cau tra loi.
     */
    {
      provide: HistoricalTraceReaderPort,
      useFactory: (): HistoricalTraceReaderPort | null => {
        const logger = new Logger('Observability');
        const config = readClickHouseReaderConfig(process.env, resolveReleaseIdentity().tenant);
        if (!config) return null;
        if (config.tenant === 'unknown') {
          // Fail-closed, va NOI TO. Mot tien trinh khong biet no phuc vu ai ma van doc mot kho
          // theo tenant la dung lop lo hong ma mo hinh cach ly duoc chon de tranh (§8.1).
          logger.error(
            'Kho quan sat da cau hinh nhung tien trinh khong xac dinh duoc khach — duong doc ' +
              'lich su se TU CHOI moi truy van. Kiem mount `.runtime/release.json`.',
          );
        }
        logger.log(`Duong doc lich su: ClickHouse/${config.database} (chi doc)`);
        return new ClickHouseHistoricalTraceReader(config);
      },
    },
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
        if (release.source === 'conflict') {
          // HAI NGUON, HAI CAU TRA LOI. Khong ben nao duoc chon (xem `resolveGitSha`), nen o day
          // chi con viec noi to. Cong CUNG nam o `deploy-stack.sh`: mot lan deploy roi vao trang
          // thai nay do voi ma `RELEASE_IDENTITY_MISMATCH`, khong phai mot loi suc khoe chung.
          logger.error(
            `Danh tinh release XUNG DOT: manifest=${release.mismatch?.manifestGitSha} ` +
              `RELEASE_GIT_SHA=${release.mismatch?.envGitSha}. Trace se khong neo vao release nao ` +
              'cho toi khi hai nguon thong nhat — mot permalink tro toi commit sai te hon khong co.',
          );
        } else if (release.gitSha === 'unknown') {
          // KHONG phai loi khi chay local. TREN STACK thi day la trieu chung that: `release.json`
          // chua duoc mount, nen moi trace se khong tra loi duoc "bug nay o commit nao".
          logger.warn(
            'Khong xac dinh duoc git SHA — trace se khong neo duoc vao release. ' +
              'Tren stack: kiem tra mount `.runtime/release.json` + bien RELEASE_MANIFEST_PATH.',
          );
        } else if (release.source === 'env') {
          // Du phong CHAY DUOC, nhung khong phai nguon canonical. Tren stack no co nghia la
          // manifest chua toi duoc tien trinh — dung trieu chung ma milestone nay dong lai.
          logger.warn(
            'Danh tinh release den tu bien moi truong (du phong), khong tu `release.json`. ' +
              'Tren stack: kiem tra mount `.runtime/release.json` + bien RELEASE_MANIFEST_PATH.',
          );
        }
        return telemetry;
      },
    },
  ],
  /**
   * `RecentTracesSink` duoc XUAT (module nay `@Global`, nen tuc la moi noi tiem duoc) de man
   * hinh chan doan doc lai cac luot ma khong phai dung mot vong dem thu hai.
   *
   * Xuat mot SINK ra ngoai nghe co ve pha bien gioi, nhung khong: cai duoc dung o ngoai la cac
   * duong DOC (`get`/`list`/`findByOrderId`/`findAllByOrderId`). Duong `record` van chi co
   * `TelemetryService` goi — nghiep vu khong bao gio ghi thang vao sink, va dieu do khong duoc
   * noi long o day.
   */
  exports: [TelemetryService, RecentTracesSink, TraceLookupService],
})
export class ObservabilityModule {}
