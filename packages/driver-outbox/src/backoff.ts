import type { OutboxPolicy } from './outbox.types.js';

/**
 * CACH CHO GIUA HAI LAN THU — nhan doi, co TRAN, va TAT DINH.
 *
 * ============================================================================================
 * VI SAO KHONG CO JITTER NGAU NHIEN O DAY
 * ============================================================================================
 *
 * Jitter ton tai de tan mot DAN may khach cung dong loat go cua mot may chu vua song lai. Bai
 * toan do la that — nhung o day dan chi co vai chuc chiec dien thoai cua mot doi xe, va chung
 * khong he mat song cung mot luc: moi chiec vao vung lom mot khac.
 *
 * Doi lai, mot ham TAT DINH kiem duoc bang mot bai test doc len thanh cau. Neu can tan tai o quy
 * mo lon hon, cho dung cua jitter la nguoi GOI (`OutboxEngine` nhan mot `now()` va co the lech
 * moc do), khong phai o day — de ham nay van con la mot ham thuan.
 *
 * `attempts` la SO LAN DA THU (0 = chua thu lan nao), nen lan cho dau tien la `baseDelayMs`.
 */
export function backoffDelayMs(attempts: number, policy: OutboxPolicy): number {
  const safeAttempts = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;

  // Chan so mu TRUOC khi luy thua. `2 ** 1024` la `Infinity`, va `Math.min(Infinity, max)` van ra
  // `max` nen ket qua CUOI van dung — nhung mot phep tinh di qua `Infinity` la mot phep tinh chi
  // dung nho may man. Chan o 32 la du: `2 ** 32` da vuot moi tran hop ly hang nghin lan.
  const exponent = Math.min(safeAttempts, 32);
  const grown = policy.baseDelayMs * 2 ** exponent;
  return Math.min(grown, policy.maxDelayMs);
}
