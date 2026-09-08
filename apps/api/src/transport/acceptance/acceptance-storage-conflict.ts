import type { UniqueIndexRef } from '../storage-conflict.js';

/**
 * HAI UNIQUE cua bang lich su quyet dinh, mo ta du de nhan ra o CA HAI dang Prisma co the bao.
 *
 * Nam o day chu khong o `storage-conflict.ts` theo dung quy uoc ma tep do dat ra: CO CHE nhan dien
 * `P2002` la thu dung chung, con DANH SACH INDEX thuoc ve capability so huu bang — y het
 * `costing/costing-storage-conflict.ts` cua `TX-03`.
 *
 * Hai hang, khong mot, vi hai va cham noi hai dieu khac nhau ve the gioi:
 *
 *   · `sequence`       — hai nguoi cung ghi mot quyet dinh cho cung mot ho so trong cung khoanh
 *     khac. Tang mien da chan phan lon truong hop nay bang `supersedesId` phai bang ban moi nhat;
 *     day la luoi cuoi cho dung luc ca hai cung doc duoc cung mot ban moi nhat.
 *   · `idempotencyKey` — cung mot lenh duoc gui hai lan va ca hai lan deu vuot qua phep doc truoc.
 *     Mot phep doc-roi-ghi khong bao gio la nguyen tu, nen rang buoc nay la cho DUY NHAT tra loi
 *     duoc cau hoi do.
 */
export const ACCEPTANCE_DECISION_SEQUENCE: UniqueIndexRef = {
  indexName: 'TransportCommercialAcceptanceDecision_sequence_key',
  model: 'TransportCommercialAcceptanceDecision',
  column: 'sequence',
};

export const ACCEPTANCE_DECISION_IDEMPOTENCY: UniqueIndexRef = {
  indexName: 'TransportCommercialAcceptanceDecision_idempotency_key',
  model: 'TransportCommercialAcceptanceDecision',
  column: 'idempotencyKey',
};
