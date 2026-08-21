import { CLARIFY_SLOTS, THREAD_STATUSES, partialOrderSchema, type OrderDraft } from '@netviet/shared';

export { CLARIFY_SLOTS, THREAD_STATUSES };
export type { ClarifySlot, ConversationThread, ThreadStatus } from '@netviet/shared';

/**
 * Doc `draft` tu cot JSON. Cot nay la DU LIEU NGOAI voi tien trinh dang chay: no co the do mot
 * ban build cu ghi ra, hoac do nguoi sua tay trong DB. Hong schema -> tra don nhap RONG chu khong
 * nem: mat mot don nhap chi lam bot hoi lai mot cau, con nem o day lam chet ca luot xu ly tin.
 */
export function orderDraftSchemaFallback(value: unknown): OrderDraft {
  const parsed = partialOrderSchema.safeParse(value);
  return parsed.success ? parsed.data : { items: [] };
}
