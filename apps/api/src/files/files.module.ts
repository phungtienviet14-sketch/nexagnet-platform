import { Module } from '@nestjs/common';
import { InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../audit/prisma-audit-log.repository.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { createMediaStore } from '../media/media.provider.js';
import {
  FileDomainAuthorizerRegistry,
  InMemoryFileDomainAuthorizerRegistry,
} from './file-authorization.port.js';
import { FileAuthorizationService } from './file-authorization.service.js';
import { FileBlobStore } from './file-blob.port.js';
import { FilePurgeService } from './file-purge.service.js';
import { DisabledFileScanner, FileScannerPort } from './file-scanner.port.js';
import { FileRepository, InMemoryFileRepository } from './file.repository.js';
import { FileService } from './file.service.js';
import { FILE_AUDIT_LOG } from './file.tokens.js';
import { MediaFileBlobStore } from './media-file-blob.store.js';
import { PrismaFileRepository } from './prisma-file.repository.js';

/**
 * NEN TANG TEP — `#287`. `foundation`, KHONG mot capability.
 *
 * ============================================================================================
 * VI SAO `foundation`
 * ============================================================================================
 *
 * Cung ly le ma `ObservabilityModule` va `SourceRegistryModule` da dung: moi khach deu co tep. Cai
 * khac nhau giua cac khach la MIEN NAO gan tep vao cai gi — va dieu do duoc quyet boi so dang ky
 * quyen, tuc boi cac module mien thuc su duoc nap, chu khong boi mot co bat/tat o day.
 *
 * Con mot ly do thuc te nua: `CapabilityId` la mot enum DONG trong `tenant.schema.ts`. Them mot gia
 * tri vao do se bat moi goi khach hien co phai khai mot capability moi de giu nguyen hanh vi — mot
 * thay doi lan sang tung khach cho mot tang ma khong khach nao tu chon khong dung.
 *
 * ============================================================================================
 * KHO BYTE: DUNG CHUNG PHEP CHON, MOT THE HIEN RIENG
 * ============================================================================================
 *
 * `createMediaStore(loadFoundationEnv())` — dung khuon ma `transportEvidenceStoreProvider` va
 * `catalogStoreProvider` da dung, va vi dung mot ly do: `mediaStoreProvider` toan cuc thuoc
 * `turn-processing` va doc `loadEnv()` DAY DU, tuc doi credential cua parser/kenh. Mot khach khong
 * ban hang van phai co tep.
 *
 * `#287` P4 duoc giu o cho khac: `MediaFileBlobStore` BOC `MediaStore` chu khong thay the no, nen
 * van chi co MOT chong client cho ca bon nha cung cap.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: FileRepository,
      useFactory: (prisma: PrismaService): FileRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaFileRepository(prisma)
          : new InMemoryFileRepository(),
      inject: [PrismaService],
    },
    /**
     * DAU VET cua nen tang tep — mot TOKEN RIENG. Xem `file.tokens.ts` de biet vi sao.
     *
     * Cung phep chon kho voi moi noi khac (`PERSISTENCE`), nen o ban chay that ca ba mien ghi vao
     * CUNG mot bang. Cai khac la token, khong phai noi den.
     */
    {
      provide: FILE_AUDIT_LOG,
      useFactory: (prisma: PrismaService): AuditLogService =>
        new AuditLogService(
          loadFoundationEnv().PERSISTENCE === 'prisma'
            ? new PrismaAuditLogRepository(prisma)
            : new InMemoryAuditLogRepository(),
        ),
      inject: [PrismaService],
    },
    {
      provide: FileBlobStore,
      useFactory: (): FileBlobStore =>
        new MediaFileBlobStore(createMediaStore(loadFoundationEnv())),
    },
    /**
     * MAY QUET TAT la mac dinh — `#287` P5 *"No mandatory SaaS dependency"*.
     *
     * Doi dong nay sang mot may quet that la toan bo viec phai lam de bat `QUARANTINED`; khong mot
     * luat mien nao, khong mot bang nao, khong mot bai test nghiep vu nao phai doi.
     */
    { provide: FileScannerPort, useClass: DisabledFileScanner },
    { provide: FileDomainAuthorizerRegistry, useClass: InMemoryFileDomainAuthorizerRegistry },
    FileAuthorizationService,
    FileService,
    FilePurgeService,
  ],
  exports: [
    FileService,
    FilePurgeService,
    FileRepository,
    FileBlobStore,
    FileAuthorizationService,
    /** Mien dang ky nguoi tra loi quyen cua chinh no qua day — xem `FileDomainAuthorizerRegistry`. */
    FileDomainAuthorizerRegistry,
  ],
})
export class FilesModule {}
