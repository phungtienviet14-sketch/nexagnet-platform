import { Global, Logger, Module } from '@nestjs/common';
import { loadTenantConfig } from '@netviet/tenant';
import { resolveReleaseIdentity, formatRelease } from './release-identity.js';
import { StructuredLogSink } from './structured-logging.js';
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
  providers: [
    {
      provide: TelemetryService,
      useFactory: (): TelemetryService => {
        const telemetry = new TelemetryService();
        const logger = new Logger('Observability');

        // Slug khach doc tu GOI KHACH — nguon dang tin nhat luc chay (xem release-identity.ts).
        // Loi doc goi khach khong duoc lam sap boot cua telemetry: khong biet ten khach thi van
        // quan sat duoc, chi la nhan `unknown`.
        let tenantSlug: string | undefined;
        try {
          tenantSlug = loadTenantConfig().slug;
        } catch {
          tenantSlug = undefined;
        }

        const release = resolveReleaseIdentity({ ...(tenantSlug ? { tenantSlug } : {}) });
        const privacy = privacyModeFor(
          process.env.DATA_CLASSIFICATION === 'customer' ? 'customer' : 'test',
          process.env.TELEMETRY_PRIVACY,
        );

        // Mot sink duy nhat o buoc nay: NDJSON ra stdout. Do la lua chon co y —
        // docs/kien-truc/observability-review.md §13 giai thich vi sao chua dung backend rieng.
        // Them sink khac (Postgres cua tenant, OTLP) chi la them phan tu vao mang nay.
        const sinks: TelemetrySink[] = [new StructuredLogSink()];

        telemetry.configure({ release, privacy, sinks });

        logger.log(
          `Telemetry: ${formatRelease(release)} · muc rieng tu=${privacy} · sink=ndjson-stdout`,
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
