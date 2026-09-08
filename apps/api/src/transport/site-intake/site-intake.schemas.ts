import { z } from 'zod';

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
 */
const locationShape = {
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  accuracyMetres: z.number().finite().min(0).max(100_000).nullish(),
  observationId: trimmed.min(1).max(100).optional(),
};

const bothOrNeither = (value: { latitude?: number; longitude?: number }): boolean =>
  (value.latitude === undefined) === (value.longitude === undefined);

const notTwoSources = (value: { latitude?: number; observationId?: string }): boolean =>
  value.latitude === undefined || value.observationId === undefined;

export const proposeSiteIntakeSchema = z
  .object(locationShape)
  .strict()
  .refine(bothOrNeither, { message: 'phai gui ca latitude lan longitude, hoac khong gui ca hai' })
  .refine(notTwoSources, { message: 'khong gui dong thoi observationId va toa do' });

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
  .refine(notTwoSources, { message: 'khong gui dong thoi observationId va toa do' });

export type ProposeSiteIntakeBody = z.infer<typeof proposeSiteIntakeSchema>;
export type ConfirmSiteIntakeBody = z.infer<typeof confirmSiteIntakeSchema>;
