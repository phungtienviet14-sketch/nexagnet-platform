import { z } from 'zod';
import { RUN_CHECKPOINT_TYPES } from './checkpoint.types.js';

/**
 * BIEN VAO HTTP cua `transport-checkpoint`.
 *
 * MOT DIEU KHONG CO O DAY, va do la phan quan trong nhat cua tep: **khong lieu do nao nhan
 * `driverId`, `recordedBy`, `capturedAt` hay `receivedAt`.**
 *
 *   · danh tinh den tu PHIEN dang nhap;
 *   · gio ghi nhan den tu DONG HO MAY CHU;
 *   · gio chup den tu BAN DINH VI da qua kiem bien cua Lane B.
 *
 * Neu ba truong do nhan duoc tu than yeu cau thi mot lai xe ghi duoc moc mang ten dong nghiep, va
 * dat duoc mot lan "den noi" vao mot thoi diem no chon — tuc bai `F7` *"waiting duration cannot be
 * shortened by editing client clock"* thua ngay tu bien vao.
 *
 * `.strict()` bien mot truong thua thanh loi 400 on ao thay vi mot truong bi bo qua im lang: mot
 * may khach gui `driverId` phai duoc bao la sai, chu khong duoc tuong rang no da co tac dung.
 */
export const recordCheckpointSchema = z
  .object({
    type: z.enum(RUN_CHECKPOINT_TYPES),
    runId: z.string().min(1),
    legId: z.string().min(1).optional(),
    /**
     * Khoa idempotency do may khach sinh. BAT BUOC, khong `optional`: thieu no thi mot lan bam
     * hai lan tren song yeu se thanh hai moc, va bai `F7` ve replay mat cho de dung.
     */
    clientEventId: z.string().min(1).max(200),
    observationId: z.string().min(1).optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type RecordCheckpointBody = z.infer<typeof recordCheckpointSchema>;
