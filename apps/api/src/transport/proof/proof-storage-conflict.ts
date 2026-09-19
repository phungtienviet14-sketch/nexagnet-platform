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
 * CHAN PHAT LAI cua cua nhap telematics: MOT su kien cua MOT nha cung cap chi vao duoc mot lan.
 *
 * Phai la mot rang buoc cua KHO chu khong mot cau `if` trong dich vu, dung ly le da ghi o
 * `ACTIVE_TRACKING_SESSION`: hai lan gui cung mot su kien den cung luc se lot qua CA HAI lan kiem
 * cua ung dung, va chiec xe se co hai ban dinh vi cho dung mot khoanh khac. Chi muc nay dong khe do.
 */
export const TELEMATICS_INGRESS_EVENT: UniqueIndexRef = {
  indexName: 'TransportTelematicsIngressEvent_provider_event_key',
  model: 'TransportTelematicsIngressEvent',
  column: 'externalEventId',
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
/**
 * MOT `CHECK` CUA COT, nhin tu ma nguon — `#327`.
 *
 * Kieu RIENG, khong dung lai `UniqueIndexRef`: mot `CHECK` va mot chi muc duy nhat that bai bang
 * hai ma loi khac han nhau duoi Postgres (`23514` vs `23505`, `P2002` vs khong), va gop hai khai
 * niem vao mot kieu se de ai do goi `isUniqueViolationOn` cho mot `CHECK` roi tuong la no da kiem.
 */
export interface CheckConstraintRef {
  readonly constraintName: string;
  readonly model: string;
}

/**
 * MOT PHIEN, MOT CHU THE — chuyen HOAC vong chay, khong ca hai va khong khong cai nao.
 *
 * Vi sao phai la mot rang buoc cua KHO: hai cot nullable khong tu noi ra rang chung loai tru nhau.
 * Khong co `CHECK`, ba hinh dang sai deu ghi duoc va khong cai nao tu lo ra — mot phien khong gan
 * vao viec gi (bang chung mo coi), mot phien gan vao CA HAI (hai chu the co the mau thuan, va luc
 * do khong ai biet duong doc nao noi that), va ca hai chi lo ra khi co nguoi mo bang len tim.
 */
export const TRACKING_SESSION_ONE_SUBJECT: CheckConstraintRef = {
  constraintName: 'TransportTrackingSession_one_subject',
  model: 'TransportTrackingSession',
};

/**
 * Dung LOI CUA KHO ma ban trong bo nho phat ra khi cham mot `CHECK`.
 *
 * Cung ly le voi `storageUniqueViolation` ngay duoi: che do `PERSISTENCE=memory` la mot duong chay
 * that, va neu no bao that bai bang mot hinh dang KHAC voi Postgres thi mot bai kiem se xanh o che
 * do nay va do o che do kia. Van ban lay dung khuon cau cua Postgres (`SQLSTATE 23514`).
 */
export function storageCheckViolation(check: CheckConstraintRef): Error {
  const error = new Error(
    `new row for relation "${check.model}" violates check constraint "${check.constraintName}"`,
  );
  Object.assign(error, {
    code: '23514',
    meta: { modelName: check.model, constraint: check.constraintName },
  });
  return error;
}

export function storageUniqueViolation(index: UniqueIndexRef): Error {
  const error = new Error(`Unique constraint failed on the index: ${index.indexName}`);
  Object.assign(error, {
    code: 'P2002',
    meta: { modelName: index.model, target: [index.column] },
  });
  return error;
}
