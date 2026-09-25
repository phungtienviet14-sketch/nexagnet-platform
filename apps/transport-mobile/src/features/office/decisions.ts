import { formatVnd } from '../../format';
import type { ExpenseClaim, WaitingAllowance } from './decision-types';
import { checkText, optionalText, parseVndInput, type ParseResult } from './form-input';

/**
 * KIEM TRUOC khi gui mot quyet dinh — dung LUAT cua schema may chu, de nguoi dung biet sai o dau
 * ngay tren o nhap thay vi doi mot 400 khong co `reason`. May chu van la cong that.
 */

/* ------------------------------------------------------------------ *
 * De nghi chi — `claim.schemas.ts` (strict)
 * ------------------------------------------------------------------ */

export type ClaimOutcome = 'APPROVE' | 'REJECT';

export interface ClaimDecisionInput {
  readonly outcome: ClaimOutcome;
  /** May chu goi la `reasonCode` nhung nhan CAU TU DO 1..60 — web gui dung cau nguoi dung go. */
  readonly reason: string;
  /** Rong = duyet TRON so de nghi. */
  readonly approvedAmount: string;
  readonly note: string;
}

export type ClaimDecisionBody =
  | {
      readonly path: 'approve';
      readonly body: { reasonCode: string; approvedAmount?: number; note?: string };
    }
  | { readonly path: 'reject'; readonly body: { reasonCode: string; note?: string } };

export interface FieldErrors {
  readonly [field: string]: string | undefined;
}

export function buildClaimDecision(
  claim: Pick<ExpenseClaim, 'claimedAmount'>,
  input: ClaimDecisionInput,
): ParseResult<ClaimDecisionBody> & { readonly errors?: FieldErrors } {
  const reason = checkText(input.reason, {
    label: input.outcome === 'APPROVE' ? 'lý do duyệt' : 'lý do từ chối',
    min: 1,
    max: 60,
  });
  const note = optionalText(input.note, { label: 'Ghi chú', max: 1000 });
  let amount: ParseResult<number | null> = { ok: true, value: null };
  if (input.outcome === 'APPROVE' && input.approvedAmount.trim() !== '') {
    const parsed = parseVndInput(input.approvedAmount);
    amount =
      parsed.ok && parsed.value > claim.claimedAmount
        ? {
            ok: false,
            message: `Không được lớn hơn số đề nghị ${formatVnd(claim.claimedAmount)}.`,
          }
        : parsed;
  }
  const errors: FieldErrors = {
    reason: reason.ok ? undefined : reason.message,
    note: note.ok ? undefined : note.message,
    approvedAmount: amount.ok ? undefined : amount.message,
  };
  if (!reason.ok || !note.ok || !amount.ok) {
    return { ok: false, message: 'Kiểm tra lại các ô được đánh dấu.', errors };
  }
  const noteValue = note.value ?? undefined;
  if (input.outcome === 'REJECT') {
    return {
      ok: true,
      value: {
        path: 'reject',
        body: { reasonCode: reason.value, ...(noteValue ? { note: noteValue } : {}) },
      },
    };
  }
  return {
    ok: true,
    value: {
      path: 'approve',
      body: {
        reasonCode: reason.value,
        ...(amount.value !== null ? { approvedAmount: amount.value } : {}),
        ...(noteValue ? { note: noteValue } : {}),
      },
    },
  };
}

/**
 * HAU QUA cua lan duyet, noi TRUOC khi bam. De nghi chua gan CHUYEN thi duyet xong van CHUA vao gia
 * thanh (`CLAIM_SETTLEMENT_DEFERRED_NO_TRIP`) — im lang o cho nay la cach mot khoan tien bien mat.
 */
export function claimApprovalConsequence(claim: Pick<ExpenseClaim, 'tripId'>): string {
  return claim.tripId === null
    ? 'Đề nghị chưa gắn chuyến: duyệt xong được ghi nhận, nhưng CHƯA vào giá thành và sổ quỹ cho tới khi có chuyến.'
    : 'Duyệt xong, khoản này vào giá thành chuyến và sổ quỹ của lái xe.';
}

/* ------------------------------------------------------------------ *
 * Phu cap cho — `allowance.schemas.ts` (strict + superRefine)
 * ------------------------------------------------------------------ */

export type AllowanceOutcome = 'APPROVED' | 'REJECTED';

export interface AllowanceDecisionInput {
  readonly outcome: AllowanceOutcome;
  readonly approvedAmount: string;
  readonly note: string;
}

export interface AllowanceDecisionBody {
  readonly outcome: AllowanceOutcome;
  readonly approvedAmount?: number;
  readonly note?: string;
  readonly idempotencyKey: string;
}

/** `approvedAmount` BAT BUOC khi duyet (<= so de nghi), PHAI VANG MAT khi tu choi. */
export function buildAllowanceDecision(
  allowance: Pick<WaitingAllowance, 'candidateAmount'>,
  input: AllowanceDecisionInput,
  idempotencyKey: string,
): ParseResult<AllowanceDecisionBody> & { readonly errors?: FieldErrors } {
  const note = optionalText(input.note, { label: 'Ghi chú', max: 2000 });
  let amount: ParseResult<number | null> = { ok: true, value: null };
  if (input.outcome === 'APPROVED') {
    const parsed = parseVndInput(input.approvedAmount);
    amount =
      parsed.ok && parsed.value > allowance.candidateAmount
        ? {
            ok: false,
            message: `Không được lớn hơn số đề nghị ${formatVnd(allowance.candidateAmount)}.`,
          }
        : parsed;
  }
  if (!note.ok || !amount.ok) {
    return {
      ok: false,
      message: 'Kiểm tra lại các ô được đánh dấu.',
      errors: {
        note: note.ok ? undefined : note.message,
        approvedAmount: amount.ok ? undefined : amount.message,
      },
    };
  }
  return {
    ok: true,
    value: {
      outcome: input.outcome,
      ...(amount.value !== null ? { approvedAmount: amount.value } : {}),
      ...(note.value ? { note: note.value } : {}),
      idempotencyKey,
    },
  };
}
