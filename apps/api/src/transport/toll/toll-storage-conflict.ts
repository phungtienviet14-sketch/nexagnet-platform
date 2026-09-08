import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * BA UNIQUE cua `transport-toll`, khai bang TEN de tang kho dich `P2002` thanh dung mot ly do.
 *
 * CO CHE nhan dang dung chung o `../storage-conflict.ts`; DANH SACH INDEX thuoc ve capability so
 * huu bang — cung khuon `costing/costing-storage-conflict.ts`. Neu de o tang chung, mot lan them
 * bang cua mien nay se bat mot tep nen tang phai doi.
 *
 * Vi sao khong bat `P2002` chung chung: mot `P2002` cua bang ban ghi noi co the la trung KHOA
 * CHINH hoac trung UNIQUE MOT PHAN, va hai thu do phai noi voi nguoi dung hai cau khac han nhau.
 */

/**
 * BAT BIEN PHAP LY — ND 119/2024/ND-CP Dieu 11 khoan 3.
 *
 * Unique dat tren `vehicleId` MOT MINH (khong phai cap `(accountId, vehicleId)`): dieu luat noi
 * mot xe chi nhan chi tra tu MOT tai khoan, nen hai doan dang mo cho cung mot xe la vi pham KE CA
 * khi chung thuoc hai tai khoan khac nhau.
 */
export const ACTIVE_TOLL_VEHICLE_LINK: UniqueIndexRef = {
  indexName: 'TransportTollAccountVehicleLink_activeVehicle_key',
  model: 'TransportTollAccountVehicleLink',
  column: 'vehicleId',
};

/** Mot so tai khoan giao thong chi duoc khai MOT lan cho mot nha cung cap. */
export const TOLL_ACCOUNT_NO_UNIQUE: UniqueIndexRef = {
  indexName: 'TransportTollAccount_provider_accountNo_key',
  model: 'TransportTollAccount',
  column: 'accountNo',
};

/**
 * CHONG LAP O TANG NGUON — cung bo byte thi cung mot lan nap.
 *
 * Va cham o day KHONG phai mot loi nguoi dung: no la tin hieu de tang tren tra ve lan nhap CU
 * (#269 J4 — *"same source re-upload => idempotent outcome"*).
 */
export const TOLL_IMPORT_DIGEST_UNIQUE: UniqueIndexRef = {
  indexName: 'TransportTollImport_provider_sourceDigest_key',
  model: 'TransportTollImport',
  column: 'sourceDigest',
};
