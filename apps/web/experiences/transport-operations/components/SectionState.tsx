'use client';

import type { ReactNode } from 'react';

/**
 * BON trang thai ma moi man hinh van hanh phai co (#161 §7), gom vao mot tep — dung khuon
 * `b2b-sales-operations/components/SectionState.tsx` da co san, thay vi dung mot he thiet ke thu hai.
 *
 * TRUOC DAY co mot trang thai thu nam, `AwaitingApiState`, bay hien trang ky thuat cua mot muc chua
 * co duong du lieu. No da duoc bo cung voi chinh cac muc do: mot muc chua dung duoc nay khong xuat
 * hien tren be mat khach hang, nen khong con gi de giai thich (#195).
 */

export function LoadingState({ label }: { readonly label: string }) {
  return (
    <p className="tx-state" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  nextAction,
}: {
  readonly title: string;
  /** Viec tiep theo. Mot o trong khong noi gi la mot o trong bo di. */
  readonly nextAction?: ReactNode;
}) {
  return (
    <div className="tx-state tx-state--empty">
      <p>{title}</p>
      {nextAction === undefined ? null : <div className="tx-state__action">{nextAction}</div>}
    </div>
  );
}

/**
 * Loi PHUC HOI DUOC: luon co duong thu lai, va HIEN NGUYEN VAN cau cua may chu.
 *
 * Khong dien dat lai loi cua may chu: `transportErrorToHttp` da bo mat ma loi co kieu o bien HTTP,
 * nen cau tieng Viet do la thong tin CHINH XAC NHAT ma man hinh co. Doan lai y no la lam mat thong
 * tin va co the noi sai.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="tx-state tx-state--error" role="alert">
      <p>{message}</p>
      {onRetry === undefined ? null : (
        <button type="button" className="tx-btn" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

/**
 * Xac nhan cho thao tac PHA HUY / DAO / DONG KY / HUY — #161 §7 doi cai nay.
 *
 * Nhung thao tac can ly do (`cancel`, `reversal`, `reopen`) thi ly do la BAT BUOC va o nhap phai co
 * mat ngay trong hop thoai: may chu tu choi than thieu `reason`, nen hoi sau khi bam la mot vong
 * thua va mot lan that bai khong can thiet.
 */
export function ConfirmAction({
  open,
  title,
  detail,
  confirmLabel,
  reasonLabel,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  isDestructive = false,
  isBusy = false,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly detail?: string | null;
  readonly confirmLabel: string;
  /** Co gia tri ⇒ thao tac doi ly do, va nut xac nhan khoa den khi co ly do. */
  readonly reasonLabel?: string;
  readonly reason?: string;
  readonly onReasonChange?: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly isDestructive?: boolean;
  readonly isBusy?: boolean;
}) {
  if (!open) return null;
  const needsReason = reasonLabel !== undefined;
  const reasonReady = !needsReason || (reason ?? '').trim().length > 0;

  return (
    <div className="tx-confirm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="tx-confirm__panel">
        <h2 className="tx-confirm__title">{title}</h2>
        {detail == null ? null : <p className="tx-confirm__detail">{detail}</p>}
        {needsReason ? (
          <label className="tx-field">
            <span>{reasonLabel}</span>
            <textarea
              value={reason ?? ''}
              onChange={(event) => onReasonChange?.(event.target.value)}
              rows={3}
              required
            />
          </label>
        ) : null}
        <div className="tx-confirm__actions">
          <button type="button" className="tx-btn" onClick={onCancel} disabled={isBusy}>
            Quay lại
          </button>
          <button
            type="button"
            className={isDestructive ? 'tx-btn tx-btn--stop' : 'tx-btn tx-btn--go'}
            onClick={onConfirm}
            disabled={isBusy || !reasonReady}
          >
            {isBusy ? 'Đang gửi…' : confirmLabel}
          </button>
        </div>
        {needsReason && !reasonReady ? (
          <p className="tx-field__hint">Cần ghi lý do trước khi xác nhận.</p>
        ) : null}
      </div>
    </div>
  );
}
