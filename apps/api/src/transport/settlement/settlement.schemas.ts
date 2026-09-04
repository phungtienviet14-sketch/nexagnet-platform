import { z } from 'zod';
import { businessDateSchema } from '../transport.schemas.js';
import { SETTLEMENT_FLOWS } from './settlement-flows.js';

/**
 * Kiem THAM SO TRUY VAN cua cac bao cao `TX-05` tai bien gioi HTTP — `#168 B1`.
 *
 * Rieng mot tep thay vi nhet vao `transport.schemas.ts`: nhung schema o day chi ton tai khi
 * `transport-settlement` duoc bat, va gom chung vao tep cua `transport-core` se lam mot khach chi
 * bat loi van tai van phai nap tu vung quyet toan.
 */

const nonEmpty = z.string().trim().min(1);

/**
 * `asOf` BAT BUOC, khong mac dinh "hom nay".
 *
 * Tuoi no la mot con so DOC THEO MOT MOC. Mot mac dinh im lang se lam hai nguoi mo cung mot man
 * hinh cach nhau qua nua dem doc ra hai bang khac nhau, va khong bang nao ghi lai minh dung moc
 * nao. Bat nguoi goi noi ra thi con so tren man hinh luon di kem moc cua chinh no.
 */
export const arAgingQuerySchema = z
  .object({
    asOf: businessDateSchema,
    customerId: nonEmpty.optional(),
  })
  .strict();

/**
 * `flow` BAT BUOC — day la `GD-15` duoc bieu dien o tang HTTP.
 *
 * `SettlementReadService.apByCounterparty()` doi `flow` lam tham so bat buoc vi mot bang gop ca cay
 * xang, nha xe va doi tac mang don se cho ra mot cot tong ma KHONG AI TRA TIEN THEO NO. Neu o day
 * cho `flow` khuyet roi tu gop, ca rang buoc do bien mat ngay tai bien gioi.
 */
export const apQuerySchema = z.object({ flow: z.enum(SETTLEMENT_FLOWS) }).strict();

/**
 * SO CHUYEN TOI DA cho mot lan cong don bien truc tiep.
 *
 * `directMarginRollup()` doc TUNG chuyen mot roi cong o tang mien (cong thuc bien khac nhau theo
 * loai chuyen — xem chu thich cua no), nen chi phi tang tuyen tinh theo so chuyen va moi chuyen la
 * vai lan cham kho. Khong co tran thi mot URL du dai bien mot route bao cao thanh mot cong tu choi
 * dich vu.
 *
 * 200 la quy mo demo cua T8 (mot thang chay that), khong phai mot con so dep.
 */
export const DIRECT_MARGIN_ROLLUP_MAX_TRIPS = 200;

/**
 * `tripIds` dang CSV — `?tripIds=a,b,c`.
 *
 * Tach va bo phan tu rong TRUOC khi kiem so luong, de `a,,b` khong bi dem thanh ba.
 */
export const directMarginRollupQuerySchema = z
  .object({
    tripIds: z
      .string()
      .transform((raw) =>
        raw
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      )
      .refine((ids) => ids.length > 0, 'can it nhat mot ma chuyen')
      .refine(
        (ids) => ids.length <= DIRECT_MARGIN_ROLLUP_MAX_TRIPS,
        `mot lan cong don toi da ${DIRECT_MARGIN_ROLLUP_MAX_TRIPS} chuyen`,
      ),
  })
  .strict();
