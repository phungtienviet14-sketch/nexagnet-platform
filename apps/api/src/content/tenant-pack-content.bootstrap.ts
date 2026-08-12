import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { TenantContentManifest } from '@netviet/tenant';
import { ContentImportService } from './content-import.service.js';
import { ContentService } from './content.service.js';

/**
 * Token cua manifest noi dung trong goi khach. Nhan doc goi khach qua MOT provider chu khong goi
 * `loadTenantContentManifest()` thang trong lop: nho vay test dung thang mot manifest bat ky ma
 * khong phai doi bien moi truong TENANT_DIR toan tien trinh (test khac trong cung worker se sai).
 */
export const TENANT_CONTENT_MANIFEST = Symbol('TENANT_CONTENT_MANIFEST');

/**
 * Nap noi dung HAT GIONG tu goi khach (`tenants/<slug>/data/content-manifest.json`) luc boot.
 *
 * Vi sao di qua `ContentImportService` chu khong ghi thang repository: duong import cua man hinh
 * `/settings` da co san hai bat bien can o day —
 *   1. khoa theo `externalId` => chay lai (moi lan restart) KHONG nhan ban du lieu;
 *   2. ban ghi nguoi van hanh da sua bi danh `conflict` va BO QUA => FAQ da duyet len `active`
 *      khong bao gio bi lan boot sau ha nguoc ve `draft`.
 * Viet mot duong ghi thu hai o day nghia la phai nhan ban ca hai bat bien do.
 *
 * Fail-closed nhung KHONG lam sap API: goi khach khong co file -> khong lam gi; import loi (vi du
 * Postgres chua seed san pham nen SKU chua ton tai) -> log ERROR roi di tiep. Ly do: thieu FAQ chi
 * lam agent tu van chuyen handoff Sale, con kenh Zalo van phai song de tin nhan duoc luu lai —
 * Zalo khong phat lai tin, mat la mat vinh vien (CLAUDE.md).
 *
 * Noi dung nap vao o trang thai `draft`: phai co nguoi duyet `draft -> reviewed -> approved ->
 * active` moi duoc dung de tra loi khach.
 */
@Injectable()
export class TenantPackContentBootstrap implements OnModuleInit {
  private readonly logger = new Logger('TenantPackContent');

  constructor(
    private readonly imports: ContentImportService,
    private readonly content: ContentService,
    @Inject(TENANT_CONTENT_MANIFEST)
    private readonly manifest: TenantContentManifest | null,
  ) {}

  async onModuleInit(): Promise<void> {
    const manifest = this.manifest;
    if (!manifest) {
      this.logger.log('Goi khach khong co data/content-manifest.json — bo qua nap noi dung.');
      return;
    }
    try {
      const result = await this.imports.apply(manifest, true, 'tenant-pack');
      this.logger.log(
        `Nap noi dung tu goi khach: +${result.creates} moi, ${result.updates} cap nhat, ` +
          `${result.unchanged} khong doi, ${result.skippedConflicts} giu nguyen (nguoi van hanh da sua). ` +
          'Tat ca o trang thai draft — can duyet len active moi dung de tra loi.',
      );
      await this.content.reload();
    } catch (error: unknown) {
      this.logger.error(
        `Khong nap duoc noi dung tu goi khach: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
