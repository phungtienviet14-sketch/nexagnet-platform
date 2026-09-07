import { z } from 'zod';
import { MONEY_MAX_AMOUNT } from '../money.js';
import { businessDateSchema } from '../transport.schemas.js';
import { EXPENSE_CLAIM_STATUSES } from './claim.types.js';

const trimmed = z.string().trim();
const reference = trimmed.min(1).max(100);
const note = trimmed.max(1000);

/** So tien de nghi phai LON HON 0: mot de nghi bang 0 dong khong phai mot de nghi. */
const claimAmount = z.number().int().positive().max(MONEY_MAX_AMOUNT);

/**
 * `driverId` KHONG co mat o be mat lai xe -- danh tinh den tu PHIEN. O be mat van hanh thi co,
 * vi ke toan nhap ho la mot viec co that.
 */
const claimBody = {
  categoryCode: trimmed.min(1).max(60),
  claimedAmount: claimAmount,
  businessDate: businessDateSchema.optional(),
  tripId: reference.nullish(),
  runId: reference.nullish(),
  legId: reference.nullish(),
  note: note.nullish(),
  evidenceLocator: trimmed.max(500).nullish(),
};

export const submitClaimSchema = z.object({ driverId: reference, ...claimBody }).strict();
export const submitSelfClaimSchema = z.object(claimBody).strict();

/**
 * `approvedAmount` TUY CHON: bo trong nghia la duyet TRON KHOAN (`D-06`). Truong nay ton tai san
 * de duyet mot phan khong phai mot lan doi hop dong API khi `Q-04` co loi.
 */
export const approveClaimSchema = z
  .object({
    reasonCode: trimmed.min(1).max(60),
    approvedAmount: claimAmount.optional(),
    note: note.nullish(),
  })
  .strict();

export const rejectClaimSchema = z
  .object({ reasonCode: trimmed.min(1).max(60), note: note.nullish() })
  .strict();

export const claimListQuerySchema = z
  .object({
    status: z.enum(EXPENSE_CLAIM_STATUSES).optional(),
    driverId: reference.optional(),
  })
  .strict();

export type SubmitClaimBody = z.infer<typeof submitClaimSchema>;
export type SubmitSelfClaimBody = z.infer<typeof submitSelfClaimSchema>;
export type ApproveClaimBody = z.infer<typeof approveClaimSchema>;
export type RejectClaimBody = z.infer<typeof rejectClaimSchema>;
export type ClaimListQuery = z.infer<typeof claimListQuerySchema>;
