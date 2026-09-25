/**
 * KHOA CHONG GHI TRUNG cho quyet dinh van phong — sinh MOT LAN khi MO to truot/phieu, khong phai
 * luc bam. Mat mang giua luc gui va luc nhan -> nguoi dung bam lai -> lan hai mang DUNG khoa cu ->
 * may chu tra lai chinh quyet dinh da ghi thay vi ghi ban thu hai (`#275` K8).
 *
 * Do dai: may chu nhan 8..120 (ket thuc don, quy lai xe), 8..160 (thu tien), 1..200 (phu cap cho).
 * 120 la tran chung an toan cho moi cho.
 */
export const IDEMPOTENCY_KEY_MAX = 120;
const MIN = 8;

/** `uuid` den tu `expo-crypto` o tang giao dien — ham nay thuan de test duoc. */
export function makeIdempotencyKey(scope: string, uuid: string): string {
  const cleanScope = scope.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'office';
  const cleanUuid = uuid.replace(/[^a-z0-9-]/gi, '');
  if (cleanUuid.length < MIN) throw new Error('Khoá chống ghi trùng quá ngắn');
  return `m-${cleanScope}-${cleanUuid}`.slice(0, IDEMPOTENCY_KEY_MAX);
}
