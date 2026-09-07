import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * BA UNIQUE cua `transport-proof` — DANH SACH thuoc ve capability nay, CO CHE nhan dien nam o
 * `../storage-conflict.js`.
 *
 * Bai hoc T2.1 duoc mang nguyen sang day: Prisma KHONG phoi ten index ra ngoai — no doi nguoc ten
 * constraint thanh TEN TRUONG (`meta.target = ['clientEventId']`). Nen moi muc khai CA `indexName`
 * LAN cap `(model, column)`, va `isUniqueViolationOn` doi chieu ca hai duong.
 */

/**
 * MOT lai xe, MOT phien dang mo. Chi muc MOT PHAN (`WHERE "status" = 'ACTIVE'`) duoi Postgres.
 *
 * Vi sao phai la mot rang buoc cua KHO chu khong phai mot cau `if` trong dich vu: mot phep
 * kiem-roi-ghi co mot khe hep giua hai buoc, va hai yeu cau mo phien den cung luc tu hai thiet bi
 * se lot qua ca hai lan kiem. Chi muc nay dong khe do lai.
 */
export const ACTIVE_TRACKING_SESSION: UniqueIndexRef = {
  indexName: 'TransportTrackingSession_activeDriver_key',
  model: 'TransportTrackingSession',
  column: 'driverId',
};

/** Khoa chan phat lai: mot `clientEventId` chi ton tai mot lan TRONG mot phien. */
export const OBSERVATION_CLIENT_EVENT: UniqueIndexRef = {
  indexName: 'TransportLocationObservation_sessionId_clientEventId_key',
  model: 'TransportLocationObservation',
  column: 'clientEventId',
};

/** Mot ma cai dat ung dung thuoc ve DUNG mot lai xe, va khong doi chu. */
export const DEVICE_INSTALLATION_ID: UniqueIndexRef = {
  indexName: 'TransportDeviceInstallation_installationId_key',
  model: 'TransportDeviceInstallation',
  column: 'installationId',
};

/**
 * Dung LOI CUA KHO ma ban trong bo nho phat ra khi cham mot trong ba unique tren.
 *
 * KHONG phai mot mo phong cho vui. Che do `PERSISTENCE=memory` la mot duong chay that (demo, CI
 * khong co DB), va neu no bao that bai bang mot hinh dang KHAC voi Postgres thi dich vu se phai co
 * hai nhanh xu ly loi — nghia la mot trong hai nhanh khong bao gio duoc chay o noi no quan trong.
 * Phat ra dung hinh dang `P2002` giu cho `isUniqueViolationOn` la duong DUY NHAT ca hai che do di
 * qua.
 */
export function storageUniqueViolation(index: UniqueIndexRef): Error {
  const error = new Error(`Unique constraint failed on the index: ${index.indexName}`);
  Object.assign(error, {
    code: 'P2002',
    meta: { modelName: index.model, target: [index.column] },
  });
  return error;
}
