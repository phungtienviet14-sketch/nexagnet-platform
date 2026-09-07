/**
 * `@netviet/driver-outbox` — nua MAY KHACH cua giao thuc bam vi tri / chung cu van hanh.
 *
 * Goi nay CHUA duoc mot ung dung nao dung: ung dung lai xe chua duoc viet (xem
 * `docs/kien-truc/transport-driver-app.md`, va cac chan phat hanh `M-01`/`M-02` ghi o do). No ton
 * tai truoc vi phan logic kho nhat cua mot ung dung ngoai tuyen KHONG can den mot chiec dien
 * thoai de viet dung — va cung khong can mot chiec dien thoai de chung minh la dung.
 *
 * Cai no KHONG chung minh: rang bam vi tri nen chay tren mot may Android that. Do la mot phep do
 * khac, can mot thiet bi, va no chua duoc lam.
 */
export { backoffDelayMs } from './backoff.js';
export { InMemoryOutboxStore } from './memory-store.js';
export { OutboxEngine, type OutboxDeps, type OutboxSender } from './outbox.js';
export {
  DEFAULT_OUTBOX_POLICY,
  type EnqueueCommand,
  type OutboxAttachment,
  type OutboxItem,
  type OutboxItemKind,
  type OutboxItemState,
  type OutboxPolicy,
  type OutboxStore,
  type SendOutcome,
  type SyncStatus,
} from './outbox.types.js';
