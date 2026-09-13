import { z } from 'zod';
import { WAITING_REASONS } from './waiting.types.js';

/**
 * BIEN VAO HTTP cua phien cho.
 *
 * MOT DIEU KHONG CO O DAY, va do la phan quan trong nhat cua tep: **khong lieu do nao nhan
 * `startedAt`, `endedAt`, `durationSeconds`, `driverId` hay `startedBy`.**
 *
 *   · danh tinh den tu PHIEN dang nhap;
 *   · gio mo den tu DONG HO MAY CHU;
 *   · gio dong den tu `receivedAt` cua chinh moc `DELIVERY_ACCEPTED` — cung dong ho do.
 *
 * `#279` O4 doi *"Do not let a client clock decide authoritative waiting duration"*, va O5 doi
 * *"client time cannot shorten/extend authoritative duration"*. Cach chac chan nhat de giu hai cau
 * do la lam cho chung KHONG BIEU DIEN DUOC o bien vao, thay vi nhan roi bo di.
 *
 * `.strict()` bien mot truong thua thanh loi 400 on ao thay vi mot truong bi bo qua im lang: mot
 * may khach gui `startedAt` phai duoc bao la sai, chu khong duoc tuong rang no da co tac dung.
 */
export const startWaitingSchema = z
  .object({
    runId: z.string().min(1),
    legId: z.string().min(1),
    /**
     * Moc `DELIVERY_ARRIVAL` lam NEO. Bat buoc: mot phien cho khong neo vao lan den noi nao la mot
     * khoang thoi gian khong chung minh duoc da xay ra o dau.
     */
    arrivalCheckpointId: z.string().min(1),
    reason: z.enum(WAITING_REASONS),
    /**
     * Khoa idempotency do may khach sinh. BAT BUOC, khong `optional`: thieu no thi mot lan bam hai
     * lan tren song yeu se thanh hai phien, va bai `#279` O13 bai 2 mat cho de dung.
     */
    clientEventId: z.string().min(1).max(200),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type StartWaitingBody = z.infer<typeof startWaitingSchema>;

/**
 * DON DEP cua van hanh — `note` BAT BUOC va khong duoc rong.
 *
 * Mot phien bi dong bang tay ma khong ai noi vi sao la mot khoang thoi gian bi cat cut khong giai
 * thich duoc — va no la can cu cua mot khoan tien (`#279` O6). Cho `note` tuy chon o day se lam
 * duong don dep tro thanh duong re nhat de rut ngan mot khoang cho.
 */
export const closeWaitingByOperatorSchema = z
  .object({
    note: z.string().trim().min(1).max(2000),
  })
  .strict();

export type CloseWaitingByOperatorBody = z.infer<typeof closeWaitingByOperatorSchema>;
