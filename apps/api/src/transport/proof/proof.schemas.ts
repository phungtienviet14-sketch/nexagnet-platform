import { z } from 'zod';

/**
 * BIEN VAO HTTP cua `transport-proof`.
 *
 * MOT DIEU KHONG CO O DAY, va do la phan quan trong nhat cua tep: **khong mot lieu do nao nhan
 * `driverId` hay `vehicleId`.** Danh tinh den tu phien dang nhap; xe den tu ban phan cong do may
 * chu doc. Neu hai truong do xuat hien trong mot lieu do, mot lai xe gan duoc chuoi toa do cua
 * minh vao ten dong nghiep hoac vao mot chiec xe khac — va khong mot lop kiem quyen nao ben tren
 * bat duoc dieu do, vi nguoi goi VAN dang dung quyen cua chinh ho.
 *
 * `.strict()` o moi lieu do khong phai su ky tinh: no bien mot truong thua thanh loi 400 on ao
 * thay vi mot truong bi bo qua im lang. Mot may khach gui `driverId` phai duoc bao la sai, chu
 * khong duoc de tuong rang no da co tac dung.
 */

const trackingDeviceSchema = z
  .object({
    installationId: z.string().min(1).max(200),
    platform: z.enum(['ANDROID', 'IOS', 'WEB']),
    appVersion: z.string().min(1).max(50),
    integrityVerdict: z.enum(['UNKNOWN', 'UNVERIFIED', 'BASIC', 'STRONG']).optional(),
  })
  .strict();

/**
 * CHU THE cua mot phien: `tripId` HOAC `runId`, dung MOT — `#327`.
 *
 * ============================================================================================
 * MOT UNION HAI NHANH, KHONG PHAI MOT OBJECT VOI HAI TRUONG TUY CHON
 * ============================================================================================
 *
 * `z.object({ tripId: optional, runId: optional }).refine(dung-mot)` cho ra CUNG mot tap gia tri
 * hop le, nhung `.strict()` cua no khong con chan duoc gi: hai nhanh rieng, moi nhanh `.strict()`,
 * khien `{ tripId, runId }` truot CA HAI nhanh va tra `400` — thay vi lot vao mot `refine` ma ai
 * do co the noi long sau nay de "cho de".
 *
 * Va ca hai nhanh deu KHONG nhan `vehicleId` hay `driverId`, dung nhu khoi chu thich dau tep noi.
 * Do la phep kiem that su quan trong o day: mot may khach gui `runId` kem `vehicleId` dang co gan
 * chuoi toa do cua minh vao mot chiec xe no tu chon, va no phai bi bao la sai chu khong duoc bo
 * qua im lang.
 */
export const openTrackingSessionSchema = z.union([
  z.object({ tripId: z.string().min(1), device: trackingDeviceSchema.nullish() }).strict(),
  z.object({ runId: z.string().min(1), device: trackingDeviceSchema.nullish() }).strict(),
]);

/**
 * `latitude`/`longitude` la `number` o day va `unknown` o tang mien — CO Y.
 *
 * zod chan duoc chuoi va `null`; no KHONG chan duoc (0, 0), vi cap so do hop le ve kieu. Phep tu
 * choi that nam o `parseGeoPoint`, noi ma ly do tu choi con tra ve duoc mot MA (`NULL_ISLAND`)
 * di vao so quyet dinh. Hai lop, hai viec khac nhau.
 */
export const reportObservationSchema = z
  .object({
    clientEventId: z.string().min(1).max(200),
    latitude: z.number(),
    longitude: z.number(),
    accuracyMetres: z.number().nonnegative().nullish(),
    speedMetresPerSecond: z.number().nonnegative().nullish(),
    bearingDegrees: z.number().min(0).lt(360).nullish(),
    /**
     * CHI ba nguon cua THIET BI. `TELEMATICS` va `MANUAL` bi tu choi o day — `#297 T3`.
     *
     * Duong nay la duong TU KHAI CUA DIEN THOAI (`transport.driver.self.tracking.report`). Neu no
     * nhan `TELEMATICS`, thi chinh chiec dien thoai dang bi doi chieu tu ghi duoc ban ghi cua
     * nguon dung de doi chieu no — va "nguon doc lap thu hai" tro thanh mot cau noi suong. Hau qua
     * cu the: `SOURCE_FALLBACK` se bao "dien thoai im nhung hop GSHT tren xe con bao" trong khi ca
     * hai ban ghi deu den tu cung mot thiet bi, va mot nguoi truc se tin la con nhin thay chiec xe.
     *
     * `MANUAL` cung bi tu choi, vi mot ly do khac: nhap tay la thao tac cua NGUOI VAN HANH tren
     * mot be mat khac, khong phai mot ban do duoc cua ung dung lai xe.
     *
     * Hai nguon do van hop le trong `LocationObservation` — chung chi khong duoc vao bang duong
     * nay. Nguon telematics vao bang `VehicleTelematicsPort`, noi adapter la thu giai ra xe.
     */
    source: z.enum(['DEVICE_GNSS', 'DEVICE_FUSED', 'DEVICE_NETWORK']),
    capturedAt: z.coerce.date(),
    /** `null` (may khach khong noi) KHAC `false` (may khach noi la khong). Giu ba trang thai. */
    mockLocationReported: z.boolean().nullish(),
  })
  .strict();

/**
 * Mot lo ban dinh vi — hinh dang ma hang doi ngoai tuyen gui khi may co song tro lai.
 *
 * Gioi han 200 la mot con so co ly do: o nhip 30 giay, 200 ban la khoang mot tieng ruoi mat song.
 * Cho lo lon hon se bien mot lan gui thanh mot giao dich dai va mot than yeu cau vai megabyte;
 * may khach chia nho thi tu no cung co diem tua de thu lai.
 */
export const reportObservationBatchSchema = z
  .object({ observations: z.array(reportObservationSchema).min(1).max(200) })
  .strict();

export const closeTrackingSessionSchema = z
  .object({ reason: z.string().min(1).max(200).default('DRIVER_STOPPED') })
  .strict();

/**
 * BAN DINH VI TU PHAN CUNG TREN XE — `#297` T4.
 *
 * ============================================================================================
 * `vehicleId` XUAT HIEN O DAY, VA DO KHONG MAU THUAN VOI KHOI CHU THICH DAU TEP
 * ============================================================================================
 *
 * Cau o dau tep — *"khong mot lieu do nao nhan `driverId` hay `vehicleId`"* — noi ve BE MAT LAI XE,
 * va ly do cua no la danh tinh khong duoc den tu than yeu cau. O day khong co danh tinh nao de gia:
 * mot hop GSHT khong dang nhap, khong co phien, va khong co mot ban phan cong nao de may chu doc ra
 * chiec xe. Ma xe la thu DUY NHAT noi ban ghi voi the gioi.
 *
 * Nen cong that nam o cho khac, va co BA lop (xem `TelematicsIngressService`): khach phai da khai
 * mot nha cung cap; CHIEC XE do phai duoc dang ky voi nha cung cap; va ma xe phai tro toi mot chiec
 * xe co that. Mot ma xe bia ra khong di qua duoc lop thu ba, va mot chiec xe co that nhung khong
 * gan thiet bi khong di qua duoc lop thu hai.
 *
 * KHONG co truong `source`. Moi ban vao bang duong nay deu la `TELEMATICS` — do la dinh nghia cua
 * chinh cai cua nay, va `TransportLocationObservation_telematics_subject` cuong che no o tang luu
 * tru. Nhan `source` tu nguoi goi se mo lai dung cai lo ma duong dien thoai da dong.
 *
 * KHONG co `mockLocationReported`: `Location.isMock` la khai niem cua Android, va mot hop GSHT
 * khong tra loi cau do.
 */
export const ingestTelematicsObservationSchema = z
  .object({
    /**
     * LOI KHANG DINH ve dau noi — KHONG phai danh tinh, va `optional` chinh vi the.
     *
     * Danh tinh that den tu cau hinh may chu (`VehicleTelematicsPort.describe()`). Truong nay chi
     * de mot may khach noi ra minh TUONG minh dang gui thay ai; lech thi lan nhap bi tu choi
     * (`TELEMATICS_CONNECTOR_MISMATCH`) truoc moi thao tac ghi. Bo trong la hinh dang binh thuong.
     *
     * Ten cu `providerId` da bi BO khoi lieu do nay chu khong duoc giu lai cho tuong thich: cung
     * voi `.strict()` ben duoi, mot may khach con gui truong cu se nhan `400` on ao thay vi im
     * lang tuong rang no vua chon duoc nguon.
     */
    connectorId: z.string().trim().min(1).max(100).optional(),
    /** Ma su kien cua CHINH nha cung cap — khoa chan phat lai. */
    externalEventId: z.string().trim().min(1).max(200),
    vehicleId: z.string().min(1).max(200),
    latitude: z.number(),
    longitude: z.number(),
    accuracyMetres: z.number().nonnegative().nullish(),
    speedMetresPerSecond: z.number().nonnegative().nullish(),
    bearingDegrees: z.number().min(0).lt(360).nullish(),
    /** Dong ho cua HOP GSHT. May chu ghi gio nhan RIENG — xem `TelematicsIngressService`. */
    recordedAt: z.coerce.date(),
  })
  .strict();

/**
 * Mot LO ban dinh vi tu phan cung — hinh dang cua mot lan nhap ket xuat hoac mot lan day gom tin.
 *
 * Gioi han 200 giong duong dien thoai, va co cung ly do: mot lo lon hon bien mot lan gui thanh mot
 * giao dich dai; nguoi gui chia nho thi tu ho cung co diem tua de thu lai. O day no con thuc te hon
 * — mot ban ket xuat ca ngay tu bang dieu khien cua nha cung cap phai duoc chia lo du the nao.
 */
export const ingestTelematicsObservationBatchSchema = z
  .object({ observations: z.array(ingestTelematicsObservationSchema).min(1).max(200) })
  .strict();

export const registerGeofenceSchema = z
  .object({
    label: z.string().min(1).max(200),
    subjectKind: z.enum(['CUSTOMER', 'FUEL_SUPPLIER', 'DEPOT', 'AD_HOC', 'COUNTERPARTY_SITE']),
    subjectId: z.string().min(1).nullish(),
    latitude: z.number(),
    longitude: z.number(),
    radiusMetres: z.number().int().min(10).max(100_000),
    note: z.string().max(500).nullish(),
  })
  .strict();

/**
 * CHUNG CU VAN HANH — nhan `observationId`, KHONG nhan toa do.
 *
 * Mot chung cu tro toi mot ban dinh vi DA GHI qua duong ingest (da kiem bien, da co `receivedAt`
 * cua may chu, da cham rui ro, da thuoc mot phien cua dung lai xe do). Nhan toa do tho o day se
 * vong qua tat ca nhung dieu do.
 *
 * `captureModes` di kem THEO THU TU cua mang tep tai len. Thieu thi `UNKNOWN` — khong bao gio
 * mac dinh `LIVE_CAMERA`, vi mac dinh cao la tu nang muc tin cay cua mot thu khong ai khai.
 */
export const recordProofSchema = z
  .object({
    kind: z.enum(['START', 'DELIVERY']),
    tripId: z.string().min(1),
    observationId: z.string().min(1),
    clientEventId: z.string().min(1).max(200),
    note: z.string().max(500).nullish(),
    /**
     * LOI THACH THUC cua may chu — TUY CHON, va viec no tuy chon la mot quyet dinh.
     *
     * Bat buoc no se lam mot lai xe trong vung lom KHONG lap duoc chung cu giao hang, tuc mat bang
     * chung o dung doan duong ma bang chung co gia tri nhat. Thieu no thi chung cu duoc ghi voi
     * `challengeVerified = false`, va nguoi duyet doc ra duoc su khac biet do.
     */
    challengeNonce: z.string().trim().min(1).max(200).nullish(),
    /**
     * MOT TRUONG MULTIPART LUON LA CHUOI, ke ca khi no lap lai.
     *
     * Day la mot loi da xay ra that: khai `z.array(...)` roi gui bang `FormData` thi mot tam anh
     * duy nhat den duoi dang chuoi `"LIVE_CAMERA"`, khong phai mang — va `.strict()` tra `400`
     * cho mot yeu cau hoan toan dung. Hai tam thi den duoi dang hai truong cung ten, ma tang HTTP
     * gom lai thanh mang.
     *
     * Nen phai nhan CA HAI hinh dang. Khong noi long `.strict()` de "cho de": chuan hoa o day thi
     * phan con lai cua he thong van chi thay dung mot kieu.
     */
    captureModes: z
      .preprocess(
        (value) => (typeof value === 'string' ? [value] : value),
        z.array(z.enum(['LIVE_CAMERA', 'GALLERY', 'UNKNOWN'])).max(6),
      )
      .optional(),
  })
  .strict();

/**
 * BIA MO — `reason` BAT BUOC, va toi thieu 3 ky tu.
 *
 * Mot lan rut khong ly do buoc nguoi doc ho so sau nay phai doan, va thu ho doan ra thuong nang
 * hon su that. Truong nay khong co mac dinh: mot chuoi rong duoc phep se tro thanh gia tri pho
 * bien nhat trong bang chi sau vai tuan.
 */
export const withdrawProofSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export type WithdrawProofBody = z.infer<typeof withdrawProofSchema>;
export type RecordProofBody = z.infer<typeof recordProofSchema>;
export type OpenTrackingSessionBody = z.infer<typeof openTrackingSessionSchema>;
export type ReportObservationBody = z.infer<typeof reportObservationSchema>;
export type ReportObservationBatchBody = z.infer<typeof reportObservationBatchSchema>;
export type IngestTelematicsObservationBody = z.infer<typeof ingestTelematicsObservationSchema>;
export type IngestTelematicsObservationBatchBody = z.infer<
  typeof ingestTelematicsObservationBatchSchema
>;
export type CloseTrackingSessionBody = z.infer<typeof closeTrackingSessionSchema>;
export type RegisterGeofenceBody = z.infer<typeof registerGeofenceSchema>;
