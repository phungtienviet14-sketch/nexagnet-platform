import { z } from 'zod';
import { EXCEPTION_REASON_MIN_LENGTH } from './site-intake-commercial.types.js';

const trimmed = z.string().trim();

/**
 * VI TRI GUI KEM — BA hinh dang hop le, va zod cuong che ca ba.
 *
 *   · `observationId` mot minh          -> ban dinh vi cua Lane B (`SERVER_BOUND`);
 *   · `latitude` + `longitude` (+ sai so) -> cap so may khach (`DRIVER_REPORTED`);
 *   · khong gi ca                        -> lai xe chon kho bang tay.
 *
 * `.strict()` chan hinh dang thu tu: gui CA `observationId` LAN toa do se bi tu choi thay vi lang
 * le uu tien mot ben. Hai nguon vi tri trong mot yeu cau la mot cau hoi ma chi nguoi goi tra loi
 * duoc, va doan ho la cach chac chan nhat de mot ngay nao do doan sai.
 *
 * `locationAgeMs` (`#398` §3.1) — TUOI cua cap so, do bang CHINH dong ho may khach luc gui
 * (`Date.now() - thoi diem co ban dinh vi`). Hieu hai moc cua CUNG mot dong ho nen lech gio tuyet
 * doi giua dien thoai va may chu khong lot vao. No CHI di kem cap toa do: ban dinh vi cua Lane B
 * mang dau thoi gian rieng (`capturedAt`/`receivedAt`), va mot tuoi khong kem toa do la tuoi cua
 * mot thu khong ton tai.
 */
export const LOCATION_AGE_MAX_MS = 86_400_000;

const locationShape = {
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  accuracyMetres: z.number().finite().min(0).max(100_000).nullish(),
  observationId: trimmed.min(1).max(100).optional(),
  locationAgeMs: z.number().int().min(0).max(LOCATION_AGE_MAX_MS).optional(),
};

const bothOrNeither = (value: { latitude?: number; longitude?: number }): boolean =>
  (value.latitude === undefined) === (value.longitude === undefined);

const notTwoSources = (value: { latitude?: number; observationId?: string }): boolean =>
  value.latitude === undefined || value.observationId === undefined;

const ageOnlyWithCoordinates = (value: {
  latitude?: number;
  observationId?: string;
  locationAgeMs?: number;
}): boolean =>
  value.locationAgeMs === undefined ||
  (value.latitude !== undefined && value.observationId === undefined);

const AGE_ONLY_WITH_COORDINATES = {
  message:
    'locationAgeMs chi di kem latitude/longitude — khong di voi observationId, khong di mot minh',
  path: ['locationAgeMs'],
};

export const proposeSiteIntakeSchema = z
  .object(locationShape)
  .strict()
  .refine(bothOrNeither, { message: 'phai gui ca latitude lan longitude, hoac khong gui ca hai' })
  .refine(notTwoSources, { message: 'khong gui dong thoi observationId va toa do' })
  .refine(ageOnlyWithCoordinates, AGE_ONLY_WITH_COORDINATES);

export const confirmSiteIntakeSchema = z
  .object({
    ...locationShape,
    siteId: trimmed.min(1).max(100),
    /** Khoa chong lap do may khach sinh — `#267` H3. */
    clientEventId: trimmed.min(1).max(200),
    /**
     * Diem den, NEU lai xe biet. Bo trong thi chang mang nhan `PENDING_DESTINATION_LABEL`.
     *
     * Khong bat buoc, va do la mot quyet dinh nghiep vu: `#267` H6 doi mot cham. Bat go diem den
     * o cong nha may se lam lai xe go bua mot chuoi de qua man hinh — va mot chuoi go bua te hon
     * han mot nhan noi ro la chua biet.
     */
    destinationLabel: trimmed.min(1).max(200).optional(),
  })
  .strict()
  .refine(bothOrNeither, { message: 'phai gui ca latitude lan longitude, hoac khong gui ca hai' })
  .refine(notTwoSources, { message: 'khong gui dong thoi observationId va toa do' })
  .refine(ageOnlyWithCoordinates, AGE_ONLY_WITH_COORDINATES);

export type ProposeSiteIntakeBody = z.infer<typeof proposeSiteIntakeSchema>;
export type ConfirmSiteIntakeBody = z.infer<typeof confirmSiteIntakeSchema>;

/* ------------------------------------------------------------------ *
 * `#398` — DIEM GIAO, HOAN THIEN, GAN DON CO SAN, BAO BAT THUONG
 * ------------------------------------------------------------------ */

/**
 * LUA CHON DIEM GIAO — HAI hinh dang, va khong hinh dang nao la "mot cap so tu do".
 *
 *   · `KNOWN_PLACE`  — id mot hang rao; may chu tu doc nhan + toa do;
 *   · `PLACE_SEARCH` — mot ket qua tim dia diem, KEM chuoi tim: may chu tim LAI (tu bo nho dem cua
 *     chinh no) va chi nhan ket qua co CUNG nhan + CUNG toa do. Mot toa do bia khong qua duoc.
 *
 * `.strict()` o moi nhanh: `freightAmount`, `customerId`, `driverId`, `vehicleId` va moi truong tien
 * bi TU CHOI chu khong bi bo qua — lai xe khong co cho nao de dat mot su that tien.
 */
export const destinationChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('KNOWN_PLACE'), placeId: trimmed.min(1).max(100) }).strict(),
  z
    .object({
      kind: z.literal('PLACE_SEARCH'),
      query: trimmed.min(2).max(200),
      label: trimmed.min(1).max(300),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    })
    .strict(),
]);

export const driverDestinationSchema = z
  .object({
    /** Khoa chong lap do may khach sinh — gui lai CUNG khoa tra ve dung ket cuc cu. */
    clientEventId: trimmed.min(1).max(200),
    destination: destinationChoiceSchema,
  })
  .strict();

export const officeCompleteSchema = z
  .object({
    idempotencyKey: trimmed.min(1).max(120),
    destination: destinationChoiceSchema.optional(),
    /** Van phong XAC NHAN noi lay hang khi lan khop dia diem chua du chac. */
    attestOrigin: z.boolean().optional(),
  })
  .strict();

export const bindExistingOrderSchema = z
  .object({ orderId: trimmed.min(1).max(100), idempotencyKey: trimmed.min(1).max(120) })
  .strict();

/** Ly do BAT BUOC — `#398` §9: mot lan huy khong co ly do la mot lan xoa lich su bang mot nut bam. */
export const reportExceptionSchema = z
  .object({
    reason: trimmed.min(EXCEPTION_REASON_MIN_LENGTH).max(500),
    idempotencyKey: trimmed.min(1).max(120),
  })
  .strict();

export const reviewListQuerySchema = z
  .object({ status: z.enum(['PENDING', 'ORDER_BOUND', 'REJECTED']).default('PENDING') })
  .strict();

export const activityQuerySchema = z
  .object({ hours: z.coerce.number().int().min(1).max(168).default(24) })
  .strict();

export type DestinationChoiceBody = z.infer<typeof destinationChoiceSchema>;
