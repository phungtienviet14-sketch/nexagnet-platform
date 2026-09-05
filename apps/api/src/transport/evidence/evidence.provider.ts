import type { Provider } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { MediaStore } from '../../media/media-store.js';
import { createMediaStore } from '../../media/media.provider.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import {
  TRANSPORT_EVIDENCE_MAX_BYTES,
  TransportEvidenceService,
} from './transport-evidence.service.js';

/**
 * Kho anh CUA MIEN VAN TAI — `#169`.
 *
 * ===========================================================================
 * MOT TOKEN RIENG, khong dung lai `MediaStore` toan cuc. Vi sao:
 *
 * `mediaStoreProvider` duoc dang ky `owned('turn-processing', ...)`, va no doc `loadEnv()` DAY DU —
 * tuc doi credential cua parser va kenh. Mot khach VAN TAI khong bat `turn-processing`:
 *
 *   · token `MediaStore` se KHONG duoc cung cap  -> Nest khong dung noi do thi;
 *   · va neu cu goi `loadEnv()` thi ho khong boot -> vi ho khong co parser nao ca.
 *
 * Nen o day dung dung khuon `catalogStoreProvider` da lam cho `knowledge`: mot token rieng, doc
 * `loadFoundationEnv()`, va DUNG CHUNG phep chon kho (`createMediaStore`) de khong sinh ra hai
 * chinh sach luu tru.
 *
 * ===========================================================================
 * MOT KHACH BAT CA HAI thi co HAI the hien kho, tro cung mot bucket.
 *
 * Do la chap nhan duoc va co chu y: hai the hien khong giu trang thai nao (chung chi bao dong mot
 * client SDK), con cai doi lai la hai capability KHONG rang buoc vong doi vao nhau. Anh tin nhan
 * Zalo va bang chung van tai nam duoi hai TIEN TO khac nhau trong cung bucket, nen chung khong bao
 * gio dam nhau.
 */
export const TRANSPORT_EVIDENCE_STORE = Symbol('TRANSPORT_EVIDENCE_STORE');

export const transportEvidenceStoreProvider: Provider = {
  provide: TRANSPORT_EVIDENCE_STORE,
  useFactory: (): MediaStore => createMediaStore(loadFoundationEnv()),
};

/**
 * `MEDIA_MAX_BYTES` di vao service qua mot token thay vi mot lan goi `loadEnv()` ben trong.
 *
 * Nho vay `TransportEvidenceService` khong doc env — no nhan mot con so. Bai test dat duoc gioi han
 * 10 byte de chung minh duong tu choi that su dong, thay vi phai nan ra 15MB byte gia.
 */
export const transportEvidenceMaxBytesProvider: Provider = {
  provide: TRANSPORT_EVIDENCE_MAX_BYTES,
  useFactory: (): number => loadFoundationEnv().MEDIA_MAX_BYTES,
};

export const transportEvidenceServiceProvider: Provider = {
  provide: TransportEvidenceService,
  inject: [
    TRANSPORT_EVIDENCE_STORE,
    TRANSPORT_EVIDENCE_MAX_BYTES,
    { token: TelemetryService, optional: true },
  ],
  useFactory: (
    store: MediaStore,
    maxBytes: number,
    telemetry?: TelemetryService,
  ): TransportEvidenceService => new TransportEvidenceService(store, maxBytes, telemetry),
};
