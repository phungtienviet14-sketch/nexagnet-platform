'use client';

import type { ReactNode } from 'react';
import type { TransportApiGap } from '../api-gaps';

/**
 * NAM trang thai ma moi man hinh van hanh phai co (#161 §7), gom vao mot tep — dung khuon
 * `b2b-sales-operations/components/SectionState.tsx` da co san, thay vi dung mot he thiet ke thu hai.
 *
 * Trang thai thu nam la thu ma mot man hinh binh thuong khong can: `AwaitingApiState`. No ton tai vi
 * mot phan nghiep vu DA CHAY o may chu nhung chua co duong HTTP nao — va cach trung thuc duy nhat
 * la noi ro dieu do, chu khong phai bay mot bang trong nhu the khach chua co du lieu.
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
 * Phan nghiep vu chua co duong API. Bay dung ba dieu ma `api-gaps.ts` bat moi muc phai tra loi:
 * can gi · hom nay co gi · da co san o may chu chua.
 */
export function AwaitingApiState({
  title,
  gaps,
}: {
  readonly title: string;
  readonly gaps: readonly TransportApiGap[];
}) {
  return (
    <div className="tx-awaiting" role="region" aria-label={`Chưa dùng được: ${title}`}>
      <p className="tx-awaiting__lead">
        Phần này chưa dùng được vì máy chủ chưa mở đường dữ liệu cho nó. Dưới đây là hiện trạng chính
        xác, không phải số liệu tạm.
      </p>
      <ul className="tx-awaiting__list">
        {gaps.map((gap) => (
          <li key={gap.id} className="tx-awaiting__item">
            <h3>{gap.title}</h3>
            <dl>
              <dt>Màn hình cần</dt>
              <dd>{gap.needs}</dd>
              <dt>Hiện trạng</dt>
              <dd>{gap.actual}</dd>
              {gap.serverSide === null ? null : (
                <>
                  <dt>Đã có ở máy chủ</dt>
                  <dd>{gap.serverSide}</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
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
