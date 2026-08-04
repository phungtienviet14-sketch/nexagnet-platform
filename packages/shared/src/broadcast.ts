import { z } from 'zod';

/**
 * Schema tinh nang gui hang loat tin khuyen mai vao cac nhom (KH2 — pham vi demo).
 * Nguyen tac: la CONG CU cua Sale (Sale soan + xac nhan), KHONG phai AI tu dong gui
 * (quyet dinh kien truc #4). Moi tin gui deu duoc noi AUTO_LABEL o backend.
 */

/** Gioi han do dai text cua Zalo Bot Platform (bao cao Zalo muc nhuoc diem). */
export const MAX_BROADCAST_TEXT = 2000;

export const broadcastRequestSchema = z.object({
  /** Noi dung khuyen mai Sale soan. AUTO_LABEL se duoc noi them khi gui (khong nam o day). */
  text: z.string().trim().min(1, 'Nội dung không được để trống').max(MAX_BROADCAST_TEXT),
  /** Chon tap nhom (chatId). Bo trong hoac rong -> gui TAT CA nhom da map. */
  groupChatIds: z.array(z.string().min(1)).optional(),
  /** true -> chi xem truoc (dich + noi dung da gan nhan), KHONG gui that. */
  dryRun: z.boolean().default(false),
});
export type BroadcastRequest = z.infer<typeof broadcastRequestSchema>;

/** Ket qua gui toi 1 nhom. `ok`/`error` chi co y nghia khi khong phai dryRun. */
export interface BroadcastTargetResult {
  chatId: string;
  groupName: string | null;
  ok: boolean;
  error?: string;
}

/** Ket qua tong hop 1 lan broadcast. */
export interface BroadcastResult {
  dryRun: boolean;
  /** Noi dung da gan AUTO_LABEL (dung cho xem truoc + la tin thuc gui). */
  labeledText: string;
  /** So nhom dich. */
  total: number;
  /** So nhom gui thanh cong (0 khi dryRun). */
  sent: number;
  /** So nhom gui that bai (0 khi dryRun). */
  failed: number;
  /** 1 dong/nhom dich. Khi dryRun chi liet ke nhom (bo qua ok/error). */
  results: BroadcastTargetResult[];
}
