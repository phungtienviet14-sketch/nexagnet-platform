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

export const openTrackingSessionSchema = z
  .object({
    tripId: z.string().min(1),
    device: z
      .object({
        installationId: z.string().min(1).max(200),
        platform: z.enum(['ANDROID', 'IOS', 'WEB']),
        appVersion: z.string().min(1).max(50),
        integrityVerdict: z.enum(['UNKNOWN', 'UNVERIFIED', 'BASIC', 'STRONG']).optional(),
      })
      .strict()
      .nullish(),
  })
  .strict();

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
    source: z.enum(['DEVICE_GNSS', 'DEVICE_FUSED', 'DEVICE_NETWORK', 'TELEMATICS', 'MANUAL']),
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

export const registerGeofenceSchema = z
  .object({
    label: z.string().min(1).max(200),
    subjectKind: z.enum(['CUSTOMER', 'FUEL_SUPPLIER', 'DEPOT', 'AD_HOC']),
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
export type CloseTrackingSessionBody = z.infer<typeof closeTrackingSessionSchema>;
export type RegisterGeofenceBody = z.infer<typeof registerGeofenceSchema>;
