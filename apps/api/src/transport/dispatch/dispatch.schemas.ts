import { z } from 'zod';

/**
 * KIEM DAU VAO cua be mat dieu xe.
 *
 * Ba dieu tep nay cuong che, va ca ba deu la ranh gioi an toan chu khong phai tien nghi:
 *
 *   1. TOA DO co bien. `parseGeoPoint()` o tang mien van la ben quyet dinh cuoi (no con tu choi
 *      Null Island), nhung mot so ngoai dai o day bi chan som voi mot thong bao doc duoc.
 *   2. `limit` co TRAN. Mot `limit` khong chan bien mot be mat doc thanh mot don bay khuech dai.
 *   3. KHONG mot truong nao nhan vi tri cua xe. Vi tri xe do MAY CHU doc tu ban ghi bam vi tri;
 *      `#277 M3` viet ro: *"no tenant/caller-supplied arbitrary location may override server-bound
 *      vehicle observation."* Cach cuong che la khong co truong de gui.
 */

const trimmedId = z.string().trim().min(1).max(64);

/**
 * Diem lay hang — mot trong ba dang, phan biet bang `kind`.
 *
 * `POINT` nhan toa do THO (`z.number()` khong chan mien): phep kiem mien nam o `parseGeoPoint()`,
 * va lam hai lan se de lai hai bo nguong co the lech nhau.
 */
export const dispatchPickupSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('POINT'),
    latitude: z.number(),
    longitude: z.number(),
  }),
  z.object({ kind: z.literal('SITE'), siteId: trimmedId }),
  z.object({ kind: z.literal('GEOFENCE'), geofenceId: trimmedId }),
]);

export const dispatchSuggestionSchema = z.object({
  pickup: dispatchPickupSchema.nullish(),
  /**
   * Moc gio can co mat tai diem lay hang, ISO.
   *
   * KHONG phai mot cot tren `TransportOrder` — don khong mang han lay hang. Khi nguoi goi khong
   * dua, khoa xep hang `DEADLINE_FEASIBILITY` bi bo qua hoan toan thay vi chay voi mot moc bia
   * (`#277 M7`).
   */
  requiredPickupAt: z.string().datetime({ offset: true }).nullish(),
  /**
   * Yeu cau cua don — cung khong phai cot tren don.
   *
   * `payloadKg` co tran 200 tan: cao hon moi to hop duong bo hop phap o Viet Nam, va du thap de
   * mot lan go nham don vi (gam thay vi kilogam) bi chan ngay thay vi loai sach ca doi xe.
   */
  requirement: z
    .object({
      payloadKg: z.number().int().positive().max(200_000).nullish(),
      vehicleClass: z.string().trim().min(1).max(64).nullish(),
    })
    .nullish(),
  limit: z.number().int().positive().max(50).nullish(),
});

export const dispatchCommitSchema = dispatchSuggestionSchema.extend({
  /** Chiec xe ma CON NGUOI da chon. Khong co gia tri mac dinh, va khong co duong "chon giup". */
  vehicleId: trimmedId,
});

export type DispatchSuggestionBody = z.infer<typeof dispatchSuggestionSchema>;
export type DispatchCommitBody = z.infer<typeof dispatchCommitSchema>;
