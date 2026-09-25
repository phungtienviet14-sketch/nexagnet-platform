import { captureFix } from '../../location/point-in-time';
import { LOCATION_FAILURE_TEXT, LocationCaptureError } from '../../location/location-state';
import type { FrozenFix } from '../../outbox/field-actions';

/**
 * LAY VI TRI TAI LUC BAM, CO HAN — boc `captureFix()` cua nen (khong sua no).
 *
 * `captureFix` tu cho toi 15 giay. Moc KHONG bat buoc vi tri chi doi toi `limitMs` (8 giay): qua han
 * thi lai xe di tiep, moc xep hang khong kem vi tri va nhan noi that. Moc BAT BUOC thi doi het han
 * cua nen. `Huy` khong dung duoc GPS cua he dieu hanh — no chi lam ket qua ve sau bi BO QUA.
 */
export type FixOutcome =
  | { readonly kind: 'OK'; readonly fix: FrozenFix }
  | { readonly kind: 'FAILED'; readonly message: string }
  | { readonly kind: 'TIMEOUT'; readonly message: string };

const TIMEOUT_TEXT = LOCATION_FAILURE_TEXT.TIMEOUT;

export async function captureFixWithin(limitMs: number | null): Promise<FixOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const attempt = captureFix().then((fix): FixOutcome => ({ kind: 'OK', fix }));
    if (limitMs === null) return await attempt;
    const deadline = new Promise<FixOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'TIMEOUT', message: TIMEOUT_TEXT }), limitMs);
    });
    return await Promise.race([attempt, deadline]);
  } catch (error) {
    if (error instanceof LocationCaptureError) {
      return error.failure === 'TIMEOUT'
        ? { kind: 'TIMEOUT', message: error.message }
        : { kind: 'FAILED', message: error.message };
    }
    return { kind: 'FAILED', message: LOCATION_FAILURE_TEXT.UNAVAILABLE };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
